import { checkIndex } from "./util";

// TODO: opt for simple overwrite (like prev Itemer.update method)? Check benchmarks.

export abstract class PresentNode<I> {
  next: Node<I> | null = null;
  abstract item: I;
  /**
   * For memory efficiency & mutations, this should be a getter using item,
   * instead of a stored property.
   */
  abstract readonly length: number;

  /**
   * Set this one to the first half in-place; return a new second half. Don't update next pointers.
   *
   * @param index 0 < index < length
   */
  abstract splitContent(index: number): PresentNode<I>;
  /**
   * Merge other's content with ours (appending other).
   *
   * @returns Whether merging succeeded.
   */
  abstract tryMergeContent(other: PresentNode<I>): boolean;
  /**
   * Return a slice of this.item, as a shallow copy.
   *
   * Default to 0/this.length; don't need to do slice() wrapping.
   * Guaranteed non-empty ((start ?? 0) < (end ?? length)).
   */
  abstract sliceItem(start?: number, end?: number): I;
}

export class DeletedNode<I> {
  next: Node<I> | null = null;
  constructor(public length: number) {}
  /**
   * Set this one to the first half in-place; return a new second half. Don't update next pointers.
   *
   * @param index 0 < index < length
   */
  splitContent(index: number): DeletedNode<I> {
    const after = new DeletedNode<I>(this.length - index);
    this.length = index;
    return after;
  }
}

export type Node<I> = PresentNode<I> | DeletedNode<I>;

/**
 * Generic type for output of SparseItems.newSlicer().
 *
 * Define a more specific version of this type (e.g. ArraySlicer),
 * replacing `item: I` with your choice of name and your item type,
 * and use it as the return value of your overridden newSlicer() function.
 */
export interface ItemSlicer<I> {
  /**
   * Returns an array of items in the next slice,
   * continuing from the previous index (inclusive) to endIndex (exclusive).
   *
   * Each item [index, item] indicates a run of present values starting at index,
   * ending at either endIndex or a deleted index.
   *
   * The first call starts at index 0. To end at the end of the array,
   * set `endIndex = null`.
   */
  nextSlice(endIndex: number | null): Array<[index: number, item: I]>;
}

/**
 * Templated implementation of the published Sparse* classes.
 *
 * It contains code that can be implemented in common, using generic "items" of
 * type I. Each item represents a run of present values.
 * - SparseArray<T>: T[]
 * - SparseString: string
 * - SparseIndices: number (count of present values).
 *
 * @typeParam I The type of items. Items must never be null.
 */
export abstract class SparseItems<I> {
  /**
   * A linked list of nodes.
   *
   * Neighboring nodes are always merged when possible. However, the list
   * is not necessarily trimmed: it may end in a (redundant) DeletedNode,
   * which is not visible externally.
   */
  private next: Node<I> | null = null;

  /**
   * Constructs a SparseItems with the given state, performing no validation.
   *
   * Don't override this constructor.
   */
  protected constructor(start: Node<I> | null) {
    this.next = start;
  }

  /**
   * We can't directly force subclasses to use the same constructor; instead, we use
   * this abstract method to construct instances of `this` as if we had called
   * our own constructor.
   */
  protected abstract construct(start: Node<I> | null): this;

  protected abstract newNode(item: I): PresentNode<I>;

  /**
   * The greatest present index in the array plus 1, or 0 if there are no
   * present values.
   *
   * All methods accept index arguments `>= this.length`, acting as if
   * the array ends with infinitely many holes.
   *
   * Note: Unlike an ordinary `Array`, you cannot explicitly set the length
   * to include additional holes.
   */
  get length(): number {
    if (this.next === null) return 0;

    let ans = 0;
    let current = this.next;
    for (; current.next !== null; current = current.next) {
      ans += current.length;
    }
    // Now current equals the last node. Only count it if it is present.
    if (current instanceof PresentNode) ans += current.length;
    return ans;
  }

  /**
   * Returns the number of present values in the array.
   */
  count(): number {
    let count = 0;
    for (let current = this.next; current !== null; current = current.next) {
      if (current instanceof PresentNode) {
        count += current.length;
      }
    }
    return count;
  }

  /**
   * @ignore Internal optimized combination of `countAt` and `has`.
   *
   * @throws If `index < 0`. (It is okay for index to exceed `this.length`.)
   */
  _countHas(index: number): [count: number, has: boolean] {
    checkIndex(index);

    // count "of" index = # present values before index.
    let count = 0;
    let remaining = index;
    for (let current = this.next; current !== null; current = current.next) {
      if (remaining < current.length) {
        if (current instanceof PresentNode) {
          count += remaining;
          return [count, true];
        } else return [count, false];
      }
      if (current instanceof PresentNode) count += current.length;
      remaining -= current.length;
    }
    return [count, false];
  }

