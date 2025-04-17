import { Type, Static } from "@fastify/type-provider-typebox";

export const AuthResponseSchema = Type.Object({
  idToken: Type.String(),
  refreshToken: Type.String(),
});

export type AuthResponse = Static<typeof AuthResponseSchema>;

export const UserCredentialsSchema = Type.Object({
  email: Type.String({ format: "email" }),
  password: Type.String(),
});

export type UserCredentials = Static<typeof UserCredentialsSchema>;

export const UserRegistrationSchema = Type.Object({
  email: Type.String({ format: "email" }),
  password: Type.String(),
});

export type UserRegistration = Static<typeof UserRegistrationSchema>;

export const PasswordResetSchema = Type.Object({
  email: Type.String({ format: "email" }),
});

export type PasswordReset = Static<typeof PasswordResetSchema>;

export const PasswordUpdateSchema = Type.Object({
  password: Type.String(),
  resetToken: Type.String(),
});

export type PasswordUpdate = Static<typeof PasswordUpdateSchema>;

export const EmailVerificationSchema = Type.Object({
  email: Type.String({ format: "email" }),
});

export type EmailVerification = Static<typeof EmailVerificationSchema>;
