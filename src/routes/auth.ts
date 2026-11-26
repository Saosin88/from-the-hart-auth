import { FastifyInstance, FastifyPluginOptions } from "fastify";
import * as authController from "../controllers/authController";
import {
  AuthResponseSchema,
  PrincipalRegistrationSchema,
  PrincipalCredentialsSchema,
  PasswordResetSchema,
  EmailVerificationTokenSchema,
  StandardMessageResponseSchema,
  VerificationResponseSchema,
  HealthCheckResponseSchema,
  ErrorResponseSchema,
  PasswordUpdateSchema,
  LogoutSuccessResponseSchema,
  IdTokenSchema,
  IdTokenVerificationResponseSchema,
  PrincipalLookupQuerySchema,
  PrincipalLookupResponseSchema,
  EntitlementRequestSchema,
  EntitlementResponseSchema,
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
        properties: PrincipalRegistrationSchema.properties,
        required: PrincipalRegistrationSchema.required,
        content: {
          "application/json": {
            schema: PrincipalRegistrationSchema,
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
        properties: PrincipalCredentialsSchema.properties,
        required: PrincipalCredentialsSchema.required,
        content: {
          "application/json": {
            schema: PrincipalCredentialsSchema,
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

  fastify.post("/verify-id-token", {
    schema: {
      description: "Verify the validity of a JWT ID token.",
      summary: "Verify ID token",
      body: {
        type: "object",
        properties: IdTokenSchema.properties,
        required: IdTokenSchema.required,
        content: {
          "application/json": {
            schema: IdTokenSchema,
            examples: {
              VerifyIdTokenRequest: {
                summary: "Example verify ID token request",
                value: {
                  idToken: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
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
                  data: IdTokenVerificationResponseSchema,
                },
              },
              examples: {
                VerifyIdTokenSuccess: {
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
                VerifyIdTokenError: {
                  summary: "Missing or invalid ID token",
                  value: {
                    error: { message: "Missing or invalid ID token" },
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
                VerifyIdTokenServerError: {
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
    handler: authController.verifyIdToken,
  });

  fastify.get("/lookup", {
    schema: {
      description:
        "Resolve a Principal's Firebase UID from their email address. Admin only: the caller's acting Identity must hold the platform-level admin role.",
      summary: "Resolve a Principal UID by email (admin only)",
      querystring: PrincipalLookupQuerySchema,
      response: {
        200: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: { data: PrincipalLookupResponseSchema },
              },
              examples: {
                LookupSuccess: {
                  summary: "Principal resolved",
                  value: { data: { principal_uid: "abc123xyz" } },
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
                properties: { error: ErrorResponseSchema },
              },
              examples: {
                LookupInvalidEmail: {
                  summary: "Invalid email format",
                  value: { error: { message: "Invalid email format" } },
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
                properties: { error: ErrorResponseSchema },
              },
              examples: {
                LookupUnauthorized: {
                  summary: "Missing or invalid ID token",
                  value: { error: { message: "Unauthorized" } },
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
                properties: { error: ErrorResponseSchema },
              },
              examples: {
                LookupForbidden: {
                  summary: "Caller is not an admin",
                  value: { error: { message: "Forbidden" } },
                },
              },
            },
          },
        },
        404: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: { error: ErrorResponseSchema },
              },
              examples: {
                LookupNotFound: {
                  summary: "No Principal has that email",
                  value: { error: { message: "Principal not found" } },
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
                properties: { error: ErrorResponseSchema },
              },
              examples: {
                LookupServerError: {
                  summary: "Internal server error",
                  value: { error: { message: "Internal server error" } },
                },
              },
            },
          },
        },
      },
    },
    handler: authController.lookupPrincipal,
  });

  fastify.post("/entitlements", {
    schema: {
      description:
        "Grant a free-form entitlement to a Principal. Admin only: the caller's acting Identity must hold the platform-level admin role. Idempotent.",
      summary: "Grant an entitlement (admin only)",
      body: {
        type: "object",
        properties: EntitlementRequestSchema.properties,
        required: EntitlementRequestSchema.required,
        content: {
          "application/json": {
            schema: EntitlementRequestSchema,
            examples: {
              GrantEntitlementRequest: {
                summary: "Example grant request",
                value: { principal_uid: "abc123xyz", entitlement: "storage" },
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
                properties: { data: EntitlementResponseSchema },
              },
              examples: {
                GrantEntitlementSuccess: {
                  summary: "Entitlement granted",
                  value: {
                    data: { principal_uid: "abc123xyz", entitlement: "storage" },
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
                properties: { error: ErrorResponseSchema },
              },
              examples: {
                GrantEntitlementBadRequest: {
                  summary: "Invalid request body",
                  value: { error: { message: "Invalid entitlement" } },
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
                properties: { error: ErrorResponseSchema },
              },
              examples: {
                GrantEntitlementUnauthorized: {
                  summary: "Missing or invalid ID token",
                  value: { error: { message: "Unauthorized" } },
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
                properties: { error: ErrorResponseSchema },
              },
              examples: {
                GrantEntitlementForbidden: {
                  summary: "Caller is not an admin",
                  value: { error: { message: "Forbidden" } },
                },
              },
            },
          },
        },
        404: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: { error: ErrorResponseSchema },
              },
              examples: {
                GrantEntitlementNotFound: {
                  summary: "Target Principal not found",
                  value: { error: { message: "Principal not found" } },
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
                properties: { error: ErrorResponseSchema },
              },
              examples: {
                GrantEntitlementServerError: {
                  summary: "Internal server error",
                  value: { error: { message: "Internal server error" } },
                },
              },
            },
          },
        },
      },
    },
    handler: authController.grantEntitlement,
  });

  fastify.post("/entitlements/revoke", {
    schema: {
      description:
        "Revoke an entitlement from a Principal. Admin only: the caller's acting Identity must hold the platform-level admin role. Idempotent; revoking the last entitlement drops the claim entirely.",
      summary: "Revoke an entitlement (admin only)",
      body: {
        type: "object",
        properties: EntitlementRequestSchema.properties,
        required: EntitlementRequestSchema.required,
        content: {
          "application/json": {
            schema: EntitlementRequestSchema,
            examples: {
              RevokeEntitlementRequest: {
                summary: "Example revoke request",
                value: { principal_uid: "abc123xyz", entitlement: "storage" },
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
                properties: { data: EntitlementResponseSchema },
              },
              examples: {
                RevokeEntitlementSuccess: {
                  summary: "Entitlement revoked",
                  value: {
                    data: { principal_uid: "abc123xyz", entitlement: "storage" },
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
                properties: { error: ErrorResponseSchema },
              },
              examples: {
                RevokeEntitlementBadRequest: {
                  summary: "Invalid request body",
                  value: { error: { message: "Invalid entitlement" } },
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
                properties: { error: ErrorResponseSchema },
              },
              examples: {
                RevokeEntitlementUnauthorized: {
                  summary: "Missing or invalid ID token",
                  value: { error: { message: "Unauthorized" } },
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
                properties: { error: ErrorResponseSchema },
              },
              examples: {
                RevokeEntitlementForbidden: {
                  summary: "Caller is not an admin",
                  value: { error: { message: "Forbidden" } },
                },
              },
            },
          },
        },
        404: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: { error: ErrorResponseSchema },
              },
              examples: {
                RevokeEntitlementNotFound: {
                  summary: "Target Principal not found",
                  value: { error: { message: "Principal not found" } },
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
                properties: { error: ErrorResponseSchema },
              },
              examples: {
                RevokeEntitlementServerError: {
                  summary: "Internal server error",
                  value: { error: { message: "Internal server error" } },
                },
              },
            },
          },
        },
      },
    },
    handler: authController.revokeEntitlement,
  });
};

export default authRoutes;
