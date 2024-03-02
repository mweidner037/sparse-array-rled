export function nonNull<T>(x: T | null): T {
  if (x === null) {
    throw new Error("Internal error: non-null check failed");
  }
  return x;
}
