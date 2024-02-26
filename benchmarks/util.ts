import * as math from "mathjs";
import seedrandom from "seedrandom";

/**
 * An implementation of a sparse array.
 *
 * This has a weird structure (wrapper around object) to accommodate PlainArray
 * without forcing it to wrap its Array in an extra class (which would unfairly
 * increase memory usage).
 */
export interface Implementation {
  name: string;
  newEmpty(): object;
  isEmpty(arr: object): boolean;
  set(arr: object, index: number, ...values: unknown[]): object;
  delete(arr: object, index: number, count?: number): object;
}

export type BenchmarkTrace = (
  arrType: Implementation,
  prng: seedrandom.PRNG,
  profile: boolean
) => void | Promise<void>;

export async function timeOne(
  trace: BenchmarkTrace,
  impl: Implementation,
  profile = false
) {
  const timesMS: number[] = [];
  for (let i = -5; i < 10; i++) {
    const prng = seedrandom("42");
    await new Promise((resolve) => setTimeout(resolve, 100));

    const startTime = process.hrtime.bigint();
    await trace(impl, prng, profile && i === 9);
    const timeMS =
      new Number(process.hrtime.bigint() - startTime).valueOf() / 1000000;
    if (i >= 0) timesMS.push(timeMS);
  }

  const mean = math.mean(timesMS);
  const stddev = math.std(timesMS) as unknown as number;
  console.log(
    impl.name.padEnd(20) +
      trace.name.padEnd(20) +
      `${mean.toFixed(1)} +- ${stddev.toFixed(1)} ms`
  );
}
