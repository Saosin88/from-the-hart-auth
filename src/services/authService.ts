import { AuthResponse } from "../models/AuthSchemas";
import { logger } from "../config/logger";
import { config } from "../config";
import { adminAuth, firestore } from "./firebase";
import { sendVerificationEmail, sendPasswordResetEmail } from "./emailService";
import { createIdentity, IdentityServiceError } from "./identityService";
import {
  signInWithEmailPassword,
  exchangeCustomTokenForIdToken,
  refreshIdToken,
} from "./firebaseRestService";
import {
  adminDenialReason,
  assertActingIdentityInvariant,
  mergeEntitlement,
  type AdminRoleClaims,
} from "../utils/claims";
import { FirebaseAuthError } from "firebase-admin/auth";
import * as jwt from "jsonwebtoken";

export const registerPrincipal = async (
  email: string,
  password: string
): Promise<AuthResponse> => {
  // Step 1: Create the Firebase Principal
  const principalRecord = await adminAuth().createUser({
    email,
    password,
    emailVerified: false,
  });
  const uid = principalRecord.uid;

  try {
    // Step 2: Create Identity record
    const identityId = await createIdentity(email, config.identityServiceUrl);

    // Step 3: Set custom claims linking Principal to Identity
    await adminAuth().setCustomUserClaims(uid, {
      identities: { [identityId]: ["owner"] },
      acting_identity: identityId,
    });

    // Step 4: Issue ID Token (no claims argument — REQ-05)
    const customToken = await adminAuth().createCustomToken(uid);
    const idTokens = await exchangeCustomTokenForIdToken(customToken);

    // Step 5: Send verification email (failure does NOT rollback — REQ-07)
    await generateEmailVerificationLink(email, uid).catch((error) => {
      logger.error(
        {
          operation: "registerPrincipal",
          email,
          uid,
          error,
        },
        "Failed to send verification email (registration still successful)",
      );
    });

    logger.info(
      {
        operation: "registerPrincipal",
        email,
        uid,
        identity_id: identityId,
      },
      "Principal registered successfully with Identity",
    );

    return {
      idToken: idTokens.idToken,
    };
  } catch (error) {
    // Rollback: delete the Firebase Principal on any failure after createUser
    try {
      await adminAuth().deleteUser(uid);
      logger.debug(
        {
          operation: "registerPrincipalRollback",
          email,
          uid,
          result: "deleted",
        },
        "Rollback: Firebase Principal deleted",
      );
    } catch (rollbackError) {
      logger.error(
        {
          operation: "registerPrincipalRollback",
          email,
          uid,
          result: "failed",
          originalError: error instanceof Error ? error.message : String(error),
          rollbackError: rollbackError instanceof Error ? rollbackError.message : String(rollbackError),
        },
        "Rollback failed: could not delete Firebase Principal",
      );
    }

    // Re-throw for controller to map to HTTP response
    throw error;
  }
};

export const authenticatePrincipal = async (
  email: string,
  password: string,
  returnRefreshToken: boolean = false
): Promise<AuthResponse> => {
  const signInResult = await signInWithEmailPassword(email, password);
  logger.info({ operation: "authenticatePrincipal", email }, "Principal authenticated successfully");
  return {
    idToken: signInResult.idToken,
    ...(returnRefreshToken ? { refreshToken: signInResult.refreshToken } : {}),
  };
};

export const forgotPassword = async (email: string): Promise<boolean> => {
  await generatePasswordResetLink(email);
  return true;
};

export const resendVerificationEmail = async (
  email: string
): Promise<boolean> => {
  const userRecord = await adminAuth().getUserByEmail(email);
  if (userRecord.emailVerified) {
    return false;
  }
  await generateEmailVerificationLink(email);
  return true;
};

export const verifyEmailToken = async (
  token: string
): Promise<AuthResponse> => {
  const decoded = jwt.decode(token) as { email?: string };
  if (!decoded || !decoded.email) {
    throw new Error("Invalid token format");
  }
  const email = decoded.email;
  try {
    const keyDoc = await firestore()
      .collection("verify-email-keys")
      .doc(email)
      .get();
    if (!keyDoc.exists || !keyDoc.data()?.key) {
      throw new Error("Verification key not found");
    }
    const key = keyDoc.data()?.key;
    const verifiedToken = jwt.verify(token, key) as { email: string };
    if (verifiedToken && verifiedToken.email === email) {
      const uid = keyDoc.data()?.uid;
      if (!uid) {
        throw new Error("Principal UID not found in verification data");
      }
      await adminAuth().updateUser(uid, { emailVerified: true });
      await adminAuth().revokeRefreshTokens(uid);
      const customToken = await adminAuth().createCustomToken(uid);
      const idTokens = await exchangeCustomTokenForIdToken(customToken);
      await keyDoc.ref.delete();
      logger.info({ operation: "verifyEmailToken", email, uid }, "Email verified successfully");
      return {
        idToken: idTokens.idToken,
      };
    } else {
      throw new Error("Token verification failed");
    }
  } catch (error) {
    logger.error({ operation: "verifyEmailToken", email, error }, "Email verification failed");
    throw error;
  }
};

