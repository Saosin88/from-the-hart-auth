# Adversarial Spec Review: Identity Integration (Auth → Identity Orchestration)

## Summary

This is a well-structured specification with clear architecture and detailed requirements. However, there are several critical gaps that need addressing before implementation.

---

## Category: Missing Requirements

### HIGH-1: No Error Handling for Missing Identity Service Email Validation
- **Severity:** High
- **Finding:** REQ-01 sends `first_name: "", last_name: ""` during registration, but the Identity service may require non-empty values for these fields. If the Identity service rejects empty strings, this creates an unrecoverable failure path not covered in the error matrix.
- **Suggestion:** Add AC or REQ specifying that the Identity service accepts empty strings for first_name and last_name, OR add a requirement for Auth to validate these fields before sending.

### HIGH-2: No Explicit Handling for Identity Service Being Down at Startup
- **Severity:** High
- **Finding:** AC-09 only validates that `IDENTITY_SERVICE_URL` is set, not that the Identity service is reachable. The service could start successfully but fail on the first registration attempt, giving a false sense of health.
- **Suggestion:** Add a health-check AC: "Given the Auth service receives a startup health check, when it verifies the Identity service is reachable, then it returns healthy only if the connection succeeds."

### HIGH-3: Missing Requirement for Token Exchange Failure
- **Severity:** High
- **Finding:** The flow includes `exchangeCustomTokenForIdToken(customToken)` but there's no AC or REQ for what happens if this Firebase API call fails. If the token exchange fails after claims are set, the Principal is created with claims but the user gets an error.
- **Suggestion:** Add AC-11: "Given custom claims are set, when the token exchange with Firebase fails, then Auth deletes the Firebase user and returns a 500 error."

### MEDIUM-1: Missing Requirement for User Existence Check Duplication
- **Severity:** Medium
- **Finding:** EC-02 describes duplicate email handling via Firebase's `auth/email-already-exists`, but there's no explicit REQ about checking if the Identity service already has an identity for this email before creating one.
- **Suggestion:** Add REQ-22: "The system MUST NOT check for existing Identity records before calling POST /identity. The Identity service handles deduplication."

### MEDIUM-2: Missing Requirement for Response Schema Validation
- **Severity:** Medium
- **Finding:** AC-01 specifies the response as `{ data: { idToken } }` but doesn't define the exact schema for the ID Token or its encoding. The JWT claims structure is specified but the serialization format is not.
- **Suggestion:** Add REQ-23: "The ID Token MUST be a JWT conforming to RFC 7519, signed by Firebase, with decoded claims containing `identities` and `acting_identity`."

### MEDIUM-3: No Monitoring or Alerting Requirements
- **Severity:** Medium
- **Finding:** NFR-05 and NFR-06 cover logging but there's no requirement for metrics, dashboards, or alerts. The success criteria mention "log and alert" for rollback failures but no concrete alert mechanism.
- **Suggestion:** Add NFR-09: "Rollback failures MUST trigger an alert via Cloud Monitoring with notification to the operations channel."

### MEDIUM-4: Missing Rollback Sequence for setCustomUserClaims Failure
- **Severity:** Medium
- **Finding:** EC-05 describes the case where `setCustomUserClaims` fails after Identity creation but doesn't specify the order of rollback operations. Should `deleteUser` happen before or after logging?
- **Suggestion:** Add explicit REQ-22: "When setCustomUserClaims fails, the system MUST first log the failure, then attempt deleteUser, then return 500."

### LOW-1: Missing Requirement for Identity Service Response Validation
- **Severity:** Low
- **Finding:** The spec assumes Identity returns a well-formed `{ data: { identity_id } }` on 201, but doesn't specify behavior if the response is malformed (missing fields, wrong types, invalid UUID format).
- **Suggestion:** Add EC-08: "Identity returns 201 with missing `identity_id` field. Expected behavior: treat as failure, throw IdentityServiceError, rollback."

