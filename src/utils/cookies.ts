import type { FastifyReply } from "fastify";

/**
 * Single source of truth for the refresh-token cookie attributes.
 *
 * `setRefreshTokenCookie` and `clearRefreshTokenCookie` MUST use the same
 * `domain`/`path`/`sameSite` values — a mismatch makes `clearCookie` silently
 * fail to remove the cookie. Keeping them in one constant prevents drift.
 */
export const REFRESH_TOKEN_COOKIE_OPTIONS = {
  domain: ".fromthehart.tech",
  path: "/auth/refresh-token",
  secure: true,
  httpOnly: true,
  sameSite: "none",
} as const;

export const REFRESH_TOKEN_MAX_AGE_SECONDS = 30 * 24 * 60 * 60; // 30 days

export function setRefreshTokenCookie(
  reply: FastifyReply,
  token: string
): void {
  reply.setCookie("refresh_token", token, {
    ...REFRESH_TOKEN_COOKIE_OPTIONS,
    maxAge: REFRESH_TOKEN_MAX_AGE_SECONDS,
    priority: "high",
  });
}

export function clearRefreshTokenCookie(reply: FastifyReply): void {
  reply.clearCookie("refresh_token", {
    ...REFRESH_TOKEN_COOKIE_OPTIONS,
    priority: "low",
  });
}
