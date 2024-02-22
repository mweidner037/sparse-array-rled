import { SparseArray } from "../src";
import { ListPositionsSparseArray } from "./list_positions";
import {
  append,
  backspace,
  frontAndBack,
  martinTrace,
  randomDeletes,
} from "./traces";
import { BenchmarkTrace, SparseArrayType, timeOne } from "./util";

const arrTypes: SparseArrayType[] = [
  {
    name: "RLE-templated",
    construct: <T>() => SparseArray.empty<T>(),
  },
  {
    name: "list-positions",
    construct: <T>() => new ListPositionsSparseArray<T>(),
  },
];

const traces: BenchmarkTrace[] = [
  append,
  backspace,
  randomDeletes,
  frontAndBack,
  martinTrace,
];

void (async function () {
  for (const trace of traces) {
    for (const arrType of arrTypes) {
      await timeOne(trace, arrType);
    }
    console.log();
  }
})();
