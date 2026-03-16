/**
 * Shared formatting utilities for Observatory and other pages.
 */

export function formatNumber(n: number): string {
  return n.toLocaleString();
}

/** Format milliseconds as "3h 42m" or "42m" */
export function formatDuration(ms: number): string {
  const totalMinutes = Math.floor(ms / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

/** "2026-02-08" → "Feb 8" */
export function formatDate(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** Unix ms timestamp → "Feb 8, 2026, 6:50 PM" */
export function formatTimestamp(ms: number): string {
  const date = new Date(ms);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** 0 → "12am", 12 → "12pm", 17 → "5pm" */
export function formatHour(hour: number): string {
  if (hour === 0) return "12am";
  if (hour === 12) return "12pm";
  if (hour < 12) return `${hour}am`;
  return `${hour - 12}pm`;
}

/**
 * "claude-sonnet-4-6" → "Sonnet 4.6"
 * "claude-opus-4-6" → "Opus 4.6"
 * "claude-haiku-4-5-20251001" → "Haiku 4.5"
 * Passes through unknown model names unchanged.
 */
export function shortModelName(model: string): string {
  const match = model.match(/^claude-(opus|sonnet|haiku)-(\d+)-(\d+)/i);
  if (match) {
    const name = match[1].charAt(0).toUpperCase() + match[1].slice(1);
    return `${name} ${match[2]}.${match[3]}`;
  }
  return model;
}

/** Number of whole days between a date string and now (or provided Date) */
export function daysBetween(dateStr: string, now: Date = new Date()): number {
  const date = new Date(dateStr + "T00:00:00");
  return Math.floor((now.getTime() - date.getTime()) / (1_000 * 60 * 60 * 24));
}
