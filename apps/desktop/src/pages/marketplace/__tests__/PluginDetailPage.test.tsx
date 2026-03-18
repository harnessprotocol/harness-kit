import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import type { Component } from "@harness-kit/shared";
import PluginDetailPage from "../PluginDetailPage";

// ── Fixtures ─────────────────────────────────────────────────

const mockComponent: Component = {
  id: "comp-1",
  slug: "research",
  name: "Research",
  type: "skill",
  description: "Process any source into a structured knowledge base",
  trust_tier: "official",
  version: "0.3.0",
  author: { name: "harnessprotocol", url: "https://github.com/harnessprotocol" },
  license: "Apache-2.0",
  skill_md: "# Research Skill\n\nUse this to research any topic.",
  readme_md: "## Usage\n\nInstall and invoke with `/research`.",
  repo_url: "https://github.com/harnessprotocol/harness-kit",
  install_count: 500,
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-06-01T00:00:00Z",
};

const mockTags = ["research", "knowledge-base"];

const mockRelated: Pick<Component, "id" | "slug" | "name" | "install_count">[] = [
  { id: "comp-2", slug: "orient", name: "Orient", install_count: 150 },
];

// ── Supabase mock ─────────────────────────────────────────────

let mockSupabase: Record<string, unknown> | null;

vi.mock("../../../lib/supabase", () => ({
  get supabase() {
    return mockSupabase;
  },
}));

function createBuilder(data: unknown, error: unknown = null) {
  const singleData = Array.isArray(data) ? (data[0] ?? null) : data;
  const promise = Promise.resolve({ data, error });
  const builder: Record<string, unknown> = {};
  builder.select = () => builder;
  builder.order = () => builder;
  builder.eq = () => builder;
  builder.neq = () => builder;
  builder.limit = () => builder;
  builder.single = vi.fn().mockResolvedValue({ data: singleData, error });
  builder.then = (
    ful: Parameters<Promise<unknown>["then"]>[0],
    rej?: Parameters<Promise<unknown>["then"]>[1],
  ) => promise.then(ful, rej);
  builder.catch = (rej: Parameters<Promise<unknown>["catch"]>[0]) => promise.catch(rej);
  builder.finally = (fin: Parameters<Promise<unknown>["finally"]>[0]) =>
    promise.finally(fin);
  return builder;
}

/** Creates a mock client that returns realistic data for the detail page queries. */
function makeMockClient(overrides: {
  component?: Component | null;
  tags?: typeof mockTags;
  related?: typeof mockRelated;
  componentError?: { message: string } | null;
} = {}) {
  const {
    component = mockComponent,
    tags = mockTags,
    related = mockRelated,
    componentError = null,
  } = overrides;

  const tagRows = tags.map((slug, i) => ({
    tag_id: `tag-${i}`,
    tags: { slug },
  }));

  let componentCallCount = 0;

  return {
    from: vi.fn().mockImplementation((table: string) => {
      if (table === "components") {
        componentCallCount++;
        if (componentCallCount % 2 === 1) {
          // Odd calls (1st, 3rd, …): fetch by slug (.single())
          const builder = createBuilder(component, componentError);
          builder.single = vi
            .fn()
            .mockResolvedValue({ data: component, error: componentError });
          return builder;
        }
        // Even calls (2nd, 4th, …): related components
        return createBuilder(related);
      }
      if (table === "component_tags") {
        return createBuilder(tagRows);
      }
      return createBuilder([]);
    }),
  };
}

// ── Render helper ─────────────────────────────────────────────

function renderDetail(slug = "research") {
  return render(
    <MemoryRouter initialEntries={[`/marketplace/${slug}`]}>
      <Routes>
        <Route path="/marketplace/:slug" element={<PluginDetailPage />} />
        <Route
          path="/marketplace"
          element={<div data-testid="browse-page">browse</div>}
        />
      </Routes>
    </MemoryRouter>,
  );
}

// ── Tests ─────────────────────────────────────────────────────

describe("PluginDetailPage — not configured", () => {
  beforeEach(() => {
    mockSupabase = null;
  });

  it("shows not-configured message", () => {
    renderDetail();
    expect(screen.getByText(/Supabase not configured/i)).toBeInTheDocument();
  });

  it("shows back button", () => {
    renderDetail();
    expect(screen.getByText("← Plugins")).toBeInTheDocument();
  });

  it("does not show loading spinner", () => {
    renderDetail();
    expect(screen.queryByText("Loading…")).not.toBeInTheDocument();
  });
});

