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
  const userRecord = await adminAuth().createUser({
    email,
    password,
    emailVerified: false,
  });

  const customToken = await adminAuth().createCustomToken(userRecord.uid);
  const idTokens = await exchangeCustomTokenForIdToken(customToken);
  await generateEmailVerificationLink(email, userRecord.uid);
  return {
    idToken: idTokens.idToken,
  };
};

export const authenticateUser = async (
  email: string,
  password: string,
  returnRefreshToken: boolean = false
): Promise<AuthResponse | null> => {
  const signInResult = await signInWithEmailPassword(email, password);
  if (!signInResult) {
    return null;
  }
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
      throw new Error("User UID not found in verification data");
    }
    await adminAuth().updateUser(uid, { emailVerified: true });
    await adminAuth().revokeRefreshTokens(uid);
    const customToken = await adminAuth().createCustomToken(uid);
    const idTokens = await exchangeCustomTokenForIdToken(customToken);
    await keyDoc.ref.delete();
    return {
      idToken: idTokens.idToken,
    };
  } else {
    throw new Error("Token verification failed");
  }
};

export const verifyTokenAndUpdatePassword = async (
  token: string,
  newPassword: string
): Promise<boolean> => {
  const decoded = jwt.decode(token) as { email?: string };
  if (!decoded || !decoded.email) {
    return false;
  }
  const email = decoded.email;
  const keyDoc = await firestore()
    .collection("forgot-password-keys")
    .doc(email)
    .get();
  if (!keyDoc.exists || !keyDoc.data()?.key) {
    return false;
  }
  const key = keyDoc.data()?.key;
  const verifiedToken = jwt.verify(token, key) as { email: string };
  if (verifiedToken && verifiedToken.email === email) {
    const uid = keyDoc.data()?.uid;
    if (!uid) {
      return false;
    }
    await adminAuth().updateUser(uid, { password: newPassword });
    await adminAuth().revokeRefreshTokens(uid);
    await keyDoc.ref.delete();
    return true;
  }
  return false;
};

export const refreshUserToken = async (
  refreshToken: string
): Promise<AuthResponse | null> => {
  const refreshedTokens = await refreshIdToken(refreshToken);
  if (!refreshedTokens) {
    return null;
  }
  return {
    idToken: refreshedTokens.idToken,
    refreshToken: refreshedTokens.refreshToken,
  };
};

export const verifyIdToken = async (idToken: string): Promise<boolean> => {
  await adminAuth().verifyIdToken(idToken);
  return true;
};

export const invalidateUserTokens = async (
  idToken: string
): Promise<boolean> => {
  const decodedToken = await adminAuth().verifyIdToken(idToken);
  const uid = decodedToken.uid;
  if (!uid) {
    return false;
  }
  await adminAuth().revokeRefreshTokens(uid);
  return true;
};

async function signInWithEmailPassword(
  email: string,
  password: string
): Promise<any> {
  if (!config.firebaseConfig.webAPIKey) {
    throw new Error("Firebase Web API Key is required for authentication");
  }
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
}

async function exchangeCustomTokenForIdToken(
  customToken: string
): Promise<any> {
  if (!config.firebaseConfig.webAPIKey) {
    throw new Error("Firebase Web API Key is required for token exchange");
  }
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
}

async function refreshIdToken(token: string): Promise<any> {
  if (!config.firebaseConfig.webAPIKey) {
    throw new Error("Firebase Web API Key is required for token refresh");
  }
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
      `Token refresh failed: ${errorData.error?.message || response.statusText}`
    );
  }
  const data = await response.json();
  return {
    idToken: data.id_token,
    refreshToken: data.refresh_token,
  };
}

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
  await firestore().collection("verify-email-keys").doc(email).set({
    key,
    createdAt: new Date(),
    expiresAt,
    uid: userUid,
  });
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
  await firestore().collection("forgot-password-keys").doc(email).set({
    key,
    createdAt: new Date(),
    expiresAt,
    uid: userUid,
  });
  const link = `${config.websiteAuthBaseUrl}/reset-password?token=${token}`;
  await sendPasswordResetEmail(email, link);
}
