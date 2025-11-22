# Auth Service Architecture

Last updated: 2025-11-22

## Current State

- **Language**: TypeScript / Node.js
- **Framework**: Fastify with TypeBox for type-safe schemas
- **Primary Auth Backend**: Firebase Authentication
- **Email Service**: SMTP/Gmail for verification and password reset emails
- **Deployment**: Google Cloud Run (containerized)
- **State**: Firestore for email verification and password reset tokens
- **Testing**: Vitest with supertest for E2E route testing
- **Code Size**: ~2,100 lines of TypeScript

## Architecture Diagram

```
Client
  ↓
Fastify API (with TypeBox validation)
  ├── Controllers (request handlers)
  ├── Services (business logic)
  │   ├── authService.ts (core auth flows)
  │   ├── emailService.ts (SMTP/Gmail)
  │   └── firebase.ts (Firebase Admin SDK)
  └── Routes (OpenAPI documented endpoints)
       ├── /health
       ├── /register
       ├── /login
       ├── /forgot-password
       ├── /reset-password
       ├── /verify-email
       ├── /resend-verification
       ├── /refresh-token
       ├── /logout
       └── /verify-access-token

    ↓
Firebase Authentication (user credentials)
Firebase Firestore (token storage)
Gmail SMTP (email delivery)
```

## Key Dependencies

- `fastify@^5.3.3` - HTTP framework
- `@fastify/type-provider-typebox@^6.1.0` - TypeBox integration
- `@sinclair/typebox@^0.34.41` - JSON schema validation
- `firebase-admin@^13.4.0` - Firebase Admin SDK
- `nodemailer@^7.0.3` - Email delivery
- `jsonwebtoken@^9.x` - JWT encoding/decoding for email tokens
- `@fastify/cookie@^11.0.2` - HTTP-only cookie management
- `@fastify/swagger@^9.5.1` - OpenAPI documentation
- `@fastify/aws-lambda@^6.1.1` - AWS Lambda support (available but unused)

## Architectural Patterns

### Request/Response Flow

1. **Registration**
   - Client sends email + password
   - Validator checks format and password strength
   - Firebase creates user (emailVerified=false)
   - Auth service generates custom token
   - Custom token exchanged for Firebase ID token
   - Email verification link generated (24-hour JWT)
   - Verification key stored in Firestore
   - ID token returned to client

2. **Login**
   - Client sends email + password
   - Web API call to Firebase Identity Toolkit
   - Returns ID token + refresh token
   - Refresh token stored in HTTP-only secure cookie
   - ID token returned in response body

3. **Email Verification**
   - Client sends verification token
   - Token decoded and verified against Firestore key
   - Firebase user marked as emailVerified=true
   - All refresh tokens revoked
   - New ID token issued
   - Verification key deleted from Firestore

4. **Password Reset**
   - Similar flow to email verification but with 1-hour expiry
   - Stored in `forgot-password-keys` collection

5. **Token Refresh**
   - Client sends refresh token (from HTTP-only cookie)
   - Refresh token sent to Firebase securetoken.googleapis.com
   - New ID token + refresh token returned
   - New refresh token stored in cookie

### Type Safety

- Uses TypeBox schemas for all request/response types
- Fastify validates all incoming requests against schemas
- TypeScript strict mode enabled (`strict: true`)
- No implicit `any` types

### Cookie Management

- Refresh tokens stored in HTTP-only, secure, same-site=none cookies
- Domain: `.fromthehart.tech`
- Path: `/auth/refresh-token`
- Max age: 30 days
- Only sent over HTTPS

### Error Handling

- Global Fastify error handler catches all errors
- Validation errors return 400 with message
- Firebase errors mapped to specific HTTP status codes:
  - `auth/email-already-exists` → 409
  - `auth/user-not-found` → 401
  - `auth/wrong-password` → 401
  - `auth/user-disabled` → 403
  - `auth/weak-password` → 400
  - `auth/invalid-email` → 400

## Architectural Issues

### High Priority

1. **[2025-11-22] Unsafe JWT token decoding without verification**
   - Files: `src/services/authService.ts` lines 60, 96; `src/controllers/authController.ts` line 206
   - Issue: Using `jwt.decode()` to extract email before verification
   - Risk: Tokens can be manipulated; should verify signature first
   - Impact: Security vulnerability - trusting unverified token claims
   - Status: Not fixed

2. **[2025-11-22] Email token generation uses weak random key**
   - File: `src/services/authService.ts` lines 316-318, 340-342
   - Issue: Key generated using `Math.random().toString(36)` (16 chars)
   - Risk: Cryptographically weak, predictable
   - Impact: Token enumeration attacks possible
   - Status: Not fixed

