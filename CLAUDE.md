# From The Hart Auth Service

Fastify authentication API with Firebase integration, deployed on Google Cloud Run.

## Overview

**Responsibilities:**
- User registration, login, and authentication
- JWT token generation and validation
- Email verification flow
- Password reset functionality
- Firebase Authentication integration
- Swagger/OpenAPI documentation

**Architecture:** Fastify + Firebase Admin SDK → Google Cloud Run

## Technology Stack

- **Framework:** Fastify v5 with TypeScript
- **Type Safety:** TypeBox with @fastify/type-provider-typebox
- **Authentication:** Firebase Admin SDK
- **Email:** Nodemailer (Gmail SMTP)
- **API Docs:** @fastify/swagger + @fastify/swagger-ui
- **Testing:** Vitest with supertest

## Common Commands

```bash
# Development
npm install                          # Install dependencies
npm run dev                          # Start dev server at localhost:8080

# Building
npm run build                        # Compile TypeScript to dist/
npm start                            # Start production server

# Testing
npm test                             # Run tests
npm run test:watch                   # Watch mode
npm run test:coverage                # Generate coverage
```

## Environment Variables

**Required:**
- `FIREBASE_PROJECT_ID` - Firebase project ID
- `FIREBASE_WEB_API_KEY` - Firebase web API key
- `GMAIL_USER` - Gmail account email
- `GMAIL_APP_PASSWORD` - Gmail app password (not regular password)
- `EMAIL_FROM_ALIAS` - Display name for emails

**Optional:**
- `NODE_ENV` - development, production
- `PORT` - Server port (default: 8080)
- `LOG_LEVEL` - Logging level

## Local Development

**Before running:** Impersonate Firebase service account
```bash
gcloud auth application-default revoke
gcloud auth application-default login --impersonate-service-account <service-account-email>
```

**Setup:**
```bash
npm install
cp .env.example .env
# Edit .env with Firebase and Gmail credentials
npm run dev
```

**API Documentation:** http://localhost:8080/auth/documentation

## Docker

```bash
docker build \
  --build-arg FIREBASE_PROJECT_ID=<project-id> \
  --build-arg FIREBASE_WEB_API_KEY=<api-key> \
  --build-arg GMAIL_USER=<email> \
  --build-arg GMAIL_APP_PASSWORD=<app-password> \
  -t auth-service .

docker run -p 8080:8080 auth-service
```

## Related Services

- **Infrastructure:** Terraform for Cloud Run, Firebase, IAM
- **API Reverse Proxy:** Routes auth requests through Cloudflare
- **Tech Website:** Uses auth for user registration/login
