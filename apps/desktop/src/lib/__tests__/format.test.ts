import { describe, it, expect } from "vitest";
import {
  formatNumber,
  formatDuration,
  formatDate,
  formatTimestamp,
  formatHour,
  shortModelName,
  daysBetween,
} from "../format";

// ── formatNumber ──────────────────────────────────────────────

describe("formatNumber", () => {
  it("formats 1234 with comma separator", () => {
    expect(formatNumber(1234)).toBe("1,234");
  });

  it("formats 0 as '0'", () => {
    expect(formatNumber(0)).toBe("0");
  });

  it("formats 1000000 as '1,000,000'", () => {
    expect(formatNumber(1_000_000)).toBe("1,000,000");
  });

  it("formats 408 without comma (3-digit number)", () => {
    expect(formatNumber(408)).toBe("408");
  });

  it("formats 2814 with comma", () => {
    expect(formatNumber(2814)).toBe("2,814");
  });
});

// ── formatDuration ────────────────────────────────────────────

describe("formatDuration", () => {
  it("formats 42 minutes as '42m'", () => {
    expect(formatDuration(42 * 60 * 1000)).toBe("42m");
  });

  it("formats 3 hours 42 minutes as '3h 42m'", () => {
    expect(formatDuration(3 * 3_600_000 + 42 * 60_000)).toBe("3h 42m");
  });

  it("formats exactly 1 minute as '1m'", () => {
    expect(formatDuration(60_000)).toBe("1m");
  });

  it("formats 0 ms as '0m'", () => {
    expect(formatDuration(0)).toBe("0m");
  });

  it("formats hours with 0 leftover minutes correctly", () => {
    expect(formatDuration(2 * 3_600_000)).toBe("2h 0m");
  });

  it("formats 1 hour 1 minute as '1h 1m'", () => {
    expect(formatDuration(3_600_000 + 60_000)).toBe("1h 1m");
  });
});

// ── formatDate ────────────────────────────────────────────────

describe("formatDate", () => {
  it("formats '2026-02-08' as 'Feb 8'", () => {
    expect(formatDate("2026-02-08")).toBe("Feb 8");
  });

  it("formats '2026-01-01' as 'Jan 1'", () => {
    expect(formatDate("2026-01-01")).toBe("Jan 1");
  });

  it("formats a December date correctly", () => {
    expect(formatDate("2026-12-25")).toBe("Dec 25");
  });

  it("formats a double-digit day correctly", () => {
    expect(formatDate("2026-03-15")).toBe("Mar 15");
  });
});

// ── formatHour ────────────────────────────────────────────────

describe("formatHour", () => {
  it("formats 0 as '12am'", () => {
    expect(formatHour(0)).toBe("12am");
  });

  it("formats 12 as '12pm'", () => {
    expect(formatHour(12)).toBe("12pm");
  });

  it("formats 17 as '5pm'", () => {
    expect(formatHour(17)).toBe("5pm");
  });

  it("formats 1 as '1am'", () => {
    expect(formatHour(1)).toBe("1am");
  });

  it("formats 23 as '11pm'", () => {
    expect(formatHour(23)).toBe("11pm");
  });

  it("formats 11 as '11am'", () => {
    expect(formatHour(11)).toBe("11am");
  });

  it("formats 13 as '1pm'", () => {
    expect(formatHour(13)).toBe("1pm");
  });
});

// ── shortModelName ────────────────────────────────────────────

describe("shortModelName", () => {
  it("converts 'claude-sonnet-4-6' to 'Sonnet 4.6'", () => {
    expect(shortModelName("claude-sonnet-4-6")).toBe("Sonnet 4.6");
  });

  it("converts 'claude-opus-4-6' to 'Opus 4.6'", () => {
    expect(shortModelName("claude-opus-4-6")).toBe("Opus 4.6");
  });

  it("converts 'claude-haiku-4-5-20251001' to 'Haiku 4.5' (strips date suffix)", () => {
    expect(shortModelName("claude-haiku-4-5-20251001")).toBe("Haiku 4.5");
  });

  it("passes through unknown model names unchanged", () => {
    expect(shortModelName("unknown-model")).toBe("unknown-model");
  });

  it("passes through a string that looks like a model but has no version digits", () => {
    expect(shortModelName("claude-sonnet")).toBe("claude-sonnet");
  });
});

// ── daysBetween ───────────────────────────────────────────────

describe("daysBetween", () => {
  it("returns 0 when date string and now are the same day", () => {
    expect(daysBetween("2026-03-15", new Date("2026-03-15T12:00:00"))).toBe(0);
  });

  it("returns 3 when date is 3 days before now", () => {
    expect(daysBetween("2026-03-12", new Date("2026-03-15T12:00:00"))).toBe(3);
  });

  it("returns 7 for a week difference", () => {
    expect(daysBetween("2026-01-01", new Date("2026-01-08T12:00:00"))).toBe(7);
  });

  it("returns 0 when now is just a few hours after midnight of the date", () => {
    // midnight + 6 hours is still the same calendar day (less than 24h)
    expect(daysBetween("2026-03-15", new Date("2026-03-15T06:00:00"))).toBe(0);
  });

  it("returns 1 for yesterday", () => {
    expect(daysBetween("2026-03-14", new Date("2026-03-15T12:00:00"))).toBe(1);
  });
});

// ── formatTimestamp ────────────────────────────────────────────

describe("formatTimestamp", () => {
  it("formats a Unix ms timestamp to a readable date string", () => {
    const result = formatTimestamp(1741824600000);
    // Month and year should appear regardless of timezone
    expect(result).toMatch(/Mar/);
    expect(result).toMatch(/20(25|26)/);
  });

  it("includes time component", () => {
    const result = formatTimestamp(1741824600000);
    expect(result).toMatch(/\d{1,2}:\d{2}/);
  });

  it("returns a non-empty string for epoch", () => {
    const result = formatTimestamp(0);
    expect(result.length).toBeGreaterThan(0);
    expect(result).toMatch(/\d{4}/); // contains a year
  });
});
