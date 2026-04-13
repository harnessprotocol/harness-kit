import { useCallback, useEffect, useState } from "react";
import { AIChatEmptyState } from "../../components/ai/AIChatEmptyState";
import { ChatView } from "../../components/ai/ChatView";
import { SessionList } from "../../components/ai/SessionList";
import { useAIChat } from "../../hooks/useAIChat";
import { useOllama } from "../../hooks/useOllama";

const SIDEBAR_WIDTH = 220;

export default function AIChatPage() {
  const ollama = useOllama();
  const chat = useAIChat();
  const [selectedModel, setSelectedModel] = useState("");

  // Sync selectedModel when models become available
  useEffect(() => {
    if (ollama.models.length > 0 && !selectedModel) {
      setSelectedModel(ollama.models[0].name);
    }
  }, [ollama.models, selectedModel]);

  const handleNewChat = useCallback(async () => {
    if (!selectedModel && ollama.models.length === 0) return;
    const model = selectedModel || ollama.models[0]?.name || "";
    if (!model) return;
    await chat.createSession(model);
  }, [chat, selectedModel, ollama.models]);

  const handleSelectSession = useCallback(
    async (id: string) => {
      await chat.loadSession(id);
    },
    [chat],
  );

  // Cmd+N shortcut for new chat
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.metaKey && e.key === "n") {
        e.preventDefault();
        if (ollama.running) handleNewChat();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleNewChat, ollama.running]);

  const hasActiveSession = chat.currentSession !== null;

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>
      {/* Session sidebar */}
      <div style={{ width: SIDEBAR_WIDTH, flexShrink: 0, overflow: "hidden" }}>
        <SessionList
          sessions={chat.sessions}
          currentSessionId={chat.currentSession?.id ?? null}
          onSelect={handleSelectSession}
          onNew={handleNewChat}
          onDelete={chat.deleteSession}
          onRename={chat.renameSession}
          ollamaRunning={ollama.running}
        />
      </div>

      {/* Main chat area */}
      <div style={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
        {hasActiveSession ? (
          <ChatView
            chat={chat}
            ollama={ollama}
            selectedModel={selectedModel}
            onModelSelect={setSelectedModel}
          />
        ) : (
          <AIChatEmptyState onNewChat={handleNewChat} ollamaRunning={ollama.running} />
        )}
      </div>
    </div>
  );
}
