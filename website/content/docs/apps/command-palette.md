---
title: Command Palette
---

# Command Palette

The command palette is the keyboard-first way to move around and operate the
desktop app. Press `Cmd+K` from anywhere to open it, type to filter, and press
`Enter` to run the highlighted command.

## Commands

The palette groups commands into:

- **Navigate** — jump to any section or sub-page (Configure, Harness Parity,
  Observatory, Board, and so on). This replaces hunting through the sidebar.
- **Actions** — operate the app, including **Toggle light / dark theme** and
  **Ask AI**.

## Ask AI

**Ask AI** opens a local chat powered by [Ollama](https://ollama.com). All
conversations stay on your machine — no API keys, no cloud routing. Ollama must
be running; if it is not detected, the chat shows an install link and the input
is disabled. Models available on your machine appear in the model selector, and
the last-used model is restored automatically.

Responses stream token-by-token, with a **Cancel** button to stop a stream
immediately. The transcript renders assistant responses as markdown with
highlighted code blocks.

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd+K` | Open / close the command palette |
| `↑` / `↓` | Move the selection |
| `Enter` | Run the highlighted command |
| `Escape` | Close the palette |
