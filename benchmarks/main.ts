import { SparseArray } from "../src";
import { append } from "./traces";
import { BenchmarkTrace, SparseArrayType, timeOne } from "./util";

const arrTypes: SparseArrayType[] = [
  {
    name: "RLE-templated",
    construct: <T>() => SparseArray.empty<T>(),
  },
];

const traces: BenchmarkTrace[] = [append];

void (async function () {
  for (const trace of traces) {
    for (const arrType of arrTypes) {
      await timeOne(trace, arrType);
    }
  }
})();
