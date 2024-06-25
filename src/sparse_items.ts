import { checkIndex, nonNull } from "./util";

// TODO: cleanup methods (including in impls)
/**
 * Item-type-specific functions used by SparseItems.
 */
export interface Itemer<I> {
  /**
   * Return whether it could actually be an item. Called on user-provided
   * serialized states, which could be corrupt.
   */
  isValid(allegedItem: unknown): boolean;

  /**
   * Returns the length of item.
   */
  length(item: I): number;

  /**
   * Returns the merge (concatenation) of a and b.
   *
   * May modify a in-place and return it.
   */
  tryMerge(a: I, b: I): [success: boolean, merged: I];

  /**
   * Given 0 < index < item.length, returns items split from it at index.
   *
   * May modify item in-place and return it as left.
   */
  split(item: I, index: number): [left: I, right: I];

  /**
   * Returns a new (non-aliased) item representing the given slice.
   *
   * Note: start and end may be >= length; these cases are
   * handled as in Array.slice.
   */
  slice(item: I, start?: number, end?: number): I;

  /**
   * Returns item with values replaced starting at start.
   * Note: the replacing values may extend beyond the current end of item.
   *
   * May modify item in-place and return it.
   */
  update(item: I, start: number, replace: I): I;

  /**
   * Returns item shortened to the given length, which is guaranteed to
   * be <= item.length.
   *
   * May modify item in-place and return it.
   */
  shorten(item: I, newLength: number): I;
}

export abstract class PresentNode<I> {
  next: Node<I> | null = null;
  abstract item: I;
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
}

class DeletedNode<I> {
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
  private next: Node<I> | null = null;

  /**
   * Constructs a SparseItems with the given state, performing no validation.
   *
   * Don't override this constructor.
   */
  protected constructor(pairs: Pair<I>[]) {
    if (pairs.length === 0) {
      this._normalItem = this.itemer().newEmpty();
    } else if (pairs.length === 1 && pairs[0].index === 0) {
      this._normalItem = pairs[0].item;
    } else {
      this._pairs = pairs;
    }
  }

  /**
   * We can't directly force subclasses to use the same constructor; instead, we use
   * this abstract method to construct instances of `this` as if we had called
   * our own constructor.
   */
  protected abstract construct(pairs: Pair<I>[]): this;

