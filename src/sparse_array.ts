function appendPresent<T>(state: (T[] | number)[], present: T[]): void {
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

/**
 * Assumes newItems is non-empty. Note: it will be mutated.
 */
function splice<T>(
  state: (T[] | number)[],
  start: number,
  end: number,
  newItems: (T[] | number)[]
): void {
  // Convert newItems to a form where the first item is nontrivial
  // but not necessarily present (tracked by firstNewPresent).
  let firstNewPresent = true;
  if (newItems.length !== 0 && (newItems[0] as T[]).length === 0) {
    newItems.shift();
    firstNewPresent = false;
  }

  if (newItems.length !== 0 && start !== 0) {
    // Try to merge newItems[0] with state[start - 1].
    if (firstNewPresent) {
      if (start % 2 === 1) {
        const firstNew = newItems.shift() as T[];
        (state[start - 1] as T[]).push(...firstNew);
        firstNewPresent = !firstNewPresent;
      }
    } else {
      if (start % 2 === 0) {
        const firstNew = newItems.shift() as number;
        (state[start - 1] as number) += firstNew;
        firstNewPresent = !firstNewPresent;
      }
    }
  }

  if (newItems.length !== 0 && end !== state.length) {
    // Try to merge newItems[last] with state[end].
    const lastNewPresent = firstNewPresent !== (newItems.length % 2 === 0);
    if (lastNewPresent) {
      if (end % 2 === 0) {
        (newItems[newItems.length - 1] as T[]).push(...(state[end] as T[]));
        end++;
      }
    } else {
      if (end % 2 === 1) {
        (newItems[newItems.length - 1] as number) += state[end] as number;
        end++;
      }
    }
  }

  state.splice(start, end - start, ...newItems);
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
    // Note that we still update this._length above, for consistency.
    if (count === 0) return SparseArray.empty();

    const [sI, sOffset] = this.locate(index);
    const [eI, eOffset] = this.locate(count, true, sI, sOffset);

    // Items [sI, eI] are replaced (not kept in their entirely).
    // sI and eI may be partially kept; we replace the original item
    // with a slice stored in newItems.
    const replacedItems: (T[] | number)[] = [];
    if (sI === eI) {
      // replacedItems = [start.slice(sOffset, eOffset)]
      this.appendItemSlice(replacedItems, sI, sOffset, eOffset);
    } else {
      // replacedItems = [start.slice(sOffset), ...this.state.slice(sI + 1, eI), end.slice(0, eOffset)]
      this.appendItemSlice(replacedItems, sI, sOffset);
      // Alternation guaranteed - don't need to use append...().
      for (let i = sI + 1; i < eI; i++) replacedItems.push(this.state[i]);
      this.appendItemSlice(replacedItems, eI, 0, eOffset);
    }

    // newItems = [
    //     start.slice(0, sOffset) if non-empty,
    //     values,
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

    splice(this.state, sI, eI + 1, newItems);
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
    let remaining = indexDiff;
    if (offset !== 0) remaining += offset;

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