export const verifyTokenAndUpdatePassword = async (
  token: string,
  newPassword: string
): Promise<boolean> => {
  const decoded = jwt.decode(token) as { email?: string };
  if (!decoded || !decoded.email) {
    logger.error({ operation: "verifyTokenAndUpdatePassword", reason: "invalid token format" }, "Token decode failed");
    return false;
  }
  const email = decoded.email;
  try {
    const keyDoc = await firestore()
      .collection("forgot-password-keys")
      .doc(email)
      .get();
    if (!keyDoc.exists || !keyDoc.data()?.key) {
      logger.error({ operation: "verifyTokenAndUpdatePassword", email, reason: "reset key not found" }, "Password reset key verification failed");
      return false;
    }
    const key = keyDoc.data()?.key;
    const verifiedToken = jwt.verify(token, key) as { email: string };
    if (verifiedToken && verifiedToken.email === email) {
      const uid = keyDoc.data()?.uid;
      if (!uid) {
        logger.error({ operation: "verifyTokenAndUpdatePassword", email, reason: "uid not found in reset data" }, "Password reset UID missing");
        return false;
      }
      await adminAuth().updateUser(uid, { password: newPassword });
      await adminAuth().revokeRefreshTokens(uid);
      await keyDoc.ref.delete();
      logger.info({ operation: "verifyTokenAndUpdatePassword", email, uid }, "Password reset successfully");
      return true;
    }
    logger.error({ operation: "verifyTokenAndUpdatePassword", email, reason: "token verification failed" }, "Password reset token verification failed");
    return false;
  } catch (error) {
    logger.error({ operation: "verifyTokenAndUpdatePassword", email, error }, "Password reset failed");
    return false;
  }
};

export const refreshPrincipalToken = async (
  refreshToken: string
): Promise<AuthResponse> => {
  const refreshedTokens = await refreshIdToken(refreshToken);
  return {
    idToken: refreshedTokens.idToken,
    refreshToken: refreshedTokens.refreshToken,
  };
};

export const verifyIdToken = async (idToken: string): Promise<boolean> => {
  try {
    await adminAuth().verifyIdToken(idToken);
    return true;
  } catch (error) {
    logger.warn({ error }, "ID token verification failed");
    return false;
  }
};

export const invalidateUserTokens = async (
  idToken: string
): Promise<string | null> => {
  const decodedToken = await adminAuth().verifyIdToken(idToken);
  const uid = decodedToken.uid;
  if (!uid) {
    return null;
  }
  await adminAuth().revokeRefreshTokens(uid);
  return uid;
};

async function generateEmailVerificationLink(
  email: string,
  uid?: string
): Promise<void> {
  let userUid = uid;
  if (!userUid) {
    const userRecord = await adminAuth().getUserByEmail(email);
    userUid = userRecord.uid;
    logger.info({ email, uid: userUid }, "Retrieved user UID for verification");
  }
  const key = [...Array(16)]
    .map(() => Math.random().toString(36).charAt(2))
    .join("");
  const token = jwt.sign({ email }, key, { expiresIn: "24h" });
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  try {
    await firestore().collection("verify-email-keys").doc(email).set({
      key,
      createdAt: new Date(),
      expiresAt,
      uid: userUid,
    });
  } catch (error) {
    logger.error({ operation: "generateEmailVerificationLink", email, error }, "Failed to store verification key");
    throw error;
  }
  const link = `${config.websiteAuthBaseUrl}/verify-email?token=${token}`;
  await sendVerificationEmail(email, link);
}

async function generatePasswordResetLink(
  email: string,
  uid?: string
): Promise<void> {
  let userUid = uid;
  if (!userUid) {
    const userRecord = await adminAuth().getUserByEmail(email);
    userUid = userRecord.uid;
  }
  const key = [...Array(16)]
    .map(() => Math.random().toString(36).charAt(2))
    .join("");
  const token = jwt.sign({ email }, key, { expiresIn: "1h" });
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
  try {
    await firestore().collection("forgot-password-keys").doc(email).set({
      key,
      createdAt: new Date(),
      expiresAt,
      uid: userUid,
    });
  } catch (error) {
    logger.error({ operation: "generatePasswordResetLink", email, error }, "Failed to store password reset key");
    throw error;
  }
  const link = `${config.websiteAuthBaseUrl}/reset-password?token=${token}`;
  await sendPasswordResetEmail(email, link);
}

