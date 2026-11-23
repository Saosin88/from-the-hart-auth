# Design: Identity Integration (Auth → Identity Orchestration)

## 1. Architecture Overview

### Before (Current Registration Flow)

```
Auth Service
  └── registerPrincipal()
        ├── adminAuth().createUser(email, password)          → uid
        ├── adminAuth().createCustomToken(uid)                → customToken
        ├── exchangeCustomTokenForIdToken(customToken)         → { idToken, refreshToken }
        └── generateEmailVerificationLink(email, uid)
```

### After (Phase 1 — Identity Orchestration)

```
Auth Service                                       Identity Service
  │                                                       │
  └── registerPrincipal()                                 │
        ├── adminAuth().createUser(email, password)        │
        │     → uid                                       │
        │                                                 │
        ├── GoogleAuth.getIdTokenClient(url)               │
        │     → googleIdToken                             │
        │                                                 │
        ├── POST {IDENTITY_SERVICE_URL}/identity ─────────►│
        │     Authorization: Bearer <googleIdToken>        │
        │     Body: { email, first_name: "",              │
        │              last_name: "", identity_type }      │
        │     ◄── 201 { data: { identity_id } }            │
        │                                                 │
        ├── adminAuth().setCustomUserClaims(uid, {         │
        │       identities: { [id]: ["owner"] },           │
        │       acting_identity: id                        │
        │     })                                           │
        │                                                 │
        ├── adminAuth().createCustomToken(uid)  // NO CLAIMS
        │     → customToken                               │
        │                                                 │
        ├── exchangeCustomTokenForIdToken(customToken)      │
        │     → { idToken }                                │
        │                                                 │
        ├── generateEmailVerificationLink(email, uid)      │
        │                                                 │
        └── Return { idToken }
```

**On Identity failure:** Rollback path — `adminAuth().deleteUser(uid)` → return 500. No Identity DELETE (no endpoint exists).

**On rollback failure:** Log both errors, return 500. Orphan Firebase user. Accepted risk.

### Key Design Properties

| Property | How Achieved |
|----------|-------------|
| **Direct call (no gateway)** | Identity service URL hard-coded, called via `fetch` directly. Addresses REQ-03. |
| **Atomic-ish** | `createUser` → `createIdentity` → `setCustomUserClaims` → `createCustomToken`. Any step after `createUser` that fails triggers rollback. Addresses AC-04 through AC-08. |
| **Claims persist** | `setCustomUserClaims` persists to Principal record. `createCustomToken` with no claims arg picks them up automatically. Addresses REQ-04, REQ-05. |
| **No refresh token** | Registration only returns ID Token (1-hour lifetime). Login is the dedicated path for persistent sessions. Addresses REQ-06. |
| **Graceful degradation** | Identity down → rollback + generic error. No half-created Principals. Addresses NFR-07. |

## 2. Technology Stack

| Layer | Technology | Rationale |
|-------|------------|-----------|
| Language | TypeScript 5.x | Existing project standard per AGENTS.md |
| Framework | Fastify v5 | Existing, unchanged |
| Validation | TypeBox | Existing, unchanged. Registration schema unchanged. |
| Auth Provider | GCP Identity Platform (firebase-admin v13) | Existing |
| Service-to-Service Auth | `google-auth-library` (`GoogleAuth.getIdTokenClient`) | Google ID token for Cloud Run IAM auth. Already transitive via firebase-admin, now direct dep per REQ-20. |
| HTTP Client | Native `fetch` (Node.js 22 built-in) | No additional dependency. Node.js 22 includes stable `fetch`. |
| Config | Environment variables (`process.env`) | Existing pattern in `src/config/index.ts`. `IDENTITY_SERVICE_URL` added. |
| Logging | Pino (via Fastify logger) | Existing. Structured JSON logging. |
| Testing | Vitest + supertest | Existing. `vi.mock()` for service-level mocking. |
| Deployment | GCP Cloud Run (Docker) | Unchanged. Single container. |

## 3. Architecture Decisions

### ADR-01: Direct Service-to-Service Call (Not Through Gateway)

- **Context:** Auth must call Identity during registration. Two paths exist: Auth → Gateway → Identity (hairpin), or Auth → Identity directly. Architecture doc § Decision 6 mandates direct. Addresses REQ-03.
- **Options Considered:**
  1. Route through API Gateway (hairpin routing)
  2. Direct Cloud Run-to-Cloud Run call with Google ID Token auth
