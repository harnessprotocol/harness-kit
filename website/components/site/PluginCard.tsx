import Link from 'next/link';

interface PluginCardProps {
  name: string;
  description: string;
  href: string;
  accent: string;
}

export function PluginCard({ name, description, href, accent }: PluginCardProps) {
  return (
    <Link
      href={href}
      className="group rounded-xl border border-fd-border/50 bg-fd-card/80 p-5 no-underline transition-all duration-300 hover:border-fd-primary/30 hover:shadow-lg"
      style={{ borderTop: `2px solid ${accent}` }}
    >
      <h4
        className="mb-1.5 font-mono text-sm font-semibold"
        style={{ color: 'var(--accent-fg)' }}
      >
        {name}
      </h4>
      <p className="text-sm leading-relaxed text-fd-muted-foreground">
        {description}
      </p>
    </Link>
  );
}
