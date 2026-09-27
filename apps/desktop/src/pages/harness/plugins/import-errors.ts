import { errorDetails } from "../../../lib/error-details";

/** Last path segment, for either separator. */
export function folderName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() || "plugin";
}

/** A dropped `.zip` goes to the zip import command; anything else is a folder. */
export function isZipPath(path: string): boolean {
  return /\.zip$/i.test(path);
}

/**
 * What failed, one thing to do about it, and the untouched Rust text.
 * Shaped for the ErrorNotice pattern (spec AC-20): `details` is the raw error
 * and belongs behind a "Details" disclosure, never inline with the message.
 */
export interface ImportError {
  title: string;
  action?: string;
  details?: string;
}

/**
 * Turn an `import_plugin_from_path` / `import_plugin_from_zip` rejection into
 * an ImportError. The Rust commands are the only place that can stat an
 * arbitrary dropped path, so their checks (directory, manifest, name, already
 * installed) are the validation; this only rewords them.
 *
 * The prefixes matched here are pinned by the Rust test
 * `import_error_prefixes_match_import_errors_ts` in
 * apps/desktop/src-tauri/src/commands/plugin_explorer.rs. Change both together.
 */
export function describeImportError(err: unknown, name: string): ImportError {
  const details = errorDetails(err);
  const manifest = `${name}/.claude-plugin/plugin.json`;

  if (/^Not a directory/i.test(details)) {
    return { title: `${name} is a file, not a folder.`, action: "Drop the plugin's folder, or a .zip of it, instead.", details };
  }
  if (/missing \.claude-plugin\/plugin\.json/i.test(details)) {
    return {
      title: `${name} is not a plugin folder: it has no .claude-plugin/plugin.json.`,
      action: "Choose the folder that contains .claude-plugin/.",
      details,
    };
  }
  if (/^Failed to read plugin manifest/i.test(details)) {
    return {
      title: `${manifest} could not be read from disk.`,
      action: "Check that the folder and its files are readable (their permissions), then import again.",
      details,
    };
  }
  if (/^Failed to parse plugin manifest/i.test(details)) {
    return {
      title: `${manifest} is not a valid manifest.`,
      action: "Make it valid JSON with a name and version, then import again.",
      details,
    };
  }
  if (/^Invalid plugin name/i.test(details)) {
    return {
      title: `${manifest} has an invalid name.`,
      action: 'Use a plain name with no slashes or "..", then import again.',
      details,
    };
  }
  const installed = details.match(/Plugin '([^']+)' is already installed/);
  if (installed) {
    return { title: `${installed[1]} is already installed.`, action: "Uninstall it first, then import again.", details };
  }
  if (/^Could not find \.claude-plugin\/plugin\.json in extracted archive/i.test(details)) {
    return {
      title: `${name} does not contain a plugin.`,
      action: "Zip the folder that contains .claude-plugin/, then import again.",
      details,
    };
  }
  if (/^Failed to (open|read) zip/i.test(details)) {
    return {
      title: `${name} could not be opened as a zip archive.`,
      action: "Check the file is a readable .zip, then try again.",
      details,
    };
  }
  return { title: `Could not import ${name}.`, action: "Check the folder is readable, then try again.", details };
}
