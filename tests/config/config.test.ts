import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

describe("Config - identityServiceUrl", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    delete process.env.IDENTITY_SERVICE_URL;
  });

  it("should load identityServiceUrl from IDENTITY_SERVICE_URL when set", async () => {
    process.env.IDENTITY_SERVICE_URL = "https://identity.example.com";
    const { config } = await import("../../src/config/index");
    expect(config.identityServiceUrl).toBe("https://identity.example.com");
  });

  it("should have empty string for identityServiceUrl when not set in test env", async () => {
    delete process.env.IDENTITY_SERVICE_URL;
    const { config } = await import("../../src/config/index");
    expect(config.identityServiceUrl).toBe("");
  });

  it("should throw when IDENTITY_SERVICE_URL is not set in non-test env", async () => {
    // Temporarily override NODE_ENV to simulate non-test startup
    const originalNodeEnv = process.env.NODE_ENV;
    delete process.env.IDENTITY_SERVICE_URL;
    process.env.NODE_ENV = "development";

    await expect(async () => {
      await import("../../src/config/index");
    }).rejects.toThrow(/IDENTITY_SERVICE_URL/);

    process.env.NODE_ENV = originalNodeEnv;
  });
});
