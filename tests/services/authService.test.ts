import { describe, it, expect, beforeEach, vi } from "vitest";
import { FirebaseAuthError } from "firebase-admin/auth";
import { IdentityServiceError } from "../../src/services/identityService";
import * as jwt from "jsonwebtoken";

// --- Hoisted mocks (available in vi.mock factories) ---

const mockCreateUser = vi.hoisted(() => vi.fn());
const mockCreateCustomToken = vi.hoisted(() => vi.fn());
const mockSetCustomUserClaims = vi.hoisted(() => vi.fn());
const mockDeleteUser = vi.hoisted(() => vi.fn());
const mockCreateIdentity = vi.hoisted(() => vi.fn());
const mockFetch = vi.hoisted(() => vi.fn());
const mockVerifyIdToken = vi.hoisted(() => vi.fn());
const mockGetUser = vi.hoisted(() => vi.fn());
const mockGetUserByEmail = vi.hoisted(() => vi.fn());
const mockUpdateUser = vi.hoisted(() => vi.fn());
const mockRevokeRefreshTokens = vi.hoisted(() => vi.fn());
const mockFirestoreGet = vi.hoisted(() => vi.fn());
const mockFirestoreSet = vi.hoisted(() => vi.fn());
const mockFirestoreDelete = vi.hoisted(() => vi.fn());

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
    verifyIdToken: mockVerifyIdToken,
    getUser: mockGetUser,
    getUserByEmail: mockGetUserByEmail,
    updateUser: mockUpdateUser,
    revokeRefreshTokens: mockRevokeRefreshTokens,
  })),
  firestore: vi.fn(() => ({
    collection: vi.fn(() => ({
      doc: vi.fn(() => ({
        get: mockFirestoreGet,
        set: mockFirestoreSet,
        ref: { delete: mockFirestoreDelete },
      })),
    })),
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

describe("registration claims invariant (AC-14)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateUser.mockResolvedValue({ uid: mockUid });
    mockCreateIdentity.mockResolvedValue(mockIdentityId);
    mockSetCustomUserClaims.mockResolvedValue(undefined);
    mockCreateCustomToken.mockResolvedValue(mockCustomToken);
    setupTokenExchangeSuccess();
  });

  it("grants only owner on the new Identity — never admin, never entitlements", async () => {
    const { registerPrincipal } = await import("../../src/services/authService");

    await registerPrincipal("test@example.com", "SecureP@ss1");

    const written = mockSetCustomUserClaims.mock.calls[0]?.[1] as Record<string, unknown>;

    expect(written).toEqual({
      identities: { [mockIdentityId]: ["owner"] },
      acting_identity: mockIdentityId,
    });
    expect("entitlements" in written).toBe(false);
    expect(JSON.stringify(written)).not.toContain("admin");
    expect(Object.values(written.identities as Record<string, string[]>)).toEqual([
      ["owner"],
    ]);
  });
});

// ===========================================================================
// Access control service (Principal lookup, entitlement grant/revoke, admin gate)
// ===========================================================================
// --- Constants ---

const CALLER_UID = "caller-uid-123";
const ADMIN_IDENTITY = "550e8400-e29b-41d4-a716-446655440000";
const OTHER_IDENTITY = "660e8400-e29b-41d4-a716-446655440111";
const ID_TOKEN = "mock-id-token";

function adminToken(overrides: Record<string, unknown> = {}) {
  return {
    uid: CALLER_UID,
    identities: { [ADMIN_IDENTITY]: ["owner", "admin"] },
    acting_identity: ADMIN_IDENTITY,
    ...overrides,
  };
}

