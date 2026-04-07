/** Canonical list of Claude Code tool names with short descriptions. */
export const TOOL_NAMES: { name: string; hint: string; scopeHint?: string; scopeLabel?: string }[] = [
  { name: "Read",         hint: "Read file contents",        scopeHint: "~/repos/**",                scopeLabel: "path" },
  { name: "Write",        hint: "Create or overwrite files", scopeHint: "~/repos/**",                scopeLabel: "path" },
  { name: "Edit",         hint: "Make targeted edits",       scopeHint: "~/repos/**",                scopeLabel: "path" },
  { name: "Glob",         hint: "Find files by pattern",     scopeHint: "src/**",                    scopeLabel: "path" },
  { name: "Grep",         hint: "Search file contents",      scopeHint: "src/**",                    scopeLabel: "path" },
  { name: "Bash",         hint: "Execute shell commands",    scopeHint: "git *",                     scopeLabel: "cmd" },
  { name: "Agent",        hint: "Launch subagent processes" },
  { name: "WebFetch",     hint: "Fetch URLs",                scopeHint: "https://api.github.com/*",  scopeLabel: "url" },
  { name: "WebSearch",    hint: "Search the web",            scopeHint: "site:docs.anthropic.com *", scopeLabel: "query" },
  { name: "Skill",        hint: "Invoke skills" },
  { name: "NotebookEdit", hint: "Edit Jupyter notebooks",    scopeHint: "~/notebooks/**",            scopeLabel: "path" },
  { name: "LSP",          hint: "Language Server Protocol" },
];
