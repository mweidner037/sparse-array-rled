import { assert } from "chai";
import { describe, test } from "mocha";
import seedrandom from "seedrandom";
import { SerializedSparseIndices, SparseIndices } from "../src";
import { DeletedNode, Node } from "../src/sparse_items";
import { DEBUG } from "./util";

function getState(arr: SparseIndices): Node<number>[] {
  const nodes: Node<number>[] = [];
  // @ts-expect-error Ignore private.
  for (let current = arr.next; current !== null; current = current.next) {
    nodes.push(current);
  }
  return nodes;
}

function validate(nodes: Node<string>[]): void {
  // Proper types.
  for (const node of nodes) {
    if (node instanceof DeletedNode) {
      assert.isNumber(node.length);
    } else {
      assert.isNumber(node.item);
    }
  }

  // No empty items.
  for (let i = 0; i < nodes.length; i++) {
    assert.notStrictEqual(nodes[i].length, 0);
  }

  // No joinable nodes.
  for (let i = 0; i < nodes.length - 1; i++) {
    assert.notStrictEqual(
      nodes[i].constructor.name,
      nodes[i + 1].constructor.name
    );
  }
}

function getPresentLength(nodes: Node<number>[]): number {
  let length = 0;
  for (const node of nodes) length += node.length;
  // Handle untrimmed case.
  if (nodes.length !== 0 && nodes[nodes.length - 1] instanceof DeletedNode) {
    length -= nodes[nodes.length - 1].length;
  }
  return length;
}

function getValuesLength<T>(values: (T | null)[]): number {
  let ans = 0;
  for (let i = 0; i < values.length; i++) {
    if (values[i] !== null) ans = i + 1;
  }
  return ans;
}

function check(arr: SparseIndices, values: (string | null)[]) {
  const state = getState(arr);
  validate(state);

  for (let i = 0; i < values.length; i++) {
    assert.strictEqual(arr.has(i), values[i] !== null);
  }
  assert.strictEqual(arr.length, getPresentLength(state));
  assert.strictEqual(arr.length, getValuesLength(values));

  // Queries should also work on indexes past the length.
  for (let i = 0; i < 10; i++) {
    assert.deepStrictEqual(arr.has(arr.length + i), false);
  }
}

