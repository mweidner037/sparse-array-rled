import { SparseItems } from "./sparse_items";

export class SparseIndices extends SparseItems<number> {
  static empty(length = 0): SparseIndices {
    if (length === 0) return new this([], 0);
    else return new this([0, length], length);
  }

  static fromUnsafe(state: number[]): SparseIndices {
    let length = 0;
    for (let i = 0; i < state.length; i++) {
      length += state[i];
    }
    return new this(state, length);
  }

  static from(state: number[]): SparseIndices {
    // Defensive copy.
    // TODO: also correctness checks?
    return this.fromUnsafe(state.slice());
  }

  // TODO: clone? / from(SparseIndices)? Can reuse length.

  /**
   *
   * @param entries Must be in order by index.
   * @param length If specified, will be padded to the given length, which
   * must exceed the last present index.
   */
  static fromKeys(keys: Iterable<number>, length?: number): SparseIndices {
    // Last item is always present.
    const state: number[] = [0];
    // The current length of state.
    let curLength = 0;

    for (const index of keys) {
      if (index === curLength) {
        state[state.length - 1]++;
      } else if (index > curLength) {
        state.push(index - curLength, 1);
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
        // Completely empty; use [] instead of state = [0].
        return new this([], 0);
      } else return new this(state, curLength);
    }
  }

  has(index: number): boolean {
    if (index < 0) throw new Error(`Invalid index: ${index}`);

    const [i] = this.locate(index);
    return i % 2 === 0;
  }

  *keys(): IterableIterator<number> {
    let index = 0;
    for (let i = 0; i < this.state.length; i++) {
      if (i % 2 === 0) {
        const present = this.state[i];
        for (let j = 0; j < present; j++) {
          yield index;
          index++;
        }
      } else index += this.state[i];
    }
  }

  // TODO: add() instead of set()
  /**
   *
   * @param index
   * @param values
   * @returns The replaced values, as a sparse array whose index 0 corresponds
   * to our index, and whose length is values.length (untrimmed).
   */
  set(index: number, count = 1): SparseIndices {
    return this.setOrDelete(index, count, true);
  }

  /**
   *
   * @param index
   * @param count
   * @returns The replaced values, as a sparse array whose index 0 corresponds
   * to our index, and whose length is count (untrimmed).
   */
  delete(index: number, count = 1): SparseIndices {
    // TODO: count >= 0 check?
    return this.setOrDelete(index, count, false);
  }

  protected construct(state: number[], length: number): this {
    return new SparseIndices(state, length) as this;
  }

  protected itemNewEmpty(): number {
    return 0;
  }

  protected itemLength(item: number): number {
    return item;
  }

  protected itemMerge(a: number, b: number): number {
    return a + b;
  }

  protected itemSlice(
    item: number,
    start: number,
    end?: number | undefined
  ): number {
    return (end ?? item) - start;
  }

  protected itemUpdate(item: number, _index: number, _replace: number): number {
    return item;
  }

  protected itemShorten(item: number, newLength: number): number {
    return newLength;
  }
}
