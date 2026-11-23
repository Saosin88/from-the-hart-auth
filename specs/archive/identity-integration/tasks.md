# Tasks: Identity Integration (Auth → Identity Orchestration)

## Implementation Strategy

- **MVP First:** Complete Setup + Foundational + User Story 1, then run all tests — they must pass. Stop and validate.
- **Incremental Delivery:** This is a single user story (P1). After completion, deploy.
- **Parallel Opportunities:** T001, T002, T003 (Setup tasks) can all run in parallel — different files, no shared dependencies.

---

## Phase 1: Setup

- [ ] **T001 [P] Implement config changes for Identity integration**
  WHAT: Adds IDENTITY_SERVICE_URL to src/config/index.ts with startup validation per AC-09 and REQ-18, REQ-19.
  HOW: Add identityServiceUrl to the config object, read from process.env.IDENTITY_SERVICE_URL. Validate at module load — throw if missing, skip validation in test env (match existing pattern in Identity service config). Follow the existing config structure in src/config/index.ts.
  FILES: src/config/index.ts, tests/config/config.test.ts (NEW)
  RED: npx vitest run tests/config/config.test.ts — must FAIL (file does not exist yet)
  GREEN: Implement config + test. Run npx vitest run tests/config/config.test.ts — must PASS
  REFACTOR: npx tsc --noEmit && npx vitest run tests/config/config.test.ts — must still PASS
  EDGE CASES: Missing env var in non-test mode → crash. Missing env var in test mode → skip validation (service still starts). Empty string → treated as missing.

- [ ] **T002 [P] Add google-auth-library as direct dependency**
  WHAT: Makes google-auth-library a direct dependency per REQ-20.
  HOW: Add "google-auth-library": "^9" to dependencies in package.json, then run npm install.
  FILES: package.json, package-lock.json
  RED: N/A — dependency installation task. Verify with npm ls google-auth-library showing it as a direct dep.
  GREEN: npm install && npm ls google-auth-library — must show google-auth-library@9.x directly under from-the-hart-auth
  REFACTOR: npx tsc --noEmit — must compile with no errors

- [ ] **T003 [P] Add IDENTITY_SERVICE_URL to Terraform**
  WHAT: Sets the Identity service URL as an environment variable on Auth Cloud Run container per REQ-21.
  HOW: Add an env block inside the containers list in both terraform/dev/main.tf and terraform/prod/main.tf, using the hard-coded URLs from the API Gateway routes.ts (design.md ADR-02). Add a comment noting the URL is stable for the Cloud Run service lifetime.
  FILES: terraform/dev/main.tf, terraform/prod/main.tf
  RED: terraform validate in each environment dir — must PASS (env block syntax valid)
  GREEN: Same — terraform validate confirms syntax. Actual apply deferred to deployment.
  REFACTOR: N/A — HCL formatting is handled by terraform fmt

**Checkpoint:** Config, dependency, and Terraform changes are complete. `npx tsc --noEmit` succeeds, `npm ls google-auth-library` shows the direct dependency, and `terraform validate` passes in both environments. STOP before proceeding to Phase 2.

---

## Phase 2: Foundational

WARNING: All Phase 2 tasks must be complete before any User Story work begins.

- [ ] **T004 Implement IdentityServiceError class**
  WHAT: Creates a typed error class for Identity service failures per design.md Error Handling — Error Class Hierarchy section.
  HOW: Create a simple class extending Error with a statusCode: number property. Used by identityService.ts to wrap HTTP errors and network/timeout failures. Follow error handling patterns in design.md.
  FILES: src/services/identityService.ts (start of file)
  RED: npx tsc --noEmit — must FAIL (module not found — class does not exist yet)
  GREEN: npx tsc --noEmit — must compile
  REFACTOR: Same — npx tsc --noEmit

