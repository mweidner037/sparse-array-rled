// Experimental implementation that stores its state as an "index array"
// telling you where each present segment starts, plus the segments
// in a parallel array.
// - Possibility of binary search in locate (TODO: need get/find benchmarks to really exercise this)
// - Hope that index array is optimized by the runtime for being a small-int array.
// - Parallel arrays should be smaller than array of pair objects.
// - Omit _length on auto-trimmed arrays?

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

export abstract class SparseItems<I> {
  // TODO: try leaving defined again, now that it's just one [] instead of two.
  protected pairs!: Pair<I>[];

  /**
   * If all ops so far are compatible with a normal item, it's stored here,
   * instead of using indexes/segments. Else null.
   * TODO: Means I cannot contain null (okay).
   */
  protected normalItem: I | null;
  /**
   * Subclasses: don't mutate.
   */
  protected _length: number;

  protected constructor(pairs: Pair<I>[], length: number) {
    if (pairs.length === 0) {
      this.normalItem = this.itemer().newEmpty();
    } else if (pairs.length === 1 && pairs[0].index === 0) {
      this.normalItem = pairs[0].item;
    } else {
      this.normalItem = null;
      this.pairs = pairs;
    }
    this._length = length;
  }

  private promoteNormalItem() {
    if (this.normalItem !== null) {
      if (this.itemer().length(this.normalItem) !== 0) {
        this.pairs = [{ index: 0, item: this.normalItem }];
      } else {
        this.pairs = [];
      }
      this.normalItem = null;
    }
  }

  // TODO: use this.constructor hack instead?
  // Likewise in deserialize().
  protected abstract construct(pairs: Pair<I>[], length: number): this;

  // Return a constant copy stored outside the prototype, to avoid storing
  // a new ref per object.
  protected abstract itemer(): Itemer<I>;

  get length(): number {
    return this._length;
    // if (this.indexes.length === 0) return 0;
    // return (
    //   this.indexes[this.indexes.length - 1] +
    //   this.itemer().length(this.segments[this.segments.length - 1])
    // );
  }

  // Sim behavior to normal array
  set length(newLength: number) {
    if (newLength < this._length) {
      this._delete(newLength, this._length - newLength);
    }
    this._length = newLength;
  }

  count(): number {
    if (this.normalItem !== null) return this.itemer().length(this.normalItem);

    let count = 0;
    for (const pair of this.pairs) count += this.itemer().length(pair.item);
    return count;
  }

