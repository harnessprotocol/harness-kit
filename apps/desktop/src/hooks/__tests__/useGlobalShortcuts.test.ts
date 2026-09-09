import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { fireEvent } from "@testing-library/react";
import { shortcutPaths, visibleNav } from "../../nav";
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

// localStorage is cleared before every test (src/test-setup.ts), so the
// comparator lab is off and this reflects the same set useGlobalShortcuts
// computes internally via getLabs().
const paths = shortcutPaths(visibleNav({ comparator: false }));

// ── Tests ─────────────────────────────────────────────────────

describe("⌘1–⌘N navigation", () => {
  paths.forEach((path, idx) => {
    const num = idx + 1;
    it(`⌘${num} navigates to ${path}`, () => {
      const { navigate } = renderShortcuts();
      fireEvent.keyDown(document, metaKey(String(num)));
      expect(navigate).toHaveBeenCalledWith(path);
    });
  });
});

describe("out-of-bounds key does nothing", () => {
  it(`⌘${paths.length + 1} does not call navigate`, () => {
    const { navigate } = renderShortcuts();
    fireEvent.keyDown(document, metaKey(String(paths.length + 1)));
    expect(navigate).not.toHaveBeenCalled();
  });

  it("⌘0 does not call navigate", () => {
    const { navigate } = renderShortcuts();
    fireEvent.keyDown(document, metaKey("0"));
    expect(navigate).not.toHaveBeenCalled();
  });
});

describe("labs-gated shortcuts", () => {
  it("⌘5 does nothing while the comparator lab is off", () => {
    const { navigate } = renderShortcuts();
    fireEvent.keyDown(document, metaKey("5"));
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
