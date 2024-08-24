import { assert } from "chai";
import { describe, test } from "mocha";
import seedrandom from "seedrandom";
import { SerializedSparseString, SparseString } from "../src";
import { DeletedNode, Node } from "../src/sparse_items";
import { DEBUG } from "./util";

interface Embed {
  a?: string;
  b?: string;
}

function getState<E extends object | never>(
  arr: SparseString<E>
): Node<string | E>[] {
  const nodes: Node<string | E>[] = [];
  // @ts-expect-error Ignore private.
  for (let current = arr.next; current !== null; current = current.next) {
    nodes.push(current);
  }
  return nodes;
}

function validate<E extends object | never>(nodes: Node<string | E>[]): void {
  // Proper types.
  for (const node of nodes) {
    if (node instanceof DeletedNode) {
      assert.isNumber(node.length);
    } else if (node.constructor.name === "StringNode") {
      assert.isString(node.item);
    } else {
      // EmbedNode
      assert.isObject(node.item);
      assert.isNotNull(node.item);
      assert.strictEqual(node.length, 1);
    }
  }

  // No empty items.
  for (let i = 0; i < nodes.length; i++) {
    assert.notStrictEqual(nodes[i].length, 0);
  }

  // No joinable nodes.
  for (let i = 0; i < nodes.length - 1; i++) {
    // Embed nodes are never joinable.
    if (
      !(
        nodes[i].constructor.name === "EmbedNode" &&
        nodes[i + 1].constructor.name === "EmbedNode"
      )
    ) {
      assert.notStrictEqual(
        nodes[i].constructor.name,
        nodes[i + 1].constructor.name
      );
    }
  }
}