  countBetween(startIndex: number, endIndex: number): number {
    if (this.normalItem !== null) {
      const normalItemLength = this.itemer().length(this.normalItem);
      return (
        Math.min(endIndex, normalItemLength) -
        Math.min(startIndex, normalItemLength)
      );
    }

    let count = 0;
    for (const pair of this.pairs) {
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
    if (this.normalItem !== null)
      return this.itemer().length(this.normalItem) === 0;

    return this.pairs.length === 0;
  }

  protected _get(index: number): [item: I, offset: number] | null {
    if (index < 0) throw new Error(`Invalid index: ${index}`);

    if (this.normalItem !== null) {
      if (index < this.itemer().length(this.normalItem)) {
        return [this.normalItem, index];
      } else return null;
    }

    // OPT: binary search in long lists?
    // OPT: test forward vs backward.
    for (let i = 0; i < this.pairs.length; i++) {
      const segIndex = this.pairs[i].index;
      if (index < segIndex) return null;
      const segment = this.pairs[i].item;
      if (index < segIndex + this.itemer().length(segment)) {
        return [segment, index - segIndex];
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
    if (this.normalItem !== null) {
      const index = startIndex + count;
      return index < this.itemer().length(this.normalItem)
        ? [index, this.normalItem, index]
        : null;
    }

    let countRemaining = count;
    let i = 0;
    for (; i < this.pairs.length; i++) {
      if (
        this.pairs[i].index + this.itemer().length(this.pairs[i].item) >=
        startIndex
      ) {
        // Adjust countRemaining as if startIndex was this.pairs[i].index.
        countRemaining += Math.max(0, startIndex - this.pairs[i].index);
        break;
      }
    }

    // We pretend that startIndex = this.pairs[i].index.
    for (; i < this.pairs.length; i++) {
      const itemLength = this.itemer().length(this.pairs[i].item);
      if (countRemaining < itemLength) {
        return [
          this.pairs[i].index + countRemaining,
          this.pairs[i].item,
          countRemaining,
        ];
      }
      countRemaining -= itemLength;
    }
    return null;
  }

  newSlicer(): ItemSlicer<I> {
    if (this.normalItem !== null) {
      return new NormalItemSlicer(this.itemer(), this.normalItem);
    }

    return new PairSlicer(this.itemer(), this.pairs);
  }

  clone(): this {
    // Deep copy.
    if (this.normalItem) {
      return this.construct(
        [{ index: 0, item: this.itemer().slice(this.normalItem) }],
        this.length
      );
    }

    const pairsCopy: Pair<I>[] = [];
    for (const pair of this.pairs) {
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
    if (this.normalItem !== null) {
      // Maybe [].
      savedState.push(this.itemer().slice(this.normalItem));
      if (!trimmed) {
        const extraLength = this.length - this.itemer().length(this.normalItem);
        if (extraLength > 0) {
          savedState.push(extraLength);
        }
      }
    } else {
      if (this.pairs.length === 0) {
        savedState.push(this.itemer().newEmpty(), this.length);
      } else {
        if (this.pairs[0].index !== 0) {
          savedState.push(this.itemer().newEmpty(), this.pairs[0].index);
        }
        savedState.push(this.itemer().slice(this.pairs[0].item));
        let lastEnd =
          this.pairs[0].index + this.itemer().length(this.pairs[0].item);
        for (let i = 1; i < this.pairs.length; i++) {
          savedState.push(
            this.pairs[i].index - lastEnd,
            this.itemer().slice(this.pairs[i].item)
          );
          lastEnd =
            this.pairs[i].index + this.itemer().length(this.pairs[i].item);
        }
        if (!trimmed && this.length > lastEnd) {
          savedState.push(this.length - lastEnd);
        }
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

    if (this.normalItem !== null) {
      const normalLen = this.itemer().length(this.normalItem);
      // To remain normal, the deletion must not delete a head-only section.
      if (index + count >= normalLen) {
        let replaced: this;
        if (index < normalLen) {
          replaced = this.construct(
            [{ index: 0, item: this.itemer().slice(this.normalItem, index) }],
            count
          );
        } else replaced = this.construct([], count);
        if (index < normalLen) {
          this.normalItem = this.itemer().shorten(this.normalItem, index);
        }
        return replaced;
      } else this.promoteNormalItem();
    }

    const replacedPairs: Pair<I>[] = [];

    const [sI, sOffset] = this.getSegment(index, true);
    if (sI !== -1) {
      const start = this.pairs[sI];
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
            this.pairs.splice(sI + 1, 0, {
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
    for (; i < this.pairs.length; i++) {
      const segIndex = this.pairs[i].index;
      if (index + count <= segIndex) break;
      const segment = this.pairs[i].item;
      const segLength = this.itemer().length(segment);
      if (index + count < segIndex + segLength) {
        // The head of segment is deleted, but not all of it.
        replacedPairs.push({
          index: segIndex - index,
          item: this.itemer().slice(segment, 0, index + count - segIndex),
        });
        // Fix segment in-place.
        this.pairs[i].index = index + count;
        this.pairs[i].item = this.itemer().slice(
          segment,
          index + count - segIndex
        );
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
      this.pairs.splice(sI + 1, i - (sI + 1));
    }
    return this.construct(replacedPairs, count);
  }

  protected _set(index: number, item: I): this {
    const count = this.itemer().length(item);

    // TODO: update length.

    // Avoid trivial-item edge case.
    if (count === 0) return this.construct([], 0);

    if (this.normalItem !== null) {
      const normalLen = this.itemer().length(this.normalItem);
      // To remain normal, the set section must be after a gap.
      if (index <= normalLen) {
        let replaced: this;
        if (index < normalLen) {
          replaced = this.construct(
            [
              {
                index: 0,
                item: this.itemer().slice(
                  this.normalItem,
                  index,
                  index + count
                ),
              },
            ],
            count
          );
        } else replaced = this.construct([], count);
        this.normalItem = this.itemer().update(this.normalItem, index, item);
        return replaced;
      } else this.promoteNormalItem();
    }

    // Optimize common case: append.
    if (this.pairs.length === 0) {
      this.pairs.push({ index, item });
      return this.construct([], count);
    } else {
      const lastPair = this.pairs[this.pairs.length - 1];
      const lastLength = this.itemer().length(lastPair.item);
      if (lastPair.index + lastLength == index) {
        lastPair.item = this.itemer().merge(lastPair.item, item);
        return this.construct([], count);
      } else if (lastPair.index + lastLength < index) {
        this.pairs.push({ index, item });
        return this.construct([], count);
      }
    }

    const replacedPairs: Pair<I>[] = [];

    const [sI, sOffset] = this.getSegment(index, false);
    let itemAdded = false;
    if (sI !== -1) {
      const start = this.pairs[sI].item;
      const sLength = this.itemer().length(start);
      if (sOffset <= sLength) {
        // Part of start is overwritten, and/or start is appended to.
        // Note: possibly sOffset = 0.
        if (sOffset + count <= sLength) {
          // item is contained within start.
          const sMid = this.itemer().slice(start, sOffset, sOffset + count);
          // Modify the existing segment in-place.
          this.pairs[sI].item = this.itemer().update(start, sOffset, item);
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
          this.pairs[sI].item = this.itemer().update(start, sOffset, item);
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
    for (; i < this.pairs.length; i++) {
      const segIndex = this.pairs[i].index;
      if (index + count < segIndex) break;
      const segment = this.pairs[i].item;
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
          this.pairs[sI].item = this.itemer().merge(this.pairs[sI].item, tail);
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
        this.pairs.splice(sI + 1, i - (sI + 1));
      }
    } else {
      // Still need to add item, as a new segment.
      this.pairs.splice(sI + 1, i - (sI + 1), { item, index });
    }
    return this.construct(replacedPairs, count);
  }

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
  protected getSegment(
    index: number,
    includeEnds: boolean
  ): [i: number, offset: number] {
    // OPT: binary search in long lists?
    // OPT: test forward (w/ append special case) vs backward.
    for (let i = this.pairs.length - 1; i >= 0; i--) {
      const segIndex = this.pairs[i].index;
      if (segIndex < index || (!includeEnds && segIndex === index)) {
        return [i, index - segIndex];
      }
    }
    return [-1, index];
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