describe("verifyAdminCaller", () => {
  let verifyAdminCaller: typeof import("../../src/services/authService").verifyAdminCaller;
  let AdminAuthorizationError: typeof import("../../src/services/authService").AdminAuthorizationError;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockVerifyIdToken.mockResolvedValue(adminToken());

    const mod = await import("../../src/services/authService");
    verifyAdminCaller = mod.verifyAdminCaller;
    AdminAuthorizationError = mod.AdminAuthorizationError;
  });

  it("returns the caller uid and acting identity for an admin token", async () => {
    await expect(verifyAdminCaller(ID_TOKEN, "lookupPrincipal")).resolves.toEqual({
      uid: CALLER_UID,
      actingIdentity: ADMIN_IDENTITY,
    });
  });

  it("crypto-verifies the bearer token via verifyIdToken (REQ-01)", async () => {
    await verifyAdminCaller(ID_TOKEN, "lookupPrincipal");
    expect(mockVerifyIdToken).toHaveBeenCalledWith(ID_TOKEN);
    expect(mockVerifyIdToken).toHaveBeenCalledTimes(1);
  });

  it("throws AdminAuthorizationError when the acting identity lacks admin", async () => {
    mockVerifyIdToken.mockResolvedValue(
      adminToken({ identities: { [ADMIN_IDENTITY]: ["owner"] } })
    );

    await expect(verifyAdminCaller(ID_TOKEN, "lookupPrincipal")).rejects.toThrow(
      AdminAuthorizationError
    );
  });

  it("throws AdminAuthorizationError when acting_identity is missing", async () => {
    mockVerifyIdToken.mockResolvedValue(
      adminToken({ acting_identity: undefined })
    );

    await expect(verifyAdminCaller(ID_TOKEN, "lookupPrincipal")).rejects.toThrow(
      AdminAuthorizationError
    );
  });

  it("throws AdminAuthorizationError when acting_identity is not in identities", async () => {
    mockVerifyIdToken.mockResolvedValue(adminToken({ acting_identity: OTHER_IDENTITY }));

    await expect(verifyAdminCaller(ID_TOKEN, "lookupPrincipal")).rejects.toThrow(
      AdminAuthorizationError
    );
  });

  it("denies an admin acting as a non-admin identity (REQ-04)", async () => {
    mockVerifyIdToken.mockResolvedValue(
      adminToken({
        identities: {
          [ADMIN_IDENTITY]: ["owner", "admin"],
          [OTHER_IDENTITY]: ["owner"],
        },
        acting_identity: OTHER_IDENTITY,
      })
    );

    await expect(verifyAdminCaller(ID_TOKEN, "lookupPrincipal")).rejects.toThrow(
      AdminAuthorizationError
    );
  });

  it("names the error AdminAuthorizationError", async () => {
    mockVerifyIdToken.mockResolvedValue(adminToken({ acting_identity: undefined }));

    await expect(verifyAdminCaller(ID_TOKEN, "lookupPrincipal")).rejects.toMatchObject({
      name: "AdminAuthorizationError",
    });
  });

  it("propagates expiry/revocation failures from verifyIdToken (401 path)", async () => {
    mockVerifyIdToken.mockRejectedValue(
      new FirebaseAuthError({ code: "id-token-expired", message: "expired" })
    );

    await expect(verifyAdminCaller(ID_TOKEN, "lookupPrincipal")).rejects.toMatchObject({
      code: "auth/id-token-expired",
    });
  });

  it("logs a WARN with operation, caller uid and reason on denial (NFR-10)", async () => {
    const { logger } = await import("../../src/config/logger");
    mockVerifyIdToken.mockResolvedValue(
      adminToken({ identities: { [ADMIN_IDENTITY]: ["owner"] } })
    );

    await expect(
      verifyAdminCaller(ID_TOKEN, "grantEntitlement")
    ).rejects.toThrow(AdminAuthorizationError);

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: "grantEntitlement",
        uid: CALLER_UID,
        reason: "not admin",
      }),
      expect.any(String)
    );
  });

  it("fails closed with no side effects (no target lookups) on denial", async () => {
    mockVerifyIdToken.mockResolvedValue(adminToken({ acting_identity: undefined }));

    await expect(verifyAdminCaller(ID_TOKEN, "lookupPrincipal")).rejects.toThrow(
      AdminAuthorizationError
    );

    expect(mockGetUser).not.toHaveBeenCalled();
    expect(mockGetUserByEmail).not.toHaveBeenCalled();
    expect(mockSetCustomUserClaims).not.toHaveBeenCalled();
  });
});

// --- Target Principal fixtures ---

const TARGET_UID = "target-uid-456";
const TARGET_IDENTITY = "770e8400-e29b-41d4-a716-446655440222";

function targetClaims(overrides: Record<string, unknown> = {}) {
  return {
    identities: { [TARGET_IDENTITY]: ["owner"] },
    acting_identity: TARGET_IDENTITY,
    ...overrides,
  };
}

