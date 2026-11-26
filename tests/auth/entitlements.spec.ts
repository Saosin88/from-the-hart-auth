import request from "supertest";
import { buildApp } from "../../src/app";
import * as authService from "../../src/services/authService";
import { FirebaseAuthError } from "firebase-admin/auth";
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

vi.mock("../../src/services/authService", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("../../src/services/authService")
  >();
  return {
    AdminAuthorizationError: actual.AdminAuthorizationError,
    verifyAdminCaller: vi.fn(),
    lookupPrincipal: vi.fn(),
    grantEntitlement: vi.fn(),
    revokeEntitlement: vi.fn(),
  };
});

const app = buildApp();
let server: any;

const ID_TOKEN = "valid-id-token";
const PRINCIPAL_UID = "target-uid-123";

function adminAuth() {
  return { Authorization: `Bearer ${ID_TOKEN}` };
}

beforeAll(async () => {
  await app.listen({ port: 0 });
  server = app.server;
});
afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /auth/entitlements", () => {
  it("grants an entitlement and returns data (AC-06)", async () => {
    (authService.grantEntitlement as Mock).mockResolvedValue({
      principal_uid: PRINCIPAL_UID,
      entitlement: "storage",
    });

    const res = await request(server)
      .post("/auth/entitlements")
      .set(adminAuth())
      .send({ principal_uid: PRINCIPAL_UID, entitlement: "storage" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      data: { principal_uid: PRINCIPAL_UID, entitlement: "storage" },
    });
    expect(authService.grantEntitlement).toHaveBeenCalledWith(
      ID_TOKEN,
      PRINCIPAL_UID,
      "storage"
    );
  });

  it("trims surrounding whitespace before storing (AC-10)", async () => {
    (authService.grantEntitlement as Mock).mockResolvedValue({
      principal_uid: PRINCIPAL_UID,
      entitlement: "storage",
    });

    const res = await request(server)
      .post("/auth/entitlements")
      .set(adminAuth())
      .send({ principal_uid: PRINCIPAL_UID, entitlement: "  storage  " });

    expect(res.status).toBe(200);
    expect(authService.grantEntitlement).toHaveBeenCalledWith(
      ID_TOKEN,
      PRINCIPAL_UID,
      "storage"
    );
  });

  it("rejects a whitespace-only entitlement with 400 and no side effects (AC-09)", async () => {
    const res = await request(server)
      .post("/auth/entitlements")
      .set(adminAuth())
      .send({ principal_uid: PRINCIPAL_UID, entitlement: "   " });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toBeDefined();
    expect(authService.grantEntitlement).not.toHaveBeenCalled();
  });

  it("rejects a missing entitlement field with 400", async () => {
    const res = await request(server)
      .post("/auth/entitlements")
      .set(adminAuth())
      .send({ principal_uid: PRINCIPAL_UID });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toBeDefined();
    expect(authService.grantEntitlement).not.toHaveBeenCalled();
  });

  it("rejects an empty principal_uid with 400", async () => {
    const res = await request(server)
      .post("/auth/entitlements")
      .set(adminAuth())
      .send({ principal_uid: "", entitlement: "storage" });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toBeDefined();
  });

  it("returns 401 without an Authorization header (AC-03/AC-19)", async () => {
    const res = await request(server)
      .post("/auth/entitlements")
      .send({ principal_uid: PRINCIPAL_UID, entitlement: "storage" });

    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe("Unauthorized");
  });

  it("returns 401 when the ID token fails verification", async () => {
    (authService.grantEntitlement as Mock).mockRejectedValue(
      new FirebaseAuthError({ code: "id-token-expired", message: "expired" })
    );

    const res = await request(server)
      .post("/auth/entitlements")
      .set(adminAuth())
      .send({ principal_uid: PRINCIPAL_UID, entitlement: "storage" });

    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe("Unauthorized");
  });

  it("returns 403 when the caller is not an admin (AC-07)", async () => {
    (authService.grantEntitlement as Mock).mockRejectedValue(
      new authService.AdminAuthorizationError("Forbidden")
    );

    const res = await request(server)
      .post("/auth/entitlements")
      .set(adminAuth())
      .send({ principal_uid: PRINCIPAL_UID, entitlement: "storage" });

    expect(res.status).toBe(403);
    expect(res.body.error.message).toBe("Forbidden");
  });

  it("returns 404 when the target Principal does not exist (AC-08)", async () => {
    (authService.grantEntitlement as Mock).mockRejectedValue(
      new FirebaseAuthError({ code: "user-not-found", message: "no user" })
    );

    const res = await request(server)
      .post("/auth/entitlements")
      .set(adminAuth())
      .send({ principal_uid: PRINCIPAL_UID, entitlement: "storage" });

    expect(res.status).toBe(404);
    expect(res.body.error.message).toBe("Principal not found");
  });

  it("returns 400 for an invalid principal_uid (EC-25)", async () => {
    (authService.grantEntitlement as Mock).mockRejectedValue(
      new FirebaseAuthError({ code: "invalid-uid", message: "bad uid" })
    );

    const res = await request(server)
      .post("/auth/entitlements")
      .set(adminAuth())
      .send({ principal_uid: PRINCIPAL_UID, entitlement: "storage" });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe("Invalid principal_uid");
  });

  it("returns 500 with a generic message for unexpected errors (NFR-14)", async () => {
    (authService.grantEntitlement as Mock).mockRejectedValue(
      new Error("firebase outage: secret detail")
    );

    const res = await request(server)
      .post("/auth/entitlements")
      .set(adminAuth())
      .send({ principal_uid: PRINCIPAL_UID, entitlement: "storage" });

    expect(res.status).toBe(500);
    expect(res.body.error.message).toBe("Internal server error");
  });

  it("returns 400 with the service envelope for malformed JSON (AC-19)", async () => {
    const res = await request(server)
      .post("/auth/entitlements")
      .set("Content-Type", "application/json")
      .send("{not-json");

    expect(res.status).toBe(400);
    expect(res.body.error.message).toBeDefined();
    expect(res.body.statusCode).toBeUndefined();
  });

  it("returns 400 with the service envelope when a text/plain body fails object validation (AC-19)", async () => {
    const res = await request(server)
      .post("/auth/entitlements")
      .set(adminAuth())
      .set("Content-Type", "text/plain")
      .send("principal_uid=x");

    expect(res.status).toBe(400);
    expect(res.body.error.message).toBeDefined();
    expect(res.body.statusCode).toBeUndefined();
    expect(authService.grantEntitlement).not.toHaveBeenCalled();
  });

  it("returns 415 with the service envelope for an unsupported Content-Type (AC-19)", async () => {
    const res = await request(server)
      .post("/auth/entitlements")
      .set(adminAuth())
      .set("Content-Type", "application/xml")
      .send("<principal_uid>x</principal_uid>");

    expect(res.status).toBe(415);
    expect(res.body.error.message).toBeDefined();
    expect(res.body.statusCode).toBeUndefined();
    expect(authService.grantEntitlement).not.toHaveBeenCalled();
  });
});

