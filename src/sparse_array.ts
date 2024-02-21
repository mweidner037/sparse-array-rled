function appendPresent<T>(state: (T[] | number)[], item: T[]): void {
  if (item.length === 0) return;
  if (state.length % 2 === 0) {
    // Empty, or ends with deleted item.
    state.push(item);
  } else {
    // Non-empty and ends with present item.
    (state[state.length - 1] as T[]).push(...item);
  }
}

function appendDeleted<T>(state: (T[] | number)[], item: number): void {
  if (item === 0) return;
  if (state.length % 2 === 1) {
    // Non-empty and ends with present item.
    state.push(item);
  } else if (state.length === 0) {
    // Empty.
    state.push([], item);
  } else {
    // Non-empty and ends with deleted item.
    (state[state.length - 1] as number) += item;
  }
}

// Assumes newItems is non-empty. Note: it will be mutated.
function splice<T>(
  state: (T[] | number)[],
  start: number,
  end: number,
  newItems: (T[] | number)[],
  firstNewPresent: boolean
): void {
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

  /**
   *
   * @param index
   * @param values
   * @returns The replaced values, as a sparse array whose index 0 corresponds
   * to our index, and whose length is values.length (untrimmed).
   */
  set(index: number, ...values: T[]): SparseArray<T> {
    // Optimize common case: append.
    if (index >= this._length) {
      // TODO: methods that update length for you? Only if not used as functions.
      appendDeleted(this.state, index - this._length);
      appendPresent(this.state, values);
      this._length = index + values.length;
      return SparseArray.empty(values.length);
    }

    // Avoid 0-length edge case.
    if (values.length === 0) return SparseArray.empty();

    // Build splice args.
    const newItems: (T[] | number)[] = [];
    const replacedItems: (T[] | number)[] = [];

    let i = 0;
    let startRemaining = index;
    for (; i < this.state.length; i++) {
      if (startRemaining === 0) {
        if (i % 2 === 0) {
          // Previous item is deleted or start of array; need a new item for values.
          newItems.push(values);
        } else {
          // Previous item is present; append to it without creating a new item.
          (this.state[i - 1] as T[]).push(...values);
        }
        break;
      }

      const item = this.state[i];
      const itemLength = i % 2 === 0 ? (item as T[]).length : (item as number);
      if (startRemaining < itemLength) {
        if (i % 2 === 0) {
          newItems.push((item as T[]).slice(0, startRemaining).concat(values));
          replacedItems.push(
            (item as T[]).slice(
              startRemaining,
              Math.min(itemLength, startRemaining + values.length)
            )
          );
        } else {
          newItems.push(startRemaining, values);
          replacedItems.push(
            [],
            Math.min(itemLength - startRemaining, values.length)
          );
        }
        break;
      } else startRemaining -= itemLength;
    }
    const startIndex = i;

    this.state.splice(startIndex, deleteCount, ...newItems);
    this._length = Math.max(this._length, index + values.length);

    return new SparseArray(replacedItems, values.length);
  }

  // TODO: delete-append case: extend length to touch the end of deleted region?

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