- [ ] **T005 Implement identityService.createIdentity**
  WHAT: Implements the HTTP client that calls Identity POST /identity endpoint per REQ-01, REQ-02, REQ-09, and design.md createIdentity interface section.
  HOW: Use GoogleAuth from google-auth-library per design.md Authentication section. Call getIdTokenClient(identityServiceUrl) to get request headers. Use native fetch with AbortController for 10-second timeout. Parse JSON response. Return identity_id on 201. Throw IdentityServiceError on any other status or network/timeout failure. Timeout = 10s per REQ-09 / NFR-01.
  FILES: src/services/identityService.ts, tests/services/identityService.test.ts (NEW)
  RED: npx vitest run tests/services/identityService.test.ts — must FAIL (file does not exist yet)
  GREEN: Implement service + tests. Run npx vitest run tests/services/identityService.test.ts — must PASS
  REFACTOR: npx vitest run tests/services/identityService.test.ts — must still PASS

**Checkpoint:** identityService.ts is fully implemented and tested. `npx vitest run tests/services/identityService.test.ts` passes all 8 edge cases. STOP before proceeding to Phase 3.
  EDGE CASES: Identity returns 201 with valid UUID → return it. Identity returns 201 with unexpected body shape → throw. Identity returns 400 → throw IdentityServiceError(statusCode=400). Identity returns 403 → throw IdentityServiceError(statusCode=403). Identity returns 500 → throw IdentityServiceError(statusCode=500). Request exceeds 10s timeout → AbortController fires → throw IdentityServiceError(statusCode=0). Network failure (fetch rejects) → throw IdentityServiceError(statusCode=0). Response body is not valid JSON → throw IdentityServiceError.

---

## Phase 3: User Story 1 — Registration Creates Identity (Priority: P1) MVP

- [ ] **T006 [US1] Modify registerPrincipal to orchestrate Identity creation**
  WHAT: Changes the registration flow in authService.ts to call Identity, set custom claims, and rollback on failure per AC-01 through AC-08, REQ-04, REQ-05, REQ-06, REQ-08, REQ-10, REQ-11, REQ-12.
  HOW: After createUser, call createIdentity(email). On success, call setCustomUserClaims(uid, { identities: { [identity_id]: ["owner"] }, acting_identity: identity_id }) per design.md Architecture Overview flow diagram. Then createCustomToken(uid) with NO claims argument per REQ-05 / architecture doc Decision 4. On Identity failure: call deleteUser(uid) per REQ-08. Map error status codes to user messages per design.md Registration Error Matrix. Log per design.md Logging Strategy. Email verification still fires last per REQ-07.
  FILES: src/services/authService.ts, tests/services/authService.test.ts (NEW)
  RED: npx vitest run tests/services/authService.test.ts — must FAIL (file does not exist yet)
  GREEN: Implement changes + tests. Run npx vitest run tests/services/authService.test.ts — must PASS
  REFACTOR: npx vitest run tests/services/authService.test.ts — must still PASS
  EDGE CASES: Identity returns 201 → claims set, token issued with claims in payload. Identity returns 400 → deleteUser called, generic error. Identity returns 403 → deleteUser called, "Service configuration error". Identity returns 500 → deleteUser called, generic error. Identity timeout → deleteUser called, generic error. deleteUser fails during rollback → both errors logged, generic error (EC-06). setCustomUserClaims fails after Identity succeeds → Identity orphaned (deferred per requirements), deleteUser attempted, generic error (EC-05). createUser fails → no Identity call made, controller handles Firebase errors (EC-04).

