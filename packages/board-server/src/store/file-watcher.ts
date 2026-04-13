import { EventEmitter } from "node:events";
import fs from "node:fs";

export type FileWatcherEvent = {
  type: "change" | "rename";
  filename: string; // just the basename, e.g. "my-project.yaml"
};

export class FileWatcher extends EventEmitter {
  private watcher: fs.FSWatcher | null = null;
  private debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private debounceMs: number;

  constructor(
    private dir: string,
    debounceMs = 150,
  ) {
    super();
    this.debounceMs = debounceMs;
  }

  start(): void {
    if (this.watcher) return;
    this.watcher = fs.watch(this.dir, { persistent: false }, (eventType, filename) => {
      if (!filename || !filename.endsWith(".yaml")) return;
      const existing = this.debounceTimers.get(filename);
      if (existing) clearTimeout(existing);
      const timer = setTimeout(() => {
        this.debounceTimers.delete(filename);
        this.emit("change", { type: eventType, filename } satisfies FileWatcherEvent);
        if (filename.endsWith(".roadmap.yaml")) {
          const slug = filename.replace(/\.roadmap\.yaml$/, "");
          this.emit("roadmap_updated", { slug });
        } else if (filename.endsWith(".competitors.yaml")) {
          const slug = filename.replace(/\.competitors\.yaml$/, "");
          this.emit("competitors_updated", { slug });
        }
      }, this.debounceMs);
      this.debounceTimers.set(filename, timer);
    });

    this.watcher.on("error", (err) => {
      this.emit("error", err);
    });
  }

  stop(): void {
    if (!this.watcher) return;
    this.watcher.close();
    this.watcher = null;
    for (const timer of this.debounceTimers.values()) clearTimeout(timer);
    this.debounceTimers.clear();
  }
}
