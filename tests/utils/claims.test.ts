import { describe, it, expect } from "vitest";
import {
  hasAdminRole,
  adminDenialReason,
  mergeEntitlement,
  mergeAdminRole,
  parseSeedTarget,
  assertActingIdentityInvariant,
  ClaimsInvariantError,
} from "../../src/utils/claims";

const IDENTITY_A = "550e8400-e29b-41d4-a716-446655440000";
const IDENTITY_B = "660e8400-e29b-41d4-a716-446655440111";

describe("hasAdminRole", () => {
  it("returns true when the acting identity holds the admin role", () => {
    expect(
      hasAdminRole({
        identities: { [IDENTITY_A]: ["owner", "admin"] },
        acting_identity: IDENTITY_A,
      })
    ).toBe(true);
  });

  it("returns false when the acting identity only holds owner", () => {
    expect(
      hasAdminRole({
        identities: { [IDENTITY_A]: ["owner"] },
        acting_identity: IDENTITY_A,
      })
    ).toBe(false);
  });

  it("returns false when acting_identity is missing", () => {
    expect(hasAdminRole({ identities: { [IDENTITY_A]: ["owner", "admin"] } })).toBe(
      false
    );
  });

  it("returns false when acting_identity is not a key in identities", () => {
    expect(
      hasAdminRole({
        identities: { [IDENTITY_A]: ["owner", "admin"] },
        acting_identity: IDENTITY_B,
      })
    ).toBe(false);
  });

  it("returns false when admin is held on a different (non-acting) identity", () => {
    expect(
      hasAdminRole({
        identities: { [IDENTITY_A]: ["owner", "admin"], [IDENTITY_B]: ["owner"] },
        acting_identity: IDENTITY_B,
      })
    ).toBe(false);
  });

  it("returns false when identities is missing", () => {
    expect(hasAdminRole({ acting_identity: IDENTITY_A })).toBe(false);
  });

  it("returns false when acting_identity is not a string", () => {
    expect(
      hasAdminRole({ identities: { [IDENTITY_A]: ["admin"] }, acting_identity: 42 })
    ).toBe(false);
  });

  it("returns false for an empty claims object", () => {
    expect(hasAdminRole({})).toBe(false);
  });
});

describe("adminDenialReason", () => {
  it("returns null for an admin caller", () => {
    expect(
      adminDenialReason({
        identities: { [IDENTITY_A]: ["owner", "admin"] },
        acting_identity: IDENTITY_A,
      })
    ).toBeNull();
  });

  it("reports a missing acting_identity", () => {
    expect(adminDenialReason({ identities: { [IDENTITY_A]: ["admin"] } })).toBe(
      "no acting_identity"
    );
  });

  it("reports an acting_identity absent from identities", () => {
    expect(
      adminDenialReason({
        identities: { [IDENTITY_A]: ["admin"] },
        acting_identity: IDENTITY_B,
      })
    ).toBe("acting_identity not in identities");
  });

  it("reports a non-admin acting identity", () => {
    expect(
      adminDenialReason({
        identities: { [IDENTITY_A]: ["owner", "admin"], [IDENTITY_B]: ["owner"] },
        acting_identity: IDENTITY_B,
      })
    ).toBe("not admin");
  });
});

describe("mergeEntitlement", () => {
  it("adds an entitlement to an empty claims object", () => {
    expect(mergeEntitlement({}, "storage", true)).toEqual({
      entitlements: ["storage"],
    });
  });

  it("appends to an existing entitlements array", () => {
    const merged = mergeEntitlement({ entitlements: ["beta"] }, "storage", true);
    expect(merged.entitlements).toEqual(["beta", "storage"]);
  });

  it("does not duplicate an entitlement that is already present", () => {
    const merged = mergeEntitlement({ entitlements: ["storage"] }, "storage", true);
    expect(merged.entitlements).toEqual(["storage"]);
  });

  it("removes an entitlement that is present", () => {
    const merged = mergeEntitlement(
      { entitlements: ["beta", "storage"] },
      "storage",
      false
    );
    expect(merged.entitlements).toEqual(["beta"]);
  });

  it("leaves claims unchanged when revoking an absent entitlement", () => {
    const merged = mergeEntitlement({ entitlements: ["beta"] }, "storage", false);
    expect(merged).toEqual({ entitlements: ["beta"] });
  });

  it("deletes the entitlements key when the last entitlement is revoked", () => {
    const merged = mergeEntitlement({ entitlements: ["storage"] }, "storage", false);
    expect("entitlements" in merged).toBe(false);
  });

  it("preserves identities and acting_identity on grant", () => {
    const claims = {
      identities: { [IDENTITY_A]: ["owner"] },
      acting_identity: IDENTITY_A,
    };
    const merged = mergeEntitlement(claims, "storage", true);
    expect(merged).toEqual({
      identities: { [IDENTITY_A]: ["owner"] },
      acting_identity: IDENTITY_A,
      entitlements: ["storage"],
    });
  });

  it("preserves identities and acting_identity when the last entitlement is revoked", () => {
    const claims = {
      identities: { [IDENTITY_A]: ["owner"] },
      acting_identity: IDENTITY_A,
      entitlements: ["storage"],
      some_other_claim: "kept",
    };
    const merged = mergeEntitlement(claims, "storage", false);
    expect(merged).toEqual({
      identities: { [IDENTITY_A]: ["owner"] },
      acting_identity: IDENTITY_A,
      some_other_claim: "kept",
    });
  });

  it("does not mutate the input claims", () => {
    const claims: Record<string, unknown> = { entitlements: ["beta"] };
    mergeEntitlement(claims, "storage", true);
    expect(claims).toEqual({ entitlements: ["beta"] });
  });
});

