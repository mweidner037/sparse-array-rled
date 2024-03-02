import { Itemer, Pair, SparseItems, deserializeItems } from "./sparse_items";

export type SerializedSparseText = Array<string | number>;

export interface TextSlicer {
  nextSlice(
    endIndex: number | null
  ): IterableIterator<[index: number, chars: string]>;
}

export class SparseText extends SparseItems<string> {
  static new(length = 0): SparseText {
    return new this([], length);
  }

  static deserialize(serialized: SerializedSparseText): SparseText {
    return new this(...deserializeItems(serialized, textItemer));
  }

  static fromEntries(
    entries: Iterable<[index: number, char: string]>,
    length?: number
  ): SparseText {
    const pairs: Pair<string>[] = [];
    let curLength = 0;

    for (const [index, char] of entries) {
      if (index < curLength) {
        throw new Error(
          `Out-of-order index in entries: ${index}, previous was ${
            curLength - 1
          }`
        );
      }

      if (index === curLength && pairs.length !== 0) {
        pairs[pairs.length - 1].item += char;
      } else {
        pairs.push({ index, item: char });
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

  serialize(trimmed?: boolean): SerializedSparseText {
    return super.serialize(trimmed);
  }

  hasGet(
    index: number
  ): [has: true, get: string] | [has: false, get: undefined] {
    const located = this._get(index);
    if (located === null) return [false, undefined];
    const [item, offset] = located;
    return [true, item[offset]];
  }

  get(index: number): string | undefined {
    return this.hasGet(index)[1];
  }

  findCount(
    count: number,
    startIndex?: number
  ): [index: number, char: string] | null {
    const located = this._findCount(count, startIndex);
    if (located === null) return null;
    const [index, item, offset] = located;
    return [index, item[offset]];
  }

  newSlicer(): TextSlicer {
    return super.newSlicer();
  }

  *entries(): IterableIterator<[index: number, char: string]> {
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

  protected construct(pairs: Pair<string>[], length: number): this {
    return new SparseText(pairs, length) as this;
  }

  protected itemer() {
    return textItemer;
  }
}

const textItemer: Itemer<string> = {
  newEmpty(): string {
    return "";
  },

  length(item: string): number {
    return item.length;
  },

  merge(a: string, b: string): string {
    return a + b;
  },

  slice(item: string, start?: number, end?: number): string {
    return item.slice(start, end);
  },

  update(item: string, start: number, replace: string): string {
    return item.slice(0, start) + replace + item.slice(start + replace.length);
  },

  shorten(item: string, newLength: number): string {
    return item.slice(0, newLength);
  },
} as const;
