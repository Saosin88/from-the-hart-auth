# Tasks: Access Control (Auth Service)

> Traces to `requirements.md` (AC/REQ/EC/NFR/SC) and `design.md` (ADR/section). Every task is self-contained — it references the two spec docs, never another task.

## Implementation Strategy

- **MVP First:** Complete Setup + Foundational + User Story 1 (entitlements), run the full suite, stop and validate.
- **Incremental Delivery:** Add User Story 2 (lookup), validate; add User Story 3 (logout), validate; finish Polish.
- **Parallel Opportunities:** `[P]` tasks touch different files with no shared dependencies — run concurrently.
- **RED/GREEN/VERIFY:** write the failing test first (RED), implement to green (GREEN), then clean up and re-run the same command plus `npx tsc --noEmit` (VERIFY). VERIFY is the re-run-after-cleanup step.

---

## Phase 1: Setup

- [x] **T001 [P] Add gateway pathRules for the new endpoints (cross-repo)**
  WHAT: Makes `/auth/lookup`, `/auth/entitlements`, and `/auth/entitlements/revoke` reachable through the gateway per requirements REQ-25 and design.md §6.3.
  HOW: In `from-the-hart-tech-api-reverse-proxy-worker/src/routes.ts`, add to the `/auth` entry's `pathRules` (in `local`, `dev`, AND `prod`): `/auth/lookup: { validateAccessToken: true }`, `/auth/entitlements: { validateAccessToken: true }`, and `/auth/entitlements/revoke: { validateAccessToken: true }`. Do NOT touch `validateTurnstileToken` or `cacheable` (defaults are correct). Do NOT modify gateway enforcement logic, and do NOT add any method-allowlist change (both entitlement endpoints are POST).
  FILES: `from-the-hart-tech-api-reverse-proxy-worker/src/routes.ts`
  RED: `grep -n "auth/lookup\|auth/entitlements" from-the-hart-tech-api-reverse-proxy-worker/src/routes.ts` — must show NO matches (endpoints currently unreachable).
  GREEN: Add the three pathRules in all three environments; re-run the grep — must show 9 matches (3 paths × 3 envs).
  VERIFY: `grep -n "validateAccessToken: true" from-the-hart-tech-api-reverse-proxy-worker/src/routes.ts` — the three new rules must appear alongside `/auth/resend-verification`. N/A for `npm test` (cross-repo, no unit test).
  EDGE CASES: N/A (config-only). Confirm each env block gets ALL THREE rules; a missing env leaves that endpoint unreachable there.

**Checkpoint (Phase 1):** Verify the gateway config builds — `cd from-the-hart-tech-api-reverse-proxy-worker && npm run build` must succeed; rollback on any error. Deploy gateway before service (reverse order = brief unreachable window, but existing endpoints keep working).

---

## Phase 2: Foundational

> ⚠️ No user story work begins until Phase 2 is complete. All of Phase 2 is shared by US1 and US2 (and the seed script).

- [x] **T002 [P] Implement pure claims helpers in `src/utils/claims.ts`**
  WHAT: Implements the fail-closed admin predicate and the read-merge-write deltas per requirements REQ-02/04/12/17 and design.md §5.5.
  HOW: Create `src/utils/claims.ts` exporting four pure, side-effect-free functions: `hasAdminRole(claims)` (returns true only when `acting_identity` is a string, is a key in `identities`, and `identities[acting_identity]` includes `"admin"`); `mergeEntitlement(claims, entitlement, add)` (copy claims; add/remove the entitlement from `entitlements`, dedupe, delete the key when empty); `mergeAdminRole(claims)` (append `"admin"` to the identity entry whose roles include `"owner"`, throw if none, idempotent); `parseSeedTarget(env)` (return `{ kind: "email"|"uid", value }` from `TARGET_PRINCIPAL_EMAIL` XOR `TARGET_PRINCIPAL_UID`, throw if both or neither). No `firebase`/`config` imports — pure only.
  FILES: `src/utils/claims.ts` (NEW), `tests/utils/claims.test.ts` (NEW)
  RED: `npx vitest run tests/utils/claims.test.ts` — must FAIL (file does not exist yet).
  GREEN: Implement + tests. `npx vitest run tests/utils/claims.test.ts` — must PASS.
  VERIFY: `npx tsc --noEmit && npx vitest run tests/utils/claims.test.ts` — must still PASS.
  EDGE CASES: `hasAdminRole` with missing/absent `acting_identity`, `acting_identity` not a key in `identities`, roles array lacking `admin` (all false) — EC-03/04/05. `mergeEntitlement` add duplicate (no dup), revoke absent (no-op), revoke last (key deleted, other keys preserved) — AC-11/12/13, EC-08/09/10/11. `mergeAdminRole` already-admin (no dup), no-owner-entry (throw), preserves `acting_identity`/other identities — AC-15, EC-18/19. `parseSeedTarget` email-only, uid-only, both (throw), neither (throw) — EC-20.

