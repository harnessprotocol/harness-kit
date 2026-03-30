import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock @harness-kit/board-ui before importing the shim ──────────

const mockConfigureBoardApi = vi.fn();
const mockGetBoardApiBase = vi.fn().mockReturnValue("http://localhost:4800/api/v1");
const mockApi = {
  projects: { list: vi.fn(), get: vi.fn(), create: vi.fn() },
  tasks: { update: vi.fn(), create: vi.fn() },
};
const mockApiFetch = vi.fn();

vi.mock("@harness-kit/board-ui", () => ({
  configureBoardApi: mockConfigureBoardApi,
  getBoardApiBase: mockGetBoardApiBase,
  api: mockApi,
  apiFetch: mockApiFetch,
}));

// ── Reset between tests ───────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

// ── Tests ─────────────────────────────────────────────────────────

describe("board-api re-export shim", () => {
  it("calls configureBoardApi with the desktop URL on import", async () => {
    // Dynamic import triggers the side-effect
    await import("../board-api");
    expect(mockConfigureBoardApi).toHaveBeenCalledWith(
      "http://localhost:4800/api/v1",
    );
  });

  it("exports BOARD_SERVER_BASE equal to http://localhost:4800", async () => {
    const mod = await import("../board-api");
    expect(mod.BOARD_SERVER_BASE).toBe("http://localhost:4800");
  });

  it("re-exports api from @harness-kit/board-ui", async () => {
    const mod = await import("../board-api");
    expect(mod.api).toBeDefined();
    expect(mod.api).toBe(mockApi);
  });

  it("re-exports configureBoardApi from @harness-kit/board-ui", async () => {
    const mod = await import("../board-api");
    expect(mod.configureBoardApi).toBeDefined();
    expect(mod.configureBoardApi).toBe(mockConfigureBoardApi);
  });

  it("re-exports getBoardApiBase from @harness-kit/board-ui", async () => {
    const mod = await import("../board-api");
    expect(mod.getBoardApiBase).toBeDefined();
    expect(mod.getBoardApiBase).toBe(mockGetBoardApiBase);
  });

  it("re-exports apiFetch from @harness-kit/board-ui", async () => {
    const mod = await import("../board-api");
    expect(mod.apiFetch).toBeDefined();
    expect(mod.apiFetch).toBe(mockApiFetch);
  });
});
