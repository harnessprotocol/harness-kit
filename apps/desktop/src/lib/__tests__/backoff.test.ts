import { describe, it, expect } from "vitest";
import { nextBackoffMs, resetBackoffMs } from "../backoff";

describe("nextBackoffMs", () => {
  it("doubles the interval each call", () => {
    expect(nextBackoffMs(2000)).toBe(4000);
    expect(nextBackoffMs(4000)).toBe(8000);
    expect(nextBackoffMs(8000)).toBe(16000);
  });

  it("caps at 30 seconds", () => {
    expect(nextBackoffMs(30000)).toBe(30000);
    expect(nextBackoffMs(20000)).toBe(30000);
  });

  it("never returns below min", () => {
    expect(nextBackoffMs(0)).toBe(2000);
    expect(nextBackoffMs(1000)).toBe(2000);
  });
});

describe("resetBackoffMs", () => {
  it("returns the minimum interval", () => {
    expect(resetBackoffMs()).toBe(2000);
  });
});
