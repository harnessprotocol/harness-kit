export function HeroGlow({ className = '' }: { className?: string }) {
  return (
    <>
      <div
        className={`pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/4 ${className}`}
        aria-hidden="true"
      >
        <div
          className="h-[500px] w-[700px] rounded-full blur-[120px]"
          style={{ background: 'var(--accent-glow)' }}
        />
      </div>
      <div
        className="absolute inset-0 bg-gradient-to-b from-[color:var(--accent-glow)]/5 via-transparent to-transparent pointer-events-none"
        aria-hidden="true"
      />
    </>
  );
}
