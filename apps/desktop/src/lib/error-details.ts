/**
 * The raw text of a caught error, for an ErrorNotice's Details disclosure
 * (spec AC-20). Pages never show `String(err)`: an Error would read
 * "Error: …" and a plain object "[object Object]".
 *
 * - Error: its message (the name when the message is empty); no stack.
 * - string: itself. Tauri commands reject with the Rust error text.
 * - object with a string `message`: that message.
 * - other objects: JSON, when they serialize to something useful.
 */
export function errorDetails(err: unknown): string {
  if (err instanceof Error) return err.message || err.name;
  if (typeof err === "string") return err;
  if (err === null || err === undefined) return "No error details were given.";
  if (typeof err === "object") {
    const message = (err as { message?: unknown }).message;
    if (typeof message === "string" && message) return message;
    try {
      const json = JSON.stringify(err, null, 2);
      if (json && json !== "{}") return json;
    } catch {
      // Circular or otherwise unserializable: fall through.
    }
    return "No error details were given.";
  }
  return String(err);
}
