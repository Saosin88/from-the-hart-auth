import * as admin from "firebase-admin";
import { logger } from "../config/logger";
import { config } from "../config";
import { FieldValue } from "firebase-admin/firestore";

export const initializeFirebaseAdmin = (): void => {
  try {
    if (admin.apps.length === 0) {
      admin.initializeApp({
        projectId: config.firebaseConfig.projectId,
      });

      admin.firestore().settings({
        databaseId: "auth",
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

export const adminAuth = admin.auth;

export const firestore = () => admin.firestore();
