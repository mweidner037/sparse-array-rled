import { Itemer, Pair, SparseItems } from "./sparse_items";

const indexesItemer: Itemer<number> = {
  newEmpty(): number {
    return 0;
  },

  length(item: number): number {
    return item;
  },

  merge(a: number, b: number): number {
    return a + b;
  },

  slice(item: number, start?: number, end?: number): number {
    return (end ?? item) - (start ?? 0);
  },

  update(item: number, index: number, replace: number): number {
    return Math.max(item, index + replace);
  },

  shorten(item: number, newLength: number): number {
    return newLength;
  },
} as const;

export class SparseIndexes extends SparseItems<number> {
  static empty(length = 0): SparseIndexes {
    return new this([], length);
  }

  // static fromUnsafe(state: number[]): SparseIndexes {
  //   let length = 0;
  //   for (let i = 0; i < state.length; i++) {
  //     length += state[i];
  //   }
  //   return new this(state, length);
  // }

  // static from(state: number[]): SparseIndexes {
  //   // Defensive copy.
  //   // TODO: also correctness checks?
  //   return this.fromUnsafe(state.slice());
  // }

  // // TODO: clone? / from(SparseIndexes)? Can reuse length.

  // /**
  //  *
  //  * @param entries Must be in order by index.
  //  * @param length If specified, will be padded to the given length, which
  //  * must exceed the last present index.
  //  */
  // static fromKeys(keys: Iterable<number>, length?: number): SparseIndexes {
  //   // Last item is always present.
  //   const state: number[] = [0];
  //   // The current length of state.
  //   let curLength = 0;

  //   for (const index of keys) {
  //     if (index === curLength) {
  //       state[state.length - 1]++;
  //     } else if (index > curLength) {
  //       state.push(index - curLength, 1);
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
  //       // Completely empty; use [] instead of state = [0].
  //       return new this([], 0);
  //     } else return new this(state, curLength);
  //   }
  // }

  has(index: number): boolean {
    if (index < 0) throw new Error(`Invalid index: ${index}`);

    // TODO: deduplicate with other classes.
    if (this.normalItem !== null) {
      return index < this.normalItem;
    }

    // OPT: binary search in long lists?
    // OPT: test forward vs backward.
    for (let i = 0; i < this.pairs.length; i++) {
      const segIndex = this.pairs[i].index;
      if (index < segIndex) return false;
      if (index < segIndex + this.pairs[i].item) {
        return true;
      }
    }
    return false;
  }

  // *keys(): IterableIterator<number> {
  //   let index = 0;
  //   for (let i = 0; i < this.state.length; i++) {
  //     if (i % 2 === 0) {
  //       const present = this.state[i];
  //       for (let j = 0; j < present; j++) {
  //         yield index;
  //         index++;
  //       }
  //     } else index += this.state[i];
  //   }
  // }

  // TODO: add() instead of set()
  /**
   *
   * @param index
   * @param values
   * @returns The replaced values, as a sparse array whose index 0 corresponds
   * to our index, and whose length is values.length (untrimmed).
   */
  set(index: number, count = 1): SparseIndexes {
    return this._set(index, count);
  }

  /**
   *
   * @param index
   * @param count
   * @returns The replaced values, as a sparse array whose index 0 corresponds
   * to our index, and whose length is count (untrimmed).
   */
  delete(index: number, count = 1): SparseIndexes {
    return this._delete(index, count);
  }

  protected construct(pairs: Pair<number>[], length: number): this {
    return new SparseIndexes(pairs, length) as this;
  }

  protected itemer() {
    return indexesItemer;
  }
}
