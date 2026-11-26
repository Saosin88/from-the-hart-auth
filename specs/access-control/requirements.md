# Requirements: Access Control (Auth Service)

## 1. Summary

Extend the Auth service with access-control capabilities: (1) **admin-gated Principal lookup** (resolve a recipient's email to a Firebase UID), (2) a secure **`/auth/entitlements`** grant/revoke endpoint gated by a new platform-level **`admin`** role carried in the JWT, and (3) **logout token revocation** (un-comment `invalidateUserTokens()`). The JWT contract is extended with a top-level `entitlements: string[]` custom claim, orthogonal to the per-identity `identities` map. Both lookup and entitlements require the caller to be an `admin` — verified as "the caller's acting Identity holds the `admin` role." Role management (grant/revoke on Identities) and switch-identity are **deferred** — the claims shape already supports them later, but nothing is built now.

**Who benefits:** the platform owner, who can grant feature-level access (e.g. `"storage"`) to a small number of Principals via a secure endpoint without code changes; and downstream services (Storage, Gateway, future admin console), which get a standard `entitlements` claim and a platform-level `admin` role to check.

## 2. User Stories

### User Story 1 — Secure Entitlement Grant/Revoke (Priority: P1)

As the platform owner (a Principal acting as an `admin` Identity), I want to grant and revoke feature-level entitlements to Principals via a secure endpoint, so that only I control who can use gated features such as storage.

**Independent Test:** Can be fully tested by sending a crypto-verified Bearer token whose `identities[acting_identity]` includes `"admin"` to `POST /auth/entitlements`, verifying the target Principal's custom claims gain the entitlement (with `identities`/`acting_identity` preserved), and `POST /auth/entitlements/revoke` removing it. Delivers a complete grant/revoke round-trip with no other feature required.

### User Story 2 — Principal Lookup (Priority: P1)

As the platform owner (a Principal acting as an `admin` Identity), I want to resolve a recipient's email address to their Firebase UID, so that I can grant entitlements to the correct Principal.

**Independent Test:** Can be fully tested by calling `GET /auth/lookup?email=friend@gmail.com` with a valid admin Bearer token and verifying `{ data: { principal_uid } }` is returned; an unknown email returns 404, and a non-admin token returns 403. Delivers standalone email→UID resolution gated to admins.

### User Story 3 — Logout Token Revocation (Priority: P2)

As a Principal, I want logout to also revoke my refresh tokens server-side, so that a leaked/stolen refresh token cannot be used even within the gateway's 10-minute cache window.

**Independent Test:** Can be fully tested by calling `GET /auth/logout` with a valid Bearer token and verifying `invalidateUserTokens()` is invoked (refresh tokens revoked) while the response still clears the cookie and returns 200. Delivers defense-in-depth revocation with graceful degradation.

## 3. Acceptance Criteria

### Principal Lookup

- **AC-01:** Given a valid, crypto-verified Bearer ID token whose `acting_identity` is a key in `identities` and whose `identities[acting_identity]` includes `"admin"`, and a query email that matches an existing Principal, when `GET /auth/lookup?email=<email>` is called, then the response is 200 with `{ data: { principal_uid: "<firebase_uid>" } }`, and no fields other than `principal_uid` are returned.

- **AC-02:** Given a valid admin Bearer ID token (as in AC-01) and a query email that matches no existing Principal, when `GET /auth/lookup?email=<email>` is called, then the response is 404 with `{ error: { message: "Principal not found" } }`.

- **AC-03:** Given a request to `GET /auth/lookup?email=<email>` with a missing, malformed, or invalid Bearer token, when the token fails Firebase Admin `verifyIdToken`, then the response is 401 with `{ error: { message: "Unauthorized" } }`.

- **AC-04:** Given a valid crypto-verified Bearer token whose `acting_identity` is missing, or whose `identities[acting_identity]` does not include `"admin"`, when `GET /auth/lookup?email=<email>` is called, then the response is 403 with `{ error: { message: "Forbidden" } }` and no Principal data is resolved (fail closed).

- **AC-05:** Given a request to `GET /auth/lookup` with a query `email` that fails TypeBox validation (missing, empty, or not a valid email format), then the response is 400 with `{ error: { message: "Invalid email format" } }`.

### Entitlements

- **AC-06:** Given a caller whose crypto-verified token has `acting_identity` present and `identities[acting_identity]` includes `"admin"`, when `POST /auth/entitlements` is called with `{ principal_uid, entitlement }`, then the target Principal's `entitlements` claim gains the entitlement (read-merge-write: `identities` and `acting_identity` are preserved byte-for-byte), and the response is 200 with `{ data: { principal_uid, entitlement } }`.

- **AC-07:** Given a caller whose crypto-verified token lacks `acting_identity`, or whose `identities` map does not contain `acting_identity` as a key, or whose `identities[acting_identity]` does not include `"admin"`, when `POST /auth/entitlements` or `POST /auth/entitlements/revoke` is called, then the response is 403 with `{ error: { message: "Forbidden" } }` and no claims are modified (fail closed).

- **AC-08:** Given a valid admin caller and a `principal_uid` that does not correspond to an existing Principal (`adminAuth().getUser(principal_uid)` throws `auth/user-not-found`), when `POST /auth/entitlements` or `POST /auth/entitlements/revoke` is called, then the response is 404 with `{ error: { message: "Principal not found" } }`.

- **AC-09:** Given a valid admin caller, when `POST /auth/entitlements` is called with an `entitlement` that is empty, missing, or becomes empty after trimming leading/trailing whitespace (e.g. `"   "`), then the response is 400 and no claims are modified. (The value is trimmed BEFORE validation — see REQ-14.)

- **AC-10:** Given a valid admin caller and an `entitlement` that is non-empty after trimming (e.g. `"storage"`, `"beta"`, `"arbitrary-value"`, or `" storage "`), when `POST /auth/entitlements` is called, then the **trimmed** value is accepted and stored — no central validation, enumeration, or allowlist is applied. (Interior whitespace is preserved: `"stor age"` is stored as-is.)

- **AC-11:** Given a valid admin caller, when `POST /auth/entitlements` grants an entitlement the target already has, then the operation is idempotent: the entitlement appears exactly once in the target's claims and the response is 200.

- **AC-12:** Given a valid admin caller, when `POST /auth/entitlements/revoke` revokes an entitlement the target does not have, then the operation is idempotent: the response is 200 and the target's claims are unchanged.

- **AC-13:** Given a valid admin caller revoking the target's last remaining entitlement, when `POST /auth/entitlements/revoke` is called, then the `entitlements` claim is removed entirely from the target's claims (absent == empty), while `identities` and `acting_identity` are preserved.

### Admin Role & Seeding

- **AC-14:** Given a newly registered Principal, when registration completes, then the Principal's custom claims contain only `identities: { [identity_id]: ["owner"] }` and `acting_identity: identity_id` — no `admin` role appears anywhere and no `entitlements` claim is present.

- **AC-15:** Given the one-off admin seed script is run against an existing owner Principal (whose own Identity already has `["owner"]`), when it executes, then it read-merge-writes that Identity's roles to `["owner", "admin"]`, preserves all other `identities` entries and `acting_identity`, and is idempotent (running it again does not produce a duplicate `"admin"`). The script authenticates via Firebase Admin ADC and receives the target Principal's identifier as runtime input — never hard-coded, and no secrets are committed to the repository.

### Logout Revocation

- **AC-16:** Given a `GET /auth/logout` request with a valid Bearer ID token, when the logout handler runs, then `invalidateUserTokens(idToken)` is invoked (which calls `verifyIdToken` and `revokeRefreshTokens(uid)`), the `refresh_token` cookie is cleared, and the response is 200 with `{ data: { success: true, message: "Logged out successfully" } }`.

- **AC-17:** Given a `GET /auth/logout` request with no Bearer token, or with an invalid/expired token, when the logout handler runs, then revocation is skipped (or fails internally) but the response is still 200 with `{ data: { success: true, message: "Logged out successfully" } }` and the `refresh_token` cookie is cleared (graceful degradation — revocation failure never fails logout).

### JWT Contract

- **AC-18:** Given a Principal who has at least one entitlement, when a fresh ID token is minted (login or refresh), then the token's custom claims contain a top-level `entitlements` array of strings alongside the unchanged `identities` and `acting_identity` claims.

- **AC-19:** Given `POST /auth/entitlements` or `POST /auth/entitlements/revoke` (or `GET /auth/lookup` with an invalid query), when the request carries a **malformed JSON body**, then the response is 400 with the `{ error: { message } }` envelope; when it carries an **unsupported `Content-Type`**, then the response is 415 with the same `{ error: { message } }` envelope (consistent with the service's error shape — not Fastify's default `{ statusCode, error, message }`).

## 4. Functional Requirements

### Common

- **REQ-01:** Every new authenticated endpoint (`GET /auth/lookup`, `POST /auth/entitlements`, `POST /auth/entitlements/revoke`) MUST extract the Bearer token from the `Authorization` header and crypto-verify it via Firebase Admin `verifyIdToken`. `jwt.decode()`-style parse-only MUST NOT be used for authorization on these endpoints.

- **REQ-02:** Every `setCustomUserClaims` call in this feature MUST use **read-merge-write**: read the target Principal's current claims via `adminAuth().getUser(uid).customClaims`, merge the change, preserve ALL existing top-level claims (especially `identities` and `acting_identity`), then write via `adminAuth().setCustomUserClaims(uid, merged)`. Blind replacement is forbidden.

- **REQ-03:** After any claims write, `acting_identity` MUST remain a key in the target's `identities` map. A write that would violate this invariant MUST be rejected (400) before calling `setCustomUserClaims`. (In this phase the invariant is structurally guaranteed — entitlement writes never touch `identities`, and the seed script preserves it — but the guard MUST still exist and be unit-tested via a hypothetical violating input.)

- **REQ-04:** The admin authorization check is **acting-identity-scoped** and MUST be identical for every admin-gated endpoint: the caller's verified token MUST have an `acting_identity` claim that is present as a key in the `identities` map, AND `identities[acting_identity]` MUST include the string `"admin"`. Any other condition (missing `acting_identity`, `acting_identity` not in `identities`, no `admin` role on the acting Identity) MUST return 403 `{ error: { message: "Forbidden" } }` (fail closed). An `admin` role held on a *non-acting* Identity does NOT authorize the request.

### Principal Lookup

- **REQ-05:** `GET /auth/lookup` MUST accept a required query parameter `email` validated by a TypeBox schema (`format: "email"`).

- **REQ-06:** `GET /auth/lookup` MUST enforce the admin check from REQ-04 before resolving the email.

- **REQ-07:** `GET /auth/lookup` MUST resolve the email via `adminAuth().getUserByEmail(email)` and return 200 `{ data: { principal_uid } }` where `principal_uid` is the Principal's Firebase UID.

- **REQ-08:** `GET /auth/lookup` MUST return only `principal_uid`. No email, no identity IDs, no roles, no entitlements.

- **REQ-09:** `GET /auth/lookup` MUST return 404 `{ error: { message: "Principal not found" } }` when no Principal has that email.

### Entitlements

- **REQ-10:** `POST /auth/entitlements` and `POST /auth/entitlements/revoke` MUST accept a JSON body `{ principal_uid: string, entitlement: string }` validated by a TypeBox schema (both fields required; `entitlement` `minLength: 1`; `principal_uid` non-empty).

- **REQ-11:** Both entitlement endpoints MUST enforce the admin check from REQ-04.

- **REQ-12:** Grant MUST append `entitlement` to the target's `entitlements` array without duplicates (idempotent). Revoke MUST remove `entitlement` if present (idempotent). When the array becomes empty after revoke, the `entitlements` claim MUST be removed from the target's claims entirely.

- **REQ-13:** Before writing, the system MUST validate the target Principal exists via `adminAuth().getUser(principal_uid)`; if not found, return 404 `{ error: { message: "Principal not found" } }`.

- **REQ-14:** Entitlement values MUST be free-form strings — the system MUST NOT apply any central validation, enumeration, or allowlist. The system MUST trim leading/trailing whitespace from `entitlement` before validation; the trimmed value MUST be non-empty (else 400), and the **trimmed** value is what gets stored. (Each domain service enforces the exact string it expects at use time; interior whitespace is preserved.)

- **REQ-15:** The system MUST NOT call `revokeRefreshTokens` for entitlement changes (admin-initiated). Entitlement changes propagate on the target's next token refresh (staleness ≤ 1 hour, accepted).

- **REQ-16:** Registration MUST continue to set claims of `{ identities: { [identity_id]: ["owner"] }, acting_identity: identity_id }` only. Registration MUST NOT grant `admin` and MUST NOT set an `entitlements` claim.

- **REQ-17:** The `admin` role MUST be seeded out-of-band via a one-off Firebase Admin script that read-merge-writes the owner's own Identity entry from `["owner"]` to `["owner", "admin"]`, preserving all other claims. The script MUST be idempotent.

- **REQ-18:** The admin seed script MUST NOT commit any secret to the repository — no service account keys, no hard-coded target email/UID, no credentials. It MUST authenticate via Firebase Admin SDK Application Default Credentials (`GOOGLE_APPLICATION_CREDENTIALS`), reusing the same credential-discovery pattern as `src/services/firebase.ts`.

- **REQ-19:** The admin seed script MUST receive the target Principal's identifier (email or UID) as runtime input (environment variable or CLI argument), never as a hard-coded literal, and MUST be run manually by the owner. It MUST NOT be wired into application startup, CI/CD, or Terraform.

### Logout Revocation

- **REQ-20:** The logout handler MUST un-comment and invoke `invalidateUserTokens(idToken)` when a valid Bearer ID token is present on the request.

- **REQ-21:** Logout MUST clear the `refresh_token` cookie (`.fromthehart.tech` domain, `/auth/refresh-token` path, secure, httpOnly, sameSite none) and return 200 `{ data: { success: true, message: "Logged out successfully" } }` regardless of whether revocation succeeded.

- **REQ-22:** The gateway's `Cache-Control: max-age=600` on `/auth/verify-id-token` MUST remain unchanged (Option C — accepted ≤10-minute staleness). The Auth service MUST NOT attempt cache invalidation. Cache-busting or TTL reduction, if ever desired, is a gateway-spec change and out of scope here.

### Contract & Cross-Cutting

- **REQ-23:** The JWT custom claims contract MUST be extended with a top-level `entitlements: string[]` claim. The claim MUST be absent when the Principal has no entitlements (absent == empty). A fresh token for a Principal with entitlements MUST carry the array.

- **REQ-24:** The architecture doc (`docs/architecture/identity-and-access.md`) MUST be updated to (a) add `entitlements` to the JWT contract and (b) add `admin` to the role definitions as a platform-level role, distinct from identity-scoped `owner`/`viewer`.

- **REQ-25:** The gateway `apiEndpointsMap` (the single allowed cross-repo file `from-the-hart-tech-api-reverse-proxy-worker/src/routes.ts`) MUST add pathRules for the new endpoints with `validateAccessToken: true` (no turnstile, no cache) — see the table in design.md §Gateway Route Config.

- **REQ-26:** The master `CONTEXT.md` and auth `CONTEXT.md` MUST gain glossary entries for `Entitlement` and the platform-level `admin` role.

## 5. Non-Functional Requirements

### Performance

- **NFR-01:** `GET /auth/lookup` and each entitlement endpoint MUST complete their service-side logic (excluding the Firebase Admin round-trips — `verifyIdToken`, `getUser`, `getUserByEmail`, and one optional `setCustomUserClaims`) in P99 < 200ms at expected load.

- **NFR-02:** No throughput, concurrency, or caching optimization is required — access-control operations are rare, owner-initiated actions (single-digit requests per week).

### Security

- **NFR-03:** All new authenticated endpoints MUST crypto-verify the caller token via `verifyIdToken` — never parse-only. The auth service has `firebase-admin`; there is no justification for `jwt.decode()`-only authorization here.

- **NFR-04:** Authorization MUST fail closed: a missing/absent `acting_identity`, an `acting_identity` not present in `identities`, or a missing `admin` role on the acting Identity all result in 403 with no side effects.

- **NFR-05:** `admin` MUST never be granted during registration — it is seeded out-of-band only. This MUST be covered by a test that inspects a newly registered Principal's claims.

- **NFR-06:** The custom claims payload MUST remain ≤ 1000 bytes after adding `entitlements`. Budget: a single short entitlement (e.g. `"storage"`, ~11 bytes) plus the `entitlements` key/array overhead (~15 bytes) adds ~25 bytes to the existing ~104 bytes (one identity entry + `acting_identity`). No realistic entitlement set approaches the limit.

- **NFR-07:** Entitlement changes MUST NOT call `revokeRefreshTokens` (staleness ≤ 1 hour accepted). Logout revocation staleness at the gateway MUST be ≤ 10 minutes (accepted — cookie deletion is the primary barrier).

- **NFR-08:** The admin seed script MUST be safe to keep in a (possibly public) repository: no secrets, credentials, or target identifiers committed; authentication via ADC only.

### Observability

- **NFR-09:** Entitlement grant and revoke MUST be logged at INFO with: `operation` (`grantEntitlement`/`revokeEntitlement`), caller uid, `acting_identity`, target `principal_uid`, and `entitlement`.

- **NFR-10:** Authorization failures on admin-gated endpoints (lookup and entitlements) MUST be logged at WARN with: `operation`, caller uid (when known), and the reason (`no acting_identity`, `acting_identity not in identities`, or `not admin`).

- **NFR-11:** Principal lookup MUST be logged at INFO with: `operation: "lookupPrincipal"`, caller uid, and the queried email (success) or the 404 result (INFO, not ERROR — 404 is a normal outcome). The queried email is PII; it is retained per Cloud Run default log retention (30 days) with no additional redaction — accepted because the caller is an authenticated admin.

- **NFR-12:** Logout revocation MUST log at INFO on successful revocation (uid) and at WARN when revocation is skipped or fails (missing/invalid token), but the logout response MUST still be 200.

### Reliability

- **NFR-13:** Revocation failure MUST NOT fail logout — the cookie is always cleared and 200 returned (graceful degradation).

- **NFR-14:** If `adminAuth().getUser`/`getUserByEmail`/`setCustomUserClaims` throws an unexpected error (network/Firebase outage), the endpoint MUST return 500 `{ error: { message: "Internal server error" } }` and MUST NOT leak internal error details to the client.

## 6. Key Entities

### Principal (Existing, Extended)

The authenticated cryptographic entity in GCP Identity Platform. Identified by Firebase UID (`user_id`/`sub` claim).

- **Key attributes:** `uid`, `email`, `emailVerified`, `customClaims`.
- **New behavior:** `customClaims` may now contain a top-level `entitlements: string[]` claim, and the `identities` map may contain an `"admin"` role on the owner's own Identity entry.
- **Relationships:** Has zero or more `Entitlement`s. Acts as one `Acting Identity` at a time. May hold the `admin` `Role` on an Identity.

### Entitlement (New)

A string label representing a Principal-level (global) capability, orthogonal to per-Identity roles. Examples: `"storage"`, `"beta"`.

- **Key attributes:** the string value itself (free-form, non-empty). Carried as a top-level custom claim `entitlements: string[]`.
- **Relationships:** Belongs to exactly one `Principal`. Independent of `Identity`/`Role` — an entitlement is NOT scoped to any identity.
- **Semantics:** Each domain service interprets and enforces the exact string it expects; a typo'd entitlement matches nothing and is inert.

### Role (Extended)

A label in a Principal's `identities` map role array. The set is now `owner`, `viewer`, `admin`.

- **`owner` / `viewer`:** identity-scoped — they confer rights over the specific Identity whose entry they appear in.
- **`admin` (new):** platform-level — it means "this Principal administers the platform" (today: entitlement grants and lookup; future: admin console). It is NOT scoped to the Identity it sits on for *meaning*, but is carried in that Identity's roles array purely for JWT propagation. Authorization checks read it from the currently-acting Identity's roles only.

### Acting Identity (Existing)

The Identity a Principal is operating as for the current session. Carried as the `acting_identity` custom claim and MUST always be a key in `identities`.

- **New behavior:** the admin check on every admin-gated endpoint is scoped to `identities[acting_identity]` — an admin acting as a non-admin Identity is denied (403) and must switch back.

## 7. Assumptions

- The platform owner has exactly one Identity in Phase 1; the `admin` role is seeded onto that Identity's roles array (`["owner", "admin"]`).
- The `from-the-hart-auth` repository may be public; the admin seed script is therefore designed to contain no secrets and authenticate via ADC.
- Logout revocation depends on the gateway forwarding the end-user `Authorization` header to `GET /auth/logout`; this is a **gateway contract obligation**, not an Auth implementation detail. The website MUST send the Bearer token on the logout request. (The gateway currently forwards headers unconditionally, so no gateway change is anticipated — but the authoritative guarantee is the gateway spec's responsibility.)
- The website sends the Bearer ID token on `GET /auth/lookup` and the entitlement endpoints (the gateway `validateAccessToken: true` pathRules enforce this).
- `firebase-admin` v13's `verifyIdToken`, `getUser`, `getUserByEmail`, `setCustomUserClaims`, and `revokeRefreshTokens` are available and already used by the service.
- The one-off admin seed script is run manually by the owner in a controlled environment (not part of app startup), using credentials that hold Firebase Admin permissions, and is idempotent.
- "Me + a few others" means a single-digit number of Principals receive entitlements; no scale, rate-limit, or revocation-propagation machinery is warranted.
- The gateway continues to be the sole public entry point; direct service access is blocked by Cloud Run IAM (unchanged).
- Logout revocation is DORMANT until the Website spec adds `Authorization: Bearer <id_token>` to `GET /auth/logout` (verified: the website currently sends no Authorization header on logout). Until then, `invalidateUserTokens` receives no token and revocation is skipped — cookie deletion remains the only logout barrier. This is a deferred cross-spec obligation.
- Token-validation layering: for requests with an invalid/missing token, the gateway returns its OWN 401 envelope (it runs `validateAccessToken: true` first); Auth's 401 ACs apply only to requests that actually reach Auth (e.g. a token that passes gateway caching but fails `verifyIdToken`).
- The existing Cloud Run service identity already holds the Firebase Auth permissions used today and the new calls (`getUser`, `getUserByEmail`, `revokeRefreshTokens`) require NO IAM changes; a missing permission would surface as a permission-denied error and map to 500 per NFR-14.
- There is exactly one admin Principal in Phase 1; concurrent admin writes are therefore impossible in practice. The scale assumption (single-digit writes/week) makes last-write-wins acceptable.

## 8. Constraints

- **Technology:** TypeScript, Fastify v5, TypeBox, Node.js 22, Firebase Admin v13. No new npm dependencies — `firebase-admin` and `jsonwebtoken` already cover every need; any addition requires explicit justification.
- **Envelope:** success `{ data: ... }`, error `{ error: { message: "..." } }` — no other shapes.
- **Claims:** GCP custom claims payload MUST stay ≤ 1000 bytes.
- **No secrets in-repo:** the admin seed script MUST NOT commit service account keys, target UIDs/emails, or any credential; it authenticates via ADC.
- **Cross-repo:** the ONLY file outside `from-the-hart-auth` this spec may touch is `from-the-hart-tech-api-reverse-proxy-worker/src/routes.ts` (new pathRules). Gateway enforcement logic is out of scope.
- **No new routes beyond:** `GET /auth/lookup`, `POST /auth/entitlements`, `POST /auth/entitlements/revoke` (plus the un-commenting of the existing logout revocation).
- **Tests:** hermetic — no live network calls; Firebase/Identity/gateway calls mocked per existing `tests/` patterns.

## 9. Non-Goals (Deferred — MUST NOT be implemented)

| Feature | Why deferred |
|---------|-------------|
| Role management (`POST`/`DELETE /auth/identities/{id}/roles`) | Owner decision 2026-11-23 — claims shape supports it later; nothing built now |
| Switch acting identity (`POST /auth/switch-identity`) | Owner decision 2026-11-23 — deferred |
| `viewer` role work (grant/revoke/enforcement) | Future-flexibility not yet thought through |
| DELETE identity / ownership transfer / multiple owners | Architecture doc open questions 1, 2, 6 |
| Roles beyond `owner`/`viewer`/`admin`; fine-grained permissions | Roles imply permissions; fine-grained is a separate concern |
| Gateway enforcement logic (entitlement/role claim checks at edge) | Separate gateway spec |
| Gateway `/auth/verify-id-token` cache invalidation / TTL changes | Separate gateway spec (Option C accepted here) |
| Website role-based UI / switch-identity UX | Separate website spec |
| Storage entitlement enforcement + UID→Identity migration (TODO #15) | Separate storage spec |
| Identity service changes of any kind | Identity service behavior is frozen for this spec |
| Admin UI / website changes for entitlement grant/revoke | Out of scope — verification is via curl/HTTP only |
| List-entitlements (read) endpoint | Deferred — inspect via Firebase console / Admin SDK until added |

**Invariant recorded (not built):** no Principal can remove their own `owner` role; ownership transfer is impossible this phase. This is enforced implicitly because there are no role-management endpoints — nothing to build, but the invariant constrains any future role-management spec.

## 10. Edge Cases

### Input validation

- **EC-01:** `GET /auth/lookup` with missing/empty/invalid `email` → 400 `{ error: { message: "Invalid email format" } }` (TypeBox query schema).
- **EC-02:** Entitlement body with missing `principal_uid` or `entitlement` → 400 (TypeBox). `entitlement` empty or whitespace-only (after trim) → 400 (AC-09). `entitlement` with leading/trailing whitespace (e.g. `" storage "`) → trimmed to `"storage"` and stored (AC-10). `principal_uid` empty → 400.

### Unauthorized / fail-closed (applies to lookup AND entitlements)

- **EC-03:** Caller token valid but has no `acting_identity` claim → 403, no side effects.
- **EC-04:** Caller token valid, `acting_identity` present but NOT a key in `identities` → 403, no side effects (invariant-violating token treated as unauthorized).
- **EC-05:** Caller token valid, `acting_identity` in `identities` but roles array lacks `"admin"` → 403, no side effects (includes an admin acting as a non-admin Identity).
- **EC-06:** Missing/malformed/expired Bearer token on any new endpoint → 401 `{ error: { message: "Unauthorized" } }` (verifyIdToken throws).

### Target / data states

- **EC-07:** Target `principal_uid` does not exist → 404 `{ error: { message: "Principal not found" } }` (AC-08).
- **EC-08:** Grant of an already-present entitlement → 200, no duplicate (idempotent) (AC-11).
- **EC-09:** Revoke of an absent entitlement → 200, claims unchanged (idempotent) (AC-12).
- **EC-10:** Revoke of the last entitlement → `entitlements` claim removed entirely; `identities`/`acting_identity` preserved (AC-13).
- **EC-11:** Target has existing `entitlements` plus `identities`/`acting_identity` — a write MUST preserve every other claim (read-merge-write); a blind write that drops `identities` is a bug.

### Concurrency

- **EC-12:** Two concurrent entitlement writes to the same target Principal → last-write-wins on the entitlement array; read-merge-write still preserves `identities`/`acting_identity` in both writes. No locking is required at this scale (single-digit writes/week). Accepted.

### Capacity

- **EC-13:** A claim write that would exceed the 1000-byte custom claims limit → `setCustomUserClaims` throws → 500 `{ error: { message: "Internal server error" } }`, target unchanged. Accepted — unreachable at this scale (NFR-06).

### Registration invariant

- **EC-14:** A newly registered Principal's claims MUST contain no `"admin"` anywhere and no `entitlements` claim (tested) (AC-14).

### Logout

- **EC-15:** Logout with no Bearer token → revocation skipped, cookie cleared, 200 (AC-17).
- **EC-16:** Logout with invalid/expired token → `invalidateUserTokens` throws inside the try block; cookie still cleared, 200 returned (AC-17).
- **EC-17:** Logout with a valid token but `revokeRefreshTokens` fails (Firebase outage) → error logged at WARN, cookie cleared, 200 returned (graceful degradation).

### Seeding

- **EC-18:** Seed script run twice → idempotent; no duplicate `"admin"` (AC-15).
- **EC-19:** Seed script run against a Principal with no `identities` (e.g. a misconfigured target) → fail loudly with a clear error; never blind-write an empty/malformed claims object.
- **EC-20:** Seed script run without ADC credentials → fails with a clear "credentials not found" error; never falls back to a committed key.

### Third-party failure

- **EC-21:** `adminAuth().getUser`/`getUserByEmail`/`setCustomUserClaims` throws unexpectedly → 500 `{ error: { message: "Internal server error" } }`, no partial write (read-merge-write reads first, so a failed write leaves the target unchanged).
- **EC-22:** Lookup with a mixed-case email (`Friend@Gmail.com`) → delegated to `getUserByEmail` (case-insensitive) → 200 with the same `principal_uid` as the lowercase address.
- **EC-23:** Logout with a revoked-but-not-expired token → `verifyIdToken` throws `auth/id-token-revoked`, caught → 200 + cookie cleared (graceful, same as EC-16).
- **EC-24:** `setCustomUserClaims` applied but the ACK is lost (timeout) → client sees 500 but the write may have committed; grant/revoke are idempotent so a retry is safe. A 5xx on a write is NOT guaranteed no-op.
- **EC-25:** `principal_uid` non-empty but not a valid UID (newlines/unicode) → `getUser` throws `auth/invalid-uid`/`auth/invalid-argument` → 400 (see design §9 error matrix).
- **EC-26:** Malformed JSON body → 400; unsupported `Content-Type` → 415 — both with the `{ error: { message } }` envelope (AC-19).

## 11. Success Criteria

- **SC-01:** The owner can grant and revoke the `"storage"` entitlement to/from a specific Principal via the API in under a minute (manual verification), and the target's next token carries/omits `entitlements` accordingly.
- **SC-02:** A non-admin Principal, or an admin acting as a non-admin Identity, receives 403 with zero side effects (on both lookup and entitlements).
- **SC-03:** 100% of the new endpoints and the seed script are covered by hermetic tests (no live network calls).
- **SC-04:** All 51 existing tests remain green after the logout un-comment and the new additions.
- **SC-05:** A newly registered Principal's token contains no `"admin"` role and no `entitlements` claim (verified by automated test).
- **SC-06:** The admin seed script contains no committed secrets and authenticates via ADC only.
- **SC-07:** The JWT contract, architecture doc, gateway pathRules, and CONTEXT.md glossaries are updated in lockstep with the code.

## 12. Glossary

| Term | Definition |
|------|-----------|
| **Principal** | The authenticated cryptographic entity (Firebase user). Holds credentials; may act as one or more Identities. |
| **Identity** | A domain profile/persona with no credentials. Linked to a Principal via the `identities` custom claim. |
| **Acting Identity** | The Identity a Principal is currently operating as. Carried as `acting_identity`; MUST be a key in `identities`. |
| **Role** | A label in a Principal's `identities[identity_id]` array. Set: `owner`, `viewer` (identity-scoped), `admin` (platform-level). |
| **Owner** | Identity-scoped role; full control over that Identity. Granted automatically at registration; never removed this phase. |
| **Viewer** | Identity-scoped role; read-only. Deferred — no endpoints or enforcement this phase. |
| **Admin** | Platform-level role meaning "administers the platform" (entitlement grants + lookup today). Carried on the owner's Identity roles array for JWT propagation; authorization checks read it from `identities[acting_identity]` only. Seeded out-of-band, never at registration. |
| **Entitlement** | A Principal-level (global) capability string (e.g. `"storage"`). Carried as the top-level `entitlements: string[]` custom claim. Orthogonal to Identity roles. Free-form; enforced by each domain service. |
| **Read-merge-write** | The required pattern for `setCustomUserClaims`: read existing claims → merge the delta → preserve all other claims → write back. `setCustomUserClaims` REPLACES all claims; a naive write destroys sibling relationships. |
| **Staleness window** | Delay between a claims change and its propagation to a Principal's already-issued token. ≤ 1 hour for entitlement changes (ID token lifetime); ≤ 10 minutes for logout revocation at the gateway (verify-id-token cache). |
| **Token revocation** | `revokeRefreshTokens(uid)` — invalidates all refresh tokens for a Principal, forcing re-login. Used for self-initiated actions (logout) only. |

## 13. Open Questions

**None.** All previously-open decisions are resolved:

- **OQ-01 (admin check scope) — RESOLVED:** the admin check is **acting-identity-scoped only** — `identities[acting_identity]` must include `"admin"`, fail-closed (see REQ-04). An admin acting as a non-admin Identity is denied (403) and must switch back.
- **Lookup authorization — RESOLVED:** lookup is admin-gated (same check as entitlements).
- **Seed-script security — RESOLVED:** the script runs out-of-band, authenticates via ADC, takes the target as runtime input, and commits no secrets (see REQ-17/18/19, NFR-08).
