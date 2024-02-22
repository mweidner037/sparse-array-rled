import seedrandom from "seedrandom";
import martinTraceEditsRaw from "./martin_trace.json";
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

const martinTraceEdits = martinTraceEditsRaw as unknown as Array<
  | {
      type: "set";
      bunchID: string;
      index: number;
      value: string;
    }
  | { type: "delete"; bunchID: string; index: number }
>;

export function martinTrace(arrType: SparseArrayType): void {
  const list = new Map<string, ISparseArray<string>>();
  for (const edit of martinTraceEdits) {
    if (edit.type === "set" ) {
      let arr = list.get(edit.bunchID);
      if (arr === undefined) {
        arr = arrType.construct<string>();
        list.set(edit.bunchID, arr);
      }
      arr.set(edit.index, edit.value);
    } else {
      const arr = list.get(edit.bunchID)!;
      arr.delete(edit.index);
    }
  }
}