function getPresentLength<E extends object | never>(
  nodes: Node<string | E>[]
): number {
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

function check<E extends object | never>(
  arr: SparseString<E>,
  values: (string | E | null)[]
) {
  const state = getState(arr);
  validate(state);

  for (let i = 0; i < values.length; i++) {
    assert.strictEqual(arr.has(i), values[i] !== null);
    assert.strictEqual(arr.get(i), values[i] ?? undefined);
  }
  assert.strictEqual(arr.length, getPresentLength(state));
  assert.strictEqual(arr.length, getValuesLength(values));

  assert.strictEqual(arr.isEmpty(), getValuesLength(values) === 0);

  // Queries should also work on indexes past the length.
  for (let i = 0; i < 10; i++) {
    assert.deepStrictEqual(arr.has(arr.length + i), false);
    assert.deepStrictEqual(arr.get(arr.length + i), undefined);
  }
}

function entriesAsItems<E extends object | never>(
  entries: Array<[index: number, char: string | E]>
): Array<[index: number, item: string | E]> {
  const pairs: { index: number; item: string | E }[] = [];
  let curLength = 0;

  for (const [index, char] of entries) {
    if (
      index === curLength &&
      pairs.length !== 0 &&
      typeof char === "string" &&
      typeof pairs[pairs.length - 1].item === "string"
    ) {
      pairs[pairs.length - 1].item += char;
    } else {
      pairs.push({ index, item: char });
    }
    curLength = index + 1;
  }

  return pairs.map(({ index, item }) => [index, item]);
}

function countBetween<E extends object | never>(
  values: (string | E | null)[],
  startIndex: number,
  endIndex: number
): number {
  let ans = 0;
  for (let i = startIndex; i < Math.min(endIndex, values.length); i++) {
    if (values[i] !== null) ans++;
  }
  return ans;
}

class Checker<E extends object | never = never> {
  readonly arr: SparseString<E>;
  values: (string | E | null)[];

  constructor(serialized?: [SerializedSparseString<E>, (string | E | null)[]]) {
    if (serialized !== undefined) {
      this.arr = SparseString.deserialize(serialized[0]);
      this.values = [...serialized[1]];
      this.check();
    } else {
      this.arr = SparseString.new();
      this.values = [];
    }
  }

  serialize(): [SerializedSparseString<E>, (string | E | null)[]] {
    return [this.arr.serialize(), [...this.values]];
  }

  check() {
    check(this.arr, this.values);
  }

  set(index: number, ...newValues: string[]) {
    for (const newValue of newValues) {
      if (newValue.length !== 1) {
        throw new Error(
          `Test error: expected spread of single chars; received "${newValue}"`
        );
      }
    }

    if (DEBUG) {
      console.log("\nset", index, newValues);
      console.log("before:  ", getState(this.arr));
    }

    const replacedValues = new Array<string | E | null>(newValues.length);
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

  setEmbed(index: number, value: E) {
    if (DEBUG) {
      console.log("\nsetEmbed", index, value);
      console.log("before:  ", getState(this.arr));
    }

    const replacedValues = [this.values[index] ?? null];

    const replaced = this.arr.set(index, value);

    // Update this.values in parallel.
    for (let i = this.values.length; i < index + 1; i++) {
      this.values.push(null);
    }
    this.values[index] = value;

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

    const replacedValues = new Array<string | E | null>(count);
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

    // Test items.
    const items = [...this.arr.items()];
    let prevEnd = -1;
    let prevType = "";
    for (const [index, values] of items) {
      if (prevEnd === index) {
        // Adjacent items must have different types, unless they are both embeds.
        if (typeof values !== "object") {
          assert.notStrictEqual(typeof values, prevType);
        }
      } else {
        assert(!this.values[prevEnd]);
      }
      if (typeof values === "string") {
        for (let i = 0; i < values.length; i++) {
          assert(this.values[index + i]);
          assert.strictEqual(values[i], this.values[index + i]);
        }
        prevEnd = index + values.length;
      } else {
        assert(this.values[index]);
        assert.strictEqual(values, this.values[index]);
        prevEnd = index + 1;
      }
      prevType = typeof values;
    }
    assert(!this.values[prevEnd]);

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

  test("untrimmed", () => {
    // Deliberately create arrays whose internal representation is untrimmed
    // (ends with a deleted node) and check that length, isEmpty,
    // and the serialized form are unaffected.
    const checker = new Checker<Embed>();

    checker.set(0, ..."abcde");
    checker.delete(0, 5);
    checker.testQueries(rng);
    assert.deepStrictEqual(checker.serialize()[0], []);

    checker.set(0, ..."abcde");
    checker.delete(3, 2);
    checker.testQueries(rng);
    assert.deepStrictEqual(checker.serialize()[0], ["abc"]);

    checker.set(0, ..."abcde");
    checker.delete(3, 5);
    checker.testQueries(rng);
    assert.deepStrictEqual(checker.serialize()[0], ["abc"]);

    checker.setEmbed(5, { a: "foo" });
    checker.setEmbed(6, { b: "bar" });
    checker.delete(6, 1);
    checker.delete(5, 1);
    checker.testQueries(rng);
    assert.deepStrictEqual(checker.serialize()[0], ["abc"]);
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

  describe("embeds", () => {
    test("set once", () => {
      const checker = new Checker<Embed>();
      checker.setEmbed(0, { a: "foo" });
      checker.testQueries(rng);
    });

    test("set in deleted", () => {
      const checker = new Checker<Embed>();
      checker.setEmbed(5, { a: "foo" });
      checker.testQueries(rng);
    });

    test("set adjacent to string", () => {
      const checker = new Checker<Embed>();
      checker.set(5, ..."hello");
      checker.setEmbed(10, { a: "foo" });
      checker.testQueries(rng);
      checker.setEmbed(4, { b: "bar" });
      checker.testQueries(rng);
    });

    test("set at ends of string", () => {
      const checker = new Checker<Embed>();
      checker.set(5, ..."hello");
      checker.setEmbed(9, { a: "foo" });
      checker.testQueries(rng);
      checker.setEmbed(5, { b: "bar" });
      checker.testQueries(rng);
    });

    test("set inside string", () => {
      const checker = new Checker<Embed>();
      checker.set(0, ..."hello there");
      checker.setEmbed(5, { a: "foo" });
      checker.testQueries(rng);
    });

    test("set string second", () => {
      const checker = new Checker<Embed>();
      checker.setEmbed(5, { a: "foo" });

      // Not adjacent.
      checker.set(0, "A");
      checker.set(10, "B");
      checker.testQueries(rng);

      // Adjacent.
      checker.set(4, "C");
      checker.set(6, "D");
      checker.testQueries(rng);
    });

    test("overwrite with string", () => {
      const checker = new Checker<Embed>();
      checker.set(0, ..."hello world");
      checker.setEmbed(0, { a: "start" });
      checker.setEmbed(5, { a: "middle" });
      checker.setEmbed(11, { a: "end" });
      checker.testQueries(rng);

      checker.set(0, ..."0123456789a");
      checker.testQueries(rng);
    });

    test("adjacent embeds", () => {
      const checker = new Checker<Embed>();

      checker.setEmbed(0, { a: "0" });
      checker.setEmbed(1, { a: "1" });
      checker.testQueries(rng);
      checker.setEmbed(2, { a: "2" });

      checker.setEmbed(5, { a: "5" });
      checker.setEmbed(4, { a: "4" });
      checker.testQueries(rng);

      checker.setEmbed(9, { a: "9" });
      checker.setEmbed(11, { a: "11" });
      checker.setEmbed(10, { a: "10" });
      checker.testQueries(rng);

      checker.delete(0, 1);
      checker.testQueries(rng);

      checker.delete(3, 4);
      checker.testQueries(rng);

      checker.delete(10, 1);
      checker.testQueries(rng);

      checker.delete(9, 5);
      checker.testQueries(rng);
    });

    test("overwrite with embed", () => {
      const checker = new Checker<Embed>();
      checker.set(0, ..."hello");
      checker.setEmbed(5, { a: "foo" });
      checker.set(6, ..."there");

      checker.setEmbed(5, { b: "bar" });
      checker.testQueries(rng);
    });

    const ALL_LENGTH = 5;
    test(`all ${ALL_LENGTH}-length ops`, function () {
      // Generous timeout (5x what my laptop needs).
      this.timeout(70000);

      // Generate each possible array outline of length <= ALL_LENGTH.
      for (let a = 0; a < Math.pow(3, ALL_LENGTH); a++) {
        const preparer = new Checker<Embed>();
        for (let i = 0; i < ALL_LENGTH; i++) {
          switch (Math.floor(a / Math.pow(3, i)) % 3) {
            case 1:
              preparer.set(i, String.fromCharCode(65 + i));
              break;
            case 2:
              preparer.setEmbed(i, { a: i + "" });
              break;
          }
        }
        preparer.testQueries(rng);

        // Perform each reasonable set/delete on the array.
        const preparedState = preparer.serialize();
        for (let index = 0; index < ALL_LENGTH + 2; index++) {
          for (const op of ["set", "setEmbed", "delete"] as const) {
            for (
              let count = 0;
              count < (op === "setEmbed" ? 1 : ALL_LENGTH + 2);
              count++
            ) {
              const checker = new Checker(preparedState);
              switch (op) {
                case "set":
                  preparer.set(index, ...new Array(count).fill("z"));
                  break;
                case "setEmbed":
                  preparer.setEmbed(index, { a: "set" + index });
                  break;
                case "delete":
                  checker.delete(index, count);
                  break;
              }
            }
          }
        }
      }
    });
  });

  test("toString", () => {
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
    for (const start of [null, 0, 5]) {
      const arr = SparseString.new();
      if (start !== null) arr.set(start, "abcde");
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
    assert.deepStrictEqual(arr.serialize(), [5, "cd"]);

    arr.delete(0, 10);
    assert.deepStrictEqual(arr.serialize(), []);

    arr.set(0, "x");
    arr.set(2, "yz");
    arr.set(7, "ABC");
    assert.deepStrictEqual(arr.serialize(), ["x", 1, "yz", 3, "ABC"]);
  });

  test("method errors", () => {
    for (const start of [0, 5]) {
      const arr = SparseString.new();
      arr.set(start, "abcde");
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
      for (const badValue of [null, () => {}, 3]) {
        // @ts-expect-error
        assert.throws(() => arr.set(0, badValue));
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

  test("deserialize errors", () => {
    for (const bad of [-1, 0.5, NaN]) {
      assert.throws(() => SparseString.deserialize(["", bad]));
      assert.throws(() => SparseString.deserialize(["abc", 7, "xy", bad, "m"]));
    }

    // Note: objects including arrays are okay (no error) because they become embeds.
    assert.throws(() =>
      // @ts-expect-error
      SparseString.deserialize(["abc", 7, undefined, 3, "m"])
    );
    assert.throws(() =>
      // @ts-expect-error
      SparseString.deserialize([Symbol(), 7, "abc", 3, "m"])
    );
    assert.throws(() =>
      // @ts-expect-error
      SparseString.deserialize(["abc", 7, null, 3, "m"])
    );
    assert.throws(() =>
      // I would expect this to cause a TS error, but apparently functions can be assigned
      // to `object`, which only excludes primitive types.
      // Nevertheless, the code will not accept this embed, since it expects typeof to be "object"
      // (+ not null).
      SparseString.deserialize(["abc", 7, () => {}, 3, "m"])
    );

    assert.doesNotThrow(() => SparseString.deserialize(["abc", 7, 6, 3, "m"]));
    assert.doesNotThrow(() =>
      SparseString.deserialize(["abc", 7, "x", "y", "m"])
    );
    assert.doesNotThrow(() =>
      SparseString.deserialize([3, "abc", 7, "xy", "m"])
    );
    assert.doesNotThrow(() => SparseString.deserialize(["abc", 7, "", 3, "m"]));
    assert.doesNotThrow(() =>
      SparseString.deserialize(["abc", 0, "xy", 3, "m"])
    );

    assert.doesNotThrow(() => SparseString.deserialize([]));
    assert.doesNotThrow(() => SparseString.deserialize(["", 7, "x"]));
  });
});
