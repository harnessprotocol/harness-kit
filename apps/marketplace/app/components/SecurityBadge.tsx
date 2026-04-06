export function SecurityBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    "security-scanned": "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
    warnings: "bg-amber-500/20 text-amber-400 border-amber-500/30",
    "not-scanned": "bg-gray-500/20 text-gray-400 border-gray-500/30",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${colors[status] ?? colors["not-scanned"]}`}
    >
      {status}
    </span>
  );
}
