import request from "supertest";
import { buildApp } from "../../src/app";
import * as authService from "../../src/services/authService";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi, Mock } from "vitest";

vi.mock("../../src/services/authService");

const app = buildApp();
let server: any;

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
});
