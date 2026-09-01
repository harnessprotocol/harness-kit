import { invoke } from "@tauri-apps/api/core";
import { TauriFsProvider } from "./harness-fs";

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
    await invoke("apply_surface_transaction", {
      files: [{ relativePath: this.relative(path), content }],
    });
  }

  override async removeFile(path: string): Promise<void> {
    await invoke("apply_surface_transaction", {
      files: [{ relativePath: this.relative(path), content: null }],
    });
  }

  /**
   * The engine writes to a temp path then renames. The Rust command has no
   * rename, so this reads the staged content and writes it to the final path
   * — the atomicity guarantee is weaker here than on the CLI's rename, and
   * that is a known gap until the command grows a rename of its own.
   */
  override async renameFile(from: string, to: string): Promise<void> {
    const content = await this.readFile(from);
    await this.writeFile(to, content);
    await this.removeFile(from);
  }

  /** Directories are created implicitly by the Rust command's write. */
  override async mkdir(): Promise<void> {}
}
