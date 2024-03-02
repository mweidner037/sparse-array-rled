// Experimental implementation that stores its state as an "index array"
// telling you where each present segment starts, plus the segments
// in a parallel array.
// - Possibility of binary search in locate (TODO: need get/find benchmarks to really exercise this)
// - Hope that index array is optimized by the runtime for being a small-int array.
// - Parallel arrays should be smaller than array of pair objects.
// - Omit _length on auto-trimmed arrays?

import { nonNull } from "./util";

export interface Pair<I> {
  index: number;
  item: I;
}

// TODO: delete unused methods
export interface Itemer<I> {
  newEmpty(): I;

  length(item: I): number;
  /**
   * Preferably modify a in-place and return it.
   */
  merge(a: I, b: I): I;

  /**
   * Return a new, unaliased item even if redundant.
   */
  slice(item: I, start?: number, end?: number): I;

  /**
   * Replace [index, index + replace.length) with replace's values. TODO: might go beyond existing length; should use push instead of overwrite in T[] case.
   *
   * Preferably modify item in-place and return it.
   */
  update(item: I, start: number, replace: I): I;

  /**
   * Preferably modify item in-place and return it.
   */
  shorten(item: I, newLength: number): I;
}

// Generic version of slicer. Override newSlicer to return your own type,
// renaming item & redoing docs.
export interface ItemSlicer<I> {
  nextSlice(
    endIndex: number | null
  ): IterableIterator<[index: number, item: I]>;
}

// Note: I cannot contain null.
export abstract class SparseItems<I> {
  // The internal state is either:
  // - `pairs: Pair<I>[], normalItem: null`: Default.
  // - `pairs: null, normalItem: I`: Storage-optimized version of a single pair
  // `{ index: 0, item: this.normalItem }`.
  //
  // This may switch between the two states at will.
  // Use `getPairs()` and `forcePairs()` to be shielded from the details.
  private _pairs: Pair<I>[] | null = null;
  private _normalItem: I | null = null;

  private _length: number;

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
   * Returns a *read-only* (unsafe to mutate) copy of this's state as Pair<I>[],
   * hiding whether the current internal state is _pairs or normalItem.
   */
  protected asPairs(): readonly Pair<I>[] {
    if (this._normalItem !== null) {
      return [{ index: 0, item: this._normalItem }];
    }
    return nonNull(this._pairs);
  }

  /**
   * Forces the internal state to use this._pairs if it is not already, and returns this._pairs.
   */
  private forcePairs(): Pair<I>[] {
    if (this._pairs === null) {
      this._pairs = [{ index: 0, item: nonNull(this._normalItem) }];
      this._normalItem = null;
    }
    return this._pairs;
  }

  // TODO: use this.constructor hack instead?
  // Likewise in deserialize().
  protected abstract construct(pairs: Pair<I>[], length: number): this;

  // Return a constant copy stored outside the prototype, to avoid storing
  // a new ref per object.
  protected abstract itemer(): Itemer<I>;

  get length(): number {
    return this._length;
  }

  // Sim behavior to normal array
  set length(newLength: number) {
    if (newLength < this._length) {
      this._delete(newLength, this._length - newLength);
    }
    this._length = newLength;
  }

  // TODO: prop/method to get the "present/trimmed length" (last present index + 1)?

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

  isEmpty(): boolean {
    if (this._normalItem !== null) {
      return this.itemer().length(this._normalItem) === 0;
    }

    return nonNull(this._pairs).length === 0;
  }

  protected _get(index: number): [item: I, offset: number] | null {
    if (index < 0) throw new Error(`Invalid index: ${index}`);

    if (this._normalItem !== null) {
      if (index < this.itemer().length(this._normalItem)) {
        return [this._normalItem, index];
      } else return null;
    }

    // OPT: binary search in long lists?
    // OPT: test forward vs backward.
    for (const pair of nonNull(this._pairs)) {
      if (index < pair.index) return null;
      if (index < pair.index + this.itemer().length(pair.item)) {
        return [pair.item, index - pair.index];
      }
    }
    return null;
  }