describe("mergeAdminRole", () => {
  it("appends admin to the identity holding the owner role", () => {
    const merged = mergeAdminRole({
      identities: { [IDENTITY_A]: ["owner"] },
      acting_identity: IDENTITY_A,
    });
    expect(merged.identities).toEqual({ [IDENTITY_A]: ["owner", "admin"] });
  });

  it("is idempotent when admin is already present", () => {
    const merged = mergeAdminRole({
      identities: { [IDENTITY_A]: ["owner", "admin"] },
      acting_identity: IDENTITY_A,
    });
    expect(merged.identities).toEqual({ [IDENTITY_A]: ["owner", "admin"] });
  });

  it("preserves acting_identity and every other identity entry", () => {
    const merged = mergeAdminRole({
      identities: { [IDENTITY_A]: ["owner"], [IDENTITY_B]: ["viewer"] },
      acting_identity: IDENTITY_A,
      entitlements: ["storage"],
    });
    expect(merged).toEqual({
      identities: {
        [IDENTITY_A]: ["owner", "admin"],
        [IDENTITY_B]: ["viewer"],
      },
      acting_identity: IDENTITY_A,
      entitlements: ["storage"],
    });
  });

  it("throws when no identity holds the owner role", () => {
    expect(() =>
      mergeAdminRole({
        identities: { [IDENTITY_A]: ["viewer"] },
        acting_identity: IDENTITY_A,
      })
    ).toThrow(/owner/i);
  });

  it("throws when the identities map is missing or malformed", () => {
    expect(() => mergeAdminRole({ acting_identity: IDENTITY_A })).toThrow(/identities/i);
    expect(() => mergeAdminRole({ identities: "nope" })).toThrow(/identities/i);
  });

  it("does not mutate the input claims", () => {
    const claims = {
      identities: { [IDENTITY_A]: ["owner"] },
      acting_identity: IDENTITY_A,
    };
    mergeAdminRole(claims);
    expect(claims.identities[IDENTITY_A]).toEqual(["owner"]);
  });
});

describe("assertActingIdentityInvariant", () => {
  it("accepts claims whose acting_identity is a key in identities", () => {
    expect(() =>
      assertActingIdentityInvariant({
        identities: { [IDENTITY_A]: ["owner"] },
        acting_identity: IDENTITY_A,
        entitlements: ["storage"],
      })
    ).not.toThrow();
  });

  it("rejects claims whose acting_identity is not a key in identities", () => {
    expect(() =>
      assertActingIdentityInvariant({
        identities: { [IDENTITY_A]: ["owner"] },
        acting_identity: IDENTITY_B,
      })
    ).toThrow(ClaimsInvariantError);
  });

  it("rejects claims with no acting_identity", () => {
    expect(() =>
      assertActingIdentityInvariant({ identities: { [IDENTITY_A]: ["owner"] } })
    ).toThrow(ClaimsInvariantError);
  });
});

describe("parseSeedTarget", () => {
  it("parses an email target", () => {
    expect(parseSeedTarget({ TARGET_PRINCIPAL_EMAIL: "owner@example.com" })).toEqual({
      kind: "email",
      value: "owner@example.com",
    });
  });

  it("parses a uid target", () => {
    expect(parseSeedTarget({ TARGET_PRINCIPAL_UID: "abc123" })).toEqual({
      kind: "uid",
      value: "abc123",
    });
  });

  it("throws when both targets are provided", () => {
    expect(() =>
      parseSeedTarget({
        TARGET_PRINCIPAL_EMAIL: "owner@example.com",
        TARGET_PRINCIPAL_UID: "abc123",
      })
    ).toThrow(/exactly one/i);
  });

  it("throws when neither target is provided", () => {
    expect(() => parseSeedTarget({})).toThrow(/exactly one/i);
  });

  it("treats blank values as absent", () => {
    expect(() =>
      parseSeedTarget({ TARGET_PRINCIPAL_EMAIL: "   ", TARGET_PRINCIPAL_UID: "" })
    ).toThrow(/exactly one/i);
  });
});
