import {
  SparseItems,
  deserializeItems,
  PresentNode,
  Node,
} from "./sparse_items";

// TODO: needs to use different serialize/deserialize.
// TODO: update serialized form descriptions on other classes (no longer alternating or strict start).

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
    return new SparseIndices(null);
  }

  /**
   * Returns a new SparseIndices by deserializing the given state
   * from `SparseIndices.serialize`.
   *
   * @throws If the serialized form is invalid (see `SparseIndices.serialize`).
   */
  static deserialize(serialized: SerializedSparseIndices): SparseIndices {
    // TODO: needs to be special b/c deleted-start rule
    return new SparseIndices(
      deserializeItems(serialized, (allegedItem) => {
        if (
          !(Number.isSafeInteger(allegedItem) && (allegedItem as number) >= 0)
        ) {
          throw new Error(`Invalid item in serialized state: ${allegedItem}`);
        }
        return new NumberNode(allegedItem as number);
      })
    );
  }

  // TODO. Do we even need this method?
  // If re-added, uncomment tests.
  // /**
  //  * Returns a new SparseIndices with the given keys (indices).
  //  *
  //  * The keys must be in order by index.
  //  *
  //  * @see SparseIndices.keys
  //  */
  // static fromKeys(keys: Iterable<number>): SparseIndices {
  //   const pairs: Pair<number>[] = [];
  //   let curLength = 0;

  //   for (const index of keys) {
  //     if (index < curLength) {
  //       throw new Error(
  //         `Out-of-order index in entries: ${index}, previous was ${
  //           curLength - 1
  //         }`
  //       );
  //     }

  //     if (index === curLength && pairs.length !== 0) {
  //       pairs[pairs.length - 1].item++;
  //     } else {
  //       checkIndex(index);
  //       pairs.push({ index, item: 1 });
  //     }
  //     curLength = index + 1;
  //   }

  //   return new SparseIndices(pairs);
  // }

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

  protected construct(start: Node<number> | null): this {
    return new SparseIndices(start) as this;
  }

  protected newNode(item: number): PresentNode<number> {
    return new NumberNode(item);
  }
}

class NumberNode extends PresentNode<number> {
  constructor(public item: number) {
    super();
  }

  get length(): number {
    return this.item;
  }

  splitContent(index: number): PresentNode<number> {
    const after = new NumberNode(this.item - index);
    this.item = index;
    return after;
  }

  tryMergeContent(other: PresentNode<number>): boolean {
    this.item += (other as NumberNode).item;
    return true;
  }

  sliceItem(start?: number, end?: number): number {
    return (end ?? this.item) - (start ?? 0);
  }
}