  /**
   * Returns the count at index.
   *
   * The "count at index" is the number of present values up to but excluding index.
   * Equivalent, it is the `c` such that index is
   * the `c`-th present value (or would be if present).
   *
   * Invert with indexOfCount.
   *
   * @throws If `index < 0`. (It is okay for index to exceed `this.length`.)
   */
  countAt(index: number): number {
    return this._countHas(index)[0];
  }

  /**
   * Returns whether the array has no present values.
   *
   * Note that an array may be empty but have nonzero length.
   */
  isEmpty(): boolean {
    return (
      this.next === null ||
      (this.next instanceof DeletedNode && this.next.next === null)
    );
  }

  /**
   * @ignore Internal templated version of `get`.
   *
   * Returns the value at index, in the form [item, offset within item].
   *
   * @throws If `index < 0`. (It is okay for index to exceed `this.length`.)
   */
  _get(index: number): [item: I, offset: number] | null {
    checkIndex(index);

    let remaining = index;
    for (let current = this.next; current !== null; current = current.next) {
      if (remaining < current.length) {
        if (current instanceof DeletedNode) return null;
        else return [current.item, remaining];
      }
      remaining -= current.length;
    }
    return null;
  }

  /**
   * Returns whether index is present in the array.
   *
   * @throws If `index < 0`. (It is okay for index to exceed `this.length`.)
   */
  has(index: number): boolean {
    return this._get(index) !== null;
  }

  /**
   * Finds the index corresponding to the given count.
   *
   * That is, we advance through the array
   * until reaching the `count`-th present value, returning its index.
   * If the array ends before finding such a value, returns -1.
   *
   * Invert with countAt.
   *
   * @param startIndex Index to start searching. If specified, only indices >= startIndex
   * contribute towards `count`.
   *
   * @throws If `count < 0` or `startIndex < 0`. (It is okay for startIndex to exceed `this.length`.)
   */
  indexOfCount(count: number, startIndex = 0): number {
    checkIndex(count, "count");
    checkIndex(startIndex, "startIndex");

    if (this.next === null) return -1;
    const [node, offset, outside] = locate(this.next, startIndex);
    if (outside) return -1;

    // Step back to the start of node, so that we can ignore offset.
    if (node instanceof PresentNode) count += offset;
    let index = startIndex - offset;

    let countRemaining = count;
    for (
      let current: Node<I> | null = node;
      current !== null;
      current = current.next
    ) {
      if (current instanceof PresentNode) {
        if (countRemaining < current.length) {
          return index + countRemaining;
        }
        countRemaining -= current.length;
      }
      index += current.length;
    }
    return -1;
  }

  /**
   * Returns a "slicer" that enumerates slices of the array in order.
   *
   * The slicer is more efficient than requesting each slice separately,
   * since it "remembers its place" in our internal state.
   */
  newSlicer(): ItemSlicer<I> {
    return new PairSlicer(this.next);
  }

  // *items(): IterableIterator<[index: number, item: I]> {
  //   for (const pair of this.asPairs()) {
  //     // Always slice, to prevent exposing internal items.
  //     yield [pair.index, this.itemer().slice(pair.item)];
  //   }
  // }

  /**
   * Iterates over the present indices (keys), in order.
   */
  *keys(): IterableIterator<number> {
    let index = 0;
    for (let current = this.next; current !== null; current = current.next) {
      if (current instanceof PresentNode) {
        for (let j = 0; j < current.length; j++) {
          yield index + j;
        }
      }
      index += current.length;
    }
  }

  /**
   * Iterates over the present items, in order.
   *
   * Each item [index, values] indicates a run of present values starting at index,
   * ending at a deleted index.
   */
  *items(): IterableIterator<[index: number, values: I]> {
    let index = 0;
    for (let current = this.next; current !== null; current = current.next) {
      if (current instanceof PresentNode) {
        yield [index, current.sliceItem()];
      }
      index += current.length;
    }
  }

  /**
   * Returns a shallow copy of this array.
   */
  clone(): this {
    if (this.next === null) return this.construct(null);

    // Deep copy our state (but without cloning values within items - hence
    // it appears "shallow" to the caller).
    const startCloned = this.cloneNode(this.next);
    let currentCloned = startCloned;
    for (
      let current = this.next;
      current.next !== null;
      current = current.next
    ) {
      const nextCloned = this.cloneNode(current.next);
      currentCloned.next = nextCloned;
      currentCloned = nextCloned;
    }
    return this.construct(startCloned);
  }

