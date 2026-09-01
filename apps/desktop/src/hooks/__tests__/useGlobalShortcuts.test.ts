import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { fireEvent } from "@testing-library/react";
import { NAV_PATHS } from "../useGlobalShortcuts";
import { NAV_SECTIONS } from "../../layouts/AppLayout";
import { useGlobalShortcuts } from "../useGlobalShortcuts";

// ── Helpers ───────────────────────────────────────────────────

function metaKey(key: string) {
  return { metaKey: true, key };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMock = ReturnType<typeof vi.fn<any>>;

function renderShortcuts(overrides?: { navigate?: AnyMock }) {
  const navigate = overrides?.navigate ?? vi.fn();
  renderHook(() =>
    useGlobalShortcuts({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      navigate: navigate as any,
    }),
  );
  return { navigate };
}

// ── Tests ─────────────────────────────────────────────────────

describe("NAV_PATHS coverage", () => {
  it("covers every NAV_SECTION — lengths must match", () => {
    expect(NAV_PATHS.length).toBe(NAV_SECTIONS.length);
  });
});

describe("⌘1–⌘N navigation", () => {
  NAV_PATHS.forEach((path, idx) => {
    const num = idx + 1;
    it(`⌘${num} navigates to ${path}`, () => {
      const { navigate } = renderShortcuts();
      fireEvent.keyDown(document, metaKey(String(num)));
      expect(navigate).toHaveBeenCalledWith(path);
    });
  });
});

describe("out-of-bounds key does nothing", () => {
  it(`⌘${NAV_PATHS.length + 1} does not call navigate`, () => {
    const { navigate } = renderShortcuts();
    fireEvent.keyDown(document, metaKey(String(NAV_PATHS.length + 1)));
    expect(navigate).not.toHaveBeenCalled();
  });

  it("⌘0 does not call navigate", () => {
    const { navigate } = renderShortcuts();
    fireEvent.keyDown(document, metaKey("0"));
    expect(navigate).not.toHaveBeenCalled();
  });
});

describe("⌘, opens preferences", () => {
  it("navigates to /preferences", () => {
    const { navigate } = renderShortcuts();
    fireEvent.keyDown(document, metaKey(","));
    expect(navigate).toHaveBeenCalledWith("/preferences");
  });
});

describe("Escape does nothing", () => {
  it("does not call navigate on Escape", () => {
    const { navigate } = renderShortcuts();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(navigate).not.toHaveBeenCalled();
  });
});