### LOW-2: No Request ID or Correlation ID
- **Severity:** Low
- **Finding:** The logging strategy includes `email`, `uid`, and `identity_id` but no correlation ID to link log entries from the same registration request. This makes debugging slow.
- **Suggestion:** Add REQ-24: "Each registration request MUST be assigned a requestId (UUID) that is included in all log entries for that request."

---

## Category: Unstated Assumptions

### HIGH-4: GoogleAuth.getIdTokenClient Caching Behavior Assumed
- **Severity:** High
- **Finding:** The design uses `GoogleAuth.getIdTokenClient()` to get request headers, but assumes the token is automatically refreshed or re-requested for each call. The library caches tokens and handles refresh, but this is not explicit.
- **Suggestion:** Add assumption: "GoogleAuth.getIdTokenClient() handles token refresh automatically. The client can be created once per request or once per service lifetime, whichever is simpler."

### HIGH-5: Firebase setCustomUserClaims Latency Assumption
- **Severity:** High
- **Finding:** The assumptions section states "setCustomUserClaims is synchronous for a newly created user — claims are immediately available." This is documented but not verified. Firebase documentation indicates claims propagation can take several seconds in some configurations.
- **Suggestion:** Add verification AC-12: "Given custom claims are set, when createCustomToken is called immediately after, the returned token's decoded claims contain the expected custom claims." OR add a retry/re-read mechanism.

### MEDIUM-5: No Assumption About Identity Service Idempotency
- **Severity:** Medium
- **Finding:** The spec assumes one Principal → one Identity, but doesn't specify whether the Identity service is idempotent for duplicate email requests. If a user retries registration quickly, the first call might succeed at Identity but fail at claims, then the second call creates another Identity.
- **Suggestion:** Add assumption: "The Identity service does NOT guarantee idempotency for POST /identity. Duplicate requests may create duplicate Identity records. This is acceptable for Phase 1."

### MEDIUM-6: Assumption About Node.js fetch Support
- **Severity:** Medium
- **Finding:** The design uses native `fetch` (Node.js 22 built-in) but doesn't specify Node.js version as a constraint. If the runtime uses an older Node.js, `fetch` might not be available.
- **Suggestion:** Add constraint: "Node.js 22.x or later is required for built-in fetch support. The Dockerfile must specify `node:22-slim` or later."

### LOW-3: Assumption About Test Environment Mocking
- **Severity:** Low
- **Finding:** The assumptions section says "Identity HTTP calls are mocked in unit tests" but doesn't specify the mocking library or pattern. If tests use different mocks than actual behavior, false positives occur.
- **Suggestion:** Add assumption: "Unit tests use vi.mock() to mock identityService.createIdentity at the module level. Integration tests mock at the HTTP layer via nock or similar."

---

## Category: Design Gaps

### HIGH-6: No Circuit Breaker for Identity Service Calls
- **Severity:** High
- **Finding:** REQ-12 says "one attempt only" but there's no circuit breaker or bulkhead pattern. If the Identity service is degraded but not timing out, every registration attempt will wait the full 10 seconds before failing, causing cascading timeouts.
- **Suggestion:** Add a simple in-memory circuit breaker that short-circuits Identity calls if the last 3 failures occurred within 30 seconds. Fail fast with cached error.

### HIGH-7: No Retry on setCustomUserClaims or deleteUser
- **Severity:** High
- **Finding:** REQ-08 calls `deleteUser` but there's no retry mechanism. If `deleteUser` fails transiently (e.g., Firebase throttling, network blip), the rollback fails and an orphan record is created.
- **Suggestion:** Add REQ-23: "The system MUST retry deleteUser once with a 1-second delay if the first attempt fails with a transient error (5xx or network error). Non-transient errors (400, 404) are not retried."

### MEDIUM-7: Missing GoogleAuth Warning on Network Errors
- **Severity:** Medium
- **Finding:** The design uses `GoogleAuth.getIdTokenClient()` but doesn't handle the case where credential auto-discovery fails (e.g., missing service account key, invalid ADC). This would throw a non-IdentityServiceError.
- **Suggestion:** Add error handling: "If GoogleAuth.getIdTokenClient() throws, the system MUST log the error at ERROR level and throw IdentityServiceError with statusCode=0, message='Authentication configuration error'."

