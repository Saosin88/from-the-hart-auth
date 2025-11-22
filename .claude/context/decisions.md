# Auth Service Decisions

Last updated: 2025-11-22

## Decisions Made

### Framework & Language

- **[2025-11-22] Adopted Fastify + TypeScript + TypeBox for type safety**
  - Reasoning: TypeBox provides compile-time and runtime schema validation, OpenAPI auto-generation
  - Benefits: Zero trust of external data, self-documenting APIs via Swagger
  - Trade-offs: More boilerplate than alternatives, but catches more bugs

### Authentication Architecture

- **[2025-11-22] Firebase Authentication as primary auth system**
  - Reasoning: Handles password hashing, account lockout, session management
  - Benefits: Outsource security-critical code to Google-managed service
  - Trade-offs: Vendor lock-in, cannot self-host, cost per auth operation
  - Impact: Requires GCP service account impersonation for local development

- **[2025-11-22] Dual token system (ID token + Refresh token)**
  - Reasoning: ID token for stateless request validation, refresh token for long-lived sessions
  - Benefits: Short ID token expiry (1 hour) reduces XSS impact, refresh tokens rotate
  - Trade-offs: More complex client code, cookie/storage coordination
  - Status: Implemented via Firebase Identity Toolkit

### Token Management

- **[2025-11-22] HTTP-only secure cookies for refresh tokens**
  - Reasoning: Prevents XSS token theft from JavaScript
  - Benefits: Automatic send on same-origin requests, browser-managed security
  - Trade-offs: CSRF risk (mitigated by SameSite=None + Secure), CORS complexity
  - Domain: `.fromthehart.tech` (shared across all subdomains)

- **[2025-11-22] Firestore for email verification and password reset tokens**
  - Reasoning: Temporary state needed for email-based flows
  - Benefits: Atomic operations, built-in TTL, integrated with Firebase
  - Trade-offs: Additional API calls, eventual consistency, cost per operation
  - Implementation: Custom JWT tokens signed with random Firestore-stored key

### Email Implementation

- **[2025-11-22] Gmail SMTP via Nodemailer for email delivery**
  - Reasoning: Low friction, supports app-specific passwords, no additional service
  - Benefits: Simple implementation, minimal dependencies
  - Trade-offs: Gmail sending limits (~500/day), requires manual app-password setup
  - Alternative considered: SendGrid (was rejected for simplicity)

- **[2025-11-22] Email verification enforced before login**
  - Reasoning: Ensures users can receive important emails (password resets, etc.)
  - Implementation: Firebase `emailVerified` flag checked implicitly by login flow
  - Caveat: Only enforced client-side in reverse proxy (not in this service)

### Data Validation

- **[2025-11-22] Password requirements: 8+ chars, uppercase, lowercase, number, special char**
  - Reasoning: OWASP guidance, balanced security vs. usability
  - Implementation: In `src/utils/validator.ts` with regex patterns
  - Trade-offs: Rejects some passwords users might prefer, but prevents common weak patterns

- **[2025-11-22] Email validation via regex (not DNS verification)**
  - Reasoning: Fast, prevents typos, DNS verification adds latency
  - Implementation: Basic format check in validator
  - Caveat: Does not verify mailbox exists (Firestore will reject duplicates)

### Error Handling Strategy

- **[2025-11-22] Specific HTTP status codes for auth errors**
  - 401: Wrong credentials, expired token
  - 403: Account disabled or email not verified
  - 409: Email already in use
  - 400: Validation failure
  - Reasoning: Helps clients distinguish error types for UX
  - Trade-off: Information disclosure (leaks email existence)

### Testing Strategy

- **[2025-11-22] Mock all external services (Firebase, email) in unit tests**
  - Reasoning: Tests should be fast, deterministic, offline-capable
  - Trade-offs: No integration testing, cannot catch Firebase API changes
  - Coverage: 7 test files, 25 tests, all passing

### Deployment & Operations

- **[2025-11-22] Google Cloud Run for deployment**
  - Reasoning: Kubernetes abstraction, auto-scaling, built-in observability
  - Benefits: No server management, pay per request
  - Trade-offs: Serverless cold starts, vendor lock-in

- **[2025-11-22] Pino logger for structured JSON logging**
  - Reasoning: Cloud Run integrates with Cloud Logging, easier parsing
  - Benefits: Searchable logs, context preservation
  - Implementation: Pretty-printed in local env, JSON in production

- **[2025-11-22] Environment variables for configuration**
  - Reasoning: 12-factor app compliance, secrets management via external systems
  - Implementation: `.env` file for local, Terraform/GCP Secrets for production
  - Variables: FIREBASE_PROJECT_ID, FIREBASE_WEB_API_KEY, GMAIL_USER, etc.

### Missing Implementation

- **[2025-11-22] AWS Lambda support declared but not implemented**
  - Why: README mentions `src/lambda.ts` entry point, `@fastify/aws-lambda` in dependencies
  - Current: Package installed but entry point missing
  - Impact: Cannot deploy to AWS Lambda (Cloud Run used instead)
  - Status: Low priority (deployment target is Cloud Run)

## Pending Decisions

### Rate Limiting & DDoS Protection

- **Should we implement rate limiting?**
  - Option A: Fastify middleware (in-process, simple)
  - Option B: Cloudflare Workers (distributed, complex)
  - Option C: Cloud Run Cloud Armor (GCP-managed, expensive)
  - Trade-offs: Cost vs. security vs. implementation complexity
  - Blocking: No decision made

### Custom Error Types vs. Firebase Errors

- **Should we create custom error types for auth domain?**
  - Current: Throwing Firebase errors directly to controller
  - Option A: Custom `AuthError` class hierarchy (better type safety)
  - Option B: Keep Firebase errors (simpler, relies on error codes)
  - Trade-offs: Type safety vs. simplicity
  - Blocking: Could improve maintainability

### Email Provider Abstraction

- **Should we abstract email service to support multiple providers?**
  - Current: Hardcoded Gmail SMTP
  - Option A: Injectable email service (DI pattern)
  - Option B: Abstract base class for email adapters
  - Rationale: Enable SendGrid, Mailgun, SES integration
  - Blocking: Low priority unless scaling email volume

### Session Management & Audit Logging

- **Should we maintain audit logs of auth events?**
  - Events: Login, logout, password reset, email verification, failed attempts
  - Options: Cloud Logging only (automatic), separate audit DB, external service
  - Rationale: Compliance (SOC 2, GDPR), forensics
  - Blocking: Not required for MVP but needed for production

### Firebase Offline Support

- **Should auth service support offline Firebase reads?**
  - Current: All calls are online to Firebase
  - Rationale: Cache user permissions for faster verification
  - Trade-offs: Complexity, eventual consistency
  - Blocking: Performance optimization only

### Multi-Tenancy

- **Should auth service support multiple projects/tenants?**
  - Current: Single Firebase project
  - Rationale: Support partner integrations, white-label deployments
  - Blocking: Likely out of scope for current product

### Two-Factor Authentication (2FA)

- **Should we add TOTP or WebAuthn support?**
  - Current: Password-only auth
  - Rationale: Enhanced security for premium users
  - Blocking: Feature request only

### Integration Test Strategy

- **How should we test Firebase interactions?**
  - Option A: Firebase emulator (local testing, complex setup)
  - Option B: Staging Firebase project (real testing, cost)
  - Option C: Mocks only (current approach, risk of API changes)
  - Blocking: Could improve test confidence
