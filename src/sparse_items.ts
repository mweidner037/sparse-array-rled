export abstract class SparseItems<I> {
  /**
   * Subclasses: don't mutate.
   */
  protected readonly state: (I | number)[];
  /**
   * Subclasses: don't mutate.
   */
  protected _length: number;

  protected constructor(state: (I | number)[], length: number) {
    this.state = state;
    this._length = length;
  }

  protected abstract construct(state: (I | number)[], length: number): this;

  protected constructEmpty(length = 0): this {
    if (length === 0) return this.construct([], 0);
    else return this.construct([this.itemNewEmpty(), length], length);
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

  get length(): number {
    return this._length;
  }

  size(): number {
    let size = 0;
    for (let i = 0; i < this.state.length; i += 2) {
      size += this.itemLength(this.state[i] as I);
    }
    return size;
  }

  isEmpty(): boolean {
    return (
      this.state.length === 0 ||
      (this.state.length === 2 && this.itemLength(this.state[0] as I) === 0)
    );
  }

  trim(): void {
    if (this.state.length % 2 === 0 && this.state.length !== 0) {
      const lastDeleted = this.state.pop() as number;
      this._length -= lastDeleted;
    }
    if (this.state.length === 1 && this.itemLength(this.state[0] as I) === 0) {
      this.state.pop();
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

    // Items in the range [sI, eI] are replaced (not kept in their entirety).
    // sI and eI may be partially kept; if so, we add the kept slices to newItems.
    const replacedItems: (I | number)[] = [];
    if (sI === eI) {
      // replacedItems = [start.slice(sOffset, eOffset)]
      this.appendItemSlice(replacedItems, sI, sOffset, eOffset);
    } else {
      // replacedItems = [start.slice(sOffset), ...this.state.slice(sI + 1, eI), end.slice(0, eOffset)]
      this.appendItemSlice(replacedItems, sI, sOffset);
      // Guaranteed alternating & non-empty - don't need to use appendItem(). TODO: what if first slice is []?
      for (let i = sI + 1; i < eI; i++) replacedItems.push(this.state[i]);
      this.appendItemSlice(replacedItems, eI, 0, eOffset);
    }

    // newItems = [
    //     start.slice(0, sOffset) if non-empty,
    //     item,
    //     end.slice(eOffset) if non-empty
    // ]
    const newItems: (I | number)[] = [];
    if (sOffset !== 0) {
      this.appendItemSlice(newItems, sI, 0, sOffset);
    }
    this.appendItem(newItems, item, isPresent);
    const endLength =
      eI % 2 === 0
        ? this.itemLength(this.state[eI] as I)
        : (this.state[eI] as number);
    if (eOffset !== endLength) {
      this.appendItemSlice(newItems, eI, eOffset, endLength);
    }

    // Also store the trailing kept items (> eI) for appending.
    const trailingItems = this.state.slice(eI + 1);

    // Delete replaced & trailing items, then append new & trailing items.
    this.state.splice(sI);
    for (let j = 0; j < newItems.length; j++) {
      this.appendItem(this.state, newItems[j], j % 2 === 0);
    }
    if (trailingItems.length > 0) {
      this.appendItem(this.state, trailingItems[0], eI % 2 === 1);
      // Guaranteed that first item is nontrivial and others alternate? TODO: what if first is []?
      for (let j = 1; j < trailingItems.length; j++) {
        this.state.push(trailingItems[j]);
      }
    }

    return this.construct(replacedItems, count);
  }

  /**
   * Returns [i, offset] s.t. this.state[i][offset] (or deleted equivalent)
   * corresponds to index = indexDiff + (index at input [i, offset]).
   *
   * @param includeEnds If true and the index is at the start of an item,
   * returns [previous item index, previous item length] instead of
   * [item, 0].
   * @throws If index > this._length, or index == this._length and !includeEnds.
   */
  private locate(
    indexDiff: number,
    includeEnds = false,
    i = 0,
    offset = 0
  ): [i: number, offset: number] {
    // Reset remaining to the start of index i.
    let remaining = indexDiff + offset;

    for (; i < this.state.length; i++) {
      const itemLength =
        i % 2 === 0
          ? this.itemLength(this.state[i] as I)
          : (this.state[i] as number);
      if (remaining < itemLength || (includeEnds && remaining === itemLength)) {
        return [i, remaining];
      }
      remaining -= itemLength;
    }

    // TODO: remove; use locate for getters?
    throw new Error("Internal error: past end");
  }

  /**
   * Appends this.state[index].slice(start, end) to items, preserving items's
   * SparseArray format.
   */
  private appendItemSlice(
    items: (I | number)[],
    index: number,
    start: number,
    end?: number
  ): void {
    if (index % 2 === 0) {
      this.appendPresent(
        items,
        this.itemSlice(this.state[index] as I, start, end)
      );
    } else
      this.appendDeleted(items, (end ?? (this.state[index] as number)) - start);
  }

  private appendItem(
    arr: (I | number)[],
    item: I | number,
    isPresent: boolean
  ): void {
    if (isPresent) this.appendPresent(arr, item as I);
    else this.appendDeleted(arr, item as number);
  }

  private appendPresent(arr: (I | number)[], present: I): void {
    // OPT: Enforce non-zero length, so we can skip this check.
    if (this.itemLength(present) === 0) return;
    if (arr.length % 2 === 0) {
      // Empty, or ends with deleted item.
      arr.push(present);
    } else {
      // Non-empty and ends with present item.
      arr[arr.length - 1] = this.itemMerge(arr[arr.length - 1] as I, present);
    }
  }

  private appendDeleted(arr: (I | number)[], deleted: number): void {
    if (deleted === 0) return;
    if (arr.length % 2 === 1) {
      // Non-empty and ends with present item.
      arr.push(deleted);
    } else if (arr.length === 0) {
      // Empty.
      arr.push(this.itemNewEmpty(), deleted);
    } else {
      // Non-empty and ends with deleted item.
      (arr[arr.length - 1] as number) += deleted;
    }
  }
}
