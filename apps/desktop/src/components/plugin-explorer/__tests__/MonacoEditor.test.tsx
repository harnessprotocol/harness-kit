import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import MonacoEditor from "../MonacoEditor";

type Action = { id: string; run: () => void };
let capturedOnMount: ((editor: unknown, monaco: unknown) => void) | null = null;

// Mimics @monaco-editor/react: onMount is captured once at first render.
vi.mock("@monaco-editor/react", async () => {
  const { useRef } = await import("react");
  return {
    loader: { config: vi.fn() },
    default: ({ onMount }: { onMount: (editor: unknown, monaco: unknown) => void }) => {
      const mountAtFirstRender = useRef(onMount);
      capturedOnMount = mountAtFirstRender.current;
      return <div data-testid="editor" />;
    },
  };
});

vi.mock("monaco-editor", () => ({}));

function fakeMonaco(actions: Action[]) {
  const editor = { addAction: (a: Action) => actions.push(a) };
  const monaco = {
    KeyMod: { CtrlCmd: 2048 },
    KeyCode: { KeyS: 49 },
    editor: { setTheme: vi.fn() },
  };
  return { editor, monaco };
}

describe("MonacoEditor Cmd+S action", () => {
  it("calls the latest onSave, not the one passed at mount", () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = render(
      <MonacoEditor filePath="a.json" content="{}" onChange={() => {}} onSave={first} />,
    );
    const actions: Action[] = [];
    const { editor, monaco } = fakeMonaco(actions);
    capturedOnMount!(editor, monaco);

    rerender(<MonacoEditor filePath="a.json" content="{}" onChange={() => {}} onSave={second} />);

    const save = actions.find((a) => a.id === "harness-kit-save");
    expect(save).toBeDefined();
    save!.run();
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("registers no Cmd+S action when onSave is omitted at mount, so the chord bubbles", () => {
    render(<MonacoEditor filePath="a.json" content="{}" onChange={() => {}} />);
    const actions: Action[] = [];
    const { editor, monaco } = fakeMonaco(actions);
    capturedOnMount!(editor, monaco);

    // Monaco swallows any chord that resolves to a registered action, even a no-op.
    // Not registering is what lets the keystroke reach the page's window listener.
    expect(actions.find((a) => a.id === "harness-kit-save")).toBeUndefined();
  });
});
