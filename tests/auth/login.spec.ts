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

describe("/auth/login", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should login successfully with correct credentials", async () => {
    (authService.authenticatePrincipal as Mock).mockResolvedValue({
      idToken: "mock-token",
    });
    const res = await request(server)
      .post("/auth/login")
      .send({ email: "testuser@example.com", password: "StrongPassw0rd!" });
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty("idToken");
  });

  it("should fail with wrong password", async () => {
    (authService.authenticatePrincipal as Mock).mockResolvedValue(null);
    const res = await request(server)
      .post("/auth/login")
      .send({ email: "testuser@example.com", password: "WrongPassword" });
    expect(res.status).toBe(401);
    expect(res.body.error.message).toMatch(/invalid credentials/i);
  });

  it("should fail for non-existent user", async () => {
    (authService.authenticatePrincipal as Mock).mockResolvedValue(null);
    const res = await request(server)
      .post("/auth/login")
      .send({ email: "nouser@example.com", password: "StrongPassw0rd!" });
    expect(res.status).toBe(401);
    expect(res.body.error.message).toMatch(/invalid credentials|not found/i);
  });

  it("should fail for disabled user", async () => {
    (authService.authenticatePrincipal as Mock).mockImplementation(() => {
      const err: any = new Error("Account has been disabled");
      err.code = "auth/user-disabled";
      throw err;
    });
    const res = await request(server)
      .post("/auth/login")
      .send({ email: "disabled@example.com", password: "StrongPassw0rd!" });
    expect(res.status).toBe(403);
    expect(res.body.error.message).toMatch(/disabled/i);
  });

  it("should fail with invalid email", async () => {
    const res = await request(server)
      .post("/auth/login")
      .send({ email: "not-an-email", password: "StrongPassw0rd!" });
    expect(res.status).toBe(400);
    expect(res.body.message || res.body.error?.message).toMatch(/email/);
  });
});
