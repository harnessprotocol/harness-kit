/**
 * Fixed-size circular buffer. When full, new items overwrite the oldest entry.
 */
export declare class RingBuffer<T> {
    private readonly capacity;
    private readonly buf;
    private writePtr;
    private size;
    constructor(capacity: number);
    push(item: T): void;
    toArray(): T[];
}
//# sourceMappingURL=ring-buffer.d.ts.map