  /**
   * Clones node's content while leaving next = null.
   */
  private cloneNode(node: Node<I>): Node<I> {
    if (node instanceof PresentNode) {
      return this.newNode(node.sliceItem());
    } else return new DeletedNode(node.length);
  }

  /**
   * Returns a compact JSON-serializable representation of our state.
   *
   * TODO
   * The return value uses a run-length encoding: it alternates between
   * - present items (even indices), and
   * - numbers (odd indices), representing that number of deleted values.
   */
  serialize(): (I | number)[] {
    if (this.next === null) return [];

    const savedState: (I | number)[] = [];
    let current = this.next;
    for (; current.next !== null; current = current.next) {
      if (current instanceof PresentNode) {
        savedState.push(current.sliceItem());
      } else {
        savedState.push(current.length);
      }
    }
    // Now current equals the last node. Only push it if it is present.
    if (current instanceof PresentNode) {
      savedState.push(current.sliceItem());
    }

    return savedState;
  }

  toString(): string {
    return JSON.stringify(this.serialize());
  }

  /**
   * Deletes count values starting at index.
   *
   * That is, deletes all values in the range [index, index + count).
   *
   * @returns A sparse array of the previous values.
   * Index 0 in the returned array corresponds to `index` in this array.
   *
   * @throws If `index < 0` or `count < 0`. (It is okay if the range extends beyond `this.length`.)
   */
  delete(index: number, count = 1): this {
    checkIndex(count, "count");
    return this.overwrite(index, new DeletedNode(count));
  }

  /**
   * @ignore Internal templated version of `set`.
   *
   * Sets values starting at index.
   *
   * That is, sets all values in the range [index, index + item.length) to the
   * given values.
   *
   * @returns A sparse array of the previous values.
   * Index 0 in the returned array corresponds to `index` in this array.
   *
   * @throws If `index < 0`. (It is okay if the range extends beyond `this.length`.)
   */
  _set(index: number, item: I): this {
    return this.overwrite(index, this.newNode(item));
  }

  // TODO: careful about aliasing
  // TODO: check for no-deleted-ends in tests, incl after loading
  private overwrite(index: number, node: Node<I>): this {
    checkIndex(index);

    if (node.length === 0) return this.construct(null);

    /*
      We locate the left and right boundaries of node, extending the list and
      splitting existing nodes as necessary so that both occur at the boundaries
      of existing nodes:
      
                     -->               node                -->
      --> beforeLeft --> afterLeft --> ... --> beforeRight --> afterRight -->
                      ^                                     ^
                      left                                  right
      
      To perform the overwrite, we splice in node, also remembering the replaced
      list `afterLeft --> ... --> beforeRight --> null`.
     */

    if (this.next === null) {
      this.next = new DeletedNode(index + node.length);
    }
    // Cast needed due to https://github.com/microsoft/TypeScript/issues/9974
    const beforeLeft = (index === 0 ? this : createSplit(this.next, index)) as {
      next: Node<I> | null;
    };

    if (beforeLeft.next === null) {
      beforeLeft.next = new DeletedNode(node.length);
    }
    const afterLeft = beforeLeft.next;

    const beforeRight = createSplit(beforeLeft.next, node.length);
    const afterRight = beforeRight.next;

    beforeLeft.next = null;
    const appendedNode = append(beforeLeft, node);
    if (afterRight === null) appendedNode.next = null;
    else {
      // Append while preserving afterRight.next.
      const appendedAfterRight = append(appendedNode, afterRight);
      appendedAfterRight.next = afterRight.next;
    }

    // Return the replaced list.
    beforeRight.next = null;
    return this.construct(afterLeft);
  }
}

/**
 * Creates a split (node boundary) at delta in the given list, returning
 * the node before the split. If needed, the list is extended to length
 * delta using a DeletedNode<I>.
 *
 * @param index Must be > 0.
 * @returns The node just before the split.
 */
function createSplit<I>(start: Node<I>, delta: number): Node<I> {
  // eslint-disable-next-line prefer-const
  let [left, leftOffset, leftOutside] = locate(start, delta);
  if (leftOutside) {
    left = append(left, new DeletedNode(leftOffset - left.length));
  } else split(left, leftOffset);
  return left;
}

/**
 * Given delta > 0, returns the node containing that index and the offset within it.
 * The returned offset satisfies 0 < offset <= node.length, unless delta is outside
 * the list, in which case offset is greater and outside is true.
 */
function locate<I>(
  start: Node<I>,
  delta: number
): [node: Node<I>, offset: number, outside: boolean] {
  let current = start;
  let remaining = delta;
  for (; current.next !== null; current = current.next) {
    if (remaining <= current.length) {
      return [current, remaining, false];
    }
    remaining -= current.length;
  }
  return [current, remaining, remaining > current.length];
}

