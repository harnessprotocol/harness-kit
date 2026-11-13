import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import OnboardingPage from "../OnboardingPage";
import { loadedDigest } from "../../../lib/loaded-digest";
import type { ImportProjectResult } from "@harness-kit/core";
import { withInventorySections } from "../onboarding-data";
import { ONBOARDING_FIXTURE_RESULT, ONBOARDING_FIXTURE_LOW_COUNT } from "../../__fixtures__/onboarding-fixture-data";

// ── Mocks ──────────────────────────────────────────────────────

const mockImportMachine = vi.fn();

vi.mock("@harness-kit/core", () => ({
  importMachine: (...args: unknown[]) => mockImportMachine(...args),
}));

// AC-56: the file comes from the machine inventory. This stands in for the
// grid's data; it deliberately differs from the adapter scan's servers.
const mockImportPersonalHarness = vi.fn();
vi.mock("../../../lib/personal-inventory", () => ({
  importPersonalHarness: (...args: unknown[]) => mockImportPersonalHarness(...args),
}));
const INVENTORY_CONFIG = {
  version: "1",
  metadata: { name: "inv", description: "d" },
  "mcp-servers": { fromGrid: { transport: "stdio", command: "grid-cmd" } },
} as unknown as ImportProjectResult["harnessConfig"];
const EXPECTED_YAML = withInventorySections(ONBOARDING_FIXTURE_RESULT, INVENTORY_CONFIG).harnessYaml;

vi.mock("@tauri-apps/api/path", () => ({
  homeDir: vi.fn(() => Promise.resolve("/home/user")),
}));

vi.mock("../../../lib/harness-fs", () => ({
  TauriFsProvider: vi.fn().mockImplementation(function (this: unknown, cwd: string) {
    return { cwd: () => cwd };
  }),
}));

const mockWriteHarnessFile = vi.fn();
const mockGrantProjectScope = vi.fn();
const mockReadHarnessFile = vi.fn();
const mockWriteConfigFile = vi.fn();
vi.mock("../../../lib/tauri", () => ({
  writeHarnessFile: (...args: unknown[]) => mockWriteHarnessFile(...args),
  readHarnessFile: (...args: unknown[]) => mockReadHarnessFile(...args),
  writeConfigFile: (...args: unknown[]) => mockWriteConfigFile(...args),
  grantProjectScope: (...args: unknown[]) => mockGrantProjectScope(...args),
}));

vi.mock("../../../lib/project-dir", () => ({
  getCurrentProjectDir: () => null,
}));

// MonacoEditor pulls in the real @monaco-editor/react package, which needs a
// DOM/worker environment jsdom doesn't provide — stub it like other page
// tests do for heavy editor components.
vi.mock("../../../components/plugin-explorer/MonacoEditor", () => ({
  default: ({ content }: { content: string }) => <pre data-testid="monaco-stub">{content}</pre>,
}));

function renderPage(onFinish = vi.fn()) {
  return { onFinish, ...render(<OnboardingPage onFinish={onFinish} />) };
}

