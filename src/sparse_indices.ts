import {
  SparseItems,
  PresentNode,
  Node,
  DeletedNode,
  append,
} from "./sparse_items";

/**
 * Serialized form of a SparseIndices.
 *
 * The serialized form uses a compact JSON representation with run-length encoding. It alternates between:
 * - counts of present values (even indices), and
 * - counts of deletions (odd indices).
 *
 * For example, the sparse array `[true, true, , , , true, true]` serializes to `[2, 3, 2]`.
 *
 * Trivial entries (0s & trailing deletions) are always omitted,
 * except that the first entry may be 0.
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
    // We can't use deserializeItems because we distinguish present vs deleted nodes
    // by index parity, not by type.

    // To make constructing custom saved states easier, we tolerate
    // 0-length items and trailing deleted items.

    const startHolder: { next: Node<number> | null } = { next: null };
    let previous = startHolder;
    for (let i = 0; i < serialized.length; i++) {
      const maybeItem = serialized[i];
      if (!Number.isSafeInteger(maybeItem) || maybeItem < 0) {
        throw new Error(
          `Invalid ${
            i % 2 === 0 ? "present" : "delete"
          } count at serialized[${i}]: ${maybeItem}`
        );
      }
      if (maybeItem === 0) continue;

      let node: Node<number>;
      if (i % 2 === 1) {
        // Deleted node.
        node = new DeletedNode(maybeItem);
      } else {
        // Present node.
        node = new NumberNode(maybeItem);
      }
      previous = append(previous, node);
    }

    return new SparseIndices(startHolder.next);
  }

  /**
   * Returns a compact JSON representation of our state.
   *
   * See SerializedSparseIndices for a description of the format.
   */
  serialize(): SerializedSparseIndices {
    // Because both present and deleted nodes serialize to numbers, we
    // distinguish them by parity: present at even index, deleted at odd index.
    // In particular, we always start with a present element, even if it's 0.
    const savedState: number[] = [];
    let previousEndIndex = 0;
    for (const [index, count] of this.items()) {
      if (savedState.length === 0) {
        if (index === 0) savedState.push(count);
        else savedState.push(0, index, count);
      } else savedState.push(index - previousEndIndex, count);
      previousEndIndex = index + count;
    }
    return savedState;
  }

  newSlicer(): IndicesSlicer {
    return super.newSlicer();
  }

  /**
   * Iterates over the present items, in order.
   *
   * Each item [index, count] indicates a run of `count` present values starting at index,
   * ending at a deleted index.
   */
  items(): IterableIterator<[index: number, count: number]> {
    return super.items();
  }

  /**
   * Sets values to be present, starting at index.
   *
   * That is, sets all values in the range [index, index + count) to be present.
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
