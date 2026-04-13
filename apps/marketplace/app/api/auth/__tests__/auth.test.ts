import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Mock next/headers so cookie reads work without a real Next.js runtime
vi.mock("next/headers", () => ({
  cookies: vi.fn(),
}));

// Mock the Supabase client factory used inside lib/auth
vi.mock("@supabase/supabase-js", () => {
  const mockGetUser = vi.fn();
  const mockSetSession = vi.fn();
  const mockSignOut = vi.fn();

  const mockClient = {
    auth: {
      getUser: mockGetUser,
      setSession: mockSetSession,
      signOut: mockSignOut,
    },
  };

  return {
    createClient: vi.fn(() => mockClient),
    // Re-export type so TypeScript doesn't complain in the source
    type: {},
  };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

const mockedCookies = vi.mocked(cookies);
const mockedCreateClient = vi.mocked(createClient);

/** Return a fake cookie store with the given values (undefined = not set). */
function makeCookieStore(values: Record<string, string | undefined> = {}) {
  return {
    get: (name: string) =>
      values[name] !== undefined ? { name, value: values[name]! } : undefined,
    set: vi.fn(),
    delete: vi.fn(),
    has: vi.fn((name: string) => values[name] !== undefined),
    getAll: vi.fn(() => []),
  };
}

/** Convenience: get the mock auth object from the most-recent createClient call. */
function getMockAuth() {
  return (mockedCreateClient.mock.results.at(-1)?.value as ReturnType<typeof createClient>).auth;
}

// ---------------------------------------------------------------------------
// Environment setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.resetAllMocks();
  // Provide required env vars so createServerClient doesn't throw
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
});

// ---------------------------------------------------------------------------
// getServerSession() tests
// ---------------------------------------------------------------------------

describe("getServerSession()", () => {
  it("returns null when no session cookies are present", async () => {
    // No access/refresh token cookies
    mockedCookies.mockResolvedValue(makeCookieStore() as never);

    // Supabase returns no user when tokens were never set
    (mockedCreateClient as ReturnType<typeof vi.fn>).mockReturnValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
        setSession: vi.fn(),
        signOut: vi.fn(),
      },
    });

    const { getServerSession } = await import("@/lib/auth");
    const result = await getServerSession();
    expect(result).toBeNull();
  });

  it("returns a user object when a valid session cookie is present", async () => {
    const fakeUser = { id: "user-123", email: "user@example.com" };

    mockedCookies.mockResolvedValue(
      makeCookieStore({
        "sb-access-token": "valid-access-token",
        "sb-refresh-token": "valid-refresh-token",
      }) as never,
    );

    (mockedCreateClient as ReturnType<typeof vi.fn>).mockReturnValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: fakeUser }, error: null }),
        setSession: vi.fn().mockResolvedValue({}),
        signOut: vi.fn(),
      },
    });

    const { getServerSession } = await import("@/lib/auth");
    const result = await getServerSession();
    expect(result).toEqual(fakeUser);
  });
});

// ---------------------------------------------------------------------------
// Auth gate (requireAuth pattern) tests
//
// The marketplace API routes guard endpoints with:
//   const user = await getServerSession();
//   if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
//
// These tests verify that pattern works correctly.
// ---------------------------------------------------------------------------

describe("requireAuth pattern", () => {
  it("results in a 401 response when there is no session", async () => {
    mockedCookies.mockResolvedValue(makeCookieStore() as never);

    (mockedCreateClient as ReturnType<typeof vi.fn>).mockReturnValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
        setSession: vi.fn(),
        signOut: vi.fn(),
      },
    });

    const { getServerSession } = await import("@/lib/auth");
    const user = await getServerSession();

    // Simulate the auth gate used in all protected API routes
    const response = user
      ? null
      : NextResponse.json({ error: "Authentication required" }, { status: 401 });

    expect(response).not.toBeNull();
    expect(response!.status).toBe(401);
  });

  it("returns the user when a valid session exists", async () => {
    const fakeUser = { id: "user-456", email: "another@example.com" };

    mockedCookies.mockResolvedValue(
      makeCookieStore({
        "sb-access-token": "good-token",
        "sb-refresh-token": "good-refresh",
      }) as never,
    );

    (mockedCreateClient as ReturnType<typeof vi.fn>).mockReturnValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: fakeUser }, error: null }),
        setSession: vi.fn().mockResolvedValue({}),
        signOut: vi.fn(),
      },
    });

    const { getServerSession } = await import("@/lib/auth");
    const user = await getServerSession();

    // Auth gate passes — user is available for the handler
    expect(user).toEqual(fakeUser);
    expect(user).not.toBeNull();
  });
});
