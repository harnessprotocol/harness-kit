export function relativeDate(dateStr: string | undefined): string {
  if (!dateStr) return "\u2014";
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return "\u2014";
  const now = Date.now();
  const diff = now - date.getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

export function formatComponentCounts(counts?: {
  skills: number;
  agents: number;
  scripts: number;
}): string {
  if (!counts) return "";
  const parts: string[] = [];
  if (counts.skills > 0) parts.push(`${counts.skills} skill${counts.skills !== 1 ? "s" : ""}`);
  if (counts.agents > 0) parts.push(`${counts.agents} agent${counts.agents !== 1 ? "s" : ""}`);
  if (counts.scripts > 0) parts.push(`${counts.scripts} script${counts.scripts !== 1 ? "s" : ""}`);
  return parts.join(", ");
}
