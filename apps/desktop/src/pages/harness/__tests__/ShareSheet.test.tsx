import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { HarnessConfig } from "@harness-kit/core";
import { buildProfilePrompt, buildProfileShare } from "@harness-kit/core";
import ShareSheet from "../ShareSheet";
import { ToastProvider } from "../../../components/ToastProvider";

const mockSaveShareFile = vi.fn();
vi.mock("../../../lib/tauri", () => ({
  saveShareFile: (...args: unknown[]) => mockSaveShareFile(...args),
}));

const SECRET = "ghp_abcdefghijklmnopqrstuvwxyz0123456789";
const withSecret: HarnessConfig = {
  version: "1",
  metadata: { name: "alice-setup", description: "Alice's tools" },
  "mcp-servers": { github: { transport: "stdio", command: "gh-mcp", env: { GITHUB_TOKEN: SECRET } } },
};
const clean: HarnessConfig = { version: "1", metadata: { name: "plain", description: "No secrets" } };

function renderSheet(config: HarnessConfig, onClose = vi.fn()) {
  return render(
    <ToastProvider>
      <ShareSheet open onClose={onClose} config={config} />
    </ToastProvider>,
  );
}

const writeText = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  writeText.mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
});

describe("ShareSheet (AC-25)", () => {
  it("shows the sanitized harness.yaml first, read-only, with no secret value in it", () => {
    renderSheet(withSecret);
    expect(screen.getByRole("tab", { name: "harness.yaml" })).toHaveAttribute("aria-selected", "true");
    const text = screen.getByLabelText("harness.yaml to share").textContent ?? "";
    expect(text).toBe(buildProfileShare(withSecret).yaml);
    expect(text).not.toContain(SECRET);
  });

  it("names the variable each replaced secret became", () => {
    renderSheet(withSecret);
    const { findings } = buildProfileShare(withSecret);
    expect(findings.length).toBeGreaterThan(0);
    const line = screen.getByTestId("share-findings");
    for (const finding of findings) expect(line).toHaveTextContent(finding.variable);
  });

  it("says no secret value was detected, without promising the file is safe to send", () => {
    renderSheet(clean);
    const line = screen.getByTestId("share-findings");
    expect(line).toHaveTextContent("No secret values were detected. Detection is heuristic, so read it before sending.");
    expect(line).not.toHaveTextContent(/safe|anyone/i);
    expect(screen.getByRole("tab", { name: "harness.yaml" })).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/send it to anyone/i);
  });

  it("the Agent prompt tab shows the prompt and keeps the findings line", () => {
    renderSheet(withSecret);
    fireEvent.click(screen.getByRole("tab", { name: "Agent prompt" }));
    const text = screen.getByLabelText("agent prompt to share").textContent ?? "";
    expect(text).toBe(buildProfilePrompt(withSecret));
    expect(text).not.toContain(SECRET);
    expect(screen.getByTestId("share-findings")).toHaveTextContent(buildProfileShare(withSecret).findings[0].variable);
  });

  it("Copy writes the shown tab's text to the clipboard and confirms with a toast", async () => {
    renderSheet(withSecret);
    fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(buildProfileShare(withSecret).yaml));
    expect(await screen.findByText("Copied the harness.yaml")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Agent prompt" }));
    fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    await waitFor(() => expect(writeText).toHaveBeenLastCalledWith(buildProfilePrompt(withSecret)));
  });

  it("reports a failed copy instead of claiming success", async () => {
    writeText.mockRejectedValue(new Error("denied"));
    renderSheet(clean);
    fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    expect(await screen.findByText("Couldn't copy to the clipboard")).toBeInTheDocument();
    expect(screen.queryByText(/^Copied/)).toBeNull();
  });

  it("Save file… passes the kind, the profile name and the text, then toasts the saved path", async () => {
    mockSaveShareFile.mockResolvedValue("/Users/me/Desktop/alice-setup.yaml");
    renderSheet(withSecret);
    fireEvent.click(screen.getByRole("button", { name: "Save file…" }));
    await waitFor(() =>
      expect(mockSaveShareFile).toHaveBeenCalledWith("harness-yaml", "alice-setup", buildProfileShare(withSecret).yaml),
    );
    expect(await screen.findByText("/Users/me/Desktop/alice-setup.yaml")).toBeInTheDocument();

    mockSaveShareFile.mockResolvedValue("/Users/me/Desktop/alice-setup.md");
    fireEvent.click(screen.getByRole("tab", { name: "Agent prompt" }));
    fireEvent.click(screen.getByRole("button", { name: "Save file…" }));
    await waitFor(() =>
      expect(mockSaveShareFile).toHaveBeenLastCalledWith("agent-prompt", "alice-setup", buildProfilePrompt(withSecret)),
    );
  });

  it("says nothing when the Save dialog is cancelled", async () => {
    mockSaveShareFile.mockResolvedValue(null);
    renderSheet(clean);
    fireEvent.click(screen.getByRole("button", { name: "Save file…" }));
    await waitFor(() => expect(mockSaveShareFile).toHaveBeenCalledTimes(1));
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByText(/^Saved/)).toBeNull();
    expect(screen.queryByText(/Couldn't save/)).toBeNull();
  });

  it("reports a failed save", async () => {
    mockSaveShareFile.mockRejectedValue("disk full");
    renderSheet(clean);
    fireEvent.click(screen.getByRole("button", { name: "Save file…" }));
    expect(await screen.findByText("Couldn't save the harness.yaml")).toBeInTheDocument();
  });

  it("falls back to a generic file name when the profile has none", async () => {
    mockSaveShareFile.mockResolvedValue(null);
    renderSheet({ version: "1" } as HarnessConfig);
    fireEvent.click(screen.getByRole("button", { name: "Save file…" }));
    await waitFor(() => expect(mockSaveShareFile).toHaveBeenCalledWith("harness-yaml", "harness", expect.any(String)));
  });

  it("moves between tabs with the arrow keys", () => {
    renderSheet(clean);
    fireEvent.keyDown(screen.getByRole("tab", { name: "harness.yaml" }), { key: "ArrowRight" });
    expect(screen.getByRole("tab", { name: "Agent prompt" })).toHaveAttribute("aria-selected", "true");
  });

  it("renders nothing when closed", () => {
    render(
      <ToastProvider>
        <ShareSheet open={false} onClose={() => {}} config={clean} />
      </ToastProvider>,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