// ---------------------------------------------------------------------------
// Access control: admin-gated Principal lookup and entitlement grant/revoke.
// Lives here (not a separate service file) because it is Auth-domain logic on
// top of adminAuth — the same category as verifyIdToken/invalidateUserTokens.
// ---------------------------------------------------------------------------

/**
 * Thrown when a crypto-verified caller is not authorized to perform an
 * admin-gated operation (REQ-04). Controllers map this to 403 Forbidden.
 */
export class AdminAuthorizationError extends Error {
  constructor(message = "Forbidden") {
    super(message);
    this.name = "AdminAuthorizationError";
  }
}

export interface AdminCaller {
  uid: string;
  actingIdentity: string;
}

/**
 * Crypto-verifies the bearer token and enforces the acting-identity-scoped
 * admin gate. Fails closed: any token that is not provably an admin acting as
 * an admin Identity throws before any side effect.
 *
 * FirebaseAuthError from `verifyIdToken` propagates untouched so the controller
 * can map it to 401 (REQ-01, design.md §9).
 */
export async function verifyAdminCaller(
  idToken: string,
  operation: string
): Promise<AdminCaller> {
  const decodedToken = await adminAuth().verifyIdToken(idToken);
  const claims = decodedToken as unknown as AdminRoleClaims;
  const reason = adminDenialReason(claims);

  if (reason !== null) {
    logger.warn(
      { operation, uid: decodedToken.uid, reason },
      "Admin authorization failed"
    );
    throw new AdminAuthorizationError("Forbidden");
  }

  return {
    uid: decodedToken.uid,
    actingIdentity: claims.acting_identity as string,
  };
}

/**
 * Shared read-merge-write path for grant and revoke (REQ-02/REQ-12/REQ-13).
 * Never calls revokeRefreshTokens: entitlement changes propagate on the
 * target's next token refresh (REQ-15).
 */
async function applyEntitlementChange(
  idToken: string,
  principalUid: string,
  entitlement: string,
  add: boolean
): Promise<{ principal_uid: string; entitlement: string }> {
  const operation = add ? "grantEntitlement" : "revokeEntitlement";
  const caller = await verifyAdminCaller(idToken, operation);

  const userRecord = await adminAuth().getUser(principalUid);
  const claims: Record<string, unknown> = userRecord.customClaims ?? {};
  const merged = mergeEntitlement(claims, entitlement, add);

  // REQ-03: reject before writing when the resulting claims would break the
  // acting_identity invariant.
  assertActingIdentityInvariant(merged);

  await adminAuth().setCustomUserClaims(principalUid, merged);

  logger.info(
    {
      operation,
      uid: caller.uid,
      acting_identity: caller.actingIdentity,
      principal_uid: principalUid,
      entitlement,
    },
    add ? "Entitlement granted" : "Entitlement revoked"
  );

  return { principal_uid: principalUid, entitlement };
}

export const grantEntitlement = async (
  idToken: string,
  principalUid: string,
  entitlement: string
): Promise<{ principal_uid: string; entitlement: string }> =>
  applyEntitlementChange(idToken, principalUid, entitlement, true);

export const revokeEntitlement = async (
  idToken: string,
  principalUid: string,
  entitlement: string
): Promise<{ principal_uid: string; entitlement: string }> =>
  applyEntitlementChange(idToken, principalUid, entitlement, false);

/**
 * Resolves a target Principal's UID from their email (REQ-07). Returns only
 * `principal_uid` (REQ-08). A 404 is a normal outcome, so it is logged at INFO
 * rather than ERROR (NFR-11).
 */
export async function lookupPrincipal(
  idToken: string,
  email: string
): Promise<{ principal_uid: string }> {
  const caller = await verifyAdminCaller(idToken, "lookupPrincipal");

  try {
    const userRecord = await adminAuth().getUserByEmail(email);
    logger.info(
      { operation: "lookupPrincipal", uid: caller.uid, email },
      "Principal lookup succeeded"
    );
    return { principal_uid: userRecord.uid };
  } catch (error) {
    if (
      error instanceof FirebaseAuthError &&
      error.code === "auth/user-not-found"
    ) {
      logger.info(
        { operation: "lookupPrincipal", uid: caller.uid, email, result: "not_found" },
        "Principal lookup found no match"
      );
    }
    throw error;
  }
}
