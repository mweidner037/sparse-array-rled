// Experimental implementation that stores its state as an "index array"
// telling you where each present segment starts, plus the segments
// in a parallel array.
// - Possibility of binary search in locate (TODO: need get/find benchmarks to really exercise this)
// - Hope that index array is optimized by the runtime for being a small-int array.
// - Parallel arrays should be smaller than array of pair objects.
// - Omit _length on auto-trimmed arrays?

export abstract class SparseItems<I> {
  // indexes and segments are in parallel: always matching lengths, possibly 0.
  protected readonly indexes: number[];
  protected readonly segments: I[];

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

  protected constructor(indexes: number[], segments: I[], length: number) {
    if (indexes.length === 0) {
      this.normalItem = this.itemNewEmpty();
      // OPT: null instead?
      this.indexes = [];
      this.segments = [];
    } else if (indexes.length === 1 && indexes[0] === 0) {
      this.normalItem = segments[0];
      // OPT: null instead?
      this.indexes = [];
      this.segments = [];
    } else {
      this.normalItem = null;
      this.indexes = indexes;
      this.segments = segments;
    }
    this._length = length;
  }

  private promoteNormalItem() {
    if (this.normalItem !== null) {
      if (this.itemLength(this.normalItem) !== 0) {
        this.segments.push(this.normalItem);
        this.indexes.push(0);
      }
      this.normalItem = null;
    }
  }

  protected abstract construct(
    indexes: number[],
    segments: I[],
    length: number
  ): this;

