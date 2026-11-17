import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadProfiles, resolvePersonalProfile } from "../src/commands/portability-common.js";
import { captureCommand } from "../src/commands/capture.js";

const profile = (name: string, scope: string) =>
  `version: "2.1"\nkind: profile\nscope: ${scope}\nmetadata:\n  name: ${name}\n  description: ${name}\n`;

describe.sequential("personal profile path", () => {
  let root: string;
  let home: string;
  let project: string;
  let originalCwd: string;
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "harness-personal-"));
    home = join(root, "home");
    project = join(root, "project");
    await mkdir(join(home, ".claude"), { recursive: true });
    await mkdir(join(home, ".harness"), { recursive: true });
    await mkdir(project, { recursive: true });
    await writeFile(join(project, "harness.yaml"), profile("proj", "project"));
    originalCwd = process.cwd();
    process.chdir(project);
    vi.stubEnv("HOME", home);
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("reads ~/.harness/harness.yaml and does not warn", async () => {
    await writeFile(join(home, ".harness/harness.yaml"), profile("new", "personal"));
    const source = await resolvePersonalProfile(home);
    expect(source).toMatchObject({ readPath: join(home, ".harness/harness.yaml"), legacy: false });
    const layers = await loadProfiles(join(project, "harness.yaml"), {});
    expect(layers.find((l) => l.scope === "personal")?.config.metadata.name).toBe("new");
    expect(warn).not.toHaveBeenCalled();
  });

  it("falls back to ~/.claude/harness.yaml with one warning when the new file is absent", async () => {
    await writeFile(join(home, ".claude/harness.yaml"), profile("old", "personal"));
    const source = await resolvePersonalProfile(home);
    expect(source.legacy).toBe(true);
    expect(source.writePath).toBe(join(home, ".harness/harness.yaml"));
    const layers = await loadProfiles(join(project, "harness.yaml"), {});
    expect(layers.find((l) => l.scope === "personal")?.config.metadata.name).toBe("old");
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      "Using ~/.claude/harness.yaml. harness-kit now keeps your personal profile at ~/.harness/harness.yaml; move it there.",
    );
  });

  it("the new path wins when both exist, without a warning", async () => {
    await writeFile(join(home, ".claude/harness.yaml"), profile("old", "personal"));
    await writeFile(join(home, ".harness/harness.yaml"), profile("new", "personal"));
    const layers = await loadProfiles(join(project, "harness.yaml"), {});
    expect(layers.find((l) => l.scope === "personal")?.config.metadata.name).toBe("new");
    expect(warn).not.toHaveBeenCalled();
  });

  it("never reads ~/harness.yaml", async () => {
    await writeFile(join(home, "harness.yaml"), profile("home-root", "personal"));
    const layers = await loadProfiles(join(project, "harness.yaml"), {});
    expect(layers.find((l) => l.scope === "personal")).toBeUndefined();
  });

  it("capture --scope personal writes the new path and leaves the legacy file alone", async () => {
    const legacy = profile("old", "personal");
    await writeFile(join(home, ".claude/harness.yaml"), legacy);
    await captureCommand({ scope: "personal", yes: true });
    expect(await readFile(join(home, ".harness/harness.yaml"), "utf8")).toContain("version:");
    expect(await readFile(join(home, ".claude/harness.yaml"), "utf8")).toBe(legacy);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("~/.claude/harness.yaml"));
  });
});
