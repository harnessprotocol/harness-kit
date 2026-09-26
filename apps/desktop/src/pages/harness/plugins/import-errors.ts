/** Last path segment, for either separator. */
export function folderName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() || "plugin";
}

/**
 * Turn an `import_plugin_from_path` rejection into what failed plus one action.
 * The Rust command is the only place that can stat an arbitrary dropped path,
 * so its checks (directory, manifest, name, already installed) are the
 * validation; this only rewords them.
 */
export function describeImportError(err: unknown, name: string): string {
  const raw = err instanceof Error ? err.message : String(err);

  if (/^Not a directory/i.test(raw)) {
    return `${name} is a file, not a folder. Drop the plugin's folder instead.`;
  }
  if (/missing \.claude-plugin\/plugin\.json/i.test(raw)) {
    return `${name} is not a plugin folder: it has no .claude-plugin/plugin.json. Choose the folder that contains .claude-plugin/.`;
  }
  if (/Failed to (read|parse) plugin manifest/i.test(raw)) {
    return `${name}/.claude-plugin/plugin.json could not be read. Make it valid JSON with a name and version, then import again.`;
  }
  if (/Invalid plugin name/i.test(raw)) {
    return `${name}/.claude-plugin/plugin.json has an invalid name. Use a plain name with no slashes or "..", then import again.`;
  }
  const installed = raw.match(/Plugin '([^']+)' is already installed/);
  if (installed) {
    return `${installed[1]} is already installed. Uninstall it first, then import again.`;
  }
  return `Could not import ${name}. Check the folder is readable, then try again. Details: ${raw}`;
}
