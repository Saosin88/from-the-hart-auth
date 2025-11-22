# CLAUDE.md - From The Hart Auth Service

This file provides guidance to Claude Code when working with the Auth Service in this repository.

## Service Overview

The **From The Hart Auth Service** is a Fastify-based authentication API that handles user registration, login, email verification, and password reset functionality. It integrates with Firebase Authentication for secure credential management and uses SMTP for sending verification and reset emails. The service is deployed on Google Cloud Run as a containerized application.

### Key Responsibilities
- User registration with email validation
- User login and authentication
- JWT token generation and validation
- Email verification flow
- Password reset functionality
- Firebase Authentication integration
- Swagger/OpenAPI documentation
- Support for both traditional servers and AWS Lambda

### Architecture
- **Framework**: Fastify with TypeScript
- **Authentication Backend**: Firebase Admin SDK
- **Email Service**: SMTP integration (Gmail)
- **Deployment**: Google Cloud Run (primary), AWS Lambda (alternative)
- **State**: Stateless service (tokens managed by Firebase)
- **Documentation**: Auto-generated Swagger API docs

## Technology Stack

### Core Technologies
- **Framework**: Fastify v5 with TypeScript
- **Type Safety**: TypeBox with @fastify/type-provider-typebox for runtime validation and OpenAPI schemas
- **Authentication**: Firebase Admin SDK for user management
- **Email**: Nodemailer for SMTP operations
- **API Documentation**: @fastify/swagger and @fastify/swagger-ui for auto-generated docs
- **Serverless**: @fastify/aws-lambda for Lambda support
- **Logging**: Fastify's built-in Pino logger with pretty-printing

### Development Tools
- **Build**: TypeScript compiler (tsc)
- **Development**: ts-node-dev for hot-reload
- **Testing**: Vitest with supertest for API testing
- **Coverage**: @vitest/coverage-v8
- **Code Building**: esbuild for fast builds

### Google Cloud Platform
- **Compute**: Cloud Run for container execution
- **Container Registry**: Google Artifact Registry
- **Authentication**: Firebase Authentication
- **IAM**: Service accounts and roles
- **Logging**: Cloud Logging (Stackdriver)

## Project Structure

```
from-the-hart-auth/
├── src/
│   ├── app.ts                      # Fastify app setup and plugin registration
│   ├── server.ts                   # Entry point for traditional server (Cloud Run)
│   ├── lambda.ts                   # Entry point for AWS Lambda
│   ├── config/
│   │   ├── index.ts                # Configuration exports and types
│   │   ├── logger.ts               # Pino logger setup with structured output
│   │   └── swagger.ts              # Swagger/OpenAPI configuration
│   ├── controllers/
│   │   └── authController.ts       # HTTP request handlers
│   ├── models/
│   │   └── AuthSchemas.ts          # TypeBox schemas for validation and OpenAPI
│   ├── routes/
│   │   └── auth.ts                 # API route definitions
│   ├── services/
│   │   ├── authService.ts          # Authentication logic
│   │   ├── emailService.ts         # Email sending functionality
│   │   └── firebase.ts             # Firebase Admin SDK initialization
│   └── utils/
│       ├── errors.ts               # Custom error definitions
│       └── validators.ts           # Validation utilities
├── tests/
│   └── routes/
│       └── auth.spec.ts            # API route tests
├── .env                            # Local environment variables
├── .env.example                    # Environment template
├── Dockerfile                      # Container build configuration
├── docker-compose.yml              # Local Docker development
├── package.json                    # Dependencies and scripts
├── tsconfig.json                   # TypeScript configuration
├── vitest.config.ts                # Vitest configuration
├── terraform/
│   ├── dev/                        # Development environment resources
│   └── prod/                       # Production environment resources
└── README.md                       # Service documentation
```

## Common Commands

### Installation & Setup
```bash
# Install dependencies
npm install

# Prepare environment
cp .env.example .env
# Edit .env with your configuration
```

### Development
```bash
# Start development server with hot-reload
npm run dev

# The server will start at http://localhost:8080

# API documentation available at:
# http://localhost:8080/auth/documentation
```

### Building
```bash
# Compile TypeScript to dist/
npm run build

# This creates JavaScript files in dist/
# Ready for Node.js execution
```

