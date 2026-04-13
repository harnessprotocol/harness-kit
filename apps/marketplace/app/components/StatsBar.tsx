import type { ReactNode } from "react";

function Stat({ value, label }: { value: string; label: ReactNode }) {
  return (
    <div className="flex items-baseline gap-1.5 text-sm">
      <span className="font-display text-base font-semibold text-gray-100">{value}</span>
      <span className="text-gray-400">{label}</span>
    </div>
  );
}

export function StatsBar({
  pluginCount,
  totalInstalls,
  categoryCount,
}: {
  pluginCount: number;
  totalInstalls: number;
  categoryCount: number;
}) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-6 text-sm sm:gap-10">
      <Stat value={pluginCount.toString()} label="plugins" />
      <Stat value={totalInstalls.toLocaleString()} label="installs" />
      <Stat value={categoryCount.toString()} label="categories" />
      <div className="flex items-center gap-1.5 text-sm text-gray-400">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          width={14}
          height={14}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <line x1="6" y1="3" x2="6" y2="15" />
          <circle cx="18" cy="6" r="3" />
          <circle cx="6" cy="18" r="3" />
          <path d="M18 9a9 9 0 0 1-9 9" />
        </svg>
        Open source
      </div>
    </div>
  );
}
