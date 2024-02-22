import { SparseArrayType } from "./util";

export function append(arrType: SparseArrayType): void {
  for (let t = 0; t < 1000; t++) {
    const arr = arrType.construct<string>();
    for (let i = 0; i < 100; i++) {
      arr.set(i, "a");
    }
  }
}
