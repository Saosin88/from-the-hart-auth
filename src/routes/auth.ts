import { FastifyInstance, FastifyPluginOptions } from "fastify";
import * as authController from "../controllers/authController";
import {
  AuthResponseSchema,
  UserRegistrationSchema,
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
      description: "Health check endpoint to verify the service is running.",
      summary: "Service health check",
      response: {
        200: {
          type: "object",
          properties: {
            data: HealthCheckResponseSchema,
          },
        },
      },
      examples: {
        HealthCheckSuccess: {
          value: {
            data: {
              status: "ok",
              uptime: 123.45,
              timestamp: 1716123456789,
            },
          },
        },
      },
    },
    handler: authController.checkHealth,
  });

  fastify.post("/register", {
    schema: {
      description: "Register a new user with email and password.",
      summary: "User registration",
      body: {
        type: "object",
        properties: UserRegistrationSchema.properties,
        required: UserRegistrationSchema.required,
        content: {
          "application/json": {
            schema: UserRegistrationSchema,
            examples: {
              RegisterRequest: {
                summary: "Example registration request",
                value: {
                  email: "newuser@example.com",
                  password: "StrongPassw0rd!",
                },
              },
            },
          },
        },
      },
      response: {
        201: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  data: AuthResponseSchema,
                },
              },
              examples: {
                RegisterSuccess: {
                  summary: "Successful registration",
                  value: {
                    data: {
                      idToken: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
                      refreshToken: "dGhpc2lzYXJlZnJlc2h0b2tlbg==",
                    },
                  },
                },
              },
            },
          },
        },
        400: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  error: ErrorResponseSchema,
                },
              },
              examples: {
                RegisterError: {
                  summary: "Invalid input",
                  value: {
                    error: { message: "Invalid input" },
                  },
                },
              },
            },
          },
        },
        409: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  error: ErrorResponseSchema,
                },
              },
              examples: {
                RegisterConflict: {
                  summary: "User already exists",
                  value: {
                    error: { message: "User already exists" },
                  },
                },
              },
            },
          },
        },
      },
    },
    handler: authController.register,
  });

  fastify.post("/login", {
    schema: {
      description: "Authenticate a user and return tokens.",
      summary: "User login",
      body: {
        type: "object",
        properties: UserCredentialsSchema.properties,
        required: UserCredentialsSchema.required,
        content: {
          "application/json": {
            schema: UserCredentialsSchema,
            examples: {
              LoginRequest: {
                summary: "Example login request",
                value: {
                  email: "user@example.com",
                  password: "Password123!",
                  returnRefreshToken: true,
                },
              },
            },
          },
        },
      },
      response: {
        200: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  data: AuthResponseSchema,
                },
              },
              examples: {
                LoginSuccess: {
                  summary: "Successful login",
                  value: {
                    data: {
                      idToken: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
                      refreshToken: "dGhpc2lzYXJlZnJlc2h0b2tlbg==",
                    },
                  },
                },
              },
            },
          },
        },
        400: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  error: ErrorResponseSchema,
                },
              },
              examples: {
                LoginError: {
                  summary: "Missing email or password",
                  value: {
                    error: { message: "Missing email or password" },
                  },
                },
              },
            },
          },
        },
        401: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  error: ErrorResponseSchema,
                },
              },
              examples: {
                LoginUnauthorized: {
                  summary: "Invalid credentials",
                  value: {
                    error: { message: "Invalid credentials" },
                  },
                },
              },
            },
          },
        },
        403: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  error: ErrorResponseSchema,
                },
              },
              examples: {
                LoginForbidden: {
                  summary: "Account not verified",
                  value: {
                    error: { message: "Account not verified" },
                  },
                },
              },
            },
          },
        },
      },
    },
    handler: authController.login,
  });

  fastify.post("/forgot-password", {
    schema: {
      description: "Request a password reset email.",
      summary: "Forgot password",
      body: {
        type: "object",
        properties: PasswordResetSchema.properties,
        required: PasswordResetSchema.required,
        content: {
          "application/json": {
            schema: PasswordResetSchema,
            examples: {
              ForgotPasswordRequest: {
                summary: "Example forgot password request",
                value: {
                  email: "resetme@example.com",
                },
              },
            },
          },
        },
      },
      response: {
        200: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  data: StandardMessageResponseSchema,
                },
              },
              examples: {
                ForgotPasswordSuccess: {
                  summary: "Password reset email sent",
                  value: {
                    data: { message: "Password reset email sent" },
                  },
                },
              },
            },
          },
        },
        400: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  error: ErrorResponseSchema,
                },
              },
              examples: {
                ForgotPasswordError: {
                  summary: "Email not found",
                  value: {
                    error: { message: "Email not found" },
                  },
                },
              },
            },
          },
        },
      },
    },
    handler: authController.forgotPassword,
  });

  fastify.get("/resend-verification", {
    schema: {
      description: "Resend the email verification link to the user.",
      summary: "Resend verification email",
      response: {
        200: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  data: StandardMessageResponseSchema,
                },
              },
              examples: {
                ResendVerificationSuccess: {
                  summary: "Verification email sent",
                  value: {
                    data: { message: "Verification email sent" },
                  },
                },
              },
            },
          },
        },
        400: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  error: ErrorResponseSchema,
                },
              },
              examples: {
                ResendVerificationError: {
                  summary: "User already verified",
                  value: {
                    error: { message: "User already verified" },
                  },
                },
              },
            },
          },
        },
      },
    },
    handler: authController.resendVerificationEmail,
  });

  fastify.post("/verify-email", {
    schema: {
      description: "Verify a user's email address using a token.",
      summary: "Verify email",
      body: {
        type: "object",
        properties: EmailVerificationTokenSchema.properties,
        required: EmailVerificationTokenSchema.required,
        content: {
          "application/json": {
            schema: EmailVerificationTokenSchema,
            examples: {
              VerifyEmailRequest: {
                summary: "Example verify email request",
                value: {
                  token: "verify-token-abc",
                },
              },
            },
          },
        },
      },
      response: {
        200: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  data: VerificationResponseSchema,
                },
              },
              examples: {
                VerifyEmailSuccess: {
                  summary: "Email verified successfully",
                  value: {
                    data: { message: "Email verified successfully" },
                  },
                },
              },
            },
          },
        },
        400: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  error: ErrorResponseSchema,
                },
              },
              examples: {
                VerifyEmailError: {
                  summary: "Invalid or expired token",
                  value: {
                    error: { message: "Invalid or expired token" },
                  },
                },
              },
            },
          },
        },
      },
    },
    handler: authController.verifyEmail,
  });

  fastify.post("/reset-password", {
    schema: {
      description: "Reset a user's password using a valid token.",
      summary: "Reset password",
      body: {
        type: "object",
        properties: PasswordUpdateSchema.properties,
        required: PasswordUpdateSchema.required,
        content: {
          "application/json": {
            schema: PasswordUpdateSchema,
            examples: {
              ResetPasswordRequest: {
                summary: "Example reset password request",
                value: {
                  password: "NewPassword1!",
                  token: "reset-token-123",
                },
              },
            },
          },
        },
      },
      response: {
        200: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  data: VerificationResponseSchema,
                },
              },
              examples: {
                ResetPasswordSuccess: {
                  summary: "Password updated successfully",
                  value: {
                    data: { message: "Password updated successfully" },
                  },
                },
              },
            },
          },
        },
        400: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  error: ErrorResponseSchema,
                },
              },
              examples: {
                ResetPasswordError: {
                  summary: "Invalid or expired token",
                  value: {
                    error: { message: "Invalid or expired token" },
                  },
                },
              },
            },
          },
        },
      },
    },
    handler: authController.resetPassword,
  });

  fastify.get("/refresh-token", {
    schema: {
      description: "Obtain a new ID token using a valid refresh token.",
      summary: "Refresh token",
      response: {
        200: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  data: AuthResponseSchema,
                },
              },
              examples: {
                RefreshTokenSuccess: {
                  summary: "Token refreshed successfully",
                  value: {
                    data: {
                      idToken: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
                      refreshToken: "dGhpc2lzYXJlZnJlc2h0b2tlbg==",
                    },
                  },
                },
              },
            },
          },
        },
        401: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  error: ErrorResponseSchema,
                },
              },
              examples: {
                RefreshTokenUnauthorized: {
                  summary: "Missing or invalid refresh token",
                  value: {
                    error: { message: "Missing or invalid refresh token" },
                  },
                },
              },
            },
          },
        },
        403: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  error: ErrorResponseSchema,
                },
              },
              examples: {
                RefreshTokenForbidden: {
                  summary: "Refresh token expired",
                  value: {
                    error: { message: "Refresh token expired" },
                  },
                },
              },
            },
          },
        },
      },
    },
    handler: authController.refreshToken,
  });

  fastify.get("/logout", {
    schema: {
      description: "Log out the current user and invalidate tokens.",
      summary: "Logout",
      response: {
        200: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  data: LogoutSuccessResponseSchema,
                },
              },
              examples: {
                LogoutSuccess: {
                  summary: "Logout successful",
                  value: {
                    data: { success: true, message: "Logout successful" },
                  },
                },
              },
            },
          },
        },
      },
    },
    handler: authController.logout,
  });

  fastify.post("/verify-access-token", {
    schema: {
      description: "Verify the validity of a JWT access token.",
      summary: "Verify access token",
      body: {
        type: "object",
        properties: AccessTokenSchema.properties,
        required: AccessTokenSchema.required,
        content: {
          "application/json": {
            schema: AccessTokenSchema,
            examples: {
              VerifyAccessTokenRequest: {
                summary: "Example verify access token request",
                value: {
                  accessToken: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
                },
              },
            },
          },
        },
      },
      response: {
        200: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  data: AccessTokenVerificationResponseSchema,
                },
              },
              examples: {
                VerifyAccessTokenSuccess: {
                  summary: "Token is valid",
                  value: {
                    data: { valid: true },
                  },
                },
              },
            },
          },
        },
        400: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  error: ErrorResponseSchema,
                },
              },
              examples: {
                VerifyAccessTokenError: {
                  summary: "Missing or invalid access token",
                  value: {
                    error: { message: "Missing or invalid access token" },
                  },
                },
              },
            },
          },
        },
        500: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  error: ErrorResponseSchema,
                },
              },
              examples: {
                VerifyAccessTokenServerError: {
                  summary: "Internal server error",
                  value: {
                    error: { message: "Internal server error" },
                  },
                },
              },
            },
          },
        },
      },
    },
    handler: authController.verifyAccessToken,
  });
};

export default authRoutes;
