import { FastifyReply, FastifyRequest } from "fastify";
import * as authService from "../services/authService";
import { logger } from "../config/logger";
import {
  validatePassword,
  getPasswordErrorMessage,
  validateEmail,
} from "../utils/validator";
import { IdentityServiceError } from "../services/identityService";
import { FirebaseAuthError } from "firebase-admin/auth";
import * as jwt from "jsonwebtoken";
import { ClaimsInvariantError } from "../utils/claims";
import {
  setRefreshTokenCookie,
  clearRefreshTokenCookie,
} from "../utils/cookies";

export const checkHealth = async (
  _request: FastifyRequest,
  reply: FastifyReply
) => {
  return reply.code(200).send({
    data: {
      status: "ok",
      uptime: process.uptime(),
      timestamp: Date.now(),
    },
  });
};

export const register = async (
  request: FastifyRequest<{
    Body: { email: string; password: string };
  }>,
  reply: FastifyReply
) => {
  const { email, password } = request.body;
  try {

    const emailValidationResult = validateEmail(email);
    if (!emailValidationResult.isValid) {
      return reply.code(400).send({
        error: {
          message: emailValidationResult.error,
        },
      });
    }

    const validationResult = validatePassword(password);
    if (!validationResult.isValid) {
      return reply.code(400).send({
        error: {
          message: getPasswordErrorMessage(validationResult.errors),
        },
      });
    }

    const authResponse = await authService.registerPrincipal(email, password);
    return reply.code(201).send({ data: authResponse });
  } catch (error) {
    const logFields: Record<string, unknown> = { operation: "register", email, error };

    if (error instanceof IdentityServiceError) {
      logFields.identityStatus = error.statusCode;
      logFields.identityError = error.message;
      logger.error(logFields, "Registration error");

      switch (error.statusCode) {
        case 403:
          return reply
            .code(500)
            .send({ error: { message: "Service configuration error" } });
        default:
          return reply
            .code(500)
            .send({ error: { message: "Registration failed due to an internal error" } });
      }
    }

    logger.warn(logFields, "Registration error");

    if (error instanceof FirebaseAuthError) {
      switch (error.code) {
        case "auth/email-already-exists":
          return reply
            .code(409)
            .send({ error: { message: "Email already in use" } });
        case "auth/invalid-email":
          return reply
            .code(400)
            .send({ error: { message: "Invalid email format" } });
        case "auth/weak-password":
          return reply
            .code(400)
            .send({ error: { message: "Password is too weak" } });
        default:
          return reply
            .code(400)
            .send({ error: { message: "Invalid registration data" } });
      }
    }
    return reply
      .code(400)
      .send({ error: { message: "Invalid registration data" } });
  }
};

export const login = async (
  request: FastifyRequest<{
    Body: { email: string; password: string; returnRefreshToken?: boolean };
  }>,
  reply: FastifyReply
) => {
  const { email, password, returnRefreshToken = false } = request.body;
  try {

    const emailValidationResult = validateEmail(email);
    if (!emailValidationResult.isValid) {
      return reply.code(400).send({
        error: {
          message: emailValidationResult.error,
        },
      });
    }

    const authResponse = await authService.authenticatePrincipal(
      email,
      password,
      returnRefreshToken
    );

    if (authResponse.refreshToken) {
      setRefreshTokenCookie(reply, authResponse.refreshToken);
      delete authResponse.refreshToken;
    }

    return reply.code(200).send({ data: authResponse });
  } catch (error) {
    logger.warn({ operation: "login", email, error }, "Login error");

    if (error instanceof FirebaseAuthError) {
      switch (error.code) {
        case "auth/user-disabled":
          return reply
            .code(403)
            .send({ error: { message: "Account has been disabled" } });
        case "auth/email-not-found":
        case "auth/invalid-email":
        case "auth/invalid-password":
          return reply
            .code(401)
            .send({ error: { message: "Invalid credentials" } });
        default:
          return reply
            .code(400)
            .send({ error: { message: "Invalid login attempt" } });
      }
    }
    return reply
      .code(400)
      .send({ error: { message: "Invalid login attempt" } });
  }
};

export const forgotPassword = async (
  request: FastifyRequest<{
    Body: { email: string };
  }>,
  reply: FastifyReply
) => {
  const { email } = request.body;
  try {

    const emailValidationResult = validateEmail(email);
    if (!emailValidationResult.isValid) {
      return reply.code(400).send({
        error: {
          message: emailValidationResult.error,
        },
      });
    }

    await authService.forgotPassword(email);

    return reply.code(200).send({
      data: {
        message:
          "If your email is registered, you will receive a password reset link.",
      },
    });
  } catch (error) {
    logger.warn({ operation: "forgotPassword", email, error }, "Password reset error");
    return reply.code(200).send({
      data: {
        message:
          "If your email is registered, you will receive a password reset link.",
      },
    });
  }
};

