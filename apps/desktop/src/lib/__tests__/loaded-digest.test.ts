import { describe, it, expect } from "vitest";
import { isChangedOnDisk, loadedDigest } from "../loaded-digest";

describe("loadedDigest", () => {
  it("hashes the text", async () => {
    expect(await loadedDigest("hello")).toBe(
      "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
    );
  });

  it("drops one leading BOM, as Rust does", async () => {
    expect(await loadedDigest("﻿hello")).toBe(await loadedDigest("hello"));
  });

  it("maps a file that did not exist to undefined", async () => {
    expect(await loadedDigest(null)).toBeUndefined();
    expect(await loadedDigest(undefined)).toBeUndefined();
  });
});

describe("isChangedOnDisk", () => {
  it("recognises the Rust refusal in string and Error form", () => {
    const text = "Refusing to write 'a': it changed on disk since it was read (expected x, found y)";
    expect(isChangedOnDisk(text)).toBe(true);
    expect(isChangedOnDisk(new Error(text))).toBe(true);
    expect(isChangedOnDisk("permission denied")).toBe(false);
  });
});
