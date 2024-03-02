import { Itemer, Pair, SparseItems } from "./sparse_items";

const arrayItemer: Itemer<unknown[]> = {
  newEmpty(): unknown[] {
    return [];
  },

  length(item: unknown[]): number {
    return item.length;
  },

  merge(a: unknown[], b: unknown[]): unknown[] {
    a.push(...b);
    return a;
  },

  slice(item: unknown[], start?: number, end?: number | undefined): unknown[] {
    return item.slice(start, end);
  },

  update(item: unknown[], start: number, replace: unknown[]): unknown[] {
    if (start === item.length) item.push(...replace);
    else {
      for (let i = 0; i < replace.length; i++) item[start + i] = replace[i];
    }
    return item;
  },

  shorten(item: unknown[], newLength: number): unknown[] {
    item.length = newLength;
    return item;
  },
} as const;

/**
 * Run-length encoding. Even indexes are T[], odd indexes are delete counts.
 */
export type SerializedSparseArray<T> = Array<T[] | number>;

export class SparseArray<T> extends SparseItems<T[]> {
  // TODO: copy static constructors to other subclasses.
  static new<T>(length = 0): SparseArray<T> {
    return new this([], length);
  }

  static deserialize<T>(serialized: SerializedSparseArray<T>): SparseArray<T> {
    const pairs: Pair<T[]>[] = [];
    let nextIndex = 0;

    for (let j = 0; j < serialized.length; j++) {
      if (j % 2 === 0) {
        const item = serialized[j] as T[];
        if (item.length === 0) continue;
        pairs.push({ index: nextIndex, item: item.slice() });
        nextIndex += item.length;
      } else {
        const deleted = serialized[j] as number;
        nextIndex += deleted;
      }
    }

    return new this(pairs, nextIndex);
  }

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
    const pairs: Pair<T[]>[] = [];
    let curLength = 0;

    for (const [index, value] of entries) {
      if (index < curLength) {
        throw new Error(
          `Out-of-order index in entries: ${index}, previous was ${
            curLength - 1
          }`
        );
      }

      if (index === curLength && pairs.length !== 0) {
        pairs[pairs.length - 1].item.push(value);
      } else {
        pairs.push({ index, item: [value] });
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

  // TODO: copy on others for type signature override
  serialize(trimmed?: boolean): SerializedSparseArray<T> {
    return super.serialize(trimmed);
  }

  hasGet(index: number): [has: true, get: T] | [has: false, get: undefined] {
    const located = this._get(index);
    if (located === null) return [false, undefined];
    const [item, offset] = located;
    return [true, item[offset]];
  }

  get(index: number): T | undefined {
    return this.hasGet(index)[1];
  }

  findPresent(
    count: number,
    startIndex?: number
  ): [index: number, value: T] | null {
    const located = this._findPresent(count, startIndex);
    if (located === null) return null;
    const [index, item, offset] = located;
    return [index, item[offset]];
  }

  newSlicer(): Slicer<T> {
    if (this.normalItem !== null) {
      return new NormalItemSlicer(this.normalItem);
    }

    return new PairSlicer(this.pairs);
  }

  *entries(): IterableIterator<[index: number, value: T]> {
    if (this.normalItem !== null) {
      for (let index = 0; index < this.normalItem.length; index++) {
        yield [index, this.normalItem[index]];
      }
      return;
    }

    for (const pair of this.pairs) {
      for (let j = 0; j < pair.item.length; j++) {
        yield [pair.index + j, pair.item[j]];
      }
    }
  }

  *keys(): IterableIterator<number> {
    for (const [index] of this.entries()) yield index;
  }

  /**
   *
   * @param index
   * @param values
   * @returns The replaced values, as a sparse array whose index 0 corresponds
   * to our index, and whose length is values.length (untrimmed).
   */
  set(index: number, ...values: T[]): SparseArray<T> {
    return this._set(index, values);
  }

  /**
   *
   * @param index
   * @param count
   * @returns The replaced values, as a sparse array whose index 0 corresponds
   * to our index, and whose length is count (untrimmed).
   */
  delete(index: number, count = 1): SparseArray<T> {
    return this._delete(index, count);
  }

  protected construct(pairs: Pair<T[]>[], length: number): this {
    return new SparseArray(pairs, length) as this;
  }

  protected itemer() {
    return arrayItemer as Itemer<T[]>;
  }
}

export interface Slicer<T> {
  nextSlice(
    endIndex: number | null
  ): IterableIterator<[index: number, values: T[]]>;
}

class NormalItemSlicer<T> implements Slicer<T> {
  private index = 0;

  constructor(private readonly normalItem: T[]) {}

  *nextSlice(
    endIndex: number | null
  ): IterableIterator<[index: number, values: T[]]> {
    if (endIndex === null) {
      if (this.index < this.normalItem.length)
        yield [this.index, this.normalItem.slice(this.index)];
    } else {
      const actualEndIndex = Math.min(this.normalItem.length, endIndex);
      if (this.index < actualEndIndex)
        yield [this.index, this.normalItem.slice(this.index, actualEndIndex)];
      this.index = endIndex;
    }
  }
}

class PairSlicer<T> implements Slicer<T> {
  private i = 0;
  private offset = 0;

  constructor(private readonly pairs: Pair<T[]>[]) {}

  *nextSlice(
    endIndex: number | null
  ): IterableIterator<[index: number, values: T[]]> {
    while (this.i < this.pairs.length) {
      const pair = this.pairs[this.i];
      if (endIndex !== null && endIndex <= pair.index) return;
      const pairEnd = pair.index + pair.item.length;
      if (endIndex === null || endIndex >= pairEnd) {
        // Always slice, to prevent exposing internal items.
        yield [pair.index + this.offset, pair.item.slice(this.offset)];
        this.i++;
        this.offset = 0;
      } else {
        const endOffset = endIndex - pair.index;
        // Handle duplicate-endIndex case without empty emits.
        if (endOffset > this.offset) {
          yield [
            pair.index + this.offset,
            pair.item.slice(this.offset, endOffset),
          ];
          this.offset = endOffset;
        }
      }
    }
  }
}