- [x] **T003 Implement `AdminAuthorizationError` + `verifyAdminCaller`**
  WHAT: Implements the crypto-verify + admin-gate helper per requirements REQ-01/04/11 and design.md §5.5.
  HOW: In `src/services/authService.ts` (Auth-domain service — same file as `verifyIdToken`/`invalidateUserTokens`), define `AdminAuthorizationError extends Error` with `name === "AdminAuthorizationError"`. Define an internal `verifyAdminCaller(idToken)`: `await adminAuth().verifyIdToken(idToken)` (lets `FirebaseAuthError` propagate for 401 mapping), then call `hasAdminRole(decodedToken)` (imported from `../utils/claims`); if false, throw `AdminAuthorizationError`. Return `{ uid, actingIdentity }`. Mock `../../src/services/firebase` and `../../src/config/logger` in tests (existing pattern in `tests/services/authService.test.ts`).
  FILES: `src/services/authService.ts` (EXTENDED), `tests/services/authService.test.ts` (EXTENDED)
  RED: `npx vitest run tests/services/authService.test.ts` — must FAIL (admin-gate tests not yet present/passing).
  GREEN: Implement + tests. `npx vitest run tests/services/authService.test.ts` — must PASS.
  VERIFY: `npx tsc --noEmit && npx vitest run tests/services/authService.test.ts` — must still PASS.
  EDGE CASES: admin token passes; non-admin token throws `AdminAuthorizationError`; missing `acting_identity` throws; `acting_identity` not in `identities` throws; `verifyIdToken` rejection propagates as `FirebaseAuthError` (401 path) — AC-04/06/07, EC-03/04/05/06.

- [x] **T004 [P] Add TypeBox schemas for the new endpoints**
  WHAT: Defines the wire contract per requirements REQ-05/10 and design.md §6.4.
  HOW: Append to `src/models/AuthSchemas.ts`: `PrincipalLookupQuerySchema` (`email` string, `format: "email"`, minLength 5, maxLength 254), `PrincipalLookupResponseSchema` (`principal_uid` string minLength 1), `EntitlementRequestSchema` (`principal_uid` string minLength 1, `entitlement` string minLength 1), `EntitlementResponseSchema` (same two fields). Export the `Static` types. Follow the existing schema style.
  FILES: `src/models/AuthSchemas.ts`, `tests/models/AuthSchemas.test.ts` (NEW)
  RED: `npx vitest run tests/models/AuthSchemas.test.ts` — must FAIL (file does not exist yet; write a test first that imports the schemas and asserts `format`/`minLength`).
  GREEN: Implement + test. `npx vitest run tests/models/AuthSchemas.test.ts` — must PASS.
  VERIFY: `npx tsc --noEmit && npx vitest run tests/models/AuthSchemas.test.ts` — must still PASS.
  EDGE CASES: `email` rejects non-email strings and >254 chars; `entitlement` rejects empty/whitespace-only; `principal_uid` rejects empty — AC-05/09, EC-01/02.

