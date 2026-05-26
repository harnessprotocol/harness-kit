export function CommandBox({ command }: { command: string }) {
  return (
    <div className="relative block w-full max-w-full sm:inline-block sm:w-auto">
      <div className="relative overflow-x-auto whitespace-nowrap rounded-xl bg-fd-card px-4 py-2.5 font-mono text-[12px] text-fd-foreground shadow-[var(--shadow-sm)] sm:px-5 sm:py-3 sm:text-sm">
        <span className="text-fd-muted-foreground" aria-hidden="true">$ </span>
        {command}
      </div>
    </div>
  );
}
