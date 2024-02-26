import { assert } from "chai";
import { describe, test } from "mocha";
import seedrandom from "seedrandom";
import { SparseArray } from "../src";

const DEBUG = false;

function getState<T>(arr: SparseArray<T>): {
  indexes: number[];
  segments: T[];
} {
  // @ts-expect-error Ignore protected
  return { indexes: arr.indexes, segments: arr.segments };
}

function validate({
  indexes,
  segments,
}: {
  indexes: number[];
  segments: string[];
}): void {
  // No nonsense i's.
  assert.doesNotHaveAnyKeys(indexes, ["-1"]);
  assert.doesNotHaveAnyKeys(segments, ["-1"]);

  // In order.
  for (let i = 0; i < indexes.length - 1; i++) {
    assert.isBelow(indexes[i], indexes[i + 1]);
  }

  // No empty items.
  for (let i = 0; i < segments.length; i++) {
    assert.notStrictEqual(segments[i].length, 0);
  }

  // No overlapping or joinable segments.
  for (let i = 0; i < indexes.length - 1; i++) {
    const thisEnd = indexes[i] + segments[i].length;
    const nextStart = indexes[i + 1];
    assert.isBelow(thisEnd, nextStart);
  }
}

function getLength({
  indexes,
  segments,
}: {
  indexes: number[];
  segments: string[];
}): number {
  if (indexes.length === 0) return 0;
  return indexes.at(-1)! + segments.at(-1)!.length;
}

function check(
  arr: SparseArray<string>,
  values: (string | null)[],
  trimmed = false
) {
  const state = getState(arr);
  validate(state);

  let beforeCount = 0;
  for (let i = 0; i < values.length; i++) {
    const info = arr.hasGet(i);
    if (values[i] === null) assert.deepStrictEqual(info, [false, undefined]);
    else {
      assert.deepStrictEqual(info, [true, values[i]!]);
      beforeCount++;
    }
  }
  assert.strictEqual(
    arr.size(),
    values.filter((value) => value != null).length,
    "size"
  );
  if (trimmed) {
    assert.strictEqual(getLength(state), values.length, "length");
  }

  // getInfo should also work on indexes past the length.
  for (let i = 0; i < 10; i++) {
    assert.deepStrictEqual(arr.hasGet(values.length + i), [false, undefined]);
  }
}

class Checker {
  readonly arr: SparseArray<string>;
  values: (string | null)[];

  constructor() {
    this.arr = SparseArray.empty();
    this.values = [];
  }

  check() {
    check(this.arr, this.values);
  }

  trim() {
    this.arr.trim();
    while (this.values.length !== 0 && this.values.at(-1) === null) {
      this.values.pop();
    }
    this.check();
  }

  set(index: number, newValues: string[]) {
    if (DEBUG) {
      console.log("\nset", index, newValues);
      console.log("before:  ", getState(this.arr));
    }

    const replacedValues = new Array<string | null>(newValues.length);
    for (let i = 0; i < newValues.length; i++) {
      replacedValues[i] = this.values[index + i] ?? null;
    }

    const replaced = this.arr.set(index, ...newValues);

    // Update this.values in parallel.
    for (let i = this.values.length; i < index + newValues.length; i++) {
      this.values.push(null);
    }
    for (let i = 0; i < newValues.length; i++) {
      this.values[index + i] = newValues[i];
    }

    if (DEBUG) {
      console.log("after:   ", getState(this.arr));
      console.log("replaced:", getState(replaced));
    }

    // Check agreement.
    this.check();
    check(replaced, replacedValues);
    assert.strictEqual(replaced.length, replacedValues.length);

    // Always trim, to match TODO.
    this.trim();
  }

  delete(index: number, count: number) {
    if (DEBUG) {
      console.log("\ndelete", index, count);
      console.log("before:  ", getState(this.arr));
    }

    const replacedValues = new Array<string | null>(count);
    for (let i = 0; i < count; i++) {
      replacedValues[i] = this.values[index + i] ?? null;
    }

    const replaced = this.arr.delete(index, count);

    if (DEBUG) {
      console.log("after:   ", getState(this.arr));
      console.log("replaced:", getState(replaced));
    }

    // Update this.values in parallel.
    for (let i = this.values.length; i < index + count; i++) {
      this.values.push(null);
    }
    for (let i = 0; i < count; i++) {
      this.values[index + i] = null;
    }

    // Check agreement.
    this.check();
    check(replaced, replacedValues);
    assert.strictEqual(replaced.length, replacedValues.length);

    // Always trim, to match TODO.
    this.trim();
  }

