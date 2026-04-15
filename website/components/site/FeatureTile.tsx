import Link from 'next/link';
import type { ReactNode } from 'react';

interface FeatureTileProps {
  icon: ReactNode;
  title: string;
  description: string;
  href?: string;
  accent?: string;
}

export function FeatureTile({ icon, title, description, href, accent }: FeatureTileProps) {
  const iconBg = accent ? `color-mix(in srgb, ${accent} 15%, transparent)` : 'var(--accent-light)';
  const iconColor = accent ?? 'var(--accent)';

  const inner = (
    <>
      <div
        className="mb-4 flex size-10 items-center justify-center rounded-lg"
        style={{ background: iconBg, color: iconColor }}
      >
        {icon}
      </div>
      <h3 className="font-display mb-2 font-semibold text-fd-foreground">
        {title}
      </h3>
      <p className="text-sm leading-relaxed text-fd-muted-foreground">
        {description}
      </p>
      {href && (
        <p
          className="mt-4 text-sm font-medium opacity-0 transition-opacity duration-300 group-hover:opacity-100"
          style={{ color: iconColor }}
        >
          Explore →
        </p>
      )}
    </>
  );

  const cls = `group rounded-xl border border-fd-border/50 bg-fd-background/80 p-6 backdrop-blur-sm transition-all duration-300 hover:border-fd-primary/20 hover:shadow-lg${href ? ' cursor-pointer no-underline block' : ''}`;
  const style = accent ? { borderTop: `2px solid ${accent}` } : undefined;

  if (href) {
    return (
      <Link href={href} className={cls} style={style}>
        {inner}
      </Link>
    );
  }

  return (
    <div className={cls} style={style}>
      {inner}
    </div>
  );
}
