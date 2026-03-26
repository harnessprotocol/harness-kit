import type { SystemMessage } from "@harness-kit/shared";

const EVENT_LABELS: Record<SystemMessage["event"], string> = {
  join: "joined",
  leave: "left",
  room_created: "created this room",
  nick_change: "changed their name",
  shutdown: "shut down the server",
};

interface Props {
  message: SystemMessage;
}

export default function SystemEvent({ message }: Props) {
  const label = EVENT_LABELS[message.event] ?? message.event;
  return (
    <div
      style={{
        textAlign: "center",
        fontSize: "11px",
        color: "var(--fg-subtle)",
        padding: "4px 12px",
        userSelect: "none",
      }}
    >
      -- {message.nickname} {label} --
    </div>
  );
}
