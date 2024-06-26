import { Itemer, Pair, SparseItems, deserializeItems } from "./sparse_items";
import { checkIndex } from "./util";

/**
 * Serialized form of a SparseIndices.
 *
 * The serialized form uses a compact JSON representation with run-length encoding. It alternates between:
 * - counts of present values (even indices), and
 * - counts of deleted values (odd indices).
 *
 * For example, the sparse array `[true, true, , , , true, true]` serializes to `[2, 3, 2]`.
 *
 * Trivial entries (0s & trailing deletions) are always omitted,
 * except that the 0th entry may be 0.
 * For example, the sparse array `[, , true, true, true]` serializes to `[0, 2, 3]`.
 */
export type SerializedSparseIndices = number[];

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
   *
   * @throws If endIndex is less than the previous index.
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
  // So list-positions can refer to unbound versions, we avoid using
  // "this" in static methods.
  /**
   * Returns a new, empty SparseIndices.
   */
  static new(): SparseIndices {
    return new SparseIndices([]);
  }

  /**
   * Returns a new SparseIndices by deserializing the given state
   * from `SparseIndices.serialize`.
   *
   * @throws If the serialized form is invalid (see `SparseIndices.serialize`).
   */
  static deserialize(serialized: SerializedSparseIndices): SparseIndices {
    return new SparseIndices(deserializeItems(serialized, indexesItemer));
  }

  /**
   * Returns a new SparseIndices with the given keys (indices).
   *
   * The keys must be in order by index.
   *
   * @see SparseIndices.keys
   */
  static fromKeys(keys: Iterable<number>): SparseIndices {
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
        checkIndex(index);
        pairs.push({ index, item: 1 });
      }
      curLength = index + 1;
    }

    return new SparseIndices(pairs);
  }

  /**
   * Returns a compact JSON representation of our state.
   *
   * See SerializedSparseIndices for a description of the format.
   */
  serialize(): SerializedSparseIndices {
    return super.serialize();
  }

  newSlicer(): IndicesSlicer {
    return super.newSlicer();
  }

  /**
   * Sets values to be present, starting at index.
   *
   * That is, sets all values in the range [index, index + values.length) to be present.
   *
   * @returns A SparseIndices describing the previous values' presence.
   * Index 0 in the returned array corresponds to `index` in this array.
   */
  set(index: number, count = 1): SparseIndices {
    return this._set(index, count);
  }

  protected construct(pairs: Pair<number>[]): this {
    return new SparseIndices(pairs) as this;
  }

  protected itemer() {
    return indexesItemer;
  }
}

const indexesItemer: Itemer<number> = {
  isValid(allegedItem: unknown): boolean {
    return Number.isSafeInteger(allegedItem) && <number>allegedItem >= 0;
  },

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
    const realStart = start === undefined ? 0 : Math.min(start, item);
    const realEnd = end === undefined ? item : Math.min(end, item);
    return realEnd - realStart;
  },

  update(item: number, index: number, replace: number): number {
    return Math.max(item, index + replace);
  },

  shorten(_item: number, newLength: number): number {
    return newLength;
  },
} as const;