describe("POST /auth/entitlements/revoke", () => {
  it("revokes an entitlement and returns data (AC-12)", async () => {
    (authService.revokeEntitlement as Mock).mockResolvedValue({
      principal_uid: PRINCIPAL_UID,
      entitlement: "storage",
    });

    const res = await request(server)
      .post("/auth/entitlements/revoke")
      .set(adminAuth())
      .send({ principal_uid: PRINCIPAL_UID, entitlement: "storage" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      data: { principal_uid: PRINCIPAL_UID, entitlement: "storage" },
    });
    expect(authService.revokeEntitlement).toHaveBeenCalledWith(
      ID_TOKEN,
      PRINCIPAL_UID,
      "storage"
    );
  });

  it("returns 401 without an Authorization header", async () => {
    const res = await request(server)
      .post("/auth/entitlements/revoke")
      .send({ principal_uid: PRINCIPAL_UID, entitlement: "storage" });

    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe("Unauthorized");
  });

  it("returns 403 when the caller is not an admin (AC-07)", async () => {
    (authService.revokeEntitlement as Mock).mockRejectedValue(
      new authService.AdminAuthorizationError("Forbidden")
    );

    const res = await request(server)
      .post("/auth/entitlements/revoke")
      .set(adminAuth())
      .send({ principal_uid: PRINCIPAL_UID, entitlement: "storage" });

    expect(res.status).toBe(403);
    expect(res.body.error.message).toBe("Forbidden");
  });

  it("returns 404 when the target Principal does not exist", async () => {
    (authService.revokeEntitlement as Mock).mockRejectedValue(
      new FirebaseAuthError({ code: "user-not-found", message: "no user" })
    );

    const res = await request(server)
      .post("/auth/entitlements/revoke")
      .set(adminAuth())
      .send({ principal_uid: PRINCIPAL_UID, entitlement: "storage" });

    expect(res.status).toBe(404);
    expect(res.body.error.message).toBe("Principal not found");
  });

  it("returns 400 for a whitespace-only entitlement", async () => {
    const res = await request(server)
      .post("/auth/entitlements/revoke")
      .set(adminAuth())
      .send({ principal_uid: PRINCIPAL_UID, entitlement: "  " });

    expect(res.status).toBe(400);
    expect(authService.revokeEntitlement).not.toHaveBeenCalled();
  });
});