3. **[2025-11-22] No rate limiting on authentication endpoints**
   - File: `src/routes/auth.ts`
   - Issue: /login, /register, /forgot-password have no brute-force protection
   - Impact: Accounts vulnerable to password guessing attacks
   - Status: Not fixed

### Medium Priority

4. **[2025-11-22] Lambda entry point missing (README mentions it)**
   - File: No `src/lambda.ts` exists despite `@fastify/aws-lambda` being in dependencies
   - Impact: Cannot deploy to AWS Lambda (though service is on Cloud Run)
   - Status: Not implemented

5. **[2025-11-22] Email service initialization delay hardcoded**
   - File: `src/app.ts` lines 22-24
   - Issue: `setTimeout(..., 1000)` is arbitrary magic number
   - Impact: Email might fail if initialized too quickly; timing-dependent
   - Status: Not fixed

6. **[2025-11-22] No database transaction for verification flow**
   - Files: `src/services/authService.ts` lines 74-86
   - Issue: Token verification, user update, and key deletion are separate Firebase calls
   - Impact: Could leave orphaned verification records if calls fail mid-sequence
   - Status: Not fixed

### Low Priority

7. **[2025-11-22] Typo in server.ts log message**
   - File: `src/server.ts` line 9
   - Issue: `SERVER_POSRT` should be `SERVER_PORT`
   - Impact: Misleading logs
   - Status: Not fixed

8. **[2025-11-22] No CSRF protection for state-changing endpoints**
   - File: `src/routes/auth.ts`
   - Issue: POST endpoints (login, register, etc.) have no CSRF token check
   - Impact: Medium - requires Origin/Referer policy enforcement
   - Status: Mitigated by CORS headers (if configured)

9. **[2025-11-22] No request ID correlation across services**
   - File: `src/config/logger.ts` line 18
   - Issue: Random request IDs generated without correlation to parent requests
   - Impact: Cannot trace auth requests through multi-service stack
   - Status: Minor - logging only

## Testing Coverage

- **Unit tests**: 7 test files, 25 tests, all passing
- **Test files**:
  - `register.spec.ts` - 4 tests (success, email exists, invalid email, weak password)
  - `login.spec.ts` - 5 tests (success, wrong password, user not found, disabled user, invalid email)
  - `email-verification.spec.ts` - 4 tests
  - `password-reset.spec.ts` - 5 tests
  - `token.spec.ts` - 5 tests (refresh, verify, etc.)
  - `logout.spec.ts` - 1 test
  - `health.spec.ts` - 1 test

- **Coverage gaps**:
  - No integration tests with real Firebase (all mocked)
  - No email delivery verification tests
  - No Firestore interaction tests
  - No HTTP-only cookie verification tests
  - No rate limiting tests (no implementation)
  - No performance/load tests

## Performance Notes

- Fastify framework is known for low latency
- Firebase API calls are network-dependent (typical 50-200ms each)
- Email sending is async (not awaited in some flows)
- No caching implemented for health check or token verification
- No connection pooling for Firebase/Firestore

## Deployment Model

- Single Fastify instance on Cloud Run
- Environment variables configured via Terraform
- No multi-instance load balancing (Cloud Run handles auto-scaling)
- HTTP only (TLS termination by Cloud Run)
- Logs via Cloud Logging (via pino)

## Security Considerations

- Passwords never stored locally (Firebase Auth handles this)
- Refresh tokens in HTTP-only cookies (CSRF-safe)
- ID tokens returned in response body (vulnerable to XSS)
- Email tokens stored with custom key in Firestore (not database-hardened)
- SMTP credentials passed via environment variables
- Firebase service account initialized with default credentials (relies on Workload Identity)

## External Dependencies

- **Firebase**:
  - Authentication (user creation, password reset, token generation)
  - Firestore (email verification keys, password reset keys)
  - Identity Toolkit API (sign-in, token exchange)
  - Secure Token API (token refresh)

- **Email**: Gmail SMTP (requires app-specific password)

- **Cloudflare**: API Gateway routes requests to this service

## Known Limitations

1. Email verification tokens have 24-hour expiry (hardcoded)
2. Password reset tokens have 1-hour expiry (hardcoded)
3. Only Firebase Authentication supported (no social auth or MFA)
4. No session management (stateless token-only auth)
5. Refresh tokens don't expire until manually revoked
6. No audit logging of auth events
7. No support for custom claims in tokens
8. Email provider is hardcoded to Gmail
