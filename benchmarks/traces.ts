import fs from "fs";
import seedrandom from "seedrandom";
import { Implementation } from "./util";

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

// These edits are derived by applying Martin Kleppmann's
// [automerge-perf](https://github.com/automerge/automerge-perf) to a List from the
// list-positions library.
const textTraceEdits = JSON.parse(
  fs.readFileSync("./benchmarks/text_trace.json").toString()
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
 * Wrapper for textTrace data, so it's easier to find in the heap profiler
 * (sort by Constructor in reverse order).
 */
class _TRACE_LIST {
  constructor(readonly bunches = new Map<string, object>()) {}
}

export async function textTrace(
  impl: Implementation,
  _prng: seedrandom.PRNG,
  profile: boolean
) {
  const list = new _TRACE_LIST();
  for (const edit of textTraceEdits) {
    if (edit.type === "set") {
      let arr = list.bunches.get(edit.bunchID);
      if (arr === undefined) {
        arr = impl.newEmpty();
        list.bunches.set(edit.bunchID, arr);
      }
      impl.set(arr, edit.index, edit.value);
    } else {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const arr = list.bunches.get(edit.bunchID)!;
      impl.delete(arr, edit.index);
      if (impl.isEmpty(arr)) list.bunches.delete(edit.bunchID);
    }
  }
  if (profile) {
    console.log("Ready to profile");
    await new Promise((resolve) => setTimeout(resolve, 100000000));
    // Keep list in scope.
    console.log(list);
  }
}

// TODO: get, countAt, findCount benchmarks. Compare get perf for pairs vs two arrays (latter might avoid pointer-chasing indexes).
// TODO: serialized size benchmarks? Since that's one of our claims over plain arrays. Likewise for load/save time.