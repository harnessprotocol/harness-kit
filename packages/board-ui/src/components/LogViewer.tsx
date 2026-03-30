import { useEffect, useRef, useState, useCallback } from 'react';
import { cn } from '../lib/utils';

interface Props {
  lines: string[];
  maxLines?: number;
  className?: string;
  autoScroll?: boolean;
}

// Strip basic ANSI escape codes for plain display
function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1B\[[0-9;]*[mGKHF]/g, '');
}

function classifyLine(line: string): string {
  const lower = line.toLowerCase();
  if (lower.includes('error') || lower.includes('failed') || lower.includes('✗')) return 'text-[var(--destructive)]';
  if (lower.includes('warning') || lower.includes('warn')) return 'text-[var(--warning)]';
  if (lower.includes('success') || lower.includes('✓') || lower.includes('complete')) return 'text-[var(--success)]';
  if (lower.startsWith('__exec_phase__')) return 'text-[var(--info)]';
  return 'text-[#a0a0a8]'; // neutral terminal text
}

export function LogViewer({ lines, maxLines = 1000, className, autoScroll = true }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);

  const visible = lines.slice(-maxLines);

  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 20;
    setIsAtBottom(atBottom);
  }, []);

  useEffect(() => {
    if (autoScroll && isAtBottom) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [visible.length, autoScroll, isAtBottom]);

  if (!visible.length) {
    return (
      <div className={cn('flex items-center justify-center rounded-lg bg-[#0b0b0f] p-8 text-xs text-[#5c5c64]', className)}>
        No execution logs yet
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className={cn(
        'overflow-y-auto rounded-lg bg-[#0b0b0f] p-3 font-mono text-[11px] leading-relaxed',
        className,
      )}
      style={{ maxHeight: '400px' }}
    >
      {visible.map((line, i) => (
        <div key={i} className={cn('whitespace-pre-wrap break-all', classifyLine(line))}>
          {stripAnsi(line)}
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
