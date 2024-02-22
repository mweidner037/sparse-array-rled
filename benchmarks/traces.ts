import seedrandom from "seedrandom";
import { SparseArrayType } from "./util";

// Each trace performs 1,000,000 set/delete ops.

export function append(arrType: SparseArrayType): void {
  for (let t = 0; t < 10000; t++) {
    const arr = arrType.construct<string>();
    for (let i = 0; i < 100; i++) {
      arr.set(i, "a");
    }
  }
}

const hundredValues = new Array<string>(100).fill("a");

export function backspace(arrType: SparseArrayType): void {
  for (let t = 0; t < 10000; t++) {
    const arr = arrType.construct<string>();
    arr.set(0, ...hundredValues);
    for (let i = 99; i >= 0; i--) {
      arr.delete(i);
    }
  }
}

export function randomDeletes(
  arrType: SparseArrayType,
  prng: seedrandom.PRNG
): void {
  for (let t = 0; t < 100000; t++) {
    const arr = arrType.construct<string>();
    arr.set(0, ...hundredValues);
    for (let i = 0; i < 10; i++) {
      arr.delete(Math.round(prng() * 100));
    }
  }
}

export function frontAndBack(arrType: SparseArrayType): void {
  for (let t = 0; t < 6670; t++) {
    const arr = arrType.construct<string>();
    for (let j = 0; j < 10; j++) {
      for (let i = 0; i < 10; i++) {
        arr.set(10 * j + i, "a");
      }
      for (let i = 0; i < 5; i++) {
        arr.delete(11 * j - i - 1);
      }
    }
  }
}
