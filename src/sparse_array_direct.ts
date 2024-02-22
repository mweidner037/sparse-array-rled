// TODO: remove, if benchmarks show min difference with templated version.

function appendPresent<T>(state: (T[] | number)[], present: T[]): void {
  // OPT: Enforce non-zero length, so we can skip this check.
  if (present.length === 0) return;
  if (state.length % 2 === 0) {
    // Empty, or ends with deleted item.
    state.push(present);
  } else {
    // Non-empty and ends with present item.
    (state[state.length - 1] as T[]).push(...present);
  }
}

function appendDeleted<T>(state: (T[] | number)[], deleted: number): void {
  if (deleted === 0) return;
  if (state.length % 2 === 1) {
    // Non-empty and ends with present item.
    state.push(deleted);
  } else if (state.length === 0) {
    // Empty.
    state.push([], deleted);
  } else {
    // Non-empty and ends with deleted item.
    (state[state.length - 1] as number) += deleted;
  }
}

function appendItem<T>(
  state: (T[] | number)[],
  item: T[] | number,
  isPresent: boolean
): void {
  if (isPresent) appendPresent(state, item as T[]);
  else appendDeleted(state, item as number);
}

export class SparseArray<T> {
  protected readonly state: (T[] | number)[];
  protected _length: number;

  protected constructor(state: (T[] | number)[], length: number) {
    this.state = state;
    this._length = length;
  }

  static empty<T>(length = 0): SparseArray<T> {
    if (length === 0) return new this([], 0);
    else return new this([[], length], length);
  }

  static fromUnsafe<T>(state: (T[] | number)[]): SparseArray<T> {
    let length = 0;
    for (let i = 0; i < state.length; i++) {
      if (i % 2 === 0) length += (state[i] as T[]).length;
      else length += state[i] as number;
    }
    return new this(state, length);
  }

  static from<T>(state: (T[] | number)[]): SparseArray<T> {
    // Defensive deep copy.
    // TODO: also correctness checks?
    const copy = new Array<T[] | number>(state.length);
    for (let i = 0; i < state.length; i++) {
      if (i % 2 === 0) copy[i] = (state[i] as T[]).slice();
      else copy[i] = state[i] as number;
    }
    return this.fromUnsafe(copy);
  }

  // TODO: clone? / from(SparseArray)? Can reuse length.

  /**
   *
   * @param entries Must be in order by index.
   * @param length If specified, will be padded to the given length, which
   * must exceed the last present index.
   */
  static fromEntries<T>(
    entries: Iterable<[index: number, value: T]>,
    length?: number
  ): SparseArray<T> {
    // The current last item in state, which is always present.
    let curPresent: T[] = [];
    const state: (T[] | number)[] = [curPresent];
    // The current length of state.
    let curLength = 0;

    for (const [index, value] of entries) {
      if (index === curLength) {
        curPresent.push(value);
      } else if (index > curLength) {
        curPresent = [value];
        state.push(index - curLength, curPresent);
      } else {
        throw new Error(
          `Out-of-order index in entries: ${index}, previous was ${
            curLength - 1
          }`
        );
      }
      curLength = index + 1;
    }

    if (length !== undefined) {
      if (length < curLength) {
        throw new Error(
          `length is less than (max index + 1): ${length} < ${curLength}`
        );
      }
      if (length > curLength) state.push(length - curLength);
      return new this(state, length);
    } else {
      if (curLength === 0) {
        // Completely empty; use [] instead of state = [[]].
        return new this([], 0);
      } else return new this(state, curLength);
    }
  }

  get length(): number {
    return this._length;
  }

  size(): number {
    let size = 0;
    for (let i = 0; i < this.state.length; i += 2) {
      size += (this.state[i] as T[]).length;
    }
    return size;
  }

  isEmpty(): boolean {
    return (
      this.state.length === 0 ||
      (this.state.length === 2 && (this.state[0] as T[]).length === 0)
    );
  }

  hasGet(index: number): [has: boolean, get: T | undefined] {
    if (index < 0) throw new Error(`Invalid index: ${index}`);

    let remaining = index;
    for (let i = 0; i < this.state.length; i++) {
      if (i % 2 === 0) {
        const present = this.state[i] as T[];
        if (remaining < present.length) return [true, present[remaining]];
        remaining -= present.length;
      } else {
        const deleted = this.state[i] as number;
        if (remaining < deleted) return [false, undefined];
        remaining -= deleted;
      }
    }
    return [false, undefined];
  }

  has(index: number): boolean {
    return this.hasGet(index)[0];
  }

  get(index: number): T | undefined {
    return this.hasGet(index)[1];
  }

