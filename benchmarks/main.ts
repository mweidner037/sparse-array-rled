import { allImpls } from "./impls";
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
    // TODO: randomize order
    for (const impl of allImpls) {
      await timeOne(trace, impl);
    }
    console.log();
  }
})();
