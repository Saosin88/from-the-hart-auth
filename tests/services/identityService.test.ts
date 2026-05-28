import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { IdentityServiceError } from "../../src/services/identityService";

const mockGoogleAuth = vi.hoisted(() => ({
  getIdTokenClient: vi.fn(),
}));

vi.mock("google-auth-library", () => ({
  GoogleAuth: function () {
    return mockGoogleAuth;
  },
}));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

const TEST_URL = "https://identity.example.com";

beforeEach(() => {
  vi.clearAllMocks();

  mockGoogleAuth.getIdTokenClient.mockResolvedValue({
    getRequestHeaders: vi.fn().mockResolvedValue({
      Authorization: "Bearer mock-google-id-token",
    }),
  });
});

afterEach(() => {
  delete process.env.IDENTITY_SERVICE_URL;
});

async function getCreateIdentity() {
  const mod = await import("../../src/services/identityService");
  return mod.createIdentity;
}

describe("createIdentity", () => {
  it("should return identity_id when Identity returns 201", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 201,
      json: vi.fn().mockResolvedValue({
        data: { identity_id: "550e8400-e29b-41d4-a716-446655440000" },
      }),
    });

    const createIdentity = await getCreateIdentity();
    const result = await createIdentity("test@example.com", TEST_URL);

    expect(result).toBe("550e8400-e29b-41d4-a716-446655440000");
  });

  it("should use GoogleAuth to get Authorization header", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 201,
      json: vi.fn().mockResolvedValue({
        data: { identity_id: "test-uuid" },
      }),
    });

    const createIdentity = await getCreateIdentity();
    await createIdentity("test@example.com", TEST_URL);

    expect(mockGoogleAuth.getIdTokenClient).toHaveBeenCalledWith(TEST_URL);

    expect(mockFetch).toHaveBeenCalledWith(
      `${TEST_URL}/identity`,
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer mock-google-id-token",
        }),
      })
    );
  });

  it("should POST correct body to /identity endpoint", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 201,
      json: vi.fn().mockResolvedValue({
        data: { identity_id: "test-uuid" },
      }),
    });

    const createIdentity = await getCreateIdentity();
    await createIdentity("test@example.com", TEST_URL);

    expect(mockFetch).toHaveBeenCalledWith(
      `${TEST_URL}/identity`,
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({
          email: "test@example.com",
          first_name: "",
          last_name: "",
          identity_type: "person",
        }),
      })
    );
  });

  it("should throw IdentityServiceError with statusCode 400 on 400 response", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 400,
      json: vi.fn().mockResolvedValue({
        error: { message: "Missing required fields: email" },
      }),
    });

    const createIdentity = await getCreateIdentity();
    await expect(createIdentity("test@example.com", TEST_URL)).rejects.toThrow(
      IdentityServiceError
    );
    await expect(
      createIdentity("test@example.com", TEST_URL)
    ).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it("should throw IdentityServiceError with statusCode 403 on 403 response", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 403,
      json: vi.fn().mockResolvedValue({
        error: { message: "Forbidden" },
      }),
    });

    const createIdentity = await getCreateIdentity();
    await expect(createIdentity("test@example.com", TEST_URL)).rejects.toThrow(
      IdentityServiceError
    );
    await expect(
      createIdentity("test@example.com", TEST_URL)
    ).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  it("should throw IdentityServiceError with statusCode 500 on 5xx response", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 503,
      json: vi.fn().mockResolvedValue({
        error: { message: "Service Unavailable" },
      }),
    });

    const createIdentity = await getCreateIdentity();
    await expect(createIdentity("test@example.com", TEST_URL)).rejects.toThrow(
      IdentityServiceError
    );
    await expect(
      createIdentity("test@example.com", TEST_URL)
    ).rejects.toMatchObject({
      statusCode: 503,
    });
  });

  it("should throw IdentityServiceError with statusCode 0 on timeout", async () => {
    const abortError = new DOMException("The operation was aborted", "AbortError");
    mockFetch.mockRejectedValue(abortError);

    const createIdentity = await getCreateIdentity();
    await expect(createIdentity("test@example.com", TEST_URL)).rejects.toThrow(
      IdentityServiceError
    );
    await expect(
      createIdentity("test@example.com", TEST_URL)
    ).rejects.toMatchObject({
      statusCode: 0,
      message: expect.stringMatching(/timed( ?out|out)|aborted|timeout/i),
    });
  });

  it("should throw IdentityServiceError with statusCode 0 on network error", async () => {
    mockFetch.mockRejectedValue(new TypeError("fetch failed"));

    const createIdentity = await getCreateIdentity();
    await expect(createIdentity("test@example.com", TEST_URL)).rejects.toThrow(
      IdentityServiceError
    );
    await expect(
      createIdentity("test@example.com", TEST_URL)
    ).rejects.toMatchObject({
      statusCode: 0,
      message: expect.stringContaining("fetch failed"),
    });
  });

  it("should throw IdentityServiceError when response body is not valid JSON", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 201,
      json: vi.fn().mockRejectedValue(new SyntaxError("Unexpected token")),
    });

    const createIdentity = await getCreateIdentity();
    await expect(createIdentity("test@example.com", TEST_URL)).rejects.toThrow(
      IdentityServiceError
    );
    await expect(
      createIdentity("test@example.com", TEST_URL)
    ).rejects.toMatchObject({
      statusCode: 0,
    });
  });

  it("should throw IdentityServiceError when 201 response lacks data.identity_id", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 201,
      json: vi.fn().mockResolvedValue({
        data: {},
      }),
    });

    const createIdentity = await getCreateIdentity();
    await expect(createIdentity("test@example.com", TEST_URL)).rejects.toThrow(
      IdentityServiceError
    );
    await expect(
      createIdentity("test@example.com", TEST_URL)
    ).rejects.toMatchObject({
      statusCode: 0,
    });
  });

  it("should pass AbortSignal.timeout(10000) as fetch signal", async () => {
    const timeoutSpy = vi.spyOn(AbortSignal, "timeout");
    const mockSignal = {
      aborted: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    timeoutSpy.mockReturnValue(mockSignal as unknown as AbortSignal);

    mockFetch.mockResolvedValue({
      ok: true,
      status: 201,
      json: vi.fn().mockResolvedValue({
        data: { identity_id: "test-uuid" },
      }),
    });

    const createIdentity = await getCreateIdentity();
    await createIdentity("test@example.com", TEST_URL);

    expect(timeoutSpy).toHaveBeenCalledWith(10000);

    const fetchCall = mockFetch.mock.calls[0];
    const fetchOptions = fetchCall[1];
    expect(fetchOptions.signal).toBe(mockSignal);

    timeoutSpy.mockRestore();
  });
});