function mockTargetWithClaims(claims: Record<string, unknown> | undefined) {
  mockGetUser.mockResolvedValue({ uid: TARGET_UID, customClaims: claims });
}

describe("grantEntitlement", () => {
  let grantEntitlement: typeof import("../../src/services/authService").grantEntitlement;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockVerifyIdToken.mockResolvedValue(adminToken());
    mockGetUser.mockResolvedValue({
      uid: TARGET_UID,
      customClaims: targetClaims(),
    });
    mockSetCustomUserClaims.mockResolvedValue(undefined);

    const mod = await import("../../src/services/authService");
    grantEntitlement = mod.grantEntitlement;
  });

  it("adds the entitlement and returns the grant (AC-06)", async () => {
    const result = await grantEntitlement(ID_TOKEN, TARGET_UID, "storage");

    expect(result).toEqual({ principal_uid: TARGET_UID, entitlement: "storage" });
    expect(mockSetCustomUserClaims).toHaveBeenCalledWith(TARGET_UID, {
      identities: { [TARGET_IDENTITY]: ["owner"] },
      acting_identity: TARGET_IDENTITY,
      entitlements: ["storage"],
    });
  });

  it("preserves existing entitlements and unrelated claims (read-merge-write)", async () => {
    mockGetUser.mockResolvedValue({
      uid: TARGET_UID,
      customClaims: targetClaims({
        entitlements: ["beta"],
        some_other_claim: "kept",
      }),
    });

    await grantEntitlement(ID_TOKEN, TARGET_UID, "storage");

    expect(mockSetCustomUserClaims).toHaveBeenCalledWith(TARGET_UID, {
      identities: { [TARGET_IDENTITY]: ["owner"] },
      acting_identity: TARGET_IDENTITY,
      entitlements: ["beta", "storage"],
      some_other_claim: "kept",
    });
  });

  it("is idempotent when the target already has the entitlement (AC-11)", async () => {
    mockGetUser.mockResolvedValue({
      uid: TARGET_UID,
      customClaims: targetClaims({ entitlements: ["storage"] }),
    });

    const result = await grantEntitlement(ID_TOKEN, TARGET_UID, "storage");

    expect(result).toEqual({ principal_uid: TARGET_UID, entitlement: "storage" });
    expect(mockSetCustomUserClaims).toHaveBeenCalledWith(TARGET_UID, {
      identities: { [TARGET_IDENTITY]: ["owner"] },
      acting_identity: TARGET_IDENTITY,
      entitlements: ["storage"],
    });
  });

  it("accepts free-form entitlement values (AC-10)", async () => {
    await grantEntitlement(ID_TOKEN, TARGET_UID, "arbitrary-value");
    expect(mockSetCustomUserClaims).toHaveBeenCalledWith(
      TARGET_UID,
      expect.objectContaining({ entitlements: ["arbitrary-value"] })
    );
  });

  it("rejects a target whose claims would break the acting_identity invariant (REQ-03)", async () => {
    mockTargetWithClaims(undefined);

    await expect(grantEntitlement(ID_TOKEN, TARGET_UID, "storage")).rejects.toThrow(
      /acting_identity/i
    );
    expect(mockSetCustomUserClaims).not.toHaveBeenCalled();
  });

  it("propagates auth/user-not-found for an unknown target (AC-08)", async () => {
    mockGetUser.mockRejectedValue(
      new FirebaseAuthError({ code: "user-not-found", message: "no user" })
    );

    await expect(grantEntitlement(ID_TOKEN, TARGET_UID, "storage")).rejects.toMatchObject({
      code: "auth/user-not-found",
    });
    expect(mockSetCustomUserClaims).not.toHaveBeenCalled();
  });

  it("rejects a non-admin caller before touching the target (AC-07)", async () => {
    mockVerifyIdToken.mockResolvedValue(
      adminToken({ identities: { [ADMIN_IDENTITY]: ["owner"] } })
    );

    await expect(
      grantEntitlement(ID_TOKEN, TARGET_UID, "storage")
    ).rejects.toMatchObject({ name: "AdminAuthorizationError" });

    expect(mockGetUser).not.toHaveBeenCalled();
    expect(mockSetCustomUserClaims).not.toHaveBeenCalled();
  });

  it("does not revoke refresh tokens for entitlement changes (REQ-15)", async () => {
    await grantEntitlement(ID_TOKEN, TARGET_UID, "storage");
    expect(mockRevokeRefreshTokens).not.toHaveBeenCalled();
  });

  it("logs the grant at INFO with the required fields (NFR-09)", async () => {
    const { logger } = await import("../../src/config/logger");

    await grantEntitlement(ID_TOKEN, TARGET_UID, "storage");

    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: "grantEntitlement",
        uid: CALLER_UID,
        acting_identity: ADMIN_IDENTITY,
        principal_uid: TARGET_UID,
        entitlement: "storage",
      }),
      expect.any(String)
    );
  });

  it("propagates unexpected Firebase errors from the write (500 path)", async () => {
    mockSetCustomUserClaims.mockRejectedValue(new Error("firebase outage"));

    await expect(grantEntitlement(ID_TOKEN, TARGET_UID, "storage")).rejects.toThrow(
      "firebase outage"
    );
  });
});