- **Decision:** Direct call. Auth resolves Identity's URL from `IDENTITY_SERVICE_URL` env var and calls it directly with a Google ID token for auth.
- **Rationale:** No hairpin routing. Identity's Cloud Run IAM already grants `roles/run.invoker` to Auth's service account. `google-auth-library` auto-discovers credentials in all environments. Consistent with architecture doc.
- **Consequences:** Tight coupling to GCP IAM for auth. If Identity moves cloud providers, Auth's outbound auth changes. Mitigated by isolating the call in a single `identityService.ts` module.

### ADR-02: Hard-Coded Service URL in Terraform

- **Context:** Identity's Cloud Run URL is a generated value. Auth needs it at deploy time. Addresses REQ-18, REQ-21.
- **Options Considered:**
  1. Hard-code URL in Terraform env block (matches gateway's existing pattern)
  2. `google_cloud_run_service` data source (dynamic lookup)
  3. `terraform_remote_state` from Identity's state file
  4. Google Cloud Secret Manager
- **Decision:** Hard-code the URL. `https://from-the-hart-identity-{project_number}.africa-south1.run.app`, different per environment.
- **Rationale:** Same pattern the API Gateway uses for all service URL references. Cloud Run URLs are stable for the lifetime of the service resource. No additional IAM, state coupling, or infrastructure. Only changes on explicit `terraform destroy` + recreate of the Identity Cloud Run service — which would break the gateway too.
- **Consequences:** If Identity's Cloud Run service is destroyed/recreated, Auth's Terraform must be updated manually (same as the gateway). Documented with a comment in the Terraform file.

### ADR-03: `google-auth-library` as Direct Dependency

- **Context:** The library is already available as a transitive dependency of `firebase-admin`. Addresses REQ-20.
- **Options Considered:**
  1. Make it a direct dependency with `^9` range
  2. Rely on transitive resolution (no `package.json` entry)
- **Decision:** Direct dependency. Add `"google-auth-library": "^9"` to `package.json`.
- **Rationale:** Standard hygiene — import only from direct deps. If `firebase-admin` drops or changes its `google-auth-library` version, the build breaks at install time, not runtime. One extra line in `package.json`. Follows project convention of explicit dependencies.
- **Consequences:** None. Zero runtime difference.

### ADR-04: Single Failure Mode for Identity Errors (Generic to User)

- **Context:** Multiple Identity failure modes (400, 500, timeout) but the user cannot fix any of them. Addresses AC-04, AC-06, AC-07, NFR-04.
- **Options Considered:**
  1. Expose Identity's error messages directly to the user
  2. Single generic message for all non-403 failures
- **Decision:** Generic `"Registration failed due to an internal error"` for all 4xx (except 403), 5xx, and timeouts. 403 returns `"Service configuration error"`. All server-side errors logged at ERROR level with full details.
- **Rationale:** User can't act on "identity_type must be 'person'" or "Firestore unavailable." Exposing internal vocabulary leaks implementation details. 403 is distinct because it indicates a deployment/config issue, not an Identity bug.
- **Consequences:** Less diagnostic information for debugging from client side. Mitigated by comprehensive server-side logging.

### ADR-05: No Retry on Identity Failure

- **Context:** Identity service could fail transiently. Addresses REQ-12.
- **Options Considered:**
  1. Retry once with exponential backoff
  2. No retry — fail immediately with rollback
- **Decision:** No retry. One attempt only.
- **Rationale:** Registration is a user-initiated synchronous operation. A 10-second timeout is already a poor UX — adding retry turns it into a 20+ second wait. The user can retry by submitting the form again. Keep it simple.
- **Consequences:** Transient Identity failures cause unnecessary rollbacks. Accepted — registration is low-frequency (personal site).

### ADR-06: Startup Crash on Missing Configuration

- **Context:** `IDENTITY_SERVICE_URL` is required for registration. Addresses AC-09, REQ-19.
- **Options Considered:**
  1. Crash at startup (fail-fast)
  2. Accept startup, fail at request time (lazy validation)
- **Decision:** Crash at startup. The config module validates `IDENTITY_SERVICE_URL` during module load and throws if missing.
- **Rationale:** Fail-fast catches misconfiguration immediately at deploy time. A request-time failure would only be discovered when someone tries to register — possibly days later. Consistent with the Identity service's config pattern.
- **Consequences:** Auth won't start without the env var set. Local dev and test environments must provide a value (can be a dummy URL since tests mock the HTTP call).

## 4. Data Model

### Existing Entities (Unchanged)

**Principal** (GCP Identity Platform — no schema change)
- Firebase User record. Auth interacts via `adminAuth()` API only.
- New field written during registration: `customClaims`
  - `identities`: `Record<string, string[]>` — maps identity_id to roles. Written once at registration.
  - `acting_identity`: `string` — the active identity UUID. Written once at registration.

### External Entity (Referenced, Not Owned)

**Identity** (Identity Service Firestore — Auth calls, doesn't store)
- Auth constructs the request body for `POST /identity/`:

| Field | Type | Value During Registration | Validation |
|-------|------|--------------------------|------------|
| `email` | `string` | Principal's email from request body | Valid email, non-empty (already validated by Auth controller) |
| `first_name` | `string` | `""` (empty string) | Not validated by Auth — Identity accepts any string |
| `last_name` | `string` | `""` (empty string) | Not validated by Auth — Identity accepts any string |
| `identity_type` | `"person"` | `"person"` (hard-coded) | Must be `"person"` — only supported value |

### Custom Claims Schema (Written by Auth)

```typescript
interface CustomClaims {
  identities: Record<string, string[]>;  // e.g., { "uuid-here": ["owner"] }
  acting_identity: string;               // e.g., "uuid-here"
}
```

**Size budget:** Each entry is ~52 bytes (36-char UUID + array syntax). 1000-byte Firebase limit allows ~16 identities. Phase 1 has exactly one — far from the limit.

## 5. API / Interface Design

### Changes to Existing Endpoints

**None.** No new routes, no route modifications. The only change is internal to the `registerPrincipal` service function.

### New Internal Interface: `identityService.ts`

This is not a public API. It's an internal module called by `authService.ts`.

#### `createIdentity(email: string): Promise<string>`

Creates an Identity record by calling `POST {IDENTITY_SERVICE_URL}/identity`.

**Parameters:**
- `email`: `string` — the Principal's email address

**Returns:** `Promise<string>` — the `identity_id` UUID

**Throws:** `IdentityServiceError` on any failure, with properties:
- `statusCode`: HTTP status from Identity (or 0 for network errors)
- `message`: string (for logging only — not exposed to end user)

**HTTP Request:**
```
POST {IDENTITY_SERVICE_URL}/identity
Authorization: Bearer <google_id_token>
Content-Type: application/json

{
  "email": "sheldon@example.com",
  "first_name": "",
  "last_name": "",
  "identity_type": "person"
}
```

**HTTP Response (Success):**
```
201 Created
Content-Type: application/json

{
  "data": {
    "identity_id": "550e8400-e29b-41d4-a716-446655440000"
  }
}
```

**HTTP Response (Error — not propagated to user):**
```
400/403/500
Content-Type: application/json

{
  "error": {
    "message": "Missing required fields: email"
  }
}
```

**Authentication:** Google ID token via `google-auth-library`. Auth mechanism:

```typescript
import { GoogleAuth } from "google-auth-library";

const auth = new GoogleAuth();
const client = await auth.getIdTokenClient(identityServiceUrl);
const headers = await client.getRequestHeaders();
// headers.Authorization = "Bearer <google_id_token>"
```

**Timeout:** 10 seconds (REQ-09). Implemented via `AbortController.signal` passed to `fetch`.

**Error mapping:**

| Identity Response | `statusCode` in Error | User-Facing Message | Log Level |
|-------------------|----------------------|---------------------|-----------|
| 201 | (no error) | (no error) | INFO |
| 400 | 400 | `"Registration failed due to an internal error"` | ERROR |
| 403 | 403 | `"Service configuration error"` | ERROR |
| 500/502/503 | 5xx | `"Registration failed due to an internal error"` | ERROR |
| Timeout | 0 | `"Registration failed due to an internal error"` | ERROR |
| Network error | 0 | `"Registration failed due to an internal error"` | ERROR |

### Modified Interface: `registerPrincipal` in `authService.ts`

**Signature (unchanged):**
```typescript
export const registerPrincipal = async (
  email: string,
  password: string
): Promise<AuthResponse>
```

**Internal flow change:**

Before:
```
createUser → createCustomToken(uid) → exchange → sendVerificationEmail → return { idToken }
```

After:
```
createUser → createIdentity(email) → setCustomUserClaims(uid, claims)
  → createCustomToken(uid) → exchange → sendVerificationEmail → return { idToken }

On createIdentity failure:
  deleteUser(uid) → throw → controller maps to 500
```

## 6. Security Considerations

### Authentication

| Aspect | Mechanism |
|--------|-----------|
| Auth → Identity | Google ID Token via `google-auth-library.getIdTokenClient()`. Token scoped to Identity's Cloud Run URL. Identity's Cloud Run IAM validates before the request reaches application code. Addresses REQ-02, NFR-02. |
| Identity → Auth | No callback. Identity returns a response only. |

### Authorization

| Actor | Permission | Enforcement |
|-------|-----------|-------------|
| Auth service account | Call `POST /identity` on Identity service | Identity's Cloud Run IAM (`roles/run.invoker`). Already configured in Identity's Terraform. |
| End user | Register | Existing Firebase auth — unchanged. |

### Data Protection

- **In transit:** All Auth → Identity traffic is HTTPS (Cloud Run enforces TLS). Google ID token is bearer token over HTTPS.
- **At rest:** No new data stored in Auth. Identity data stored in Firestore managed by Identity service.
- **PII:** Email is transmitted to Identity service. Already present in Firebase user record. No new PII exposure.
- **Error messages:** Identity's internal errors are logged server-side but never returned to end users. Addresses NFR-04.

### Input Validation

| Input | Where Validated | How |
|-------|----------------|-----|
| `email`, `password` | Auth controller (existing) | `validateEmail()`, `validatePassword()` — unchanged |
| Registration request body | Fastify + TypeBox (existing) | TypeBox schema on route — unchanged |
| Identity request body | Identity service | Identity's TypeBox validation (`CreateIdentityRequestSchema`) |
| `IDENTITY_SERVICE_URL` | Auth config at startup | Fails fast if missing — AC-09 |

### Rate Limiting

No additional rate limiting needed — Identity's `POST /identity` is only called during registration, which has no rate-limiting concern at this scale (personal site). If needed in the future, Cloud Run's built-in concurrency controls apply.

## 7. Performance Considerations

### Expected Load

- **Registration frequency:** ~1-2 per month (personal site). Not a throughput concern.
- **Concurrent registrations:** Effectively zero — registration is a rare, user-initiated action.

### Performance Targets

| Operation | Target | Notes |
|-----------|--------|-------|
| Identity service call | < 500ms | Local GCP region (africa-south1), same project. Firestore write + UUID generation. |
| Total registration | < 3s | Includes Firebase createUser, Identity call, claims, token exchange, verification email. |
| Identity call timeout | 10s | Conservative — if Identity takes >10s, something is wrong. REQ-09. |

### Optimization Strategy

No optimization needed at this scale. The one network hop (Auth → Identity) is same-region, same-project GCP. No caching — the Identity call happens exactly once per registration.

### Monitoring

| Metric | How | Alert Threshold |
|--------|-----|-----------------|
| Registration success rate | Log entries: INFO with `identity_id` | < 90% over rolling window |
| Identity call latency | Log timestamps on request/response | > 5s per call |
| Identity 4xx errors | Log entries: ERROR with status=4xx | > 0 (should never happen — indicates code bug) |
| Identity 5xx errors | Log entries: ERROR with status=5xx | > 0 (indicates Identity service issue) |
| Rollback failures | Log entries: ERROR with "rollback failed" | > 0 (indicates Firebase API issue) |

## 8. Error Handling

### Error Response Format (Unchanged)

Auth uses a consistent error format across all endpoints:

```json
{
  "error": {
    "message": "Human-readable error message"
  }
}
```

### Registration Error Matrix

| Scenario | HTTP Status | User Message | Log Level | Rollback |
|----------|-------------|--------------|-----------|----------|
| Identity 201 | 201 | (success: `{ data: { idToken } }`) | INFO | N/A |
| Identity 400 | 500 | `"Registration failed due to an internal error"` | ERROR | `deleteUser(uid)` → log |
| Identity 403 | 500 | `"Service configuration error"` | ERROR | `deleteUser(uid)` → log |
| Identity 5xx | 500 | `"Registration failed due to an internal error"` | ERROR | `deleteUser(uid)` → log |
| Identity timeout (10s) | 500 | `"Registration failed due to an internal error"` | ERROR | `deleteUser(uid)` → log |
| Network error | 500 | `"Registration failed due to an internal error"` | ERROR | `deleteUser(uid)` → log |
| Rollback fails | 500 | `"Registration failed due to an internal error"` | ERROR | N/A (already failed) |
| Firebase errors (unchanged) | 409/400 | (existing messages) | (existing) | N/A |

Addresses: AC-01 through AC-08, REQ-10, REQ-11, REQ-14 through REQ-17.

### Error Class Hierarchy

```
IdentityServiceError
├── statusCode: number        // HTTP status from Identity, 0 for network/timeout
├── message: string           // Identity's error message or network error description
└── (logged only — never returned to end user)
```

The error class wraps Identity's response for clean service-layer handling. The controller inspects the status code to choose the user-facing message (403 → config error, all others → generic).

### Logging Strategy

| Event | Level | Fields |
|-------|-------|--------|
| Identity call starting | DEBUG | `email`, `url` |
| Identity call succeeded | INFO | `operation`, `email`, `uid`, `identity_id` |
| Identity returned 4xx | ERROR | `operation`, `email`, `uid`, `identityStatus`, `identityError` |
| Identity returned 403 | ERROR | `operation`, `email`, `uid`, `identityStatus: 403` |
| Identity returned 5xx | ERROR | `operation`, `email`, `uid`, `identityStatus` |
| Identity call timed out | ERROR | `operation`, `email`, `uid`, `timeoutMs: 10000` |
| Network error | ERROR | `operation`, `email`, `uid`, `error: <message>` |
| Rollback started | INFO | `operation: "registerPrincipalRollback"`, `email`, `uid`, `reason` |
| Rollback succeeded | INFO | `operation: "registerPrincipalRollback"`, `email`, `uid`, `result: "deleted"` |
| Rollback failed | ERROR | `operation: "registerPrincipalRollback"`, `email`, `uid`, `originalError`, `rollbackError` |

Addresses: REQ-13 through REQ-17, NFR-05, NFR-06.

## 9. Testing Strategy

### Unit Tests

**New test file: `tests/services/identityService.test.ts`**

Tests the `createIdentity` function in isolation with a mocked `fetch` and mocked `GoogleAuth`.

| Test | Covers | Mock Setup |
|------|--------|------------|
| Returns `identity_id` on 201 | AC-01 | Mock fetch returns 201 with `{ data: { identity_id: "test-uuid" } }` |
| Throws `IdentityServiceError` on 400 | AC-04, REQ-10 | Mock fetch returns 400 with `{ error: { message: "..." } }` |
| Throws `IdentityServiceError` on 403 | AC-05, REQ-11 | Mock fetch returns 403 |
| Throws `IdentityServiceError` on 500 | AC-06, REQ-10 | Mock fetch returns 500 |
| Throws `IdentityServiceError` on timeout | AC-07, REQ-09 | Mock fetch hangs → AbortController fires |
| Throws `IdentityServiceError` on network error | AC-07 | Mock fetch rejects with network error |

**Modified test file: `tests/services/authService.test.ts` (NEW)**

Tests the modified `registerPrincipal` flow. Mocks `createIdentity`, `adminAuth`, and token exchange.

| Test | Covers | Mock Setup |
|------|--------|------------|
| Happy path: returns ID token with claims in flow | AC-01, AC-02 | Mock all successful |
| Identity creation fails → deleteUser called | AC-04 | Mock `createIdentity` throws → verify `deleteUser(uid)` called |
| Identity returns 403 → config error message | AC-05 | Mock `createIdentity` throws 403 → verify 500 with config message |
| Identity timeout → deleteUser called | AC-07 | Mock `createIdentity` throws timeout → verify `deleteUser(uid)` called |
| Rollback fails → log both errors | AC-08 | Mock `createIdentity` throws, mock `deleteUser` also throws |

**Modified test file: `tests/auth/register.spec.ts`**

Existing integration test. Updated to mock the new `registerPrincipal` flow. Existing tests stay — new test for the happy path with claims.

| Test | Covers |
|------|--------|
| (existing) Register new user successfully | Kept, mock updated |
| (existing) Email already in use | Kept, unchanged |
| (existing) Invalid email | Kept, unchanged |
| (existing) Weak password | Kept, unchanged |
| (NEW) Registration returns ID token with claims | AC-01, AC-02, SC-01 |

**Config test: `tests/config/config.test.ts` (NEW)**

| Test | Covers |
|------|--------|
| Config fails when `IDENTITY_SERVICE_URL` not set | AC-09, REQ-19 |

### Integration Tests

The existing `tests/auth/register.spec.ts` supertest tests serve as integration tests. The mock at the service layer means the full HTTP stack is exercised (Fastify → controller → service) but external calls (Firebase, Identity) are mocked. This is the existing pattern.

### Test Coverage Targets

- `src/services/identityService.ts`: 100% line coverage (all error paths)
- `src/services/authService.ts` (`registerPrincipal` path): 100% branch coverage (happy + all failure modes + rollback)
- `src/config/index.ts`: `IDENTITY_SERVICE_URL` validation path covered

### Non-Interference Verification

All existing tests must pass without modification (except register.spec.ts which gets updated mocks). Addresses AC-10, SC-03.

```bash
npm test  # Must pass — 44 existing + new tests
```

### Performance/Load Testing

Not required. Registration is a low-frequency personal-site operation. The 10-second timeout is the only performance concern and is tested in the unit test for `identityService.ts`.