- [ ] **T007 [US1] Update log messages for new registration flow**
  WHAT: Ensures all registration-related log messages follow the logging strategy in design.md per REQ-13 through REQ-17.
  HOW: Modify registerPrincipal to log Identity creation success at INFO (with identity_id), Identity failures at ERROR (with status code and Identity error details), rollback start/success at INFO, rollback failure at ERROR (with both original and rollback errors). Use structured JSON fields: operation, email, uid, identity_id (on success), identityStatus (on error), identityError (on error), rollbackError (on rollback failure). Follow existing logger patterns in authService.ts.
  FILES: src/services/authService.ts
  RED: `npx vitest run tests/services/authService.test.ts` — must FAIL on missing log assertions (test file expects logger calls that are not yet implemented)
  GREEN: npx vitest run tests/services/authService.test.ts — must PASS (T006 tests should verify logger calls)
  REFACTOR: npx vitest run tests/services/authService.test.ts — must still PASS
  EDGE CASES: identity_id is empty string → still logged. identity_id is null/undefined → logged as "unknown". Rollback error object is undefined → handle gracefully. Logger itself throws → error surfaces as uncaught exception.

- [ ] **T008 [US1] Update register.spec.ts integration tests**
  WHAT: Updates the existing registration test to work with the new orchestrated flow per AC-01, AC-02, AC-10, SC-01, SC-03.
  HOW: Update the mock for authService.registerPrincipal to reflect the new flow. Add a new test: "should return ID token containing identities and acting_identity claims" that decodes the mock token and verifies claims shape. Keep all four existing tests (success, email in use, invalid email, weak password) — they should pass with the updated mock. Addresses design.md Testing Strategy.
  FILES: tests/auth/register.spec.ts
  RED: npx vitest run tests/auth/register.spec.ts — must FAIL (mock shape outdated)
  GREEN: Update mock + tests. Run npx vitest run tests/auth/register.spec.ts — must PASS
  REFACTOR: npx vitest run tests/auth/register.spec.ts — must still PASS

**Checkpoint:** At this point, User Story 1 should be fully functional and independently testable. Run npm test — all tests must pass. STOP and validate before proceeding to Phase 4.

---

## Phase 4: Polish and Cross-Cutting

- [ ] **T009 Verify all existing tests pass**
  WHAT: Confirms non-interference with existing functionality per AC-10 and SC-03.
  HOW: Run the full test suite. All existing tests must pass without modification (except register.spec.ts updated in T008). If any test in login, logout, refresh-token, verify-email, reset-password, forgot-password, resend-verification, verify-id-token, or health endpoints fails, investigate and fix before proceeding.
  FILES: No code changes — verification only.
  RED: No RED step required — verification task only. Run `npm test` to establish baseline before starting this phase.
  GREEN: npm test — all tests must PASS
  REFACTOR: N/A
  EDGE CASES: N/A — verification task.
- [ ] **T010 TypeScript and build verification**
  WHAT: Ensures the project compiles cleanly with all changes.
  HOW: Run npx tsc --noEmit. Must produce zero errors. Also verify npm run build succeeds.
  FILES: No code changes — verification only.
  RED: No RED step required — verification task only. Run `npx tsc --noEmit` to establish baseline before starting this phase.
  GREEN: npx tsc --noEmit && npm run build — must succeed with no errors
  REFACTOR: N/A
  EDGE CASES: N/A — verification task.

**Checkpoint:** Full test suite passes (`npm test`) and TypeScript compilation succeeds (`npx tsc --noEmit && npm run build`). All 4 phases complete. Ready for deployment.

---

## Dependencies and Execution Order

### Phase Dependencies

Phase 1 (Setup) → Phase 2 (Foundational) → Phase 3 (User Story 1) → Phase 4 (Polish)

### Within Phase 1 (Setup)

- T001, T002, T003 are all [P] — can run in parallel (different files, no shared dependencies)

### Within Phase 2 (Foundational)

- T004 must complete before T005 (IdentityServiceError class is imported by identityService.ts)

### Within Phase 3 (User Story 1)

- T005 must be complete before T006 (createIdentity is called by registerPrincipal)
- T006 and T007 are in the same file (authService.ts) — do them together. T007 validates logging in T006 tests.
- T008 depends on T006 (updated service function needed for integration test mocks)

### Within Phase 4 (Polish)

- T009 and T010 can run in any order — both are verification-only
