type Props = {
  title: string;
  description: string;
};

export default function ComingSoonPage({ title, description }: Props) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "100%",
        gap: "4px",
      }}
    >
      <p style={{ fontSize: "13px", fontWeight: 500, color: "var(--fg-muted)", margin: 0 }}>
        {title}
      </p>
      <p style={{ fontSize: "11px", color: "var(--fg-subtle)", margin: 0 }}>
        {description} — coming soon
      </p>
    </div>
  );
}
