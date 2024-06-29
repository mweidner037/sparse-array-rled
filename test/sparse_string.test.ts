import { assert } from "chai";
import { describe, test } from "mocha";
import seedrandom from "seedrandom";
import { SerializedSparseString, SparseString } from "../src";
import { Pair } from "../src/sparse_items";

const DEBUG = false;

function getState(arr: SparseString): Pair<string>[] {
  // @ts-expect-error Ignore protected
  return arr.asPairs();
}

function validate(pairs: Pair<string>[]): void {
  // No nonsense i's.
  assert.doesNotHaveAnyKeys(pairs, ["-1", "-2", "-0"]);

  // In order.
  for (let i = 0; i < pairs.length - 1; i++) {
    assert.isBelow(pairs[i].index, pairs[i + 1].index);
  }

  // Proper types.
  for (let i = 0; i < pairs.length; i++) {
    assert.isString(pairs[i].item);
  }

  // No empty items.
  for (let i = 0; i < pairs.length; i++) {
    assert.notStrictEqual(pairs[i].item.length, 0);
  }

  // No overlapping or joinable segments.
  for (let i = 0; i < pairs.length - 1; i++) {
    const thisEnd = pairs[i].index + pairs[i].item.length;
    const nextStart = pairs[i + 1].index;
    assert.isBelow(thisEnd, nextStart);
  }
}

function getPresentLength(pairs: Pair<string>[]): number {
  if (pairs.length === 0) return 0;
  const lastPair = pairs.at(-1)!;
  return lastPair.index + lastPair.item.length;
}

function getValuesLength<T>(values: (T | null)[]): number {
  let ans = 0;
  for (let i = 0; i < values.length; i++) {
    if (values[i] !== null) ans = i + 1;
  }
  return ans;
}

function check(arr: SparseString, values: (string | null)[]) {
  const state = getState(arr);
  validate(state);

  for (let i = 0; i < values.length; i++) {
    assert.strictEqual(arr.has(i), values[i] !== null);
    assert.strictEqual(arr.get(i), values[i] ?? undefined);
  }
  assert.strictEqual(arr.length, getPresentLength(state));
  assert.strictEqual(arr.length, getValuesLength(values));

  // Queries should also work on indexes past the length.
  for (let i = 0; i < 10; i++) {
    assert.deepStrictEqual(arr.has(arr.length + i), false);
    assert.deepStrictEqual(arr.get(arr.length + i), undefined);
  }
}

function entriesAsItems(
  entries: Array<[index: number, char: string]>
): Array<[index: number, item: string]> {
  const pairs: Pair<string>[] = [];
  let curLength = 0;

  for (const [index, char] of entries) {
    if (index === curLength && pairs.length !== 0) {
      pairs[pairs.length - 1].item += char;
    } else {
      pairs.push({ index, item: char });
    }
    curLength = index + 1;
  }

  return pairs.map(({ index, item }) => [index, item]);
}

function countBetween(
  values: (string | null)[],
  startIndex: number,
  endIndex: number
): number {
  let ans = 0;
  for (let i = startIndex; i < Math.min(endIndex, values.length); i++) {
    if (values[i] !== null) ans++;
  }
  return ans;
}

class Checker {
  readonly arr: SparseString;
  values: (string | null)[];

  constructor(serialized?: [SerializedSparseString, (string | null)[]]) {
    if (serialized !== undefined) {
      this.arr = SparseString.deserialize(serialized[0]);
      this.values = [...serialized[1]];
      this.check();
    } else {
      this.arr = SparseString.new();
      this.values = [];
    }
  }

  serialize(): [SerializedSparseString, (string | null)[]] {
    return [this.arr.serialize(), [...this.values]];
  }

  check() {
    check(this.arr, this.values);
  }

  set(index: number, ...newValues: string[]) {
    if (DEBUG) {
      console.log("\nset", index, newValues);
      console.log("before:  ", getState(this.arr));
    }

    const replacedValues = new Array<string | null>(newValues.length);
    for (let i = 0; i < newValues.length; i++) {
      replacedValues[i] = this.values[index + i] ?? null;
    }

    const replaced = this.arr.set(index, newValues.join(""));

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
    assert.strictEqual(replaced.length, getValuesLength(replacedValues));
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
    assert.strictEqual(replaced.length, getValuesLength(replacedValues));
  }

