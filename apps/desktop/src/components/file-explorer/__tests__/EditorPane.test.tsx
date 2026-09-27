import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { useFileEditor } from "../../../hooks/useFileEditor";
import EditorPane from "../EditorPane";

const mockRead = vi.fn();
const mockWrite = vi.fn();
vi.mock("../../../lib/tauri", () => ({
  readClaudeMd: (...args: unknown[]) => mockRead(...args),
  writeConfigFile: (...args: unknown[]) => mockWrite(...args),
}));

vi.mock("../../plugin-explorer/MonacoEditor", () => ({
  default: ({ content, onChange }: { content: string; onChange: (v: string) => void }) => (
    <textarea data-testid="editor" value={content} onChange={(e) => onChange(e.target.value)} />
  ),
}));

const FILE = "~/.claude/settings.json";

function Harness() {
  const editor = useFileEditor(FILE);
  return (
    <EditorPane
      filePath={FILE}
      editor={editor}
      viewMode="editor"
      availableModes={[{ key: "editor", label: "Editor" }]}
      onViewModeChange={() => {}}
    />
  );
}

describe("EditorPane with useFileEditor (AC-20)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRead.mockResolvedValue("{}");
  });

  it("keeps unsaved edits on screen when a save fails, and Retry save writes them", async () => {
    mockWrite.mockRejectedValueOnce(new Error("disk full")).mockResolvedValue(undefined);
    render(<Harness />);
    const editor = await screen.findByTestId("editor");
    fireEvent.change(editor, { target: { value: '{"edited":true}' } });

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't save settings.json");
    expect(screen.getByText("disk full")).not.toBeVisible();
    // The editor is still mounted with what the user typed; nothing was re-read.
    expect(screen.getByTestId("editor")).toHaveValue('{"edited":true}');
    expect(screen.queryByRole("button", { name: "Reload" })).not.toBeInTheDocument();
    expect(mockRead).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Retry save" }));

    await waitFor(() => expect(mockWrite).toHaveBeenCalledTimes(2));
    expect(mockWrite).toHaveBeenLastCalledWith(FILE, '{"edited":true}');
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    expect(screen.getByTestId("editor")).toHaveValue('{"edited":true}');
  });

  it("replaces the editor with the notice and Reload when the load fails", async () => {
    mockRead.mockRejectedValueOnce(new Error("permission denied")).mockResolvedValue("{}");
    render(<Harness />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't read settings.json");
    expect(screen.queryByTestId("editor")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Reload" }));
    expect(await screen.findByTestId("editor")).toHaveValue("{}");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
