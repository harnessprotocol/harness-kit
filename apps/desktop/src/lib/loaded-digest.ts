import { sha256Hex } from "./surface-fs";
import { errorDetails } from "./error-details";

/**
 * The `expectedSha256` a save sends for text the page loaded (AC-50).
 *
 * Rust hashes the file's text with one leading BOM dropped, so the page does
 * the same. `null` (the file did not exist when loaded) maps to `undefined`:
 * the command then requires the file to be absent.
 */
export async function loadedDigest(text: string | null | undefined): Promise<string | undefined> {
  if (text === null || text === undefined) return undefined;
  return sha256Hex(text.replace(/^﻿/, ""));
}

/** Whether a failed save was refused because the file changed after it was loaded. */
export function isChangedOnDisk(err: unknown): boolean {
  return errorDetails(err).includes("changed on disk");
}
