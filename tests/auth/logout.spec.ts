import request from "supertest";
import { buildApp } from "../../src/app";
import * as authService from "../../src/services/authService";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi, Mock } from "vitest";

vi.mock("../../src/services/authService");

const app = buildApp();
let server: any;

const ID_TOKEN = "valid-id-token";

function clearedCookieHeaders(res: request.Response): string {
  const header = res.headers["set-cookie"];
  expect(header).toBeDefined();
  const cookies = Array.isArray(header) ? header : [header];
  const refreshCookie = cookies.find((cookie: string) =>
    cookie.startsWith("refresh_token=")
  );
  expect(refreshCookie).toBeDefined();
  return refreshCookie as string;
}

function expectRefreshCookieCleared(cookie: string) {
  expect(cookie).toMatch(/^refresh_token=;/);
  expect(cookie).toContain("Domain=.fromthehart.tech");
  expect(cookie).toContain("Path=/auth/refresh-token");
  expect(cookie).toContain("HttpOnly");
  expect(cookie).toContain("Secure");
  expect(cookie).toContain("SameSite=None");
}

beforeAll(async () => {
  await app.listen({ port: 0 });
  server = app.server;
});
afterAll(async () => {
  await app.close();
});

describe("/auth/logout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should log out the user and clear the refresh token cookie", async () => {
    (authService.invalidateUserTokens as Mock).mockResolvedValue(true);
    const res = await request(server)
      .get("/auth/logout")
      .set("Cookie", ["refresh_token=valid-refresh-token"]);
    expect(res.status).toBe(200);
    expect(res.body.data.success).toBe(true);
    expect(res.body.data.message).toMatch(
      /logout successful|logged out successfully/i
    );
    expect(res.headers["set-cookie"]).toBeDefined();
  });

  it("revokes refresh tokens when a Bearer token is present (AC-16)", async () => {
    (authService.invalidateUserTokens as Mock).mockResolvedValue(true);

    const res = await request(server)
      .get("/auth/logout")
      .set("Authorization", `Bearer ${ID_TOKEN}`);

    expect(res.status).toBe(200);
    expect(authService.invalidateUserTokens).toHaveBeenCalledWith(ID_TOKEN);
    expect(authService.invalidateUserTokens).toHaveBeenCalledTimes(1);
    expect(res.body).toEqual({
      data: { success: true, message: "Logged out successfully" },
    });
    expectRefreshCookieCleared(clearedCookieHeaders(res));
  });

  it("skips revocation when no Bearer token is sent (AC-17)", async () => {
    const res = await request(server).get("/auth/logout");

    expect(res.status).toBe(200);
    expect(authService.invalidateUserTokens).not.toHaveBeenCalled();
    expect(res.body.data).toEqual({
      success: true,
      message: "Logged out successfully",
    });
    expectRefreshCookieCleared(clearedCookieHeaders(res));
  });

  it("still returns 200 and clears the cookie when the token is invalid (AC-17)", async () => {
    (authService.invalidateUserTokens as Mock).mockRejectedValue(
      Object.assign(new Error("ID token has expired"), {
        code: "auth/id-token-expired",
      })
    );

    const res = await request(server)
      .get("/auth/logout")
      .set("Authorization", `Bearer ${ID_TOKEN}`);

    expect(res.status).toBe(200);
    expect(authService.invalidateUserTokens).toHaveBeenCalledWith(ID_TOKEN);
    expect(res.body.data).toEqual({
      success: true,
      message: "Logged out successfully",
    });
    expectRefreshCookieCleared(clearedCookieHeaders(res));
  });

  it("logs revocation failure at WARN but still succeeds (NFR-12/13)", async () => {
    const { logger } = await import("../../src/config/logger");
    const warnSpy = vi.spyOn(logger, "warn");
    (authService.invalidateUserTokens as Mock).mockRejectedValue(
      new Error("revokeRefreshTokens outage")
    );

    const res = await request(server)
      .get("/auth/logout")
      .set("Authorization", `Bearer ${ID_TOKEN}`);

    expect(res.status).toBe(200);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({ operation: "logout" }),
      expect.any(String)
    );
    warnSpy.mockRestore();
  });
});
