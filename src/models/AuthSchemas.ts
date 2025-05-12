import { Type, Static } from "@fastify/type-provider-typebox";

export const AuthResponseSchema = Type.Object({
  idToken: Type.String(),
  refreshToken: Type.Optional(Type.String()),
});

export type AuthResponse = Static<typeof AuthResponseSchema>;

export const UserCredentialsSchema = Type.Object({
  email: Type.String(),
  password: Type.String(),
  returnRefreshToken: Type.Optional(Type.Boolean()),
});

export type UserCredentials = Static<typeof UserCredentialsSchema>;

export const UserRegistrationSchema = Type.Object({
  email: Type.String(),
  password: Type.String({
    description:
      "Password must be at least 8 characters long and include uppercase, lowercase, number, and special character",
  }),
});

export type UserRegistration = Static<typeof UserRegistrationSchema>;

export const PasswordResetSchema = Type.Object({
  email: Type.String(),
});

export type PasswordReset = Static<typeof PasswordResetSchema>;

export const PasswordUpdateSchema = Type.Object({
  password: Type.String({
    description:
      "Password must be at least 8 characters long and include uppercase, lowercase, number, and special character",
  }),
  token: Type.String(),
});

export type PasswordUpdate = Static<typeof PasswordUpdateSchema>;

export const EmailVerificationSchema = Type.Object({
  email: Type.String(),
});

export type EmailVerification = Static<typeof EmailVerificationSchema>;

export const EmailVerificationTokenSchema = Type.Object({
  token: Type.String(),
});

export type EmailVerificationToken = Static<
  typeof EmailVerificationTokenSchema
>;

export const StandardMessageResponseSchema = Type.Object({
  message: Type.String(),
});

export type StandardMessageResponse = Static<
  typeof StandardMessageResponseSchema
>;

export const VerificationResponseSchema = Type.Object({
  message: Type.String(),
});

export type VerificationResponse = Static<typeof VerificationResponseSchema>;

export const LogoutSuccessResponseSchema = Type.Object({
  success: Type.Boolean(),
  message: Type.String(),
});

export type LogoutSuccessResponse = Static<typeof LogoutSuccessResponseSchema>;

export const ErrorResponseSchema = Type.Object({
  message: Type.String(),
});

export type ErrorResponse = Static<typeof ErrorResponseSchema>;

export const HealthCheckResponseSchema = Type.Object({
  status: Type.String(),
  uptime: Type.Number(),
  timestamp: Type.Number(),
});

export type HealthCheckResponse = Static<typeof HealthCheckResponseSchema>;
