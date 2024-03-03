import { Itemer, Pair, SparseItems, deserializeItems } from "./sparse_items";

/**
 * Run-length encoding. Even indexes are T[], odd indexes are delete counts.
 */
export type SerializedSparseArray<T> = Array<T[] | number>;

export interface ArraySlicer<T> {
  nextSlice(endIndex: number | null): Array<[index: number, values: T[]]>;
}

export class SparseArray<T> extends SparseItems<T[]> {
  static new<T>(length = 0): SparseArray<T> {
    return new this([], length);
  }

  // OPT: unsafe version that skips internal clones?
  // For faster loading direct from JSON (w/o storing refs elsewhere).
  static deserialize<T>(serialized: SerializedSparseArray<T>): SparseArray<T> {
    return new this(
      ...deserializeItems(serialized, arrayItemer as Itemer<T[]>)
    );
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

  findCount(
    count: number,
    startIndex?: number
  ): [index: number, value: T] | null {
    const located = this._findCount(count, startIndex);
    if (located === null) return null;
    const [index, item, offset] = located;
    return [index, item[offset]];
  }

  newSlicer(): ArraySlicer<T> {
    return super.newSlicer();
  }

  *entries(): IterableIterator<[index: number, value: T]> {
    for (const pair of this.asPairs()) {
      for (let j = 0; j < pair.item.length; j++) {
        yield [pair.index + j, pair.item[j]];
      }
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