### MEDIUM-8: No Rate Limiting or Backpressure
- **Severity:** Medium
- **Finding:** While registration is low-frequency, if someone scripts 1000 registrations, the Auth service will create 1000 Firebase users and 1000 Identity records with no rate limiting. This is a DoS vector.
- **Suggestion:** Add NFR-09: "The Auth service MUST implement rate limiting on POST /auth/register: maximum 10 requests per IP per minute, returning 429 with retry-after header."

### LOW-4: No Graceful Degradation for Identity Service Unavailability
- **Severity:** Low
- **Finding:** NFR-07 says "fail gracefully (500 + rollback)" but that's not graceful degradation—it's a hard failure. There's no fallback behavior (e.g., allow registration without Identity creation and create Identity asynchronously later).
- **Suggestion:** This is a design choice (consistent with "no half-created Principals"), but document it explicitly as a trade-off: "We accept that Identity downtime blocks registration entirely. Asynchronous reconciliation is deferred to Phase 2."

---

## Category: Risk Areas

### HIGH-8: Hidden Risk of email_already_exists After Identity Creation
- **Severity:** High
- **Finding:** EC-02 says the second request gets 409 "Email already in use" and "No Identity call is made for the duplicate." But what if the first request has already created the Identity but not yet set custom claims? The second request sees no Firebase user, creates another Firebase user, calls Identity, and gets a duplicate Identity.
- **Suggestion:** Implement a distributed lock or unique constraint check before createUser. Or add a pre-check in Identity: "POST /identity returns 409 if email already exists."

### HIGH-9: Risk of Identity Service Performance Regression
- **Severity:** High
- **Finding:** The performance targets say <500ms for Identity call, but there's no performance test in the testing strategy. If Identity's Firestore write becomes slow (e.g., contention, throttling), registration could exceed 3s total.
- **Suggestion:** Add a performance test in Phase 4: "Measure registration latency with simulated Identity latency: 100ms, 500ms, 1s, 5s. Verify timeout at 10s."

### MEDIUM-9: Cross-Project Dependency Risk
- **Severity:** Medium
- **Finding:** The design assumes Auth and Identity are in the same GCP project. If they're ever separated, the Google ID token mechanism changes (IAM cross-project access requires different configuration).
- **Suggestion:** Document this assumption explicitly: "Auth and Identity services are deployed in the same GCP project. Cross-project IAM is not configured."

### LOW-5: Risk of Token Size Exceeding Firebase Limits
- **Severity:** Low
- **Finding:** The spec mentions 1000-byte Firebase custom claims limit but only checks for Phase 1's single Identity. If Phase 2 adds more identities, the limit could be reached.
- **Suggestion:** Add a monitoring requirement: "Log a warning when custom claims size exceeds 800 bytes, regardless of identity count."

---

## Category: Implementability (AI Agent Readiness)

### HIGH-10: Acceptance Criteria Not in Given/When/Then Binary Format
- **Severity:** High
- **Finding:** AC-01 through AC-10 use narrative format, not strict Given/When/Then. For example, AC-01 says "Given a valid registration request... when Auth calls the Identity service and receives a 201... then Auth sets custom claims..." This is close but not binary.
- **Suggestion:** Convert all ACs to strict Given/When/Then with explicit observable outcomes. Example: 
  - Given: A valid registration request (email + password, no existing account)
  - When: The Auth service calls the Identity service and receives a 201 with `{ data: { identity_id: "<uuid>" } }`
  - Then: The Auth service sets custom claims `{ identities: { [identity_id]: ["owner"] }, acting_identity: identity_id }` on the Principal
  - And: The Auth service issues an ID Token containing those claims
  - And: The Auth service returns a 201 response with `{ data: { idToken } }`

