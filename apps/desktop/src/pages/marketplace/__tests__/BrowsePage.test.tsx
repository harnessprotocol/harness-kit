import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import type { Component, Category } from "@harness-kit/shared";
import BrowsePage from "../BrowsePage";

// ── Fixtures ─────────────────────────────────────────────────

const mockComponents: Component[] = [
  {
    id: "comp-1",
    slug: "research",
    name: "Research",
    type: "plugin",
    description: "Process any source into a knowledge base",
    trust_tier: "official",
    version: "0.3.0",
    author: { name: "harnessprotocol" },
    license: "Apache-2.0",
    skill_md: null,
    readme_md: null,
    repo_url: "https://github.com/harnessprotocol/harness-kit",
    install_count: 500,
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-06-01T00:00:00Z",
  },
  {
    id: "comp-2",
    slug: "explain",
    name: "Explain",
    type: "skill",
    description: "Structured code explainer",
    trust_tier: "verified",
    version: "0.2.0",
    author: { name: "harnessprotocol" },
    license: "Apache-2.0",
    skill_md: null,
    readme_md: null,
    repo_url: null,
    install_count: 200,
    created_at: "2024-02-01T00:00:00Z",
    updated_at: "2024-03-01T00:00:00Z",
  },
  {
    id: "comp-3",
    slug: "data-lineage",
    name: "Data Lineage",
    type: "agent",
    description: "Trace column-level data lineage",
    trust_tier: "community",
    version: "0.2.0",
    author: { name: "harnessprotocol" },
    license: "Apache-2.0",
    skill_md: null,
    readme_md: null,
    repo_url: null,
    install_count: 100,
    created_at: "2024-03-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
  },
];

const mockCategories: Category[] = [
  { id: "cat-1", slug: "research-knowledge", name: "Research & Knowledge", display_order: 1 },
  { id: "cat-2", slug: "code-quality", name: "Code Quality", display_order: 2 },
];

const mockComponentCategories = [
  { component_id: "comp-1", category_id: "cat-1" },
  { component_id: "comp-2", category_id: "cat-2" },
  { component_id: "comp-3", category_id: "cat-1" },
];

const mockTags = [
  { id: "tag-1", slug: "research" },
  { id: "tag-2", slug: "knowledge-base" },
];

const mockComponentTags = [
  { component_id: "comp-1", tag_id: "tag-1" },
  { component_id: "comp-1", tag_id: "tag-2" },
];

// ── Supabase mock ─────────────────────────────────────────────
// Variable name starts with "mock" — required for Vitest hoisting to allow
// access inside the vi.mock factory.

let mockSupabase: Record<string, unknown> | null;

vi.mock("../../../lib/supabase", () => ({
  get supabase() {
    return mockSupabase;
  },
}));

function createBuilder(data: unknown, error: unknown = null) {
  const promise = Promise.resolve({ data, error });
  const builder: Record<string, unknown> = {};
  builder.select = () => builder;
  builder.order = () => builder;
  builder.eq = () => builder;
  builder.neq = () => builder;
  builder.limit = () => builder;
  builder.single = vi.fn().mockResolvedValue({
    data: Array.isArray(data) ? (data[0] ?? null) : data,
    error,
  });
  builder.then = (
    ful: Parameters<Promise<unknown>["then"]>[0],
    rej?: Parameters<Promise<unknown>["then"]>[1],
  ) => promise.then(ful, rej);
  builder.catch = (rej: Parameters<Promise<unknown>["catch"]>[0]) => promise.catch(rej);
  builder.finally = (fin: Parameters<Promise<unknown>["finally"]>[0]) =>
    promise.finally(fin);
  return builder;
}

const tableData: Record<string, unknown> = {
  components: mockComponents,
  categories: mockCategories,
  component_categories: mockComponentCategories,
  component_tags: mockComponentTags,
  tags: mockTags,
};

function makeMockClient() {
  return {
    from: vi.fn().mockImplementation((table: string) =>
      createBuilder(tableData[table] ?? []),
    ),
  };
}

// ── Render helpers ────────────────────────────────────────────

