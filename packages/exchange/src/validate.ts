/**
 * Validates an Exchange offer envelope against exchange.schema.json (Ajv2020).
 * The wrapped fragment is opaque here — callers MUST additionally validate
 * the fragment against the harness schema (validateHarness from @harness-kit/core).
 */

import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import exchangeSchema from "./schema/exchange.schema.json" with { type: "json" };

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);

const validateEnvelope = ajv.compile(exchangeSchema);

export interface EnvelopeValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateOffer(doc: unknown): EnvelopeValidationResult {
  const valid = validateEnvelope(doc);
  return {
    valid,
    errors: valid
      ? []
      : (validateEnvelope.errors ?? []).map(
          (e) => `${e.instancePath || "/"} ${e.message ?? "invalid"}`
        ),
  };
}