describe("revokeEntitlement", () => {
  let revokeEntitlement: typeof import("../../src/services/authService").revokeEntitlement;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockVerifyIdToken.mockResolvedValue(adminToken());
    mockGetUser.mockResolvedValue({
      uid: TARGET_UID,
      customClaims: targetClaims({ entitlements: ["beta", "storage"] }),
    });
    mockSetCustomUserClaims.mockResolvedValue(undefined);

    const mod = await import("../../src/services/authService");
    revokeEntitlement = mod.revokeEntitlement;
  });

  it("removes the entitlement and returns the revoke", async () => {
    const result = await revokeEntitlement(ID_TOKEN, TARGET_UID, "storage");

    expect(result).toEqual({ principal_uid: TARGET_UID, entitlement: "storage" });
    expect(mockSetCustomUserClaims).toHaveBeenCalledWith(TARGET_UID, {
      identities: { [TARGET_IDENTITY]: ["owner"] },
      acting_identity: TARGET_IDENTITY,
      entitlements: ["beta"],
    });
  });

  it("drops the entitlements claim when the last entitlement is revoked (AC-13)", async () => {
    mockGetUser.mockResolvedValue({
      uid: TARGET_UID,
      customClaims: targetClaims({ entitlements: ["storage"] }),
    });

    await revokeEntitlement(ID_TOKEN, TARGET_UID, "storage");

    const written = mockSetCustomUserClaims.mock.calls[0][1] as Record<string, unknown>;
    expect("entitlements" in written).toBe(false);
    expect(written).toEqual({
      identities: { [TARGET_IDENTITY]: ["owner"] },
      acting_identity: TARGET_IDENTITY,
    });
  });

  it("is idempotent when revoking an absent entitlement (AC-12)", async () => {
    mockGetUser.mockResolvedValue({
      uid: TARGET_UID,
      customClaims: targetClaims({ entitlements: ["beta"] }),
    });

    const result = await revokeEntitlement(ID_TOKEN, TARGET_UID, "storage");

    expect(result).toEqual({ principal_uid: TARGET_UID, entitlement: "storage" });
    expect(mockSetCustomUserClaims).toHaveBeenCalledWith(TARGET_UID, {
      identities: { [TARGET_IDENTITY]: ["owner"] },
      acting_identity: TARGET_IDENTITY,
      entitlements: ["beta"],
    });
  });

  it("propagates auth/user-not-found for an unknown target (AC-08)", async () => {
    mockGetUser.mockRejectedValue(
      new FirebaseAuthError({ code: "user-not-found", message: "no user" })
    );

    await expect(
      revokeEntitlement(ID_TOKEN, TARGET_UID, "storage")
    ).rejects.toMatchObject({ code: "auth/user-not-found" });
    expect(mockSetCustomUserClaims).not.toHaveBeenCalled();
  });

  it("rejects a non-admin caller before touching the target (AC-07)", async () => {
    mockVerifyIdToken.mockResolvedValue(adminToken({ acting_identity: undefined }));

    await expect(
      revokeEntitlement(ID_TOKEN, TARGET_UID, "storage")
    ).rejects.toMatchObject({ name: "AdminAuthorizationError" });

    expect(mockGetUser).not.toHaveBeenCalled();
    expect(mockSetCustomUserClaims).not.toHaveBeenCalled();
  });

  it("does not revoke refresh tokens for entitlement changes (REQ-15)", async () => {
    await revokeEntitlement(ID_TOKEN, TARGET_UID, "storage");
    expect(mockRevokeRefreshTokens).not.toHaveBeenCalled();
  });

  it("logs the revoke at INFO with the required fields (NFR-09)", async () => {
    const { logger } = await import("../../src/config/logger");

    await revokeEntitlement(ID_TOKEN, TARGET_UID, "storage");

    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: "revokeEntitlement",
        uid: CALLER_UID,
        acting_identity: ADMIN_IDENTITY,
        principal_uid: TARGET_UID,
        entitlement: "storage",
      }),
      expect.any(String)
    );
  });
});

