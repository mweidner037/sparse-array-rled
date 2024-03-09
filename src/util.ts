export function nonNull<T>(x: T | null): T {
  if (x === null) {
    throw new Error("Internal error: non-null check failed");
  }
  return x;
}

export function checkIndex(index: number, desc = "index"): void {
  if (!Number.isSafeInteger(index) || index < 0) {
    throw new Error(`Invalid ${desc}: ${index}`);
  }
}
