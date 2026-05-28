# From The Hart Auth

> **Hierarchy:** Service-specific rules for auth. Extends [master AGENTS.md](../AGENTS.md).
> Rules here take precedence over both master and personal AGENTS.md.
> **Stack:** TypeScript + Fastify + GCP Cloud Run. When reading the master AGENTS.md, Rust/Vue/Terraform sections apply to other services.
>
> Authentication & authorization domain service. Fastify + GCP Identity Platform on Cloud Run.
> Domain glossary: [CONTEXT.md](./CONTEXT.md).

## Responsibilities

- Principal registration, login, logout
- Email verification flow (custom JWT + Firebase key store)
- Password reset flow (custom JWT + Firebase key store)
- Refresh token rotation (httpOnly cookie)
- ID Token verification (for API gateway)

**Note:** This is the auth/authz domain. A separate **identity/user store** domain is planned for future.

## Tech Stack

- **Framework:** Fastify v5 with `@fastify/type-provider-typebox`
- **Auth Provider:** GCP Identity Platform (Firebase Auth under the hood)
- **Token Store:** Firebase Firestore (verify-email-keys, forgot-password-keys)
- **Email:** Nodemailer (Gmail SMTP)
- **Deploy:** GCP Cloud Run (Docker) + Artifact Registry
- **Testing:** Vitest + supertest
- **API Docs:** `@fastify/swagger` + `@fastify/swagger-ui`

## Common Commands

```bash
npm install              # Install deps
npm run dev              # Dev server with hot reload (ts-node-dev)
npm run build            # Compile TypeScript
npm start                # Run compiled output
npm test                 # Run all tests
npm run test:coverage    # Test with coverage
```

## Auth Flow Overview

See [CONTEXT.md](./CONTEXT.md) for domain definitions of Registration, Login, Logout, Token Refresh, Email Verification Flow, and Password Reset Flow.

Implementation:

```
Client → POST /auth/login → Auth Service
  → GCP Identity Platform (signInWithPassword)
  → JWT idToken returned
  → refreshToken set as httpOnly cookie (.fromthehart.tech domain)

Verification flow:
  1. Generate JWT (email + expiry) signed with random key
  2. Store key + uid + expiry in Firebase Firestore
  3. Send email with token link
  4. On click: retrieve key by email, validate token, mark email verified
  5. Delete key from Firestore (single-use)
```

## Directory Structure

```
src/
├── config/
│   ├── index.ts          # Env var loading → typed config
│   ├── logger.ts         # Pino logger config
│   └── swagger.ts        # Swagger registration
├── controllers/
│   └── authController.ts # Request handlers (thin — delegate to services)
├── models/
│   └── AuthSchemas.ts    # TypeBox schemas (validation + OpenAPI)
├── routes/
│   └── auth.ts           # Route definitions with full OpenAPI schemas
├── services/
│   ├── authService.ts    # Business logic (register, login, verify, reset)
│   ├── emailService.ts   # Nodemailer email sending
│   └── firebase.ts       # Firebase Admin SDK init
├── utils/
│   └── validator.ts      # Email + password validation
├── app.ts                # buildApp() factory
└── server.ts             # Local entry point
```

## Key Patterns

- **`buildApp()` factory** — see master AGENTS.md "Code Patterns → Fastify Service"
- **TypeBox everywhere** — schemas define both runtime validation AND OpenAPI docs
- **Controllers are thin** — validate input, call service, format `{ data }`/`{ error }` response
- **Consistent error response shape:** `{ error: { message: "..." } }`
- **Consistent success response shape:** `{ data: { ... } }`
- **Security:** Don't reveal whether email exists in forgot-password/resend-verification flows
- **Refresh token:** httpOnly, Secure, SameSite=None cookie scoped to `.fromthehart.tech` domain, path `/auth/refresh-token`

## Boundaries

- ✅ **Always:** Run `npm test` before considering work done. Use TypeBox schemas for all route validation.
- ⚠️ **Ask first:** Adding dependencies, changing auth flow logic, modifying Firestore security rules, touching token cookie configuration.
- 🚫 **Never:** Commit `.env` files. Reveal whether email exists in forgot-password/resend-verification flows. Store secrets in code.
