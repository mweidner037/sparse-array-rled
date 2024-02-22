import { SparseItems } from "./sparse_items";

export class SparseArray<T> extends SparseItems<T[]> {
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

  hasGet(index: number): [has: boolean, get: T | undefined] {
    if (index < 0) throw new Error(`Invalid index: ${index}`);

    const [i, offset] = this.locate(index);
    if (i % 2 === 0) {
      return [true, (this.state[i] as T[])[offset]];
    } else return [false, undefined];
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

  protected construct(state: (number | T[])[], length: number): this {
    return new SparseArray(state, length) as this;
  }

  protected itemNewEmpty(): T[] {
    return [];
  }

  protected itemLength(item: T[]): number {
    return item.length;
  }

  protected itemMerge(a: T[], b: T[]): T[] {
    a.push(...b);
    return a;
  }

  protected itemSlice(item: T[], start: number, end?: number | undefined): T[] {
    return item.slice(start, end);
  }

  protected itemUpdate(item: T[], start: number, replace: T[]): T[] {
    for (let i = 0; i < replace.length; i++) item[start + i] = replace[i];
    return item;
  }

  protected itemShorten(item: T[], newLength: number): T[] {
    item.length = newLength;
    return item;
  }
}
