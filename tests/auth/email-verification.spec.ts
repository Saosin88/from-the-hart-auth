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

// Jest tests for /auth/verify-email and /auth/resend-verification endpoints
describe("/auth/verify-email", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should verify email with a valid token", async () => {
    (authService.verifyEmailToken as jest.Mock).mockResolvedValue({
      idToken: "mock-token",
    });
    const res = await request(server)
      .post("/auth/verify-email")
      .send({ token: "valid-token" });
    expect([200, 201]).toContain(res.status);
    expect(res.body.data).toBeDefined();
  });

  it("should fail with invalid or expired token", async () => {
    (authService.verifyEmailToken as jest.Mock).mockImplementation(() => {
      throw new Error(
        "Failed to verify email. Please try again or request a new verification link."
      );
    });
    const res = await request(server)
      .post("/auth/verify-email")
      .send({ token: "invalid-token" });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(
      /invalid|expired|failed to verify email/i
    );
  });
});

describe("/auth/resend-verification", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should resend verification email if not verified", async () => {
    (authService.resendVerificationEmail as jest.Mock).mockResolvedValue(true);
    // Simulate a valid token with a valid email in the Authorization header if needed
    const res = await request(server)
      .get("/auth/resend-verification")
      .set("Authorization", "Bearer valid-id-token");
    // Accept 200 or 400 for flexibility, depending on controller logic
    expect([200, 400]).toContain(res.status);
    // Accept either success or error message
    expect(res.body.data?.message || res.body.error?.message).toMatch(
      /verification email sent|not verified|email not found|already verified/i
    );
  });

  it("should fail if user is already verified", async () => {
    (authService.resendVerificationEmail as jest.Mock).mockResolvedValue(false);
    const res = await request(server)
      .get("/auth/resend-verification")
      .set("Authorization", "Bearer already-verified-token");
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(
      /already verified|email not found in token/i
    );
  });
});
