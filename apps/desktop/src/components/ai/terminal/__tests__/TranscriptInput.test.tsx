import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TranscriptInput } from "../TranscriptInput";

describe("TranscriptInput", () => {
  const noop = () => {};

  it("is enabled when disabled=false and isStreaming=false", () => {
    render(<TranscriptInput onSend={noop} isStreaming={false} onCancel={noop} />);
    const textarea = screen.getByRole("textbox");
    expect(textarea).not.toBeDisabled();
  });

  it("is disabled when disabled=true", () => {
    render(<TranscriptInput onSend={noop} isStreaming={false} onCancel={noop} disabled />);
    const textarea = screen.getByRole("textbox");
    expect(textarea).toBeDisabled();
  });

  it("is disabled when isStreaming=true", () => {
    render(<TranscriptInput onSend={noop} isStreaming={true} onCancel={noop} />);
    const textarea = screen.getByRole("textbox");
    expect(textarea).toBeDisabled();
  });

  it("shows disabledReason as placeholder when disabled", () => {
    render(
      <TranscriptInput
        onSend={noop}
        isStreaming={false}
        onCancel={noop}
        disabled
        disabledReason="Ollama is not running"
      />,
    );
    const textarea = screen.getByRole("textbox");
    expect(textarea).toHaveAttribute("placeholder", "Ollama is not running");
  });

  it("shows default placeholder when enabled", () => {
    render(
      <TranscriptInput
        onSend={noop}
        isStreaming={false}
        onCancel={noop}
        disabledReason="Ollama is not running"
      />,
    );
    const textarea = screen.getByRole("textbox");
    expect(textarea.getAttribute("placeholder")).toContain("Message");
  });

  it("send button is disabled when input is disabled", () => {
    render(<TranscriptInput onSend={noop} isStreaming={false} onCancel={noop} disabled />);
    const sendBtn = screen.getByRole("button", { name: /send/i });
    expect(sendBtn).toBeDisabled();
  });

  it("calls onSend when Enter is pressed with text", () => {
    const onSend = vi.fn();
    render(<TranscriptInput onSend={onSend} isStreaming={false} onCancel={noop} />);
    const textarea = screen.getByRole("textbox");
    fireEvent.input(textarea, { target: { value: "hello" } });
    // Manually set value since it's uncontrolled
    (textarea as HTMLTextAreaElement).value = "hello";
    fireEvent.keyDown(textarea, { key: "Enter" });
    expect(onSend).toHaveBeenCalledWith("hello");
  });

  it("does not call onSend when disabled and Enter is pressed", () => {
    const onSend = vi.fn();
    render(<TranscriptInput onSend={onSend} isStreaming={false} onCancel={noop} disabled />);
    const textarea = screen.getByRole("textbox");
    (textarea as HTMLTextAreaElement).value = "hello";
    fireEvent.keyDown(textarea, { key: "Enter" });
    expect(onSend).not.toHaveBeenCalled();
  });

  it("shows stop button when streaming", () => {
    render(<TranscriptInput onSend={noop} isStreaming={true} onCancel={noop} />);
    expect(screen.getByTitle("Cancel stream (Esc)")).toBeInTheDocument();
    expect(screen.queryByTitle("Send (Enter)")).not.toBeInTheDocument();
  });
});
