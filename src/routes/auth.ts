import { FastifyInstance, FastifyPluginOptions } from "fastify";
import * as authController from "../controllers/authController";
import {
  AuthResponseSchema,
  UserRegistrationSchema,
  UserCredentialsSchema,
  PasswordResetSchema,
  EmailVerificationSchema,
} from "../models/AuthUser";

const authRoutes = async (
  fastify: FastifyInstance,
  options: FastifyPluginOptions
) => {
  fastify.get("/health", {
    schema: {
      response: {
        200: {
          type: "object",
          properties: {
            data: {
              type: "object",
              properties: {
                status: { type: "string" },
                uptime: { type: "number" },
                timestamp: { type: "number" },
              },
            },
          },
        },
      },
    },
    handler: authController.checkHealth,
  });

  fastify.post("/register", {
    schema: {
      body: UserRegistrationSchema,
      response: {
        201: {
          type: "object",
          properties: {
            data: AuthResponseSchema,
          },
        },
      },
    },
    handler: authController.register,
  });

  fastify.post("/login", {
    schema: {
      body: UserCredentialsSchema,
      response: {
        200: {
          type: "object",
          properties: {
            data: AuthResponseSchema,
          },
        },
      },
    },
    handler: authController.login,
  });

  fastify.post("/forgot-password", {
    schema: {
      body: PasswordResetSchema,
      response: {
        200: {
          type: "object",
          properties: {
            data: {
              type: "object",
              properties: {
                message: { type: "string" },
              },
            },
          },
        },
      },
    },
    handler: authController.forgotPassword,
  });

  fastify.post("/resend-verification", {
    schema: {
      body: EmailVerificationSchema,
      response: {
        200: {
          type: "object",
          properties: {
            data: {
              type: "object",
              properties: {
                message: { type: "string" },
              },
            },
          },
        },
      },
    },
    handler: authController.resendVerificationEmail,
  });

  fastify.post("/refresh-token", {
    schema: {
      body: {
        type: "object",
        properties: {
          refreshToken: { type: "string" },
        },
        required: ["refreshToken"],
      },
      response: {
        200: {
          type: "object",
          properties: {
            data: AuthResponseSchema,
          },
        },
      },
    },
    handler: authController.refreshToken,
  });
};

export default authRoutes;
