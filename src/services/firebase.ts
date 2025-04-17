import * as admin from "firebase-admin";
import { logger } from "../config/logger";
import { config } from "../config";

export const initializeFirebaseAdmin = (): void => {
  try {
    if (admin.apps.length === 0) {
      admin.initializeApp({
        projectId: config.firebaseConfig.projectId,
      });
      logger.info("Firebase Admin SDK initialized");
    }
  } catch (error) {
    logger.error({ error }, "Failed to initialize Firebase Admin SDK");
    throw new Error(
      "Firebase initialization failed. Check your credentials and environment variables."
    );
  }
};

// Export function to get auth instance
export const adminAuth = admin.auth;
