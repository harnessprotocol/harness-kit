import type { FsProvider } from "../fs-provider.js";
import { digestValue } from "./resource-model.js";
import type {
  CapsuleManifest,
  CapsuleValidationFinding,
  CapsuleValidationResult,
  ReleaseDigest,
  ResourceIdentity,
} from "./types.js";

export interface CapsuleFile {
  path: string;
  content: string;
  symlink?: boolean;
}

function isSafeRelativePath(path: string): boolean {
  return (
    path.length > 0 &&
    !path.startsWith("/") &&
    !path.startsWith("~") &&
    !path.includes("\\") &&
    !path.split("/").some((part) => part === "" || part === "." || part === "..")
  );
}

function fileDigest(content: string): ReleaseDigest {
  return digestValue(content);
}

function capsuleDigest(manifest: Omit<CapsuleManifest, "digest">): ReleaseDigest {
  return digestValue(manifest);
}

export function createCapsuleManifest(
  identity: ResourceIdentity,
  version: string,
  entrypoint: string,
  files: CapsuleFile[],
): CapsuleManifest {
  const partial: Omit<CapsuleManifest, "digest"> = {
    format: "harness-capsule/v1",
    identity,
    version,
    entrypoint,
    files: files
      .map((file) => ({ path: file.path, digest: fileDigest(file.content) }))
      .sort((a, b) => a.path.localeCompare(b.path)),
  };
  return { ...partial, digest: capsuleDigest(partial) };
}

function scanContent(path: string, content: string): CapsuleValidationFinding[] {
  const findings: CapsuleValidationFinding[] = [];
  if (
    /(?:ignore|override|disregard)\s+(?:all\s+)?(?:previous|system|developer)\s+instructions/i.test(content) ||
    /(?:rm\s+-rf\s+[~/]|curl\s+[^\n|]+\|\s*(?:sh|bash)|chmod\s+777)/i.test(content)
  ) {
    findings.push({
      severity: "block",
      code: "dangerous-instruction",
      path,
      detail: "content contains a policy-bypassing or destructive instruction pattern",
    });
  }
  if (/(?:\.env(?:\b|\/)|security\s+find-generic-password|keychain|private[_-]?key|aws_secret_access_key)/i.test(content)) {
    findings.push({
      severity: "block",
      code: "secret-access",
      path,
      detail: "content declares direct access to secret-bearing files or credential stores",
    });
  }
  return findings;
}

export function validateCapsule(
  manifest: CapsuleManifest,
  files: CapsuleFile[],
): CapsuleValidationResult {
  const findings: CapsuleValidationFinding[] = [];
  const byPath = new Map<string, CapsuleFile>();

  for (const file of files) {
    if (!isSafeRelativePath(file.path)) {
      findings.push({ severity: "block", code: "path-escape", path: file.path, detail: "file path escapes the capsule root" });
      continue;
    }
    if (file.symlink) {
      findings.push({ severity: "block", code: "symlink", path: file.path, detail: "capsules may not contain symbolic links" });
    }
    if (byPath.has(file.path)) {
      findings.push({ severity: "block", code: "duplicate-alias", path: file.path, detail: "capsule declares the same file more than once" });
    }
    byPath.set(file.path, file);
    findings.push(...scanContent(file.path, file.content));
  }

  if (!isSafeRelativePath(manifest.entrypoint) || !byPath.has(manifest.entrypoint)) {
    findings.push({
      severity: "block",
      code: "invalid-entrypoint",
      path: manifest.entrypoint,
      detail: "entrypoint must be a declared file inside the capsule",
    });
  }
  if (manifest.identity.kind === "skill" && !manifest.entrypoint.endsWith("SKILL.md")) {
    findings.push({
      severity: "block",
      code: "invalid-entrypoint",
      path: manifest.entrypoint,
      detail: "a skill capsule entrypoint must be SKILL.md",
    });
  }
  if (manifest.identity.kind === "skill") {
    const entrypoint = byPath.get(manifest.entrypoint)?.content ?? "";
    const frontmatter = entrypoint.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)?.[1];
    if (
      !frontmatter ||
      !/^name:\s*[^\s].*$/m.test(frontmatter) ||
      !/^description:\s*[^\s].*$/m.test(frontmatter)
    ) {
      findings.push({
        severity: "block",
        code: "invalid-frontmatter",
        path: manifest.entrypoint,
        detail: "a skill capsule requires name and description fields in YAML frontmatter",
      });
    }
  }

  const declared = new Set(manifest.files.map((file) => file.path));
  for (const file of files) {
    if (!declared.has(file.path)) {
      findings.push({ severity: "block", code: "undeclared-file", path: file.path, detail: "file is not declared by the capsule manifest" });
    }
  }
  for (const declaration of manifest.files) {
    const file = byPath.get(declaration.path);
    if (!file || declaration.digest !== fileDigest(file.content)) {
      findings.push({ severity: "block", code: "digest-mismatch", path: declaration.path, detail: "declared file digest does not match content" });
    }
  }

  const expectedDigest = capsuleDigest({
    format: manifest.format,
    identity: manifest.identity,
    version: manifest.version,
    entrypoint: manifest.entrypoint,
    files: manifest.files,
  });
  if (manifest.digest !== expectedDigest) {
    findings.push({ severity: "block", code: "digest-mismatch", detail: "capsule manifest digest does not match its declarations" });
  }

  return { valid: !findings.some((finding) => finding.severity === "block"), findings };
}

async function collectDirectory(
  fs: FsProvider,
  root: string,
  relative: string,
  output: CapsuleFile[],
): Promise<void> {
  const fullPath = relative ? fs.joinPath(root, relative) : root;
  const entries = (await (fs.readDirAll ? fs.readDirAll(fullPath) : fs.readDir(fullPath))).sort();
  for (const entry of entries) {
    const childRelative = relative ? `${relative}/${entry}` : entry;
    const childFull = fs.joinPath(root, childRelative);
    if (fs.isSymlink && (await fs.isSymlink(childFull))) {
      output.push({ path: childRelative, content: "", symlink: true });
    } else if (await fs.isDirectory(childFull)) {
      await collectDirectory(fs, root, childRelative, output);
    } else {
      output.push({ path: childRelative, content: await fs.readFile(childFull) });
    }
  }
}

export async function collectCapsuleFiles(fs: FsProvider, root: string): Promise<CapsuleFile[]> {
  const files: CapsuleFile[] = [];
  await collectDirectory(fs, root, "", files);
  return files;
}
