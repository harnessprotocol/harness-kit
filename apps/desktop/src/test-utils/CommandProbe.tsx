import { useCommands } from "../lib/commands";

/**
 * Lists every registered ⌘K command for a test, without the palette's own
 * filtering. Each row is `cmd-<id>` with `data-disabled` mirroring `disabled`;
 * clicking it runs the command. Rows are spans, so they never match a page's
 * button queries.
 */
export function CommandProbe() {
  const commands = useCommands();
  return (
    <div data-testid="command-probe">
      {commands.map((command) => (
        <span
          key={command.id}
          data-testid={`cmd-${command.id}`}
          data-disabled={command.disabled ? "true" : "false"}
          onClick={() => void command.run()}
        >
          {command.title}
        </span>
      ))}
    </div>
  );
}
