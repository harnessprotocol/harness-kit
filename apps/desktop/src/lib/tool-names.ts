/** Canonical list of Claude Code tool names with short descriptions. */
export const TOOL_NAMES: { name: string; hint: string }[] = [
  { name: "Read",         hint: "Read file contents" },
  { name: "Write",        hint: "Create or overwrite files" },
  { name: "Edit",         hint: "Make targeted edits to files" },
  { name: "Glob",         hint: "Find files by pattern" },
  { name: "Grep",         hint: "Search file contents" },
  { name: "Bash",         hint: "Execute shell commands" },
  { name: "Agent",        hint: "Launch subagent processes" },
  { name: "WebFetch",     hint: "Fetch URLs" },
  { name: "WebSearch",    hint: "Search the web" },
  { name: "Skill",        hint: "Invoke skills" },
  { name: "NotebookEdit", hint: "Edit Jupyter notebooks" },
  { name: "LSP",          hint: "Language Server Protocol" },
];
