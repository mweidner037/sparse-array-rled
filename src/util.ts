export function checkIndex(index: number, desc = "index"): void {
  if (!Number.isSafeInteger(index) || index < 0) {
    throw new Error(`Invalid ${desc}: ${index}`);
  }
}
