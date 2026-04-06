import type { SecurityScanStatus } from "@harness-kit/shared";

const COLORS: Record<SecurityScanStatus, string> = {
  passed: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  warnings: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  failed: "bg-red-500/20 text-red-400 border-red-500/30",
  not_scanned: "bg-gray-500/20 text-gray-400 border-gray-500/30",
};

const LABELS: Record<SecurityScanStatus, string> = {
  passed: "Security Scanned",
  warnings: "Warnings",
  failed: "Security Issues",
  not_scanned: "Not Scanned",
};

export function SecurityBadge({ status }: { status: SecurityScanStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${COLORS[status]}`}
    >
      {LABELS[status]}
    </span>
  );
}