  protected constructEmpty(length = 0): this {
    return this.construct([], [], length);
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
  protected abstract itemSlice(item: I, start: number, end?: number): I;

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

  size(): number {
    if (this.normalItem !== null) return this.itemLength(this.normalItem);

    let size = 0;
    for (const segment of this.segments) {
      size += this.itemLength(segment);
    }
    return size;
  }

  isEmpty(): boolean {
    if (this.normalItem !== null) return this.itemLength(this.normalItem) === 0;

    return (
      this.segments.length === 0 ||
      (this.segments.length === 1 && this.itemLength(this.segments[0]) === 0)
    );
  }

  trim(): void {
    if (this.indexes.length !== 0) {
      this._length =
        this.indexes[this.indexes.length - 1] +
        this.itemLength(this.segments[this.segments.length - 1]);
    }
  }

  // TODO: in serializing, use length to infer the last deleted item.
  // Maybe instead of trim(), just have trimmed option in serializer,
  // so we can avoid calling trim after each op?

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
            [0],
            [this.itemSlice(this.normalItem, index)],
            count
          );
        } else replaced = this.constructEmpty(count);
        if (index < normalLen) {
          this.normalItem = this.itemShorten(this.normalItem, index);
        }
        return replaced;
      } else this.promoteNormalItem();
    }

    const replacedSegments: I[] = [];
    const replacedIndexes: number[] = [];

    const [sI, sOffset] = this.getSegment(index, true);
    if (sI !== -1) {
      const start = this.segments[sI];
      const sLength = this.itemLength(start);
      if (sOffset < sLength) {
        // Part of start is deleted.
        // Since sOffset > 0, not all of it is deleted.
        if (sOffset + count <= sLength) {
          // A middle section of start is deleted, and the deletions end within start.
          // Shorten the existing segment and (if needed) add a new one for the tail.
          const sMid = this.itemSlice(start, sOffset, sOffset + count);
          if (sOffset + count < sLength) {
            const sTail = this.itemSlice(start, sOffset + count);
            this.segments.splice(sI + 1, 0, sTail);
            this.indexes.splice(sI + 1, 0, this.indexes[sI] + sOffset + count);
          }
          this.segments[sI] = this.itemShorten(start, sOffset);

          return this.construct([0], [sMid], count);
        } else {
          // The tail of start is deleted, and later segments may also be affected.
          replacedSegments.push(this.itemSlice(start, sOffset));
          replacedIndexes.push(0);
          // Shorten the existing segment.
          this.segments[sI] = this.itemShorten(start, sOffset);
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
    for (; i < this.indexes.length; i++) {
      const segIndex = this.indexes[i];
      if (index + count <= segIndex) break;
      const segment = this.segments[i];
      const segLength = this.itemLength(segment);
      if (index + count < segIndex + segLength) {
        // The head of segment is deleted, but not all of it.
        replacedSegments.push(
          this.itemSlice(segment, 0, index + count - segIndex)
        );
        replacedIndexes.push(segIndex - index);
        // Fix segment in-place.
        this.segments[i] = this.itemSlice(segment, index + count - segIndex);
        this.indexes[i] = index + count;
        break;
      } else {
        // All of segment is deleted.
        // Aliasing segment is okay here because we'll splice out our own
        // pointer to it later.
        replacedSegments.push(segment);
        replacedIndexes.push(segIndex - index);
      }
    }

    // Delete [sI + 1, i).
    if (i != sI + 1) {
      this.segments.splice(sI + 1, i - (sI + 1));
      this.indexes.splice(sI + 1, i - (sI + 1));
    }
    return this.construct(replacedIndexes, replacedSegments, count);
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
            [0],
            [this.itemSlice(this.normalItem, index, index + count)],
            count
          );
        } else replaced = this.constructEmpty(count);
        this.normalItem = this.itemUpdate(this.normalItem, index, item);
        return replaced;
      } else this.promoteNormalItem();
    }

    // Optimize common case: append.
    if (this.indexes.length === 0) {
      this.indexes.push(index);
      this.segments.push(item);
      return this.construct([], [], count);
    } else {
      const lastIndex = this.indexes[this.indexes.length - 1];
      const lastSegment = this.segments[this.indexes.length - 1];
      const lastLength = this.itemLength(lastSegment);
      if (lastIndex + lastLength == index) {
        this.segments[this.indexes.length - 1] = this.itemMerge(
          lastSegment,
          item
        );
        return this.construct([], [], count);
      } else if (lastIndex + lastLength < index) {
        this.indexes.push(index);
        this.segments.push(item);
        return this.construct([], [], count);
      }
    }

    const replacedSegments: I[] = [];
    const replacedIndexes: number[] = [];

    const [sI, sOffset] = this.getSegment(index, false);
    let itemAdded = false;
    if (sI !== -1) {
      const start = this.segments[sI];
      const sLength = this.itemLength(start);
      if (sOffset <= sLength) {
        // Part of start is overwritten, and/or start is appended to.
        // Note: possibly sOffset = 0.
        if (sOffset + count <= sLength) {
          // item is contained within start.
          const sMid = this.itemSlice(start, sOffset, sOffset + count);
          // Modify the existing segment in-place.
          this.segments[sI] = this.itemUpdate(start, sOffset, item);
          return this.construct([0], [sMid], count);
        } else {
          if (sOffset < sLength) {
            // The tail of start is overwritten.
            replacedSegments.push(this.itemSlice(start, sOffset));
            replacedIndexes.push(0);
          }
          // Overwrite & append to the existing segment.
          this.segments[sI] = this.itemUpdate(start, sOffset, item);
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
    for (; i < this.indexes.length; i++) {
      const segIndex = this.indexes[i];
      if (index + count < segIndex) break;
      const segment = this.segments[i];
      const segLength = this.itemLength(segment);
      if (index + count < segIndex + segLength) {
        // The head of segment is overwritten, but not all of it.
        // The rest needs to be appended to item's segment.
        let tail: I;
        if (index + count > segIndex) {
          replacedSegments.push(
            this.itemSlice(segment, 0, index + count - segIndex)
          );
          replacedIndexes.push(segIndex - index);
          tail = this.itemSlice(segment, index + count - segIndex);
        } else {
          // Nothing actually overwritten (head is trivial);
          // we're just appending segment to item.
          tail = segment;
        }

        if (itemAdded) {
          // Append non-overwritten tail to start.
          this.segments[sI] = this.itemMerge(this.segments[sI], tail);
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
        replacedSegments.push(segment);
        replacedIndexes.push(segIndex - index);
      }
    }

    // Delete [sI + 1, i).
    if (itemAdded) {
      if (i != sI + 1) {
        this.segments.splice(sI + 1, i - (sI + 1));
        this.indexes.splice(sI + 1, i - (sI + 1));
      }
    } else {
      // Still need to add item, as a new segment.
      this.segments.splice(sI + 1, i - (sI + 1), item);
      this.indexes.splice(sI + 1, i - (sI + 1), index);
    }
    return this.construct(replacedIndexes, replacedSegments, count);
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
    // OPT: starting i hint?
    for (let i = this.indexes.length - 1; i >= 0; i--) {
      const segIndex = this.indexes[i];
      if (segIndex < index || (!includeEnds && segIndex === index)) {
        return [i, index - segIndex];
      }
    }
    return [-1, index];
  }
}
