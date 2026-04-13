import { describe, expect, it } from "vitest";
import { RingBuffer } from "../ring-buffer.js";

describe("RingBuffer", () => {
  describe("empty buffer", () => {
    it("toArray() returns []", () => {
      const buf = new RingBuffer<number>(4);
      expect(buf.toArray()).toEqual([]);
    });
  });

  describe("below capacity", () => {
    it("returns items in insertion order", () => {
      const buf = new RingBuffer<number>(4);
      buf.push(1);
      buf.push(2);
      buf.push(3);
      expect(buf.toArray()).toEqual([1, 2, 3]);
    });
  });

  describe("exactly capacity", () => {
    it("all items present in insertion order", () => {
      const buf = new RingBuffer<number>(4);
      buf.push(1);
      buf.push(2);
      buf.push(3);
      buf.push(4);
      expect(buf.toArray()).toEqual([1, 2, 3, 4]);
    });
  });

  describe("capacity + 1 items", () => {
    it("oldest item is evicted; newest is at the end", () => {
      const buf = new RingBuffer<number>(4);
      buf.push(1);
      buf.push(2);
      buf.push(3);
      buf.push(4);
      buf.push(5); // evicts 1
      const result = buf.toArray();
      expect(result).toEqual([2, 3, 4, 5]);
    });
  });

  describe("2 × capacity items", () => {
    it("only the last capacity items remain in insertion order", () => {
      const buf = new RingBuffer<string>(3);
      buf.push("a");
      buf.push("b");
      buf.push("c");
      buf.push("d");
      buf.push("e");
      buf.push("f");
      expect(buf.toArray()).toEqual(["d", "e", "f"]);
    });
  });
});
