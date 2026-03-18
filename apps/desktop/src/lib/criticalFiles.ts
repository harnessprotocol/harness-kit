const CRITICAL_BASENAMES = new Set([
  "plugin.json",
  "CLAUDE.md",
  "settings.json",
  "hooks.json",
]);

const CRITICAL_EXTENSIONS = new Set([".yaml", ".yml"]);

export function isCriticalFile(filePath: string): boolean {
  const basename = filePath.split("/").pop() ?? "";
  if (CRITICAL_BASENAMES.has(basename)) return true;
  const dotIdx = basename.lastIndexOf(".");
  if (dotIdx === -1) return false;
  return CRITICAL_EXTENSIONS.has(basename.slice(dotIdx));
}
