import { invoke } from "@tauri-apps/api/core";
import { TauriFsProvider } from "./harness-fs";

/** `expectedSha256` value that tells the Rust write the file must not exist. */
export const ABSENT_SHA256 = "absent";

/** Lowercase hex SHA-256 of a string's UTF-8 bytes. */
export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * FsProvider for user-scope config writes.
 *
 * Reads go through the Tauri fs plugin, whose scope already covers the config
 * files the Machine grid observes. WRITES cannot: the static capability grants
 * read only, deliberately. So every mutation routes through
 * `apply_surface_transaction`, which re-validates each path against its own
 * embedded registry allowlist rather than trusting the webview.
 *
 * The point of the indirection is that core's transaction engine can now run
 * unchanged in the webview — preimage verification, backups, and a rollback
 * manifest — instead of the drawer firing a bare write. An earlier version
 * sent `{path, content}` straight to Rust and lost all three.
 */
export class TauriSurfaceFsProvider extends TauriFsProvider {
  constructor(private readonly homeRoot: string) {
    super(homeRoot);
  }

  /** Absolute path -> home-relative, as the Rust command expects. */
  private relative(path: string): string {
    const prefix = this.homeRoot.endsWith("/") ? this.homeRoot : `${this.homeRoot}/`;
    if (!path.startsWith(prefix)) {
      throw new Error(`${path} is outside the home directory`);
    }
    return path.slice(prefix.length);
  }

  override async writeFile(path: string, content: string): Promise<void> {
    await this.write(path, content);
  }

  private async write(path: string, content: string, replaces?: string | null): Promise<void> {
    const file: { relativePath: string; content: string; expectedSha256?: string } = {
      relativePath: this.relative(path),
      content,
    };
    if (replaces !== undefined) {
      file.expectedSha256 = replaces === null ? ABSENT_SHA256 : await sha256Hex(replaces);
    }
    await invoke("apply_surface_transaction", { files: [file] });
  }

  /**
   * The engine's atomic write, delegated whole. The Rust command already
   * stages a sibling temp file and renames it over the destination, so the
   * webview never names a temp path, and the command's allowlist needs no
   * allowance for one. `mode` is ignored on purpose: Rust preserves an
   * existing file's mode and makes new single-file stores and everything
   * under ~/.harness private, which is the same decision the engine's
   * setFileMode calls would make, taken where the file actually is.
   *
   * `replaces` becomes the command's `expectedSha256`, checked again just
   * before the rename. The engine verifies the preimage itself, but a backup
   * and a manifest are written between that check and this write, and
   * ~/.claude.json is rewritten by a running Claude Code, so the window is
   * real. The hash is of the text as the fs plugin decoded it, re-encoded as
   * UTF-8: for a UTF-8 file without a byte-order mark those are the bytes on
   * disk, and for anything else the write is refused, never forced.
   */
  async atomicWriteFile(
    path: string,
    content: string,
    options?: { mode?: number; replaces?: string | null },
  ): Promise<void> {
    await this.write(path, content, options?.replaces);
  }

  override async removeFile(path: string): Promise<void> {
    await invoke("apply_surface_transaction", {
      files: [{ relativePath: this.relative(path), content: null }],
    });
  }

  /**
   * Refused rather than emulated. The emulation this replaced (read the temp
   * file, write the destination, delete the temp) was not atomic, and nothing
   * on this provider produces a temp file to rename any more: the engine
   * writes through `atomicWriteFile`. Failing loudly keeps a future caller
   * from quietly getting the weaker behaviour back.
   */
  override async renameFile(): Promise<void> {
    throw new Error("TauriSurfaceFsProvider has no rename; writes go through atomicWriteFile");
  }

  /** Directories are created implicitly by the Rust command's write. */
  override async mkdir(): Promise<void> {}
}
