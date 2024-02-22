import { SparseArray } from "../src";
import { append, backspace, frontAndBack, randomDeletes } from "./traces";
import { BenchmarkTrace, SparseArrayType, timeOne } from "./util";

const arrTypes: SparseArrayType[] = [
  {
    name: "RLE-templated",
    construct: <T>() => SparseArray.empty<T>(),
  },
];

const traces: BenchmarkTrace[] = [
  append,
  backspace,
  randomDeletes,
  frontAndBack,
];

void (async function () {
  for (const trace of traces) {
    for (const arrType of arrTypes) {
      await timeOne(trace, arrType);
    }
  }
})();
