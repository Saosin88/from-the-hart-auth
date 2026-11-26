# Design: Access Control (Auth Service)

> Traces to `requirements.md`. Every decision below cites the AC/REQ it addresses.

## 1. Architecture Overview

### Request path for admin-gated endpoints

```
Website (Browser)
  │  Authorization: Bearer <id_token>
  ▼
API Gateway (Cloudflare Worker)
  │  pathRules: /auth/lookup               → validateAccessToken: true
  │             /auth/entitlements         → validateAccessToken: true
  │             /auth/entitlements/revoke  → validateAccessToken: true
  │  → calls POST /auth/verify-id-token (10-min cached) to validate the ID token
  │  → forwards the end-user Authorization header + X-Serverless-Authorization (Google ID token)
  │    (header forwarding is a gateway contract obligation — see §6.3)
  ▼
Auth Service (Cloud Run, Fastify)
  │  controller (thin) → service (authService)
  │  1. adminAuth().verifyIdToken(id_token)          → crypto-verify (REQ-01)
  │  2. require admin: identities[acting_identity] includes "admin"  (REQ-04)
  │  3. adminAuth().getUserByEmail(email) | getUser(uid)  → resolve target (REQ-07/13)
  │  4. adminAuth().getUser(uid).customClaims → read-merge-write → setCustomUserClaims (REQ-02)
  ▼
GCP Identity Platform (Firebase Admin)
```

### Logout revocation

```
Website → GET /auth/logout (Authorization: Bearer <id_token>)
  Auth Service logout handler:
    - invalidateUserTokens(id_token)   ← UN-COMMENTED (REQ-20)
        verifyIdToken → uid → revokeRefreshTokens(uid)
    - clear refresh_token cookie + 200  (REQ-21)
  Gateway cache on /auth/verify-id-token UNCHANGED (max-age=600) — ≤10-min staleness accepted (REQ-22).
  Cache invalidation is a gateway-spec concern, out of scope here (see §6.3 / ADR-0005).
```

### Admin seeding (out-of-band)

```
Owner (local shell)
  GOOGLE_APPLICATION_CREDENTIALS=<service-account-key, NOT in repo> \
  TARGET_PRINCIPAL_EMAIL=<owner email> \
  npx ts-node scripts/seed-admin.ts
    → initializeFirebaseAdmin (ADC) → resolve uid → read claims
    → mergeAdminRole(claims): ["owner"] → ["owner","admin"]  (pure, idempotent)
    → setCustomUserClaims(uid, merged)
```

### Key design properties

| Property | How achieved | Traces |
|----------|-------------|--------|
| Admin gate | `identities[acting_identity]` includes `"admin"`, crypto-verified | REQ-04, AC-04/06/07 |
| Fail closed | missing/absent `acting_identity` or no `admin` → 403, no side effects | NFR-04, EC-03/04/05 |
| Read-merge-write | `getUser().customClaims` → merge → `setCustomUserClaims` | REQ-02, EC-11 |
| `acting_identity` invariant | preserved by merge; never rewritten | REQ-03 |
| No self-granting | only admins can call; admin seeded out-of-band, never at registration | REQ-16/17, AC-14 |
| Staleness (entitlements) | no `revokeRefreshTokens`; ≤1h (ID token lifetime) | REQ-15, NFR-07 |
| Staleness (logout) | gateway cache unchanged; ≤10min accepted; invalidation out of scope | REQ-22, NFR-07 |

## 2. Technology Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Language | TypeScript 5.x | Existing project standard |
| Framework | Fastify v5 | Existing, unchanged |
| Validation | TypeBox (`@sinclair/typebox`) | Existing; runtime validation + OpenAPI generation |
| Auth Provider | GCP Identity Platform via `firebase-admin` v13 | Existing; `verifyIdToken`, `getUser`, `getUserByEmail`, `setCustomUserClaims`, `revokeRefreshTokens` |
| Token parsing (client-side contract) | none added | JWT payload decoded by *downstream* services, not Auth |
| Config | Environment variables | Existing `src/config/index.ts` pattern; no new env vars required for this feature (seed script reads `GOOGLE_APPLICATION_CREDENTIALS` + a target var directly) |
| Logging | Pino (Fastify logger) | Existing structured JSON logging |
| Testing | Vitest + supertest | Existing; `vi.mock()` hermetic mocks |
| Deployment | GCP Cloud Run (Docker) | Unchanged |
| Seed script | `ts-node` one-off script | Manual, out-of-band; reuses `firebase-admin` + ADC |

