type Props = {
  title: string;
  description: string;
};

export default function ComingSoonPage({ title, description }: Props) {
  return (
    <div className="flex flex-col items-center justify-center h-full p-12 text-center">
      <div
        className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl mb-4"
        style={{ background: "var(--accent-light)" }}
      >
        🚧
      </div>
      <h1 className="text-xl font-semibold tracking-tight mb-2" style={{ color: "var(--fg-base)" }}>
        {title}
      </h1>
      <p className="text-sm max-w-sm" style={{ color: "var(--fg-muted)" }}>
        {description}
      </p>
      <p className="text-xs mt-3" style={{ color: "var(--fg-subtle)" }}>
        Coming in a future phase.
      </p>
    </div>
  );
}