  has(index: number): boolean {
    return this._get(index) !== null;
  }

  _findPresent(
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

  // TODO: go through normalItem special cases and check if warranted.

  newSlicer(): ItemSlicer<I> {
    // TODO: just PairSlicer, using readPairs? Extra case seems unnec for a linear-time op.
    if (this._normalItem !== null) {
      return new NormalItemSlicer(this.itemer(), this._normalItem);
    }

    return new PairSlicer(this.itemer(), nonNull(this._pairs));
  }

  clone(): this {
    // Deep copy.
    const pairsCopy: Pair<I>[] = [];
    for (const pair of this.asPairs()) {
      pairsCopy.push({
        index: pair.index,
        item: this.itemer().slice(pair.item),
      });
    }
    return this.construct(pairsCopy, this.length);
  }

  // trimmed: if true, omits last deleted item (due to length).
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

  protected _delete(index: number, count: number): this {
    // TODO: count >= 0 check?

    // TODO: update length.

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

    const [sI, sOffset] = getSegment(pairs, index, true);
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

  protected _set(index: number, item: I): this {
    const count = this.itemer().length(item);

    // TODO: update length.

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

    const [sI, sOffset] = getSegment(pairs, index, false);
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

class NormalItemSlicer<I> implements ItemSlicer<I> {
  private index = 0;

  constructor(
    private readonly itemer: Itemer<I>,
    private readonly normalItem: I
  ) {}

  *nextSlice(
    endIndex: number | null
  ): IterableIterator<[index: number, item: I]> {
    if (endIndex === null) {
      if (this.index < this.itemer.length(this.normalItem)) {
        yield [this.index, this.itemer.slice(this.normalItem, this.index)];
      }
    } else {
      const actualEndIndex = Math.min(
        this.itemer.length(this.normalItem),
        endIndex
      );
      if (this.index < actualEndIndex) {
        yield [
          this.index,
          this.itemer.slice(this.normalItem, this.index, actualEndIndex),
        ];
      }
      this.index = endIndex;
    }
  }
}

class PairSlicer<I> implements ItemSlicer<I> {
  private i = 0;
  private offset = 0;

  constructor(
    private readonly itemer: Itemer<I>,
    private readonly pairs: Pair<I>[]
  ) {}

  *nextSlice(
    endIndex: number | null
  ): IterableIterator<[index: number, item: I]> {
    while (this.i < this.pairs.length) {
      const pair = this.pairs[this.i];
      if (endIndex !== null && endIndex <= pair.index) return;
      const pairEnd = pair.index + this.itemer.length(pair.item);
      if (endIndex === null || endIndex >= pairEnd) {
        // Always slice, to prevent exposing internal items.
        yield [
          pair.index + this.offset,
          this.itemer.slice(pair.item, this.offset),
        ];
        this.i++;
        this.offset = 0;
      } else {
        const endOffset = endIndex - pair.index;
        // Handle duplicate-endIndex case without empty emits.
        if (endOffset > this.offset) {
          yield [
            pair.index + this.offset,
            this.itemer.slice(pair.item, this.offset, endOffset),
          ];
          this.offset = endOffset;
        }
      }
    }
  }
}

// TODO: remove refs to "segment"?
/**
 * Returns info about the segment whose present or deleted region contains index.
 * - i: The segment's index.
 * - offset: index - (segment start index).
 *
 * Only valid when normalItem is null.
 *
 * If index is before any segments, returns [-1, index].
 *
 * @param includeEnds If index is at the start of a segment, whether to instead
 * return the previous segment's index.
 * In this case, offset is always nonzero, unless index = -1.
 */
function getSegment<I>(
  pairs: Pair<I>[],
  index: number,
  includeEnds: boolean
): [i: number, offset: number] {
  // OPT: binary search in long lists?
  // OPT: test forward (w/ append special case) vs backward.
  for (let i = pairs.length - 1; i >= 0; i--) {
    const segIndex = pairs[i].index;
    if (segIndex < index || (!includeEnds && segIndex === index)) {
      return [i, index - segIndex];
    }
  }
  return [-1, index];
}
