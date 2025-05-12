import { AuthResponse } from "../models/AuthSchemas";
import { logger } from "../config/logger";
import { config } from "../config";
import { adminAuth, firestore } from "./firebase";
import { sendVerificationEmail, sendPasswordResetEmail } from "./emailService";
import * as jwt from "jsonwebtoken";

export const registerUser = async (
  email: string,
  password: string
): Promise<AuthResponse> => {
  try {
    logger.info({ email }, "Creating user account");
    const userRecord = await adminAuth().createUser({
      email,
      password,
      emailVerified: false,
    });
    logger.info({ uid: userRecord.uid }, "User account created successfully");

    logger.info({ uid: userRecord.uid }, "Creating custom token");
    const customToken = await adminAuth().createCustomToken(userRecord.uid);
    logger.info("Custom token created successfully");

    logger.info("Exchanging custom token for ID token");
    const idTokens = await exchangeCustomTokenForIdToken(customToken);
    logger.info("Token exchange completed successfully");

    logger.info({ email }, "Generating email verification link");
    await generateEmailVerificationLink(email, userRecord.uid);
    logger.info({ email }, "Email verification link generated and sent");

    return {
      idToken: idTokens.idToken,
      refreshToken: idTokens.refreshToken,
    };
  } catch (error) {
    logger.error(
      {
        errorMessage: error instanceof Error ? error.message : String(error),
        errorCode: (error as any)?.code,
        errorName: error instanceof Error ? error.name : undefined,
        email,
      },
      "Error registering user"
    );
    throw error;
  }
};

export const authenticateUser = async (
  email: string,
  password: string,
  returnRefreshToken: boolean = false
): Promise<AuthResponse | null> => {
  try {
    const signInResult = await signInWithEmailPassword(email, password);

    if (!signInResult) {
      return null;
    }

    return {
      idToken: signInResult.idToken,
      ...(returnRefreshToken
        ? { refreshToken: signInResult.refreshToken }
        : {}),
    };
  } catch (error) {
    logger.error({ error, email }, "Error authenticating user");
    throw error;
  }
};

export const forgotPassword = async (email: string): Promise<boolean> => {
  try {
    await generatePasswordResetLink(email);

    logger.info({ email }, "Password reset email sent");
    return true;
  } catch (error) {
    if ((error as any).code === "auth/user-not-found") {
      return true;
    }

    logger.error({ error, email }, "Error generating password reset link");
    throw error;
  }
};

export const resendVerificationEmail = async (
  email: string
): Promise<boolean> => {
  try {
    const userRecord = await adminAuth().getUserByEmail(email);

    if (userRecord.emailVerified) {
      return false;
    }

    await generateEmailVerificationLink(email);

    logger.info({ email }, "Verification email sent");
    return true;
  } catch (error) {
    if ((error as any).code === "auth/user-not-found") {
      return false;
    }

    logger.error({ error, email }, "Error sending verification email");
    throw error;
  }
};

export const verifyIdToken = async (idToken: string): Promise<boolean> => {
  try {
    await adminAuth().verifyIdToken(idToken);

    return true;
  } catch (error) {
    logger.error({ error }, "Error verifying ID token");
    return false;
  }
};

export const refreshUserToken = async (
  refreshToken: string
): Promise<AuthResponse | null> => {
  try {
    const refreshedTokens = await refreshIdToken(refreshToken);

    if (!refreshedTokens) {
      return null;
    }

    return {
      idToken: refreshedTokens.idToken,
      refreshToken: refreshedTokens.refreshToken,
    };
  } catch (error) {
    logger.error({ error }, "Error refreshing user token");
    return null;
  }
};

export const invalidateUserTokens = async (
  idToken: string
): Promise<boolean> => {
  try {
    const decodedToken = await adminAuth().verifyIdToken(idToken);
    const uid = decodedToken.uid;

    if (!uid) {
      logger.error("No uid found in token");
      return false;
    }

    await adminAuth().revokeRefreshTokens(uid);
    logger.info({ uid }, "Successfully revoked all refresh tokens for user");

    return true;
  } catch (error) {
    logger.error({ error }, "Error invalidating user tokens");
    return false;
  }
};