export const resendVerificationEmail = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  const idToken = extractBearerToken(request);

  if (!idToken) {
    return reply.code(400).send({
      error: { message: "Authorization token missing" },
    });
  }

  const decodedToken = jwt.decode(idToken) as { email?: string } | null;
  const email =
    decodedToken && typeof decodedToken === "object"
      ? decodedToken.email
      : undefined;

  try {

    if (!email) {
      return reply.code(400).send({
        error: { message: "Email not found in token" },
      });
    }

    const emailValidationResult = validateEmail(email);
    if (!emailValidationResult.isValid) {
      return reply.code(400).send({
        error: {
          message: emailValidationResult.error,
        },
      });
    }

    await authService.resendVerificationEmail(email);

    return reply.code(200).send({
      data: {
        message:
          "If your email is registered and not verified, a verification email will be sent.",
      },
    });
  } catch (error) {
    logger.warn({ operation: "resendVerificationEmail", email, error }, "Email verification error");

    // Don't reveal if the email exists
    return reply.code(200).send({
      data: {
        message:
          "If your email is registered and not verified, a verification email will be sent.",
      },
    });
  }
};

export const verifyEmail = async (
  request: FastifyRequest<{
    Body: { token: string };
  }>,
  reply: FastifyReply
) => {
  const { token } = request.body;
  try {
    if (!token) {
      return reply
        .code(400)
        .send({ error: { message: "Verification token is required" } });
    }

    const authResponse = await authService.verifyEmailToken(token);

    return reply.code(201).send({ data: authResponse });
  } catch (error) {
    const decoded = jwt.decode(token) as { email?: string };
    const email = decoded?.email;
    logger.warn({ operation: "verifyEmail", email, error }, "Email verification error");
    return reply.code(400).send({
      error: {
        message:
          "Failed to verify email. Please try again or request a new verification link.",
      },
    });
  }
};

export const refreshToken = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    const refreshToken = request.cookies.refresh_token;

    if (!refreshToken) {
      return reply
        .code(401)
        .send({ error: { message: "No refresh token provided" } });
    }

    const authResponse = await authService.refreshPrincipalToken(refreshToken);

    if (authResponse.refreshToken) {
      setRefreshTokenCookie(reply, authResponse.refreshToken);
    }

    delete authResponse.refreshToken;
    return reply.code(200).send({ data: authResponse });
  } catch (error) {
    logger.warn({ operation: "refreshToken", error }, "Token refresh error");

    clearRefreshTokenCookie(reply);

    if (error instanceof FirebaseAuthError) {
      switch (error.code) {
        case "auth/user-disabled":
          return reply
            .code(403)
            .send({ error: { message: "Account has been disabled" } });
        default:
          return reply
            .code(401)
            .send({ error: { message: "Invalid or expired refresh token" } });
      }
    }

    return reply
      .code(401)
      .send({ error: { message: "Invalid or expired refresh token" } });
  }
};

export const resetPassword = async (
  request: FastifyRequest<{
    Body: { token: string; password: string };
  }>,
  reply: FastifyReply
) => {
  const { token, password } = request.body;
  try {
    if (!token) {
      return reply
        .code(400)
        .send({ error: { message: "Reset token is required" } });
    }

    const validationResult = validatePassword(password);
    if (!validationResult.isValid) {
      return reply.code(400).send({
        error: {
          message: getPasswordErrorMessage(validationResult.errors),
        },
      });
    }

    const passwordUpdated = await authService.verifyTokenAndUpdatePassword(
      token,
      password
    );

    if (passwordUpdated) {
      return reply.code(200).send({
        data: {
          success: true,
          message: "Password has been successfully reset",
        },
      });
    } else {
      return reply.code(400).send({
        error: {
          message: "Invalid or expired reset token",
        },
      });
    }
  } catch (error) {
    const decoded = jwt.decode(token) as { email?: string };
    const email = decoded?.email;
    logger.warn({ operation: "resetPassword", email, error }, "Password reset error");
    return reply.code(400).send({
      error: {
        message:
          "Failed to reset password. Please try again or request a new reset link.",
      },
    });
  }
};

export const logout = async (request: FastifyRequest, reply: FastifyReply) => {
  const idToken = extractBearerToken(request);

  if (idToken) {
    try {
      // Defense-in-depth: revoke refresh tokens server-side (REQ-20).
      // Failure never fails logout — the cookie is cleared regardless (NFR-13).
      const revokedUid = await authService.invalidateUserTokens(idToken);
      logger.info(
        { operation: "logout", uid: revokedUid },
        "Refresh tokens revoked on logout"
      );
    } catch (error) {
      logger.warn(
        { operation: "logout", reason: "revocation failed", error },
        "Logout token revocation failed"
      );
    }
  } else {
    logger.warn(
      { operation: "logout", reason: "no bearer token" },
      "Logout revocation skipped"
    );
  }

  clearRefreshTokenCookie(reply);

  return reply.code(200).send({
    data: {
      success: true,
      message: "Logged out successfully",
    },
  });
};