- [x] **T005 Implement the one-off admin seed script**
  WHAT: Seeds the owner's `admin` role out-of-band per requirements REQ-17/18/19, AC-15, NFR-08 and design.md §5.6.
  HOW: Create `scripts/seed-admin.ts`: validate `FIREBASE_PROJECT_ID` is set (else exit 1); `import * as admin from "firebase-admin"`; `admin.initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID })` directly (ADC via `GOOGLE_APPLICATION_CREDENTIALS` — do NOT import `src/services/firebase.ts`, which fail-fasts on `IDENTITY_SERVICE_URL`). Import `parseSeedTarget` and `mergeAdminRole` from `../src/utils/claims`. Resolve uid (`getUserByEmail` for email, direct for uid), read `getUser(uid).customClaims ?? {}`, `setCustomUserClaims(uid, mergeAdminRole(claims))`, then **read back `getUser(uid).customClaims` and assert `admin` is present on the owner's entry** — print `SUCCESS: admin role granted to <uid>` and exit 0, or exit 1 with the actual roles if the read-back fails. Exit non-zero with a clear message on: missing `FIREBASE_PROJECT_ID`, missing/ambiguous target, no `owner` identity, missing ADC, or read-back verification failure. Wrap in an async `main()` invoked only when run directly.
  FILES: `scripts/seed-admin.ts` (NEW)
  RED: `grep -rn "seed-admin" scripts/ 2>/dev/null` — must return no matches (the script does not exist yet).
  GREEN: Implement. `npx tsc --noEmit` — must PASS. (The read-merge-write logic `mergeAdminRole` is covered by `tests/utils/claims.test.ts` per design.md §10 — this script is a thin wrapper; no live-Firebase test.)
  VERIFY: `npm run typecheck` — must still PASS (covers `scripts/` via `tsconfig.scripts.json`, not just `src/`).
  EDGE CASES: run twice → idempotent (no duplicate `admin`) — AC-15/EC-18; no `owner` identity → loud error, never blind-write — EC-19; no ADC → loud "credentials not found" error — EC-20. Manual run command (documented in script header): `GOOGLE_APPLICATION_CREDENTIALS=<key> TARGET_PRINCIPAL_EMAIL=<email> npx ts-node scripts/seed-admin.ts` (`ts-node` available via `ts-node-dev`; no new dependency).

**Checkpoint (Phase 2):** All foundational unit tests green — `npm test` still passes; `npx tsc --noEmit` clean; no new routes registered yet.

---

## Phase 3: User Story 1 — Secure Entitlement Grant/Revoke (Priority: P1) 🎯 MVP

- [x] **T006 [US1] Implement `grantEntitlement` and `revokeEntitlement` service functions**
  WHAT: Implements the entitlement grant/revoke business logic per requirements AC-06 through AC-13, REQ-11/12/13/14/15 and design.md §5.5.
  HOW: In `src/services/authService.ts`, add `grantEntitlement(idToken, principal_uid, entitlement)` and `revokeEntitlement(...)`. Both: `verifyAdminCaller(idToken)`; `adminAuth().getUser(principal_uid)` (map `auth/user-not-found` → 404 path); read `userRecord.customClaims ?? {}`; `mergeEntitlement(claims, entitlement, add)`; `setCustomUserClaims(principal_uid, merged)`; return `{ principal_uid, entitlement }`. Do NOT call `revokeRefreshTokens` (REQ-15). Mock `../../src/services/firebase` and `../../src/config/logger`.
  FILES: `src/services/authService.ts`, `tests/services/authService.test.ts`
  RED: `npx vitest run tests/services/authService.test.ts` — must FAIL (grant/revoke tests not yet passing; write them first).
  GREEN: Implement + tests. `npx vitest run tests/services/authService.test.ts` — must PASS.
  VERIFY: `npx tsc --noEmit && npx vitest run tests/services/authService.test.ts` — must still PASS.
  EDGE CASES: grant appends without duplicates (idempotent) — AC-11/EC-08; revoke absent is no-op — AC-12/EC-09; revoke last removes the `entitlements` key while preserving `identities`/`acting_identity` — AC-13/EC-10; target `principal_uid` not found → 404 path — AC-08/EC-07; non-admin caller → `AdminAuthorizationError` — AC-07; unexpected `getUser`/`setCustomUserClaims` throw → 500 path (controller maps) — EC-21. Assert `setCustomUserClaims` is called with a merged object that keeps `identities` and `acting_identity` — REQ-02/03, EC-11.