function entriesAsItems(
  entries: Array<[index: number, char: string]>
): Array<[index: number, item: number]> {
  const pairs: { index: number; item: number }[] = [];
  let curLength = 0;

  for (const [index, char] of entries) {
    if (index === curLength && pairs.length !== 0) {
      pairs[pairs.length - 1].item += 1;
    } else {
      pairs.push({ index, item: 1 });
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
  readonly arr: SparseIndices;
  values: (string | null)[];

  constructor(serialized?: [SerializedSparseIndices, (string | null)[]]) {
    if (serialized !== undefined) {
      this.arr = SparseIndices.deserialize(serialized[0]);
      this.values = [...serialized[1]];
      this.check();
    } else {
      this.arr = SparseIndices.new();
      this.values = [];
    }
  }

  serialize(): [SerializedSparseIndices, (string | null)[]] {
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

    const replaced = this.arr.set(index, newValues.length);

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
   * Test all indexOfCount inputs and some newSlicer walks.
   *
   * More expensive (O(length^2) ops), so only call occasionally,
   * in "interesting" states.
   */
  testQueries(rng: seedrandom.PRNG) {
    // Test entries, keys.
    const keys = [...this.arr.keys()];
    let nextEntry = 0;
    for (let i = 0; i < this.values.length; i++) {
      if (this.values[i] !== null) {
        assert.deepStrictEqual(keys[nextEntry], i);
        nextEntry++;
      }
    }
    assert.strictEqual(nextEntry, keys.length);

    // // Test fromKeys.
    // const arr2 = SparseIndices.fromKeys(keys);
    // check(arr2, this.values);

    // Test items.
    const items = [...this.arr.items()];
    let prevEnd = -1;
    for (const [index, values] of items) {
      assert.notStrictEqual(index, prevEnd);
      for (let i = 0; i < values; i++) {
        assert(this.values[index + i]);
      }
      assert(!this.values[index + values]);

      prevEnd = index + values;
    }

    // Test indexOfCount.
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
          assert.strictEqual(this.arr.indexOfCount(count, startIndex), -1);
        } else {
          // Answer is index.
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

describe("SparseIndices", () => {
  let rng!: seedrandom.PRNG;

  beforeEach(() => {
    rng = seedrandom("42");
  });

  test("empty", () => {
    check(SparseIndices.new(), []);
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
      const arr = SparseIndices.new();
      arr.set(1, 1);
      assert.deepStrictEqual(arr.indexOfCount(0), 1);
    });

    const ALL_LENGTH = 7;
    test(`all ${ALL_LENGTH}-length ops`, function () {
      // Generous timeout (5x what my laptop needs).
      this.timeout(30000);

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
      const arr = SparseIndices.new();
      arr.set(start, 5);
      assert.doesNotThrow(() => arr.toString());
      // toString should actually contain the values - not abbreviate like
      // console.log sometimes does.
      assert.notStrictEqual(arr.toString().indexOf("5"), -1);
    }
  });

  test("clone", () => {
    // Test both normalItem and pairs cases.
    for (const start of [0, 5]) {
      const arr = SparseIndices.new();
      arr.set(start, 5);
      const cloned = arr.clone();

      const clonedSerialized = cloned.serialize();
      assert.deepStrictEqual(clonedSerialized, arr.serialize());

      // Mutations should be independent (no aliasing).
      arr.set(7, 1);
      arr.set(2, 1);
      assert.deepStrictEqual(cloned.serialize(), clonedSerialized);

      const arrSerialized = arr.serialize();
      cloned.delete(7, 1);
      cloned.set(6, 1);
      cloned.set(13, 1);
      assert.deepStrictEqual(arr.serialize(), arrSerialized);
    }
  });

  test("serialize", () => {
    // Test a few explicit examples of serialize.
    const arr = SparseIndices.new();
    assert.deepStrictEqual(arr.serialize(), []);

    arr.set(0, 2);
    assert.deepStrictEqual(arr.serialize(), [2]);

    arr.delete(0, 2);
    assert.deepStrictEqual(arr.serialize(), []);

    arr.set(5, 2);
    assert.deepStrictEqual(arr.serialize(), [0, 5, 2]);

    arr.delete(0, 10);
    assert.deepStrictEqual(arr.serialize(), []);

    arr.set(0, 1);
    arr.set(2, 2);
    arr.set(7, 3);
    assert.deepStrictEqual(arr.serialize(), [1, 1, 2, 3, 3]);
  });

  test("method errors", () => {
    // Test both normalItem and pairs cases.
    for (const start of [0, 5]) {
      const arr = SparseIndices.new();
      arr.set(start, 5);
      const initial = arr.serialize();

      // Each error case should throw and not change the array.
      // Indices >= length should *not* throw errors.

      // countAt
      for (const bad of [-1, 0.5, NaN]) {
        assert.throws(() => arr.countAt(bad));
      }
      assert.doesNotThrow(() => arr.countAt(18));
      assert.deepStrictEqual(arr.serialize(), initial);

      // has etc.
      for (const bad of [-1, 0.5, NaN]) {
        assert.throws(() => arr.has(bad));
      }
      assert.doesNotThrow(() => arr.has(18));
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
        assert.throws(() => arr.set(bad, 4));
        assert.throws(() => arr.delete(bad, 3));
      }
      for (const bad of [-1, 0.5, NaN]) {
        assert.throws(() => arr.delete(3, bad));
      }
      assert.doesNotThrow(() => arr.clone().set(15, 3));
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

  // test("fromKeys errors", () => {
  //   for (const bad of [-1, 0.5, NaN]) {
  //     assert.throws(() => SparseIndices.fromKeys([bad]));
  //     assert.throws(() => SparseIndices.fromKeys([0, bad]));
  //   }

  //   assert.throws(() => SparseIndices.fromKeys([0, 1, 1]));

  //   assert.throws(() => SparseIndices.fromKeys([0, 2, 1]));

  //   assert.doesNotThrow(() => SparseIndices.fromKeys([]));
  //   assert.doesNotThrow(() => SparseIndices.fromKeys([1]));
  //   assert.doesNotThrow(() => SparseIndices.fromKeys([1, 7, 1000]));
  // });

  test("deserialize errors", () => {
    for (const bad of [-1, 0.5, NaN]) {
      assert.throws(() => SparseIndices.deserialize([0, bad]));
      assert.throws(() => SparseIndices.deserialize([3, 7, 2, bad, 1]));
    }

    assert.throws(() =>
      // @ts-expect-error
      SparseIndices.deserialize([3, 7, ["x", "y", "z"], 3, 1])
    );
    assert.throws(() =>
      // @ts-expect-error
      SparseIndices.deserialize([3, 7, "xyz", 3, 1])
    );
    assert.throws(() =>
      // @ts-expect-error
      SparseIndices.deserialize([["x", "y", "z"], 7, 3, 3, 1])
    );
    assert.throws(() =>
      // @ts-expect-error
      SparseIndices.deserialize(["xyz", 7, 3, 3, 1])
    );
    assert.throws(() =>
      // @ts-expect-error
      SparseIndices.deserialize([3, 7, null, 3, 1])
    );
    assert.throws(() =>
      // @ts-expect-error
      SparseIndices.deserialize([3, 7, {}, 3, 1])
    );

    assert.doesNotThrow(() => SparseIndices.deserialize([3, 7, 0, 3, 1]));
    assert.doesNotThrow(() => SparseIndices.deserialize([3, 0, 2, 3, 1]));

    assert.doesNotThrow(() => SparseIndices.deserialize([]));
    assert.doesNotThrow(() => SparseIndices.deserialize([0, 7, 1]));
  });
});
