import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import type { MarketplacePlugin } from "@harness-kit/marketplace-data";
import MarketplacePage from "../MarketplacePage";

// ── Fixtures ─────────────────────────────────────────────────
//
// vi.mock factories are hoisted above the rest of the module, so they can't
// close over ordinary top-level consts (TDZ at the time the factory runs).
// vi.hoisted() lifts this fixture data alongside the mock so both run first.

const { mockPlugins, mockCategories } = vi.hoisted(() => {
  function plugin(overrides: Partial<import("@harness-kit/marketplace-data").MarketplacePlugin> = {}) {
    return {
      name: "Research",
      slug: "research",
      description: "Process any source into a knowledge base",
      version: "0.3.0",
      author: "harnessprotocol",
      license: "Apache-2.0",
      category: "research-knowledge",
      tags: ["research", "knowledge-base"],
      repoPath: "./plugins/research",
      sourceId: "first-party",
      installCommand: "/plugin install research@harness-kit",
      requiresEnv: [],
      mcp: null,
      skills: [
        { dir: "research", name: "Research Skill", description: "", body: "# Research Skill\n\nUse this to research any topic." },
      ],
      security: {
        status: "passed",
        trust: "verified",
        summary: "No issues found.",
        scanDate: "2026-07-01T00:00:00Z",
        criticalCount: 0,
        warningCount: 0,
        infoCount: 0,
        permissions: { networkAccess: false, fileWrites: false, envVarReads: [], externalUrls: [], filesystemPatterns: [] },
        findings: [],
      },
      ...overrides,
    };
  }

  const mockPlugins = [
    plugin(),
    plugin({
      name: "Explain",
      slug: "explain",
      description: "Structured code explainer",
      version: "0.2.0",
      category: "code-quality",
      tags: [],
      skills: [],
      security: {
        status: "not_scanned", trust: "unscanned", summary: "", scanDate: "",
        criticalCount: 0, warningCount: 0, infoCount: 0,
        permissions: { networkAccess: false, fileWrites: false, envVarReads: [], externalUrls: [], filesystemPatterns: [] },
        findings: [],
      },
    }),
    plugin({
      name: "Data Lineage",
      slug: "data-lineage",
      description: "Trace column-level data lineage",
      version: "0.2.0",
      category: "research-knowledge",
      tags: [],
      skills: [],
    }),
  ];

  const mockCategories = [
    { slug: "research-knowledge", name: "Research & Knowledge", displayOrder: 1 },
    { slug: "code-quality", name: "Code Quality", displayOrder: 2 },
  ];

  return { mockPlugins, mockCategories };
});

vi.mock("../../../lib/marketplace/data", () => ({
  getAllPlugins: () => mockPlugins,
  getCategories: () => mockCategories,
  getCategoryName: (slug: string) => mockCategories.find((c) => c.slug === slug)?.name ?? slug,
  getAllTags: () => [...new Set(mockPlugins.flatMap((p) => p.tags))].sort(),
  getPlugin: (slug: string) => mockPlugins.find((p) => p.slug === slug),
  pluginRepoUrl: (p: MarketplacePlugin) => `https://github.com/harnessprotocol/harness-kit/tree/main/${p.repoPath.replace(/^\.\//, "")}`,
  relatedPlugins: (p: MarketplacePlugin, limit = 5) =>
    mockPlugins.filter((c) => c.slug !== p.slug && c.category === p.category).slice(0, limit),
}));

// ── Render helper ────────────────────────────────────────────

function renderMarketplace(initialPath = "/marketplace") {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/marketplace/:slug?" element={<MarketplacePage />} />
      </Routes>
    </MemoryRouter>,
  );
}

// ── Tests: list panel ─────────────────────────────────────────

