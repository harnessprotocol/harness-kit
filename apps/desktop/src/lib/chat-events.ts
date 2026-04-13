import type { ShareAction } from "@harness-kit/shared";

export interface ChatShareEvent {
  action: ShareAction;
  target: string;
  detail: string | null;
  diff: string | null;
  pullable: boolean;
}

export function emitChatShare(event: ChatShareEvent): void {
  window.dispatchEvent(new CustomEvent("harness-kit-chat-share", { detail: event }));
}

export function onChatShare(handler: (event: ChatShareEvent) => void): () => void {
  const listener = (e: Event) => handler((e as CustomEvent<ChatShareEvent>).detail);
  window.addEventListener("harness-kit-chat-share", listener);
  return () => window.removeEventListener("harness-kit-chat-share", listener);
}
