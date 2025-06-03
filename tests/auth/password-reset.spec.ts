import request from "supertest";
import { buildApp } from "../../src/app";
import * as authService from "../../src/services/authService";

jest.mock("../../src/services/authService");
jest.mock("../../src/services/emailService");

const app = buildApp();
let server: any;

beforeAll(async () => {
  await app.listen({ port: 0 });
  server = app.server;
});
afterAll(async () => {
  await app.close();
});

describe("/auth/forgot-password", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should send a password reset email for a valid user", async () => {
    (authService.forgotPassword as jest.Mock).mockResolvedValue(true);
    const res = await request(server)
      .post("/auth/forgot-password")
      .send({ email: "user@example.com" });
    expect(res.status).toBe(200);
    expect(res.body.data.message).toMatch(
      /password reset email sent|you will receive a password reset link/i
    );
  });

  it("should fail for invalid email", async () => {
    const res = await request(server)
      .post("/auth/forgot-password")
      .send({ email: "not-an-email" });
    expect(res.status).toBe(400);
    expect(res.body.message || res.body.error?.message).toMatch(/email/);
  });
});

describe("/auth/reset-password", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should reset password with valid token and strong password", async () => {
    (authService.verifyTokenAndUpdatePassword as jest.Mock).mockResolvedValue(
      true
    );
    const res = await request(server)
      .post("/auth/reset-password")
      .send({ token: "valid-reset-token", password: "NewStrongPass1!" });
    expect(res.status).toBe(200);
    expect(res.body.data.message || res.body.data.success).toBeDefined();
  });

  it("should fail with invalid or expired token", async () => {
    (authService.verifyTokenAndUpdatePassword as jest.Mock).mockResolvedValue(
      false
    );
    const res = await request(server)
      .post("/auth/reset-password")
      .send({ token: "invalid-token", password: "NewStrongPass1!" });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/invalid|expired/i);
  });

  it("should fail with weak password", async () => {
    const res = await request(server)
      .post("/auth/reset-password")
      .send({ token: "valid-reset-token", password: "123" });
    expect(res.status).toBe(400);
    expect(res.body.message || res.body.error?.message).toMatch(/password/);
  });
});