  /**
   * Test all _getAtCount inputs and some newSlicer walks.
   *
   * More expensive (O(length^2) ops), so only call occasionally,
   * in "interesting" states.
   */
  testQueries(rng: seedrandom.PRNG) {
    // Test entries, keys.
    const entries = [...this.arr.entries()];
    const keys = [...this.arr.keys()];
    let nextEntry = 0;
    for (let i = 0; i < this.values.length; i++) {
      if (this.values[i] !== null) {
        assert.deepStrictEqual(entries[nextEntry], [i, this.values[i]]);
        assert.deepStrictEqual(keys[nextEntry], i);
        nextEntry++;
      }
    }
    assert.strictEqual(nextEntry, entries.length);
    assert.strictEqual(nextEntry, keys.length);

    // // Test fromEntries.
    // const arr2 = SparseString.fromEntries(entries);
    // check(arr2, this.values);

    // Test items.
    const items = [...this.arr.items()];
    let prevEnd = -1;
    for (const [index, values] of items) {
      assert.notStrictEqual(index, prevEnd);
      for (let i = 0; i < values.length; i++) {
        assert(this.values[index + i]);
        assert.strictEqual(values[i], this.values[index + i]);
      }
      assert(!this.values[index + values.length]);

      prevEnd = index + values.length;
    }

    // Test _getAtCount.
    for (
      let startIndex = 0;
      startIndex < this.values.length + 2;
      startIndex++
    ) {
      for (let count = 0; count < this.values.length + 2; count++) {
        // Find the count-th present value starting at startIndex, in values.
        let remaining = count;
        let index = startIndex;
        for (; index < this.values.length; index++) {
          if (this.values[index] !== null) {
            if (remaining === 0) break;
            remaining--;
          }
        }
        if (index >= this.values.length) {
          // count is too large - not found.
          assert.deepStrictEqual(this.arr._getAtCount(count, startIndex), null);
          assert.strictEqual(this.arr.indexOfCount(count, startIndex), -1);
        } else {
          // Answer is index.
          const actual = this.arr._getAtCount(count, startIndex);
          assert.isNotNull(actual);
          const [item, offset, actualIndex] = actual!;
          assert.deepStrictEqual(
            [item[offset], actualIndex],
            [this.values[index], index]
          );
          assert.strictEqual(this.arr.indexOfCount(count, startIndex), index);
        }
      }
    }

    // Test count*.
    const valuesCount = countBetween(this.values, 0, this.values.length);
    assert.strictEqual(this.arr.count(), valuesCount);
    assert.strictEqual(this.arr.isEmpty(), valuesCount === 0);
    for (let i = 0; i < this.values.length + 2; i++) {
      assert.deepStrictEqual(this.arr._countHas(i), [
        countBetween(this.values, 0, i),
        i < this.values.length && this.values[i] !== null,
      ]);
      for (let j = i; j < this.values.length + 2; j++) {
        assert.strictEqual(
          this.arr.countBetween(i, j),
          countBetween(this.values, i, j)
        );
      }
    }

    // Test newSlicer 10x with random slices.
    for (let trial = 0; trial < 10; trial++) {
      const slicer = this.arr.newSlicer();
      let lastEnd = 0;
      while (rng() >= 0.75) {
        // Length 0 to 20 (0 can happen w/ concurrent or L/R dual siblings).
        const len = Math.floor(rng() * 21);
        const actual = slicer.nextSlice(lastEnd + len);
        const expectedEntries = [...this.values.entries()]
          .slice(lastEnd, lastEnd + len)
          .filter(([, value]) => value != null) as [number, string][];
        const expected = entriesAsItems(expectedEntries);
        assert.deepStrictEqual(actual, expected);
        lastEnd += len;
      }
      // Finish.
      const expectedEntries = [...this.values.entries()]
        .slice(lastEnd)
        .filter(([, value]) => value != null) as [number, string][];
      const expected = entriesAsItems(expectedEntries);
      const actual = slicer.nextSlice(null);
      assert.deepStrictEqual(actual, expected);
    }
  }
}