### Running Production Build
```bash
# Build
npm run build

# Start production server
npm start

# Or run directly with Node.js
node dist/server.js
```

### Testing
```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Generate coverage report
npm run test:coverage

# Run specific test file
npm test -- auth.spec.ts

# Run tests with UI
npm test -- --ui
```

### Docker Operations
```bash
# Build Docker image with environment variables
docker build \
  --build-arg NODE_ENV=local \
  --build-arg LOG_LEVEL=debug \
  --build-arg FIREBASE_PROJECT_ID=your-project-id \
  --build-arg FIREBASE_WEB_API_KEY=your-api-key \
  --build-arg GMAIL_USER=your-email@gmail.com \
  --build-arg GMAIL_APP_PASSWORD=your-app-password \
  --build-arg EMAIL_FROM_ALIAS="From The Hart" \
  -t from-the-hart-auth .

# Run container
docker run \
  --name from-the-hart-auth \
  -d \
  -p 8080:8080 \
  -e FIREBASE_PROJECT_ID=your-project-id \
  -e FIREBASE_WEB_API_KEY=your-api-key \
  -e GMAIL_USER=your-email@gmail.com \
  -e GMAIL_APP_PASSWORD=your-app-password \
  -e EMAIL_FROM_ALIAS="From The Hart" \
  from-the-hart-auth

# View logs
docker logs -f from-the-hart-auth

# Stop and remove container
docker stop from-the-hart-auth
docker rm from-the-hart-auth
```

### Local Docker Compose Development
```bash
# Start all services with Docker Compose
docker-compose up -d

# View logs
docker-compose logs -f auth

# Rebuild after code changes
docker-compose up -d --build

# Stop services
docker-compose down
```

## Environment Variables

### Required Configuration

**Firebase Configuration**
- `FIREBASE_PROJECT_ID` - Your Firebase project ID (found in Firebase Console)
- `FIREBASE_WEB_API_KEY` - Firebase Web API Key (from project settings)
- `FIREBASE_PRIVATE_KEY` - Firebase service account private key (JSON key file)
- `FIREBASE_CLIENT_EMAIL` - Firebase service account email

**Email Configuration**
- `GMAIL_USER` - Gmail account email (e.g., noreply@example.com)
- `GMAIL_APP_PASSWORD` - Gmail app-specific password (NOT regular password)
  - Generate in Google Account > Security > App passwords
  - Requires 2FA enabled
- `EMAIL_FROM_ALIAS` - Display name for emails (e.g., "From The Hart Support")

### Environment Detection
- `NODE_ENV` - Environment mode (development, production)
- `APP_ENVIRONMENT` - Alternative environment name (local, dev, prod)

### Server Configuration
- `PORT` - Server port (default: 8080)
- `HOST` - Host to bind to (default: 0.0.0.0)

### Logging
- `LOG_LEVEL` - Logging level (debug, info, warn, error)

### Optional Configuration
- `CORS_ORIGIN` - CORS allowed origin(s)
- `JWT_SECRET` - Secret for JWT signing (auto-generated if not set)
- `JWT_EXPIRATION` - Token expiration time (default: 24h)

## Local Development Setup

### Prerequisites
- Node.js v16+ (check with `node --version`)
- npm v8+ (included with Node.js)
- Firebase project with Authentication enabled
- Gmail account with 2FA enabled (for app password)
- Google Cloud SDK (for service account impersonation)

### Firebase Setup
```bash
# 1. Create Firebase project
# Visit https://console.firebase.google.com/

# 2. Enable Authentication
# - Select "Authentication" > "Get started"
# - Enable Email/Password provider

# 3. Create service account
# - Go to Project Settings > Service Accounts
# - Click "Generate new private key"
# - Save the JSON file securely

# 4. Create web API key
# - Go to Project Settings > API keys
# - Create new API key restricted to Firebase Authentication
```

### Gmail App Password Setup
```bash
# 1. Enable 2FA on your Google account
# 2. Go to https://myaccount.google.com/apppasswords
# 3. Select "Mail" and "Windows Computer" (or your device)
# 4. Google generates a 16-character password
# 5. Use this password as GMAIL_APP_PASSWORD
```

