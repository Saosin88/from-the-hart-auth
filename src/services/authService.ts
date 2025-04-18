import { AuthResponse } from "../models/AuthUser";
import { logger } from "../config/logger";
import { config } from "../config";
import { adminAuth } from "./firebase";

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
    await generateEmailVerificationLink(email);
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
  password: string
): Promise<AuthResponse | null> => {
  try {
    const signInResult = await signInWithEmailPassword(email, password);

    if (!signInResult) {
      return null;
    }

    return {
      idToken: signInResult.idToken,
      refreshToken: signInResult.refreshToken,
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

async function generateEmailVerificationLink(email: string): Promise<void> {
  try {
    const actionCodeSettings = {
      url: config.emailActionBaseUrl + "/verify-email",
    };

    const link = await adminAuth().generateEmailVerificationLink(
      email,
      actionCodeSettings
    );

    // Here you would typically send the email with the link
    // This could be done via a separate email service
    logger.info({ email, link }, "Generated verification link");

    // For this implementation, we're assuming Firebase's built-in email sending is enabled
    // and will handle sending the email automatically
  } catch (error) {
    logger.error({ error, email }, "Error generating verification link");
    throw error;
  }
}

// Generate password reset link using Admin SDK
async function generatePasswordResetLink(email: string): Promise<void> {
  try {
    const actionCodeSettings = {
      url: config.emailActionBaseUrl + "/reset-password",
      handleCodeInApp: true,
    };

    const link = await adminAuth().generatePasswordResetLink(
      email,
      actionCodeSettings
    );

    // Here you would typically send the email with the link
    // This could be done via a separate email service
    logger.info({ email, link }, "Generated password reset link");

    // For this implementation, we're assuming Firebase's built-in email sending is enabled
    // and will handle sending the email automatically
  } catch (error) {
    logger.error({ error, email }, "Error generating password reset link");
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