  /**
   * Test all findPresentIndex inputs and some newSlicer walks.
   *
   * More expensive (O(length^2) ops), so only call occasionally,
   * in "interesting" states.
   */
  testQueries(rng: seedrandom.PRNG) {
    // TODO
    // // Test findPresentIndex.
    // for (let startIndex = 0; startIndex < this.values.length; startIndex++) {
    //   for (let count = 0; ; count++) {
    //     // Find the count-th present value starting at startIndex, in values.
    //     let remaining = count;
    //     let i = startIndex;
    //     for (; i < this.values.length; i++) {
    //       if (this.values[i] !== null) {
    //         remaining--;
    //         if (remaining === 0) break;
    //       }
    //     }
    //     if (remaining !== 0) {
    //       // count is too large; go to the next startIndex.
    //       break;
    //     } else {
    //       // Answer is i.
    //       assert.strictEqual(
    //         man.findPresentIndex(this.items, startIndex, count),
    //         i
    //       );
    //     }
    //   }
    // }
    // // Test newSlicer 10x with random slices.
    // for (let trial = 0; trial < 10; trial++) {
    //   const slicer = man.newSlicer(this.items);
    //   let lastEnd = 0;
    //   while (rng() >= 0.75) {
    //     // Length 0 to 20 (0 can happen w/ concurrent or L/R dual siblings).
    //     const len = Math.floor(rng() * 21);
    //     const actual = slicer.nextSlice(lastEnd + len);
    //     const expected = [...this.values.entries()]
    //       .slice(lastEnd, lastEnd + len)
    //       .filter(([, value]) => value != null);
    //     assert.deepStrictEqual(actual, expected);
    //     lastEnd += len;
    //   }
    //   // Finish.
    //   slicer.nextSlice(null);
    // }
  }
}

describe("SparseArray", () => {
  let rng!: seedrandom.PRNG;

  beforeEach(() => {
    rng = seedrandom("42");
  });

  test("empty", () => {
    check(SparseArray.empty(), []);
    check(SparseArray.empty(3), [null, null, null]);
  });

  test("set once", () => {
    const checker = new Checker();
    checker.set(0, ["a", "b", "c"]);
    checker.testQueries(rng);
  });

  test("delete once", () => {
    const checker = new Checker();
    checker.delete(0, 3);
    checker.testQueries(rng);

    checker.delete(2, 3);
    checker.testQueries(rng);
  });

  test("set twice", () => {
    const values = ["a", "b", "c", "d", "e"];

    for (let i = 0; i < 5; i++) {
      for (let j = 1; j < 5 - i; j++) {
        const checker = new Checker();
        checker.set(0, values);
        checker.set(i, new Array(j).fill("x"));
        checker.testQueries(rng);
      }
    }
  });

  test("set and delete", () => {
    const values = ["a", "b", "c", "d", "e"];

    for (let i = 0; i < 5; i++) {
      for (let j = 1; j < 5 - i; j++) {
        const checker = new Checker();
        checker.set(0, values);
        checker.delete(i, j);
        checker.testQueries(rng);
      }
    }
  });

  test("push and pop", () => {
    // Simulate typing and backspacing in a single bunch.
    const checker = new Checker();
    let cursor = 0;
    let push = true;
    for (let i = 0; i < 100; i++) {
      if (cursor === 0) push = true;
      else if (rng() < 0.1) push = !push;

      if (push) {
        checker.set(cursor, [String.fromCharCode(96 + Math.floor(rng() * 26))]);
        cursor++;
      } else {
        checker.delete(cursor - 1, 1);
        cursor--;
      }

      if (i % 10 === 0) checker.testQueries(rng);
    }
  });

  test("push and shift", () => {
    const checker = new Checker();
    for (let i = 0; i < 100; i++) {
      checker.set(i, [String.fromCharCode(96 + Math.floor(rng() * 26))]);
      if (i >= 20) checker.delete(i - 20, 1);
      if (i % 10 === 0) checker.testQueries(rng);
    }
  });

  describe("fuzz", () => {
    test("single char ops", () => {
      const checker = new Checker();
      for (let i = 0; i < 200; i++) {
        const index = Math.floor(rng() * 30);
        if (rng() < 0.5) {
          checker.set(index, [
            String.fromCharCode(96 + Math.floor(rng() * 26)),
          ]);
        } else checker.delete(index, 1);
        if (i % 20 === 0) checker.testQueries(rng);
      }
    });

    test("bulk set, single delete", () => {
      const checker = new Checker();
      for (let i = 0; i < 200; i++) {
        const index = Math.floor(rng() * 30);
        if (rng() < 0.2) {
          checker.set(
            index,
            new Array(Math.floor(rng() * 10)).fill(
              String.fromCharCode(96 + Math.floor(rng() * 26))
            )
          );
        } else checker.delete(index, 1);
        if (i % 20 === 0) checker.testQueries(rng);
      }
    });

    test("single set, bulk delete", () => {
      const checker = new Checker();
      for (let i = 0; i < 200; i++) {
        const index = Math.floor(rng() * 30);
        if (rng() < 0.8) {
          checker.set(index, [
            String.fromCharCode(96 + Math.floor(rng() * 26)),
          ]);
        } else checker.delete(index, Math.floor(rng() * 10));
        if (i % 20 === 0) checker.testQueries(rng);
      }
    });

    test("bulk ops", () => {
      const checker = new Checker();
      for (let i = 0; i < 200; i++) {
        const index = Math.floor(rng() * 30);
        if (rng() < 0.5) {
          checker.set(
            index,
            new Array(Math.floor(rng() * 10)).fill(
              String.fromCharCode(96 + Math.floor(rng() * 26))
            )
          );
        } else checker.delete(index, Math.floor(rng() * 10));
        if (i % 20 === 0) checker.testQueries(rng);
      }
    });

    // test("first deleted", () => {
    //   // Values [null, "x"].
    //   const [items] = man.set(man.new(), 1, ["x"]);
    //   assert.strictEqual(man.findPresentIndex(items, 0, 0), 1);
    // });
  });
});
