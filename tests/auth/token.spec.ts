import request from "supertest";
import { buildApp } from "../../src/app";
import * as authService from "../../src/services/authService";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  Mock,
} from "vitest";

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

describe("/auth/refresh-token", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should refresh token with valid refresh token", async () => {
    (authService.refreshPrincipalToken as Mock).mockResolvedValue({
      idToken: "mock-token",
      refreshToken: "mock-refresh",
    });
    const res = await request(server)
      .get("/auth/refresh-token")
      .set("Cookie", ["refresh_token=valid-refresh-token"]);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty("idToken");
  });

  it("should fail with invalid or expired refresh token", async () => {
    (authService.refreshPrincipalToken as Mock).mockResolvedValue(null);
    const res = await request(server)
      .get("/auth/refresh-token")
      .set("Cookie", ["refresh_token=invalid-token"]);
    expect([401, 403]).toContain(res.status);
    expect(res.body.error.message).toMatch(/invalid|expired|refresh token/i);
  });
});

describe("/auth/verify-id-token", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should verify a valid ID token", async () => {
    (authService.verifyIdToken as Mock).mockResolvedValue(true);
    const res = await request(server)
      .post("/auth/verify-id-token")
      .send({ idToken: "valid-id-token" });
    expect(res.status).toBe(200);
    expect(res.body.data.valid).toBe(true);
  });

  it("should fail with missing ID token", async () => {
    const res = await request(server)
      .post("/auth/verify-id-token")
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.message || res.body.error?.message).toMatch(
      /id token|missing|required property/i
    );
  });

  it("should fail with invalid ID token", async () => {
    (authService.verifyIdToken as Mock).mockImplementation(() => {
      throw new Error("Invalid token");
    });
    const res = await request(server)
      .post("/auth/verify-id-token")
      .send({ idToken: "invalid-token" });
    expect([400, 500]).toContain(res.status);
    expect(res.body.error.message).toMatch(/invalid|internal server error/i);
  });
});