  *entries(): IterableIterator<[index: number, value: T]> {
    let index = 0;
    for (let i = 0; i < this.state.length; i++) {
      if (i % 2 === 0) {
        const present = this.state[i] as T[];
        for (const value of present) {
          yield [index, value];
          index++;
        }
      } else index += this.state[i] as number;
    }
  }

  trim(): void {
    if (this.state.length % 2 === 0 && this.state.length !== 0) {
      const lastDeleted = this.state.pop() as number;
      this._length -= lastDeleted;
    }
    if (this.state.length === 1 && (this.state[0] as T[]).length === 0) {
      this.state.pop();
    }
  }

  /**
   *
   * @param index
   * @param values
   * @returns The replaced values, as a sparse array whose index 0 corresponds
   * to our index, and whose length is values.length (untrimmed).
   */
  set(index: number, ...values: T[]): SparseArray<T> {
    return this.setOrDelete(index, values, true);
  }

  /**
   *
   * @param index
   * @param count
   * @returns The replaced values, as a sparse array whose index 0 corresponds
   * to our index, and whose length is count (untrimmed).
   */
  delete(index: number, count = 1): SparseArray<T> {
    // TODO: count >= 0 check?
    return this.setOrDelete(index, count, false);
  }

  private setOrDelete(
    index: number,
    values: T[],
    isPresent: true
  ): SparseArray<T>;
  private setOrDelete(
    index: number,
    deleteCount: number,
    isPresent: false
  ): SparseArray<T>;
  private setOrDelete(
    index: number,
    item: T[] | number,
    isPresent: boolean
  ): SparseArray<T> {
    const count = isPresent ? (item as T[]).length : (item as number);

    // Optimize common case: append.
    if (index >= this._length) {
      appendDeleted(this.state, index - this._length);
      appendItem(this.state, item, isPresent);
      this._length = index + count;
      return SparseArray.empty(count);
    }

    // Avoid past-end edge case.
    if (this._length < index + count) {
      appendDeleted(this.state, index + count - this._length);
      this._length = index + count;
    }

    // Avoid trivial-item edge case.
    // Note that we still update this._length above.
    if (count === 0) return SparseArray.empty();

    const [sI, sOffset] = this.locate(index);
    const [eI, eOffset] = this.locate(count, true, sI, sOffset);

    // Items in the range [sI, eI] are replaced (not kept in their entirety).
    // sI and eI may be partially kept; if so, we add the kept slices to newItems.
    const replacedItems: (T[] | number)[] = [];
    if (sI === eI) {
      // replacedItems = [start.slice(sOffset, eOffset)]
      this.appendItemSlice(replacedItems, sI, sOffset, eOffset);
    } else {
      // replacedItems = [start.slice(sOffset), ...this.state.slice(sI + 1, eI), end.slice(0, eOffset)]
      this.appendItemSlice(replacedItems, sI, sOffset);
      // Alternation guaranteed - don't need to use appendItem().
      for (let i = sI + 1; i < eI; i++) replacedItems.push(this.state[i]);
      this.appendItemSlice(replacedItems, eI, 0, eOffset);
    }

    // newItems = [
    //     start.slice(0, sOffset) if non-empty,
    //     item,
    //     end.slice(eOffset) if non-empty
    // ]
    const newItems: (T[] | number)[] = [];
    if (sOffset !== 0) {
      this.appendItemSlice(newItems, sI, 0, sOffset);
    }
    appendItem(newItems, item, isPresent);
    const endLength =
      eI % 2 === 0
        ? (this.state[eI] as T[]).length
        : (this.state[eI] as number);
    if (eOffset !== endLength) {
      this.appendItemSlice(newItems, eI, eOffset, endLength);
    }

    // Append the trailing kept items (> eI) to newItems.
    if (eI + 1 < this.state.length) {
      appendItem(newItems, this.state[eI + 1], eI % 2 === 1);
      for (let i = eI + 2; i < this.state.length; i++) {
        // Alternation guaranteed - don't need to use appendItem.
        newItems.push(this.state[i]);
      }
    }

    this.state.splice(sI, Infinity, ...newItems);
    return new SparseArray(replacedItems, count);
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
        i % 2 === 0 ? (this.state[i] as T[]).length : (this.state[i] as number);
      if (remaining < itemLength || (includeEnds && remaining === itemLength)) {
        return [i, remaining];
      }
      remaining -= itemLength;
    }

    throw new Error("Internal error: past end");
  }

  /**
   * Appends this.state[index].slice(start, end) to items, preserving items's
   * SparseArray format.
   */
  private appendItemSlice(
    items: (T[] | number)[],
    index: number,
    start: number,
    end?: number
  ): void {
    if (index % 2 === 0) {
      appendPresent(items, (this.state[index] as T[]).slice(start, end));
    } else appendDeleted(items, (end ?? (this.state[index] as number)) - start);
  }
}