export const verifyEmailToken = async (token: string): Promise<boolean> => {
  try {
    const decoded = jwt.decode(token) as { email?: string };

    if (!decoded || !decoded.email) {
      logger.error("Invalid token format");
      return false;
    }

    const email = decoded.email;

    const keyDoc = await firestore()
      .collection("verify-email-keys")
      .doc(email)
      .get();

    if (!keyDoc.exists || !keyDoc.data()?.key) {
      logger.error({ email }, "Verification key not found");
      return false;
    }

    const key = keyDoc.data()?.key;

    const verifiedToken = jwt.verify(token, key) as { email: string };

    if (verifiedToken && verifiedToken.email === email) {
      logger.debug({ email }, "Email verified successfully");

      const uid = keyDoc.data()?.uid;
      if (!uid) {
        logger.error({ email }, "User UID not found in verification data");
        return false;
      }

      await adminAuth().updateUser(uid, { emailVerified: true });
      logger.debug({ email }, "User email verified in Firebase");

      await keyDoc.ref.delete();

      return true;
    }

    return false;
  } catch (error) {
    if ((error as Error).name === "TokenExpiredError") {
      logger.error("Token has expired");
    } else {
      logger.error({ error }, "Error verifying email token");
    }
    return false;
  }
};

export const verifyTokenAndUpdatePassword = async (
  token: string,
  newPassword: string
): Promise<boolean> => {
  try {
    const decoded = jwt.decode(token) as { email?: string };

    if (!decoded || !decoded.email) {
      logger.error("Invalid token format");
      return false;
    }

    const email = decoded.email;

    const keyDoc = await firestore()
      .collection("forgot-password-keys")
      .doc(email)
      .get();

    if (!keyDoc.exists || !keyDoc.data()?.key) {
      logger.error({ email }, "Password reset key not found");
      return false;
    }

    const key = keyDoc.data()?.key;

    const verifiedToken = jwt.verify(token, key) as { email: string };

    if (verifiedToken && verifiedToken.email === email) {
      logger.debug({ email }, "Password reset token verified successfully");

      const uid = keyDoc.data()?.uid;
      if (!uid) {
        logger.error({ email }, "User UID not found in password reset data");
        return false;
      }

      await adminAuth().updateUser(uid, { password: newPassword });
      logger.debug({ email }, "User password updated successfully");

      await keyDoc.ref.delete();

      return true;
    }

    return false;
  } catch (error) {
    if ((error as Error).name === "TokenExpiredError") {
      logger.error("Password reset token has expired");
    } else {
      logger.error({ error }, "Error verifying password reset token");
    }
    return false;
  }
};

async function signInWithEmailPassword(
  email: string,
  password: string
): Promise<any> {
  if (!config.firebaseConfig.webAPIKey) {
    throw new Error("Firebase Web API Key is required for authentication");
  }

  try {
    const response = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${config.firebaseConfig.webAPIKey}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          password,
          returnSecureToken: true,
        }),
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      const errorMessage = errorData.error?.message || response.statusText;

      let errorCode = "auth/unknown";

      if (
        errorMessage.includes("EMAIL_NOT_FOUND") ||
        errorMessage.includes("INVALID_EMAIL")
      ) {
        errorCode = "auth/user-not-found";
      } else if (errorMessage.includes("INVALID_PASSWORD")) {
        errorCode = "auth/wrong-password";
      } else if (errorMessage.includes("USER_DISABLED")) {
        errorCode = "auth/user-disabled";
      }

      const error: any = new Error(`Authentication failed: ${errorMessage}`);
      error.code = errorCode;
      throw error;
    }

    const data = await response.json();
    return {
      localId: data.localId,
      idToken: data.idToken,
      refreshToken: data.refreshToken,
    };
  } catch (error) {
    logger.error({ error }, "Error signing in with password");
    throw error;
  }
}

