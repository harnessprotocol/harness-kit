import type { CSSProperties } from "react";
import SectionCard from "./SectionCard";

interface ExtendEntry {
  source: string;
  version?: string;
}

interface ExtendsSectionProps {
  extends_: ExtendEntry[];
}

const versionBadgeStyle: CSSProperties = {
  fontSize: "10px",
  padding: "1px 6px",
  borderRadius: "10px",
  background: "var(--bg-elevated)",
  color: "var(--fg-subtle)",
  flexShrink: 0,
};

export default function ExtendsSection({ extends_ }: ExtendsSectionProps) {
  return (
    <SectionCard
      label="Extends"
      explanation="Other harness profiles this one inherits from."
      count={extends_.length}
    >
      <div className="row-list">
        {extends_.map((entry, i) => (
          <div key={`${entry.source}-${i}`} className="row-list-item">
            <code style={{
              fontFamily: "ui-monospace, monospace",
              fontSize: "12px",
              color: "var(--fg-base)",
              flex: 1,
              minWidth: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}>
              {entry.source}
            </code>
            {entry.version && (
              <span style={versionBadgeStyle}>{entry.version}</span>
            )}
          </div>
        ))}
      </div>
    </SectionCard>
  );
}
