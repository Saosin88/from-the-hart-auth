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

describe("/auth/register", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should register a new user successfully", async () => {
    (authService.registerUser as jest.Mock).mockResolvedValue({
      idToken: "mock-token",
    });
    const res = await request(server)
      .post("/auth/register")
      .send({ email: "testuser@example.com", password: "StrongPassw0rd!" });
    expect(res.status).toBe(201);
    expect(res.body.data).toHaveProperty("idToken");
  });

  it("should fail if email is already in use", async () => {
    (authService.registerUser as jest.Mock).mockImplementation(() => {
      const err: any = new Error("Email already in use");
      err.code = "auth/email-already-exists";
      throw err;
    });
    const res = await request(server)
      .post("/auth/register")
      .send({ email: "existing@example.com", password: "StrongPassw0rd!" });
    expect([400, 409]).toContain(res.status);
    expect(res.body.error.message).toMatch(/already exists|already in use/i);
  });

  it("should fail with invalid email", async () => {
    const res = await request(server)
      .post("/auth/register")
      .send({ email: "not-an-email", password: "StrongPassw0rd!" });
    expect(res.status).toBe(400);
    // Fastify validation error message
    expect(res.body.message || res.body.error?.message).toMatch(/email/);
  });

  it("should fail with weak password", async () => {
    const res = await request(server)
      .post("/auth/register")
      .send({ email: "test2@example.com", password: "123" });
    expect(res.status).toBe(400);
    // Fastify validation error message
    expect(res.body.message || res.body.error?.message).toMatch(/password/);
  });
});