async function exchangeCustomTokenForIdToken(
  customToken: string
): Promise<any> {
  if (!config.firebaseConfig.webAPIKey) {
    throw new Error("Firebase Web API Key is required for token exchange");
  }

  try {
    const response = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${config.firebaseConfig.webAPIKey}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          token: customToken,
          returnSecureToken: true,
        }),
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(
        `Token exchange failed: ${
          errorData.error?.message || response.statusText
        }`
      );
    }

    const data = await response.json();
    return {
      idToken: data.idToken,
      refreshToken: data.refreshToken,
    };
  } catch (error) {
    logger.error({ error }, "Error exchanging custom token");
    throw error;
  }
}

async function refreshIdToken(token: string): Promise<any> {
  if (!config.firebaseConfig.webAPIKey) {
    throw new Error("Firebase Web API Key is required for token refresh");
  }

  try {
    const response = await fetch(
      `https://securetoken.googleapis.com/v1/token?key=${config.firebaseConfig.webAPIKey}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          grant_type: "refresh_token",
          refresh_token: token,
        }),
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(
        `Token refresh failed: ${
          errorData.error?.message || response.statusText
        }`
      );
    }

    const data = await response.json();

    return {
      idToken: data.id_token,
      refreshToken: data.refresh_token,
    };
  } catch (error) {
    logger.error({ error }, "Error refreshing token");
    return null;
  }
}

async function generateEmailVerificationLink(
  email: string,
  uid?: string
): Promise<void> {
  try {
    let userUid = uid;
    if (!userUid) {
      const userRecord = await adminAuth().getUserByEmail(email);
      userUid = userRecord.uid;
      logger.info(
        { email, uid: userUid },
        "Retrieved user UID for verification"
      );
    }

    const key = [...Array(16)]
      .map(() => Math.random().toString(36).charAt(2))
      .join("");

    logger.info({ key }, "Generated verification key");

    const token = jwt.sign({ email }, key, { expiresIn: "24h" });

    logger.info({ token }, "Generated verification token");

    await firestore().collection("verify-email-keys").doc(email).set({
      key,
      createdAt: new Date(),
      uid: userUid,
    });

    logger.info({ email }, "Stored verification key in Firestore");

    const link = `${config.websiteAuthBaseUrl}/verify-email?token=${token}`;

    logger.info({ link }, "Generated verification link");

    await sendVerificationEmail(email, link);

    logger.info({ email }, "Verification email sent");
  } catch (error) {
    logger.error({ error, email }, "Error sending verification email");
    throw error;
  }
}

async function generatePasswordResetLink(
  email: string,
  uid?: string
): Promise<void> {
  try {
    let userUid = uid;
    if (!userUid) {
      const userRecord = await adminAuth().getUserByEmail(email);
      userUid = userRecord.uid;
      logger.info(
        { email, uid: userUid },
        "Retrieved user UID for password reset"
      );
    }

    const key = [...Array(16)]
      .map(() => Math.random().toString(36).charAt(2))
      .join("");

    logger.info({ key }, "Generated password reset key");

    const token = jwt.sign({ email }, key, { expiresIn: "1h" });

    logger.info({ token }, "Generated password reset token");

    await firestore().collection("forgot-password-keys").doc(email).set({
      key,
      createdAt: new Date(),
      uid: userUid,
    });

    logger.info({ email }, "Stored password reset key in Firestore");

    const link = `${config.websiteAuthBaseUrl}/reset-password?token=${token}`;

    logger.info({ link }, "Generated password reset link");

    await sendPasswordResetEmail(email, link);

    logger.info({ email }, "Password reset email sent");
  } catch (error) {
    logger.error({ error, email }, "Error sending password reset email");
    throw error;
  }
}
