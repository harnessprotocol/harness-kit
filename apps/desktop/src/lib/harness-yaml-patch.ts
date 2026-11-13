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
    // A root scalar ("hello world") is content, not an empty file: replacing it
    // with a mapping would discard it silently.
    if (doc.contents !== null) {
      throw new YamlPatchError("harness.yaml is not a mapping at the top level, so the panel can't edit it. Fix it in the editor.");
    }
    // An empty or comment-only document has no root map to edit yet. Keep what the file says.
    const fresh = new Document({});
    fresh.commentBefore = doc.commentBefore;
    fresh.comment = doc.comment;
    return fresh;
  }
  return doc;
}

/** The leading comment lines of the file, with their trailing newline, or "". */
function headerComment(text: string): string {
  const lines = text.split(/\r?\n/);
  let last = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*#/.test(lines[i])) last = i;
    else if (lines[i].trim() !== "") break;
  }
  return last < 0 ? "" : lines.slice(0, last + 1).join("\n") + "\n";
}

/**
 * The file's own indent width and whether its block lists sit indented under
 * their key, so an edit does not re-style the whole file. Falls back to the
 * yaml library's defaults (2, indented) when the text does not say.
 */
export function inferStyle(text: string): { indent: number; indentSeq: boolean } {
  const lines = text.split(/\r?\n/);
  let indent: number | null = null;
  let indentSeq: boolean | null = null;
  let previous: string | null = null; // last line that is not blank or a comment
  // Inside a block scalar (`key: |`) the lines are text, not YAML structure.
  let blockIndent: number | null = null;
  for (const line of lines) {
    if (line.trim() === "") continue;
    const lineIndentNow = line.match(/^ */)![0].length;
    if (blockIndent !== null) {
      if (lineIndentNow > blockIndent) continue;
      blockIndent = null;
    }
    if (/^\s*#/.test(line)) continue;
    if (/(^|[:\-])\s+[|>][+-]?\d*[+-]?\s*(#.*)?$/.test(line)) blockIndent = lineIndentNow;
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
  let out = doc.toString({ lineWidth: 0, ...inferStyle(source) });
  // Emptying the root drops the comment that hung on the removed first key; keep the header.
  if (out.trim() === "{}") {
    const header = headerComment(source);
    if (header && !out.includes(header.trim())) out = `${header}${out}`;
  }
  // Keep the file's line endings.
  return /\r\n/.test(source) ? out.replace(/\r?\n/g, "\r\n") : out;
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

/**
 * A panel edit's index paths (`["env", 2]`) refer to the text the panel showed.
 * When the editor has moved on since, re-point each index at the same entry in
 * the current text (matched by value, nth duplicate for nth duplicate). Throws
 * a YamlPatchError when the entry was changed or removed in the meantime.
 */
export function remapPatch<P extends YamlPatch>(shown: string, current: string, patch: P): P {
  const was = parseDocument(shown);
  const now = parseDocument(current);
  if (was.errors.length > 0 || now.errors.length > 0) throw new YamlPatchError("harness.yaml does not parse");
  const plain = (doc: Document, path: YamlPath) => {
    const node = doc.getIn(path, true);
    return isCollection(node) || isScalar(node) ? JSON.stringify((node as { toJSON(): unknown }).toJSON()) : JSON.stringify(node);
  };
  const remapPath = (path: YamlPath): Array<string | number> => {
    const out: Array<string | number> = [];
    for (let depth = 0; depth < path.length; depth++) {
      const seg = path[depth];
      if (typeof seg !== "number") {
        out.push(seg);
        continue;
      }
      const shownParent = path.slice(0, depth);
      const list = was.getIn(shownParent, true);
      if (!isCollection(list)) throw new YamlPatchError("The list changed in the editor");
      const wanted = plain(was, path.slice(0, depth + 1));
      let rank = 0;
      for (let i = 0; i < seg; i++) if (plain(was, [...shownParent, i]) === wanted) rank++;
      const currentList = now.getIn(out, true);
      if (!isCollection(currentList)) throw new YamlPatchError("The list changed in the editor");
      let found = -1;
      for (let i = 0; i < currentList.items.length; i++) {
        if (plain(now, [...out, i]) === wanted && rank-- === 0) {
          found = i;
          break;
        }
      }
      if (found < 0) throw new YamlPatchError("That entry changed in the editor");
      out.push(found);
    }
    return out;
  };
  return { ...patch, path: remapPath(patch.path) };
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
