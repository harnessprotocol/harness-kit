const ICON_COLORS: Record<string, string> = {
  folder: "#d97706",
  md: "#3b82f6",
  py: "#22c55e",
  sh: "#a855f7",
  json: "#f97316",
  yaml: "#ec4899",
  yml: "#ec4899",
  html: "#ef4444",
  ts: "#2563eb",
  js: "#eab308",
  css: "#06b6d4",
  toml: "#f97316",
  txt: "#6b7280",
  default: "#9ca3af",
};

function getExtension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
}

interface FileTypeIconProps {
  name: string;
  kind: "file" | "directory";
  expanded?: boolean;
  size?: number;
}

export default function FileTypeIcon({ name, kind, expanded, size = 14 }: FileTypeIconProps) {
  if (kind === "directory") {
    const color = ICON_COLORS.folder;
    return expanded ? (
      <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
        <path
          d="M2 4.5c0-.83.67-1.5 1.5-1.5h3l1.5 1.5h4.5c.83 0 1.5.67 1.5 1.5v1H2V4.5z"
          fill={color}
        />
        <path
          d="M2 7h12v4.5c0 .83-.67 1.5-1.5 1.5h-9A1.5 1.5 0 012 11.5V7z"
          fill={color}
          opacity={0.7}
        />
      </svg>
    ) : (
      <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
        <path
          d="M2 4.5c0-.83.67-1.5 1.5-1.5h3l1.5 1.5h4.5c.83 0 1.5.67 1.5 1.5v5.5c0 .83-.67 1.5-1.5 1.5h-9A1.5 1.5 0 012 11.5v-7z"
          fill={color}
        />
      </svg>
    );
  }

  const ext = getExtension(name);
  const color = ICON_COLORS[ext] || ICON_COLORS.default;

  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <path
        d="M4 1.5h5.5L13 5v8.5c0 .83-.67 1.5-1.5 1.5h-7A1.5 1.5 0 013 13.5v-11c0-.55.45-1 1-1z"
        stroke={color}
        strokeWidth="1"
        fill="none"
      />
      <path d="M9.5 1.5V5H13" stroke={color} strokeWidth="1" strokeLinecap="round" />
      {ext && (
        <text
          x="8"
          y="12"
          textAnchor="middle"
          fontSize="4.5"
          fontWeight="700"
          fill={color}
          fontFamily="ui-monospace, monospace"
        >
          {ext.slice(0, 4).toUpperCase()}
        </text>
      )}
    </svg>
  );
}
