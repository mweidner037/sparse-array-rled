import { Itemer, Pair, SparseItems, deserializeItems } from "./sparse_items";

export type SerializedSparseIndexes = Array<number>;

export interface IndexesSlicer {
  nextSlice(
    endIndex: number | null
  ): IterableIterator<[index: number, count: number]>;
}

export class SparseIndexes extends SparseItems<number> {
  static new(length = 0): SparseIndexes {
    return new this([], length);
  }
  static deserialize(serialized: SerializedSparseIndexes): SparseIndexes {
    return new this(...deserializeItems(serialized, indexesItemer));
  }

  static fromKeys(keys: Iterable<number>, length?: number): SparseIndexes {
    const pairs: Pair<number>[] = [];
    let curLength = 0;

    for (const index of keys) {
      if (index < curLength) {
        throw new Error(
          `Out-of-order index in entries: ${index}, previous was ${
            curLength - 1
          }`
        );
      }

      if (index === curLength && pairs.length !== 0) {
        pairs[pairs.length - 1].item++;
      } else {
        pairs.push({ index, item: 1 });
      }
      curLength = index + 1;
    }

    if (length !== undefined && length < curLength) {
      throw new Error(
        `length is less than (max index + 1): ${length} < ${curLength}`
      );
    }
    return new this(pairs, length ?? curLength);
  }

  serialize(trimmed?: boolean): SerializedSparseIndexes {
    return super.serialize(trimmed);
  }

  findCount(count: number, startIndex?: number): number | null {
    const located = this._findCount(count, startIndex);
    if (located === null) return null;
    return located[0];
  }

  newSlicer(): IndexesSlicer {
    return super.newSlicer();
  }

  /**
   *
   * @param index
   * @param values
   * @returns The replaced values, as a sparse array whose index 0 corresponds
   * to our index, and whose length is values.length (untrimmed).
   */
  add(index: number, count = 1): SparseIndexes {
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

  shorten(_item: number, newLength: number): number {
    return newLength;
  },
} as const;