describe("lookupPrincipal", () => {
  let lookupPrincipal: typeof import("../../src/services/authService").lookupPrincipal;

  const EMAIL = "friend@gmail.com";

  beforeEach(async () => {
    vi.clearAllMocks();
    mockVerifyIdToken.mockResolvedValue(adminToken());
    mockGetUserByEmail.mockResolvedValue({ uid: TARGET_UID, email: EMAIL });

    const mod = await import("../../src/services/authService");
    lookupPrincipal = mod.lookupPrincipal;
  });

  it("resolves an email to a principal_uid (AC-01)", async () => {
    await expect(lookupPrincipal(ID_TOKEN, EMAIL)).resolves.toEqual({
      principal_uid: TARGET_UID,
    });
  });

  it("returns only principal_uid (REQ-08)", async () => {
    const result = await lookupPrincipal(ID_TOKEN, EMAIL);
    expect(Object.keys(result)).toEqual(["principal_uid"]);
  });

  it("delegates case handling to getUserByEmail (EC-22)", async () => {
    await lookupPrincipal(ID_TOKEN, "Friend@Gmail.com");
    expect(mockGetUserByEmail).toHaveBeenCalledWith("Friend@Gmail.com");
  });

  it("propagates auth/user-not-found for an unknown email (AC-02)", async () => {
    mockGetUserByEmail.mockRejectedValue(
      new FirebaseAuthError({ code: "user-not-found", message: "no user" })
    );

    await expect(lookupPrincipal(ID_TOKEN, EMAIL)).rejects.toMatchObject({
      code: "auth/user-not-found",
    });
  });

  it("rejects a non-admin caller without resolving the email (AC-04)", async () => {
    mockVerifyIdToken.mockResolvedValue(
      adminToken({ identities: { [ADMIN_IDENTITY]: ["owner", "admin"] }, acting_identity: OTHER_IDENTITY })
    );

    await expect(lookupPrincipal(ID_TOKEN, EMAIL)).rejects.toMatchObject({
      name: "AdminAuthorizationError",
    });
    expect(mockGetUserByEmail).not.toHaveBeenCalled();
  });

  it("propagates verifyIdToken failures (AC-03)", async () => {
    mockVerifyIdToken.mockRejectedValue(
      new FirebaseAuthError({ code: "invalid-id-token", message: "invalid" })
    );

    await expect(lookupPrincipal(ID_TOKEN, EMAIL)).rejects.toMatchObject({
      code: "auth/invalid-id-token",
    });
    expect(mockGetUserByEmail).not.toHaveBeenCalled();
  });

  it("logs the lookup at INFO with caller uid and email (NFR-11)", async () => {
    const { logger } = await import("../../src/config/logger");

    await lookupPrincipal(ID_TOKEN, EMAIL);

    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: "lookupPrincipal",
        uid: CALLER_UID,
        email: EMAIL,
      }),
      expect.any(String)
    );
  });

  it("logs a not-found lookup at INFO, not ERROR (NFR-11)", async () => {
    const { logger } = await import("../../src/config/logger");
    mockGetUserByEmail.mockRejectedValue(
      new FirebaseAuthError({ code: "user-not-found", message: "no user" })
    );

    await expect(lookupPrincipal(ID_TOKEN, EMAIL)).rejects.toMatchObject({
      code: "auth/user-not-found",
    });

    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: "lookupPrincipal",
        uid: CALLER_UID,
        email: EMAIL,
        result: "not_found",
      }),
      expect.any(String)
    );
  });

  it("propagates unexpected Firebase errors (500 path)", async () => {
    mockGetUserByEmail.mockRejectedValue(new Error("firebase outage"));
    await expect(lookupPrincipal(ID_TOKEN, EMAIL)).rejects.toThrow("firebase outage");
  });
});