### Initial Setup
```bash
# Clone repository
git clone https://github.com/Saosin88/from-the-hart-auth.git
cd from-the-hart-auth

# Install dependencies
npm install

# Set up environment
cp .env.example .env

# Edit .env with your values:
# - FIREBASE_PROJECT_ID=your-project-id
# - FIREBASE_WEB_API_KEY=your-api-key
# - GMAIL_USER=your-email@gmail.com
# - GMAIL_APP_PASSWORD=your-16-char-password
# - EMAIL_FROM_ALIAS="From The Hart"

# Impersonate Firebase service account (required for local dev)
gcloud auth application-default revoke
gcloud auth application-default login --impersonate-service-account your-service-account@your-project.iam.gserviceaccount.com

# Start development server
npm run dev

# Server is now at http://localhost:8080
# API docs at http://localhost:8080/auth/documentation
```

### Testing Authentication Flow
```bash
# 1. Open Swagger UI at http://localhost:8080/auth/documentation

# 2. Test registration
POST /auth/register
Body: {
  "email": "test@example.com",
  "password": "Test123!@#",
  "displayName": "Test User"
}

# 3. Check email for verification link
# 4. Verify email via provided link

# 5. Test login
POST /auth/login
Body: {
  "email": "test@example.com",
  "password": "Test123!@#"
}

# Response includes JWT token

# 6. Test protected endpoints
GET /auth/me
Headers: {
  "Authorization": "Bearer <token>"
}
```

## Testing Approach

### Unit & Integration Tests
Tests use Vitest and supertest to verify API endpoints and business logic:

```bash
# Run all tests
npm test

# Run in watch mode for development
npm run test:watch

# Run specific test file
npm test -- auth.spec.ts

# Generate coverage report
npm run test:coverage
```

### Test Structure
Tests are organized by feature:
- `tests/routes/auth.spec.ts` - API endpoint tests
- `tests/services/auth.spec.ts` - Business logic tests
- `tests/services/email.spec.ts` - Email service tests

### Example Test Pattern
```typescript
import { describe, it, expect } from 'vitest';
import { app } from '../src/app';

describe('Auth Routes', () => {
  it('should register a new user', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: 'test@example.com',
        password: 'Test123!@#',
        displayName: 'Test User'
      }
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toHaveProperty('token');
  });
});
```

### Testing Email Functionality
```bash
# Use Mailtrap or similar service for testing emails
# Configure in .env:
# GMAIL_USER=test@mailtrap.io
# GMAIL_APP_PASSWORD=mailtrap-password

# Or use local SMTP server for development
```

## Deployment Information

### Deployment Targets

**Primary: Google Cloud Run**
- Containerized Node.js application
- Auto-scaling based on traffic
- Integrated with Firebase Authentication
- Managed by Terraform

**Alternative: AWS Lambda**
- Use `src/lambda.ts` entry point
- Requires `@fastify/aws-lambda` wrapper
- Deployed via Lambda container image support
- Configured through Terraform

### Cloud Run Deployment

**Requirements**
- Docker image in Google Artifact Registry
- Cloud Run service with proper IAM roles
- Service account with Firebase admin permissions
- Environment variables configured in Cloud Run

**Deployment Process**
```bash
# 1. Build Docker image
docker build -t from-the-hart-auth .

# 2. Tag for Artifact Registry
docker tag from-the-hart-auth \
  us-central1-docker.pkg.dev/your-project/from-the-hart-auth/latest

# 3. Push to Artifact Registry
docker push us-central1-docker.pkg.dev/your-project/from-the-hart-auth/latest

# 4. Deploy via Terraform (recommended)
cd terraform/prod
terraform apply
```

### Docker Image Optimization

The Dockerfile uses multi-stage builds:
1. Build stage: Compiles TypeScript, installs dependencies
2. Runtime stage: Minimal Node.js image with only production dependencies
3. Final optimization: Removes unnecessary files

### Production Deployment Checklist
- [ ] Run tests: `npm test`
- [ ] Build successfully: `npm run build`
- [ ] Docker builds without errors
- [ ] Environment variables verified
- [ ] Firebase service account permissions correct
- [ ] Gmail app password generated and configured
- [ ] Email templates reviewed
- [ ] CORS settings appropriate for frontend domain
- [ ] Logging level appropriate (info or warn for production)
- [ ] Rate limiting configured if needed
- [ ] Monitoring/alerting set up in Cloud Logging

