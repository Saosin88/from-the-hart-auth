# Adversarial Spec Review: Access Control (Auth Service)

This is a well-developed spec set overall. Below I flag every gap I can find, organized by category. I focus on *real* issues — places where an implementing agent could drift, mis-interpret, or build something that fails a reasonable acceptance test.

---

## 1. MISSING REQUIREMENTS

### 1.1 `DELETE /auth/entitlements` request-body validation via TypeBox query vs body — ambiguity

- **Category**: Missing Requirement
- **Severity**: High
- **Finding**: REQ-10 says both POST and DELETE accept a JSON body `{ principal_uid, entitlement }`. Design §5.2 confirms. But DELETE with a body is non-standard (many HTTP clients, proxies, and Cloudflare Workers don't forward DELETE bodies reliably). AC-12 explicitly implies DELETE takes a body. There is no AC or REQ stating how a DELETE body should be parsed through the gateway, and no edge case covers "DELETE body stripped by proxy/client."
- **Suggestion**: Either (a) explicitly state the decision and add a note that the gateway forwards DELETE bodies (and add an EC that verifies a stripped body → 400), or (b) change DELETE to take `principal_uid` and `entitlement` as query params (path or query), with updated ACs.

### 1.2 Missing AC/REQ for `Content-Type` / malformed JSON body handling

- **Category**: Missing Requirement
- **Severity**: Medium
- **Finding**: TypeBox validation is referenced (AC-09, EC-02), but there is no AC for "POST with `Content-Type: text/plain`" or "POST with malformed JSON." Fastify returns a 400 by default, but the *shape* of that 400 is not specified (`{ error: { message } }` vs Fastify's default `{ statusCode, error, message }`). If not handled, the response envelope is violated.
- **Suggestion**: Add an AC: "Given a POST /auth/entitlements with malformed JSON or unsupported Content-Type, then response is 400 with `{ error: { message: ... } }` (existing error-handler envelope)". Add corresponding EC.

### 1.3 No explicit AC for the gateway 401 vs service 401 layering

- **Category**: Missing Requirement
- **Severity**: Medium
- **Finding**: EC-06 and AC-03 both assert 401 on missing/invalid token — but the gateway runs `validateAccessToken: true` first. An invalid token may be rejected at the gateway (which returns *its own* 401 shape, not Auth's `{ error: { message: "Unauthorized" } }`). The spec never states which layer owns the 401 envelope for the client. An implementer could assume Auth must produce it, but it may never be reached.
- **Suggestion**: Add an explicit assumption/constraint: "Gateway-level 401 responses use the gateway envelope; auth-service 401 ACs apply only to requests that pass the gateway and reach Auth. Tests mock the gateway path." Consolidate.

### 1.4 Missing AC for `GET /auth/lookup` email case normalization

- **Category**: Missing Requirement
- **Severity**: Medium
- **Finding**: `adminAuth().getUserByEmail()` — Firebase treats emails case-insensitively for lookup, but is this guaranteed? If a caller sends `Friend@Gmail.com`, does it match `friend@gmail.com`? Neither the requirements, edge cases, nor design address this. Also: what about `+tag` addresses? This is a real edge case for user-triggered bugs.
- **Suggestion**: Add an AC documenting expected behavior (e.g. "email matching is delegated to Firebase Admin `getUserByEmail`, which is case-insensitive") and an EC for mixed-case email → 200 with the same `principal_uid`.

### 1.5 No stated behavior for `entitlement` containing whitespace characters surviving `minLength: 1`

- **Category**: Missing Requirement
- **Severity**: Medium
- **Finding**: AC-09 says empty/whitespace-only → 400. But `minLength: 1` alone will NOT reject `" "` (single space) — it passes minLength. There is no `.trim()`/pattern requirement. AC-10 says "any non-empty string is accepted verbatim." So `" storage"` or `"storage "` (leading/trailing whitespace) or `"stor age"` (interior space) would be accepted and are *semantically distinct* from `"storage"`. This is a real bug source for downstream consumers.
- **Suggestion**: Explicitly decide: (a) reject whitespace-only via a `pattern` or a post-validation trim that rejects empty after trim; (b) accept arbitrary bytes including whitespace and document that downstream services must do exact-match against a normalized form. Add AC/EC for `" storage"`, `"storage "`, `"stor age"`, and tab/newline characters.

### 1.6 No AC covering `principal_uid` values containing special characters / injection attempts

- **Category**: Missing Requirement
- **Severity**: Low
- **Finding**: `minLength: 1` accepts any string, including newlines, long strings, and unicode. Firebase `getUser()` will reject invalid UIDs, but the resulting error path (`auth/invalid-uid` or similar) is not mapped in design §9's error class mapping (only `auth/user-not-found` is mapped to 404; unknown Firebase errors → 500). A malicious or buggy client sending `principal_uid: "\n\n"` would cause a 500.
- **Suggestion**: Add an AC for `auth/invalid-uid` / `auth/invalid-argument` error handling from `getUser()` → 400 or 404 (decide and document). Add corresponding EC. Alternatively, add a `pattern` on `principal_uid` (Firebase UIDs are 28-char alphanumeric).

### 1.7 Missing NFR for log retention / PII in logs

- **Category**: Missing Requirement
- **Severity**: Medium
- **Finding**: NFR-11 logs the queried *email* (PII) at INFO. There is no retention policy, no redaction policy, and no statement of whether this is acceptable. Since the repo may be public (Assumption), the deployed service logs may be inspected by anyone with Cloud Run access. The spec should at least acknowledge this.
- **Suggestion**: Add an NFR: "Lookup emails logged at INFO are retained per Cloud Run default retention (30 days). No additional PII redaction is applied — accepted because the caller is authenticated admin." Or add redaction (hash the email).

### 1.8 Missing user-facing error-envelope consistency for `AdminAuthorizationError` from *target* (non-existent) re-authorization

- **Category**: Missing Requirement
- **Severity**: Low
- **Finding**: REQ-03 says "After any claims write, `acting_identity` MUST remain a key in the target's `identities` map. A write that would violate this invariant MUST be rejected (400)." However, no current write path *can* violate this invariant (entitlement ops don't touch `identities`; seed script explicitly preserves it). REQ-03 is therefore dead-letter — it describes a guard that is unreachable. Either the guard is unnecessary (then remove the requirement) or it should be tested (then add an AC/EC that forces the guard to trigger, which is hard because the guard is behind failed writes).
- **Suggestion**: Either remove REQ-03 (it's structurally guaranteed by ADR-0003's design) OR add an AC + a mock-based test that injects a hypothetical write path where `mergeEntitlement` is passed a claims object missing `acting_identity` and asserts it rejects. Currently the test matrix (design §10) does not list a test for REQ-03.

### 1.9 Missing explicit "no admin console / UI in this spec" constraint

- **Category**: Missing Requirement
- **Severity**: Low
- **Finding**: Non-Goals table defers "Website role-based UI / switch-identity UX" but does not explicitly say "no admin UI" — a reader might think SC-01 ("manual verification... in under a minute") implies a UI. It's implied, but never stated that the *only* interface is curl/HTTP calls.
- **Suggestion**: Add to Non-Goals: "Admin UI or website changes for entitlement grant/revoke — out of scope; verification is via curl."

---

## 2. UNSTATED ASSUMPTIONS

### 2.1 "Firebase Admin uses ADC in Cloud Run" — assumed, not stated

- **Category**: Unstated Assumption
- **Severity**: High
- **Finding**: Design §1 says `adminAuth()` via "ADC" for Cloud Run. Nowhere is it stated *how* the deployed Auth service obtains Firebase Admin credentials (Google-managed service identity? Workload identity? Attached service account?). This matters because it affects IAM setup and is a prerequisite for the *new* `getUserByEmail` / `setCustomUserClaims` permissions. The existing service already uses `firebase-admin`, but the *existing* calls (createUser, setCustomUserClaims during registration) may be limited. The new calls share permissions, but this is assumed.
- **Suggestion**: Add an explicit assumption: "The existing Cloud Run service identity already holds `firebaseauth.users.get` / `firebaseauth.users.update` / `firebaseauth.users.list` permissions — no IAM changes are required. If they were lacking, `getUserByEmail` would fail with permission-denied and map to 500 per NFR-14." Confirm in Assumptions section.

### 2.2 "The gateway forwards `X-Serverless-Authorization`" is asserted but not verified

- **Category**: Unstated Assumption
- **Severity**: Medium
- **Finding**: Design §1 and §6.3 assume the gateway forwards both `Authorization` (end-user) and `X-Serverless-Authorization` (Google ID token) to the Auth service. But the requirement's Assumptions section says "the gateway currently forwards headers unconditionally." There's no *failure mode* defined if the gateway stops forwarding `Authorization` — `/auth/lookup` and entitlements will 401 for all callers, with no fix in Auth.
- **Suggestion**: Add an observability requirement: "If `/auth/lookup` or `/auth/entitlements` return 401 to a caller holding a valid token because the gateway failed to forward `Authorization`, this will be visible as a spike of `401 Unauthorized` on these endpoints (distinct from `verifyIdToken` failure — check `firebase auth error code` log field). No fallback exists in Auth; this is a gateway contract break and must be fixed in the gateway spec."

### 2.3 "Firebase `getUserByEmail` is fast, side-effect free, and doesn't rate-limit" — assumed

- **Category**: Unstated Assumption
- **Severity**: Low
- **Finding**: NFR-01 budget is P99 < 200ms "excluding one verifyIdToken + one getUser + one optional setCustomUserClaims round-trip" — but `getUserByEmail` is not listed in the budget exclusion. NFR-01 mentions the excluded Firebase calls but omits `getUserByEmail`, which is the primary call for lookup. Is it excluded too?
- **Suggestion**: Revise NFR-01 to enumerate *all* excluded Firebase Admin round-trips: `verifyIdToken`, `getUser`, `getUserByEmail`, `setCustomUserClaims`.

### 2.4 "Firebase Admin SDK calls are idempotent / safe to retry" — assumed

- **Category**: Unstated Assumption
- **Severity**: Medium
- **Finding**: EC-13 and EC-21 assume a failed `setCustomUserClaims` leaves the target unchanged (line: "read-merge-write reads first, so a failed write leaves the target unchanged"). But a *partial* failure is possible: read succeeds, write is submitted, network blips *after* Firebase has committed but *before* the ACK is received → client sees 500, but claim was written. The retry (if the user retries) is idempotent for grant/revoke (AC-11/12), but if the user gives up after seeing 500, the state may be unexpectedly changed. This is a "safe-to-retry" implicit assumption.
- **Suggestion**: Add an EC-22: "If `setCustomUserClaims` times out after Firebase has applied the write, the client receives 500 but the entitlement may already be granted/revoked. This is accepted: because grant/revoke are idempotent, retrying is safe. Document in the error-handler response that 5xx on writes is not guaranteed-no-op." Or add a verification step (re-read claims after write to confirm) — but that's expensive. At minimum, document the ambiguity.

### 2.5 "Assumptions section" lacks explicit scale lock for concurrent calls to the *same* entitlement on the same principal

- **Category**: Unstated Assumption
- **Severity**: Low
- **Finding**: EC-12 says two concurrent writes → "last-write-wins... no locking required." But if two *admins* (or one admin retrying) concurrently grant and revoke the *same* entitlement, the final state is non-deterministic and the client has no way to know. Also, the merge preserves `identities` but both writers may clobber `entitlements`. This is accepted, but there's no note that this is a *known limitation* with mitigation strategy (none). It should be stated.
- **Suggestion**: Add to Assumptions: "There is exactly one admin in Phase 1; concurrent admin writes are therefore impossible in practice. The scale assumption ('single-digit writes per week') makes this acceptable." Add a note in EC-12 that if multiple admins are added later, optimistic concurrency or locks will be required.

### 2.6 "`mint fresh ID token` phrase — is it login-only or does refresh mint new claims?" — assumed

- **Category**: Unstated Assumption
- **Severity**: Medium
- **Finding**: AC-18 says "when a fresh ID token is minted (login or refresh), then the token's custom claims contain a top-level `entitlements` array..." — this assumes the existing refresh flow carries custom claims through unchanged (which Firebase does — `refreshToken` → new ID token includes `customClaims` from current user state). But the *mechanism* is not stated. If the refresh endpoint happens to re-read claims via `getUser`, vs Firebase auto-includes them, behavior could differ (e.g., propagation delay of `setCustomUserClaims` to `refreshToken` is usually immediate but not zero). No test target for "entitlements propagate ≤ 1h to a *refreshed* token" is described.
- **Suggestion**: Add an AC or test spec: "Given an entitlement is granted, when the target's client refreshes the ID token within the refresh-token lifetime, the new token includes the entitlement (verified by test that mocks `verifyIdToken`/refresh path)." Specify that entitlement propagation latency is *not* independently verified — accepted at the ≤1h NFR-07 boundary.

### 2.7 "`GET /auth/logout` may be called with a valid token that was already revoked" — unaddressed

- **Category**: Unstated Assumption
- **Severity**: Low
- **Finding**: EC-16 says "invalid/expired token → `invalidateUserTokens` throws inside try; cookie still cleared, 200." But a *revoked* token (from a prior logout) triggers `auth/id-token-revoked` from `verifyIdToken`. That's not expired, but invalid. Is it treated as 200 gracefully? The requirement (AC-17) says "invalid ... token → revocation skipped (or fails internally) but ... still 200." But `auth/id-token-revoked` behavior should be explicit.
- **Suggestion**: Add EC: "Logout with a revoked-but-not-yet-expired token → `verifyIdToken` throws `auth/id-token-revoked`, caught by the same try/catch → 200 + cookie cleared."

---

## 3. DESIGN GAPS

### 3.1 Controller error mapping is specified but the controller extraction method is not

- **Category**: Design Gap
- **Severity**: Medium
- **Finding**: Design §9 says "`AdminAuthorizationError` → 403" and "`FirebaseAuthError` `auth/user-not-found` → 404" and so on. But how does the controller distinguish `FirebaseAuthError` from other errors? Firebase Admin's `FirebaseAuthError` has a `code` field (e.g., `"auth/user-not-found"`). The design doesn't say `error.code === "auth/user-not-found"`. Similarly, distinguishing `auth/argument-error` (400) vs `auth/id-token-expired` (401) is possible but requires enumerating codes. If a new code appears, it falls through to 500 — which may be wrong (e.g., `auth/certificate-fetch-error` is a 500 but `auth/id-token-revoked` should be 401).
- **Suggestion**: Add a table in design §9 listing the *explicit set* of `FirebaseAuthError` codes and their mappings. Call out fall-through behavior. Add a test per code. Particularly: `auth/id-token-revoked`, `auth/id-token-expired`, `auth/invalid-id-token`, `auth/argument-error`, `auth/user-disabled`, `auth/internal-error`.

### 3.2 `parseSeedTarget` throwing on "both set" — no test path in the seed script

- **Category**: Design Gap
- **Severity**: Low
- **Finding**: T005 says `parseSeedTarget` throws if both email and uid are set (or neither). But T005's testing section says "The read-merge-write logic `mergeAdminRole` is covered by `tests/utils/claims.test.ts` per design.md §10 — this script is a thin wrapper; no live-Firebase test." There is no test for the *script's* handling of `parseSeedTarget` throwing (exit code, error message). EC-20 tests "no ADC → loud error" but the both-set case isn't covered end-to-end.
- **Suggestion**: Add a test for `parseSeedTarget` covering the "both set → throws" case in `tests/utils/claims.test.ts`. Clarify that this is exactly what the design already implies but the task list only mentions the four cases in T002's EDGE CASES — actually T002 does mention it ("both (throw), neither (throw)"). Fine — but note this is unit-level only; no integration test for the script itself. **This is acceptable if documented as such.** Add clarification to T005: "the script is not integration-tested; unit coverage of `parseSeedTarget` + `mergeAdminRole` provides the coverage floor."

### 3.3 No interface contract for `adminAuth()` DI/wrapping

- **Category**: Design Gap
- **Severity**: Medium
- **Finding**: T003/T006/T008 all mock `../../src/services/firebase`. But there is no statement of how `adminAuth()` is imported or exposed by `src/services/firebase.ts`. Assumption: it exports `adminAuth()` returning `{ verifyIdToken, getUser, getUserByEmail, setCustomUserClaims, revokeRefreshTokens }`. If the actual module exports them differently, the mocks break. This is not a spec-level concern but a testability contract.
- **Suggestion**: Add to design §5.5: "Tests mock `src/services/firebase`'s `adminAuth()` export, whose current shape is `() => Auth` from `firebase-admin`; the new services call `adminAuth().verifyIdToken`, `.getUser`, `.getUserByEmail`, `.setCustomUserClaims`, `.revokeRefreshTokens`." Or, add a note that this is assumed to be the existing shape.

### 3.4 Missing design for `invalidateUserTokens` implementation

- **Category**: Design Gap
- **Severity**: Medium
- **Finding**: T010 says "restore the commented block" — implying `invalidateUserTokens` is already implemented in `authService.ts` and just called from the controller (or is it implemented and not called, or commented out in both places?). The requirements (REQ-20) say "un-comment and invoke `invalidateUserTokens(idToken)` when a valid Bearer ID token is present." This implies the function exists and is commented out at the call site. But `invalidateUserTokens`'s *own* behavior (`verifyIdToken` → `revokeRefreshTokens`) is only mentioned in AC-16 parenthetically: "`invalidateUserTokens(idToken)` (which calls `verifyIdToken` and `revokeRefreshTokens(uid)`)." — If the function is already implemented, fine. If it's stubbed to throw, that's a gap.
- **Suggestion**: State explicitly: "`invalidateUserTokens` is [already implemented / needs re-verification / is currently a no-op]. If a no-op, the task must implement `verifyIdToken` + `revokeRefreshTokens(uid)` — additional test required." Add a task step to `T010` to verify the function body is correct.

### 3.5 Missing design for cookie clearing constants

- **Category**: Design Gap
- **Severity**: Low
- **Finding**: REQ-21 lists cookie attributes: `.fromthehart.tech` domain, `/auth/refresh-token` path, secure, httpOnly, sameSite none. This is described as existing behavior to preserve. But no design reference to where those constants live (config?), or whether `clearCookie` requires them to match the set attributes to succeed. If they drift, logout silently fails to clear the cookie. No test asserts the cookie attributes.
- **Suggestion**: Add a test in `tests/auth/logout.spec.ts` that asserts the cookie-clear call passes the correct `domain`, `path`, `secure`, `httpOnly`, `sameSite`. Add a design note referencing the constants' location.

### 3.6 No `X-Request-Id` / trace ID for auditability

- **Category**: Design Gap
- **Severity**: Low
- **Finding**: NFR-09..12 all log at structured levels but never mention a correlation ID. Admin actions (grant/revoke) are security-sensitive — trace IDs are standard for audit. Fastify often supports this out of the box (via `request.id`). Not addressed.
- **Suggestion**: Add to design: "Structured logs include Fastify's `request.id` as `correlation_id` for tracing. No new header parsing." Or explicitly note this is deferred to a cross-cutting observability spec.

### 3.7 No config validation for the seed script env vars

- **Category**: Design Gap
- **Severity**: Low
- **Finding**: Design §5.6 lists `TARGET_PRINCIPAL_EMAIL`, `TARGET_PRINCIPAL_UID`, `GOOGLE_APPLICATION_CREDENTIALS`, `FIREBASE_PROJECT_ID` as required/optional env vars. But if `FIREBASE_PROJECT_ID` is unset, `admin.initializeApp({ projectId: undefined })` may still succeed via ADC's default project discovery — or fail. The failure message is not specified. Similarly, `GOOGLE_APPLICATION_CREDENTIALS` unset → Firebase Admin's ADC propagation may fail with a confusing stack trace, not a "loud, clear error."
- **Suggestion**: Add a design step: "The seed script validate-imports `parseSeedTarget` and additionally validates `FIREBASE_PROJECT_ID` present. On missing env, exit code 1 with `Error: missing FIREBASE_PROJECT_ID`." Add a test (or accept it's manual-only).

---

## 4. RISK AREAS

### 4.1 Admin seeding is a single point of failure / single point of compromise

- **Category**: Risk
- **Severity**: High
- **Finding**: The entire authorization model rests on the out-of-band seed script successfully granting `admin` to the owner. If it fails silently (wrong UID, wrong email alias), no one can administer the platform. If it *succeeds* on the wrong principal (typo'd email), an unauthorized principal gets admin. There's no self-test, no verification output beyond "print `{ uid, identity_id, roles }`," and no "verify before write" step.
- **Suggestion**: Add a verification step: "The seed script reads back the user's claims after `setCustomUserClaims` and asserts `identities[<identity_id>]` includes `"admin"`; print a final `SUCCESS: admin role granted to <uid>` and exit 0, or exit 1 with the actual roles if verification fails." Add a related task (T005) sub-verification.

### 4.2 No test for the "acting as non-admin identity while holding admin on another identity" 403 case, despite being emphasized

- **Category**: Risk
- **Severity**: Medium
- **Finding**: AC-04/AC-07/EC-05 all stress that admin on a *non-acting* identity must not authorize. But the test matrix in design §10 lists `hasAdminRole` tests ("admin pass / non-admin / missing acting_identity / acting_identity not in identities"). It does **not** explicitly list "admin role present on a *different* identity, acting_identity points to a non-admin identity → false." This is the exact case the spec calls out as a mistake-prone area. It's *implied* by the check contract but not called out as a test case.
- **Suggestion**: Add explicit test case in T002's EDGE CASES: "`hasAdminRole` returns false when `identities["other-id"]` includes `"admin"` but `acting_identity` points to a non-admin identity." Also in T007/T009 EDGE CASES: "integration: token with admin on identity A, acting_identity = B (non-admin) → 403."

### 4.3 Gateway route additions across 3 environments are a cross-repo risk

- **Category**: Risk
- **Severity**: High
- **Finding**: T001 adds 2 rules × 3 environments (local/dev/prod) = 6 config changes in a *different repo*. There's no CI gate verifying the gateway config is valid, and the task's RED/GREEN check is a `grep` — which doesn't catch typos in the rule structure or whitespace issues that would render the rule inert. If the gateway config is malformed, the Auth endpoints are unreachable in production.
- **Suggestion**: Add a manual verification step: "After editing `routes.ts`, run the gateway's typecheck/build (`cd from-the-hart-tech-api-reverse-proxy-worker && npm run build`) and confirm it succeeds." Add a rollout note: "Deploy gateway first, then service; the reverse order is a brief period of unreachable endpoints but existing endpoints still work."

### 4.4 No handling for Firebase Admin transient failures within retry window

- **Category**: Risk
- **Severity**: Medium
- **Finding**: NFR-14 says unexpected Firebase errors → 500. But no retry policy is described for *transient* Firebase Admin errors (`auth/internal-error`, network timeouts, quota errors). At single-digit request load this is acceptable, but for a security-sensitive operation like entitlement grant, a transient 500 is annoying. Suggestion is "owner retries."
- **Suggestion**: Add a design note: "No retry logic added for `getUser`/`getUserByEmail`/`setCustomUserClaims`; failures surface as 500, and the owner retries manually. Because grant/revoke are idempotent, retry is safe (see §4 above on partial-failure ambiguity)."

### 4.5 `entitlements` array growth is non-monotonic and untracked per-domain

- **Category**: Risk
- **Severity**: Low
- **Finding**: Entitlements accumulate on a Principal's claim forever unless explicitly revoked. There is no "list entitlements" endpoint (non-goal), meaning an admin granting an entitlement has no way to *inspect* what's currently granted for a target. This is a usability/audit gap: if the owner loses track of what was granted, they cannot see it without inspecting Firebase directly.
- **Suggestion**: Either (a) add a Non-Goal note: "A list-entitlements endpoint is deferred; to inspect, use Firebase console / Admin SDK directly," or (b) note this as a known risk in Assumptions: "Grant track-ability is limited until a list endpoint exists."

### 4.6 Same UID grant+revoke in quick succession — no ordering guarantee

- **Category**: Risk
- **Severity**: Low
- **Finding**: EC-12 addresses concurrent writes, but not "rapid sequential writes." If grant and revoke are sent back-to-back (e.g., user cancels), Firebase `setCustomUserClaims` write propagation to the caching layer (if any) may race. Accepted under "single-digit writes per week," but is worth stating.
- **Suggestion**: Covered by EC-12 — no action needed. Optional: add a note that read-after-write consistency is not guaranteed by Firebase Admin SDK.

### 4.7 AC-10 "verbatim" vs AC-09 "no whitespace-only" — potential contradiction risk

- **Category**: Risk
- **Severity**: Medium
- **Finding**: AC-09 says empty or whitespace-only entitlement → 400. AC-10 says "any non-empty string is accepted verbatim — no central validation." A string like `" "` (single space) is both "whitespace-only" (AC-09 rejects) and "non-empty" (AC-10 accepts). Contradiction unless implementation includes explicit whitespace-trim check beyond `minLength: 1`. See 1.5 above — same root issue but flagged as risk: an implementing agent will likely take `minLength: 1` at face value and pass the AC-09 test (empty string) but fail the "whitespace-only" subcase.
- **Suggestion**: Resolve in 1.5.

---

## 5. IMPLEMENTABILITY (AI Agent Readiness)

### 5.1 Tasks lack explicit inputs/outputs/verifications schema

- **Category**: Implementability
- **Severity**: Medium
- **Finding**: Task T003 has `FILES`, `RED`, `GREEN`, `REFACTOR`, `EDGE CASES` — good. But there's no `VERIFY` command distinct from `GREEN`/`REFACTOR`. Per the review categories, "Tasks missing VERIFY/FILES/EDGE CASES fields" is a flag. VERIFY should be a post-implementation "how do we know this worked end-to-end" (e.g., `curl` a manual endpoint + grep logs), separate from `GREEN` (unit tests pass). All tasks have `RED`/`GREEN`/`REFACTOR` but no `VERIFY`.
- **Suggestion**: Add `VERIFY` to each task: e.g., T007 VERIFY = "spin up local server, issue admin token via dev tooling, `curl -X POST /auth/entitlements` with grant body, assert 200 + claims updated; grep logs for `operation: grantEntitlement`."

### 5.2 AC-to-task traceability matrix is absent

- **Category**: Implementability
- **Severity**: High
- **Finding**: Tasks reference ACs inline (e.g., T006 "per requirements AC-06 through AC-13") but there's no AC↔Task matrix. Given there are 18 ACs and 15 tasks, an agent cannot quickly verify "is AC-17 fully covered?" — it must scan. Also, some ACs (AC-03 for 401 on `verifyIdToken` failure) are only weakly covered across T007/T009, and no task explicitly asserts the 401 path at integration level.
- **Suggestion**: Add a traceability table to `tasks.md` at the end mapping each AC to one or more Task IDs. Find uncovered ACs and add tasks/steps.

### 5.3 Tasks reference files not in the FILES list

- **Category**: Implementability
- **Severity**: Medium
- **Finding**: T003 says `Mock ... in tests` but the FILES list is `src/services/accessControlService.ts` (NEW) and `tests/services/accessControlService.test.ts` (NEW) — good. T010 says `FILES: src/controllers/authController.ts, tests/auth/logout.spec.ts` — but "restore the commented block" implies there may be changes to `src/services/authService.ts` (the function body) — not listed. T010's HOW doesn't clarify if the function is already implemented. Task files are complete but ambiguities like this could lead to unexpected edits outside the file list.
- **Suggestion**: Clarify T010: "Confirm `authService.invalidateUserTokens` is already implemented; if not, add it to `src/services/authService.ts` and add it to FILES."

### 5.4 No checkpoint after Phase 1 (Setup)

- **Category**: Implementability
- **Severity**: Low
- **Finding**: The task list has checkpoint comments after Phase 3 (US1), Phase 4 (US2), Phase 5 (US3), and Phase 6 (Polish) — but Phase 1 (T001) and Phase 2 (T002–T005) have no explicit "STOP and validate" checkpoints. Phase 1 is cross-repo and risky; a checkpoint after T001 (verify the gateway edit is valid) is warranted. Phase 2 has a "⚠️ No user story work begins until Phase 2 is complete" note — good — but no explicit "run `npm test` and confirm all foundational tests pass" checkpoint.
- **Suggestion**: Add checkpoint after Phase 1: "Verify gateway config builds (`npm run build` in gateway repo). Rollback if any error." Add checkpoint after Phase 2: "All foundational unit tests green; `npm test` still green."

### 5.5 No `[P]` marker on Phase 5 (US3) though it's independent

- **Category**: Implementability
- **Severity**: Low
- **Finding**: Phase 5 (T010 logout revocation) is stated to "be done any time after Foundational — sequenced last for a clean incremental story." But it's not marked `[P]` and the dependencies table says `Sequential (within phases)`. Since T010 touches `authController.ts` and `logout.spec.ts` (different files from T006-T009 which touch `accessControlService.ts`, `AuthSchemas.ts`, `routes/auth.ts`), it *could* run in parallel with US1/US2 if the shared `authController.ts` edit is the only conflict. This should be more explicit.
- **Suggestion**: Either (a) note that T010 conflicts with T007/T009 on `authController.ts` and must be sequential, or (b) split the logout edit into a separate concern and mark `[P]` for execution on a rebased branch. Document the conflict explicitly.

### 5.6 Tasks not grouped into "Setup / Foundational / User Stories / Polish" *with acceptance gates*

- **Category**: Implementability
- **Severity**: Low
- **Finding**: The phases are nominally grouped, but there is no acceptance-gate checklist per phase. E.g., Phase 2 completion criteria is only "T002–T005 pass their tests." From an agent's perspective, "Foundational is done" should be a checklist: all unit tests pass, no new endpoints registered, service builds, all foundational code traceable to REQs.
- **Suggestion**: Add per-phase "Acceptance Gate" bullet lists. E.g., Phase 2: "✓ claims.ts exists with 4 exports ✓ all 4 in tests/utils/claims.test.ts pass ✓ seed-admin.ts typechecks ✓ no new routes registered yet."

### 5.7 Design decisions not directly traceable to specific AC IDs

- **Category**: Implementability
- **Severity**: Medium
- **Finding**: ADR-0003, ADR-0004, ADR-0005 all cite REQs but not *individual ACs* mapping to them. E.g., ADR-0003 says "Addresses REQ-04, REQ-11, AC-04/06/07." — fine. But ADR-0004 only cites "REQ-16/17/18/19, AC-14/15, NFR-05/08" — this is complete. ADR-0005 cites "REQ-20/21/22, AC-16/17, NFR-07/13" — complete. Decision 6 (verify-id-token) cites "REQ-23" but no AC — because no AC mentions verify-id-token response format directly. Decision 7 cites "REQ-14/23, AC-10/13, NFR-06" — okay. Slight gap: Decision 6's commit to frozen verify-id-token contract deserves an AC reference or an explicit "no AC