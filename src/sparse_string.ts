import { Itemer, Pair, SparseItems, deserializeItems } from "./sparse_items";
import { checkIndex } from "./util";

/**
 * See SparseString.serialize.
 */
export type SerializedSparseString = Array<string | number>;

/**
 * Iterator-like object returned by SparseText.newSlicer().
 *
 * Call nextSlice repeatedly to enumerate the slices in order.
 */
export interface StringSlicer {
  /**
   * Returns an array of items in the next slice,
   * continuing from the previous index (inclusive) to endIndex (exclusive).
   *
   * Each item [index, chars] indicates a run of present chars starting at index
   * (concatenated into a single string),
   * ending at either endIndex or a deleted index.
   *
   * The first call starts at index 0. To end at the end of the array,
   * set `endIndex = null`.
   *
   * @throws If endIndex is less than the previous index.
   */
  nextSlice(endIndex: number | null): Array<[index: number, chars: string]>;
}

/**
 * A sparse string, i.e., a sparse array whose values are single characters (UTF-16 code units).
 *
 * SparseString is functionally identical to a SparseArray with single-char values,
 * but it uses strings (e.g. `"abc"`) instead of arrays (e.g. `["a", "b", "c"]`) in its internal state
 * and serialized form.
 * This typically uses 2x less memory and results in smaller JSON,
 * though with a slight cost in mutation speed.
 *
 * @see SparseIndices To track a sparse array's present indices independent of its values.
 */
export class SparseString extends SparseItems<string> {
  /**
   * Returns a new, empty SparseString.
   */
  static new(): SparseString {
    return new this([]);
  }

  /**
   * Returns a new SparseString by deserializing the given state
   * from `SparseString.serialize`.
   *
   * @throws If the serialized form is invalid (see `SparseString.serialize`).
   */
  static deserialize(serialized: SerializedSparseString): SparseString {
    return new this(deserializeItems(serialized, stringItemer));
  }

  /**
   * Returns a new SparseString with the given entries.
   *
   * The entries must be in order by index.
   *
   * @see SparseString.entries
   */
  static fromEntries(
    entries: Iterable<[index: number, char: string]>
  ): SparseString {
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
        checkIndex(index);
        pairs.push({ index, item: char });
      }
      curLength = index + 1;
    }

    return new this(pairs);
  }

  /**
   * Returns a compact JSON-serializable representation of our state.
   *
   * The return value uses a run-length encoding: it alternates between
   * - strings of concatenated present chars (even indices), and
   * - numbers (odd indices), representing that number of deleted chars.
   *
   * For example, the sparse string `["a", "b", , , , "f", "g"]` serializes to `["ab", 3, "fg"]`.
   */
  serialize(): SerializedSparseString {
    return super.serialize();
  }

  /**
   * Returns whether the char at index is present, and if so, its value.
   *
   * @throws If `index < 0`. (It is okay for index to exceed `this.length`.)
   */
  hasGet(
    index: number
  ): [has: true, get: string] | [has: false, get: undefined] {
    const located = this._get(index);
    if (located === null) return [false, undefined];
    const [item, offset] = located;
    return [true, item[offset]];
  }

  /**
   * Returns the char at index, or undefined if not present.
   *
   * @throws If `index < 0`. (It is okay for index to exceed `this.length`.)
   */
  get(index: number): string | undefined {
    return this.hasGet(index)[1];
  }

  /**
   * Finds the index corresponding to the given count.
   *
   * That is, we advance through the string
   * until reaching the `count`-th present char, returning its index.
   * If the string ends before finding such a char, returns null.
   *
   * Invert with countAt.
   *
   * @param startIndex Index to start searching. If specified, only indices >= startIndex
   * contribute towards `count`.
   *
   * @throws If `count < 0` or `startIndex < 0`. (It is okay for startIndex to exceed `this.length`.)
   */
  findCount(
    count: number,
    startIndex?: number
  ): [index: number, char: string] | null {
    const located = this._findCount(count, startIndex);
    if (located === null) return null;
    const [index, item, offset] = located;
    return [index, item[offset]];
  }

  newSlicer(): StringSlicer {
    return super.newSlicer();
  }

  /**
   * Iterates over the present [index, char] pairs, in order.
   *
   * @see SparseText.fromEntries
   */
  *entries(): IterableIterator<[index: number, char: string]> {
    for (const pair of this.asPairs()) {
      for (let j = 0; j < pair.item.length; j++) {
        yield [pair.index + j, pair.item[j]];
      }
    }
  }

  /**
   * Sets chars starting at index.
   *
   * That is, sets all chars in the range [index, index + values.length) to the
   * given chars.
   *
   * @returns A sparse string of the previous values.
   * Index 0 in the returned string corresponds to `index` in this string.
   */
  set(index: number, chars: string): SparseString {
    return this._set(index, chars);
  }

  /**
   * Deletes count chars starting at index.
   *
   * That is, deletes all chars in the range [index, index + count).
   *
   * @returns A sparse string of the previous values.
   * Index 0 in the returned string corresponds to `index` in this array.
   */
  delete(index: number, count = 1): SparseString {
    return this._delete(index, count);
  }

  protected construct(pairs: Pair<string>[]): this {
    return new SparseString(pairs) as this;
  }

  protected itemer() {
    return stringItemer;
  }
}

const stringItemer: Itemer<string> = {
  isValid(allegedItem: unknown, emptyOkay: boolean): boolean {
    return (
      typeof allegedItem === "string" && (allegedItem.length !== 0 || emptyOkay)
    );
  },

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
