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

  private sliceInternalOld(
    startIndex: number,
    endIndex: number
  ): [values: SparseArray<T>] {
    const [sI, sOffset] = this.locate(startIndex);
    if (endIndex === startIndex) {
      // Avoid confusion from includeEnds TODO.
      return SparseArray.empty();
    }
    const [eI, eOffset] = this.locate(endIndex - startIndex, true, sI, sOffset);

    // Collect replaced values to return.
    let replacedState: (T[] | number)[];
    if (sI === eI) {
      if (sI % 2 === 0) {
        replacedState = [(this.state[sI] as T[]).slice(sOffset, eOffset)];
      } else replacedState = [[], eOffset - sOffset];
    } else {
      // Tail of start item.
      if (sI % 2 === 0) {
        replacedState = [(this.state[sI] as T[]).slice(sOffset)];
      } else replacedState = [[], (this.state[sI] as number) - sOffset];
      // Middle items, defensively copied.
      for (let i = sI + 1; i < eI; i++) {
        if (i % 2 === 0) replacedState.push((this.state[i] as T[]).slice());
        else replacedState.push(this.state[i] as number);
      }
      // Head of end item.
      if (eI % 2 === 0) {
        replacedState.push((this.state[eI] as T[]).slice(0, eOffset));
      } else replacedState.push(eOffset);
    }

    return new SparseArray(replacedState, endIndex - startIndex);
  }

  /**
   * Returns [i, offset] s.t. this.state[i][offset] (or deleted equivalent)
   * corresponds to index = indexDiff + (index at input [i, offset]).
   *
   * If the index is past the end of this.state,
   * returns [this.state.length, how far past].
   *
   * @param includeEnds If true and the index is at the start of an item,
   * returns [previous item index, previous item length] instead of
   * [item, 0].
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
    return [this.state.length, remaining];
  }

  /**
   *
   * @param index
   * @param values
   * @returns The replaced values, as a sparse array whose index 0 corresponds
   * to our index, and whose length is values.length (untrimmed).
   */
  set(index: number, ...values: T[]): SparseArray<T> {
    // Optimize common case: append.
    if (index === this._length) {
      if (this.state.length % 2 === 0 && this.state.length !== 0) {
        (this.state[this.state.length - 1] as T[]).push(...values);
      } else this.state.push(values);
      return SparseArray.empty(values.length);
    }
    if (index > this.length) {
      this.state.push(index - this._length, values);
      return SparseArray.empty(values.length);
    }

    // Avoid 0-length edge case.
    if (values.length === 0) return SparseArray.empty();
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
}
