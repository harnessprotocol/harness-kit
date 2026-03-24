interface Props {
  typingMembers: string[]; // nicknames of people currently typing (NOT the current user)
}

export function TypingIndicator({ typingMembers }: Props) {
  if (typingMembers.length === 0) return null;

  let text: string;
  if (typingMembers.length === 1) {
    text = `${typingMembers[0]} is typing…`;
  } else if (typingMembers.length === 2) {
    text = `${typingMembers[0]} and ${typingMembers[1]} are typing…`;
  } else {
    text = `${typingMembers.length} people are typing…`;
  }

  return (
    <div className="px-3 py-1 text-xs text-muted-foreground italic">
      {text}
    </div>
  );
}
