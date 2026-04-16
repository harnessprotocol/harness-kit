interface SectionHeaderProps {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  centered?: boolean;
}

export function SectionHeader({ eyebrow, title, subtitle, centered = true }: SectionHeaderProps) {
  return (
    <div className={`mb-12 ${centered ? 'text-center' : ''}`}>
      {eyebrow && (
        <div
          className="mb-3 inline-block text-xs font-semibold uppercase tracking-[0.1em]"
          style={{ color: 'var(--accent)' }}
        >
          {eyebrow}
        </div>
      )}
      <h2 className="font-display text-3xl font-bold tracking-tight text-fd-foreground sm:text-4xl">
        {title}
      </h2>
      {subtitle && (
        <p className={`mt-4 text-base leading-relaxed text-fd-muted-foreground ${centered ? 'mx-auto max-w-xl' : ''}`}>
          {subtitle}
        </p>
      )}
    </div>
  );
}
