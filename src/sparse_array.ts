import {
  Node,
  PresentNode,
  SparseItems,
  deserializeItems,
} from "./sparse_items";

/**
 * Serialized form of a `SparseArray<T>`.
 *
 * The serialized form uses a compact JSON representation with run-length encoded deletions. It alternates between:
 * - arrays of present values (even indices), and
 * - numbers (odd indices), representing that number of deleted values.
 *
 * For example, the sparse array `["foo", "bar", , , , "X", "yy"]` serializes to
 * `[["foo", "bar"], 3, ["X", "yy"]]`.
 *
 * Trivial entries (empty arrays, 0s, & trailing deletions) are always omitted,
 * except that the 0th entry may be an empty array.
 * For example, the sparse array `[, , "biz", "baz"]` serializes to `[[], 2, ["biz", "baz"]]`.
 */
export type SerializedSparseArray<T> = (T[] | number)[];

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
  // So list-positions can refer to unbound versions, we avoid using
  // "this" in static methods.
  /**
   * Returns a new, empty SparseArray.
   */
  static new<T>(): SparseArray<T> {
    return new SparseArray(null);
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
      deserializeItems(serialized, (allegedItem) => {
        if (!Array.isArray(allegedItem)) {
          throw new Error(`Invalid item in serialized state: ${allegedItem}`);
        }
        return new ArrayNode<T>(allegedItem as T[]);
      })
    );
  }

  // TODO. Do we even need this method?
  // If re-added, uncomment tests.
  // /**
  //  * Returns a new SparseArray with the given entries.
  //  *
  //  * The entries must be in order by index.
  //  *
  //  * @see SparseArray.entries
  //  */
  // static fromEntries<T>(
  //   entries: Iterable<[index: number, value: T]>
  // ): SparseArray<T> {
  //   const startHolder: {next: Node<T[]> | null} = {next: null};
  //   let current: Node<I> | null = null;
  //   let curLength = 0;

  //   for (const [index, value] of entries) {
  //     if (index < curLength) {
  //       throw new Error(
  //         `Out-of-order index in entries: ${index}, previous was ${
  //           curLength - 1
  //         }`
  //       );
  //     }

  //     if (index === curLength && pairs.length !== 0) {
  //       pairs[pairs.length - 1].item.push(value);
  //     } else {
  //       checkIndex(index);
  //       pairs.push({ index, item: [value] });
  //     }
  //     curLength = index + 1;
  //   }

  //   return new SparseArray(pairs);
  // }

  /**
   * Returns a compact JSON representation of our state.
   *
   * See SerializedSparseArray for a description of the format.
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

  newSlicer(): ArraySlicer<T> {
    return super.newSlicer();
  }

  /**
   * Iterates over the present [index, value] pairs, in order.
   *
   * @see SparseArray.fromEntries
   */
  *entries(): IterableIterator<[index: number, value: T]> {
    for (const [index, item] of this.items()) {
      for (let j = 0; j < item.length; j++) {
        yield [index + j, item[j]];
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

  protected construct(start: Node<T[]> | null): this {
    return new SparseArray(start) as this;
  }

  protected newNode(item: T[]): PresentNode<T[]> {
    return new ArrayNode(item);
  }
}

class ArrayNode<T> extends PresentNode<T[]> {
  constructor(public item: T[]) {
    super();
  }

  get length(): number {
    return this.item.length;
  }

  splitContent(index: number): PresentNode<T[]> {
    const after = new ArrayNode(this.item.slice(index));
    this.item.length = index;
    return after;
  }

  tryMergeContent(other: PresentNode<T[]>): boolean {
    this.item.push(...(other as ArrayNode<T>).item);
    return true;
  }

  sliceItem(start?: number, end?: number): T[] {
    return this.item.slice(start, end);
  }
}
