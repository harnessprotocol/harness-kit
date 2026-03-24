/**
 * Fixed-size circular buffer. When full, new items overwrite the oldest entry.
 */
export class RingBuffer {
    capacity;
    buf;
    writePtr = 0;
    size = 0;
    constructor(capacity) {
        this.capacity = capacity;
        this.buf = new Array(capacity).fill(undefined);
    }
    push(item) {
        this.buf[this.writePtr] = item;
        this.writePtr = (this.writePtr + 1) % this.capacity;
        if (this.size < this.capacity) {
            this.size++;
        }
    }
    toArray() {
        if (this.size === 0)
            return [];
        if (this.size < this.capacity) {
            // Buffer not yet full — items are from index 0 up to size, in insertion order
            return this.buf.slice(0, this.size);
        }
        // Buffer is full — oldest item starts at writePtr
        const result = [];
        for (let i = 0; i < this.capacity; i++) {
            const idx = (this.writePtr + i) % this.capacity;
            result.push(this.buf[idx]);
        }
        return result;
    }
}
//# sourceMappingURL=ring-buffer.js.map