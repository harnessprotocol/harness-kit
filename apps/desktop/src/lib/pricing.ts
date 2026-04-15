export interface ModelPricing {
  inputPer1M: number;   // USD per 1M input tokens
  outputPer1M: number;  // USD per 1M output tokens
}

export const MODEL_PRICING: Record<string, ModelPricing> = {
  // Claude 4.x
  "claude-sonnet-4-6":              { inputPer1M: 3.00,  outputPer1M: 15.00 },
  "claude-opus-4-6":                { inputPer1M: 15.00, outputPer1M: 75.00 },
  "claude-haiku-4-5":               { inputPer1M: 0.80,  outputPer1M: 4.00  },
  "claude-haiku-4-5-20251001":      { inputPer1M: 0.80,  outputPer1M: 4.00  },
  // Claude 3.x
  "claude-3-5-sonnet-20241022":     { inputPer1M: 3.00,  outputPer1M: 15.00 },
  "claude-3-5-haiku-20241022":      { inputPer1M: 0.80,  outputPer1M: 4.00  },
  "claude-3-opus-20240229":         { inputPer1M: 15.00, outputPer1M: 75.00 },
  "claude-3-sonnet-20240229":       { inputPer1M: 3.00,  outputPer1M: 15.00 },
  "claude-3-haiku-20240307":        { inputPer1M: 0.25,  outputPer1M: 1.25  },
};

const DEFAULT_PRICING: ModelPricing = { inputPer1M: 3.00, outputPer1M: 15.00 };

export function estimateCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const pricing = MODEL_PRICING[model] ?? DEFAULT_PRICING;
  return (
    (inputTokens  / 1_000_000) * pricing.inputPer1M +
    (outputTokens / 1_000_000) * pricing.outputPer1M
  );
}

export function estimateTotalCost(
  modelUsage: Record<string, { inputTokens?: number; outputTokens?: number }>,
): number {
  return Object.entries(modelUsage).reduce((sum, [model, usage]) => {
    return sum + estimateCost(model, usage.inputTokens ?? 0, usage.outputTokens ?? 0);
  }, 0);
}

/**
 * Approximate daily cost per model from raw daily token totals.
 *
 * NOTE: DailyModelTokens.tokensByModel stores a single aggregate per model
 * (input + output + cache combined) — no per-day input/output split is
 * preserved by the Rust collector. We price the full daily total at the
 * model's OUTPUT rate (the dominant cost driver at ~5× input rates), which
 * makes the approximation trend toward the accurate all-time cost figure
 * rather than dramatically under-counting. Use estimateTotalCost(mergedModelUsage)
 * for exact all-time figures that do have the split.
 */
export function estimateDailyCostByModel(
  tokensByModel: Record<string, number>,
): Record<string, number> {
  return Object.fromEntries(
    Object.entries(tokensByModel).map(([model, tokens]) => {
      const pricing = MODEL_PRICING[model] ?? DEFAULT_PRICING;
      return [model, (tokens / 1_000_000) * pricing.outputPer1M];
    }),
  );
}

/** Format a USD cost value for display (e.g. "$0.84", "$1.20"). */
export function formatCost(usd: number): string {
  if (usd === 0) return "$0.00";
  if (usd < 0.01) return "<$0.01";
  return `$${usd.toFixed(2)}`;
}
