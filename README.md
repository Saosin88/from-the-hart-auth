# From The Hart Auth API

A Fastify-based authentication API for From The Hart services. This API provides user authentication, registration, and account management capabilities, implemented using Firebase Authentication and deployed as a containerized service on Google Cloud Run.

![Status](https://img.shields.io/badge/Status-Live-success)
![Platform](https://img.shields.io/badge/Platform-Google_Cloud_Run-blue)
![Framework](https://img.shields.io/badge/Framework-Fastify-green)

## 🔍 Overview

The From The Hart Auth API is part of a multi-cloud architecture that spans AWS, GCP, and Cloudflare. It handles all authentication-related functionality for From The Hart services, including:

- User registration and login
- Email verification
- Password reset
- Token refresh and validation
- Integration with Firebase Authentication

This service is a critical component in the From The Hart ecosystem, providing secure user authentication across the entire platform.

## 🛠️ Tech Stack

- **Framework**: Fastify with TypeScript
- **Authentication**: Firebase Authentication
- **Email**: SMTP integration for verification and password reset emails
- **Testing**: Jest for unit tests
- **Containerization**: Docker for deployments
- **Cloud Platform**: Google Cloud Run
- **Infrastructure**: Terraform (managed in the `from-the-hart-infrastructure` repository)

## 📋 Prerequisites

- Node.js (v16 or higher)
- npm or yarn
- Docker (for containerized deployment)
- Google Cloud SDK (for Cloud Run deployment)
- Firebase project with Authentication enabled

## 🚀 Getting Started

### Installation

Clone the repository and install dependencies:

```bash
git clone https://github.com/Saosin88/from-the-hart-auth.git
cd from-the-hart-auth
npm install
```

### Local Development

Before starting the application locally, you must impersonate the Firebase service account:

```bash
# Revoke any existing application default credentials
gcloud auth application-default revoke

# Log in with service account impersonation
gcloud auth application-default login --impersonate-service-account your-service-account-email
```

This impersonation is required for Firebase Admin SDK authentication. In production, this service account is configured automatically through Terraform in the Cloud Run configuration.

To start the server in development mode:

```bash
npm run dev
```

This will start the server with hot-reload enabled at http://localhost:8080 (or the port specified in your environment variables).

### Docker Configuration

#### Building the Docker Image

Build the Docker image with all required environment variables:

```bash
docker build \
  --build-arg NODE_ENV=local \
  --build-arg LOG_LEVEL=debug \
  --build-arg FIREBASE_PROJECT_ID=your-project-id \
  --build-arg FIREBASE_WEB_API_KEY=your-api-key \
  --build-arg GMAIL_USER=your-email \
  --build-arg GMAIL_APP_PASSWORD=your-password \
  --build-arg EMAIL_FROM_ALIAS="your-alias" \
  -t from-the-hart-auth .
```

#### Running the Docker Container

Run the container in detached mode and map it to port 8080:

```bash
docker run --name from_the_hart_auth -d -p 127.0.0.1:8080:8080 from-the-hart-auth
```

#### Viewing Logs

Follow the container logs:

```bash
docker logs -f from_the_hart_auth
```

## 🧪 Testing

Run tests with:

```bash
npm test
```

The project uses Jest for unit tests and includes coverage reporting.

## 📦 Deployment

The service is deployed to Google Cloud Run using Terraform.

## 🌐 Infrastructure

This service is part of the "From The Hart" multi-cloud infrastructure managed with Terraform. The infrastructure is defined in the separate `from-the-hart-infrastructure` repository using the Infrastructure as Code (IaC) approach.

### Cloud Provider Details

- **Primary Platform**: Google Cloud Run
- **Container Registry**: Google Artifact Registry
- **Authentication Backend**: Firebase Authentication
- **Access Control**: Google Cloud IAM
- **API Gateway Integration**: Through Cloudflare Workers reverse proxy

The infrastructure is managed using Terraform with shared state:

- State is stored remotely in an AWS S3 bucket (`from-the-hart-terraform`)
- Cloudflare Workers provide API reverse proxying and routing

For infrastructure deployments, refer to the `terraform/` directory which contains separate configurations for `dev` and `prod` environments.

## 📚 API Documentation

Once the server is running, Swagger documentation is available at:

```
http://localhost:8080/auth/documentation
```

## ⚙️ Environment Variables

### Firebase Configuration

- `FIREBASE_PROJECT_ID` - Your Firebase project ID
- `FIREBASE_WEB_API_KEY` - Firebase Web API Key

### Email Configuration

- `GMAIL_USER` - Gmail account username
- `GMAIL_APP_PASSWORD` - Gmail app password (not your regular Gmail password)
- `EMAIL_FROM_ALIAS` - The "From" name displayed in emails (e.g., "no-reply@fromthehart.tech")

### Optional Configuration

- `NODE_ENV` - Environment (dev, prod, local)
- `LOG_LEVEL` - Logging level (debug, info, warn, error)
- `PORT` - Port to run the server on (defaults to 8080)
- `HOST` - Host address to bind the server to (defaults to "0.0.0.0")

## 📁 Project Structure

```
from-the-hart-auth/
├── src/
│   ├── app.ts              # Application setup and plugin configuration
│   ├── lambda.ts           # Main entry point for serverless deployments
│   ├── server.ts           # Main application entry point for traditional servers
│   ├── config/             # Application configuration
│   │   ├── index.ts        # Configuration exports
│   │   ├── logger.ts       # Logging setup
│   │   └── swagger.ts      # API documentation configuration
│   ├── controllers/        # API request handlers
│   │   └── authController.ts
│   ├── models/             # Data models with TypeBox schemas
│   │   └── AuthUser.ts
│   ├── routes/             # API route definitions
│   │   └── auth.ts
│   └── services/           # Business logic services
│       ├── authService.ts  # Authentication logic
│       ├── emailService.ts # Email sending functionality
│       └── firebase.ts     # Firebase integration
├── terraform/              # Infrastructure as Code configurations
│   ├── dev/                # Development environment resources
│   └── prod/               # Production environment resources
├── tests/                  # Test files
│   └── routes/             # API route tests
├── Dockerfile              # Container build configuration
├── jest.config.ts          # Jest testing configuration
├── package.json            # Project dependencies and scripts
├── tsconfig.json           # TypeScript configuration
└── README.md               # Project documentation
```

## 📚 Scripts

- `npm run dev` - Start the development server
- `npm run build` - Build for production
- `npm start` - Start the production server
- `npm test` - Run tests
- `npm run lint` - Run linting checks
