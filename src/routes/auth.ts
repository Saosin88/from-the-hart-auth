import { FastifyInstance, FastifyPluginOptions } from "fastify";
import * as authController from "../controllers/authController";
import {
  AuthResponseSchema,
  UserRegistrationSchema,
  RegistrationResponseSchema,
  UserCredentialsSchema,
  PasswordResetSchema,
  EmailVerificationTokenSchema,
  StandardMessageResponseSchema,
  VerificationResponseSchema,
  HealthCheckResponseSchema,
  ErrorResponseSchema,
  PasswordUpdateSchema,
  LogoutSuccessResponseSchema,
  AccessTokenSchema,
  AccessTokenVerificationResponseSchema,
} from "../models/AuthSchemas";

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
            data: HealthCheckResponseSchema,
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
            data: RegistrationResponseSchema,
          },
        },
        400: {
          type: "object",
          properties: {
            error: ErrorResponseSchema,
          },
        },
        409: {
          type: "object",
          properties: {
            error: ErrorResponseSchema,
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
        400: {
          type: "object",
          properties: {
            error: ErrorResponseSchema,
          },
        },
        401: {
          type: "object",
          properties: {
            error: ErrorResponseSchema,
          },
        },
        403: {
          type: "object",
          properties: {
            error: ErrorResponseSchema,
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
            data: StandardMessageResponseSchema,
          },
        },
        400: {
          type: "object",
          properties: {
            error: ErrorResponseSchema,
          },
        },
      },
    },
    handler: authController.forgotPassword,
  });

  fastify.get("/resend-verification", {
    schema: {
      response: {
        200: {
          type: "object",
          properties: {
            data: StandardMessageResponseSchema,
          },
        },
        400: {
          type: "object",
          properties: {
            error: ErrorResponseSchema,
          },
        },
      },
    },
    handler: authController.resendVerificationEmail,
  });

  fastify.post("/verify-email", {
    schema: {
      body: EmailVerificationTokenSchema,
      response: {
        200: {
          type: "object",
          properties: {
            data: VerificationResponseSchema,
          },
        },
        400: {
          type: "object",
          properties: {
            error: ErrorResponseSchema,
          },
        },
      },
    },
    handler: authController.verifyEmail,
  });

  fastify.post("/reset-password", {
    schema: {
      body: PasswordUpdateSchema,
      response: {
        200: {
          type: "object",
          properties: {
            data: VerificationResponseSchema,
          },
        },
        400: {
          type: "object",
          properties: {
            error: ErrorResponseSchema,
          },
        },
      },
    },
    handler: authController.resetPassword,
  });

  fastify.get("/refresh-token", {
    schema: {
      response: {
        200: {
          type: "object",
          properties: {
            data: AuthResponseSchema,
          },
        },
        401: {
          type: "object",
          properties: {
            error: ErrorResponseSchema,
          },
        },
        403: {
          type: "object",
          properties: {
            error: ErrorResponseSchema,
          },
        },
      },
    },
    handler: authController.refreshToken,
  });

  fastify.get("/logout", {
    schema: {
      response: {
        200: {
          type: "object",
          properties: {
            data: LogoutSuccessResponseSchema,
          },
        },
      },
    },
    handler: authController.logout,
  });

  fastify.post("/verify-access-token", {
    schema: {
      body: AccessTokenSchema,
      response: {
        200: {
          type: "object",
          properties: {
            data: AccessTokenVerificationResponseSchema,
          },
        },
        400: {
          type: "object",
          properties: {
            error: ErrorResponseSchema,
          },
        },
        500: {
          type: "object",
          properties: {
            error: ErrorResponseSchema,
          },
        },
      },
    },
    handler: authController.verifyAccessToken,
  });
};

export default authRoutes;