// ===========================================================================
// Unit coverage for the pre-existing auth flows (login, logout revocation,
// email verification, password reset, token refresh, verify). These raise
// authService.ts coverage and act as the safety net for the upcoming
// refactors (typed return values, controller error-mapping).
// ===========================================================================

describe("authenticatePrincipal", () => {
  let authenticatePrincipal: typeof import("../../src/services/authService").authenticatePrincipal;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({
        localId: mockUid,
        idToken: mockIdToken,
        refreshToken: "mock-refresh-token",
      }),
    });
    const mod = await import("../../src/services/authService");
    authenticatePrincipal = mod.authenticatePrincipal;
  });

  it("returns idToken without refreshToken by default", async () => {
    await expect(
      authenticatePrincipal("test@example.com", "Password123!")
    ).resolves.toEqual({ idToken: mockIdToken });
  });

  it("includes refreshToken when requested", async () => {
    await expect(
      authenticatePrincipal("test@example.com", "Password123!", true)
    ).resolves.toEqual({ idToken: mockIdToken, refreshToken: "mock-refresh-token" });
  });

  it("propagates the Firebase auth error on invalid credentials", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 400,
      json: vi.fn().mockResolvedValue({ error: { message: "INVALID_PASSWORD" } }),
    });
    await expect(authenticatePrincipal("test@example.com", "wrong")).rejects.toThrow();
  });
});

describe("refreshPrincipalToken", () => {
  let refreshPrincipalToken: typeof import("../../src/services/authService").refreshPrincipalToken;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({
        id_token: "new-id-token",
        refresh_token: "new-refresh-token",
      }),
    });
    const mod = await import("../../src/services/authService");
    refreshPrincipalToken = mod.refreshPrincipalToken;
  });

  it("returns the rotated idToken and refreshToken", async () => {
    await expect(refreshPrincipalToken("old-refresh")).resolves.toEqual({
      idToken: "new-id-token",
      refreshToken: "new-refresh-token",
    });
  });

  it("propagates the refresh failure", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 400,
      json: vi.fn().mockResolvedValue({ error: { message: "INVALID_REFRESH_TOKEN" } }),
    });
    await expect(refreshPrincipalToken("old-refresh")).rejects.toThrow();
  });
});

describe("verifyIdToken", () => {
  let verifyIdToken: typeof import("../../src/services/authService").verifyIdToken;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import("../../src/services/authService");
    verifyIdToken = mod.verifyIdToken;
  });

  it("returns true when the token verifies", async () => {
    mockVerifyIdToken.mockResolvedValue({ uid: mockUid });
    await expect(verifyIdToken("token")).resolves.toBe(true);
  });

  it("returns false when verification fails", async () => {
    mockVerifyIdToken.mockRejectedValue(new Error("invalid token"));
    await expect(verifyIdToken("token")).resolves.toBe(false);
  });
});

describe("invalidateUserTokens", () => {
  let invalidateUserTokens: typeof import("../../src/services/authService").invalidateUserTokens;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import("../../src/services/authService");
    invalidateUserTokens = mod.invalidateUserTokens;
  });

  it("revokes refresh tokens for the verified uid", async () => {
    mockVerifyIdToken.mockResolvedValue({ uid: mockUid });
    await expect(invalidateUserTokens("token")).resolves.toBe(mockUid);
    expect(mockRevokeRefreshTokens).toHaveBeenCalledWith(mockUid);
  });

  it("returns null when the token carries no uid", async () => {
    mockVerifyIdToken.mockResolvedValue({});
    await expect(invalidateUserTokens("token")).resolves.toBe(null);
    expect(mockRevokeRefreshTokens).not.toHaveBeenCalled();
  });
});

describe("forgotPassword", () => {
  let forgotPassword: typeof import("../../src/services/authService").forgotPassword;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockGetUserByEmail.mockResolvedValue({ uid: mockUid });
    const mod = await import("../../src/services/authService");
    forgotPassword = mod.forgotPassword;
  });

  it("stores a reset key and sends the reset email", async () => {
    await expect(forgotPassword("test@example.com")).resolves.toBe(true);
    expect(mockFirestoreSet).toHaveBeenCalled();
    const { sendPasswordResetEmail } = await import("../../src/services/emailService");
    expect(sendPasswordResetEmail).toHaveBeenCalled();
  });
});

