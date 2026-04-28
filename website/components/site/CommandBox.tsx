export function CommandBox({ command }: { command: string }) {
  return (
    <div className="relative block w-full max-w-full sm:inline-block sm:w-auto">
      <div
        className="absolute -inset-[1px] rounded-xl blur-[1px]"
        style={{ background: 'linear-gradient(90deg, rgba(34,177,236,0.3), rgba(14,165,233,0.2), rgba(34,177,236,0.3))' }}
        aria-hidden="true"
      />
      <div className="relative overflow-x-auto whitespace-nowrap rounded-xl border border-white/5 bg-fd-card px-4 py-2.5 font-mono text-[12px] text-fd-foreground sm:px-5 sm:py-3 sm:text-sm">
        <span className="text-fd-muted-foreground" aria-hidden="true">$ </span>
        {command}
      </div>
    </div>
  );
}
