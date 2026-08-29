import type { HarnessResource, OwnershipFingerprint, PortabilityState } from "./types.js";

export const EMPTY_PORTABILITY_STATE: PortabilityState = {
  version: 1,
  lastApplied: [],
  ownership: [],
};

export function readPortabilityState(content: string): PortabilityState {
  let value: unknown;
  try {
    value = JSON.parse(content);
  } catch (error) {
    throw new Error(`invalid .harness/state.json: ${error instanceof Error ? error.message : String(error)}`);
  }
  const object = value as Partial<PortabilityState> | null;
  if (!object || object.version !== 1 || !Array.isArray(object.lastApplied) || !Array.isArray(object.ownership)) {
    throw new Error("invalid .harness/state.json: expected portability state version 1");
  }
  return object as PortabilityState;
}

export function writePortabilityState(state: PortabilityState): string {
  return `${JSON.stringify(state, null, 2)}\n`;
}

export function nextPortabilityState(
  previous: PortabilityState | undefined,
  resources: HarnessResource[],
  ownership: OwnershipFingerprint[],
  appliedAt: string,
  lastKnownGood: string,
): PortabilityState {
  return {
    version: 1,
    lastApplied: resources,
    ownership,
    lastKnownGood,
    appliedAt,
    ...(previous?.lastKnownGood && previous.lastKnownGood !== lastKnownGood
      ? { "x-previous-last-known-good": previous.lastKnownGood }
      : {}),
  } as PortabilityState;
}
