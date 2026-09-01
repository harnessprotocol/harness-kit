import { configure } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

/**
 * Testing Library's default async timeout is 1000ms, which is too tight for
 * these tests: rendering <App /> walks a chain of mocked fetches (auth/me →
 * organizations → org data) before the first heading exists, and on a loaded
 * CI runner the FIRST test in the file pays module-init cost on top of that.
 * The symptom is `findByRole` timing out at ~1.3s while the three later tests
 * awaiting the very same heading pass — a load-sensitive cold start, not a
 * real failure. 5s keeps a genuine hang failing fast enough to be useful.
 */
configure({ asyncUtilTimeout: 5000 });