### HIGH-11: No Traceable Test Cases for Each AC
- **Severity:** High
- **Finding:** The testing section maps tests to ACs but doesn't provide explicit test case identifiers (TC-01, TC-02) that link to AC IDs. An AI agent needs traceability.
- **Suggestion:** Add a test case table with columns: TC-ID, AC-ID, Test Name, Given/When/Then, Expected Result, Mock Setup.

### MEDIUM-10: Tasks Missing Checkpoint Descriptions After Each Phase
- **Severity:** Medium
- **Finding:** The tasks have a single checkpoint after Phase 3, but no checkpoints after Phase 1, Phase 2, or Phase 4. This makes it hard to validate incremental progress.
- **Suggestion:** Add:
  - After Phase 1: "Checkpoint: Config, dependency, and Terraform changes are complete. `npm run build` succeeds."
  - After Phase 2: "Checkpoint: identityService.ts is implemented and tested. `npx vitest run tests/services/identityService.test.ts` passes."
  - After Phase 4: "Checkpoint: Full test suite passes. TypeScript compilation succeeds."

### MEDIUM-11: RED/GREEN/REFACTOR Commands Not Always Present
- **Severity:** Medium
- **Finding:** T004 (error class) has no RED step, T007 (logging) has "N/A" for RED, and T009/T010 (verification) have no RED steps. This breaks the test-first pattern.
- **Suggestion:** For T004: Add RED step that fails compilation until the error class is created. For T007: Add RED step that fails on missing log assertions. For verification tasks, state "No RED step required—verification task only."

### LOW-6: Tasks Not Grouped with User Story Labels for T008
- **Severity:** Low
- **Finding:** T008 updates existing tests but lacks a [US1] label. It should be [US1] since it's part of User Story 1 validation.
- **Suggestion:** Add "[US1]" prefix to T008.

### LOW-7: No VERIFY/FILES/EDGE CASES Fields in All Tasks
- **Severity:** Low
- **Finding:** Some tasks (T001, T002, T003) have EDGE CASES but others (T004, T007, T009, T010) don't. The VERIFY field is missing from all tasks (e.g., "Verify that all log assertions pass" for T007).
- **Suggestion:** Add VERIFY field to each task specifying what must be true after completion. Add EDGE CASES to T004 (empty error message, negative status code).

---

## Summary of Critical Gaps (Must Fix Before Implementation)

| # | Category | Finding | Severity |
|---|----------|---------|----------|
| HIGH-1 | Missing Requirement | Identity service may reject empty first_name/last_name | High |
| HIGH-2 | Missing Requirement | No startup health check for Identity reachability | High |
| HIGH-4 | Unstated Assumption | GoogleAuth token caching behavior assumed | High |
| HIGH-5 | Unstated Assumption | Firebase claims propagation latency assumed sync | High |
| HIGH-6 | Design Gap | No circuit breaker for Identity service failures | High |
| HIGH-7 | Design Gap | No retry on rollback deleteUser | High |
| HIGH-8 | Risk | Race condition for duplicate email registrations | High |
| HIGH-9 | Risk | No performance test for Identity service latency | High |
| HIGH-10 | Implementability | ACs not in binary Given/When/Then format | High |
| HIGH-11 | Implementability | No traceable test case IDs | High |

## Recommendations

1. **Fix the critical gaps** before implementation begins, especially HIGH-10 (AC format) and HIGH-5 (claims propagation).
2. **Add a Phase 0** to the tasks that validates the Identity service's API contract (response schema, empty string acceptance).
3. **Convert all ACs to strict Given/When/Then** with explicit observable outcomes and test case IDs (TC-01, TC-02, etc.).
4. **Add a circuit breaker** as a simple in-memory implementation to prevent cascading timeouts.
5. **Document all assumptions explicitly** in the Assumptions section, especially around Firebase claims propagation and GoogleAuth behavior.
6. **Add a performance test** for the Identity service call to validate the <500ms target.
7. **Fix the race condition** for duplicate email registrations by adding a pre-check or distributed lock.