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
const EMAIL = "friend@gmail.com";

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

describe("GET /auth/lookup", () => {
  it("resolves an email to a principal_uid (AC-01)", async () => {
    (authService.lookupPrincipal as Mock).mockResolvedValue({
      principal_uid: PRINCIPAL_UID,
    });

    const res = await request(server)
      .get("/auth/lookup")
      .query({ email: EMAIL })
      .set("Authorization", `Bearer ${ID_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: { principal_uid: PRINCIPAL_UID } });
    expect(authService.lookupPrincipal).toHaveBeenCalledWith(
      ID_TOKEN,
      EMAIL
    );
  });

  it("returns only principal_uid, never other fields (REQ-08)", async () => {
    (authService.lookupPrincipal as Mock).mockResolvedValue({
      principal_uid: PRINCIPAL_UID,
      email: EMAIL,
      identities: { "some-identity": ["owner"] },
    });

    const res = await request(server)
      .get("/auth/lookup")
      .query({ email: EMAIL })
      .set("Authorization", `Bearer ${ID_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ principal_uid: PRINCIPAL_UID });
  });

  it("returns 400 for a malformed email (AC-05)", async () => {
    const res = await request(server)
      .get("/auth/lookup")
      .query({ email: "not-an-email" })
      .set("Authorization", `Bearer ${ID_TOKEN}`);

    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe("Invalid email format");
    expect(authService.lookupPrincipal).not.toHaveBeenCalled();
  });

  it("returns 400 when email is missing (AC-05)", async () => {
    const res = await request(server)
      .get("/auth/lookup")
      .set("Authorization", `Bearer ${ID_TOKEN}`);

    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe("Invalid email format");
    expect(authService.lookupPrincipal).not.toHaveBeenCalled();
  });

  it("returns 400 when email exceeds 254 characters (AC-05)", async () => {
    const res = await request(server)
      .get("/auth/lookup")
      .query({ email: `${"a".repeat(250)}@example.com` })
      .set("Authorization", `Bearer ${ID_TOKEN}`);

    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe("Invalid email format");
  });

  it("returns 401 without an Authorization header (AC-03)", async () => {
    const res = await request(server).get("/auth/lookup").query({ email: EMAIL });

    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe("Unauthorized");
  });

  it("returns 401 when the ID token fails verification (AC-03)", async () => {
    (authService.lookupPrincipal as Mock).mockRejectedValue(
      new FirebaseAuthError({ code: "id-token-expired", message: "expired" })
    );

    const res = await request(server)
      .get("/auth/lookup")
      .query({ email: EMAIL })
      .set("Authorization", `Bearer ${ID_TOKEN}`);

    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe("Unauthorized");
  });

  it("returns 403 for a non-admin caller (AC-04)", async () => {
    (authService.lookupPrincipal as Mock).mockRejectedValue(
      new authService.AdminAuthorizationError("Forbidden")
    );

    const res = await request(server)
      .get("/auth/lookup")
      .query({ email: EMAIL })
      .set("Authorization", `Bearer ${ID_TOKEN}`);

    expect(res.status).toBe(403);
    expect(res.body.error.message).toBe("Forbidden");
  });

  it("returns 404 when no Principal has that email (AC-02)", async () => {
    (authService.lookupPrincipal as Mock).mockRejectedValue(
      new FirebaseAuthError({ code: "user-not-found", message: "no user" })
    );

    const res = await request(server)
      .get("/auth/lookup")
      .query({ email: EMAIL })
      .set("Authorization", `Bearer ${ID_TOKEN}`);

    expect(res.status).toBe(404);
    expect(res.body.error.message).toBe("Principal not found");
  });

  it("returns 500 with a generic message for unexpected errors (NFR-14)", async () => {
    (authService.lookupPrincipal as Mock).mockRejectedValue(
      new Error("firebase outage: secret detail")
    );

    const res = await request(server)
      .get("/auth/lookup")
      .query({ email: EMAIL })
      .set("Authorization", `Bearer ${ID_TOKEN}`);

    expect(res.status).toBe(500);
    expect(res.body.error.message).toBe("Internal server error");
  });
});
