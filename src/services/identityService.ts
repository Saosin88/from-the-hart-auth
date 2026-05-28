import { GoogleAuth } from "google-auth-library";

const IDENTITY_TIMEOUT_MS = 30_000;

/**
 * IdentityServiceError — wraps Identity service HTTP errors for clean service-layer handling.
 *
 * - statusCode: HTTP status from Identity (0 for network/timeout failures)
 * - message: Identity's error message or network error description
 *   (logged only — never returned to end user)
 */
export class IdentityServiceError extends Error {
  public readonly statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = "IdentityServiceError";
    this.statusCode = statusCode;
  }
}

/**
 * Creates an Identity record by calling the Identity service's POST /identity endpoint.
 *
 * @param email - The Principal's email address
 * @param identityServiceUrl - The base URL of the Identity service (injected for testability)
 * @returns The identity_id UUID
 * @throws {IdentityServiceError} On any failure (HTTP error, timeout, network error)
 */
export const createIdentity = async (
  email: string,
  identityServiceUrl: string,
): Promise<string> => {
  const auth = new GoogleAuth();
  const client = await auth.getIdTokenClient(identityServiceUrl);
  const headers = await client.getRequestHeaders();

  try {
    const response = await fetch(`${identityServiceUrl}/identity`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
      body: JSON.stringify({
        email,
        first_name: "",
        last_name: "",
        identity_type: "person",
      }),
      signal: AbortSignal.timeout(IDENTITY_TIMEOUT_MS),
    });

    if (!response.ok) {
      let errorMessage = `Identity service returned HTTP ${response.status}`;
      try {
        const errorBody = await response.json();
        if (errorBody?.error?.message) {
          errorMessage = errorBody.error.message;
        }
      } catch {
        // Ignore JSON parse errors on error responses — use default message
      }
      throw new IdentityServiceError(errorMessage, response.status);
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch (e) {
      throw new IdentityServiceError(
        `Invalid JSON response from Identity service: ${(e as Error).message}`,
        0,
      );
    }

    const identityId = (body as { data?: { identity_id?: string } })?.data
      ?.identity_id;

    if (!identityId) {
      throw new IdentityServiceError(
        "Identity service response missing data.identity_id",
        0,
      );
    }

    return identityId;
  } catch (error) {

    if (error instanceof IdentityServiceError) {
      throw error;
    }

    if (error instanceof Error && error.name === "AbortError") {
      throw new IdentityServiceError(
        `Identity service timed out after ${IDENTITY_TIMEOUT_MS}ms`,
        0,
      );
    }

    throw new IdentityServiceError(
      error instanceof Error ? error.message : "Unknown error calling Identity service",
      0,
    );
  }
};