export const verifyIdToken = async (
  request: FastifyRequest<{ Body: { idToken: string } }>,
  reply: FastifyReply
) => {
  const { idToken } = request.body;
  if (!idToken) {
    return reply
      .code(400)
      .send({ error: { message: "ID token is required" } });
  }
  try {
    const valid = await authService.verifyIdToken(idToken);
    reply.header("Cache-Control", "public, max-age=600");
    return reply.code(200).send({ data: { valid } });
  } catch (error) {
    logger.error({ operation: "verifyIdToken", error }, "Error verifying ID token");
    return reply
      .code(500)
      .send({ error: { message: "Internal server error" } });
  }
};

// --- Access control (admin-gated) ---

function extractBearerToken(request: FastifyRequest): string | undefined {
  const header = request.headers["authorization"];
  if (!header) {
    return undefined;
  }
  const [scheme, token] = header.split(" ");
  if (!scheme || scheme.toLowerCase() !== "bearer" || !token) {
    return undefined;
  }
  return token;
}

/**
 * Single error mapping for every admin-gated endpoint (design.md §9).
 * Never leaks internal error details to the client (NFR-14).
 * Log level discipline: 4xx = caller's fault → WARN; 5xx = unexpected → ERROR.
 */
function sendAccessControlError(
  reply: FastifyReply,
  operation: string,
  context: Record<string, unknown>,
  error: unknown
) {
  let status = 500;
  let message = "Internal server error";

  if (error instanceof authService.AdminAuthorizationError) {
    status = 403;
    message = "Forbidden";
  } else if (error instanceof ClaimsInvariantError) {
    status = 400;
    message = "Invalid custom claims";
  } else if (error instanceof FirebaseAuthError) {
    switch (error.code) {
      case "auth/user-not-found":
        status = 404;
        message = "Principal not found";
        break;
      case "auth/invalid-uid":
      case "auth/invalid-argument":
        status = 400;
        message = "Invalid principal_uid";
        break;
      case "auth/id-token-expired":
      case "auth/id-token-revoked":
      case "auth/invalid-id-token":
      case "auth/argument-error":
        status = 401;
        message = "Unauthorized";
        break;
      default:
        status = 500;
        message = "Internal server error";
    }
  }

  if (status >= 500) {
    logger.error({ operation, ...context, error }, `${operation} error`);
  } else {
    logger.warn(
      { operation, ...context, error },
      `${operation} failed with ${status}`
    );
  }

  return reply.code(status).send({ error: { message } });
}

/**
 * TypeBox only validates the body when Content-Type is application/json
 * (the route schema uses a `content`-keyed schema for OpenAPI examples). A
 * non-JSON body (e.g. text/plain) is parsed to a string and reaches the
 * handler unvalidated, so we defensively re-check the shape and apply
 * REQ-14's trim here.
 */
const readEntitlementBody = (
  body: unknown
): { principal_uid: string; entitlement: string } | null => {
  if (typeof body !== "object" || body === null) {
    return null;
  }

  const { principal_uid, entitlement } = body as Record<string, unknown>;
  if (typeof principal_uid !== "string" || typeof entitlement !== "string") {
    return null;
  }

  return {
    principal_uid,
    // REQ-14: trim before validation and store the trimmed value.
    entitlement: entitlement.trim(),
  };
};

export const lookupPrincipal = async (
  request: FastifyRequest<{ Querystring: { email: string } }>,
  reply: FastifyReply
) => {
  const idToken = extractBearerToken(request);
  if (!idToken) {
    return reply.code(401).send({ error: { message: "Unauthorized" } });
  }

  const { email } = request.query;

  try {
    const result = await authService.lookupPrincipal(idToken, email);
    return reply.code(200).send({ data: result });
  } catch (error) {
    return sendAccessControlError(reply, "lookupPrincipal", { email }, error);
  }
};

type EntitlementBody = { principal_uid: string; entitlement: string };

async function handleEntitlementMutation(
  request: FastifyRequest<{ Body: EntitlementBody }>,
  reply: FastifyReply,
  mode: "grant" | "revoke"
) {
  const idToken = extractBearerToken(request);
  if (!idToken) {
    return reply.code(401).send({ error: { message: "Unauthorized" } });
  }

  const body = readEntitlementBody(request.body);
  if (!body || !body.principal_uid || !body.entitlement) {
    // Missing/invalid fields, or whitespace-only entitlement after trim.
    return reply.code(400).send({ error: { message: "Invalid entitlement" } });
  }

  const { principal_uid, entitlement } = body;

  const operation =
    mode === "grant" ? "grantEntitlement" : "revokeEntitlement";
  const serviceFn =
    mode === "grant"
      ? authService.grantEntitlement
      : authService.revokeEntitlement;

  try {
    const result = await serviceFn(idToken, principal_uid, entitlement);
    return reply.code(200).send({ data: result });
  } catch (error) {
    return sendAccessControlError(
      reply,
      operation,
      { principal_uid, entitlement },
      error
    );
  }
}

export const grantEntitlement = async (
  request: FastifyRequest<{ Body: EntitlementBody }>,
  reply: FastifyReply
) => handleEntitlementMutation(request, reply, "grant");

export const revokeEntitlement = async (
  request: FastifyRequest<{ Body: EntitlementBody }>,
  reply: FastifyReply
) => handleEntitlementMutation(request, reply, "revoke");
