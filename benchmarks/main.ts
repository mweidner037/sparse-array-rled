import { allImpls } from "./impls";
import {
  append,
  backspace,
  frontAndBack,
  randomDeletes,
  textTrace,
} from "./traces";
import { BenchmarkTrace, timeOne } from "./util";

const traces: BenchmarkTrace[] = [
  append,
  backspace,
  randomDeletes,
  frontAndBack,
  textTrace,
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
