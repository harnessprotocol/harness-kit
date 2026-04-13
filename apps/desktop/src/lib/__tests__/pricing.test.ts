import { describe, expect, it } from "vitest";
import { estimateCost, estimateTotalCost, formatCost, MODEL_PRICING } from "../pricing";

describe("pricing", () => {
  describe("estimateCost", () => {
    it("calculates correct cost for a known model (sonnet: 1M input + 1M output = $18.00)", () => {
      const cost = estimateCost("claude-sonnet-4-6", 1_000_000, 1_000_000);
      expect(cost).toBeCloseTo(18.0, 5);
    });

    it("calculates correct cost for haiku (1M input + 1M output = $4.80)", () => {
      const cost = estimateCost("claude-haiku-4-5", 1_000_000, 1_000_000);
      expect(cost).toBeCloseTo(4.8, 5);
    });

    it("falls back to default pricing for an unknown model", () => {
      const cost = estimateCost("unknown-model-xyz", 1_000_000, 1_000_000);
      // Default is sonnet-equivalent: $3 + $15 = $18
      expect(cost).toBeCloseTo(18.0, 5);
    });

    it("returns $0.00 for zero tokens", () => {
      expect(estimateCost("claude-sonnet-4-6", 0, 0)).toBe(0);
    });

    it("handles fractional token counts (real-world small sessions)", () => {
      // 10k input, 2k output for sonnet: (10/1000)*3 + (2/1000)*15 = 0.03 + 0.03 = 0.06
      const cost = estimateCost("claude-sonnet-4-6", 10_000, 2_000);
      expect(cost).toBeCloseTo(0.06, 5);
    });
  });

  describe("estimateTotalCost", () => {
    it("sums costs across multiple models correctly", () => {
      const usage = {
        "claude-sonnet-4-6": { inputTokens: 1_000_000, outputTokens: 0 },
        "claude-haiku-4-5": { inputTokens: 0, outputTokens: 1_000_000 },
      };
      // sonnet: $3.00 input, haiku: $4.00 output → $7.00
      expect(estimateTotalCost(usage)).toBeCloseTo(7.0, 5);
    });

    it("returns $0.00 for empty usage map", () => {
      expect(estimateTotalCost({})).toBe(0);
    });

    it("handles missing inputTokens or outputTokens (defaults to 0)", () => {
      const cost = estimateTotalCost({
        "claude-sonnet-4-6": { inputTokens: 1_000_000 }, // no outputTokens
      });
      expect(cost).toBeCloseTo(3.0, 5);
    });
  });

  describe("formatCost", () => {
    it("formats zero as $0.00", () => {
      expect(formatCost(0)).toBe("$0.00");
    });

    it("formats sub-cent amounts as <$0.01", () => {
      expect(formatCost(0.001)).toBe("<$0.01");
    });

    it("formats normal amounts with 2 decimal places", () => {
      expect(formatCost(1.234)).toBe("$1.23");
      expect(formatCost(0.84)).toBe("$0.84");
    });
  });

  describe("MODEL_PRICING table", () => {
    it("contains entries for all major Claude model families", () => {
      const keys = Object.keys(MODEL_PRICING);
      expect(keys.some((k) => k.includes("sonnet"))).toBe(true);
      expect(keys.some((k) => k.includes("haiku"))).toBe(true);
      expect(keys.some((k) => k.includes("opus"))).toBe(true);
    });
  });
});
