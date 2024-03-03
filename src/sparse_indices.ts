import { Itemer, Pair, SparseItems, deserializeItems } from "./sparse_items";

/**
 * See SparseIndices.serialize.
 */
export type SerializedSparseIndices = Array<number>;

/**
 * Iterator-like object returned by SparseIndices.newSlicer().
 *
 * Call nextSlice repeatedly to enumerate the slices in order.
 */
export interface IndicesSlicer {
  /**
   * Returns an array of items in the next slice,
   * continuing from the previous index (inclusive) to endIndex (exclusive).
   *
   * Each item [index, count] indicates a run of `count` present values starting at index,
   * ending at either endIndex or a deleted index.
   *
   * The first call starts at index 0. To end at the end of the array,
   * set `endIndex = null`.
   */
  nextSlice(endIndex: number | null): Array<[index: number, count: number]>;
}

/**
 * The indices of a sparse array.
 *
 * SparseIndices is functionally identical to a SparseArray, except that
 * it only stores which indices are present, not their associated values.
 * This typically uses 4x less memory and results in smaller JSON.
 */
export class SparseIndices extends SparseItems<number> {
  /**
   * Returns a new, empty SparseIndices.
   *
   * @param length The initial length of the array.
   */
  static new(length = 0): SparseIndices {
    return new this([], length);
  }

  /**
   * Returns a new SparseIndices by deserializing the given state
   * from `SparseIndices.serialize`.
   */
  static deserialize(serialized: SerializedSparseIndices): SparseIndices {
    return new this(...deserializeItems(serialized, indexesItemer));
  }

  /**
   * Returns a new SparseIndices with the given keys (indices).
   *
   * The keys must be in order by index.
   *
   * @param length Overrides the array's initial length.
   * Must be >= the "true" initial length (last entry's index + 1).
   * @see SparseIndices.keys
   */
  static fromKeys(keys: Iterable<number>, length?: number): SparseIndices {
    const pairs: Pair<number>[] = [];
    let curLength = 0;

    for (const index of keys) {
      if (index < curLength) {
        throw new Error(
          `Out-of-order index in entries: ${index}, previous was ${
            curLength - 1
          }`
        );
      }

      if (index === curLength && pairs.length !== 0) {
        pairs[pairs.length - 1].item++;
      } else {
        pairs.push({ index, item: 1 });
      }
      curLength = index + 1;
    }

    if (length !== undefined && length < curLength) {
      throw new Error(
        `length is less than (max index + 1): ${length} < ${curLength}`
      );
    }
    return new this(pairs, length ?? curLength);
  }

  /**
   * Returns a compact JSON-serializable representation of our state.
   *
   * The return value uses a run-length encoding: it alternates between
   * - counts of present values (even indices), and
   * - counts of deleted values (odd indices).
   *
   * For example, the sparse array `[true, true, , , , true, true]` serializes to `[2, 3, 2]`.
   *
   * @param trimmed If true, the return value omits deletions at the end of the array,
   * i.e., between the last present value and `this.length`.
   */
  serialize(trimmed?: boolean): SerializedSparseIndices {
    return super.serialize(trimmed);
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
   */
  findCount(count: number, startIndex?: number): number | null {
    const located = this._findCount(count, startIndex);
    if (located === null) return null;
    return located[0];
  }

  newSlicer(): IndicesSlicer {
    return super.newSlicer();
  }

  /**
   * Adds values starting at index.
   *
   * That is, sets all values in the range [index, index + values.length) to be present.
   *
   * @returns A SparseIndices describing the previous values' presence.
   * Index 0 in the returned array corresponds to `index` in this array.
   */
  add(index: number, count = 1): SparseIndices {
    return this._set(index, count);
  }

  /**
   * Deletes count values starting at index.
   *
   * That is, deletes all values in the range [index, index + count).
   *
   * @returns A SparseIndices describing the previous values' presence.
   * Index 0 in the returned array corresponds to `index` in this array.
   */
  delete(index: number, count = 1): SparseIndices {
    return this._delete(index, count);
  }

  protected construct(pairs: Pair<number>[], length: number): this {
    return new SparseIndices(pairs, length) as this;
  }

  protected itemer() {
    return indexesItemer;
  }
}

const indexesItemer: Itemer<number> = {
  newEmpty(): number {
    return 0;
  },

  length(item: number): number {
    return item;
  },

  merge(a: number, b: number): number {
    return a + b;
  },

  slice(item: number, start?: number, end?: number): number {
    return (end ?? item) - (start ?? 0);
  },

  update(item: number, index: number, replace: number): number {
    return Math.max(item, index + replace);
  },

  shorten(_item: number, newLength: number): number {
    return newLength;
  },
} as const;
