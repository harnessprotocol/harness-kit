import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ReconciliationConflict } from "@harness-kit/core";
import { ConflictLedger } from "../ConflictLedger";

describe("ConflictLedger", () => {
  it("shows provenance, target impact, and every allowed resolution", () => {
    const conflict = {
      id: "skill:acme/review",
      type: "divergent-update",
      identity: { kind: "skill", source: "acme/tools", name: "review" },
      alias: "review",
      scope: "project",
      detail: "Both the profile and native skill changed since the last apply.",
      affectedTargets: ["claude-code", "codex"],
      allowedResolutions: ["keep-desired", "keep-current", "keep-both"],
      desired: {
        identity: { kind: "skill", source: "acme/tools", name: "review" },
        alias: "review",
        kind: "skill",
        scope: "project",
        revision: { digest: "sha256:1234567890abcdef", resolvedRevision: "abc123" },
        provenance: { file: "harness.yaml" },
        value: {},
      },
    } as unknown as ReconciliationConflict;

    render(<ConflictLedger conflicts={[conflict]} />);
    expect(screen.getByText("1 reconciliation conflict")).toBeInTheDocument();
    expect(screen.getByText("acme/tools")).toBeInTheDocument();
    expect(screen.getByText("claude-code, codex")).toBeInTheDocument();
    expect(screen.getByText("keep-desired")).toBeInTheDocument();
    expect(screen.getByText("keep-current")).toBeInTheDocument();
    expect(screen.getByText("keep-both")).toBeInTheDocument();
  });
});
