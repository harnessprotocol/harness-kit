# rubber-ducky

A constructive critic that gives a second opinion on your own plans, designs, code, and tests —
spawning independent read-only reviewers on **different Claude models** than the one driving your
session.

## Usage

```
/plugin install rubber-ducky@harness-kit
```

Then, at a high-leverage moment:

```
/rubber-ducky                      # critique the current plan / work
/rubber-ducky what edge cases am I missing?
"rubber duck this before I build it"
"poke holes in my approach"
```

It also fires proactively — after you plan a non-trivial change, mid-way through complex work, after
writing tests, or when you're stuck on repeated failures.

## What You Get

Two independent critics run in parallel on the two models your session *isn't* using (e.g. on Opus,
you get Sonnet + Haiku). Their findings are synthesized into three tiers:

- **Blocking** — must fix for the work to succeed
- **Non-blocking** — should fix to improve quality
- **Suggestions** — lower-priority but real

Each finding is *issue → impact → concrete fix*. Where both models agree, confidence is high; where
they diverge, that's surfaced too. "No issues found" is a valid result — it won't invent nitpicks.

## Why different models

A model that didn't produce the work is far more likely to see what's wrong with it. Running the
critics on different models from the session means you get genuinely independent perspectives rather
than a re-run of the same reasoning that produced the plan — fewer shared blind spots.

## rubber-ducky vs review

- **rubber-ducky** pressure-tests your *in-progress thinking* (a plan, design, or approach) **before
  or during** implementation, using cross-model critics.
- **review** evaluates a *finished* branch diff or PR after the code exists.

Reach for the duck while the decision is still cheap to change; reach for `/review` when the work is done.

## Notes

- Read-only. The critics never modify files or run stateful commands — they review, you decide.
- Skips trivial changes (one-line fixes, renames) so it doesn't slow down quick edits.
