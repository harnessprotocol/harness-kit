import { describe, it, expect } from "vitest";
import {
  listProfiles,
  getProfile,
  getDefaultPhaseConfig,
  BUILT_IN_PROFILES,
} from "../src/execution/profiles.js";
import type { AgentProfile, PhaseName } from "../src/types.js";

describe("profiles", () => {
  const ALL_PHASES: PhaseName[] = ["spec", "planning", "coding", "qa"];

  describe("listProfiles", () => {
    it("returns 4 built-in profiles", () => {
      const profiles = listProfiles();
      expect(profiles).toHaveLength(4);
    });

    it("returns built-in profiles with correct IDs", () => {
      const profiles = listProfiles();
      const ids = profiles.map((p) => p.id);
      expect(ids).toContain("auto");
      expect(ids).toContain("complex");
      expect(ids).toContain("balanced");
      expect(ids).toContain("quick");
    });

    it("each profile has required fields", () => {
      const profiles = listProfiles();
      for (const profile of profiles) {
        expect(typeof profile.id).toBe("string");
        expect(profile.id.length).toBeGreaterThan(0);
        expect(typeof profile.name).toBe("string");
        expect(profile.name.length).toBeGreaterThan(0);
        expect(typeof profile.description).toBe("string");
        expect(profile.description.length).toBeGreaterThan(0);
        expect(typeof profile.icon).toBe("string");
        expect(profile.icon.length).toBeGreaterThan(0);
        expect(profile.phase_models).toBeDefined();
        expect(profile.phase_thinking).toBeDefined();
      }
    });

    it("each profile has phase_models for all 4 phases", () => {
      const profiles = listProfiles();
      for (const profile of profiles) {
        for (const phase of ALL_PHASES) {
          expect(profile.phase_models[phase]).toBeDefined();
          expect(typeof profile.phase_models[phase]).toBe("string");
          expect(profile.phase_models[phase].length).toBeGreaterThan(0);
        }
      }
    });

    it("each profile has phase_thinking for all 4 phases", () => {
      const profiles = listProfiles();
      for (const profile of profiles) {
        for (const phase of ALL_PHASES) {
          expect(profile.phase_thinking[phase]).toBeDefined();
          expect(typeof profile.phase_thinking[phase]).toBe("string");
        }
      }
    });

    it("appends custom profiles when provided", () => {
      const custom: AgentProfile = {
        id: "custom",
        name: "Custom Profile",
        description: "A custom profile",
        icon: "star",
        phase_models: {
          spec: "model-a",
          planning: "model-b",
          coding: "model-c",
          qa: "model-d",
        },
        phase_thinking: {
          spec: "high",
          planning: "high",
          coding: "medium",
          qa: "low",
        },
      };

      const profiles = listProfiles([custom]);
      expect(profiles).toHaveLength(5);
      expect(profiles[4].id).toBe("custom");
    });

    it("returns only built-in profiles when no custom profiles provided", () => {
      const profiles = listProfiles([]);
      expect(profiles).toHaveLength(4);
    });
  });

  describe("getProfile", () => {
    it("returns the correct profile by ID", () => {
      const auto = getProfile("auto");
      expect(auto).toBeDefined();
      expect(auto!.id).toBe("auto");
      expect(auto!.name).toBe("Auto (Optimized)");

      const complex = getProfile("complex");
      expect(complex).toBeDefined();
      expect(complex!.id).toBe("complex");
      expect(complex!.name).toBe("Complex Tasks");
    });

    it("returns undefined for unknown ID", () => {
      const result = getProfile("non-existent");
      expect(result).toBeUndefined();
    });

    it("returns each built-in profile correctly", () => {
      for (const expected of BUILT_IN_PROFILES) {
        const found = getProfile(expected.id);
        expect(found).toBeDefined();
        expect(found!.id).toBe(expected.id);
        expect(found!.name).toBe(expected.name);
      }
    });
  });

  describe("getDefaultPhaseConfig", () => {
    it("returns 4 phase configs", () => {
      const configs = getDefaultPhaseConfig();
      expect(configs).toHaveLength(4);
    });

    it("returns configs for all phase names in order", () => {
      const configs = getDefaultPhaseConfig();
      expect(configs.map((c) => c.name)).toEqual([
        "spec",
        "planning",
        "coding",
        "qa",
      ]);
    });

    it("all phases are enabled by default", () => {
      const configs = getDefaultPhaseConfig();
      for (const config of configs) {
        expect(config.enabled).toBe(true);
      }
    });

    it("models match the specified profile", () => {
      const autoProfile = getProfile("auto")!;
      const configs = getDefaultPhaseConfig("auto");

      for (const config of configs) {
        expect(config.model).toBe(autoProfile.phase_models[config.name]);
      }
    });

    it("uses auto profile models by default", () => {
      const autoProfile = getProfile("auto")!;
      const configs = getDefaultPhaseConfig();

      for (const config of configs) {
        expect(config.model).toBe(autoProfile.phase_models[config.name]);
      }
    });

    it("returns auto profile config for unknown profile ID", () => {
      const autoProfile = getProfile("auto")!;
      const configs = getDefaultPhaseConfig("unknown-profile");

      for (const config of configs) {
        expect(config.model).toBe(autoProfile.phase_models[config.name]);
      }
    });

    it("returns correct models for complex profile", () => {
      const complexProfile = getProfile("complex")!;
      const configs = getDefaultPhaseConfig("complex");

      for (const config of configs) {
        expect(config.model).toBe(complexProfile.phase_models[config.name]);
      }
    });

    it("includes thinking_level from profile", () => {
      const configs = getDefaultPhaseConfig("auto");
      for (const config of configs) {
        expect(config.thinking_level).toBeDefined();
        expect(typeof config.thinking_level).toBe("string");
      }
    });
  });
});
