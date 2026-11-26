import { FirebaseAuthError, AuthClientErrorCode } from "firebase-admin/auth";
import { logger } from "../config/logger";
import { config } from "../config";

/**
 * Wrapper for the Firebase REST endpoints that `firebase-admin` does not
 * expose (client-side credential exchange and token refresh). This is a
 * distinct integration from `firebase.ts` (the Admin SDK) and mirrors the
 * repo convention of one file per external integration.
 */

export interface FirebaseSignInResult {
  localId: string;
  idToken: string;
  refreshToken: string;
}

export interface TokenExchangeResult {
  idToken: string;
  refreshToken: string;
}

/**
 * firebase-admin does not expose `FirebaseAuthError`'s constructor in its
 * public typings, but the runtime signature is
 * `new FirebaseAuthError({ code, message })` where `code` is the non-prefixed
 * value and the `auth/` prefix is applied internally. This typed cast removes
 * the per-call `as any` while keeping the runtime behavior identical.
 */
type FirebaseAuthErrorConstructor = new (info: {
  code: string;
  message: string;
}) => FirebaseAuthError;
const FirebaseAuthErrorCtor = FirebaseAuthError as unknown as FirebaseAuthErrorConstructor;

/**
 * Maps an identitytoolkit REST error message (a server code such as
 * "INVALID_PASSWORD") to the canonical firebase-admin client error code.
 * The identitytoolkit REST backend and the firebase-admin Admin SDK use
 * different server-code vocabularies, so `FirebaseAuthError.fromServerError`
 * does not apply here — this is the equivalent mapping for the client REST API.
 */
function toClientErrorInfo(message: string): { code: string; message: string } {
  if (message.includes("EMAIL_NOT_FOUND")) {
    return AuthClientErrorCode.EMAIL_NOT_FOUND;
  }
  if (message.includes("INVALID_EMAIL")) {
    return AuthClientErrorCode.INVALID_EMAIL;
  }
  if (message.includes("INVALID_PASSWORD")) {
    return AuthClientErrorCode.INVALID_PASSWORD;
  }
  if (message.includes("USER_DISABLED")) {
    return AuthClientErrorCode.USER_DISABLED;
  }
  return AuthClientErrorCode.INTERNAL_ERROR;
}

export const signInWithEmailPassword = async (
  email: string,
  password: string
): Promise<FirebaseSignInResult> => {
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
    let errorData;
    try {
      errorData = await response.json();
    } catch (e) {
      errorData = { parseError: e, text: await response.text() };
    }
    logger.error(
      {
        status: response.status,
        statusText: response.statusText,
        errorData,
      },
      "signInWithEmailPassword failed: error response from identitytoolkit.googleapis.com"
    );
    const errorMessage = errorData.error?.message || response.statusText;
    throw new FirebaseAuthErrorCtor(toClientErrorInfo(errorMessage));
  }
  const data = await response.json();
  return {
    localId: data.localId,
    idToken: data.idToken,
    refreshToken: data.refreshToken,
  };
};

export const exchangeCustomTokenForIdToken = async (
  customToken: string
): Promise<TokenExchangeResult> => {
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
    let errorData;
    try {
      errorData = await response.json();
    } catch (e) {
      errorData = { parseError: e, text: await response.text() };
    }
    logger.error(
      {
        status: response.status,
        statusText: response.statusText,
        errorData,
      },
      "exchangeCustomTokenForIdToken failed: error response from identitytoolkit.googleapis.com"
    );
    throw new Error(
      `Token exchange failed: ${errorData.error?.message || response.statusText}`
    );
  }
  const data = await response.json();
  return {
    idToken: data.idToken,
    refreshToken: data.refreshToken,
  };
};

export const refreshIdToken = async (
  token: string
): Promise<TokenExchangeResult> => {
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
    let errorData;
    try {
      errorData = await response.json();
    } catch (e) {
      errorData = { parseError: e, text: await response.text() };
    }
    logger.error(
      {
        status: response.status,
        statusText: response.statusText,
        errorData,
      },
      "Token refresh failed: error response from securetoken.googleapis.com"
    );
    throw new Error(
      `Token refresh failed: ${errorData.error?.message || response.statusText}`
    );
  }
  const data = await response.json();
  return {
    idToken: data.id_token,
    refreshToken: data.refresh_token,
  };
};