describe("SparseString", () => {
  let rng!: seedrandom.PRNG;

  beforeEach(() => {
    rng = seedrandom("42");
  });

  test("empty", () => {
    check(SparseString.new(), []);
  });

  test("set once", () => {
    const checker = new Checker();
    checker.set(0, "a", "b", "c");
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
        checker.set(0, ...values);
        checker.set(i, ...new Array(j).fill("x"));
        checker.testQueries(rng);
      }
    }
  });

  test("set and delete", () => {
    const values = ["a", "b", "c", "d", "e"];

    for (let i = 0; i < 5; i++) {
      for (let j = 1; j < 5 - i; j++) {
        const checker = new Checker();
        checker.set(0, ...values);
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
        checker.set(cursor, String.fromCharCode(96 + Math.floor(rng() * 26)));
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
      checker.set(i, String.fromCharCode(96 + Math.floor(rng() * 26)));
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
          checker.set(index, String.fromCharCode(96 + Math.floor(rng() * 26)));
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
            ...new Array(Math.floor(rng() * 10)).fill(
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
          checker.set(index, String.fromCharCode(96 + Math.floor(rng() * 26)));
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
            ...new Array(Math.floor(rng() * 10)).fill(
              String.fromCharCode(96 + Math.floor(rng() * 26))
            )
          );
        } else checker.delete(index, Math.floor(rng() * 10));
        if (i % 20 === 0) checker.testQueries(rng);
      }
    });

    test("first deleted", () => {
      // Values [null, "x"].
      const arr = SparseString.new();
      arr.set(1, "x");
      assert.deepStrictEqual(arr.indexOfCount(0), 1);
    });

    const ALL_LENGTH = 7;
    test(`all ${ALL_LENGTH}-length ops`, function () {
      // Generous timeout (5x what my laptop needs).
      this.timeout(70000);

      // Generate each possible array outline of length <= ALL_LENGTH.
      for (let a = 0; a < Math.pow(2, ALL_LENGTH); a++) {
        const preparer = new Checker();
        for (let i = 0; i < ALL_LENGTH; i++) {
          if ((a & (1 << i)) !== 0) {
            preparer.set(i, String.fromCharCode(65 + i));
          }
        }
        preparer.testQueries(rng);

        // Perform each reasonable set/delete on the array.
        const preparedState = preparer.serialize();
        for (let index = 0; index < ALL_LENGTH + 2; index++) {
          for (let count = 0; count < ALL_LENGTH + 2; count++) {
            for (const op of ["set", "delete"] as const) {
              const checker = new Checker(preparedState);
              if (op === "set")
                preparer.set(index, ...new Array(count).fill("z"));
              else checker.delete(index, count);
            }
          }
        }
      }
    });
  });

  test("toString", () => {
    // Test both normalItem and pairs cases.
    for (const start of [0, 5]) {
      const arr = SparseString.new();
      arr.set(start, "abcde");
      assert.doesNotThrow(() => arr.toString());
      // toString should actually contain the values - not abbreviate like
      // console.log sometimes does.
      assert.notStrictEqual(arr.toString().indexOf('"abcde"'), -1);
    }
  });

  test("clone", () => {
    // Test both normalItem and pairs cases.
    for (const start of [0, 5]) {
      const arr = SparseString.new();
      arr.set(start, "abcde");
      const cloned = arr.clone();

      const clonedSerialized = cloned.serialize();
      assert.deepStrictEqual(clonedSerialized, arr.serialize());

      // Mutations should be independent (no aliasing).
      arr.set(7, "o");
      arr.set(2, "a");
      assert.deepStrictEqual(cloned.serialize(), clonedSerialized);

      const arrSerialized = arr.serialize();
      cloned.delete(7, 1);
      cloned.set(6, "d");
      cloned.set(13, "u");
      assert.deepStrictEqual(arr.serialize(), arrSerialized);
    }
  });

  test("serialize", () => {
    // Test a few explicit examples of serialize.
    const arr = SparseString.new();
    assert.deepStrictEqual(arr.serialize(), []);

    arr.set(0, "ab");
    assert.deepStrictEqual(arr.serialize(), ["ab"]);

    arr.delete(0, 2);
    assert.deepStrictEqual(arr.serialize(), []);

    arr.set(5, "cd");
    assert.deepStrictEqual(arr.serialize(), ["", 5, "cd"]);

    arr.delete(0, 10);
    assert.deepStrictEqual(arr.serialize(), []);

    arr.set(0, "x");
    arr.set(2, "yz");
    arr.set(7, "ABC");
    assert.deepStrictEqual(arr.serialize(), ["x", 1, "yz", 3, "ABC"]);
  });

  test("method errors", () => {
    // Test both normalItem and pairs cases.
    for (const start of [0, 5]) {
      const arr = SparseString.new();
      arr.set(start, "abcde");
      const initial = arr.serialize();

      // Each error case should throw and not change the array.
      // Indices >= length should *not* throw errors.

      // countBetween
      for (const bad of [-1, 0.5, NaN]) {
        assert.throws(() => arr.countBetween(bad, 3));
      }
      for (const bad of [-1, 0.5, NaN]) {
        assert.throws(() => arr.countBetween(0, bad));
      }
      assert.throws(() => arr.countBetween(1, -3));
      assert.doesNotThrow(() => arr.countBetween(15, 18));
      assert.deepStrictEqual(arr.serialize(), initial);

      // countAt
      for (const bad of [-1, 0.5, NaN]) {
        assert.throws(() => arr.countAt(bad));
      }
      assert.doesNotThrow(() => arr.countAt(18));
      assert.deepStrictEqual(arr.serialize(), initial);

      // has etc.
      for (const bad of [-1, 0.5, NaN]) {
        assert.throws(() => arr.has(bad));
        assert.throws(() => arr.get(bad));
      }
      assert.doesNotThrow(() => arr.has(18));
      assert.doesNotThrow(() => arr.get(18));
      assert.deepStrictEqual(arr.serialize(), initial);

      // indexOfCount
      for (const bad of [-1, 0.5, NaN]) {
        assert.throws(() => arr.indexOfCount(bad, 3));
      }
      for (const bad of [-1, 0.5, NaN]) {
        assert.throws(() => arr.indexOfCount(0, bad));
      }
      assert.doesNotThrow(() => arr.indexOfCount(15, 18));
      assert.deepStrictEqual(arr.serialize(), initial);

      // set and delete
      for (const bad of [-1, 0.5, NaN]) {
        assert.throws(() => arr.set(bad, "abcc"));
        assert.throws(() => arr.delete(bad, 3));
      }
      for (const bad of [-1, 0.5, NaN]) {
        assert.throws(() => arr.delete(3, bad));
      }
      assert.doesNotThrow(() => arr.clone().set(15, "abc"));
      assert.doesNotThrow(() => arr.clone().delete(15, 3));
      assert.deepStrictEqual(arr.serialize(), initial);

      // nextSlice
      const slicer = arr.newSlicer();
      for (const bad of [-1, 0.5, NaN]) {
        assert.throws(() => slicer.nextSlice(bad));
      }
      slicer.nextSlice(3);
      assert.throws(() => slicer.nextSlice(2));
      assert.doesNotThrow(() => slicer.nextSlice(4));
      // Repeat endIndex should given empty slice, not error.
      assert.deepStrictEqual(slicer.nextSlice(4), []);
      assert.doesNotThrow(() => slicer.nextSlice(18));
      assert.doesNotThrow(() => slicer.nextSlice(null));
      assert.deepStrictEqual(arr.serialize(), initial);
    }
  });

  // test("fromEntries errors", () => {
  //   for (const bad of [-1, 0.5, NaN]) {
  //     assert.throws(() => SparseString.fromEntries([[bad, "x"]]));
  //     assert.throws(() =>
  //       SparseString.fromEntries([
  //         [0, "y"],
  //         [bad, "x"],
  //       ])
  //     );
  //   }

  //   assert.throws(() =>
  //     SparseString.fromEntries([
  //       [0, "x"],
  //       [1, "y"],
  //       [1, "z"],
  //     ])
  //   );

  //   assert.throws(() =>
  //     SparseString.fromEntries([
  //       [0, "x"],
  //       [2, "y"],
  //       [1, "z"],
  //     ])
  //   );

  //   assert.doesNotThrow(() => SparseString.fromEntries([]));
  //   assert.doesNotThrow(() => SparseString.fromEntries([[1, "x"]]));
  //   assert.doesNotThrow(() =>
  //     SparseString.fromEntries([
  //       [1, "x"],
  //       [7, "y"],
  //       [1000, "z"],
  //     ])
  //   );
  // });

  test("deserialize errors", () => {
    for (const bad of [-1, 0.5, NaN]) {
      assert.throws(() => SparseString.deserialize(["", bad]));
      assert.throws(() => SparseString.deserialize(["abc", 7, "xy", bad, "m"]));
    }

    assert.throws(() =>
      // @ts-expect-error
      SparseString.deserialize(["abc", 7, ["x", "y", "z"], 3, "m"])
    );
    assert.throws(() =>
      // @ts-expect-error
      SparseString.deserialize([["x", "y", "z"], 7, "abc", 3, "m"])
    );
    assert.throws(() =>
      // @ts-expect-error
      SparseString.deserialize(["abc", 7, null, 3, "m"])
    );
    assert.throws(() =>
      // @ts-expect-error
      SparseString.deserialize(["abc", 7, {}, 3, "m"])
    );
    assert.throws(() => SparseString.deserialize(["abc", 7, 6, 3, "m"]));
    assert.throws(() => SparseString.deserialize(["abc", 7, "x", "y", "m"]));

    assert.throws(() => SparseString.deserialize([3, "abc", 7, "xy", "m"]));

    assert.throws(() => SparseString.deserialize(["abc", 7, "", 3, "m"]));
    assert.throws(() => SparseString.deserialize(["abc", 0, "xy", 3, "m"]));

    assert.doesNotThrow(() => SparseString.deserialize([]));
    assert.doesNotThrow(() => SparseString.deserialize(["", 7, "x"]));
  });
});
