import fs from "fs";
import seedrandom from "seedrandom";
import { Implementation, getProfile } from "./util";

// Each basic trace performs 1,000,000 set/delete ops.

export function append(impl: Implementation): void {
  for (let t = 0; t < 10000; t++) {
    const arr = impl.newEmpty();
    for (let i = 0; i < 100; i++) {
      impl.set(arr, i, "a");
    }
  }
}

const hundredValues = new Array<string>(100).fill("a");

export function backspace(impl: Implementation): void {
  for (let t = 0; t < 10000; t++) {
    const arr = impl.newEmpty();
    impl.set(arr, 0, ...hundredValues);
    for (let i = 99; i >= 0; i--) {
      impl.delete(arr, i);
    }
  }
}

export function randomDeletes(
  impl: Implementation,
  prng: seedrandom.PRNG
): void {
  for (let t = 0; t < 100000; t++) {
    const arr = impl.newEmpty();
    impl.set(arr, 0, ...hundredValues);
    for (let i = 0; i < 10; i++) {
      impl.delete(arr, Math.round(prng() * 100));
    }
  }
}

export function frontAndBack(impl: Implementation): void {
  for (let t = 0; t < 6670; t++) {
    const arr = impl.newEmpty();
    for (let j = 0; j < 10; j++) {
      for (let i = 0; i < 10; i++) {
        impl.set(arr, 10 * j + i, "a");
      }
      for (let i = 0; i < 5; i++) {
        impl.delete(arr, 11 * j - i - 1);
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
 * Wrapper for martinTrace data, so it's easier to find in the heap profiler
 * (sort by Constructor in reverse order).
 */
class _TRACE_LIST {
  constructor(readonly bunches = new Map<string, object>()) {}
}

export async function martinTrace(impl: Implementation) {
  const list = new _TRACE_LIST();
  for (const edit of martinTraceEdits) {
    if (edit.type === "set") {
      let arr = list.bunches.get(edit.bunchID);
      if (arr === undefined) {
        arr = impl.newEmpty();
        list.bunches.set(edit.bunchID, arr);
      }
      impl.set(arr, edit.index, edit.value);
    } else {
      const arr = list.bunches.get(edit.bunchID)!;
      impl.delete(arr, edit.index);
    }
  }
  if (getProfile()) {
    console.log("Ready to profile");
    await new Promise((resolve) => setTimeout(resolve, 100000000));
    // Keep list in scope.
    console.log(list);
  }
}

// TODO: get benchmarks
// TODO: "unit tests" for Implementation? So we can check all of them before trusting the results.
