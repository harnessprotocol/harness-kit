import Link from 'next/link';
import type { ReactNode } from 'react';

interface FeatureTileProps {
  icon: ReactNode;
  title: string;
  description: string;
  href?: string;
  accent?: string;
}

export function FeatureTile({ icon, title, description, href }: FeatureTileProps) {
  // Restrained: a single brand accent for every tile, no rainbow category colors.
  const iconBg = 'var(--accent-light)';
  const iconColor = 'var(--accent)';

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

  const cls = `group surface-card rounded-xl p-6${href ? ' cursor-pointer no-underline block' : ''}`;

  if (href) {
    return (
      <Link href={href} className={cls}>
        {inner}
      </Link>
    );
  }

  return <div className={cls}>{inner}</div>;
}
