const logLevel = process.env.LOG_LEVEL || "debug";
const env = process.env.NODE_ENV || "local";

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

export const config = {
  env,
  logLevel,
  server,
  firebaseConfig,
  // Base URL for email verification and password reset actions
  emailActionBaseUrl:
    process.env.EMAIL_ACTION_BASE_URL ||
    `https://${
      process.env.FIREBASE_AUTH_DOMAIN ||
      `${process.env.FIREBASE_PROJECT_ID}.firebaseapp.com`
    }`,
};
