import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import OnboardingPage from "../OnboardingPage";
import { ONBOARDING_FIXTURE_RESULT, ONBOARDING_FIXTURE_LOW_COUNT } from "../../__fixtures__/onboarding-fixture-data";

// ── Mocks ──────────────────────────────────────────────────────

const mockImportMachine = vi.fn();

vi.mock("@harness-kit/core", () => ({
  importMachine: (...args: unknown[]) => mockImportMachine(...args),
}));

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
vi.mock("../../../lib/tauri", () => ({
  writeHarnessFile: (...args: unknown[]) => mockWriteHarnessFile(...args),
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
    await waitFor(() => expect(mockWriteHarnessFile).toHaveBeenCalledWith(ONBOARDING_FIXTURE_RESULT.harnessYaml));
    await waitFor(() => expect(onFinish).toHaveBeenCalled());
  });

  it("explore read-only finishes without writing anything", async () => {
    mockImportMachine.mockResolvedValue(ONBOARDING_FIXTURE_RESULT);
    const user = userEvent.setup();
    const { onFinish } = renderPage();

    await waitFor(() => expect(screen.getByText(/preview harness\.yaml/i)).toBeInTheDocument(), {
      timeout: 3000,
    });
    await user.click(screen.getByRole("button", { name: /preview harness\.yaml/i }));
    await user.click(await screen.findByRole("button", { name: /^continue$/i }));
    await user.click(await screen.findByRole("button", { name: /explore read-only/i }));

    expect(mockWriteHarnessFile).not.toHaveBeenCalled();
    expect(onFinish).toHaveBeenCalled();
  });

  it("shows the scan error with Retry and Skip instead of a blank step", async () => {
    mockImportMachine.mockRejectedValueOnce(new Error("EACCES: ~/.codex"));
    const { onFinish } = renderPage();

    // The scan step no longer renders the error; the failed step is the
    // only place it appears, alongside the actions.
    expect(await screen.findByText(/machine scan did not finish/i)).toBeInTheDocument();
    expect(screen.getByText("EACCES: ~/.codex")).toBeInTheDocument(); // no "Error:" prefix
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
});
