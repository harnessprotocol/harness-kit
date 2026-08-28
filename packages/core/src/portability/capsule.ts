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

const MAX_CAPSULE_FILES = 1_000;
const MAX_CAPSULE_FILE_BYTES = 1024 * 1024;
const MAX_CAPSULE_BYTES = 10 * 1024 * 1024;
const EXCLUDED_CAPSULE_ENTRIES = new Set([".git", ".hg", ".svn", "node_modules", ".DS_Store"]);

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

const CREDENTIAL_ASSIGNMENT = /(?:^|[\s,{])["']?(?:authorization|token|auth[-_]?token|api[-_]?key|access[-_]?token|access[-_]?key|client[-_]?secret|password|passwd|private[-_]?key|secret|cookie)["']?\s*[:=]\s*([^\n,}]+)/gim;
const SECRET_REFERENCE = /^(?:\$[A-Za-z_][A-Za-z0-9_]*|\$\{[A-Za-z_][A-Za-z0-9_]*\}|env:[A-Za-z_][A-Za-z0-9_]*|secret:\/\/[^\s]+)$/;

function containsLiteralCredentialAssignment(content: string): boolean {
  for (const match of content.matchAll(CREDENTIAL_ASSIGNMENT)) {
    const value = match[1].trim().replace(/^["']|["']$/g, "").trim();
    if (value && !SECRET_REFERENCE.test(value)) return true;
  }
  return false;
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

/** Scan portable text before it is published or installed. */
export function scanPortableContent(path: string, content: string): CapsuleValidationFinding[] {
  const findings: CapsuleValidationFinding[] = [];
  if (
    /(?:ignore|override|disregard)\s+(?:all\s+)?(?:previous(?:\s+(?:system|developer))?|system|developer)\s+instructions/i.test(content) ||
    /(?:rm\s+-rf\s+[~/]|curl\s+[^\n|]+\|\s*(?:sh|bash)|chmod\s+777)/i.test(content)
  ) {
    findings.push({
      severity: "block",
      code: "dangerous-instruction",
      path,
      detail: "content contains a policy-bypassing or destructive instruction pattern",
    });
  }
  if (
    /(?:\.env(?:\b|\/)|security\s+find-generic-password|keychain|private[_-]?key|aws_secret_access_key)/i.test(content) ||
    containsLiteralCredentialAssignment(content)
  ) {
    findings.push({
      severity: "block",
      code: "secret-access",
      path,
      detail: "content declares direct secret access or contains a literal credential assignment",
    });
  }
  if (
    /(?:^|\/)(?:hooks?|commands?|scripts?|workflows?)(?:\/|$)/i.test(path) ||
    /\.(?:sh|bash|zsh|fish|ps1|bat|cmd|py|rb|pl|js|mjs|cjs|ts)$/i.test(path)
  ) {
    findings.push({
      severity: "warn",
      code: "executable-resource",
      path,
      detail: "artifact includes executable or command-bearing content that should be reviewed before publication",
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

  const validKinds = new Set([
    "plugin", "skill", "mcp-server", "env", "instructions", "permissions",
    "architectural-constraints", "policy", "extends", "native-extension",
  ]);
  if (
    !manifest ||
    typeof manifest !== "object" ||
    manifest.format !== "harness-capsule/v1" ||
    !manifest.identity ||
    !validKinds.has(manifest.identity.kind) ||
    typeof manifest.identity.source !== "string" ||
    manifest.identity.source.length === 0 ||
    typeof manifest.identity.name !== "string" ||
    manifest.identity.name.length === 0 ||
    typeof manifest.version !== "string" ||
    typeof manifest.entrypoint !== "string" ||
    !Array.isArray(manifest.files) ||
    typeof manifest.digest !== "string"
  ) {
    return {
      valid: false,
      findings: [{ severity: "block", code: "invalid-manifest", detail: "capsule manifest shape is invalid" }],
    };
  }
  if (!Array.isArray(files)) {
    return {
      valid: false,
      findings: [{ severity: "block", code: "invalid-manifest", detail: "capsule files must be an array" }],
    };
  }

  const declaredAliases = new Set<string>();
  if (manifest.files.length > MAX_CAPSULE_FILES || files.length > MAX_CAPSULE_FILES) {
    findings.push({ severity: "block", code: "size-limit", detail: `capsules may contain at most ${MAX_CAPSULE_FILES} files` });
  }
  for (const declaration of manifest.files) {
    if (
      !declaration ||
      typeof declaration.path !== "string" ||
      typeof declaration.digest !== "string" ||
      !/^sha256:[a-f0-9]{64}$/.test(declaration.digest)
    ) {
      findings.push({ severity: "block", code: "invalid-manifest", detail: "capsule file declaration is invalid" });
      continue;
    }
    if (declaredAliases.has(declaration.path)) {
      findings.push({ severity: "block", code: "duplicate-alias", path: declaration.path, detail: "manifest declares the same file more than once" });
    }
    declaredAliases.add(declaration.path);
  }

  let totalBytes = 0;
  for (const file of files) {
    if (!file || typeof file.path !== "string" || typeof file.content !== "string") {
      findings.push({ severity: "block", code: "invalid-manifest", detail: "capsule file shape is invalid" });
      continue;
    }
    if (!isSafeRelativePath(file.path)) {
      findings.push({ severity: "block", code: "path-escape", path: file.path, detail: "file path escapes the capsule root" });
      continue;
    }
    const bytes = new TextEncoder().encode(file.content).byteLength;
    totalBytes += bytes;
    if (bytes > MAX_CAPSULE_FILE_BYTES) {
      findings.push({ severity: "block", code: "size-limit", path: file.path, detail: "capsule file exceeds the 1 MiB limit" });
    }
    if (file.symlink) {
      findings.push({ severity: "block", code: "symlink", path: file.path, detail: "capsules may not contain symbolic links" });
    }
    if (byPath.has(file.path)) {
      findings.push({ severity: "block", code: "duplicate-alias", path: file.path, detail: "capsule declares the same file more than once" });
    }
    byPath.set(file.path, file);
    findings.push(...scanPortableContent(file.path, file.content));
  }
  if (totalBytes > MAX_CAPSULE_BYTES) {
    findings.push({ severity: "block", code: "size-limit", detail: "capsule content exceeds the 10 MiB total limit" });
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

  const declared = new Set(manifest.files.filter((file) => file && typeof file.path === "string").map((file) => file.path));
  for (const file of files) {
    if (!declared.has(file.path)) {
      findings.push({ severity: "block", code: "undeclared-file", path: file.path, detail: "file is not declared by the capsule manifest" });
    }
  }
  for (const declaration of manifest.files) {
    if (!declaration || typeof declaration.path !== "string" || typeof declaration.digest !== "string") continue;
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
    if (EXCLUDED_CAPSULE_ENTRIES.has(entry) || entry === ".env" || entry.startsWith(".env.")) continue;
    const childRelative = relative ? `${relative}/${entry}` : entry;
    const childFull = fs.joinPath(root, childRelative);
    if (fs.isSymlink && (await fs.isSymlink(childFull))) {
      output.push({ path: childRelative, content: "", symlink: true });
    } else if (await fs.isDirectory(childFull)) {
      await collectDirectory(fs, root, childRelative, output);
    } else {
      const content = await fs.readFile(childFull);
      const bytes = new TextEncoder().encode(content).byteLength;
      if (bytes > MAX_CAPSULE_FILE_BYTES) throw new Error(`capsule file exceeds the 1 MiB limit: ${childRelative}`);
      output.push({ path: childRelative, content });
      if (output.length > MAX_CAPSULE_FILES) throw new Error(`capsule contains more than ${MAX_CAPSULE_FILES} files`);
      const total = output.reduce((sum, file) => sum + new TextEncoder().encode(file.content).byteLength, 0);
      if (total > MAX_CAPSULE_BYTES) throw new Error("capsule content exceeds the 10 MiB total limit");
    }
  }
}

export async function collectCapsuleFiles(fs: FsProvider, root: string): Promise<CapsuleFile[]> {
  const files: CapsuleFile[] = [];
  await collectDirectory(fs, root, "", files);
  return files;
}
