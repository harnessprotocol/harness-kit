---
max_turns: 8
runs: 1
timeout_seconds: 180
model: claude-haiku-5-5
allowed_tools: [Skill, Read, Glob, Grep]
tags: [explain, narrow-scope, python]
---

Explain fib.py to me: what it does, how its parts connect, and where to start if I need to change it.

The file is not on disk. Treat the code below as the contents of `fib.py`:

```python
def fib(n):
    """Return the nth Fibonacci number (0-indexed).

    Raises ValueError for negative n.
    Uses iterative approach — O(n) time, O(1) space.
    """
    if n < 0:
        raise ValueError(f"n must be non-negative, got {n}")
    if n <= 1:
        return n
    a, b = 0, 1
    for _ in range(2, n + 1):
        a, b = b, a + b
    return b


def fib_sequence(count):
    """Return a list of the first `count` Fibonacci numbers."""
    if count < 0:
        raise ValueError(f"count must be non-negative, got {count}")
    return [fib(i) for i in range(count)]


if __name__ == "__main__":
    print(fib_sequence(10))  # [0, 1, 1, 2, 3, 5, 8, 13, 21, 34]
```