describe("resendVerificationEmail", () => {
  let resendVerificationEmail: typeof import("../../src/services/authService").resendVerificationEmail;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import("../../src/services/authService");
    resendVerificationEmail = mod.resendVerificationEmail;
  });

  it("sends a verification email when the Principal is unverified", async () => {
    mockGetUserByEmail.mockResolvedValue({ uid: mockUid, emailVerified: false });
    await expect(resendVerificationEmail("test@example.com")).resolves.toBe(true);
    const { sendVerificationEmail } = await import("../../src/services/emailService");
    expect(sendVerificationEmail).toHaveBeenCalled();
  });

  it("returns false without sending when already verified", async () => {
    mockGetUserByEmail.mockResolvedValue({ uid: mockUid, emailVerified: true });
    await expect(resendVerificationEmail("test@example.com")).resolves.toBe(false);
    const { sendVerificationEmail } = await import("../../src/services/emailService");
    expect(sendVerificationEmail).not.toHaveBeenCalled();
  });
});

describe("verifyEmailToken", () => {
  let verifyEmailToken: typeof import("../../src/services/authService").verifyEmailToken;
  const email = "test@example.com";
  const key = "test-verify-key";

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import("../../src/services/authService");
    verifyEmailToken = mod.verifyEmailToken;
  });

  it("verifies, marks email verified, revokes, and returns a fresh idToken", async () => {
    const token = jwt.sign({ email }, key, { expiresIn: "24h" });
    mockFirestoreGet.mockResolvedValue({
      exists: true,
      data: () => ({ key, uid: mockUid }),
      ref: { delete: mockFirestoreDelete },
    });
    mockUpdateUser.mockResolvedValue(undefined);
    mockRevokeRefreshTokens.mockResolvedValue(undefined);
    mockCreateCustomToken.mockResolvedValue(mockCustomToken);
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ idToken: mockIdToken, refreshToken: "mock-refresh" }),
    });

    await expect(verifyEmailToken(token)).resolves.toEqual({ idToken: mockIdToken });
    expect(mockUpdateUser).toHaveBeenCalledWith(mockUid, { emailVerified: true });
    expect(mockRevokeRefreshTokens).toHaveBeenCalledWith(mockUid);
    expect(mockFirestoreDelete).toHaveBeenCalled();
  });

  it("throws when the verification key document is missing", async () => {
    const token = jwt.sign({ email }, key, { expiresIn: "24h" });
    mockFirestoreGet.mockResolvedValue({ exists: false, data: () => undefined });
    await expect(verifyEmailToken(token)).rejects.toThrow("Verification key not found");
  });

  it("throws when the token has no email", async () => {
    await expect(verifyEmailToken("not-a-jwt")).rejects.toThrow("Invalid token format");
  });
});

describe("verifyTokenAndUpdatePassword", () => {
  let verifyTokenAndUpdatePassword: typeof import("../../src/services/authService").verifyTokenAndUpdatePassword;
  const email = "test@example.com";
  const key = "test-reset-key";

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import("../../src/services/authService");
    verifyTokenAndUpdatePassword = mod.verifyTokenAndUpdatePassword;
  });

  it("updates the password, revokes, and returns true", async () => {
    const token = jwt.sign({ email }, key, { expiresIn: "1h" });
    mockFirestoreGet.mockResolvedValue({
      exists: true,
      data: () => ({ key, uid: mockUid }),
      ref: { delete: mockFirestoreDelete },
    });
    mockUpdateUser.mockResolvedValue(undefined);
    mockRevokeRefreshTokens.mockResolvedValue(undefined);

    await expect(verifyTokenAndUpdatePassword(token, "NewPassword123!")).resolves.toBe(true);
    expect(mockUpdateUser).toHaveBeenCalledWith(mockUid, { password: "NewPassword123!" });
    expect(mockRevokeRefreshTokens).toHaveBeenCalledWith(mockUid);
    expect(mockFirestoreDelete).toHaveBeenCalled();
  });

  it("returns false when the reset key document is missing", async () => {
    const token = jwt.sign({ email }, key, { expiresIn: "1h" });
    mockFirestoreGet.mockResolvedValue({ exists: false, data: () => undefined });
    await expect(verifyTokenAndUpdatePassword(token, "NewPassword123!")).resolves.toBe(false);
  });
});