/**
 * Connects before to after in the list, merging if possible.
 * Returns the final node, whose next pointer is *not* updated.
 */
export function append<I>(before: { next: Node<I> | null }, after: Node<I>): Node<I> {
  if (before instanceof PresentNode && after instanceof PresentNode) {
    const success = before.tryMergeContent(after);
    if (success) return before;
  } else if (before instanceof DeletedNode && after instanceof DeletedNode) {
    before.length += after.length;
    return before;
  }

  // Can't merge.
  before.next = after;
  return after;
}

/**
 * Splits the node at the given offset (if needed).
 *
 * @param offset 0 < offset <= node.length
 */
function split<I>(node: Node<I>, offset: number): void {
  if (offset !== node.length) {
    const after = node.splitContent(offset);
    after.next = node.next;
    node.next = after;
  }
}

// TODO: test that untrimmed cases are not externally visible (length, isEmpty, serialized).

/**
 * Templated implementation of deserialization
 *
 * Each subclass implements a static `deserialize` method as
 * `return new <class>(deserializeItems(serialized, <class's itemer>))`.
 *
 * TODO: document number restriction. Might need a separate method for SparseIndices,
 * along with serialize().
 *
 * @param newNode Unlike internal newNode method, must validate and shallow-clone item.
 * If invalid, throw error. (It's user input.)
 */
export function deserializeItems<I>(
  serialized: (I | number)[],
  newNode: (allegedItem: unknown) => PresentNode<I>
): Node<I> | null {
  // To make constructing custom saved states easier, we tolerate
  // 0-length items, adjacent mergeable items, and trailing deleted items.

  const startHolder: { next: Node<I> | null } = { next: null };
  let previous = startHolder;
  for (let i = 0; i < serialized.length; i++) {
    const maybeItem = serialized[i];
    let node: Node<I>;
    if (typeof maybeItem === "number") {
      // Deleted node.
      if (!Number.isSafeInteger(maybeItem) || maybeItem < 0) {
        throw new Error(
          `Invalid delete count at serialized[${i}]: ${maybeItem}`
        );
      }
      if (maybeItem === 0) continue;
      node = new DeletedNode(maybeItem);
    } else {
      // Present node.
      node = newNode(maybeItem);
      if (node.length === 0) continue;
    }
    previous = append(previous, node);
  }

  return startHolder.next;
}

/**
 * Templated implementation of ItemSlicer, used by SparseItems.newSlicer.
 */
class PairSlicer<I> implements ItemSlicer<I> {
  /** First index in this.current. */
  private currentIndex = 0;
  private offset = 0;
  private prevEnd: number | null = 0;

  constructor(private current: Node<I> | null) {}

  /**
   * Returns an array of items in the next slice,
   * continuing from the previous index (inclusive) to endIndex (exclusive).
   *
   * Each item [index, item] indicates a present item starting at index,
   * ending at either endIndex or a deleted index.
   *
   * The first call starts at index 0. To end at the end of the array,
   * set `endIndex = null`.
   *
   * @throws If endIndex is less than the previous index.
   */
  nextSlice(endIndex: number | null): Array<[index: number, item: I]> {
    if (endIndex !== null) {
      if (
        !Number.isSafeInteger(endIndex) ||
        this.prevEnd === null ||
        endIndex < this.prevEnd
      ) {
        throw new Error(
          `Invalid endIndex: ${endIndex} (previous endIndex: ${this.prevEnd})`
        );
      }
    }
    this.prevEnd = endIndex;

    const ret: Array<[index: number, item: I]> = [];

    while (this.current !== null) {
      if (endIndex !== null && endIndex <= this.currentIndex) return ret;
      const currentEnd = this.currentIndex + this.current.length;
      if (endIndex === null || endIndex >= currentEnd) {
        if (this.current instanceof PresentNode) {
          ret.push([
            this.currentIndex + this.offset,
            // Always slice, to prevent exposing internal items.
            this.current.sliceItem(this.offset),
          ]);
        }
        this.currentIndex += this.current.length;
        this.current = this.current.next;
        this.offset = 0;
      } else {
        const endOffset = endIndex - this.currentIndex;
        // Handle duplicate-endIndex case without empty emits.
        if (endOffset > this.offset) {
          if (this.current instanceof PresentNode) {
            ret.push([
              this.currentIndex + this.offset,
              this.current.sliceItem(this.offset, endOffset),
            ]);
          }
          this.offset = endOffset;
        }
        return ret;
      }
    }
    return ret;
  }
}
