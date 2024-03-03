import { nonNull } from "./util";

/**
 * SparseItem's state is represented as an array of pairs { index, item },
 * indicating that item starts at index and ends at a deleted section.
 * Pairs are in order by index.
 */
export interface Pair<I> {
  index: number;
  item: I;
}

// TODO: cleanup methods?
/**
 * Item-type-specific functions used by SparseItems.
 */
export interface Itemer<I> {
  /**
   * Returns a new empty item.
   */
  newEmpty(): I;

  /**
   * Returns the length of item.
   */
  length(item: I): number;

  /**
   * Returns the merge (concatenation) of a and b.
   *
   * May modify a in-place and return it.
   */
  merge(a: I, b: I): I;

  /**
   * Returns a new (non-aliased) item representing the given slice.
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
   * Returns item shortened the given length, which is guaranteed to
   * be <= item.length.
   *
   * May modify item in-place and return it.
   */
  shorten(item: I, newLength: number): I;
}

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
   * continuing from the previous index or 0
   * (inclusive) to endIndex or the end of the array (exclusive).
   */
  nextSlice(endIndex: number | null): Array<[index: number, item: I]>;
}

// TODO: measure perf impacts:
// - switch back to normalItem at end of set/delete, if possible.
// - Don't set _pairs until forced (hidden class change).
// - Don't store _length unless it differs from the "true" length.

// Note: I cannot contain null.
// Iteration vs mutation generally unsafe.

/**
 * Templated implementation of the published Sparse* classes.
 *
 * It contains code that can be implemented in common, using generic "items" of
 * type I. Each item represents a run of present values.
 * - SparseArray<T>: T[]
 * - SparseText: string
 * - SparseIndexes: number (count of present values).
 *
 * @typeParam I The type of items. Items must never be null.
 */
export abstract class SparseItems<I> {
  // The internal state is either:
  // - `_pairs: Pair<I>[], normalItem: null`: Default.
  // - `_pairs: null, normalItem: I`: Storage-optimized alterntive for zero pairs or
  // a single pair `{ index: 0, item: this.normalItem }`.
  //
  // This may switch between the two states at will.
  // Use `asPairs()` and `forcePairs()` to be shielded from the details.
  private _pairs: Pair<I>[] | null = null;
  private _normalItem: I | null = null;

  private _length: number;

  /**
   * Constructs a SparseItems with the given state, performing no validation.
   *
   * Don't override this constructor.
   */
  protected constructor(pairs: Pair<I>[], length: number) {
    if (pairs.length === 0) {
      this._normalItem = this.itemer().newEmpty();
    } else if (pairs.length === 1 && pairs[0].index === 0) {
      this._normalItem = pairs[0].item;
    } else {
      this._pairs = pairs;
    }
    this._length = length;
  }

  /**
   * We can't directly force subclasses to use the same constructor; instead, we use
   * this abstract method to construct instances of `this` as if we had called
   * our own constructor.
   */
  protected abstract construct(pairs: Pair<I>[], length: number): this;

  /**
   * Returns an Itemer for working with our item type.
   *
   * To avoid storing the Itemer once per object, this method should return a global
   * constant.
   */
  protected abstract itemer(): Itemer<I>;

  /**
   * Returns a *read-only* (unsafe to mutate) copy of this's state as Pair<I>[],
   * hiding details of the internal state (_normalItems).
   */
  protected asPairs(): readonly Pair<I>[] {
    if (this._normalItem !== null) {
      if (this.itemer().length(this._normalItem) === 0) return [];
      else return [{ index: 0, item: this._normalItem }];
    }
    return nonNull(this._pairs);
  }

  /**
   * Forces the internal state to use this._pairs if it is not already,
   * and returns this._pairs.
   */
  private forcePairs(): Pair<I>[] {
    if (this._pairs === null) {
      this._pairs = this.asPairs() as Pair<I>[];
      this._normalItem = null;
    }
    return this._pairs;
  }

