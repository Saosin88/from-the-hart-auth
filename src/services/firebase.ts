import * as admin from "firebase-admin";
import { logger } from "../config/logger";
import { config } from "../config";

export const initializeFirebaseAdmin = (): void => {
  try {
    if (admin.apps.length === 0) {
      if (!config.firebaseConfig.projectId) {
        throw new Error("Firebase projectId is not configured");
      }
      
      admin.initializeApp({
        projectId: config.firebaseConfig.projectId,
      });

      admin.firestore().settings({
        databaseId: "auth",
      });

      logger.info({ operation: "initializeFirebaseAdmin", projectId: config.firebaseConfig.projectId }, "Firebase initialized successfully");
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
