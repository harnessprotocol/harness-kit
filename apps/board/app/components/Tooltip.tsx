'use client';

import { useState, useRef, useEffect, type ReactNode } from 'react';
import { cn } from '../lib/utils';

interface Props {
  text: string;
  children: ReactNode;
  position?: 'top' | 'bottom' | 'left' | 'right';
  delay?: number;
}

export function Tooltip({ text, children, position = 'top', delay = 400 }: Props) {
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleEnter() {
    timerRef.current = setTimeout(() => setVisible(true), delay);
  }

  function handleLeave() {
    if (timerRef.current) clearTimeout(timerRef.current);
    setVisible(false);
  }

  useEffect(() => {
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);

  return (
    <span
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
      className="relative inline-flex"
    >
      {children}
      {visible && (
        <span
          role="tooltip"
          className={cn(
            'absolute z-[100] rounded-[6px] border border-[var(--border)] bg-[var(--bg-elevated)] px-2.5 py-[5px] text-[12px] text-[var(--text-secondary)] whitespace-nowrap pointer-events-none max-w-[260px] leading-[1.4] shadow-[0_4px_12px_rgba(0,0,0,0.3)]',
            position === 'top' && 'bottom-full left-1/2 -translate-x-1/2 mb-1.5',
            position === 'bottom' && 'top-full left-1/2 -translate-x-1/2 mt-1.5',
            position === 'left' && 'right-full top-1/2 -translate-y-1/2 mr-1.5',
            position === 'right' && 'left-full top-1/2 -translate-y-1/2 ml-1.5',
          )}
        >
          {text}
        </span>
      )}
    </span>
  );
}