  /**
   * The length of the array.
   *
   * Like an ordinary `Array`, this is by default one more than the index of the
   * last present value, but you may manually set it to a larger value.
   *
   * Setting `length` to a value smaller than the "true" length deletes indices
   * \>= the new length.
   */
  get length(): number {
    return this._length;
  }

  set length(newLength: number) {
    if (newLength < this._length) {
      this._delete(newLength, this._length - newLength);
    }
    this._length = newLength;
  }

  /**
   * Returns the number of present values in the array.
   */
  count(): number {
    if (this._normalItem !== null) {
      return this.itemer().length(this._normalItem);
    }

    let count = 0;
    for (const pair of nonNull(this._pairs)) {
      count += this.itemer().length(pair.item);
    }
    return count;
  }

  /**
   * Returns the number of present values within the slice [startIndex, endIndex).
   */
  countBetween(startIndex: number, endIndex: number): number {
    if (this._normalItem !== null) {
      const normalItemLength = this.itemer().length(this._normalItem);
      return (
        Math.min(endIndex, normalItemLength) -
        Math.min(startIndex, normalItemLength)
      );
    }

    let count = 0;
    for (const pair of nonNull(this._pairs)) {
      if (pair.index >= endIndex) break;
      const pairEndIndex = pair.index + this.itemer().length(pair.item);
      if (pairEndIndex >= startIndex) {
        count +=
          Math.min(endIndex, pairEndIndex) - Math.max(startIndex, pair.index);
      }
    }
    return count;
  }