  /**
   * Returns an Itemer for working with our item type.
   *
   * To avoid storing the Itemer once per object, this method should return a global
   * constant.
   */
  protected abstract itemer(): Itemer<I>;

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
    let ans = 0;
    for (let current = this.next; current !== null; current = current.next) {
      ans += current.length;
    }
    return ans;
  }

  /**
   * Returns the number of present values in the array.
   */
  count(): number {
    let count = 0;
    for (let current = this.next; current !== null; current = current.next) {
      if (!(current instanceof DeletedNode)) {
        count += this.itemer().length(current.item);
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

    if (this._normalItem !== null) {
      const normalItemLength = this.itemer().length(this._normalItem);
      if (index < normalItemLength) return [index, true];
      else return [normalItemLength, false];
    }

    // count "of" index = # present values before index.
    let count = 0;
    for (const pair of nonNull(this._pairs)) {
      if (index < pair.index) break;
      const itemLength = this.itemer().length(pair.item);
      if (index < pair.index + itemLength) {
        return [count + index - pair.index, true];
      }
      count += itemLength;
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
    return this.next === null;
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
      const length = current.length;
      if (length < remaining) {
        if (current instanceof DeletedNode) return null;
        else return [current.item, remaining];
      }
      remaining -= length;
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
    const located = this._getAtCount(count, startIndex);
    if (located === null) return -1;
    return located[2];
  }

  /**
   * Returns a "slicer" that enumerates slices of the array in order.
   *
   * The slicer is more efficient than requesting each slice separately,
   * since it "remembers its place" in our internal state.
   */
  newSlicer(): ItemSlicer<I> {
    return new PairSlicer(this.itemer(), this.asPairs());
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
    for (const pair of this.asPairs()) {
      for (let j = 0; j < this.itemer().length(pair.item); j++) {
        yield pair.index + j;
      }
    }
  }

  /**
   * Iterates over the present items, in order.
   *
   * Each item [index, values] indicates a run of present values starting at index,
   * ending at a deleted index.
   */
  *items(): IterableIterator<[index: number, values: I]> {
    for (const pair of this.asPairs()) {
      yield [pair.index, this.itemer().slice(pair.item)];
    }
  }

  /**
   * Returns a shallow copy of this array.
   */
  clone(): this {
    // Deep copy our state (but without cloning values within items - hence
    // it appears "shallow" to the caller).
    return this.construct(
      this.asPairs().map((pair) => ({
        index: pair.index,
        item: this.itemer().slice(pair.item),
      }))
    );
  }

  /**
   * Returns a compact JSON-serializable representation of our state.
   *
   * The return value uses a run-length encoding: it alternates between
   * - present items (even indices), and
   * - numbers (odd indices), representing that number of deleted values.
   */
  serialize(): (I | number)[] {
    const savedState: (I | number)[] = [];
    const pairs = this.asPairs();
    if (pairs.length === 0) return [];
    else {
      if (pairs[0].index !== 0) {
        savedState.push(this.itemer().newEmpty(), pairs[0].index);
      }
      savedState.push(this.itemer().slice(pairs[0].item));
      let lastEnd = pairs[0].index + this.itemer().length(pairs[0].item);
      for (let i = 1; i < pairs.length; i++) {
        savedState.push(
          pairs[i].index - lastEnd,
          this.itemer().slice(pairs[i].item)
        );
        lastEnd = pairs[i].index + this.itemer().length(pairs[i].item);
      }
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
    return this.overwrite(index, new PresentNode(item));
  }

  // TODO: careful about aliasing
  // TODO: check for no-deleted-ends in tests
  private overwrite(index: number, node: Node<I>): this {
    checkIndex(index);

    if (node.length === 0) return this.construct();

    if (this.next === null) {
      this.next = new DeletedNode(index + node.length);
    }
    // Cast needed due to https://github.com/microsoft/TypeScript/issues/9974
    const left = (index === 0 ? this : createSplit(this.next, index)) as {
      next: Node<I> | null;
    };

    if (left.next === null) {
      left.next = new DeletedNode(node.length);
    }
    const preRight = createSplit(left.next, node.length);

    const replacedStart = left.next;
    left.next = node;
    node.next = preRight.next;
    preRight.next = null;

    // If the new node is last and it's deleted, trim it.
    if (node.next === null && node instanceof DeletedNode) {
      left.next = null;
    }

    const replaced = this.construct();
    replaced.next = replacedStart;
    return replaced;
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
    const preLeft = left;
    left = new DeletedNode<I>(leftOffset - preLeft.length);
    leftOffset -= preLeft.length;
    append(preLeft, left);
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
function append<I>(before: Node<I>, after: Node<I>): void {
  if (before instanceof PresentNode && after instanceof PresentNode) {
    const success = before.tryMergeContent(after);
    if (success) return;
  } else if (before instanceof DeletedNode && after instanceof DeletedNode) {
    before.length += after.length;
    return;
  }

  // Can't merge.
  before.next = after;
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

/**
 * Templated implementation of deserialization
 *
 * Each subclass implements a static `deserialize` method as
 * `return new <class>(deserializeItems(serialized, <class's itemer>))`.
 */
export function deserializeItems<I>(
  serialized: (I | number)[],
  itemer: Itemer<I>
): Pair<I>[] {
  const pairs: Pair<I>[] = [];
  let nextIndex = 0;

  if (serialized.length % 2 === 0 && serialized.length !== 0) {
    throw new Error(
      `Invalid serialized form: ends with deleted values ${serialized.at(-1)}`
    );
  }

  for (let j = 0; j < serialized.length; j++) {
    if (j % 2 === 0) {
      const item = serialized[j] as I;
      if (!itemer.isValid(item)) {
        throw new Error(`Invalid item at serialized[${j}]: ${item}`);
      }
      const itemLength = itemer.length(item);
      if (itemLength === 0) {
        if (j === 0) continue;
        else {
          throw new Error(`Invalid empty item at serialized[${j}]`);
        }
      }
      pairs.push({ index: nextIndex, item: itemer.slice(item) });
      nextIndex += itemLength;
    } else {
      const deleted = serialized[j] as number;
      if (!Number.isSafeInteger(deleted) || deleted <= 0) {
        throw new Error(`Invalid delete count at serialized[${j}]: ${deleted}`);
      }
      nextIndex += deleted;
    }
  }

  return pairs;
}

/**
 * Templated implementation of ItemSlicer, used by SparseItems.newSlicer.
 */
class PairSlicer<I> implements ItemSlicer<I> {
  private i = 0;
  private offset = 0;
  private prevEnd: number | null = 0;

  constructor(
    private readonly itemer: Itemer<I>,
    private readonly pairs: readonly Pair<I>[]
  ) {}

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

    while (this.i < this.pairs.length) {
      const pair = this.pairs[this.i];
      if (endIndex !== null && endIndex <= pair.index) return ret;
      const pairEnd = pair.index + this.itemer.length(pair.item);
      if (endIndex === null || endIndex >= pairEnd) {
        ret.push([
          pair.index + this.offset,
          // Always slice, to prevent exposing internal items.
          this.itemer.slice(pair.item, this.offset),
        ]);
        this.i++;
        this.offset = 0;
      } else {
        const endOffset = endIndex - pair.index;
        // Handle duplicate-endIndex case without empty emits.
        if (endOffset > this.offset) {
          ret.push([
            pair.index + this.offset,
            this.itemer.slice(pair.item, this.offset, endOffset),
          ]);
          this.offset = endOffset;
        }
        return ret;
      }
    }
    return ret;
  }
}
