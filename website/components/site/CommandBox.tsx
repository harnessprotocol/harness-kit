export function CommandBox({ command }: { command: string }) {
  return (
    <div className="relative inline-block">
      <div
        className="absolute -inset-[1px] rounded-xl blur-[1px]"
        style={{ background: 'linear-gradient(90deg, rgba(34,177,236,0.3), rgba(14,165,233,0.2), rgba(34,177,236,0.3))' }}
        aria-hidden="true"
      />
      <div className="relative rounded-xl border border-white/5 bg-fd-card px-5 py-3 font-mono text-sm text-fd-foreground">
        <span className="text-fd-muted-foreground" aria-hidden="true">$ </span>
        {command}
      </div>
    </div>
  );
}
