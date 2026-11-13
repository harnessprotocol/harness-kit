import { Document, isCollection, isScalar, parseDocument } from "yaml";


/**
 * Edits to harness.yaml text for the structured panel (AC-23). Each edit goes
 * through the `yaml` Document API, so comments, key order and the style of
 * untouched nodes survive; only the touched node changes.
 */
export type YamlPath = ReadonlyArray<string | number>;

export type YamlPatch =
  /** Set a scalar or value. `undefined`, `null` or "" removes the key instead. */
  | { op: "set"; path: YamlPath; value: unknown }
  /** Remove a key or list entry. Maps and lists left empty are removed too. */
  | { op: "remove"; path: YamlPath }
  /** Append to the list at `path`, creating it when missing. */
  | { op: "append"; path: YamlPath; value: unknown }
  /** Add `key: value` to the map at `path`, creating it when missing. */
  | { op: "put"; path: YamlPath; key: string; value: unknown };

export class YamlPatchError extends Error {}

function load(text: string): Document {
  const doc = parseDocument(text);
  if (doc.errors.length > 0) {
    throw new YamlPatchError(`harness.yaml does not parse: ${doc.errors[0].message}`);
  }
  if (!isCollection(doc.contents)) {
    // An empty document has no root map to edit yet. Keep what the file says.
    const fresh = new Document({});
    fresh.commentBefore = doc.commentBefore;
    fresh.comment = doc.comment;
    return fresh;
  }
  return doc;
}

/**
 * The file's own indent width and whether its block lists sit indented under
 * their key, so an edit does not re-style the whole file. Falls back to the
 * yaml library's defaults (2, indented) when the text does not say.
 */
export function inferStyle(text: string): { indent: number; indentSeq: boolean } {
  const lines = text.split("\n");
  let indent: number | null = null;
  let indentSeq: boolean | null = null;
  let previous: string | null = null; // last line that is not blank or a comment
  for (const line of lines) {
    if (line.trim() === "" || /^\s*#/.test(line)) continue;
    if (previous !== null && /:\s*(#.*)?$/.test(previous) && !/^\s*-(\s|$)/.test(previous)) {
      const parentIndent = previous.match(/^ */)![0].length;
      const lineIndent = line.match(/^ */)![0].length;
      const isItem = /^\s*-(\s|$)/.test(line);
      if (isItem && indentSeq === null) indentSeq = lineIndent > parentIndent;
      if (!isItem && lineIndent > parentIndent && indent === null) indent = lineIndent - parentIndent;
    }
    previous = line;
  }
  return { indent: indent ?? 2, indentSeq: indentSeq ?? true };
}

function render(doc: Document, source: string): string {
  // lineWidth 0: never re-fold long strings the edit did not touch.
  return doc.toString({ lineWidth: 0, ...inferStyle(source) });
}

/** Remove empty maps and lists left behind, walking up from `path`. */
function pruneEmptyParents(doc: Document, path: YamlPath): void {
  for (let depth = path.length - 1; depth >= 1; depth--) {
    const parentPath = path.slice(0, depth);
    const parent = doc.getIn(parentPath, true);
    if (isCollection(parent) && parent.items.length === 0) doc.deleteIn(parentPath);
    else return;
  }
}

function isEmpty(value: unknown): boolean {
  return value === undefined || value === null || value === "";
}

export function applyYamlPatch(text: string, patch: YamlPatch): string {
  const doc = load(text);
  switch (patch.op) {
    case "set": {
      if (isEmpty(patch.value)) {
        doc.deleteIn(patch.path);
        pruneEmptyParents(doc, patch.path);
        break;
      }
      const existing = doc.getIn(patch.path, true);
      // Reuse a scalar node so its comment and quoting style stay.
      if (isScalar(existing) && typeof patch.value !== "object") existing.value = patch.value;
      else doc.setIn(patch.path, patch.value);
      break;
    }
    case "remove":
      doc.deleteIn(patch.path);
      pruneEmptyParents(doc, patch.path);
      break;
    case "append": {
      const list = doc.getIn(patch.path, true);
      if (isCollection(list)) doc.addIn(patch.path, patch.value);
      else doc.setIn(patch.path, [patch.value]);
      break;
    }
    case "put":
      doc.setIn([...patch.path, patch.key], patch.value);
      break;
  }
  return render(doc, text);
}