**No new npm dependencies.** `firebase-admin` + `jsonwebtoken` cover everything (REQ constraint, brief §6).

## 3. Architecture Decisions

> These are documented here in full; tasks.md materializes them as `docs/adr/0003-*.md` … `0005-*.md` files during implementation (the root `docs/` tree is outside this repo's spec directory).

### ADR-0003: Entitlements Authorization via Acting-Identity-Scoped `admin` Role

- **Context:** The owner must be the only party who can grant/revoke entitlements, and the mechanism must be real security, not hand-waving. Three options existed: (A) an env-var allowlist of admin UIDs/emails, (B) a script-only approach with no HTTP endpoint, (C) a bootstrap `manage_entitlements` entitlement. The brief's original §4.4 recommended (A), but the owner's final decision selected a JWT-carried `admin` role. Addresses REQ-04, REQ-11, AC-04/06/07, NFR-03/04.
- **Options considered:**
  1. **Env-var allowlist** (`ENTITLEMENT_ADMIN_UIDS`/`..._EMAILS`): simple, but rotation = env change + redeploy, and it duplicates identity state that already lives in the JWT.
  2. **Script-only (no endpoint):** smallest HTTP attack surface, but the owner explicitly wants an endpoint.
  3. **Bootstrap entitlement** (`manage_entitlements`): recursive-authority model; more powerful but more moving parts and a second bootstrap secret to seed.
  4. **JWT-carried `admin` role (chosen):** the caller's crypto-verified token must have `identities[acting_identity]` include `"admin"`.
- **Decision:** Use the JWT-carried `admin` role, checked **acting-identity-scoped**. `admin` is a platform-level role carried on the owner's own Identity entry purely for JWT propagation; authorization reads it from the currently-acting Identity only.
- **Rationale:** Capabilities for a request are always the roles of the Identity currently being acted as — `admin` is no exception. The `identities` map says what a Principal *could* be; `acting_identity` says what they *are*. An admin acting as a non-admin Identity is denied (403) and must switch back. This is consistent with how the Identity service already reads roles, requires zero config (no env allowlist to rotate), and every service sees admin-ness in the token with zero changes.
- **Consequences:** Requires the `admin` role to be seeded out-of-band (ADR-0004). The check fails closed if `acting_identity` is missing or not in `identities`. Registration must never grant `admin` (hard requirement, tested). If an admin is acting as a non-admin Identity, they must switch back to administer — this is intended behavior.

### ADR-0004: Out-of-Band Admin Seeding via Manual ADC Script

- **Context:** `admin` must not be grantable at registration (which would let anyone self-administer). It must be seeded onto the owner's existing `["owner"]` entry. The repo may be public, so the seeding mechanism must not commit secrets. Addresses REQ-16/17/18/19, AC-14/15, NFR-05/08.
- **Options considered:**
  1. **Firebase console (click-ops):** works but violates P7/P8 (IaC day one, immutable infra) and is not reproducible.
  2. **Env-var allowlist as the admin source** (rejected in ADR-0003): would avoid seeding, but has rotation/redundancy drawbacks.
  3. **Manual ADC script (chosen):** `scripts/seed-admin.ts`, run by the owner, authenticates via `GOOGLE_APPLICATION_CREDENTIALS`.
- **Decision:** A committed but secret-free TypeScript script. It initializes Firebase Admin via ADC, resolves the target by `TARGET_PRINCIPAL_EMAIL` or `TARGET_PRINCIPAL_UID`, reads claims, calls a pure `mergeAdminRole(claims)` to turn `["owner"]` into `["owner","admin"]`, and writes back via `setCustomUserClaims`.
- **Rationale:** Reproducible (a script, not click-ops), safe to keep in a public repo (no credentials, no target identifiers committed), idempotent (re-run is a no-op), and testable (the merge logic is a pure function). The service-account key lives on the owner's machine / Secret Manager, not the repo.
- **Consequences:** Seeding is a manual, one-off operator action — acceptable because there is exactly one owner. The script must never be wired into startup, CI, or Terraform. `mergeAdminRole` targets the single Identity entry that already holds `"owner"` (valid for Phase 1's one-Identity invariant); a future multi-Identity owner would need an explicit `identity_id` input.

### ADR-0005: Logout Revocation with Accepted ≤10-Minute Staleness (TODO #10, Option C)

- **Context:** `invalidateUserTokens()` is currently commented out in the logout handler. Enabling it revokes refresh tokens server-side, but the gateway caches `/auth/verify-id-token` responses for 10 minutes (`Cache-Control: max-age=600`), so a revoked token can still pass gateway validation for up to 10 minutes. Addresses REQ-20/21/22, AC-16/17, NFR-07/13.
- **Options considered:**
  1. **Shorten the gateway cache TTL** (e.g. to 60s): shrinks staleness but increases Auth load (a verify call per uncached request).
  2. **Cache-busting** (logout pushes an invalidation event to the gateway via Cloudflare KV/custom header): immediate revocation but adds KV infra and gateway coupling.
  3. **Accept the staleness (chosen):** un-comment `invalidateUserTokens()`, keep the 10-min cache unchanged; cookie deletion remains the primary logout barrier; revocation is defense-in-depth.
- **Decision:** Option C.
- **Rationale:** The cache exists on purpose — it avoids a network call to Auth per gateway request. Cookie deletion already terminates the session for the browser; revocation specifically protects against a *stolen* refresh token, a lower-probability threat. Adding KV/cache-busting is disproportionate complexity for a personal-scale system. Simplest honest answer: document the ≤10-minute window as an accepted NFR.
- **Consequences:** A stolen ID token remains gateway-valid for up to 10 minutes after logout; a stolen refresh token remains usable until its own 30-day expiry or the next `revokeRefreshTokens` — but the latter is now invoked on logout. No new infra. This decision becomes a binding note for the gateway spec. If immediate revocation is later required, cache-busting (KV) or a shorter TTL is a **gateway-spec** change, not an Auth change — explicitly out of scope for this spec.

### Decision 6: `/auth/verify-id-token` Stays Boolean-Only

- **Context:** The gateway calls `POST /auth/verify-id-token` and reads `{ data: { valid: boolean } }`. It does not inspect claims today. Addresses REQ-23 and the brief §5.2 contract obligation.
- **Options considered:** (a) return full claims from the endpoint, (b) keep boolean-only and let the gateway decode the JWT payload locally.
- **Decision:** Keep boolean-only.
- **Rationale:** The gateway has already crypto-verified the token via this endpoint; decoding the JWT payload locally (base64) is a no-crypto operation — no second verification needed and no claims transport over the wire. Keeping the response boolean preserves the existing gateway contract and avoids coupling Auth's response shape to future claim-checking in the gateway.
- **Consequences:** The gateway spec is responsible for base64-decoding claims when it adds claim checks (a separate later spec). Auth's `/auth/verify-id-token` contract is frozen as `{ data: { valid } }`. (No dedicated AC — the contract is frozen; see REQ-23.)

### Decision 7: `entitlements` Claim — Free-Form Values, Absent == Empty

- **Context:** The `entitlements` claim is `string[]`. Two sub-decisions: (a) validate values against an allowlist, or accept any non-empty string; (b) represent "none" as `[]` or as an absent claim. Addresses REQ-14/23, AC-10/13, NFR-06.
- **Decision:** (a) free-form, no central validation (each domain service enforces the exact string it expects); (b) the claim is **absent** when empty — present only when the Principal holds ≥1 entitlement.
- **Rationale:** Free-form keeps the claim shape extensible without Auth changes ("beta", "projects_admin", etc. all work today); a typo simply never matches anything downstream and is inert — safe by construction. Absent == empty minimizes token size and avoids carrying `[]` noise in every token.
- **Consequences:** Auth cannot prevent a typo'd entitlement from being granted; that is a domain-service concern (documented in the JWT contract). Consumers MUST treat a missing `entitlements` claim identically to an empty array.

### Decision 8: `POST /auth/entitlements/revoke` Instead of DELETE-with-body

- **Context:** The original endpoint shape was `DELETE /auth/entitlements` with a JSON body. Addresses REQ-10, AC-12/13.
- **Options considered:** (a) `DELETE /auth/entitlements` with body, (b) `POST /auth/entitlements/revoke` with body.
- **Decision:** `POST /auth/entitlements/revoke` (same `{ principal_uid, entitlement }` body).
- **Rationale:** DELETE-with-body is non-standard and would require a gateway method-allowlist change (allowing the DELETE method through the proxy) — a gateway concern outside the Auth domain. A second POST route keeps this spec domain-pure: the gateway already forwards POST bodies, so only the standard `validateAccessToken: true` pathRules are needed.
- **Consequences:** Slightly non-RESTful (revoke is a verb in the path), but consistent, unambiguous, and avoids cross-domain gateway changes. Grant and revoke are now symmetric POST operations.

## 4. Data Model

### Custom Claims Schema (extended)

```typescript
interface CustomClaims {
  identities: Record<string, string[]>; // identity_id → roles; e.g. { "<uuid>": ["owner", "admin"] }
  acting_identity: string;              // MUST be a key in identities (REQ-03)
  entitlements?: string[];              // NEW — absent when empty (Decision 7)
}
```

- `entitlements` is a top-level, Principal-level (global) capability list — **orthogonal** to the per-Identity `identities` map.
- `admin` lives **inside** an Identity's roles array (`identities[<uuid>]`), not as a top-level claim. It is platform-level in *meaning* but carried in the roles array for JWT propagation (ADR-0003).

### Byte budget (1000-byte GCP limit)

| Component | Approx. bytes |
|-----------|---------------|
| `identities` with one `["owner"]` entry | ~60 |
| `acting_identity` (UUID) | ~53 |
| Subtotal (today's registration) | ~113 |
| `entitlements:["storage"]` (key + array + one value) | ~26 |
| `admin` added to the owner's roles array | ~8 |
| **Total for owner (1 identity, admin, 1 entitlement)** | **~147** |

Headroom: >800 bytes remaining. A Principal would need ~30+ entitlements or ~16 identities to approach the limit — unreachable at this scale (NFR-06). If ever approached, the architecture doc's fallback (move full identity list to the Identity service, keep only `acting_identity` + roles in the JWT) applies.

### Entitlement

- **Type:** free-form non-empty string (no enum, no allowlist).
- **Storage:** only as an element of the Principal's `entitlements` custom claim array. No separate persistence.
- **Semantics:** interpreted solely by the domain service that owns the capability (e.g. Storage checks for the literal `"storage"`).

### Principal (existing, no schema change)

- Reads via `adminAuth().getUser(uid)` / `getUserByEmail(email)`; writes via `setCustomUserClaims(uid, merged)`.
- `uid` is the Firebase UID (== `user_id`/`sub` claim).

## 5. API / Interface Design

> All new routes follow the existing `routes/auth.ts` pattern: TypeBox body/query schemas, full OpenAPI `description`/`summary`/`response`/`examples`. Success envelope `{ data }`, error envelope `{ error: { message } }`.

### 5.1 `GET /auth/lookup`

- **Auth:** `Authorization: Bearer <id_token>` — crypto-verified (`verifyIdToken`), then admin check (REQ-04/06).

| Aspect | Detail |
|--------|--------|
| Query | `email` (required, `format: "email"`) |
| 200 | `{ "data": { "principal_uid": "abc123..." } }` |
| 400 | `{ "error": { "message": "Invalid email format" } }` |
| 401 | `{ "error": { "message": "Unauthorized" } }` |
| 403 | `{ "error": { "message": "Forbidden" } }` |
| 404 | `{ "error": { "message": "Principal not found" } }` |
| 500 | `{ "error": { "message": "Internal server error" } }` |

**Example request/response:**
```
GET /auth/lookup?email=friend@gmail.com
Authorization: Bearer <admin id_token>

200 OK
{ "data": { "principal_uid": "abc123..." } }
```

### 5.2 `POST /auth/entitlements` (grant) and `POST /auth/entitlements/revoke` (revoke)

- **Auth:** `Authorization: Bearer <id_token>` — crypto-verified, then admin check (REQ-04/11).
- **Body (both endpoints):** `{ "principal_uid": "abc123...", "entitlement": "storage" }` (TypeBox: both required, `minLength: 1`; the controller trims `entitlement` and rejects empty-after-trim with 400 per REQ-14).

| Aspect | Detail |
|--------|--------|
| 200 | `{ "data": { "principal_uid": "abc123...", "entitlement": "storage" } }` |
| 400 | `{ "error": { "message": "..." } }` (TypeBox validation failure) |
| 401 | `{ "error": { "message": "Unauthorized" } }` |
| 403 | `{ "error": { "message": "Forbidden" } }` |
| 404 | `{ "error": { "message": "Principal not found" } }` |
| 500 | `{ "error": { "message": "Internal server error" } }` |

**Semantics:** grant appends (no duplicates); revoke removes; both idempotent (AC-11/12). Revoking the last entitlement removes the `entitlements` claim entirely (AC-13).

### 5.3 `GET /auth/logout` (modified)

- Un-comment `invalidateUserTokens(idToken)`; token read from `Authorization` header (REQ-20).
- Response unchanged: 200 `{ "data": { "success": true, "message": "Logged out successfully" } }`; `refresh_token` cookie cleared (REQ-21).
- No Bearer token / invalid token → revocation skipped or fails internally, still 200 + cookie cleared (AC-17).
- **Dormant until the Website sends the token:** the website currently sends NO `Authorization` header on `GET /auth/logout`, so revocation is a no-op until the Website spec adds it (deferred cross-spec obligation — see requirements §7 Assumptions).

### 5.4 `POST /auth/verify-id-token` (unchanged — contract frozen)

- Returns `{ "data": { "valid": boolean } }` with `Cache-Control: public, max-age=600` (Decision 6). No change.

### 5.5 Service-layer interfaces

**`src/utils/claims.ts` (NEW — pure, no imports, no side effects):**

```typescript
export function hasAdminRole(claims: {
  acting_identity?: unknown;
  identities?: Record<string, string[]>;
}): boolean;

export function mergeEntitlement(
  claims: Record<string, unknown>,
  entitlement: string,
  add: boolean
): Record<string, unknown>;

export function mergeAdminRole(claims: Record<string, unknown>): Record<string, unknown>;

export function parseSeedTarget(env: Record<string, string | undefined>):
  { kind: "email" | "uid"; value: string };
```

These are pure and unit-tested hermetically (no Firebase). `hasAdminRole` implements the fail-closed admin predicate (REQ-04). `mergeEntitlement` is the read-merge-write delta (preserve all keys; add/remove the entitlement; delete the key when empty). `mergeAdminRole` appends `"admin"` to the identity entry holding `"owner"` (idempotent). `parseSeedTarget` validates the seed script's target input (exactly one of email/UID).

**`src/services/authService.ts` (EXTENDED — Auth-domain access-control logic, alongside the existing `verifyIdToken`/`invalidateUserTokens`):**

Rationale: the repo's `src/services/` files each wrap one external integration boundary (`firebase.ts` → firebase-admin, `emailService.ts` → nodemailer, `identityService.ts` → google-auth-library/HTTP) plus one Auth-domain orchestrator (`authService.ts`). The claims operations introduce **no new integration** — they use the same `adminAuth` — so they belong in `authService.ts`, not a second service file. Pure logic stays in `utils/claims.ts` (mirroring `utils/validator.ts`).

```typescript
export class AdminAuthorizationError extends Error {} // name === "AdminAuthorizationError"

export const lookupPrincipal = async (idToken: string, email: string): Promise<{ principal_uid: string }>;
export const grantEntitlement = async (idToken: string, principal_uid: string, entitlement: string): Promise<{ principal_uid: string; entitlement: string }>;
export const revokeEntitlement = async (idToken: string, principal_uid: string, entitlement: string): Promise<{ principal_uid: string; entitlement: string }>;

// internal (not HTTP): verifyIdToken → hasAdminRole → throw AdminAuthorizationError if not admin
async function verifyAdminCaller(idToken: string): Promise<{ uid: string; actingIdentity: string }>;
```

The pure logic lives in `claims.ts` so the seed script can import `mergeAdminRole` WITHOUT pulling in `firebase.ts` → `config` (which fail-fasts on `IDENTITY_SERVICE_URL` and would needlessly block a standalone script).

**Testability contract:** tests mock `src/services/firebase`'s `adminAuth()` export, whose current shape is `() => Auth` from `firebase-admin`. The new services call only `adminAuth().verifyIdToken`, `.getUser`, `.getUserByEmail`, `.setCustomUserClaims`, and `.revokeRefreshTokens` — all already present on the mock in `tests/services/authService.test.ts`.

### 5.6 Seed script (`scripts/seed-admin.ts`, new)

- Inputs (env): `TARGET_PRINCIPAL_EMAIL` XOR `TARGET_PRINCIPAL_UID` (exactly one); `GOOGLE_APPLICATION_CREDENTIALS` (ADC); `FIREBASE_PROJECT_ID`.
- Steps: validate `FIREBASE_PROJECT_ID` is set (else exit 1) → `admin.initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID })` directly (ADC) — NOT via `src/services/firebase.ts` (which fail-fasts on `IDENTITY_SERVICE_URL`) → resolve uid → `getUser(uid).customClaims ?? {}` → `mergeAdminRole` → `setCustomUserClaims` → **read back `getUser(uid).customClaims` and assert `admin` is present on the owner's entry** → print `SUCCESS: admin role granted to <uid>` and exit 0, or exit 1 with the actual roles if the read-back fails.
- Exits non-zero with a clear error on: missing `FIREBASE_PROJECT_ID`, missing/ambiguous target, missing ADC credentials, no `owner` identity found, or read-back verification failure (EC-19/20).

## 6. Contract Obligations (for other specs)

### 6.1 JWT contract additions

Top-level custom claim `entitlements: string[]` (absent == empty). The `admin` role appears **inside** `identities[<id>]`.

**Before (today's registration):**
```json
{
  "iss": "https://securetoken.google.com/<project>",
  "aud": "<project>",
  "sub": "abc123...",
  "user_id": "abc123...",
  "email": "sheldon@example.com",
  "email_verified": true,
  "auth_time": 1730000000,
  "iat": 1730000000,
  "exp": 1730003600,
  "firebase": { "identities": { "email": ["sheldon@example.com"] }, "sign_in_provider": "password" },
  "identities": { "550e8400-e29b-41d4-a716-446655440000": ["owner"] },
  "acting_identity": "550e8400-e29b-41d4-a716-446655440000"
}
```

**After (owner, post-seeding, with a storage entitlement):**
```json
{
  "...": "… same standard claims …",
  "identities": { "550e8400-e29b-41d4-a716-446655440000": ["owner", "admin"] },
  "acting_identity": "550e8400-e29b-41d4-a716-446655440000",
  "entitlements": ["storage"]
}
```

**After (a grantee, e.g. friend):**
```json
{
  "...": "… same standard claims …",
  "identities": { "<friend-identity-uuid>": ["owner"] },
  "acting_identity": "<friend-identity-uuid>",
  "entitlements": ["storage"]
}
```

**Consumer rules (binding for downstream specs):** treat a missing `entitlements` claim as `[]`; interpret entitlement values as free-form strings; `admin` is read from `identities[acting_identity]` only.

### 6.2 `/auth/verify-id-token` contract

Frozen: `{ data: { valid: boolean } }` + `Cache-Control: public, max-age=600`. The gateway decodes the JWT payload locally (base64, no crypto) for any claim checks. **No change.**

### 6.3 Gateway route config (the one allowed cross-repo change)

Add to `apiEndpointsMap.<env>.auth.pathRules` for `local`, `dev`, and `prod` in `from-the-hart-tech-api-reverse-proxy-worker/src/routes.ts`:

| Path | `validateAccessToken` | `validateTurnstileToken` | `cacheable` |
|------|----------------------|--------------------------|-------------|
| `/auth/lookup` | `true` | `false` | `false` |
| `/auth/entitlements` | `true` | `false` | `false` |
| `/auth/entitlements/revoke` | `true` | `false` | `false` |

`/auth/logout` requires **no** gateway pathRule change. It carries a **contract obligation on the gateway**: the end-user `Authorization` header MUST be forwarded to `GET /auth/logout` so the Auth service can read the token for revocation. (The gateway currently forwards headers unconditionally; the authoritative guarantee is the gateway spec's responsibility.) Additionally, the Website MUST send `Authorization: Bearer <id_token>` on logout — currently it sends none, so revocation is dormant until the Website spec adds it (deferred cross-spec obligation).

### 6.4 OpenAPI/TypeBox contract (mandatory)

New schemas in `src/models/AuthSchemas.ts`:

```typescript
PrincipalLookupQuerySchema   = Type.Object({ email: Type.String({ format: "email", minLength: 5, maxLength: 254 }) });
PrincipalLookupResponseSchema= Type.Object({ principal_uid: Type.String({ minLength: 1 }) });
EntitlementRequestSchema    = Type.Object({
  principal_uid: Type.String({ minLength: 1 }),
  entitlement:  Type.String({ minLength: 1 }),
});
EntitlementResponseSchema   = Type.Object({
  principal_uid: Type.String({ minLength: 1 }),
  entitlement:  Type.String({ minLength: 1 }),
});
```

Each route gets a full OpenAPI `schema` block (description, summary, `body`/`querystring`, `response` for 200/400/401/403/404/500, and examples), mirroring the existing `routes/auth.ts` style.

### 6.5 Documentation updates (tasks)

- `docs/architecture/identity-and-access.md`: add `entitlements` + `admin` role to the JWT contract and role definitions; move lookup from "Deferred" to "Specified (see auth specs/access-control/)".
- Master `CONTEXT.md` + auth `CONTEXT.md`: add `Entitlement` and platform-level `admin` glossary entries.
- `docs/adr/0003-*.md`, `0004-*.md`, `0005-*.md`: materialize the ADRs above.

## 7. Security Considerations

### Authentication

| Actor | Mechanism |
|-------|-----------|
| Website → Gateway | End-user ID token (`Authorization: Bearer`), validated by gateway via cached `/auth/verify-id-token` |
| Gateway → Auth | Google ID token (`X-Serverless-Authorization`), Cloud Run IAM (unchanged) |
| Auth → GCP Identity Platform | Firebase Admin SDK (ADC), unchanged |
| Owner → seed script | Firebase Admin SDK ADC (`GOOGLE_APPLICATION_CREDENTIALS`) |

### Authorization (permissions matrix)

| Endpoint | Required |
|----------|----------|
| `GET /auth/lookup` | `identities[acting_identity]` includes `"admin"` |
| `POST /auth/entitlements` | `identities[acting_identity]` includes `"admin"` |
| `POST /auth/entitlements/revoke` | `identities[acting_identity]` includes `"admin"` |
| `GET /auth/logout` | none (revocation best-effort if token present) |

The admin check is identical everywhere (REQ-04) and **fails closed**: missing `acting_identity`, `acting_identity` not in `identities`, or no `admin` on the acting Identity → 403 with zero side effects (NFR-04).

### Data protection

- **In transit:** HTTPS end-to-end (Cloud Run/Cloudflare enforce TLS). Bearer tokens over HTTPS only.
- **At rest:** no new Auth-side persistence; claims live on the Principal record in GCP Identity Platform.
- **PII:** lookup transmits an email in the query string (already present in the JWT `email` claim); the response returns only a UID (REQ-08). Entitlement grants do not echo email.
- **Error messages:** generic; internal error details are logged server-side only (NFR-14).

### Input validation

| Input | Where | How |
|-------|-------|-----|
| `email` (lookup query) | route + TypeBox | `format: "email"`, minLength/maxLength |
| `principal_uid`, `entitlement` | route + TypeBox | required, `minLength: 1` |
| Bearer token | service | `verifyIdToken` (crypto) |

### Rate limiting

None added — admin-gated endpoints are owner-only, single-digit requests/week. Cloud Run concurrency controls apply as a backstop. The gateway's Turnstile/rate-limit logic is not modified for these endpoints.

### Seed script security

No secrets, credentials, or target identifiers committed (REQ-18/19, NFR-08). Credentials via ADC only; target via env var; manual run; not in CI/startup/Terraform. `mergeAdminRole` errors loudly on malformed claims (EC-19) and on missing ADC (EC-20).

## 8. Performance Considerations

### Expected load

Single-digit requests per week (owner-initiated). Effectively zero concurrency.

### Performance targets

| Operation | Target |
|-----------|--------|
| Service-side logic (excluding Firebase Admin round-trips) | P99 < 200ms (NFR-01) |
| `verifyIdToken` + one `getUser` + one `setCustomUserClaims` | ~3 Firebase Admin calls worst case |

### Optimization

None needed. The only hot path (`/auth/verify-id-token`) is unchanged and already cached at the gateway.

### Monitoring

| Metric | Source | Alert threshold |
|--------|--------|-----------------|
| Entitlement grant/revoke | INFO log (`grantEntitlement`/`revokeEntitlement`) | none (low volume) |
| Admin-gate failures | WARN log (reason) | investigate repeated 403s (possible misconfigured `acting_identity`) |
| Lookup 404 | INFO log | none (normal outcome) |
| `setCustomUserClaims`/`getUser` errors | ERROR log | > 0 (Firebase outage) |
| Logout revocation failure | WARN log | none (graceful) |

## 9. Error Handling

### Error response format (unchanged)

```json
{ "error": { "message": "..." } }
```

### Error matrix

| Endpoint | Scenario | Status | Message |
|----------|----------|--------|---------|
| lookup | invalid email format | 400 | `Invalid email format` |
| lookup / entitlements | missing/invalid token | 401 | `Unauthorized` |
| lookup / entitlements | non-admin / missing acting_identity | 403 | `Forbidden` |
| lookup | email not found | 404 | `Principal not found` |
| entitlements | `principal_uid` not found | 404 | `Principal not found` |
| entitlements | body validation failure | 400 | TypeBox message |
| entitlements | malformed JSON body | 400 | Fastify message, service envelope |
| entitlements | unsupported `Content-Type` | 415 | `Unsupported Media Type`, service envelope |
| lookup / entitlements | Firebase Admin error (unexpected) | 500 | `Internal server error` |
| logout | no/invalid token | 200 | `Logged out successfully` (revocation skipped) |

### Error class mapping (controller)

- `AdminAuthorizationError` (custom, `name === "AdminAuthorizationError"`) → 403.
- `FirebaseAuthError` `auth/user-not-found` → 404.
- `FirebaseAuthError` from `verifyIdToken` (`auth/id-token-expired`, `auth/argument-error`, `auth/invalid-id-token`, `auth/id-token-revoked`) → 401.
- Any other `FirebaseAuthError` / unexpected `Error` → 500 `Internal server error`.

**`FirebaseAuthError` code mapping (explicit — no silent fall-through):**

| `error.code` | Status | Message |
|--------------|--------|---------|
| `auth/user-not-found` | 404 | `Principal not found` |
| `auth/invalid-uid`, `auth/invalid-argument` | 400 | `Invalid principal_uid` |
| `auth/id-token-expired`, `auth/id-token-revoked`, `auth/invalid-id-token`, `auth/argument-error` | 401 | `Unauthorized` |
| anything else (`auth/internal-error`, `auth/user-disabled`, `auth/certificate-fetch-error`, …) | 500 | `Internal server error` |

New codes MUST be added explicitly to this table; they do not silently remap.

**No retry:** `getUser`/`getUserByEmail`/`setCustomUserClaims` are NOT retried. Transient failures surface as 500 and the owner retries manually — safe because grant/revoke are idempotent (see EC-24 partial-failure ambiguity).

### Logging strategy

| Event | Level | Fields |
|-------|-------|--------|
| Lookup success | INFO | `operation: "lookupPrincipal"`, caller uid, `email` |
| Lookup 404 | INFO | `operation: "lookupPrincipal"`, caller uid, `email`, `result: "not_found"` |
| Grant | INFO | `operation: "grantEntitlement"`, caller uid, `acting_identity`, `principal_uid`, `entitlement` |
| Revoke | INFO | `operation: "revokeEntitlement"`, caller uid, `acting_identity`, `principal_uid`, `entitlement` |
| Admin-gate failure | WARN | `operation`, caller uid (if known), `reason` |
| Logout revocation success | INFO | `operation: "logout"`, uid |
| Logout revocation skipped/failed | WARN | `operation: "logout"`, `reason` |
| Firebase Admin error | ERROR | `operation`, error details |

**Correlation:** every structured log entry includes Fastify's `request.id` as `correlation_id` for tracing admin actions. No new header parsing is added.

## 10. Testing Strategy

### Unit tests

- **`tests/utils/claims.test.ts` (NEW):** `hasAdminRole` (admin pass / non-admin / missing acting_identity / acting_identity not in identities / **admin present on a DIFFERENT identity while `acting_identity` points to a non-admin identity → false**), `mergeEntitlement` (add/remove/idempotent/remove-last-preserves-others, and trim is handled by the caller), `mergeAdminRole` (append admin/idempotent/preserves identities+acting_identity/throws on no-owner), `parseSeedTarget` (email-only/uid-only/both/none). Pure — no mocks.
- **`tests/services/authService.test.ts` (EXTENDED):** in addition to the registration suites, covers `verifyAdminCaller`, `lookupPrincipal`, `grantEntitlement`, `revokeEntitlement` happy + error paths with `vi.mock("../../src/services/firebase")` and `vi.mock("../../src/config/logger")` (hermetic — no live network).

### Integration tests (supertest, service mocked)

- **`tests/auth/lookup.spec.ts` (NEW):** 200, 400 (bad email), 401, 403, 404.
- **`tests/auth/entitlements.spec.ts` (NEW):** grant 200, revoke 200, 400, 401, 403, 404.
- **`tests/auth/logout.spec.ts` (UPDATE):** assert `invalidateUserTokens` is invoked when a valid token is present; assert 200 + cookie cleared when token absent/invalid.
- **`tests/auth/register.spec.ts` (UPDATE):** add assertion that registration claims contain no `admin` and no `entitlements` (AC-14).

### Coverage targets

- `authService.ts`: ≥80% statement/branch coverage (measured 84% stmts / 76% branch at implementation time). The access-control paths (`verifyAdminCaller`, `lookupPrincipal`, `grantEntitlement`, `revokeEntitlement`) are fully covered; the residual gap is pre-existing auth-flow error branches (e.g. unreachable null-checks).
- `claims.ts` (merge helpers + admin gate): 100% coverage.
- Controllers + routes: happy path + every error branch per the matrix.

### Non-interference

`npm test` must pass — 51 existing tests + new tests (SC-04). Existing flows (login, refresh, verify-email, reset-password, forgot-password, resend-verification, health) are untouched.

### Performance / load testing

Not required (owner-only, single-digit requests/week).

---

**No open questions.** All decisions trace to `requirements.md` AC/REQ IDs.