- [x] **T007 [US1] Add entitlement routes + controller + integration tests**
  WHAT: Exposes `POST /auth/entitlements` (grant) and `POST /auth/entitlements/revoke` (revoke) with full OpenAPI per requirements REQ-10/11 and design.md §5.2, §6.4, §9.
  HOW: Add `grantEntitlement` and `revokeEntitlement` handlers in `src/controllers/authController.ts` (thin: extract Bearer token from `Authorization`, call service, map errors: `AdminAuthorizationError`→403 "Forbidden", `FirebaseAuthError` `auth/user-not-found`→404 "Principal not found", `verifyIdToken` failures→401 "Unauthorized", else→500 "Internal server error"). Register both POST routes in `src/routes/auth.ts` using `EntitlementRequestSchema`/`EntitlementResponseSchema` with `description`, `summary`, `body`, `response` (200/400/401/403/404/500) and examples (mirror existing route style). Mock the service in supertest tests (existing `tests/auth/*.spec.ts` pattern).
  FILES: `src/controllers/authController.ts`, `src/routes/auth.ts`, `tests/auth/entitlements.spec.ts` (NEW)
  RED: `npx vitest run tests/auth/entitlements.spec.ts` — must FAIL (file does not exist yet).
  GREEN: Implement + tests. `npx vitest run tests/auth/entitlements.spec.ts` — must PASS.
  VERIFY: `npx tsc --noEmit && npx vitest run tests/auth/entitlements.spec.ts` — must still PASS.
  EDGE CASES: 200 grant; 200 revoke; 400 (missing/empty fields) — AC-09; 401 (no/invalid token); 403 (non-admin); 404 (unknown principal_uid) — AC-08; 500 (service throw). Verify response envelope `{ data }` / `{ error: { message } }` in every case.

**Checkpoint:** User Story 1 is functional. An admin (seeded via the admin seed script) can grant/revoke entitlements; non-admins get 403. STOP and validate before US2.

---

## Phase 4: User Story 2 — Principal Lookup (Priority: P1)

- [x] **T008 [US2] Implement `lookupPrincipal` service function**
  WHAT: Implements email→UID resolution per requirements AC-01/02/03/04, REQ-06/07/08/09 and design.md §5.5.
  HOW: In `src/services/authService.ts`, add `lookupPrincipal(idToken, email)`: `verifyAdminCaller(idToken)`; `adminAuth().getUserByEmail(email)` (map `auth/user-not-found` → 404 path); return `{ principal_uid: userRecord.uid }`. Mock `../../src/services/firebase` and `../../src/config/logger`.
  FILES: `src/services/authService.ts`, `tests/services/authService.test.ts`
  RED: `npx vitest run tests/services/authService.test.ts` — must FAIL (lookup tests not yet passing).
  GREEN: Implement + tests. `npx vitest run tests/services/authService.test.ts` — must PASS.
  VERIFY: `npx tsc --noEmit && npx vitest run tests/services/authService.test.ts` — must still PASS.
  EDGE CASES: found → `{ principal_uid }`; not found → 404 path — AC-02/EC-07; non-admin → `AdminAuthorizationError` — AC-04; `verifyIdToken` rejection propagates — AC-03. Assert only `principal_uid` is returned (no email/roles/entitlements) — REQ-08.