describe("MarketplacePage — list panel", () => {
  it("renders the page header", () => {
    renderMarketplace();
    expect(screen.getByText("Browse Plugins")).toBeInTheDocument();
  });

  it("renders all plugins immediately — no loading state (data is bundled, not fetched)", () => {
    renderMarketplace();
    expect(screen.getByText("Research")).toBeInTheDocument();
    expect(screen.getByText("Explain")).toBeInTheDocument();
    expect(screen.getByText("Data Lineage")).toBeInTheDocument();
    expect(screen.queryByText("Loading…")).not.toBeInTheDocument();
  });

  it("shows plugin description", () => {
    renderMarketplace();
    expect(screen.getByText("Process any source into a knowledge base")).toBeInTheDocument();
  });

  it("shows version", () => {
    renderMarketplace();
    expect(screen.getByText("v0.3.0")).toBeInTheDocument();
  });

  it("shows trust badges reflecting the real security scan status", () => {
    renderMarketplace();
    expect(screen.getAllByText("verified").length).toBeGreaterThan(0);
    expect(screen.getAllByText("unscanned").length).toBeGreaterThan(0);
  });

  it("shows category badges", () => {
    renderMarketplace();
    expect(screen.getAllByText("Research & Knowledge").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Code Quality").length).toBeGreaterThan(0);
  });

  it("shows the empty-detail state when no plugin is selected", () => {
    renderMarketplace();
    expect(screen.getByText("Select a plugin to view details")).toBeInTheDocument();
  });

  describe("search", () => {
    it("filters plugins by search query", () => {
      renderMarketplace();
      fireEvent.change(screen.getByPlaceholderText("Search plugins…"), { target: { value: "lineage" } });
      expect(screen.queryByText("Research")).not.toBeInTheDocument();
      expect(screen.queryByText("Explain")).not.toBeInTheDocument();
      expect(screen.getByText("Data Lineage")).toBeInTheDocument();
    });

    it("shows no-plugins-found when search matches nothing", () => {
      renderMarketplace();
      fireEvent.change(screen.getByPlaceholderText("Search plugins…"), { target: { value: "xyznotreal" } });
      expect(screen.getByText("No plugins found")).toBeInTheDocument();
    });

    it("filters case-insensitively", () => {
      renderMarketplace();
      fireEvent.change(screen.getByPlaceholderText("Search plugins…"), { target: { value: "RESEARCH" } });
      expect(screen.getByText("Research")).toBeInTheDocument();
    });

    it("matches on description text", () => {
      renderMarketplace();
      fireEvent.change(screen.getByPlaceholderText("Search plugins…"), { target: { value: "column-level" } });
      expect(screen.getByText("Data Lineage")).toBeInTheDocument();
      expect(screen.queryByText("Research")).not.toBeInTheDocument();
    });
  });

  describe("category filter", () => {
    // "Code Quality" / "Research & Knowledge" text also appears as a
    // per-row CategoryBadge, so queries target the filter pill specifically
    // by role (the badges are <span>s with role="status", not buttons).
    it("renders category pills", () => {
      renderMarketplace();
      expect(screen.getByRole("button", { name: "Research & Knowledge" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Code Quality" })).toBeInTheDocument();
    });

    it("filters plugins when a category pill is clicked", () => {
      renderMarketplace();
      fireEvent.click(screen.getByRole("button", { name: "Code Quality" }));
      expect(screen.queryByText("Research")).not.toBeInTheDocument();
      expect(screen.queryByText("Data Lineage")).not.toBeInTheDocument();
      expect(screen.getByText("Explain")).toBeInTheDocument();
    });

    it("clears category filter when the active pill is clicked again", () => {
      renderMarketplace();
      const pill = screen.getByRole("button", { name: "Code Quality" });
      fireEvent.click(pill);
      expect(screen.queryByText("Research")).not.toBeInTheDocument();
      fireEvent.click(pill);
      expect(screen.getByText("Research")).toBeInTheDocument();
    });

    it("sets aria-pressed correctly", () => {
      renderMarketplace();
      const pill = screen.getByRole("button", { name: "Code Quality" });
      expect(pill).toHaveAttribute("aria-pressed", "false");
      fireEvent.click(pill);
      expect(pill).toHaveAttribute("aria-pressed", "true");
    });
  });

  describe("sorting", () => {
    it("sorts alphabetically by name (no fake install-count or recency data to sort by)", () => {
      renderMarketplace();
      const rows = document.querySelectorAll(".row-list-item");
      const names = Array.from(rows).map((r) => r.querySelector("span")?.textContent);
      expect(names).toEqual(["Data Lineage", "Explain", "Research"]);
    });
  });

  describe("plugin count", () => {
    it("shows total plugin count", () => {
      renderMarketplace();
      expect(screen.getByText("3 plugins")).toBeInTheDocument();
    });

    it("shows '1 plugin' (singular) when only one plugin matches", () => {
      renderMarketplace();
      fireEvent.change(screen.getByPlaceholderText("Search plugins…"), { target: { value: "research" } });
      expect(screen.getByText("1 plugin")).toBeInTheDocument();
    });
  });
});

// ── Tests: detail panel ───────────────────────────────────────

describe("MarketplacePage — detail panel", () => {
  describe("plugin selection", () => {
    it("shows detail panel when a plugin is clicked", () => {
      renderMarketplace();
      fireEvent.click(screen.getByText("Research").closest("button")!);
      expect(screen.getAllByText("Process any source into a knowledge base").length).toBeGreaterThan(0);
    });

    it("highlights the selected plugin row", () => {
      renderMarketplace();
      const row = screen.getByText("Research").closest("button")!;
      fireEvent.click(row);
      expect(row).toHaveClass("selected");
    });

    it("returns to empty state when close button is clicked", () => {
      renderMarketplace();
      fireEvent.click(screen.getByText("Research").closest("button")!);
      fireEvent.click(screen.getByLabelText("Close detail panel"));
      expect(screen.getByText("Select a plugin to view details")).toBeInTheDocument();
    });
  });

  describe("deep-link — direct navigation to /marketplace/research", () => {
    it("renders both panels when navigating directly to a plugin URL", () => {
      renderMarketplace("/marketplace/research");
      expect(screen.getByText("Browse Plugins")).toBeInTheDocument();
      expect(screen.getByText("/plugin install research@harness-kit")).toBeInTheDocument();
    });
  });

  describe("detail content", () => {
    it("renders version, license, and install command", () => {
      renderMarketplace("/marketplace/research");
      expect(screen.getAllByText("v0.3.0").length).toBeGreaterThan(0);
      expect(screen.getByText("Apache-2.0")).toBeInTheDocument();
      expect(screen.getByText("/plugin install research@harness-kit")).toBeInTheDocument();
    });

    it("renders the real security scan summary", () => {
      renderMarketplace("/marketplace/research");
      expect(screen.getByText("No issues found.")).toBeInTheDocument();
    });

    it("renders author name", () => {
      renderMarketplace("/marketplace/research");
      expect(screen.getByText("harnessprotocol")).toBeInTheDocument();
    });

    it("renders GitHub link built from repoPath", () => {
      renderMarketplace("/marketplace/research");
      const link = screen.getByText("View on GitHub");
      expect(link.closest("a")).toHaveAttribute(
        "href",
        "https://github.com/harnessprotocol/harness-kit/tree/main/plugins/research",
      );
    });
  });

  describe("skills", () => {
    it("renders a markdown panel per skill using the skill name as title", () => {
      renderMarketplace("/marketplace/research");
      // Appears twice: once as MarkdownPanel's title label, once as the
      // rendered "# Research Skill" heading inside the skill body itself.
      expect(screen.getAllByText("Research Skill").length).toBeGreaterThan(0);
    });

    it("renders no skill panels for a plugin with no skills", () => {
      renderMarketplace("/marketplace/explain");
      expect(screen.queryByText("Research Skill")).not.toBeInTheDocument();
    });
  });

  describe("tags in detail panel", () => {
    it("renders tags", () => {
      renderMarketplace("/marketplace/research");
      expect(screen.getByText("knowledge-base")).toBeInTheDocument();
    });

    it("clicking a tag filters the list inline", () => {
      renderMarketplace("/marketplace/research");
      fireEvent.click(screen.getByText("knowledge-base"));
      expect(screen.getByText("Filtered by tag:")).toBeInTheDocument();
    });

    it("does not render a tags row when the plugin has no tags", () => {
      renderMarketplace("/marketplace/explain");
      expect(screen.queryByText("knowledge-base")).not.toBeInTheDocument();
    });
  });

  describe("related plugins", () => {
    it("shows other plugins in the same category", () => {
      renderMarketplace("/marketplace/research");
      // Appears twice: once in the still-visible master list, once in the
      // detail panel's "Related" sidebar.
      expect(screen.getAllByText("Data Lineage").length).toBeGreaterThan(0);
    });

    it("does not show a Related section when no other plugin shares the category", () => {
      renderMarketplace("/marketplace/explain");
      expect(screen.queryByText("Related")).not.toBeInTheDocument();
    });
  });

  describe("not found state", () => {
    it("shows not-found message when the plugin does not exist", () => {
      renderMarketplace("/marketplace/nonexistent");
      expect(screen.getByText("Plugin not found.")).toBeInTheDocument();
    });
  });
});
