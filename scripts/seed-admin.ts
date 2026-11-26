/**
 * One-off admin seed script (REQ-17/18/19, design.md §5.6, ADR-0004).
 *
 * Grants the platform-level `admin` role to the existing Identity that already
 * holds `owner`, via a read-merge-write of the Principal's custom claims.
 * Idempotent — running it again is a no-op.
 *
 * Run manually by the owner. NEVER wire this into app startup, CI, or Terraform.
 * No secrets or target identifiers are committed; credentials come from
 * Application Default Credentials (ADC).
 *
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json \
 *   FIREBASE_PROJECT_ID=<project-id> \
 *   TARGET_PRINCIPAL_EMAIL=owner@example.com \
 *   npx ts-node scripts/seed-admin.ts
 *
 * Set TARGET_PRINCIPAL_UID instead of TARGET_PRINCIPAL_EMAIL to target by UID
 * (exactly one of the two must be set).
 */
import * as admin from "firebase-admin";
import { mergeAdminRole, parseSeedTarget } from "../src/utils/claims";

async function main(): Promise<void> {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  if (!projectId) {
    throw new Error("FIREBASE_PROJECT_ID is not set");
  }

  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    throw new Error(
      "GOOGLE_APPLICATION_CREDENTIALS is not set: application default credentials not found"
    );
  }

  const target = parseSeedTarget(process.env);

  if (admin.apps.length === 0) {
    admin.initializeApp({ projectId });
  }
  const auth = admin.auth();

  const uid =
    target.kind === "email"
      ? (await auth.getUserByEmail(target.value)).uid
      : target.value;

  const userRecord = await auth.getUser(uid);
  const claims: Record<string, unknown> = userRecord.customClaims ?? {};

  // Throws on malformed claims or when no Identity holds `owner` (EC-19):
  // never blind-writes an empty/malformed claims object.
  const merged = mergeAdminRole(claims);

  await auth.setCustomUserClaims(uid, merged);

  // Read back and verify the write actually landed.
  const verifiedClaims: Record<string, unknown> =
    (await auth.getUser(uid)).customClaims ?? {};
  const adminEntry = Object.entries(
    (verifiedClaims.identities as Record<string, string[]> | undefined) ?? {}
  ).find(([, roles]) => Array.isArray(roles) && roles.includes("admin"));

  if (!adminEntry) {
    throw new Error(
      `Read-back verification failed: admin role is not present on ${uid} after the write`
    );
  }

  const [identityId, roles] = adminEntry;
  console.log(`SUCCESS: admin role granted to ${uid}`);
  console.log(JSON.stringify({ uid, identity_id: identityId, roles }));
}

if (require.main === module) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`ERROR: ${message}`);
    process.exitCode = 1;
  });
}
