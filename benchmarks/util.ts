import * as math from "mathjs";
import seedrandom from "seedrandom";

export interface ISparseArray<T> {
  set(index: number, ...values: T[]): ISparseArray<T>;
  delete(index: number, count?: number): ISparseArray<T>;
}

export interface SparseArrayType {
  name: string;
  construct: <T>() => ISparseArray<T>;
}

export type BenchmarkTrace = (
  arrType: SparseArrayType,
  prng: seedrandom.PRNG
) => void | Promise<void>;

export async function timeOne(trace: BenchmarkTrace, arrType: SparseArrayType) {
  const timesMS: number[] = [];
  for (let i = -5; i < 10; i++) {
    const prng = seedrandom("42");
    await new Promise((resolve) => setTimeout(resolve, 100));

    const startTime = process.hrtime.bigint();
    await trace(arrType, prng);
    const timeMS =
      new Number(process.hrtime.bigint() - startTime).valueOf() / 1000000;
    if (i >= 0) timesMS.push(timeMS);
  }

  const mean = math.mean(timesMS);
  const stddev = math.std(timesMS) as unknown as number;
  console.log(
    arrType.name,
    "\t",
    trace.name,
    "\t",
    `${mean.toFixed(1)} +- ${stddev.toFixed(1)} ms`
  );
}
