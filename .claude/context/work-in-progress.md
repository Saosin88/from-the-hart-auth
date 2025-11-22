# Auth Service Work In Progress

Last updated: 2025-11-22

## Active Tasks

None currently

## Blocked Items

None currently

## Waiting For

- Clarification on whether AWS Lambda support is required (current deployment is Cloud Run only)
- Decision on rate limiting strategy (currently unprotected against brute force)
- Requirements for audit logging (audit trail of auth events)

## Recently Completed

### 2025-11-22
- ✅ Analyzed auth service codebase (2,100 lines of TypeScript)
- ✅ Identified 9 architectural issues (3 high, 3 medium, 3 low priority)
- ✅ Verified all 25 unit tests passing
- ✅ Confirmed TypeScript strict mode compliance
- ✅ Documented architecture, decisions, and identified issues in context files

## Next Steps

### Priority 1: Security Fixes

1. **Fix unsafe JWT token decoding** (HIGH)
   - Files affected: `src/services/authService.ts` (lines 60, 96), `src/controllers/authController.ts` (line 206)
   - Action: Always verify JWT signature before trusting claims
   - Estimated effort: 2-4 hours
   - Risk if not fixed: Token manipulation, email spoofing

2. **Replace weak random key generation** (HIGH)
   - File: `src/services/authService.ts` (lines 316-318, 340-342)
   - Action: Use `crypto.randomBytes()` instead of `Math.random()`
   - Estimated effort: 1-2 hours
   - Risk if not fixed: Token enumeration attacks

3. **Implement rate limiting on auth endpoints** (HIGH)
   - Files: `src/routes/auth.ts` (POST /login, /register, /forgot-password)
   - Action: Add Fastify middleware with token bucket or sliding window
   - Estimated effort: 4-6 hours
   - Risk if not fixed: Brute force attacks on passwords

### Priority 2: Operational Improvements

4. **Fix email service initialization** (MEDIUM)
   - File: `src/app.ts` (lines 22-24)
   - Action: Replace hardcoded setTimeout with proper async initialization
   - Estimated effort: 1-2 hours

5. **Add transaction support for verification flows** (MEDIUM)
   - File: `src/services/authService.ts` (lines 74-86, 109-119)
   - Action: Use Firestore batch writes to ensure atomicity
   - Estimated effort: 2-3 hours
   - Benefit: Prevents orphaned verification records

6. **Implement AWS Lambda entry point** (MEDIUM)
   - Action: Create `src/lambda.ts` with @fastify/aws-lambda handler
   - Estimated effort: 2-3 hours
   - Rationale: Complete the Lambda support infrastructure
   - Impact: Not needed for current Cloud Run deployment

### Priority 3: Testing & Documentation

7. **Add integration tests for Firebase flows** (MEDIUM)
   - Files: `tests/integration/` (new)
   - Action: Use Firebase emulator or staging project
   - Estimated effort: 6-8 hours
   - Benefit: Catch Firebase API changes early

8. **Implement HTTP-only cookie verification tests** (LOW)
   - Files: `tests/auth/cookies.spec.ts` (new)
   - Action: Verify refresh tokens in Set-Cookie headers
   - Estimated effort: 2-3 hours

9. **Fix typo in server.ts** (LOW)
   - File: `src/server.ts` (line 9)
   - Action: `SERVER_POSRT` → `SERVER_PORT`
   - Estimated effort: < 5 minutes

### Priority 4: Feature Enhancements

10. **Add CSRF protection** (LOW)
    - Rationale: POST endpoints should have CSRF tokens
    - Status: Partially mitigated by SameSite cookies and CORS
    - Effort: 2-3 hours if needed

11. **Add request ID correlation** (LOW)
    - File: `src/config/logger.ts` (line 18)
    - Action: Support X-Request-ID header for parent request tracing
    - Benefit: Better debugging across multi-service calls
    - Estimated effort: 1-2 hours

12. **Consider audit logging system** (LOW)
    - Action: Log all auth events (login, logout, password reset, etc.)
    - Estimated effort: 4-6 hours
    - Benefit: Compliance, forensics
    - Status: Blocked on audit requirements

## Testing Status

- **Unit Tests**: 7 files, 25 tests, all passing ✅
- **Integration Tests**: None (uses mocks)
- **E2E Tests**: None (depends on reverse proxy)
- **Load Tests**: None
- **Security Tests**: None

## Deployment Status

- **Development**: Can run locally with `npm run dev` (requires Firebase impersonation)
- **Staging**: Deployed via Terraform to GCP Cloud Run
- **Production**: Deployed via Terraform to GCP Cloud Run
- **CI/CD**: Tests run on commits (Vitest with JUnit reporter)

## Known Issues to Monitor

1. **Firebase initialization timing** - Email service may fail if initialized before Firebase ready
2. **Firestore token cleanup** - No TTL or cleanup process for expired verification tokens
3. **Gmail sending limits** - May exceed 500/day limit under high load
4. **Token expiry coordination** - Email tokens (24h) vs password tokens (1h) hardcoded
5. **Cookie domain (.fromthehart.tech)** - Assumes single domain, doesn't work for localhost

## Metrics to Track

- Auth service latency (Firebase calls dominate)
- Email delivery success rate
- Password reset token usage rate
- Verification email bounce rate
- Failed login attempts (for rate limiting)
- Firebase API quota usage

## Development Notes

### Local Development Setup
```bash
# Requires GCP credentials
gcloud auth application-default revoke
gcloud auth application-default login --impersonate-service-account <service-account>

# Start service
npm install
npm run dev  # Runs on http://localhost:8080

# View API docs
# Open http://localhost:8080/auth/documentation
```

### Testing
```bash
npm test              # Run all tests once
npm run test:watch   # Run tests in watch mode
npm run test:coverage # Generate coverage report
```

### Building
```bash
npm run build  # Compiles TypeScript to dist/
npm start      # Runs compiled dist/server.js
```

### Docker
```bash
# Build (requires build args)
docker build \
  --build-arg NODE_ENV=local \
  --build-arg FIREBASE_PROJECT_ID=test-project \
  --build-arg FIREBASE_WEB_API_KEY=test-key \
  --build-arg GMAIL_USER=test@gmail.com \
  --build-arg GMAIL_APP_PASSWORD=test-password \
  --build-arg EMAIL_FROM_ALIAS="noreply@fromthehart.tech" \
  -t from-the-hart-auth .

# Run
docker run -p 8080:8080 from-the-hart-auth
```

## Code Quality

- **TypeScript**: Strict mode enabled, all strict checks active ✅
- **Linting**: No linter configured (consider adding ESLint)
- **Formatting**: No formatter configured (consider adding Prettier)
- **Test Coverage**: Unknown (no coverage reports generated)
- **Security Scan**: No dependency scanning (consider using Snyk or npm audit)

## Dependencies to Update

- `@fastify/*` packages: Most recent minor versions ✅
- `firebase-admin@^13.4.0`: Latest version ✅
- `nodemailer@^7.0.3`: Latest version ✅
- `@sinclair/typebox@^0.34.41`: Latest version ✅

## Future Considerations

- Consider switching to `crypto` module instead of `jsonwebtoken` for email tokens
- Evaluate Firebase Custom Claims for roles/permissions
- Plan for multi-project support (tenant isolation)
- Consider offline Firebase support for token verification caching
- Evaluate serverless function alternatives (Azure Functions, AWS Lambda)
