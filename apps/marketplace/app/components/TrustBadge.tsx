export function TrustBadge({ tier }: { tier: string }) {
  const colors: Record<string, string> = {
    official: "bg-violet-500/20 text-violet-400 border-violet-500/30",
    verified: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
    "security-scanned": "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
    community: "bg-gray-500/20 text-gray-400 border-gray-500/30",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${colors[tier] ?? colors.community}`}
    >
      {tier}
    </span>
  );
}
