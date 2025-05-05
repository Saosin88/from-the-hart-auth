import { FastifyReply, FastifyRequest } from "fastify";
import * as authService from "../services/authService";
import { logger } from "../config/logger";

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

    const authResponse = await authService.registerUser(email, password);
    return reply.code(201).send({ data: authResponse });
  } catch (error) {
    logger.error({ error }, "Registration error");

    const firebaseError = error as any;
    if (firebaseError.code) {
      switch (firebaseError.code) {
        case "auth/email-already-exists":
          return reply.code(409).send({ error: "Email already in use" });
        case "auth/invalid-email":
          return reply.code(400).send({ error: "Invalid email format" });
        case "auth/weak-password":
          return reply.code(400).send({ error: "Password is too weak" });
        default:
          return reply.code(400).send({ error: "Invalid registration data" });
      }
    }
    return reply.code(400).send({ error: "Invalid registration data" });
  }
};

export const login = async (
  request: FastifyRequest<{
    Body: { email: string; password: string };
  }>,
  reply: FastifyReply
) => {
  try {
    const { email, password } = request.body;
    const authResponse = await authService.authenticateUser(email, password);

    if (!authResponse) {
      return reply.code(401).send({ error: "Invalid credentials" });
    }

    return reply.code(200).send({ data: authResponse });
  } catch (error) {
    logger.error({ error }, "Login error");
    const firebaseError = error as any;
    if (firebaseError.code) {
      switch (firebaseError.code) {
        case "auth/user-disabled":
          return reply.code(403).send({ error: "Account has been disabled" });
        case "auth/user-not-found":
        case "auth/wrong-password":
          return reply.code(401).send({ error: "Invalid credentials" });
        default:
          return reply.code(400).send({ error: "Invalid login attempt" });
      }
    }
    return reply.code(400).send({ error: "Invalid login attempt" });
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
  request: FastifyRequest<{
    Body: { email: string };
  }>,
  reply: FastifyReply
) => {
  try {
    const { email } = request.body;
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
      return reply.code(400).send({ error: "Verification token is required" });
    }

    const verified = await authService.verifyEmailToken(token);

    if (verified) {
      return reply.code(200).send({
        data: {
          verified: true,
          message: "Email verified successfully",
        },
      });
    } else {
      return reply.code(400).send({
        error: "Invalid or expired verification token",
      });
    }
  } catch (error) {
    logger.error({ error }, "Email verification error");
    return reply.code(400).send({
      error:
        "Failed to verify email. Please try again or request a new verification link.",
    });
  }
};

export const refreshToken = async (
  request: FastifyRequest<{
    Body: { refreshToken: string };
  }>,
  reply: FastifyReply
) => {
  try {
    const { refreshToken } = request.body;
    const authResponse = await authService.refreshUserToken(refreshToken);

    if (!authResponse) {
      return reply
        .code(401)
        .send({ error: "Invalid or expired refresh token" });
    }

    return reply.code(200).send({ data: authResponse });
  } catch (error) {
    logger.error({ error }, "Token refresh error");

    const firebaseError = error as any;
    if (firebaseError.code) {
      switch (firebaseError.code) {
        case "auth/user-disabled":
          return reply.code(403).send({ error: "Account has been disabled" });
        default:
          return reply
            .code(401)
            .send({ error: "Invalid or expired refresh token" });
      }
    }

    return reply.code(401).send({ error: "Invalid or expired refresh token" });
  }
};
