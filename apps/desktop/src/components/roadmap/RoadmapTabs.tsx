import { useState } from "react";

interface Props {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

const TABS = [
  { id: "kanban", label: "Kanban" },
  { id: "phases", label: "Phases" },
  { id: "features", label: "All Features" },
  { id: "priorities", label: "By Priority" },
];

export function RoadmapTabs({ activeTab, onTabChange }: Props) {
  const [hovered, setHovered] = useState<string | null>(null);

  return (
    <div
      style={{
        display: "flex",
        gap: 0,
        padding: "0 20px",
        borderBottom: "1px solid var(--border-subtle)",
        flexShrink: 0,
        background: "var(--bg-surface)",
      }}
    >
      {TABS.map((tab) => {
        const isActive = tab.id === activeTab;
        const isHovered = hovered === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            onMouseEnter={() => setHovered(tab.id)}
            onMouseLeave={() => setHovered(null)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              padding: "8px 12px",
              fontSize: 12,
              fontWeight: isActive ? 600 : 400,
              color: isActive
                ? "var(--text-primary)"
                : isHovered
                  ? "var(--text-primary)"
                  : "var(--text-muted)",
              background: "transparent",
              border: "none",
              borderBottom: isActive ? "2px solid var(--accent)" : "2px solid transparent",
              cursor: "pointer",
              whiteSpace: "nowrap",
              transition: "color 0.1s, border-color 0.1s",
              marginBottom: -1,
            }}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
