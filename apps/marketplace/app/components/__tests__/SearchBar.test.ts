import { describe, expect, it } from "vitest";
import { SearchBar } from "../SearchBar";

describe("SearchBar", () => {
  it("should be defined", () => {
    expect(SearchBar).toBeDefined();
    expect(typeof SearchBar).toBe("function");
  });
});
