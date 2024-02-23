import fs from "fs";
import seedrandom from "seedrandom";
import { ISparseArray, SparseArrayType } from "./util";

// Each basic trace performs 1,000,000 set/delete ops.

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

const martinTraceEdits = JSON.parse(
  fs.readFileSync("./benchmarks/martin_trace.json").toString()
) as Array<
  | {
      type: "set";
      bunchID: string;
      index: number;
      value: string;
    }
  | { type: "delete"; bunchID: string; index: number }
>;

/**
 * Wrapper for martinTrace data, so it's easier to find in the heap profiler.
 */
class TRACE_LIST {
  constructor(readonly bunches = new Map<string, ISparseArray<string>>()) {}
}
const profile = false;

export async function martinTrace(arrType: SparseArrayType) {
  const list = new TRACE_LIST();
  for (const edit of martinTraceEdits) {
    if (edit.type === "set") {
      let arr = list.bunches.get(edit.bunchID);
      if (arr === undefined) {
        arr = arrType.construct<string>();
        list.bunches.set(edit.bunchID, arr);
      }
      arr.set(edit.index, edit.value);
    } else {
      const arr = list.bunches.get(edit.bunchID)!;
      arr.delete(edit.index);
    }
  }
  if (profile) {
    console.log("Ready to profile");
    await new Promise((resolve) => setTimeout(resolve, 100000000));
    // Keep list in scope.
    console.log(list);
  }
}
