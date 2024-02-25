export type Pair<I> = {
  present: I;
  deleted: number;
};

export abstract class SparseItems<I> {
  /**
   * Subclasses: don't mutate.
   */
  protected readonly state: Pair<I>[];
  /**
   * Subclasses: don't mutate.
   */
  protected _length: number;

  protected constructor(state: Pair<I>[], length: number) {
    this.state = state;
    this._length = length;
  }

  protected abstract construct(state: Pair<I>[], length: number): this;

  protected constructEmpty(length = 0): this {
    if (length === 0) return this.construct([], 0);
    else
      return this.construct(
        [{ present: this.itemNewEmpty(), deleted: length }],
        length
      );
  }

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
   * Replace [index, index + replace.length) with replace's values.
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
  }

  size(): number {
    let size = 0;
    for (let j = 0; j < this.state.length; j++) {
      size += this.itemLength(this.state[j].present);
    }
    return size;
  }

  isEmpty(): boolean {
    return (
      this.state.length === 0 ||
      (this.state.length === 1 && this.itemLength(this.state[0].present) === 0)
    );
  }

  trim(): void {
    if (this.state.length !== 0) {
      const last = this.state[this.state.length - 1];
      this._length -= last.deleted;
      last.deleted = 0;
      if (this._length === 0) this.state.pop();
    }
  }

  protected setOrDelete(index: number, item: I, isPresent: true): this;
  protected setOrDelete(
    index: number,
    deleteCount: number,
    isPresent: false
  ): this;
  protected setOrDelete(
    index: number,
    item: I | number,
    isPresent: boolean
  ): this {
    const count = isPresent ? this.itemLength(item as I) : (item as number);

    // Optimize common case: append.
    if (index >= this._length) {
      this.appendDeleted(this.state, index - this._length);
      this.appendItem(this.state, item, isPresent);
      this._length = index + count;
      return this.constructEmpty(count);
    }

    // Avoid past-end edge case.
    if (this._length < index + count) {
      this.appendDeleted(this.state, index + count - this._length);
      this._length = index + count;
    }

    // Avoid trivial-item edge case.
    // Note that we still update this._length above.
    if (count === 0) return this.constructEmpty();

    const [sI, sOffset] = this.locate(index);
    const [eI, eOffset] = this.locate(count, true, sI, sOffset);

    if (sI === eI) {
      // Optimize some easy cases that only touch one item (start).
      if (sI % 2 === 0) {
        const start = this.state[sI >> 1].present;
        if (isPresent) {
          // Just replacing values within start.
          const replacedValues = this.itemSlice(start, sOffset, eOffset);
          this.state[sI >> 1].present = this.itemUpdate(
            start,
            sOffset,
            item as I
          );
          return this.construct(
            [{ present: replacedValues, deleted: 0 }],
            count
          );
        } else if (sOffset > 0) {
          // Deleting values at the middle/end of start.
          const replacedValues = this.itemSlice(start, sOffset, eOffset);
          if (eOffset < this.itemLength(start)) {
            const trailing: Pair<I> = {
              present: this.itemSlice(start, eOffset),
              deleted: this.state[sI >> 1].deleted,
            };
            this.state[sI >> 1].deleted = count;
            this.state.splice((sI >> 1) + 1, 0, trailing);
          } else {
            this.state[sI >> 1].deleted += count;
          }
          this.state[sI >> 1].present = this.itemShorten(start, sOffset);
          return this.construct(
            [{ present: replacedValues, deleted: 0 }],
            count
          );
        }
      } else {
        if (!isPresent) {
          // No change: deleted -> deleted.
          return this.constructEmpty(count);
        }
      }

      // Remaining cases fall through to default behavior.
    }

    // Items in the range [sI, eI] are replaced (not kept in their entirety).
    // sI and eI may be partially kept; if so, we add the kept slices to newItems.
    const replacedItems: Pair<I>[] = [];
    if (sI === eI) {
      // replacedItems = [start.slice(sOffset, eOffset)]
      this.appendItemSlice(replacedItems, sI, sOffset, eOffset);
    } else {
      // replacedItems = [start.slice(sOffset), ...this.state.slice(sI + 1, eI), end.slice(0, eOffset)]
      this.appendItemSlice(replacedItems, sI, sOffset);
      // TODO: append opt
      for (let i = sI + 1; i < eI; i++) {
        if (i % 2 === 0)
          this.appendPresent(replacedItems, this.state[i >> 1].present);
        else this.appendDeleted(replacedItems, this.state[i >> 1].deleted);
      }
      this.appendItemSlice(replacedItems, eI, 0, eOffset);
    }

    // newItems = [
    //     present part of sI if it's deleted,
    //     start.slice(0, sOffset) if non-empty,
    //     item,
    //     end.slice(eOffset) if non-empty
    // ]
    const newItems: Pair<I>[] = [];
    if (sI % 2 === 1)
      newItems.push({ present: this.state[sI >> 1].present, deleted: 0 });
    this.appendItemSlice(newItems, sI, 0, sOffset);
    this.appendItem(newItems, item, isPresent);
    this.appendItemSlice(newItems, eI, eOffset);

    // Also append the trailing kept items (> eI).
    // TODO: append opt
    for (let i = eI + 1; i < 2 * this.state.length; i++) {
      if (i % 2 === 0) this.appendPresent(newItems, this.state[i >> 1].present);
      else this.appendDeleted(newItems, this.state[i >> 1].deleted);
    }

    // Delete replaced & trailing items.
    this.state.splice(sI >> 1);

    // Append new and trailing items.
    // After the second (which is nontrivial),
    // we can just append - already alternates.
    this.appendPresent(this.state, newItems[0].present);
    this.appendDeleted(this.state, newItems[0].deleted);
    for (let j = 1; j < newItems.length; j++) {
      this.state.push(newItems[j]);
    }

    return this.construct(replacedItems, count);
  }

  /**
   * Returns [i, offset] s.t. this.state[i][offset] (or deleted equivalent)
   * corresponds to index = indexDiff + (index at input [i, offset]).
   *
   * If out of bounds, returns [-1, this.length - index].
   * (When includeEnds is true, index = this.length is in-bounds.)
   *
   * @param includeEnds If true and the index is at the start of an item,
   * returns [previous item index, previous item length] instead of
   * [item, 0].
   */
  protected locate(
    indexDiff: number,
    includeEnds = false,
    i = 0,
    offset = 0
  ): [i: number, offset: number] {
    // Reset remaining to the start of index i.
    let remaining = indexDiff + offset;

    for (; i < 2 * this.state.length; i++) {
      const itemLength =
        i % 2 === 0
          ? this.itemLength(this.state[i >> 1].present)
          : this.state[i >> 1].deleted;
      if (remaining < itemLength || (includeEnds && remaining === itemLength)) {
        return [i, remaining];
      }
      remaining -= itemLength;
    }

    return [-1, remaining];
  }

  private appendItem(
    arr: Pair<I>[],
    item: I | number,
    isPresent: boolean
  ): void {
    if (isPresent) this.appendPresent(arr, item as I);
    else this.appendDeleted(arr, item as number);
  }

  /**
   * Appends this.state[index].slice(start, end) to items, preserving items's
   * SparseArray format.
   */
  private appendItemSlice(
    items: Pair<I>[],
    index: number,
    start: number,
    end?: number
  ): void {
    if (index % 2 === 0) {
      this.appendPresent(
        items,
        this.itemSlice(this.state[index >> 1].present, start, end)
      );
    } else
      this.appendDeleted(
        items,
        (end ?? this.state[index >> 1].deleted) - start
      );
  }

  private appendPresent(arr: Pair<I>[], present: I): void {
    // OPT: Enforce non-zero length, so we can skip this check.
    if (this.itemLength(present) === 0) return;
    if (arr.length === 0) {
      arr.push({ present, deleted: 0 });
    } else {
      const last = arr[arr.length - 1];
      if (last.deleted === 0)
        last.present = this.itemMerge(last.present, present);
      else arr.push({ present, deleted: 0 });
    }
  }

  private appendDeleted(arr: Pair<I>[], deleted: number): void {
    if (arr.length === 0) {
      if (deleted !== 0) {
        arr.push({ present: this.itemNewEmpty(), deleted });
      }
    } else arr[arr.length - 1].deleted += deleted;
  }
}