- [x] **T009 [US2] Add lookup route + controller + integration tests**
  WHAT: Exposes `GET /auth/lookup` with full OpenAPI per requirements REQ-05/06/07/08/09 and design.md §5.1, §6.4, §9.
  HOW: Add a `lookup` handler in `src/controllers/authController.ts` (extract Bearer token, call `lookupPrincipal`, map errors per design.md §9 error matrix: `AdminAuthorizationError`→403, `FirebaseAuthError` `auth/user-not-found`→404, `verifyIdToken` failure→401, else→500). Register `GET /auth/lookup` in `src/routes/auth.ts` with `querystring: PrincipalLookupQuerySchema`, `response: PrincipalLookupResponseSchema`, full OpenAPI (description/summary/examples). Mock the service in supertest tests.
  FILES: `src/controllers/authController.ts`, `src/routes/auth.ts`, `tests/auth/lookup.spec.ts` (NEW)
  RED: `npx vitest run tests/auth/lookup.spec.ts` — must FAIL (file does not exist yet).
  GREEN: Implement + tests. `npx vitest run tests/auth/lookup.spec.ts` — must PASS.
  VERIFY: `npx tsc --noEmit && npx vitest run tests/auth/lookup.spec.ts` — must still PASS.
  EDGE CASES: 200 `{ data: { principal_uid } }`; 400 invalid email — AC-05/EC-01; 401 no/invalid token — AC-03; 403 non-admin — AC-04; 404 not found — AC-02; 500 service throw. Verify envelope shape in every case.

**Checkpoint:** User Story 2 is functional. An admin can resolve email→UID. STOP and validate before US3.

---

## Phase 5: User Story 3 — Logout Token Revocation (Priority: P2)

- [x] **T010 [US3] Un-comment `invalidateUserTokens` in logout**
  WHAT: Enables server-side refresh-token revocation on logout per requirements AC-16/17, REQ-20/21, NFR-12/13 and design.md §5.3.
  HOW: In `src/controllers/authController.ts` `logout`, restore the commented block: read `request.headers["authorization"]?.split(" ")[1]`; if present, `await authService.invalidateUserTokens(idToken)` inside the existing `try`. NOTE: `invalidateUserTokens` is ALREADY implemented in `src/services/authService.ts` (verifyIdToken → revokeRefreshTokens) — this task only un-comments the call site; do NOT re-implement it. Keep the cookie-clear + 200 `{ success: true, message: "Logged out successfully" }` path, and ensure the `catch` still clears the cookie and returns 200 (graceful degradation). Update `tests/auth/logout.spec.ts` to assert `invalidateUserTokens` is called when a token is present and NOT called when absent; keep the 200+cookie-clear assertions for both (including the cookie `domain`/`path`/`secure`/`httpOnly`/`sameSite` attributes).
  FILES: `src/controllers/authController.ts`, `tests/auth/logout.spec.ts`
  RED: `npx vitest run tests/auth/logout.spec.ts` — must FAIL (new assertion expecting `invalidateUserTokens` call not yet satisfied).
  GREEN: Implement + tests. `npx vitest run tests/auth/logout.spec.ts` — must PASS.
  VERIFY: `npx tsc --noEmit && npx vitest run tests/auth/logout.spec.ts` — must still PASS.
  EDGE CASES: valid token → `invalidateUserTokens` invoked, 200 + cookie cleared — AC-16; no token → skipped, 200 + cookie cleared — AC-17/EC-15; invalid/expired token → `invalidateUserTokens` throws (caught), 200 + cookie cleared — AC-17/EC-16; `revokeRefreshTokens` failure → WARN log, 200 + cookie cleared — EC-17/NFR-12/13.

**Checkpoint:** User Story 3 is functional. Logout revokes refresh tokens best-effort, never failing the logout response.

---

## Phase 6: Polish & Cross-Cutting