function renderBrowse(initialPath = "/marketplace") {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <BrowsePage />
    </MemoryRouter>,
  );
}

/** Wraps in Routes so navigate() actually changes the rendered page. */
function renderBrowseWithRoutes(initialPath = "/marketplace") {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/marketplace" element={<BrowsePage />} />
        <Route
          path="/marketplace/:slug"
          element={<div data-testid="detail-page">detail</div>}
        />
      </Routes>
    </MemoryRouter>,
  );
}

// ── Tests ─────────────────────────────────────────────────────

describe("BrowsePage — not configured", () => {
  beforeEach(() => {
    mockSupabase = null;
  });

  it("shows not-configured message when supabase is null", () => {
    renderBrowse();
    expect(screen.getByText(/Supabase not configured/i)).toBeInTheDocument();
  });

  it("shows env var instructions", () => {
    renderBrowse();
    expect(screen.getByText("VITE_SUPABASE_URL")).toBeInTheDocument();
    expect(screen.getByText("VITE_SUPABASE_ANON_KEY")).toBeInTheDocument();
  });

  it("renders the page header", () => {
    renderBrowse();
    expect(screen.getByText("Browse Plugins")).toBeInTheDocument();
  });

  it("does not show Loading spinner", () => {
    renderBrowse();
    expect(screen.queryByText("Loading…")).not.toBeInTheDocument();
  });
});

