---
sidebar_position: 3
title: explain
---

# explain

Layered explanations of files, functions, directories, or concepts.

## Requirements

None — works in any codebase out of the box.

## What It Does

When you invoke `/explain`:

1. Determines what you're pointing at — file, directory, symbol, or concept
2. Reads the target and its immediate context (imports, callers, dependencies)
3. Checks for a CLAUDE.md to ground the explanation in the project's own terminology
4. Produces a structured explanation with six sections

## Output Structure

| Section | What it covers |
|---------|---------------|
| **Summary** | What this code does and why it exists (2-3 sentences) |
| **Key Components** | Important functions, classes, modules with one-line descriptions |
| **How It Connects** | What calls this, what it calls, data flow in/out |
| **Patterns & Conventions** | Design patterns, naming conventions, framework idioms in use |
| **Gotchas** | Non-obvious behavior, edge cases, things that will bite you |
| **Entry Points for Change** | Where to start modifying, what to watch out for |

## Usage

### Explain a file

```
/explain src/auth/middleware.ts
```

### Explain a directory

```
/explain src/services/
```

For directories, you get a **map first** — purpose, component list, relationships — then you pick what to zoom into.

### Explain a function or class

```
/explain OrderProcessor.process
```

Finds the definition, reads the containing file and callers, explains it in context.

### Explain a concept or flow

```
/explain the payment processing flow
/explain how webhooks get dispatched
```

Searches the codebase for relevant files and explains the cross-cutting concept.

## Adaptive Depth

The explanation adapts to scope:

- **Single function** (< 50 lines): full deep-dive, may include the actual code inline
- **Single file** (50-500 lines): full 6-section explanation with line number references
- **Directory or concept**: map first, then deep-dive on the parts you care about
- **Entire project**: architecture overview with suggested reading order

## Design Notes

### Why structured output?

Unstructured explanations bury the useful information. The 6-section structure means you can skip straight to "Gotchas" if you're debugging, or "Entry Points for Change" if you're about to modify something.

### Why project-aware?

If a project has a CLAUDE.md with an Architecture section, the explanation uses the project's own terminology and conventions — grounded in how the team thinks about the code, not generic descriptions.

### Why conversation output?

Most of the time you want to understand something quickly, not create documentation. If you want to save an explanation, just ask.
