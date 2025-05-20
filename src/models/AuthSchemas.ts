import { Type, Static } from "@fastify/type-provider-typebox";

export const AuthResponseSchema = Type.Object({
  idToken: Type.String({
    description: "JWT ID token for authentication",
    examples: ["eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."],
  }),
  refreshToken: Type.Optional(
    Type.String({
      description: "Refresh token for obtaining new access tokens",
      examples: ["dGhpc2lzYXJlZnJlc2h0b2tlbg=="],
    })
  ),
});

export type AuthResponse = Static<typeof AuthResponseSchema>;

export const UserCredentialsSchema = Type.Object({
  email: Type.String({
    format: "email",
    minLength: 5,
    maxLength: 254,
    description: "User's email address",
    examples: ["user@example.com"],
  }),
  password: Type.String({
    minLength: 8,
    maxLength: 128,
    description:
      "Password must be at least 8 characters long and include uppercase, lowercase, number, and special character",
    examples: ["Password123!"],
  }),
  returnRefreshToken: Type.Optional(
    Type.Boolean({
      description: "Whether to return a refresh token in the response",
      default: false,
      examples: [true],
    })
  ),
});

export type UserCredentials = Static<typeof UserCredentialsSchema>;

export const UserRegistrationSchema = Type.Object({
  email: Type.String({
    format: "email",
    minLength: 5,
    maxLength: 254,
    description: "User's email address",
    examples: ["newuser@example.com"],
  }),
  password: Type.String({
    minLength: 8,
    maxLength: 128,
    description:
      "Password must be at least 8 characters long and include uppercase, lowercase, number, and special character",
    examples: ["StrongPassw0rd!"],
  }),
});

export type UserRegistration = Static<typeof UserRegistrationSchema>;

export const PasswordResetSchema = Type.Object({
  email: Type.String({
    format: "email",
    minLength: 5,
    maxLength: 254,
    description: "User's email address for password reset",
    examples: ["resetme@example.com"],
  }),
});

export type PasswordReset = Static<typeof PasswordResetSchema>;

export const PasswordUpdateSchema = Type.Object({
  password: Type.String({
    minLength: 8,
    maxLength: 128,
    description:
      "Password must be at least 8 characters long and include uppercase, lowercase, number, and special character",
    examples: ["NewPassword1!"],
  }),
  token: Type.String({
    description: "Password reset token sent to user's email",
    examples: ["reset-token-123"],
  }),
});

export type PasswordUpdate = Static<typeof PasswordUpdateSchema>;

export const EmailVerificationTokenSchema = Type.Object({
  token: Type.String({
    description: "Email verification token sent to user's email",
    examples: ["verify-token-abc"],
  }),
});

export type EmailVerificationToken = Static<
  typeof EmailVerificationTokenSchema
>;

export const StandardMessageResponseSchema = Type.Object({
  message: Type.String({
    description: "A standard response message",
    examples: ["Password reset email sent"],
  }),
});

export type StandardMessageResponse = Static<
  typeof StandardMessageResponseSchema
>;

export const VerificationResponseSchema = Type.Object({
  message: Type.String({
    description: "Verification status message",
    examples: ["Email verified successfully"],
  }),
});

export type VerificationResponse = Static<typeof VerificationResponseSchema>;

export const LogoutSuccessResponseSchema = Type.Object({
  success: Type.Boolean({
    description: "Indicates if logout was successful",
    examples: [true],
  }),
  message: Type.String({
    description: "Logout status message",
    examples: ["Logout successful"],
  }),
});

export type LogoutSuccessResponse = Static<typeof LogoutSuccessResponseSchema>;

export const ErrorResponseSchema = Type.Object({
  message: Type.String({
    description: "Error message",
    examples: ["Invalid credentials", "User already exists"],
  }),
});

export type ErrorResponse = Static<typeof ErrorResponseSchema>;

export const HealthCheckResponseSchema = Type.Object({
  status: Type.String({
    description: "Service status",
    examples: ["ok"],
  }),
  uptime: Type.Number({
    description: "Service uptime in seconds",
    examples: [123.45],
  }),
  timestamp: Type.Number({
    description: "Current server timestamp (ms since epoch)",
    examples: [1716123456789],
  }),
});

export type HealthCheckResponse = Static<typeof HealthCheckResponseSchema>;

export const AccessTokenSchema = Type.Object({
  accessToken: Type.String({
    description: "JWT access token to verify",
    examples: ["eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."],
  }),
});

export type AccessToken = Static<typeof AccessTokenSchema>;

export const AccessTokenVerificationResponseSchema = Type.Object({
  valid: Type.Boolean({
    description: "Whether the access token is valid",
    examples: [true, false],
  }),
});

export type AccessTokenVerificationResponse = Static<
  typeof AccessTokenVerificationResponseSchema
>;