- [x] **T011 [P] Assert registration never grants `admin`/`entitlements`**
  WHAT: Locks the hard invariant per requirements AC-14, REQ-16, NFR-05 and design.md §4.
  HOW: Add a test in `tests/auth/register.spec.ts` (or a dedicated test) that runs `registerPrincipal` with mocked `createIdentity`/`adminAuth` and asserts the `setCustomUserClaims` argument is exactly `{ identities: { [id]: ["owner"] }, acting_identity: id }` — containing no `"admin"` string and no `entitlements` key.
  FILES: `tests/auth/register.spec.ts`
  RED: `npx vitest run tests/auth/register.spec.ts` — must FAIL (new assertion not yet present).
  GREEN: Add assertion. `npx vitest run tests/auth/register.spec.ts` — must PASS.
  VERIFY: `npx vitest run tests/auth/register.spec.ts` — must still PASS.
  EDGE CASES: claim object exactly one `identities` entry with `["owner"]` only; `entitlements` key absent; `admin` absent from every roles array — AC-14/EC-14.

- [x] **T012 [P] Update the architecture doc**
  WHAT: Records the new contract per requirements REQ-24 and design.md §6.5.
  HOW: Edit `docs/architecture/identity-and-access.md`: add `entitlements: string[]` (absent == empty) to the JWT contract section with the before/after payload from design.md §6.1; add `admin` to the role definitions as platform-level (vs identity-scoped `owner`/`viewer`); move lookup from "Deferred" to "Specified (see auth specs/access-control/)"; note switch-identity and role management remain deferred.
  FILES: `docs/architecture/identity-and-access.md` (root repo — not git-tracked; edit the file)
  RED: `grep -n "entitlements" docs/architecture/identity-and-access.md` — must show NO matches (RED).
  GREEN: Apply edits; re-run grep — must show `entitlements` in the JWT contract section and `admin` in role definitions.
  VERIFY: N/A (markdown). Re-read the edited section to confirm no stale "Deferred" phrasing for lookup.
  EDGE CASES: N/A (documentation).

- [x] **T013 [P] Update CONTEXT.md glossaries**
  WHAT: Adds canonical terms per requirements REQ-26 and design.md §6.5.
  HOW: Add `Entitlement` (Principal-level capability string, `entitlements: string[]` claim) and `Admin` (platform-level role, checked on `identities[acting_identity]`, seeded out-of-band) to both `CONTEXT.md` (repo root) and `from-the-hart-auth/CONTEXT.md`. Match existing glossary style.
  FILES: `CONTEXT.md`, `from-the-hart-auth/CONTEXT.md` (root repo)
  RED: `grep -n "Entitlement\|Admin" CONTEXT.md from-the-hart-auth/CONTEXT.md` — must show NO canonical glossary entries (RED).
  GREEN: Add entries; re-run grep — must show the definitions in both files.
  VERIFY: N/A (markdown).
  EDGE CASES: N/A (documentation).

- [x] **T014 [P] Materialize ADR files 0003–0005**
  WHAT: Persists the design decisions per design.md §3 (ADR-0003/0004/0005) as files.
  HOW: Create `docs/adr/0003-admin-role-entitlements-authorization.md`, `0004-out-of-band-admin-seeding.md`, `0005-logout-revocation-staleness.md` in the existing ADR format (Date, Status: Accepted, Context, Decision, Rationale, Tradeoffs, Alternatives Considered). Copy the content from design.md §3.
  FILES: `docs/adr/0003-*.md`, `docs/adr/0004-*.md`, `docs/adr/0005-*.md` (root repo)
  RED: `ls docs/adr/` — must show only `0001-*` and `0002-*` (RED).
  GREEN: Create the three files; `ls docs/adr/` — must show `0003-*`, `0004-*`, `0005-*`.
  VERIFY: N/A (markdown). Match the existing two ADRs' section ordering.
  EDGE CASES: N/A (documentation).

