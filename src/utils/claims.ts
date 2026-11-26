/**
 * Pure custom-claims helpers for the Auth service.
 *
 * No imports, no side effects — so the one-off seed script can import these
 * without pulling in `src/services/firebase.ts` (which requires full app config).
 *
 * Claims shape (see design.md §4):
 *   {
 *     identities: Record<identity_id, roles[]>,
 *     acting_identity: string,
 *     entitlements?: string[]
 *   }
 */

export interface AdminRoleClaims {
  acting_identity?: unknown;
  identities?: Record<string, string[]>;
}

export interface SeedTarget {
  kind: "email" | "uid";
  value: string;
}

export type AdminDenialReason =
  | "no acting_identity"
  | "acting_identity not in identities"
  | "not admin";

export class ClaimsInvariantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ClaimsInvariantError";
  }
}

function isRolesMap(value: unknown): value is Record<string, string[]> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOwn(map: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(map, key);
}

/**
 * Fail-closed admin predicate (REQ-04): the acting Identity must exist in the
 * identities map AND carry the "admin" role. An admin role on a non-acting
 * Identity does not authorize the caller.
 */
export function hasAdminRole(claims: AdminRoleClaims): boolean {
  return adminDenialReason(claims) === null;
}

/**
 * Explains why the admin predicate failed, for the WARN log required by NFR-10.
 * Returns null when the caller IS an admin.
 */
export function adminDenialReason(
  claims: AdminRoleClaims
): AdminDenialReason | null {
  const actingIdentity = claims.acting_identity;
  const identities = claims.identities;

  if (typeof actingIdentity !== "string") {
    return "no acting_identity";
  }
  if (!isRolesMap(identities) || !hasOwn(identities, actingIdentity)) {
    return "acting_identity not in identities";
  }

  const roles = identities[actingIdentity];
  if (!Array.isArray(roles) || !roles.includes("admin")) {
    return "not admin";
  }

  return null;
}

/**
 * Read-merge-write delta for the entitlements claim (REQ-02/REQ-12).
 * Preserves every other claim; deletes the key when the array becomes empty.
 */
export function mergeEntitlement(
  claims: Record<string, unknown>,
  entitlement: string,
  add: boolean
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...claims };
  const current = Array.isArray(merged.entitlements)
    ? merged.entitlements.filter((value): value is string => typeof value === "string")
    : [];

  const next = add
    ? current.includes(entitlement)
      ? current
      : [...current, entitlement]
    : current.filter((value) => value !== entitlement);

  if (next.length === 0) {
    delete merged.entitlements;
  } else {
    merged.entitlements = next;
  }

  return merged;
}

/**
 * Grants the platform-level `admin` role to the identity entry that holds
 * `owner` (REQ-17). Idempotent; preserves all other claims.
 */
export function mergeAdminRole(
  claims: Record<string, unknown>
): Record<string, unknown> {
  const identities = claims.identities;
  if (!isRolesMap(identities)) {
    throw new Error("Custom claims contain no identities map");
  }

  const ownerEntry = Object.entries(identities).find(
    ([, roles]) => Array.isArray(roles) && roles.includes("owner")
  );
  if (!ownerEntry) {
    throw new Error('Custom claims contain no identity with the "owner" role');
  }

  const [identityId, roles] = ownerEntry;
  const mergedRoles = roles.includes("admin") ? [...roles] : [...roles, "admin"];

  return {
    ...claims,
    identities: { ...identities, [identityId]: mergedRoles },
  };
}

/**
 * Guards REQ-03: `acting_identity` must remain a key in `identities` after a
 * claims write. Throws before the write so nothing is persisted.
 */
export function assertActingIdentityInvariant(
  claims: Record<string, unknown>
): void {
  const actingIdentity = claims.acting_identity;
  const identities = claims.identities;

  if (
    typeof actingIdentity !== "string" ||
    !isRolesMap(identities) ||
    !hasOwn(identities, actingIdentity)
  ) {
    throw new ClaimsInvariantError(
      "Custom claims violate the acting_identity invariant"
    );
  }
}

/**
 * Resolves the seed script's target from the environment (REQ-19).
 * Exactly one of TARGET_PRINCIPAL_EMAIL / TARGET_PRINCIPAL_UID must be set.
 */
export function parseSeedTarget(
  env: Record<string, string | undefined>
): SeedTarget {
  const email = env.TARGET_PRINCIPAL_EMAIL?.trim();
  const uid = env.TARGET_PRINCIPAL_UID?.trim();

  if (email && !uid) {
    return { kind: "email", value: email };
  }
  if (uid && !email) {
    return { kind: "uid", value: uid };
  }

  throw new Error(
    "Set exactly one of TARGET_PRINCIPAL_EMAIL or TARGET_PRINCIPAL_UID"
  );
}
