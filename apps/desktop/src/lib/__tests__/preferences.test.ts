import { beforeEach, describe, expect, it } from "vitest";
import {
  FONT_SIZE_DEFAULT,
  FONT_SIZE_MAX,
  FONT_SIZE_MIN,
  getConfigFilesDetailLevel,
  getConfirmSave,
  getDefaultSection,
  getDensity,
  getFontSize,
  getHiddenSections,
  getMarkdownFont,
  getObservatoryRefresh,
  getSidebarWidth,
  initPreferences,
  OBSERVATORY_REFRESH_DEFAULT,
  SIDEBAR_WIDTH_DEFAULT,
  SIDEBAR_WIDTH_MAX,
  SIDEBAR_WIDTH_MIN,
  setConfigFilesDetailLevel,
  setConfirmSave,
  setDefaultSection,
  setDensity,
  setFontSize,
  setHiddenSections,
  setMarkdownFont,
  setObservatoryRefresh,
  setSidebarWidth,
} from "../preferences";

beforeEach(() => {
  localStorage.clear();
  document.documentElement.style.cssText = "";
  document.documentElement.removeAttribute("data-density");
  // Ensure #root exists for zoom-based font scaling
  let root = document.getElementById("root");
  if (!root) {
    root = document.createElement("div");
    root.id = "root";
    document.body.appendChild(root);
  }
  root.style.zoom = "";
});

// ── Font Size ────────────────────────────────────────────────

describe("getFontSize / setFontSize", () => {
  it("returns default when unset", () => {
    expect(getFontSize()).toBe(FONT_SIZE_DEFAULT);
    expect(getFontSize()).toBe(13);
  });

  it("stores and retrieves a value", () => {
    setFontSize(15);
    expect(getFontSize()).toBe(15);
  });

  it("clamps below minimum to minimum", () => {
    setFontSize(8);
    expect(getFontSize()).toBe(FONT_SIZE_MIN);
  });

  it("clamps above maximum to maximum", () => {
    setFontSize(24);
    expect(getFontSize()).toBe(FONT_SIZE_MAX);
  });

  it("applies zoom on #root element", () => {
    setFontSize(15);
    const root = document.getElementById("root")!;
    expect(root.style.zoom).toBe(String(15 / FONT_SIZE_DEFAULT));
  });
});

// ── Density ──────────────────────────────────────────────────

describe("getDensity / setDensity", () => {
  it("returns 'comfortable' when unset", () => {
    expect(getDensity()).toBe("comfortable");
  });

  it("stores and retrieves 'compact'", () => {
    setDensity("compact");
    expect(getDensity()).toBe("compact");
  });

  it("stores and retrieves 'comfortable'", () => {
    setDensity("compact");
    setDensity("comfortable");
    expect(getDensity()).toBe("comfortable");
  });

  it("sets data-density attribute on documentElement", () => {
    setDensity("compact");
    expect(document.documentElement.getAttribute("data-density")).toBe("compact");
  });
});

// ── Default Section ──────────────────────────────────────────

describe("getDefaultSection / setDefaultSection", () => {
  it("returns '/harness/plugins' when unset", () => {
    expect(getDefaultSection()).toBe("/harness/plugins");
  });

  it("stores and retrieves a value", () => {
    setDefaultSection("/observatory");
    expect(getDefaultSection()).toBe("/observatory");
  });
});

// ── Hidden Sections ──────────────────────────────────────────

describe("getHiddenSections / setHiddenSections", () => {
  it("returns empty Set when unset", () => {
    const result = getHiddenSections();
    expect(result).toBeInstanceOf(Set);
    expect(result.size).toBe(0);
  });

  it("round-trips a Set of strings", () => {
    const sections = new Set(["/observatory", "/harness/skills"]);
    setHiddenSections(sections);
    const result = getHiddenSections();
    expect(result).toBeInstanceOf(Set);
    expect(result.size).toBe(2);
    expect(result.has("/observatory")).toBe(true);
    expect(result.has("/harness/skills")).toBe(true);
  });

  it("round-trips an empty Set", () => {
    setHiddenSections(new Set(["something"]));
    setHiddenSections(new Set());
    expect(getHiddenSections().size).toBe(0);
  });
});

// ── Observatory Refresh ──────────────────────────────────────

describe("getObservatoryRefresh / setObservatoryRefresh", () => {
  it("returns 60000 when unset", () => {
    expect(getObservatoryRefresh()).toBe(60_000);
  });

  it("stores and retrieves a value", () => {
    setObservatoryRefresh(30_000);
    expect(getObservatoryRefresh()).toBe(30_000);
  });

  it("stores 0 for off", () => {
    setObservatoryRefresh(0);
    expect(getObservatoryRefresh()).toBe(0);
  });
});

// ── Markdown Font ────────────────────────────────────────────

describe("getMarkdownFont / setMarkdownFont", () => {
  it("returns 'sans' when unset", () => {
    expect(getMarkdownFont()).toBe("sans");
  });

  it("stores and retrieves 'mono'", () => {
    setMarkdownFont("mono");
    expect(getMarkdownFont()).toBe("mono");
  });

  it("stores and retrieves 'sans'", () => {
    setMarkdownFont("mono");
    setMarkdownFont("sans");
    expect(getMarkdownFont()).toBe("sans");
  });
});

