---
title: Machine
---

# Machine

Machine is the home screen of the desktop app (`Cmd+1`). It reads the config each AI
coding tool keeps on your machine and lays it out in one grid, so you can see where
tools disagree and copy a missing piece from one to another.

## The grid

Rows are resources, grouped by kind: MCP servers, skills, instructions, plugins and
more. Columns are tools, grouped by product family. Each cell shows one state:

- `user` or `project`: the resource is present at that scope.
- `+ copy`: the resource is missing here and can be copied in.
- `differs`: a resource of the same name is here, but its content is not the same.
- `—`: the tool has no such concept.
- `·`: the tool has the concept but keeps no store the app reads.
- `?`: the tool is installed but its store may be hidden, so the app cannot tell.
- Blank: the resource is absent and nothing can be copied there.

A legend under the grid lists these states. Hover a cell to see each entry's file and
scope.

Tools that are not installed are hidden. A note above the grid shows how many of the
supported tools are installed, and **Show all** brings the rest back. Hidden tools
still count when the app decides which copy is the baseline for a row.

Instructions appear as one row per scope, User instructions and Project instructions,
whatever each tool calls its file (`CLAUDE.md`, `AGENTS.md`).

## Choosing a project

The title bar holds one project selector. With no project, Machine scans only the
config in your home folder. Choose a folder and the scan adds that project's own
config. The app can read a project only after you pick it in the native folder dialog.
The last project is restored at launch, so macOS may ask for folder access on start if
it sits in a protected folder such as Documents.

## The summary strip

The strip above the grid shows counts for Resources, Gaps, Differs, Drift and installed
tools. Select **Gaps** or **Differs** to filter the grid to those rows.

## Copying a resource

Click a row to open the drawer. Click a cell and the drawer opens with that cell's tool
as the target. The drawer shows:

- where the resource lives, with scope, file and a short digest
- the differences between copies, field by field
- a **From** and **To** choice, with the copy that most tools agree on as the default
  source

Apply writes the copy. Before it writes, the app shows what will change. If the target
cannot express everything in the resource, or already holds a different version, you
confirm that first. A backup and a rollback point go to `~/.harness/backups/` for files
in your home folder, and to the project's `.harness/backups/` for project files.

The CLI command that does the same copy is shown in the drawer, along with a prompt you
can paste into the target tool's own agent. The app cannot write plugins. For a plugin
the drawer shows the CLI command and the prompt, and the CLI installs it.

## Drift view

The **Drift vs harness.yaml** tab next to **Resources** compares your `harness.yaml`
with the files compiled from it. Each item shows its state, a diff, and a **Fix**
button that previews the exact change before it writes. Changes you made by hand
outside the compiled sections are never overwritten. You can acknowledge them or review
them.

Drift scans when you open the tab, not before.

## Which `harness.yaml`

There is one personal profile, `~/.claude/harness.yaml`. Profile, Compile, Drift and
first-run setup all read that same file. A project can also commit its own
`harness.yaml` as the team baseline. With a project chosen in the title bar, Profile and
Compile show and compile that project's file, and Profile shows it read-only. Drift
compares your machine against the personal file and, when a project is chosen, the
project against its own file. Compile to project still compiles your personal profile
into a project that has no `harness.yaml` of its own.