- [x] **T015 Verify full suite, types, and build**
  WHAT: Confirms non-interference and shippability per requirements SC-04 and design.md §10.
  HOW: Run the complete verification: `npm test` (all 51 existing + new tests green), `npx tsc --noEmit` (zero errors), `npm run build` (succeeds).
  FILES: none (verification only).
  RED: `npm test` — establish the current baseline (all green before this phase).
  GREEN: `npm test && npx tsc --noEmit && npm run build` — all PASS.
  VERIFY: N/A.
  EDGE CASES: N/A. If any existing test (login/refresh/verify-email/reset-password/forgot-password/resend-verification/health) fails, fix before declaring done.

**Checkpoint:** All six phases complete. Full suite green, types clean, build succeeds, docs/ADRs/glossary/gateway-config in lockstep. Ready to deploy.

---

## Dependencies & Execution Order

### Phase dependencies

Setup → Foundational → US1 → US2 → US3 → Polish. Foundational MUST complete before any user story (T002–T005 all block US1/US2).

### Parallel tasks (`[P]`)

- Phase 1: T001.
- Phase 2: T002 and T004 are independent of each other and of T001; run together. T003 needs T002 (imports `hasAdminRole`). T005 needs T002 (imports `mergeAdminRole` + `parseSeedTarget`).
- Phase 6: T011, T012, T013, T014 are independent (different files).

### Sequential (within phases)

- T002 → T003 (verifyAdminCaller uses hasAdminRole).
- T002 → T005 (seed script uses mergeAdminRole + parseSeedTarget).
- T003 → T006 and T008 (service functions use verifyAdminCaller).
- T002 + T003 → T006 (grant/revoke use mergeEntitlement + verifyAdminCaller).
- T004 + T006 → T007 (route needs schemas + service).
- T004 + T008 → T009 (route needs schemas + service).
- T010 touches `authController.ts` and therefore MUST be sequential with T007/T009 (which also edit `authController.ts`).

### User story dependencies

US1 (entitlements) and US2 (lookup) are both P1 but independent of each other; US1 is the MVP and ships first. US3 (logout) is independent of US1/US2 and can be done any time after Foundational — sequenced last for a clean incremental story. US1 and US2 both require the Foundational admin gate and (for end-to-end use) the T005 seed script.

### Self-containment note

Every task references `requirements.md`/`design.md` only. No task references another task by number in its WHAT/HOW. The order above is captured here in Dependencies, not inside the tasks.

## AC → Task Traceability

| AC | Task(s) |
|----|---------|
| AC-01 (lookup 200) | T008, T009 |
| AC-02 (lookup 404) | T008, T009 |
| AC-03 (lookup 401) | T009 |
| AC-04 (lookup 403) | T008, T009 |
| AC-05 (lookup 400) | T004, T009 |
| AC-06 (grant 200) | T006, T007 |
| AC-07 (non-admin 403) | T003, T006, T007 |
| AC-08 (target 404) | T006, T007 |
| AC-09 (empty entitlement 400) | T004, T007 |
| AC-10 (free-form accepted) | T006, T007 |
| AC-11 (grant idempotent) | T006, T007 |
| AC-12 (revoke idempotent) | T006, T007 |
| AC-13 (revoke last) | T006, T007 |
| AC-14 (registration no admin) | T011 |
| AC-15 (seed script) | T002, T005 |
| AC-16 (logout revoke) | T010 |
| AC-17 (logout graceful) | T010 |
| AC-18 (entitlements claim) | T006 (grant writes the claim; no dedicated token-minting test — accepted per NFR-07 staleness) |
| AC-19 (malformed JSON 400) | T007, T009 |

Coverage note: every AC maps to ≥1 task. AC-18 is covered implicitly by the grant flow (T006/T007) rather than a dedicated refresh-token test.

---

## Implementation Notes (2026-11-23)

**Status: T001–T015 complete.** `npm test` → 171 passing (51 pre-existing + 120 new), `npx tsc --noEmit` clean, `npx tsc -p tsconfig.scripts.json` clean, `npm run build` OK, gateway `npm run build` OK. Nothing committed — all changes left in the working tree.

### Drift from the spec (implementation decisions)