// ── Sidebar Width ────────────────────────────────────────────

describe("getSidebarWidth / setSidebarWidth", () => {
  it("returns default when unset", () => {
    expect(getSidebarWidth()).toBe(SIDEBAR_WIDTH_DEFAULT);
    expect(getSidebarWidth()).toBe(208);
  });

  it("stores and retrieves a value", () => {
    setSidebarWidth(250);
    expect(getSidebarWidth()).toBe(250);
  });

  it("clamps below minimum to minimum", () => {
    setSidebarWidth(100);
    expect(getSidebarWidth()).toBe(SIDEBAR_WIDTH_MIN);
  });

  it("clamps above maximum to maximum", () => {
    setSidebarWidth(500);
    expect(getSidebarWidth()).toBe(SIDEBAR_WIDTH_MAX);
  });

  it("applies --sidebar-width CSS variable", () => {
    setSidebarWidth(280);
    expect(document.documentElement.style.getPropertyValue("--sidebar-width")).toBe("280px");
  });
});

// ── Confirm Save ────────────────────────────────────────────

describe("getConfirmSave / setConfirmSave", () => {
  it("returns true when unset", () => {
    expect(getConfirmSave()).toBe(true);
  });

  it("stores and retrieves false", () => {
    setConfirmSave(false);
    expect(getConfirmSave()).toBe(false);
  });

  it("stores and retrieves true", () => {
    setConfirmSave(false);
    setConfirmSave(true);
    expect(getConfirmSave()).toBe(true);
  });

  it("falls back to true for invalid string", () => {
    localStorage.setItem("harness-kit-confirm-save", "garbage");
    expect(getConfirmSave()).toBe(true);
  });
});

// ── Corrupted localStorage ───────────────────────────────────

describe("corrupted localStorage resilience", () => {
  it("getFontSize falls back to min for non-numeric garbage", () => {
    localStorage.setItem("harness-kit-font-size", "abc");
    expect(getFontSize()).toBe(FONT_SIZE_MIN);
  });

  it("getSidebarWidth falls back to min for non-numeric garbage", () => {
    localStorage.setItem("harness-kit-sidebar-width", "abc");
    expect(getSidebarWidth()).toBe(SIDEBAR_WIDTH_MIN);
  });

  it("getObservatoryRefresh falls back to default for non-numeric garbage", () => {
    localStorage.setItem("harness-kit-observatory-refresh", "abc");
    expect(getObservatoryRefresh()).toBe(OBSERVATORY_REFRESH_DEFAULT);
  });

  it("getObservatoryRefresh falls back to default for negative values", () => {
    localStorage.setItem("harness-kit-observatory-refresh", "-500");
    expect(getObservatoryRefresh()).toBe(OBSERVATORY_REFRESH_DEFAULT);
  });

  it("getDensity falls back to 'comfortable' for invalid string", () => {
    localStorage.setItem("harness-kit-density", "foo");
    expect(getDensity()).toBe("comfortable");
  });

  it("getMarkdownFont falls back to 'sans' for invalid string", () => {
    localStorage.setItem("harness-kit-markdown-font", "foo");
    expect(getMarkdownFont()).toBe("sans");
  });
});

// ── Config Files Detail Level ────────────────────────────────

describe("configFilesDetailLevel", () => {
  it("returns 'text-files' by default", () => {
    expect(getConfigFilesDetailLevel()).toBe("text-files");
  });

  it("persists and retrieves the set value", () => {
    setConfigFilesDetailLevel("essentials");
    expect(getConfigFilesDetailLevel()).toBe("essentials");

    setConfigFilesDetailLevel("all");
    expect(getConfigFilesDetailLevel()).toBe("all");
  });

  it("falls back to 'text-files' for unknown stored values", () => {
    localStorage.setItem("harness-kit-config-files-detail", "garbage");
    expect(getConfigFilesDetailLevel()).toBe("text-files");
  });
});

// ── initPreferences ──────────────────────────────────────────

describe("initPreferences", () => {
  it("applies defaults when nothing is stored", () => {
    initPreferences();
    const root = document.getElementById("root")!;
    expect(root.style.zoom).toBe("1");
    expect(document.documentElement.style.getPropertyValue("--sidebar-width")).toBe("208px");
    expect(document.documentElement.getAttribute("data-density")).toBe("comfortable");
  });

  it("applies stored values", () => {
    localStorage.setItem("harness-kit-font-size", "16");
    localStorage.setItem("harness-kit-density", "compact");
    localStorage.setItem("harness-kit-sidebar-width", "300");

    initPreferences();

    const root = document.getElementById("root")!;
    expect(root.style.zoom).toBe(String(16 / FONT_SIZE_DEFAULT));
    expect(document.documentElement.getAttribute("data-density")).toBe("compact");
    expect(document.documentElement.style.getPropertyValue("--sidebar-width")).toBe("300px");
  });

  it("clamps out-of-range stored values", () => {
    localStorage.setItem("harness-kit-font-size", "99");
    localStorage.setItem("harness-kit-sidebar-width", "5");

    initPreferences();

    const root = document.getElementById("root")!;
    expect(root.style.zoom).toBe(String(FONT_SIZE_MAX / FONT_SIZE_DEFAULT));
    expect(document.documentElement.style.getPropertyValue("--sidebar-width")).toBe("160px");
  });
});
