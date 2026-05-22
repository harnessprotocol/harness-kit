import type { SecurityScanStatus } from "@harness-kit/shared";
import type { TrustTier } from "./types.js";

export function trustFromStatus(status: SecurityScanStatus): TrustTier {
  switch (status) {
    case "passed":
      return "verified";
    case "warnings":
      return "caution";
    case "failed":
      return "warning";
    case "not_scanned":
    default:
      return "unscanned";
  }
}
