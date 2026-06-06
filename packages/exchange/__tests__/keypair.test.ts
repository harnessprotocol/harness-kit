import { describe, it, expect } from "vitest";
import { generate, fingerprint, fragmentContentId } from "../src/keypair.js";

describe("keypair", () => {
  describe("generate", () => {
    it("returns a keypair with 64-char hex public and private keys", () => {
      const kp = generate();
      expect(kp.publicKey).toMatch(/^[a-f0-9]{64}$/);
      expect(kp.privateKey).toMatch(/^[a-f0-9]{64}$/);
    });

    it("produces different keys each call", () => {
      const kp1 = generate();
      const kp2 = generate();
      expect(kp1.publicKey).not.toBe(kp2.publicKey);
      expect(kp1.privateKey).not.toBe(kp2.privateKey);
    });
  });

  describe("fingerprint", () => {
    it("produces blake2b: prefix + 4×4 lowercase hex groups", () => {
      const { publicKey } = generate();
      const fp = fingerprint(publicKey);
      expect(fp).toMatch(/^blake2b:[a-f0-9]{4}:[a-f0-9]{4}:[a-f0-9]{4}:[a-f0-9]{4}$/);
    });

    it("is deterministic for the same key", () => {
      const { publicKey } = generate();
      expect(fingerprint(publicKey)).toBe(fingerprint(publicKey));
    });

    it("differs for different keys", () => {
      const fp1 = fingerprint(generate().publicKey);
      const fp2 = fingerprint(generate().publicKey);
      expect(fp1).not.toBe(fp2);
    });
  });

  describe("fragmentContentId", () => {
    it("returns 8 lowercase hex chars", () => {
      const id = fragmentContentId({ version: "1", kind: "fragment" });
      expect(id).toMatch(/^[a-f0-9]{8}$/);
    });

    it("is deterministic for the same object", () => {
      const frag = { version: "1", kind: "fragment", metadata: { name: "test", description: "d" } };
      expect(fragmentContentId(frag)).toBe(fragmentContentId(frag));
    });

    it("differs for different objects", () => {
      const id1 = fragmentContentId({ version: "1", kind: "fragment", metadata: { name: "a", description: "a" } });
      const id2 = fragmentContentId({ version: "1", kind: "fragment", metadata: { name: "b", description: "b" } });
      expect(id1).not.toBe(id2);
    });
  });
});
