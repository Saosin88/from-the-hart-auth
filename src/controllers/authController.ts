import { FastifyReply, FastifyRequest } from "fastify";
import * as authService from "../services/authService";
import { logger } from "../config/logger";
import {
  validatePassword,
  getPasswordErrorMessage,
  validateEmail,
} from "../utils/validator";
import * as jwt from "jsonwebtoken";

export const checkHealth = async (
  request: FastifyRequest,
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
  try {
    const { email, password } = request.body;

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

    const authResponse = await authService.registerUser(email, password);
    return reply.code(201).send({ data: authResponse });
  } catch (error) {
    logger.error({ error }, "Registration error");

    const firebaseError = error as any;
    if (firebaseError.code) {
      switch (firebaseError.code) {
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
  try {
    const { email, password, returnRefreshToken = false } = request.body;

    const emailValidationResult = validateEmail(email);
    if (!emailValidationResult.isValid) {
      return reply.code(400).send({
        error: {
          message: emailValidationResult.error,
        },
      });
    }

    const authResponse = await authService.authenticateUser(
      email,
      password,
      returnRefreshToken
    );

    if (!authResponse) {
      return reply
        .code(401)
        .send({ error: { message: "Invalid credentials" } });
    }

    if (authResponse.refreshToken) {
      const cookieExpirationInSeconds = 30 * 24 * 60 * 60; // 30 days

      reply.setCookie("refresh_token", authResponse.refreshToken, {
        domain: ".fromthehart.tech",
        path: "/auth/refresh-token",
        secure: true,
        httpOnly: true,
        sameSite: "none",
        maxAge: cookieExpirationInSeconds,
        priority: "high",
      });

      delete authResponse.refreshToken;
    }

    return reply.code(200).send({ data: authResponse });
  } catch (error) {
    logger.error({ error }, "Login error");
    const firebaseError = error as any;
    if (firebaseError.code) {
      switch (firebaseError.code) {
        case "auth/user-disabled":
          return reply
            .code(403)
            .send({ error: { message: "Account has been disabled" } });
        case "auth/user-not-found":
        case "auth/wrong-password":
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
  try {
    const { email } = request.body;

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
    logger.error({ error }, "Password reset error");
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
  try {
    const idToken = request.headers["authorization"]?.split(" ")[1];

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
    logger.error({ error }, "Email verification error");

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
  try {
    const { token } = request.body;

    if (!token) {
      return reply
        .code(400)
        .send({ error: { message: "Verification token is required" } });
    }

    const authResponse = await authService.verifyEmailToken(token);

    return reply.code(201).send({ data: authResponse });
  } catch (error) {
    logger.error({ error }, "Email verification error");
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

    const authResponse = await authService.refreshUserToken(refreshToken);

    if (!authResponse) {
      return reply
        .code(401)
        .send({ error: { message: "Invalid or expired refresh token" } });
    }

    if (authResponse.refreshToken) {
      const cookieExpirationInSeconds = 30 * 24 * 60 * 60; // 30 days

      reply.setCookie("refresh_token", authResponse.refreshToken, {
        domain: ".fromthehart.tech",
        path: "/auth/refresh-token",
        secure: true,
        httpOnly: true,
        sameSite: "none",
        maxAge: cookieExpirationInSeconds,
        priority: "high",
      });
    }

    delete authResponse.refreshToken;
    return reply.code(200).send({ data: authResponse });
  } catch (error) {
    logger.error({ error }, "Token refresh error");

    const firebaseError = error as any;
    if (firebaseError.code) {
      switch (firebaseError.code) {
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
  try {
    const { token, password } = request.body;

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
    logger.error({ error }, "Password reset error");
    return reply.code(400).send({
      error: {
        message:
          "Failed to reset password. Please try again or request a new reset link.",
      },
    });
  }
};

export const logout = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const idToken = request.headers["authorization"]?.split(" ")[1];

    if (idToken) {
      await authService.invalidateUserTokens(idToken);
    }

    reply.clearCookie("refresh_token", {
      domain: ".fromthehart.tech",
      path: "/auth/refresh-token",
      secure: true,
      httpOnly: true,
      sameSite: "none",
      priority: "low",
    });

    return reply.code(200).send({
      data: {
        success: true,
        message: "Logged out successfully",
      },
    });
  } catch (error) {
    logger.error({ error }, "Logout error");

    reply.clearCookie("refresh_token", {
      domain: ".fromthehart.tech",
      path: "/auth/refresh-token",
      secure: true,
      httpOnly: true,
      sameSite: "none",
      priority: "low",
    });

    return reply.code(200).send({
      data: {
        success: true,
        message: "Logged out successfully",
      },
    });
  }
};

export const verifyAccessToken = async (
  request: FastifyRequest<{ Body: { accessToken: string } }>,
  reply: FastifyReply
) => {
  const { accessToken } = request.body;
  if (!accessToken) {
    return reply
      .code(400)
      .send({ error: { message: "Access token is required" } });
  }
  try {
    const valid = await authService.verifyIdToken(accessToken);
    reply.header("Cache-Control", "public, max-age=600"); // Cache for 10 minutes
    return reply.code(200).send({ data: { valid } });
  } catch (error) {
    logger.error({ error }, "Error verifying access token");
    return reply
      .code(500)
      .send({ error: { message: "Internal server error" } });
  }
};
