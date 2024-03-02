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
      this.normalItem = this.itemNewEmpty();
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
      if (this.itemLength(this.normalItem) !== 0) {
        this.pairs = [{ index: 0, item: this.normalItem }];
      } else {
        this.pairs = [];
      }
      this.normalItem = null;
    }
  }

  protected abstract construct(pairs: Pair<I>[], length: number): this;

  protected constructEmpty(length = 0): this {
    return this.construct([], length);
  }

  // TODO: delete unused abstract methods
  protected abstract itemNewEmpty(): I;

  protected abstract itemLength(item: I): number;

  /**
   * Preferably modify a in-place and return it.
   */
  protected abstract itemMerge(a: I, b: I): I;

  /**
   * Return a new, unaliased item even if redundant.
   */
  protected abstract itemSlice(item: I, start?: number, end?: number): I;

  /**
   * Replace [index, index + replace.length) with replace's values. TODO: might go beyond existing length; should use push instead of overwrite in T[] case.
   *
   * Preferably modify item in-place and return it.
   */
  protected abstract itemUpdate(item: I, index: number, replace: I): I;

  /**
   * Preferably modify item in-place and return it.
   */
  protected abstract itemShorten(item: I, newLength: number): I;

  get length(): number {
    return this._length;
    // if (this.indexes.length === 0) return 0;
    // return (
    //   this.indexes[this.indexes.length - 1] +
    //   this.itemLength(this.segments[this.segments.length - 1])
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
    if (this.normalItem !== null) return this.itemLength(this.normalItem);

    let count = 0;
    for (const pair of this.pairs) count += this.itemLength(pair.item);
    return count;
  }

  countBetween(startIndex: number, endIndex: number): number {
    if (this.normalItem !== null) {
      const normalItemLength = this.itemLength(this.normalItem);
      return (
        Math.min(endIndex, normalItemLength) -
        Math.min(startIndex, normalItemLength)
      );
    }

    let count = 0;
    for (const pair of this.pairs) {
      if (pair.index >= endIndex) break;
      const pairEndIndex = pair.index + this.itemLength(pair.item);
      if (pairEndIndex >= startIndex) {
        count +=
          Math.min(endIndex, pairEndIndex) - Math.max(startIndex, pair.index);
      }
    }
    return count;
  }

  isEmpty(): boolean {
    if (this.normalItem !== null) return this.itemLength(this.normalItem) === 0;

    return this.pairs.length === 0;
  }

  protected _get(index: number): [item: I, offset: number] | null {
    if (index < 0) throw new Error(`Invalid index: ${index}`);

    if (this.normalItem !== null) {
      if (index < this.itemLength(this.normalItem)) {
        return [this.normalItem, index];
      } else return null;
    }

    // OPT: binary search in long lists?
    // OPT: test forward vs backward.
    for (let i = 0; i < this.pairs.length; i++) {
      const segIndex = this.pairs[i].index;
      if (index < segIndex) return null;
      const segment = this.pairs[i].item;
      if (index < segIndex + this.itemLength(segment)) {
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
      return index < this.itemLength(this.normalItem)
        ? [index, this.normalItem, index]
        : null;
    }

    let countRemaining = count;
    let i = 0;
    for (; i < this.pairs.length; i++) {
      if (
        this.pairs[i].index + this.itemLength(this.pairs[i].item) >=
        startIndex
      ) {
        // Adjust countRemaining as if startIndex was this.pairs[i].index.
        countRemaining += Math.max(0, startIndex - this.pairs[i].index);
        break;
      }
    }

    // We pretend that startIndex = this.pairs[i].index.
    for (; i < this.pairs.length; i++) {
      const itemLength = this.itemLength(this.pairs[i].item);
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

  clone(): this {
    // Deep copy.
    if (this.normalItem) {
      return this.construct(
        [{ index: 0, item: this.itemSlice(this.normalItem) }],
        this.length
      );
    }

    const pairsCopy: Pair<I>[] = [];
    for (const pair of this.pairs) {
      pairsCopy.push({ index: pair.index, item: this.itemSlice(pair.item) });
    }
    return this.construct(pairsCopy, this.length);
  }

  // trimmed: if true, omits last deleted item (due to length).
  serialize(trimmed = false): (I | number)[] {
    if (this.length === 0) return [];

    const savedState: (I | number)[] = [];
    if (this.normalItem !== null) {
      // Maybe [].
      savedState.push(this.itemSlice(this.normalItem));
      if (!trimmed) {
        const extraLength = this.length - this.itemLength(this.normalItem);
        if (extraLength > 0) {
          savedState.push(extraLength);
        }
      }
    } else {
      if (this.pairs.length === 0) {
        savedState.push(this.itemNewEmpty(), this.length);
      } else {
        if (this.pairs[0].index !== 0) {
          savedState.push(this.itemNewEmpty(), this.pairs[0].index);
        }
        savedState.push(this.itemSlice(this.pairs[0].item));
        let lastEnd = this.pairs[0].index + this.itemLength(this.pairs[0].item);
        for (let i = 1; i < this.pairs.length; i++) {
          savedState.push(
            this.pairs[i].index - lastEnd,
            this.itemSlice(this.pairs[i].item)
          );
          lastEnd = this.pairs[i].index + this.itemLength(this.pairs[i].item);
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
    if (count === 0) return this.constructEmpty();

    if (this.normalItem !== null) {
      const normalLen = this.itemLength(this.normalItem);
      // To remain normal, the deletion must not delete a head-only section.
      if (index + count >= normalLen) {
        let replaced: this;
        if (index < normalLen) {
          replaced = this.construct(
            [{ index: 0, item: this.itemSlice(this.normalItem, index) }],
            count
          );
        } else replaced = this.constructEmpty(count);
        if (index < normalLen) {
          this.normalItem = this.itemShorten(this.normalItem, index);
        }
        return replaced;
      } else this.promoteNormalItem();
    }

    const replacedPairs: Pair<I>[] = [];

    const [sI, sOffset] = this.getSegment(index, true);
    if (sI !== -1) {
      const start = this.pairs[sI];
      const sLength = this.itemLength(start.item);
      if (sOffset < sLength) {
        // Part of start is deleted.
        // Since sOffset > 0, not all of it is deleted.
        if (sOffset + count <= sLength) {
          // A middle section of start is deleted, and the deletions end within start.
          // Shorten the existing segment and (if needed) add a new one for the tail.
          const sMid = this.itemSlice(start.item, sOffset, sOffset + count);
          if (sOffset + count < sLength) {
            const sTail = this.itemSlice(start.item, sOffset + count);
            this.pairs.splice(sI + 1, 0, {
              index: start.index + sOffset + count,
              item: sTail,
            });
          }
          start.item = this.itemShorten(start.item, sOffset);

          return this.construct([{ index: 0, item: sMid }], count);
        } else {
          // The tail of start is deleted, and later segments may also be affected.
          replacedPairs.push({
            index: 0,
            item: this.itemSlice(start.item, sOffset),
          });
          // Shorten the existing segment.
          start.item = this.itemShorten(start.item, sOffset);
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
      const segLength = this.itemLength(segment);
      if (index + count < segIndex + segLength) {
        // The head of segment is deleted, but not all of it.
        replacedPairs.push({
          index: segIndex - index,
          item: this.itemSlice(segment, 0, index + count - segIndex),
        });
        // Fix segment in-place.
        this.pairs[i].index = index + count;
        this.pairs[i].item = this.itemSlice(segment, index + count - segIndex);
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
    const count = this.itemLength(item);

    // TODO: update length.

    // Avoid trivial-item edge case.
    if (count === 0) return this.constructEmpty();

    if (this.normalItem !== null) {
      const normalLen = this.itemLength(this.normalItem);
      // To remain normal, the set section must be after a gap.
      if (index <= normalLen) {
        let replaced: this;
        if (index < normalLen) {
          replaced = this.construct(
            [
              {
                index: 0,
                item: this.itemSlice(this.normalItem, index, index + count),
              },
            ],
            count
          );
        } else replaced = this.constructEmpty(count);
        this.normalItem = this.itemUpdate(this.normalItem, index, item);
        return replaced;
      } else this.promoteNormalItem();
    }

    // Optimize common case: append.
    if (this.pairs.length === 0) {
      this.pairs.push({ index, item });
      return this.construct([], count);
    } else {
      const lastPair = this.pairs[this.pairs.length - 1];
      const lastLength = this.itemLength(lastPair.item);
      if (lastPair.index + lastLength == index) {
        lastPair.item = this.itemMerge(lastPair.item, item);
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
      const sLength = this.itemLength(start);
      if (sOffset <= sLength) {
        // Part of start is overwritten, and/or start is appended to.
        // Note: possibly sOffset = 0.
        if (sOffset + count <= sLength) {
          // item is contained within start.
          const sMid = this.itemSlice(start, sOffset, sOffset + count);
          // Modify the existing segment in-place.
          this.pairs[sI].item = this.itemUpdate(start, sOffset, item);
          return this.construct([{ index: 0, item: sMid }], count);
        } else {
          if (sOffset < sLength) {
            // The tail of start is overwritten.
            replacedPairs.push({
              index: 0,
              item: this.itemSlice(start, sOffset),
            });
          }
          // Overwrite & append to the existing segment.
          this.pairs[sI].item = this.itemUpdate(start, sOffset, item);
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
      const segLength = this.itemLength(segment);
      if (index + count < segIndex + segLength) {
        // The head of segment is overwritten, but not all of it.
        // The rest needs to be appended to item's segment.
        let tail: I;
        if (index + count > segIndex) {
          replacedPairs.push({
            index: segIndex - index,
            item: this.itemSlice(segment, 0, index + count - segIndex),
          });
          tail = this.itemSlice(segment, index + count - segIndex);
        } else {
          // Nothing actually overwritten (head is trivial);
          // we're just appending segment to item.
          tail = segment;
        }

        if (itemAdded) {
          // Append non-overwritten tail to start.
          this.pairs[sI].item = this.itemMerge(this.pairs[sI].item, tail);
        } else {
          // Append non-overwritten tail to item, which is added later.
          item = this.itemMerge(item, tail);
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