describe("PluginDetailPage — configured", () => {
  describe("loading state", () => {
    beforeEach(() => {
      mockSupabase = makeMockClient();
    });

    it("shows loading spinner initially", () => {
      renderDetail();
      expect(screen.getByText("Loading…")).toBeInTheDocument();
    });

    it("hides spinner after data loads", async () => {
      renderDetail();
      await waitFor(() =>
        expect(screen.queryByText("Loading…")).not.toBeInTheDocument(),
      );
    });
  });

  describe("not found state", () => {
    beforeEach(() => {
      mockSupabase = makeMockClient({ component: null });
    });

    it("shows not found message when plugin does not exist", async () => {
      renderDetail("nonexistent");
      expect(await screen.findByText("Plugin not found.")).toBeInTheDocument();
    });

    it("shows back button in not-found state", async () => {
      renderDetail("nonexistent");
      await screen.findByText("Plugin not found.");
      expect(screen.getByText("← Plugins")).toBeInTheDocument();
    });
  });

  describe("plugin details", () => {
    beforeEach(() => {
      mockSupabase = makeMockClient();
    });

    it("renders plugin name", async () => {
      renderDetail();
      expect(await screen.findByText("Research")).toBeInTheDocument();
    });

    it("renders plugin description", async () => {
      renderDetail();
      expect(
        await screen.findByText("Process any source into a structured knowledge base"),
      ).toBeInTheDocument();
    });

    it("renders install count", async () => {
      renderDetail();
      expect(await screen.findByText("500 installs")).toBeInTheDocument();
    });

    it("renders version", async () => {
      renderDetail();
      expect(await screen.findByText("v0.3.0")).toBeInTheDocument();
    });

    it("renders license", async () => {
      renderDetail();
      expect(await screen.findByText("Apache-2.0")).toBeInTheDocument();
    });

    it("renders updated date", async () => {
      renderDetail();
      // The exact date string depends on timezone; assert the "Updated …" prefix is present
      expect(await screen.findByText(/^Updated .+, 2024$/)).toBeInTheDocument();
    });
  });

  describe("badges", () => {
    beforeEach(() => {
      mockSupabase = makeMockClient();
    });

    it("renders trust badge", async () => {
      renderDetail();
      expect(await screen.findByText("official")).toBeInTheDocument();
    });

    it("renders type badge", async () => {
      renderDetail();
      expect(await screen.findByText("skill")).toBeInTheDocument();
    });

    it("renders verified badge for verified tier", async () => {
      mockSupabase = makeMockClient({
        component: { ...mockComponent, trust_tier: "verified" },
      });
      renderDetail();
      expect(await screen.findByText("verified")).toBeInTheDocument();
    });
  });

  describe("tags", () => {
    beforeEach(() => {
      mockSupabase = makeMockClient();
    });

    it("renders tags from the database", async () => {
      renderDetail();
      expect(await screen.findByText("research")).toBeInTheDocument();
      expect(screen.getByText("knowledge-base")).toBeInTheDocument();
    });

    it("navigates to browse page with tag filter when a tag is clicked", async () => {
      renderDetail();
      await screen.findByText("research");
      fireEvent.click(screen.getByText("research"));

      expect(await screen.findByTestId("browse-page")).toBeInTheDocument();
    });

    it("does not render tags section when plugin has no tags", async () => {
      mockSupabase = makeMockClient({ tags: [] });
      renderDetail();
      await screen.findByText("Research");
      // With no tags, the tag buttons should not appear
      expect(screen.queryByText("research")).not.toBeInTheDocument();
    });
  });

  describe("markdown content", () => {
    beforeEach(() => {
      mockSupabase = makeMockClient();
    });

    it("renders SKILL.md section heading for single-skill package", async () => {
      renderDetail();
      expect(await screen.findByText("Skill Definition")).toBeInTheDocument();
    });

    it("renders SKILL.md content", async () => {
      renderDetail();
      // "Research Skill" comes from skill_md "# Research Skill\n..."
      expect(await screen.findByText("Research Skill")).toBeInTheDocument();
    });

    it("renders README section heading", async () => {
      renderDetail();
      expect(await screen.findByText("Documentation")).toBeInTheDocument();
    });

    it("renders README content", async () => {
      renderDetail();
      // "Usage" comes from readme_md "## Usage\n..."
      expect(await screen.findByText("Usage")).toBeInTheDocument();
    });

    it("does not render SKILL.md section when skill_md is null", async () => {
      mockSupabase = makeMockClient({
        component: { ...mockComponent, skill_md: null },
      });
      renderDetail();
      await screen.findByText("Research");
      expect(screen.queryByText("Skill Definition")).not.toBeInTheDocument();
    });

    it("renders TOC and named sections for multi-skill packages", async () => {
      const multiSkillMd = [
        "---\nname: harness-compile\ndescription: Compile stuff.\n---\n\n# Harness Compile\n\nCompile content.",
        "---\nname: harness-export\ndescription: Export stuff.\n---\n\n# Harness Export\n\nExport content.",
      ].join("\n\n---\n\n");

      mockSupabase = makeMockClient({
        component: { ...mockComponent, skill_md: multiSkillMd },
      });
      renderDetail();
      await screen.findByText("Research");

      // TOC Contents label and skill links
      expect(screen.getByText("Contents")).toBeInTheDocument();
      expect(screen.getAllByText("Harness Compile").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Harness Export").length).toBeGreaterThan(0);

      // Single-skill heading should not appear
      expect(screen.queryByText("Skill Definition")).not.toBeInTheDocument();
    });

    it("does not render README section when readme_md is null", async () => {
      mockSupabase = makeMockClient({
        component: { ...mockComponent, readme_md: null },
      });
      renderDetail();
      await screen.findByText("Research");
      expect(screen.queryByText("Documentation")).not.toBeInTheDocument();
    });
  });

  describe("sidebar", () => {
    beforeEach(() => {
      mockSupabase = makeMockClient();
    });

    it("shows install command", async () => {
      renderDetail();
      expect(
        await screen.findByText("/plugin install research@harness-kit"),
      ).toBeInTheDocument();
    });

    it("shows author name", async () => {
      renderDetail();
      expect(await screen.findByText("harnessprotocol")).toBeInTheDocument();
    });

    it("shows GitHub link when repo_url is present", async () => {
      renderDetail();
      await screen.findByText("Research");
      const link = screen.getByText("View on GitHub");
      expect(link.closest("a")).toHaveAttribute(
        "href",
        "https://github.com/harnessprotocol/harness-kit",
      );
    });

    it("does not show GitHub link when repo_url is null", async () => {
      mockSupabase = makeMockClient({
        component: { ...mockComponent, repo_url: null },
      });
      renderDetail();
      await screen.findByText("Research");
      expect(screen.queryByText("View on GitHub")).not.toBeInTheDocument();
    });

    it("shows related plugins", async () => {
      renderDetail();
      expect(await screen.findByText("Orient")).toBeInTheDocument();
    });

    it("does not show Related section when no related plugins exist", async () => {
      mockSupabase = makeMockClient({ related: [] });
      renderDetail();
      await screen.findByText("Research");
      expect(screen.queryByText("Related")).not.toBeInTheDocument();
    });
  });

  describe("navigation", () => {
    beforeEach(() => {
      mockSupabase = makeMockClient();
    });

    it("navigates back to browse page when back button is clicked", async () => {
      renderDetail();
      await screen.findByText("Research");
      fireEvent.click(screen.getByText("← Plugins"));

      expect(await screen.findByTestId("browse-page")).toBeInTheDocument();
    });

    it("navigates to related plugin detail when related plugin is clicked", async () => {
      renderDetail();
      await screen.findByText("Orient");
      fireEvent.click(screen.getByText("Orient").closest("button")!);

      // After click, URL should change to /marketplace/orient — which matches our routes
      // Since "orient" route isn't explicitly defined, the detail page re-renders for that slug
      await waitFor(() => {
        expect(screen.queryByTestId("browse-page")).not.toBeInTheDocument();
      });
    });
  });

  describe("error state", () => {
    it("shows not-found message when Supabase throws", async () => {
      mockSupabase = {
        from: vi.fn().mockImplementation(() => {
          throw new Error("Network error");
        }),
      };

      renderDetail();
      expect(await screen.findByText("Plugin not found.")).toBeInTheDocument();
    });
  });
});
