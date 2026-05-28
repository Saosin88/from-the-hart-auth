const logLevel = process.env.LOG_LEVEL || "info";
const env = process.env.NODE_ENV || "local";
const websiteAuthBaseUrl =
  process.env.WEBSITE_AUTH_BASE_URL || "https://www.fromthehart.tech/auth";

const server = {
  port: process.env.PORT ? parseInt(process.env.PORT, 10) : 8080,
  host: process.env.HOST || "0.0.0.0",
};

const firebaseConfig = {
  projectId: process.env.FIREBASE_PROJECT_ID,
  webAPIKey: process.env.FIREBASE_WEB_API_KEY,
  serviceAccountEmail: process.env.FIREBASE_CLIENT_EMAIL,
  serviceAccountprivateKey: process.env.SERVICE_ACCOUNT_PRIVATE_KEY?.replace(
    /\\n/g,
    "\n"
  ),
};

const email = {
  gmailUser: process.env.GMAIL_USER,
  gmailAppPassword: process.env.GMAIL_APP_PASSWORD,
  fromAlias: process.env.EMAIL_FROM_ALIAS,
};

const identityServiceUrl = process.env.IDENTITY_SERVICE_URL || "";

// Fail-fast: crash at startup if IDENTITY_SERVICE_URL is missing in non-test environments
if (env !== "test" && !identityServiceUrl) {
  throw new Error(
    "IDENTITY_SERVICE_URL environment variable is required but not set. " +
      "Set it to the Identity service's Cloud Run URL (e.g., " +
      "https://from-the-hart-identity-<project-number>.africa-south1.run.app)."
  );
}

export const config = {
  env,
  logLevel,
  server,
  firebaseConfig,
  email,
  websiteAuthBaseUrl,
  identityServiceUrl,
};
