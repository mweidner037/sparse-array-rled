import { arrTypes } from "./array_types";
import {
  append,
  backspace,
  frontAndBack,
  martinTrace,
  randomDeletes,
} from "./traces";
import { BenchmarkTrace, timeOne } from "./util";

const traces: BenchmarkTrace[] = [
  append,
  backspace,
  randomDeletes,
  frontAndBack,
  martinTrace,
];

void (async function () {
  for (const trace of traces) {
    for (const arrType of Object.values(arrTypes)) {
      await timeOne(trace, arrType);
    }
    console.log();
  }
})();
