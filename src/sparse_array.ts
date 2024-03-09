import { Itemer, Pair, SparseItems, deserializeItems } from "./sparse_items";
import { checkIndex } from "./util";

/**
 * See SparseArray.serialize.
 */
export type SerializedSparseArray<T> = Array<T[] | number>;

/**
 * Iterator-like object returned by SparseArray.newSlicer().
 *
 * Call nextSlice repeatedly to enumerate the slices in order.
 */
export interface ArraySlicer<T> {
  /**
   * Returns an array of items in the next slice,
   * continuing from the previous index (inclusive) to endIndex (exclusive).
   *
   * Each item [index, values] indicates a run of present values starting at index,
   * ending at either endIndex or a deleted index.
   *
   * The first call starts at index 0. To end at the end of the array,
   * set `endIndex = null`.
   *
   * @throws If endIndex is less than the previous index.
   */
  nextSlice(endIndex: number | null): Array<[index: number, values: T[]]>;
}

/**
 * A sparse array with values of type `T`.
 *
 * `SparseArray<T>` behaves similarly to an ordinary `Array<T>` used in sparse mode.
 * (Note: Use set/get/delete instead of indexed access.)
 * However, it is additionally optimized for the following tasks:
 * 1. Convert between the array and a compact JSON representation
 * with run-length encoded deletions (`SerializedSparseArray<T>`).
 * 2. Iterate over present values only.
 * 3. Convert between a count `c` and the `c`-th present entry.
 *
 * For ordinary array tasks, SparseArray aims to have comparable
 * memory usage and acceptable speed relative to an ordinary Array. However, indexed accesses are slower
 * in principle, due to internal searches (similar to balanced-tree
 * collections).
 *
 * To construct a SparseArray, use the static `new`, `fromEntries`, or `deserialize` methods.
 *
 * @see SparseString For a memory-optimized array of chars.
 * @see SparseIndices To track a sparse array's present indices independent of its values.
 */
export class SparseArray<T> extends SparseItems<T[]> {
  /**
   * Returns a new, empty SparseArray.
   */
  static new<T>(): SparseArray<T> {
    return new SparseArray([]);
  }

  // OPT: unsafe version that skips internal T[] clones?
  // For faster loading direct from JSON (w/o storing refs elsewhere).
  /**
   * Returns a new SparseArray by deserializing the given state
   * from `SparseArray.serialize`.
   *
   * @throws If the serialized form is invalid (see `SparseArray.serialize`).
   */
  static deserialize<T>(serialized: SerializedSparseArray<T>): SparseArray<T> {
    return new SparseArray(
      deserializeItems(serialized, arrayItemer as Itemer<T[]>)
    );
  }

  /**
   * Returns a new SparseArray with the given entries.
   *
   * The entries must be in order by index.
   *
   * @see SparseArray.entries
   */
  static fromEntries<T>(
    entries: Iterable<[index: number, value: T]>
  ): SparseArray<T> {
    const pairs: Pair<T[]>[] = [];
    let curLength = 0;

    for (const [index, value] of entries) {
      if (index < curLength) {
        throw new Error(
          `Out-of-order index in entries: ${index}, previous was ${
            curLength - 1
          }`
        );
      }

      if (index === curLength && pairs.length !== 0) {
        pairs[pairs.length - 1].item.push(value);
      } else {
        checkIndex(index);
        pairs.push({ index, item: [value] });
      }
      curLength = index + 1;
    }

    return new SparseArray(pairs);
  }

  /**
   * Returns a compact JSON-serializable representation of our state.
   *
   * The return value uses a run-length encoding: it alternates between
   * - arrays of present values (even indices), and
   * - numbers (odd indices), representing that number of deleted values.
   *
   * For example, the sparse array `["foo", "bar", , , , "X", "yy"]` serializes to `[["foo", "bar"], 3, ["X", "yy"]]`.
   */
  serialize(): SerializedSparseArray<T> {
    return super.serialize();
  }

  /**
   * Returns the value at index, or undefined if not present.
   *
   * @throws If `index < 0`. (It is okay for index to exceed `this.length`.)
   */
  get(index: number): T | undefined {
    const located = this._get(index);
    if (located === null) return undefined;
    const [item, offset] = located;
    return item[offset];
  }

  /**
   * Finds the index corresponding to the given count.
   *
   * That is, we advance through the array
   * until reaching the `count`-th present value, returning its index.
   * If the array ends before finding such a value, returns null.
   *
   * Invert with countAt.
   *
   * @param startIndex Index to start searching. If specified, only indices >= startIndex
   * contribute towards `count`.
   *
   * @throws If `count < 0` or `startIndex < 0`. (It is okay for startIndex to exceed `this.length`.)
   */
  findCount(
    count: number,
    startIndex?: number
  ): [index: number, value: T] | null {
    const located = this._findCount(count, startIndex);
    if (located === null) return null;
    const [index, item, offset] = located;
    return [index, item[offset]];
  }

  newSlicer(): ArraySlicer<T> {
    return super.newSlicer();
  }

  /**
   * Iterates over the present [index, value] pairs, in order.
   *
   * @see SparseArray.fromEntries
   */
  *entries(): IterableIterator<[index: number, value: T]> {
    for (const pair of this.asPairs()) {
      for (let j = 0; j < pair.item.length; j++) {
        yield [pair.index + j, pair.item[j]];
      }
    }
  }

  /**
   * Sets values starting at index.
   *
   * That is, sets all values in the range [index, index + values.length) to the
   * given values.
   *
   * @returns A sparse array of the previous values.
   * Index 0 in the returned array corresponds to `index` in this array.
   */
  set(index: number, ...values: T[]): SparseArray<T> {
    return this._set(index, values);
  }

  protected construct(pairs: Pair<T[]>[]): this {
    return new SparseArray(pairs) as this;
  }

  protected itemer() {
    return arrayItemer as Itemer<T[]>;
  }
}

const arrayItemer: Itemer<unknown[]> = {
  isValid(allegedItem: unknown, emptyOkay: boolean): boolean {
    return (
      Array.isArray(allegedItem) && (allegedItem.length !== 0 || emptyOkay)
    );
  },

  newEmpty(): unknown[] {
    return [];
  },

  length(item: unknown[]): number {
    return item.length;
  },

  merge(a: unknown[], b: unknown[]): unknown[] {
    a.push(...b);
    return a;
  },

  slice(item: unknown[], start?: number, end?: number | undefined): unknown[] {
    return item.slice(start, end);
  },

  update(item: unknown[], start: number, replace: unknown[]): unknown[] {
    if (start === item.length) item.push(...replace);
    else {
      for (let i = 0; i < replace.length; i++) item[start + i] = replace[i];
    }
    return item;
  },

  shorten(item: unknown[], newLength: number): unknown[] {
    item.length = newLength;
    return item;
  },
} as const;
