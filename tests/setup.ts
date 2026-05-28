// Vitest global setup for tests
process.env.NODE_ENV = process.env.NODE_ENV || "test";
process.env.FIREBASE_PROJECT_ID =
  process.env.FIREBASE_PROJECT_ID || "test-project";
process.env.FIREBASE_WEB_API_KEY =
  process.env.FIREBASE_WEB_API_KEY || "test-api-key";