  /**
   * Returns the count at index, plus whether index is present.
   *
   * The "count at index" is the `c` such that index is
   * the `c`-th present value (or would be if present).
   * Equivalently, it is the number of present values strictly prior to index.
   *
   * Invert with findCount.
   */
  countAt(index: number): [count: number, has: boolean] {
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
   * Returns whether the array has no present values.
   *
   * Note that an array may be empty but have nonzero length.
   */
  isEmpty(): boolean {
    if (this._normalItem !== null) {
      return this.itemer().length(this._normalItem) === 0;
    }

    return nonNull(this._pairs).length === 0;
  }

  /**
   * Returns the value at index, in the form [item, offset within item].
   */
  protected _get(index: number): [item: I, offset: number] | null {
    if (index < 0) throw new Error(`Invalid index: ${index}`);

    if (this._normalItem !== null) {
      if (index < this.itemer().length(this._normalItem)) {
        return [this._normalItem, index];
      } else return null;
    }

    // OPT: binary search in long lists?
    for (const pair of nonNull(this._pairs)) {
      if (index < pair.index) break;
      if (index < pair.index + this.itemer().length(pair.item)) {
        return [pair.item, index - pair.index];
      }
    }
    return null;
  }

  /**
   * Returns whether index is present in the array.
   *
   * If index is `>= this.length`, returns false without throwing an error.
   */
  has(index: number): boolean {
    return this._get(index) !== null;
  }

  /**
   * Returns the `count`-th present value, starting at startIndex (inclusive).
   *
   * If the array ends before finding such a value, returns null.
   *
   * Invert with countAt.
   */
  _findCount(
    count: number,
    startIndex = 0
  ): [index: number, item: I, offset: number] | null {
    if (this._normalItem !== null) {
      const index = startIndex + count;
      return index < this.itemer().length(this._normalItem)
        ? [index, this._normalItem, index]
        : null;
    }

    const pairs = nonNull(this._pairs);

    let countRemaining = count;
    let i = 0;
    for (; i < pairs.length; i++) {
      if (pairs[i].index + this.itemer().length(pairs[i].item) >= startIndex) {
        // Adjust countRemaining as if startIndex was this.pairs[i].index.
        countRemaining += Math.max(0, startIndex - pairs[i].index);
        break;
      }
    }

    // We pretend that startIndex = this.pairs[i].index.
    for (; i < pairs.length; i++) {
      const itemLength = this.itemer().length(pairs[i].item);
      if (countRemaining < itemLength) {
        return [pairs[i].index + countRemaining, pairs[i].item, countRemaining];
      }
      countRemaining -= itemLength;
    }
    return null;
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
   * Iterates over the present indices (keys).
   */
  *keys(): IterableIterator<number> {
    for (const pair of this.asPairs()) {
      for (let j = 0; j < this.itemer().length(pair.item); j++) {
        yield pair.index + j;
      }
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
      })),
      this.length
    );
  }

  // trimmed: if true, omits last deleted item (due to length).

  /**
   * Returns a compact JSON-serializable representation of our state.
   *
   * The return value uses a run-length encoding: it alternates between
   * - present items (even indices), and
   * - numbers (odd indices), represent that number of deleted values.
   *
   * Array entries are always nontrivial (nonempty / nonzero), except for the 0th
   * entry, which may be an empty item (if index 0 is deleted).
   *
   * @param trimmed If true, the return value omits deletions at the end of the array,
   * i.e., between the last present value and `this.length`. So when true,
   * the return value never ends in a number.
   */
  serialize(trimmed = false): (I | number)[] {
    if (this.length === 0) return [];

    const savedState: (I | number)[] = [];
    const pairs = this.asPairs();
    if (pairs.length === 0) {
      savedState.push(this.itemer().newEmpty(), this.length);
    } else {
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
      if (!trimmed && this.length > lastEnd) {
        savedState.push(this.length - lastEnd);
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
   * @returns A 0-indexed sparse array of the previous values.
   */
  protected _delete(index: number, count: number): this {
    // TODO: count >= 0 check?

    // Update length to "touch" [index, index + count), even if count is 0.
    // TODO: instead, match Array's behavior: if this deletes up to the current _length,
    // reduce _length.
    this._length = Math.max(this._length, index + count);

    // Avoid trivial-item edge case.
    if (count === 0) return this.construct([], 0);

    if (this._normalItem !== null) {
      const normalLen = this.itemer().length(this._normalItem);
      // To remain normal, the deletion must not delete a head-only section.
      if (index + count >= normalLen) {
        let replaced: this;
        if (index < normalLen) {
          replaced = this.construct(
            [{ index: 0, item: this.itemer().slice(this._normalItem, index) }],
            count
          );
        } else replaced = this.construct([], count);
        if (index < normalLen) {
          this._normalItem = this.itemer().shorten(this._normalItem, index);
        }
        return replaced;
      }
      // Else fall through. Will transition from _normalItems to _pairs.
    }

    const pairs = this.forcePairs();

    const replacedPairs: Pair<I>[] = [];

    const [sI, sOffset] = locateForMutation(pairs, index, true);
    if (sI !== -1) {
      const start = pairs[sI];
      const sLength = this.itemer().length(start.item);
      if (sOffset < sLength) {
        // Part of start is deleted.
        // Since sOffset > 0, not all of it is deleted.
        if (sOffset + count <= sLength) {
          // A middle section of start is deleted, and the deletions end within start.
          // Shorten the existing segment and (if needed) add a new one for the tail.
          const sMid = this.itemer().slice(
            start.item,
            sOffset,
            sOffset + count
          );
          if (sOffset + count < sLength) {
            const sTail = this.itemer().slice(start.item, sOffset + count);
            pairs.splice(sI + 1, 0, {
              index: start.index + sOffset + count,
              item: sTail,
            });
          }
          start.item = this.itemer().shorten(start.item, sOffset);

          return this.construct([{ index: 0, item: sMid }], count);
        } else {
          // The tail of start is deleted, and later segments may also be affected.
          replacedPairs.push({
            index: 0,
            item: this.itemer().slice(start.item, sOffset),
          });
          // Shorten the existing segment.
          start.item = this.itemer().shorten(start.item, sOffset);
          // Continue since later segments may be affected.
        }
      }
      // Else start is unaffected.
      // In any case, once we get here, this.segments[sI] is fixed up,
      // so we don't need to splice it out later - splicing starts at
      // sI + 1 (which also works when sI = -1).
    }

    // At the end of this loop, i will be the first index that does *not* need
    // to be spliced out (it's either after the deleted region
    // or fixed in-place by the loop).
    let i = sI + 1;
    for (; i < pairs.length; i++) {
      const segIndex = pairs[i].index;
      if (index + count <= segIndex) break;
      const segment = pairs[i].item;
      const segLength = this.itemer().length(segment);
      if (index + count < segIndex + segLength) {
        // The head of segment is deleted, but not all of it.
        replacedPairs.push({
          index: segIndex - index,
          item: this.itemer().slice(segment, 0, index + count - segIndex),
        });
        // Fix segment in-place.
        pairs[i].index = index + count;
        pairs[i].item = this.itemer().slice(segment, index + count - segIndex);
        break;
      } else {
        // All of segment is deleted.
        // Aliasing segment is okay here because we'll splice out our own
        // pointer to it later.
        replacedPairs.push({ index: segIndex - index, item: segment });
      }
    }

    // Delete [sI + 1, i).
    // TODO: try removing if statement now that it's just one splice.
    if (i != sI + 1) {
      pairs.splice(sI + 1, i - (sI + 1));
    }
    return this.construct(replacedPairs, count);
  }

  /**
   * Sets values starting at index.
   *
   * That is, sets all values in the range [index, index + item.length) to the
   * given values.
   *
   * @returns A 0-indexed sparse array of the previous values.
   */
  protected _set(index: number, item: I): this {
    const count = this.itemer().length(item);

    // Update length to "touch" [index, index + count), even if count is 0.
    this._length = Math.max(this._length, index + count);

    // Avoid trivial-item edge case.
    if (count === 0) return this.construct([], 0);

    if (this._normalItem !== null) {
      const normalLen = this.itemer().length(this._normalItem);
      // To remain normal, the set section must be after a gap.
      if (index <= normalLen) {
        let replaced: this;
        if (index < normalLen) {
          replaced = this.construct(
            [
              {
                index: 0,
                item: this.itemer().slice(
                  this._normalItem,
                  index,
                  index + count
                ),
              },
            ],
            count
          );
        } else replaced = this.construct([], count);
        this._normalItem = this.itemer().update(this._normalItem, index, item);
        return replaced;
      }
      // Else fall through. Will transition from _normalItems to _pairs.
    }

    const pairs = this.forcePairs();

    // Optimize common case: append.
    if (pairs.length === 0) {
      pairs.push({ index, item });
      return this.construct([], count);
    } else {
      const lastPair = pairs[pairs.length - 1];
      const lastLength = this.itemer().length(lastPair.item);
      if (lastPair.index + lastLength == index) {
        lastPair.item = this.itemer().merge(lastPair.item, item);
        return this.construct([], count);
      } else if (lastPair.index + lastLength < index) {
        pairs.push({ index, item });
        return this.construct([], count);
      }
    }

    const replacedPairs: Pair<I>[] = [];

    const [sI, sOffset] = locateForMutation(pairs, index, false);
    let itemAdded = false;
    if (sI !== -1) {
      const start = pairs[sI].item;
      const sLength = this.itemer().length(start);
      if (sOffset <= sLength) {
        // Part of start is overwritten, and/or start is appended to.
        // Note: possibly sOffset = 0.
        if (sOffset + count <= sLength) {
          // item is contained within start.
          const sMid = this.itemer().slice(start, sOffset, sOffset + count);
          // Modify the existing segment in-place.
          pairs[sI].item = this.itemer().update(start, sOffset, item);
          return this.construct([{ index: 0, item: sMid }], count);
        } else {
          if (sOffset < sLength) {
            // The tail of start is overwritten.
            replacedPairs.push({
              index: 0,
              item: this.itemer().slice(start, sOffset),
            });
          }
          // Overwrite & append to the existing segment.
          pairs[sI].item = this.itemer().update(start, sOffset, item);
          // Continue since other segments may be affected.
        }
        itemAdded = true;
      }
      // Else start is unaffected.
      // In any case, once we get here, this.segments[sI] is fixed up,
      // so we don't need to splice it out later - splicing starts at
      // sI + 1 (which also works when sI = -1).
    }

    // At the end of this loop, i will be the first index that does *not* need
    // to be spliced out (it's after the affected region).
    let i = sI + 1;
    for (; i < pairs.length; i++) {
      const segIndex = pairs[i].index;
      if (index + count < segIndex) break;
      const segment = pairs[i].item;
      const segLength = this.itemer().length(segment);
      if (index + count < segIndex + segLength) {
        // The head of segment is overwritten, but not all of it.
        // The rest needs to be appended to item's segment.
        let tail: I;
        if (index + count > segIndex) {
          replacedPairs.push({
            index: segIndex - index,
            item: this.itemer().slice(segment, 0, index + count - segIndex),
          });
          tail = this.itemer().slice(segment, index + count - segIndex);
        } else {
          // Nothing actually overwritten (head is trivial);
          // we're just appending segment to item.
          tail = segment;
        }

        if (itemAdded) {
          // Append non-overwritten tail to start.
          pairs[sI].item = this.itemer().merge(pairs[sI].item, tail);
        } else {
          // Append non-overwritten tail to item, which is added later.
          item = this.itemer().merge(item, tail);
        }

        // segment still needs to spliced out.
        i++;
        break;
      } else {
        // All of segment is overwritten.
        // Aliasing segment is okay here because we'll splice out our own
        // pointer to it later.
        replacedPairs.push({ index: segIndex - index, item: segment });
      }
    }

    // Delete [sI + 1, i).
    if (itemAdded) {
      // TODO: try removing if statement now that it's just one splice.
      if (i != sI + 1) {
        pairs.splice(sI + 1, i - (sI + 1));
      }
    } else {
      // Still need to add item, as a new segment.
      pairs.splice(sI + 1, i - (sI + 1), { item, index });
    }
    return this.construct(replacedPairs, count);
  }
}

/**
 * Templated implementation of deserialization
 *
 * Each subclass implements a static `deserialize` method as
 * `return new this(...deserializeItems(serialized, <class's itemer>))`.
 */
export function deserializeItems<I>(
  serialized: (I | number)[],
  itemer: Itemer<I>
): [pairs: Pair<I>[], length: number] {
  const pairs: Pair<I>[] = [];
  let nextIndex = 0;

  for (let j = 0; j < serialized.length; j++) {
    if (j % 2 === 0) {
      const item = serialized[j] as I;
      const itemLength = itemer.length(item);
      if (itemLength === 0) continue;
      pairs.push({ index: nextIndex, item: itemer.slice(item) });
      nextIndex += itemLength;
    } else {
      const deleted = serialized[j] as number;
      nextIndex += deleted;
    }
  }

  return [pairs, nextIndex];
}

/**
 * Templated implementation of ItemSlicer, used by SparseItems.newSlicer.
 */
class PairSlicer<I> implements ItemSlicer<I> {
  private i = 0;
  private offset = 0;

  constructor(
    private readonly itemer: Itemer<I>,
    private readonly pairs: readonly Pair<I>[]
  ) {}

  nextSlice(endIndex: number | null): Array<[index: number, item: I]> {
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

/**
 *
 * Locates the given index within pairs.
 *
 * index corresponds to pairs[i].item at the given offset, which may be
 * beyond the end of the item. Except, if index precedes all present
 * values, returns [-1, index].
 *
 * @param includeEnds If index lands at the start of an item, whether
 * to instead reference the (deleted) far end of the previous item.
 * So offset will not be zero unless this returns [-1, 0].
 */
function locateForMutation<I>(
  pairs: Pair<I>[],
  index: number,
  includeEnds: boolean
): [i: number, offset: number] {
  // Since we expect mutations to be clustered towards the end, optimize
  // for that case by searching backwards.
  // OPT: binary search in long lists?
  for (let i = pairs.length - 1; i >= 0; i--) {
    const itemIndex = pairs[i].index;
    if (itemIndex < index || (!includeEnds && itemIndex === index)) {
      return [i, index - itemIndex];
    }
  }
  return [-1, index];
}
