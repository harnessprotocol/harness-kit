import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import type { RepoBoardLink } from "../types.js";

/**
 * Read .board.yaml from a repo root and return the board link config.
 * Returns null if no .board.yaml exists.
 */
export function readBoardLink(repoPath: string): RepoBoardLink | null {
  const linkFile = path.join(path.resolve(repoPath), ".board.yaml");
  if (!fs.existsSync(linkFile)) return null;
  try {
    const raw = fs.readFileSync(linkFile, "utf-8");
    return yaml.load(raw) as RepoBoardLink;
  } catch {
    return null;
  }
}

/**
 * Write a .board.yaml link file into a repo.
 */
export function writeBoardLink(repoPath: string, link: RepoBoardLink): void {
  const linkFile = path.join(path.resolve(repoPath), ".board.yaml");
  fs.writeFileSync(linkFile, yaml.dump(link), "utf-8");
}

/**
 * Given a project slug, scan a list of candidate repo roots to find
 * the one whose .board.yaml points to this project.
 * Returns the repo path or null if not found.
 */
export function findRepoForProject(projectSlug: string, candidateRoots: string[]): string | null {
  for (const root of candidateRoots) {
    const link = readBoardLink(root);
    if (link?.project === projectSlug) return path.resolve(root);
  }
  return null;
}

/**
 * Build the worktree path for a task.
 * Placed as a sibling directory to the repo root: ../{worktreeDirName}
 */
export function resolveWorktreePath(repoPath: string, worktreeDirName: string): string {
  const absRepo = path.resolve(repoPath);
  return path.join(path.dirname(absRepo), worktreeDirName);
}
