/**
 * Fixed-size circular buffer. When full, new items overwrite the oldest entry.
 */
export class RingBuffer<T> {
  private readonly buf: (T | undefined)[];
  private writePtr: number = 0;
  private size: number = 0;

  constructor(private readonly capacity: number) {
    this.buf = new Array<T | undefined>(capacity).fill(undefined);
  }

  push(item: T): void {
    this.buf[this.writePtr] = item;
    this.writePtr = (this.writePtr + 1) % this.capacity;
    if (this.size < this.capacity) {
      this.size++;
    }
  }

  toArray(): T[] {
    if (this.size === 0) return [];
    if (this.size < this.capacity) {
      // Buffer not yet full — items are from index 0 up to size, in insertion order
      return this.buf.slice(0, this.size) as T[];
    }
    // Buffer is full — oldest item starts at writePtr
    const result: T[] = [];
    for (let i = 0; i < this.capacity; i++) {
      const idx = (this.writePtr + i) % this.capacity;
      result.push(this.buf[idx] as T);
    }
    return result;
  }
}
