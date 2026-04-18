---
title: AI Chat
---

# AI Chat

AI Chat is a local chat interface powered by [Ollama](https://ollama.com). All
conversations stay on your machine — no API keys, no cloud routing.

## Requirements

Ollama must be running before you open AI Chat. If it is not detected, the page
shows an install link and the input is disabled. Once Ollama is running, models
available on your machine are listed in the model selector in the toolbar.

## Sessions

Each conversation is a named session. Sessions persist across app restarts.

- **New chat** — `Cmd+N` or the **+** button in the toolbar creates a new session
  with the currently selected model
- **Switch session** — `Cmd+K` opens the session picker overlay; click any session
  to load it, or use the **+** button inside the picker to start a new one
- **Rename** — inline rename from the session picker
- **Delete** — delete a session from the session picker; this is permanent

The last-used model is saved and restored automatically when you start a new session.

## Transcript View

The default view is **styled** mode: user messages appear in cyan, assistant responses
are rendered as markdown with code blocks highlighted, system messages are shown in
gray, and errors in red.

Toggle to **raw** mode to see the conversation in a full xterm terminal emulator with
ANSI color codes. Raw mode is useful for inspecting streaming output character by
character.

## Streaming

Responses stream token-by-token. A **Cancel** button appears in the toolbar and
input area while a response is streaming. Cancelling stops the stream immediately.

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd+N` | New chat |
| `Cmd+K` | Open session picker |
| `Cmd+L` | New chat (alias) |
| `Escape` | Close session picker |
| `Enter` | Send message |
| `Shift+Enter` | Insert newline |
