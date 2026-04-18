---
title: Terminals
---

# Terminals

The Terminals page is a multi-pane terminal manager built into the desktop app.
You can run multiple terminal sessions side by side, assign a harness to each one,
and invoke an AI agent across all terminals simultaneously.

## Opening Terminals

A single terminal opens automatically when you navigate to the Terminals page,
pointed at the current working directory. Open additional terminals with `Cmd+T`
or the **+ New Terminal** button in the toolbar. Up to four terminals can be open
at once.

Terminals are rendered using xterm.js, so they support full color, ANSI escape
sequences, and interactive programs.

## Harness Assignment

Each terminal panel has a harness selector. Assigning a harness to a terminal
configures which AI agent will be invoked when you send a prompt to that panel.
Harnesses are auto-detected from your system.

## Invoking Agents

Click the **Invoke** button on any terminal panel, or the **Invoke All** button in
the toolbar, to open the invoke dialog. From there:

1. Select a harness (if not already assigned to the terminal)
2. Select a model
3. Enter a prompt

Clicking **Invoke** sends the prompt to the harness in that terminal. **Invoke All**
broadcasts the same prompt to every open terminal, using each panel's assigned
harness.

## Grid Layout

Terminals are arranged in a responsive grid that adapts to the number of open
sessions:

| Sessions | Layout |
|----------|--------|
| 1 | Single full-width panel |
| 2 | Side by side |
| 3 | Two on top, one below |
| 4 | 2×2 grid |

## Project Context

The terminal's working directory defaults to the project detected by the desktop app
at startup. The project name is shown in the toolbar. This is the same path used when
auto-opening the first terminal.
