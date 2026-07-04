import { useMemo } from "react";
import { OnboardingFlow, type OnboardingStep } from "../onboarding/OnboardingFlow";
import { buildSprawlReveal } from "../onboarding/onboarding-data";
import { ONBOARDING_FIXTURE_RESULT, ONBOARDING_FIXTURE_LOW_COUNT } from "./onboarding-fixture-data";

const VALID_STEPS: OnboardingStep[] = ["scan", "reveal", "preview", "confirm"];

/**
 * Dev-only screenshot harness for the onboarding sprawl-reveal (DESIGN.md
 * §6.3) — renders OnboardingFlow with static fixture data so Playwright can
 * capture reference screenshots without a live Tauri/core backend. Not
 * linked from any nav; reachable only by direct URL, and only in dev builds
 * (see App.tsx).
 *
 * Query params:
 *   ?step=scan|reveal|preview|confirm   (default "reveal")
 *   ?dataset=sprawl|low                  (default "sprawl" — 3-harness scenario;
 *                                          "low" is the zero/one-harness edge case)
 */
export default function OnboardingFixture() {
  const params = new URLSearchParams(window.location.search);
  const stepParam = params.get("step");
  const step: OnboardingStep = VALID_STEPS.includes(stepParam as OnboardingStep)
    ? (stepParam as OnboardingStep)
    : "reveal";
  const dataset = params.get("dataset") === "low" ? ONBOARDING_FIXTURE_LOW_COUNT : ONBOARDING_FIXTURE_RESULT;

  const reveal = useMemo(() => buildSprawlReveal(dataset), [dataset]);

  return (
    <OnboardingFlow
      step={step}
      scanSeconds={1.8}
      scanError={null}
      reveal={reveal}
      harnessYaml={dataset.harnessYaml}
      writing={false}
      writeError={null}
      onAdvance={() => {}}
      onWriteAndFinish={() => {}}
      onExploreReadOnly={() => {}}
    />
  );
}
