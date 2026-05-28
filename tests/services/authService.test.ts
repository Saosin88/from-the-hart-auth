import { describe, it, expect, beforeEach, vi } from "vitest";
import { IdentityServiceError } from "../../src/services/identityService";

// --- Hoisted mocks (available in vi.mock factories) ---

const mockCreateUser = vi.hoisted(() => vi.fn());
const mockCreateCustomToken = vi.hoisted(() => vi.fn());
const mockSetCustomUserClaims = vi.hoisted(() => vi.fn());
const mockDeleteUser = vi.hoisted(() => vi.fn());
const mockCreateIdentity = vi.hoisted(() => vi.fn());
const mockFetch = vi.hoisted(() => vi.fn());

// Duplicated inside hoisted block for vi.mock factory (can't reference imports)
const MockIdentityServiceError = vi.hoisted(() => {
  return class MockIdentityServiceError extends Error {
    public readonly statusCode: number;
    constructor(message: string, statusCode: number) {
      super(message);
      this.name = "IdentityServiceError";
      this.statusCode = statusCode;
    }
  };
});

// Module-level mocks — hoisted by vitest
vi.mock("../../src/services/firebase", () => ({
  adminAuth: vi.fn(() => ({
    createUser: mockCreateUser,
    createCustomToken: mockCreateCustomToken,
    setCustomUserClaims: mockSetCustomUserClaims,
    deleteUser: mockDeleteUser,
  })),
}));

vi.mock("../../src/services/identityService", () => ({
  createIdentity: mockCreateIdentity,
  IdentityServiceError: MockIdentityServiceError,
}));

vi.mock("../../src/services/emailService", () => ({
  sendVerificationEmail: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
}));

