import { SparseItems } from "./sparse_items";

export class SparseText extends SparseItems<string> {
  static empty(length = 0): SparseText {
    return new this([], [], length);
  }

  // static fromUnsafe(state: (string | number)[]): SparseText {
  //   let length = 0;
  //   for (let i = 0; i < state.length; i++) {
  //     if (i % 2 === 0) length += (state[i] as string).length;
  //     else length += state[i] as number;
  //   }
  //   return new this(state, length);
  // }

  // static from(state: (string | number)[]): SparseText {
  //   // Defensive deep copy.
  //   // TODO: also correctness checks?
  //   return this.fromUnsafe(state.slice());
  // }

  // // TODO: clone? / from(SparseText)? Can reuse length.

  // /**
  //  *
  //  * @param entries Must be in order by index.
  //  * @param length If specified, will be padded to the given length, which
  //  * must exceed the last present index.
  //  */
  // static fromEntries(
  //   entries: Iterable<[index: number, char: string]>,
  //   length?: number
  // ): SparseText {
  //   // Last item is always present.
  //   const state: (string | number)[] = [""];
  //   // The current length of state.
  //   let curLength = 0;

  //   for (const [index, char] of entries) {
  //     if (index === curLength) {
  //       (state[state.length - 1] as string) += char;
  //     } else if (index > curLength) {
  //       state.push(index - curLength, char);
  //     } else {
  //       throw new Error(
  //         `Out-of-order index in entries: ${index}, previous was ${
  //           curLength - 1
  //         }`
  //       );
  //     }
  //     curLength = index + 1;
  //   }

  //   if (length !== undefined) {
  //     if (length < curLength) {
  //       throw new Error(
  //         `length is less than (max index + 1): ${length} < ${curLength}`
  //       );
  //     }
  //     if (length > curLength) state.push(length - curLength);
  //     return new this(state, length);
  //   } else {
  //     if (curLength === 0) {
  //       // Completely empty; use [] instead of state = [""].
  //       return new this([], 0);
  //     } else return new this(state, curLength);
  //   }
  // }

  hasGet(index: number): [has: boolean, get: string | undefined] {
    if (index < 0) throw new Error(`Invalid index: ${index}`);

    // TODO: deduplicate with other classes.
    if (this.normalItem !== null) {
      if (index < this.normalItem.length) return [true, this.normalItem[index]];
      else return [false, undefined];
    }

    // OPT: binary search in long lists?
    // OPT: test forward vs backward.
    for (let i = 0; i < this.indexes.length; i++) {
      const segIndex = this.indexes[i];
      if (index < segIndex) return [false, undefined];
      const segment = this.segments[i];
      if (index < segIndex + segment.length) {
        return [true, segment[index - segIndex]];
      }
    }
    return [false, undefined];
  }

  has(index: number): boolean {
    return this.hasGet(index)[0];
  }

  get(index: number): string | undefined {
    return this.hasGet(index)[1];
  }

  // *entries(): IterableIterator<[index: number, char: string]> {
  //   let index = 0;
  //   for (let i = 0; i < this.state.length; i++) {
  //     if (i % 2 === 0) {
  //       const present = this.state[i] as string;
  //       for (const value of present) {
  //         yield [index, value];
  //         index++;
  //       }
  //     } else index += this.state[i] as number;
  //   }
  // }

  /**
   *
   * @param index
   * @param values
   * @returns The replaced values, as a sparse array whose index 0 corresponds
   * to our index, and whose length is values.length (untrimmed).
   */
  set(index: number, chars: string): SparseText {
    return this._set(index, chars);
  }

  /**
   *
   * @param index
   * @param count
   * @returns The replaced values, as a sparse array whose index 0 corresponds
   * to our index, and whose length is count (untrimmed).
   */
  delete(index: number, count = 1): SparseText {
    return this._delete(index, count);
  }

  protected construct(
    indexes: number[],
    segments: string[],
    length: number
  ): this {
    return new SparseText(indexes, segments, length) as this;
  }

  protected itemNewEmpty(): string {
    return "";
  }

  protected itemLength(item: string): number {
    return item.length;
  }

  protected itemMerge(a: string, b: string): string {
    return a + b;
  }

  protected itemSlice(
    item: string,
    start: number,
    end?: number | undefined
  ): string {
    return item.slice(start, end);
  }

  protected itemUpdate(item: string, start: number, replace: string): string {
    return item.slice(0, start) + replace + item.slice(start + replace.length);
  }

  protected itemShorten(item: string, newLength: number): string {
    return item.slice(0, newLength);
  }
}
