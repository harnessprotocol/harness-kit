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

function renderShortcuts(overrides?: { navigate?: AnyMock; setSettingsOpen?: AnyMock }) {
  const navigate = overrides?.navigate ?? vi.fn();
  const setSettingsOpen = overrides?.setSettingsOpen ?? vi.fn();
  renderHook(() =>
    useGlobalShortcuts({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      navigate: navigate as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setSettingsOpen: setSettingsOpen as any,
    }),
  );
  return { navigate, setSettingsOpen };
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

describe("⌘, toggles preferences", () => {
  it("calls setSettingsOpen with toggle function", () => {
    const setSettingsOpen = vi.fn();
    renderShortcuts({ setSettingsOpen });
    fireEvent.keyDown(document, metaKey(","));
    expect(setSettingsOpen).toHaveBeenCalledTimes(1);
    // The argument should be a function (toggler)
    const arg = setSettingsOpen.mock.calls[0][0];
    expect(typeof arg).toBe("function");
    expect(arg(false)).toBe(true);
    expect(arg(true)).toBe(false);
  });
});

describe("Escape closes preferences", () => {
  it("calls setSettingsOpen(false) on Escape", () => {
    const setSettingsOpen = vi.fn();
    renderShortcuts({ setSettingsOpen });
    fireEvent.keyDown(document, { key: "Escape" });
    expect(setSettingsOpen).toHaveBeenCalledWith(false);
  });
});