describe("BrowsePage — configured", () => {
  beforeEach(() => {
    mockSupabase = makeMockClient();
  });

  describe("loading state", () => {
    it("shows loading indicator before data arrives", () => {
      renderBrowse();
      expect(screen.getByText("Loading…")).toBeInTheDocument();
    });

    it("hides loading indicator after data loads", async () => {
      renderBrowse();
      await waitFor(() =>
        expect(screen.queryByText("Loading…")).not.toBeInTheDocument(),
      );
    });
  });

  describe("plugin list", () => {
    it("renders all plugins after loading", async () => {
      renderBrowse();
      expect(await screen.findByText("Research")).toBeInTheDocument();
      expect(screen.getByText("Explain")).toBeInTheDocument();
      expect(screen.getByText("Data Lineage")).toBeInTheDocument();
    });

    it("shows plugin description", async () => {
      renderBrowse();
      expect(
        await screen.findByText("Process any source into a knowledge base"),
      ).toBeInTheDocument();
    });

    it("shows version", async () => {
      renderBrowse();
      expect(await screen.findByText("v0.3.0")).toBeInTheDocument();
    });

    it("shows install count", async () => {
      renderBrowse();
      expect(await screen.findByText("500 installs")).toBeInTheDocument();
    });

    it("shows trust badge for official plugins", async () => {
      renderBrowse();
      expect(await screen.findByText("official")).toBeInTheDocument();
    });

    it("shows trust badge for verified plugins", async () => {
      renderBrowse();
      expect(await screen.findByText("verified")).toBeInTheDocument();
    });

    it("shows type badges", async () => {
      renderBrowse();
      await screen.findByText("Research");
      // "plugin" badge appears for Research (comp-1), "skill" badge for Explain (comp-2)
      expect(screen.getAllByText("plugin").length).toBeGreaterThan(0);
      expect(screen.getAllByText("skill").length).toBeGreaterThan(0);
      expect(screen.getAllByText("agent").length).toBeGreaterThan(0);
    });
  });

  describe("search", () => {
    it("filters plugins by search query", async () => {
      renderBrowse();
      await screen.findByText("Research");

      fireEvent.change(screen.getByPlaceholderText("Search plugins…"), {
        target: { value: "lineage" },
      });

      expect(screen.queryByText("Research")).not.toBeInTheDocument();
      expect(screen.queryByText("Explain")).not.toBeInTheDocument();
      expect(screen.getByText("Data Lineage")).toBeInTheDocument();
    });

    it("shows empty state when search matches nothing", async () => {
      renderBrowse();
      await screen.findByText("Research");

      fireEvent.change(screen.getByPlaceholderText("Search plugins…"), {
        target: { value: "xyznotreal" },
      });

      expect(screen.getByText("No plugins found.")).toBeInTheDocument();
    });

    it("filters case-insensitively", async () => {
      renderBrowse();
      await screen.findByText("Research");

      fireEvent.change(screen.getByPlaceholderText("Search plugins…"), {
        target: { value: "RESEARCH" },
      });

      expect(screen.getByText("Research")).toBeInTheDocument();
    });

    it("matches on description text", async () => {
      renderBrowse();
      await screen.findByText("Research");

      fireEvent.change(screen.getByPlaceholderText("Search plugins…"), {
        target: { value: "column-level" },
      });

      expect(screen.getByText("Data Lineage")).toBeInTheDocument();
      expect(screen.queryByText("Research")).not.toBeInTheDocument();
    });
  });

  describe("category filter", () => {
    it("renders category pills from the database", async () => {
      renderBrowse();
      expect(await screen.findByText("Research & Knowledge")).toBeInTheDocument();
      expect(screen.getByText("Code Quality")).toBeInTheDocument();
    });

    it("filters plugins when a category pill is clicked", async () => {
      renderBrowse();
      fireEvent.click(await screen.findByText("Code Quality"));

      await waitFor(() => {
        expect(screen.queryByText("Research")).not.toBeInTheDocument();
        expect(screen.queryByText("Data Lineage")).not.toBeInTheDocument();
      });
      expect(screen.getByText("Explain")).toBeInTheDocument();
    });

    it("clears category filter when the active pill is clicked again", async () => {
      renderBrowse();
      const pill = await screen.findByText("Code Quality");

      fireEvent.click(pill); // activate
      await waitFor(() => expect(screen.queryByText("Research")).not.toBeInTheDocument());

      fireEvent.click(pill); // deactivate
      await waitFor(() => expect(screen.getByText("Research")).toBeInTheDocument());
    });

    it("sets aria-pressed=true on the active category pill", async () => {
      renderBrowse();
      const pill = await screen.findByText("Code Quality");
      fireEvent.click(pill);
      expect(pill).toHaveAttribute("aria-pressed", "true");
    });

    it("sets aria-pressed=false on inactive pills", async () => {
      renderBrowse();
      const pill = await screen.findByText("Code Quality");
      expect(pill).toHaveAttribute("aria-pressed", "false");
    });
  });

  describe("type filter", () => {
    it("renders type filter pills", async () => {
      renderBrowse();
      await screen.findByText("Research");
      expect(screen.getByRole("button", { name: "hook" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "script" })).toBeInTheDocument();
    });

    it("filters by component type", async () => {
      renderBrowse();
      await screen.findByText("Research");

      // The "agent" type pill — role=button with name "agent"
      fireEvent.click(screen.getByRole("button", { name: "agent" }));

      await waitFor(() => {
        expect(screen.queryByText("Research")).not.toBeInTheDocument();
        expect(screen.queryByText("Explain")).not.toBeInTheDocument();
      });
      expect(screen.getByText("Data Lineage")).toBeInTheDocument();
    });

    it("filters to plugin-type components when plugin pill is clicked", async () => {
      renderBrowse();
      await screen.findByText("Research");

      fireEvent.click(screen.getByRole("button", { name: "plugin" }));

      await waitFor(() => {
        expect(screen.queryByText("Explain")).not.toBeInTheDocument();
        expect(screen.queryByText("Data Lineage")).not.toBeInTheDocument();
      });
      expect(screen.getByText("Research")).toBeInTheDocument();
    });

    it("clears type filter on second click", async () => {
      renderBrowse();
      await screen.findByText("Research");

      const agentPill = screen.getByRole("button", { name: "agent" });
      fireEvent.click(agentPill);
      await waitFor(() => expect(screen.queryByText("Research")).not.toBeInTheDocument());

      fireEvent.click(agentPill);
      await waitFor(() => expect(screen.getByText("Research")).toBeInTheDocument());
    });

    it("sets aria-pressed=true on active type pill", async () => {
      renderBrowse();
      await screen.findByText("Research");

      const agentPill = screen.getByRole("button", { name: "agent" });
      fireEvent.click(agentPill);
      expect(agentPill).toHaveAttribute("aria-pressed", "true");
    });
  });

  describe("tag filter from URL", () => {
    it("shows active tag banner when ?tag= is in the URL", async () => {
      renderBrowse("/marketplace?tag=research");
      expect(await screen.findByText("Filtered by tag:")).toBeInTheDocument();
      expect(screen.getByText("research")).toBeInTheDocument();
    });

    it("filters plugins to those matching the tag", async () => {
      renderBrowse("/marketplace?tag=research");
      // comp-1 has tag "research", comp-2 and comp-3 do not
      expect(await screen.findByText("Research")).toBeInTheDocument();
      expect(screen.queryByText("Explain")).not.toBeInTheDocument();
      expect(screen.queryByText("Data Lineage")).not.toBeInTheDocument();
    });

    it("clears tag filter when the clear button is clicked", async () => {
      renderBrowse("/marketplace?tag=research");
      await screen.findByText("Research");

      fireEvent.click(screen.getByText("✕ clear"));

      await waitFor(() =>
        expect(screen.queryByText("Filtered by tag:")).not.toBeInTheDocument(),
      );
      expect(screen.getByText("Explain")).toBeInTheDocument();
      expect(screen.getByText("Data Lineage")).toBeInTheDocument();
    });
  });

  describe("sorting", () => {
    it("defaults to sorting by install count — highest first", async () => {
      renderBrowse();
      await screen.findByText("Research"); // wait for load

      const items = screen.getAllByText(/installs$/);
      const counts = items.map((el) =>
        parseInt(el.textContent!.replace(/[^0-9]/g, ""), 10),
      );
      // Each count should be >= the next
      for (let i = 0; i < counts.length - 1; i++) {
        expect(counts[i]).toBeGreaterThanOrEqual(counts[i + 1]);
      }
    });

    it("switches to sorting by most recently updated when Recent is clicked", async () => {
      renderBrowse();
      await screen.findByText("Research");

      fireEvent.click(screen.getByText("Recent"));

      await waitFor(() => {
        // After sorting by recent: Research (Jun) > Explain (Mar) > Data Lineage (Jan)
        // Research should appear before Data Lineage in the DOM
        const all = document.querySelectorAll(".row-list-item");
        let researchIdx = -1;
        let dataLineageIdx = -1;
        all.forEach((el, i) => {
          if (el.textContent?.includes("Research") && !el.textContent?.includes("Data")) {
            researchIdx = i;
          }
          if (el.textContent?.includes("Data Lineage")) {
            dataLineageIdx = i;
          }
        });
        expect(researchIdx).toBeLessThan(dataLineageIdx);
      });
    });
  });

  describe("plugin count", () => {
    it("shows total plugin count", async () => {
      renderBrowse();
      expect(await screen.findByText("3 plugins")).toBeInTheDocument();
    });

    it("shows '1 plugin' (singular) when only one plugin matches", async () => {
      renderBrowse();
      await screen.findByText("Research");

      fireEvent.change(screen.getByPlaceholderText("Search plugins…"), {
        target: { value: "research" },
      });

      expect(screen.getByText("1 plugin")).toBeInTheDocument();
    });
  });

  describe("navigation", () => {
    it("navigates to plugin detail page when a plugin row is clicked", async () => {
      renderBrowseWithRoutes();
      const row = await screen.findByText("Research");
      fireEvent.click(row.closest("button")!);

      expect(await screen.findByTestId("detail-page")).toBeInTheDocument();
    });
  });

  describe("error state", () => {
    it("shows error message when Supabase returns an error", async () => {
      mockSupabase = {
        from: vi.fn().mockReturnValue(
          createBuilder(null, { message: "Connection refused" }),
        ),
      };

      renderBrowse();
      expect(await screen.findByText("Connection refused")).toBeInTheDocument();
    });

    it("does not show plugin list on error", async () => {
      mockSupabase = {
        from: vi.fn().mockReturnValue(
          createBuilder(null, { message: "Error" }),
        ),
      };

      renderBrowse();
      await screen.findByText("Error");
      expect(screen.queryByText("Loading…")).not.toBeInTheDocument();
    });
  });
});
