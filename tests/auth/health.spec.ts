import request from "supertest";
import { buildApp } from "../../src/app";

const app = buildApp();
let server: any;

beforeAll(async () => {
  await app.listen({ port: 0 });
  server = app.server;
});
afterAll(async () => {
  await app.close();
});

// Jest tests for /auth/health endpoint
describe("/auth/health", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should return service health status", async () => {
    const res = await request(server).get("/auth/health");
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("ok");
    expect(res.body.data).toHaveProperty("uptime");
    expect(res.body.data).toHaveProperty("timestamp");
  });
});
