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

  it("registers the action without onSave and no-ops until one is provided", () => {
    const later = vi.fn();
    const { rerender } = render(
      <MonacoEditor filePath="a.json" content="{}" onChange={() => {}} />,
    );
    const actions: Action[] = [];
    const { editor, monaco } = fakeMonaco(actions);
    capturedOnMount!(editor, monaco);

    const save = actions.find((a) => a.id === "harness-kit-save");
    expect(save).toBeDefined();
    expect(() => save!.run()).not.toThrow();

    rerender(<MonacoEditor filePath="a.json" content="{}" onChange={() => {}} onSave={later} />);
    save!.run();
    expect(later).toHaveBeenCalledTimes(1);
  });
});
