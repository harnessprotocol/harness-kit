import fs from 'node:fs';
import path from 'node:path';
import { MarkdownViewer } from '@/components/markdown-viewer';

export const metadata = {
  title: 'Changelog',
  description: 'Release history for harness-kit.',
};

export default function ChangelogPage() {
  const changelogPath = path.join(process.cwd(), '..', 'CHANGELOG.md');
  const content = fs.readFileSync(changelogPath, 'utf-8');

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <MarkdownViewer content={content} filename="CHANGELOG.md" />
    </div>
  );
}
