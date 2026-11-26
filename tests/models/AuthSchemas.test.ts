import { describe, it, expect } from "vitest";
import { FormatRegistry } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import {
  PrincipalLookupQuerySchema,
  PrincipalLookupResponseSchema,
  EntitlementRequestSchema,
  EntitlementResponseSchema,
} from "../../src/models/AuthSchemas";

// Fastify's Ajv compiler supplies the "email" format at runtime; TypeBox's own
// Value checker needs it registered to evaluate format-annotated strings.
FormatRegistry.Set("email", (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value));

describe("PrincipalLookupQuerySchema", () => {
  it("declares email as a required email-format string", () => {
    const email = PrincipalLookupQuerySchema.properties.email;
    expect(email.format).toBe("email");
    expect(email.minLength).toBe(5);
    expect(email.maxLength).toBe(254);
    expect(PrincipalLookupQuerySchema.required).toContain("email");
  });

  it("accepts a valid email address", () => {
    expect(Value.Check(PrincipalLookupQuerySchema, { email: "friend@gmail.com" })).toBe(
      true
    );
  });

  it("rejects a non-email string", () => {
    expect(Value.Check(PrincipalLookupQuerySchema, { email: "not-an-email" })).toBe(
      false
    );
  });

  it("rejects a missing email", () => {
    expect(Value.Check(PrincipalLookupQuerySchema, {})).toBe(false);
  });

  it("rejects an email longer than 254 characters", () => {
    expect(
      Value.Check(PrincipalLookupQuerySchema, {
        email: `${"a".repeat(250)}@example.com`,
      })
    ).toBe(false);
  });
});

describe("PrincipalLookupResponseSchema", () => {
  it("exposes only principal_uid", () => {
    const keys = Object.keys(PrincipalLookupResponseSchema.properties);
    expect(keys).toEqual(["principal_uid"]);
  });

  it("rejects an empty principal_uid", () => {
    expect(Value.Check(PrincipalLookupResponseSchema, { principal_uid: "" })).toBe(
      false
    );
    expect(
      Value.Check(PrincipalLookupResponseSchema, { principal_uid: "abc123" })
    ).toBe(true);
  });
});

describe("EntitlementRequestSchema", () => {
  it("requires principal_uid and entitlement", () => {
    expect(EntitlementRequestSchema.required).toEqual(
      expect.arrayContaining(["principal_uid", "entitlement"])
    );
  });

  it("accepts a well-formed request", () => {
    expect(
      Value.Check(EntitlementRequestSchema, {
        principal_uid: "abc123",
        entitlement: "storage",
      })
    ).toBe(true);
  });

  it("rejects a missing entitlement", () => {
    expect(Value.Check(EntitlementRequestSchema, { principal_uid: "abc123" })).toBe(
      false
    );
  });

  it("rejects an empty entitlement", () => {
    expect(
      Value.Check(EntitlementRequestSchema, {
        principal_uid: "abc123",
        entitlement: "",
      })
    ).toBe(false);
  });

  it("rejects an empty principal_uid", () => {
    expect(
      Value.Check(EntitlementRequestSchema, {
        principal_uid: "",
        entitlement: "storage",
      })
    ).toBe(false);
  });

  it("accepts free-form entitlement values", () => {
    expect(
      Value.Check(EntitlementRequestSchema, {
        principal_uid: "abc123",
        entitlement: "arbitrary-value",
      })
    ).toBe(true);
  });
});

describe("EntitlementResponseSchema", () => {
  it("exposes principal_uid and entitlement", () => {
    expect(Object.keys(EntitlementResponseSchema.properties)).toEqual([
      "principal_uid",
      "entitlement",
    ]);
  });

  it("validates a response payload", () => {
    expect(
      Value.Check(EntitlementResponseSchema, {
        principal_uid: "abc123",
        entitlement: "storage",
      })
    ).toBe(true);
    expect(
      Value.Check(EntitlementResponseSchema, {
        principal_uid: "abc123",
        entitlement: "",
      })
    ).toBe(false);
  });
});
