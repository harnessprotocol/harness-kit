import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

const IMAGES_DIR = path.join(os.homedir(), '.harness', 'board', 'images');

function imageDir(slug: string): string {
  return path.join(IMAGES_DIR, slug);
}

export function saveImage(slug: string, data: Buffer, ext: string): string {
  const dir = imageDir(slug);
  fs.mkdirSync(dir, { recursive: true });
  const id = crypto.randomUUID();
  const filename = `${id}${ext.startsWith('.') ? ext : `.${ext}`}`;
  fs.writeFileSync(path.join(dir, filename), data);
  return id;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function getImagePath(slug: string, imageId: string): string | null {
  // Validate UUID format to prevent matching unintended files
  if (!UUID_RE.test(imageId)) return null;
  const dir = imageDir(slug);
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir);
  const file = files.find(f => f.startsWith(imageId));
  return file ? path.join(dir, file) : null;
}

export function deleteImage(slug: string, imageId: string): void {
  const p = getImagePath(slug, imageId);
  if (p) fs.unlinkSync(p);
}