1. **`verifyAdminCaller(idToken, operation)`** — an `operation` label was added (design.md §5.5 showed a single argument) so the WARN log required by NFR-10 can carry `operation`. It is exported, but remains service-internal (no HTTP surface).
2. **`adminDenialReason()` added to `src/utils/claims.ts`** — NFR-10 requires the denial `reason` (`no acting_identity` / `acting_identity not in identities` / `not admin`). Instead of duplicating the predicate, `hasAdminRole` now delegates to `adminDenialReason`, keeping one source of truth.
3. **`ClaimsInvariantError` + `assertActingIdentityInvariant()` (REQ-03)** — design.md §5.5 did not name this guard. It lives in `claims.ts`, runs after the merge and before `setCustomUserClaims`, and the controller maps it to `400 { error: { message: "Invalid custom claims" } }`. Covered by unit tests plus a service test that feeds malformed target claims. This adds a row to the design.md §9 error matrix.
4. **`invalidateUserTokens` now returns `string | null` (uid) instead of `boolean`** — NFR-12 requires the uid in the logout INFO log. The only caller is the logout handler; no behavioral change beyond the return value.
5. **`src/app.ts` maps `FST_ERR_CTP_INVALID_MEDIA_TYPE` (415) → 400** — AC-19 requires 400 for an unsupported `Content-Type`; Fastify's default is 415. The mapping is app-wide (a wrong content type is a bad request everywhere), and the envelope stays `{ error: { message } }`.
6. **`tsconfig.scripts.json` added** — `tsconfig.json` includes only `src/**/*`; adding `scripts/**/*` there would move the compiler root and emit `dist/src/server.js`, breaking `npm start`. The seed script is type-checked with `npx tsc -p tsconfig.scripts.json`.
7. **Lookup route uses `attachValidation: true`** — AC-05 demands the exact message `"Invalid email format"`, which Fastify's default validation text would not produce. Validation still runs through TypeBox/Ajv; the handler maps the failure to the required message. 400s on this route therefore do not flow through `app.setErrorHandler`.
8. **The seed script itself is not unit-tested** (per design.md §10 it is a thin wrapper around the tested `mergeAdminRole`/`parseSeedTarget`). Its fail-fast paths — missing `FIREBASE_PROJECT_ID`, missing ADC, ambiguous target — were verified manually (exit code 1 + clear message). `GOOGLE_APPLICATION_CREDENTIALS` is required explicitly rather than relying on implicit ADC discovery, so EC-20 is deterministic.
9. **Process deviation (T009)** — the lookup route + controller were written in the same edit as T007 (both live in `routes/auth.ts` and `authController.ts`), so T009's tests never observed RED. All 10 tests pass; recorded for transparency.
10. **Test-only correction (T004)** — TypeBox's own `Value.Check` does not know the `email` format (Ajv supplies it at runtime in Fastify), so `tests/models/AuthSchemas.test.ts` registers the format locally. The schema declaration itself was not changed to satisfy a test.

### Cross-repo changes (approved, outside `from-the-hart-auth`)

- `from-the-hart-tech-api-reverse-proxy-worker/src/routes.ts` — 3 pathRules × 3 environments (`local`, `dev`, `prod`), each `{ validateAccessToken: true }`.
- `docs/architecture/identity-and-access.md` — `entitlements` claim + `admin` platform role, consumer rules, lookup moved from deferred to Specified, entitlement endpoints added to the API contracts table.
- `CONTEXT.md` (root) — `Admin` and `Entitlement` glossary entries; `Role` entry updated to include `admin` and the scope split.
- `docs/adr/0003-admin-role-entitlements-authorization.md`, `0004-out-of-band-admin-seeding.md`, `0005-logout-revocation-staleness.md` — new ADRs.

### Verification commands

```bash
cd from-the-hart-auth
npm test                          # 171 passing
npx tsc --noEmit                  # clean
npx tsc -p tsconfig.scripts.json  # clean (seed script)
npm run build                     # OK

cd ../from-the-hart-tech-api-reverse-proxy-worker
npm run build                     # OK
```