vi.mock("../../src/config/logger", () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.stubGlobal("fetch", mockFetch);

process.env.FIREBASE_WEB_API_KEY = "test-api-key";

// --- Constants ---

const mockUid = "test-uid-123";
const mockCustomToken = "mock-custom-token";
const mockIdToken = "mock-id-token";
const mockIdentityId = "550e8400-e29b-41d4-a716-446655440000";

function setupTokenExchangeSuccess() {
  mockFetch.mockResolvedValue({
    ok: true,
    status: 200,
    json: vi.fn().mockResolvedValue({
      idToken: mockIdToken,
      refreshToken: "mock-refresh-token",
    }),
  });
}

describe("registerPrincipal", () => {
  let registerPrincipal: typeof import("../../src/services/authService").registerPrincipal;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Default mock successes
    mockCreateUser.mockResolvedValue({ uid: mockUid });
    mockCreateIdentity.mockResolvedValue(mockIdentityId);
    mockSetCustomUserClaims.mockResolvedValue(undefined);
    mockCreateCustomToken.mockResolvedValue(mockCustomToken);
    setupTokenExchangeSuccess();

    const mod = await import("../../src/services/authService");
    registerPrincipal = mod.registerPrincipal;
  });

  // --- Happy Path ---

  it("should create Identity and set custom claims after creating Firebase user", async () => {
    await registerPrincipal("test@example.com", "SecureP@ss1");

    // Should create the Firebase user first
    expect(mockCreateUser).toHaveBeenCalledWith({
      email: "test@example.com",
      password: "SecureP@ss1",
      emailVerified: false,
    });

    // Should call createIdentity with the email (takes email + url)
    expect(mockCreateIdentity).toHaveBeenCalledWith(
      "test@example.com",
      expect.any(String),
    );

    // Should set custom claims with identities and acting_identity
    expect(mockSetCustomUserClaims).toHaveBeenCalledWith(mockUid, {
      identities: { [mockIdentityId]: ["owner"] },
      acting_identity: mockIdentityId,
    });
  });

  it("should create a custom token with no claims argument (REQ-05)", async () => {
    await registerPrincipal("test@example.com", "SecureP@ss1");

    // REQ-05: createCustomToken must NOT receive a claims argument
    expect(mockCreateCustomToken).toHaveBeenCalledWith(mockUid);
    expect(mockCreateCustomToken).toHaveBeenCalledTimes(1);
  });

  it("should return idToken on successful registration", async () => {
    const result = await registerPrincipal("test@example.com", "SecureP@ss1");

    expect(result).toEqual({ idToken: mockIdToken });
  });

  it("should log success at INFO level with identity_id", async () => {
    const { logger } = await import("../../src/config/logger");

    await registerPrincipal("test@example.com", "SecureP@ss1");

    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: "registerPrincipal",
        email: "test@example.com",
        uid: mockUid,
        identity_id: mockIdentityId,
      }),
      expect.stringContaining("Identity"),
    );
  });

  // --- Identity Failure / Rollback ---

  it("should call deleteUser and throw when Identity returns 400", async () => {
    mockCreateIdentity.mockRejectedValue(
      new IdentityServiceError("Missing required fields: email", 400),
    );

    await expect(
      registerPrincipal("test@example.com", "SecureP@ss1"),
    ).rejects.toThrow(IdentityServiceError);

    expect(mockDeleteUser).toHaveBeenCalledWith(mockUid);
  });

  it("should call deleteUser and throw when Identity returns 403", async () => {
    mockCreateIdentity.mockRejectedValue(
      new IdentityServiceError("Forbidden", 403),
    );

    await expect(
      registerPrincipal("test@example.com", "SecureP@ss1"),
    ).rejects.toThrow(IdentityServiceError);

    expect(mockDeleteUser).toHaveBeenCalledWith(mockUid);
  });

  it("should call deleteUser and throw when Identity times out", async () => {
    mockCreateIdentity.mockRejectedValue(
      new IdentityServiceError("Identity service timed out after 30000ms", 0),
    );

    await expect(
      registerPrincipal("test@example.com", "SecureP@ss1"),
    ).rejects.toThrow(IdentityServiceError);

    expect(mockDeleteUser).toHaveBeenCalledWith(mockUid);
  });

  // --- Rollback Failure ---

  it("should log rollback failure when deleteUser fails", async () => {
    const { logger } = await import("../../src/config/logger");

    mockCreateIdentity.mockRejectedValue(
      new IdentityServiceError("Service error", 500),
    );
    mockDeleteUser.mockRejectedValue(new Error("Firebase delete failed"));

    await expect(
      registerPrincipal("test@example.com", "SecureP@ss1"),
    ).rejects.toThrow(IdentityServiceError);

    // Should log the rollback error (Identity error logging is in controller)
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: "registerPrincipalRollback",
        result: "failed",
        rollbackError: "Firebase delete failed",
      }),
      expect.any(String),
    );
  });

  // --- setCustomUserClaims Failure ---

  it("should delete user when setCustomUserClaims fails after Identity creation", async () => {
    mockSetCustomUserClaims.mockRejectedValue(
      new Error("Failed to set claims"),
    );

    // setCustomUserClaims failure is a Firebase error, not IdentityServiceError
    await expect(
      registerPrincipal("test@example.com", "SecureP@ss1"),
    ).rejects.toThrow("Failed to set claims");

    // Should still try to delete the user for rollback
    expect(mockDeleteUser).toHaveBeenCalledWith(mockUid);
  });

  // --- Non-interference: Firebase errors should still propagate ---

  it("should not call Identity when createUser fails", async () => {
    mockCreateUser.mockRejectedValue(
      Object.assign(new Error("Email already in use"), {
        code: "auth/email-already-exists",
      }),
    );

    await expect(
      registerPrincipal("test@example.com", "SecureP@ss1"),
    ).rejects.toThrow("Email already in use");

    expect(mockCreateIdentity).not.toHaveBeenCalled();
    expect(mockSetCustomUserClaims).not.toHaveBeenCalled();
  });
});