### Scaling Considerations
- **Vertical**: Increase Cloud Run memory to scale CPU
- **Horizontal**: Cloud Run auto-scales replicas based on requests
- **Rate Limiting**: Consider adding rate-limit middleware for login attempts
- **Cache**: Use Redis for session/token caching (optional)
- **Email Queue**: Consider message queue for bulk email operations

### Security Best Practices
- Never commit Firebase service account key or Gmail password
- Use Cloud Secret Manager for sensitive configuration
- Enforce HTTPS only (default on Cloud Run)
- Implement rate limiting on auth endpoints
- Validate email format and password strength
- Use secure cookies for session management
- Implement CSRF protection for form submissions

## Claude Code Integration Notes

### .claude Directory
Commands and context files are located in `.claude/commands/`:
- Custom slash commands for common Fastify operations
- Integration with Claude Code agents

### Useful Patterns for Agent Work

**Understanding Fastify Routes**
- Routes defined in `src/routes/auth.ts`
- Handlers in `src/controllers/authController.ts`
- Schemas in `src/models/AuthSchemas.ts` (TypeBox)

**TypeBox Schema Pattern**
```typescript
// Schemas define both runtime validation and OpenAPI documentation
export const RegisterSchema = Type.Object({
  email: Type.String({ format: 'email' }),
  password: Type.String({ minLength: 8 }),
  displayName: Type.String({ minLength: 2 })
});

// Auto-generates OpenAPI documentation from schema
```

**Firebase Integration**
- All Firebase calls in `src/services/firebase.ts`
- Authentication operations in `src/services/authService.ts`
- User creation, login, password reset handled by Firebase

**Email Service**
- Nodemailer configuration in `src/config/logger.ts`
- Email sending in `src/services/emailService.ts`
- Template generation for verification and reset emails

### Common Claude Code Tasks

**Adding New Auth Endpoint**
1. Define TypeBox schema in `src/models/AuthSchemas.ts`
2. Create handler in `src/controllers/authController.ts`
3. Register route in `src/routes/auth.ts`
4. Add tests in `tests/routes/auth.spec.ts`
5. Document in Swagger via schema comments

**Modifying Email Templates**
- Located in `src/services/emailService.ts`
- Update HTML templates for verification/reset emails
- Test with Mailtrap or similar before deploying

**Firebase Configuration Changes**
- All Firebase setup in `src/services/firebase.ts`
- Update initialization parameters
- Test locally with impersonated service account

**Error Handling**
- Custom errors in `src/utils/errors.ts`
- Use TypeBox Type.Object for error responses
- Consistent error format across API

### Debugging Tips
- Enable debug logging: `LOG_LEVEL=debug npm run dev`
- Use Fastify hooks to log requests: `onRequest`, `onResponse`
- Check Firebase Auth Console for user creation failures
- Verify GMAIL_APP_PASSWORD (16 chars, not regular password)
- Test email delivery with Mailtrap in development
- Use Swagger UI to test endpoints with proper schemas

## Key Files Reference

| File | Purpose |
|------|---------|
| `src/app.ts` | Fastify app initialization and plugins |
| `src/server.ts` | Cloud Run entry point |
| `src/lambda.ts` | AWS Lambda entry point |
| `src/routes/auth.ts` | API route definitions |
| `src/controllers/authController.ts` | Request handlers |
| `src/services/authService.ts` | Authentication business logic |
| `src/services/firebase.ts` | Firebase Admin SDK integration |
| `src/services/emailService.ts` | SMTP and email templates |
| `src/models/AuthSchemas.ts` | TypeBox schemas for validation |
| `src/config/logger.ts` | Pino logger configuration |
| `src/config/swagger.ts` | OpenAPI/Swagger setup |
| `tests/routes/auth.spec.ts` | API tests |

## Related Services

This service integrates with:
- **Infrastructure** (`from-the-hart-infrastructure`): Terraform configs for Cloud Run, Firebase, IAM
- **API Reverse Proxy** (`from-the-hart-tech-api-reverse-proxy-worker`): Routes auth requests through Cloudflare
- **Tech Website** (`from-the-hart-tech-website`): Uses auth for user registration/login
- **Auth Token Validation**: Used by Projects and Storage services through proxy
