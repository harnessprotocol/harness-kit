/** Maps a category slug to one of the site's categorical accent tokens. */
const CATEGORY_ACCENT: Record<string, string> = {
  'research-knowledge': 'var(--cat-cyan)',
  'code-quality': 'var(--cat-blue)',
  'data-engineering': 'var(--cat-purple)',
  documentation: 'var(--cat-blue)',
  devops: 'var(--cat-green)',
  productivity: 'var(--cat-purple)',
  design: 'var(--cat-cyan)',
};

export function categoryAccent(slug: string): string {
  return CATEGORY_ACCENT[slug] ?? 'var(--accent)';
}