describe("OnboardingPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWriteHarnessFile.mockResolvedValue("~/.claude/harness.yaml");
    mockReadHarnessFile.mockResolvedValue({ found: false, content: null, path: null });
    mockWriteConfigFile.mockResolvedValue(undefined);
    mockImportPersonalHarness.mockResolvedValue({ harnessConfig: INVENTORY_CONFIG, harnessYaml: "", inventory: {} });
  });

  it("writes the servers the machine inventory shows, not the adapter scan's (AC-56)", async () => {
    mockImportMachine.mockResolvedValue(ONBOARDING_FIXTURE_RESULT);
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("button", { name: /preview harness\.yaml/i }, { timeout: 3000 }));
    const preview = await screen.findByTestId("monaco-stub");
    expect(preview).toHaveTextContent("fromGrid");
    expect(preview).not.toHaveTextContent("postgres");
    expect(mockImportPersonalHarness).toHaveBeenCalledTimes(1);
  });

  it("runs the scan step then advances to the sprawl reveal with real counts", async () => {
    mockImportMachine.mockResolvedValue(ONBOARDING_FIXTURE_RESULT);
    renderPage();

    // Scan step shows first.
    expect(screen.getByText(/scanning your machine/i)).toBeInTheDocument();

    // The `.` stands in for the curly apostrophe in "They don’t agree."
    await waitFor(
      () => expect(screen.getByText(/They don.t agree\./)).toBeInTheDocument(),
      { timeout: 3000 },
    );

    // Stat row reflects the real fixture data, not fabricated numbers.
    expect(screen.getByText("3")).toBeInTheDocument(); // harnesses found
    expect(screen.getByText(/preview harness\.yaml/i)).toBeInTheDocument();
  });

  it("shows the honest low-harness-count message instead of fake sprawl", async () => {
    mockImportMachine.mockResolvedValue(ONBOARDING_FIXTURE_LOW_COUNT);
    renderPage();

    await waitFor(
      () => expect(screen.getByText(/nothing to reconcile yet/i)).toBeInTheDocument(),
      { timeout: 3000 },
    );
    expect(screen.queryByText(/they don.t agree/i)).not.toBeInTheDocument();
  });

  it("walks reveal -> preview -> confirm and writes harness.yaml only on explicit confirm", async () => {
    mockImportMachine.mockResolvedValue(ONBOARDING_FIXTURE_RESULT);
    const user = userEvent.setup();
    const { onFinish } = renderPage();

    await waitFor(() => expect(screen.getByText(/preview harness\.yaml/i)).toBeInTheDocument(), {
      timeout: 3000,
    });

    // Nothing written yet just from scanning/revealing.
    expect(mockWriteHarnessFile).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /preview harness\.yaml/i }));
    expect(await screen.findByTestId("monaco-stub")).toHaveTextContent("mcp-servers");
    expect(mockWriteHarnessFile).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /^continue$/i }));
    expect(await screen.findByText(/nothing is written until you confirm/i)).toBeInTheDocument();
    expect(mockWriteHarnessFile).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /^write harness\.yaml$/i }));
    await waitFor(() => expect(mockWriteHarnessFile).toHaveBeenCalledWith(EXPECTED_YAML));
    await waitFor(() => expect(onFinish).toHaveBeenCalled());
  });

  it("skip for now finishes without writing anything", async () => {
    mockImportMachine.mockResolvedValue(ONBOARDING_FIXTURE_RESULT);
    const user = userEvent.setup();
    const { onFinish } = renderPage();

    await waitFor(() => expect(screen.getByText(/preview harness\.yaml/i)).toBeInTheDocument(), {
      timeout: 3000,
    });
    await user.click(screen.getByRole("button", { name: /preview harness\.yaml/i }));
    await user.click(await screen.findByRole("button", { name: /^continue$/i }));
    await user.click(await screen.findByRole("button", { name: /skip for now/i }));

    expect(mockWriteHarnessFile).not.toHaveBeenCalled();
    expect(onFinish).toHaveBeenCalled();
  });

  it("shows the scan error with Retry and Skip instead of a blank step", async () => {
    mockImportMachine.mockRejectedValueOnce(new Error("EACCES: ~/.codex"));
    const { onFinish } = renderPage();

    // The scan step no longer renders the error; the failed step is the
    // only place it appears, alongside the actions.
    expect(await screen.findByText(/machine scan did not finish/i)).toBeInTheDocument();
    // The raw error (no "Error:" prefix) waits behind Details (AC-20).
    const raw = screen.getByText("EACCES: ~/.codex");
    expect(raw).not.toBeVisible();
    fireEvent.click(screen.getByText("Details"));
    expect(raw).toBeVisible();
    expect(screen.queryByText(/scanning your machine/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry scan" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Skip setup" })).toBeInTheDocument();
    expect(onFinish).not.toHaveBeenCalled();
  });

  it("Retry scan runs the scan again and reaches the reveal", async () => {
    mockImportMachine.mockResolvedValue(ONBOARDING_FIXTURE_RESULT);
    mockImportMachine.mockRejectedValueOnce(new Error("EACCES: ~/.codex"));
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "Retry scan" }));

    // Retry goes back through the scan step, not straight to the reveal.
    expect(screen.getByText(/scanning your machine/i)).toBeInTheDocument();
    expect(screen.queryByText(/machine scan did not finish/i)).not.toBeInTheDocument();

    await waitFor(() => expect(screen.getByText(/They don.t agree\./)).toBeInTheDocument(), {
      timeout: 3000,
    });
    expect(screen.queryByText(/EACCES/)).not.toBeInTheDocument();
    expect(mockImportMachine).toHaveBeenCalledTimes(2);
  });

  it("Skip setup finishes onboarding without writing", async () => {
    mockImportMachine.mockResolvedValue(ONBOARDING_FIXTURE_RESULT);
    const { onFinish } = renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "Skip setup" }));

    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(mockWriteHarnessFile).not.toHaveBeenCalled();
  });

  it("surfaces a scan error without crashing", async () => {
    mockImportMachine.mockRejectedValue(new Error("permission denied"));
    renderPage();

    await waitFor(() => expect(screen.getByText(/permission denied/i)).toBeInTheDocument(), {
      timeout: 3000,
    });
  });

  describe("existing harness.yaml (AC-51)", () => {
    const TARGET = "~/.claude/harness.yaml";

    async function toConfirm() {
      mockImportMachine.mockResolvedValue(ONBOARDING_FIXTURE_RESULT);
      const user = userEvent.setup();
      const utils = renderPage();
      await waitFor(() => expect(screen.getByText(/preview harness\.yaml/i)).toBeInTheDocument(), {
        timeout: 3000,
      });
      await user.click(screen.getByRole("button", { name: /preview harness\.yaml/i }));
      await user.click(await screen.findByRole("button", { name: /^continue$/i }));
      return { user, ...utils };
    }

    it("writes directly when no file exists", async () => {
      const { user, onFinish } = await toConfirm();
      await user.click(await screen.findByRole("button", { name: /^write harness\.yaml$/i }));
      await waitFor(() => expect(mockWriteHarnessFile).toHaveBeenCalledWith(EXPECTED_YAML));
      expect(mockWriteConfigFile).not.toHaveBeenCalled();
      await waitFor(() => expect(onFinish).toHaveBeenCalled());
    });

    it("skips the write when the existing file is identical", async () => {
      mockReadHarnessFile.mockResolvedValue({
        found: true,
        content: EXPECTED_YAML,
        path: TARGET,
      });
      const { user, onFinish } = await toConfirm();
      await user.click(await screen.findByRole("button", { name: /^write harness\.yaml$/i }));
      await waitFor(() => expect(onFinish).toHaveBeenCalled());
      expect(mockWriteHarnessFile).not.toHaveBeenCalled();
      expect(mockWriteConfigFile).not.toHaveBeenCalled();
    });

    it("differs + Keep existing: no write, no backup", async () => {
      mockReadHarnessFile.mockResolvedValue({ found: true, content: "version: old\n", path: TARGET });
      const { user, onFinish } = await toConfirm();
      await user.click(await screen.findByRole("button", { name: /^write harness\.yaml$/i }));
      expect(await screen.findByRole("button", { name: /^keep existing$/i })).toBeInTheDocument();
      expect(mockWriteHarnessFile).not.toHaveBeenCalled();
      await user.click(screen.getByRole("button", { name: /^keep existing$/i }));
      await waitFor(() => expect(onFinish).toHaveBeenCalled());
      expect(mockWriteHarnessFile).not.toHaveBeenCalled();
      expect(mockWriteConfigFile).not.toHaveBeenCalled();
    });

    it("the Replace dialog says the backup goes to ~/.harness/backups/user, not beside the file", async () => {
      mockReadHarnessFile.mockResolvedValue({ found: true, content: "version: old\n", path: TARGET });
      const { user } = await toConfirm();
      await user.click(await screen.findByRole("button", { name: /^write harness\.yaml$/i }));
      expect(await screen.findByText(/~\/\.harness\/backups\/user\//)).toBeInTheDocument();
      expect(screen.queryByText(/\.bak-/)).not.toBeInTheDocument();
    });

    it("differs + Replace: one write with the shown file's digest, no webview-side backup", async () => {
      mockReadHarnessFile.mockResolvedValue({ found: true, content: "version: old\n", path: TARGET });
      mockWriteHarnessFile.mockResolvedValue(TARGET);
      const { user, onFinish } = await toConfirm();
      await user.click(await screen.findByRole("button", { name: /^write harness\.yaml$/i }));
      await user.click(await screen.findByRole("button", { name: /replace \(backup kept\)/i }));
      await waitFor(() => expect(onFinish).toHaveBeenCalled());
      expect(mockWriteHarnessFile).toHaveBeenCalledTimes(1);
      expect(mockWriteHarnessFile).toHaveBeenCalledWith(
        EXPECTED_YAML,
        await loadedDigest("version: old\n"),
      );
      expect(mockWriteConfigFile).not.toHaveBeenCalled();
    });

    it("shows the error and finishes nothing when Rust refuses because the file changed", async () => {
      mockReadHarnessFile.mockResolvedValue({ found: true, content: "version: old\n", path: TARGET });
      mockWriteHarnessFile.mockRejectedValue("harness.yaml changed on disk since it was loaded");
      const { user, onFinish } = await toConfirm();
      await user.click(await screen.findByRole("button", { name: /^write harness\.yaml$/i }));
      await user.click(await screen.findByRole("button", { name: /replace \(backup kept\)/i }));
      await waitFor(() => expect(mockWriteHarnessFile).toHaveBeenCalledTimes(1));
      expect(await screen.findByText(/changed on disk/i)).toBeInTheDocument();
      expect(onFinish).not.toHaveBeenCalled();
      expect(mockWriteConfigFile).not.toHaveBeenCalled();
    });
  });
});
