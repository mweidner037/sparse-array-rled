import {
  PresentNode,
  Node,
  SparseItems,
  deserializeItems,
} from "./sparse_items";
import { checkIndex } from "./util";

// TODO: add embeds

/**
 * Serialized form of a SparseString.
 *
 * The serialized form uses a compact JSON representation with run-length encoded deletions. It alternates between:
 * - strings of concatenated present chars (even indices), and
 * - numbers (odd indices), representing that number of deleted chars.
 *
 * For example, the sparse string `["a", "b", , , , "f", "g"]` serializes to `["ab", 3, "fg"]`.
 *
 * Trivial entries (empty strings, 0s, & trailing deletions) are always omitted,
 * except that the 0th entry may be an empty string.
 * For example, the sparse string `[, , "x", "y"]` serializes to `["", 2, "xy"]`.
 */
export type SerializedSparseString = (string | number)[];

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
  // So list-positions can refer to unbound versions, we avoid using
  // "this" in static methods.
  /**
   * Returns a new, empty SparseString.
   */
  static new(): SparseString {
    return new SparseString(null);
  }

  /**
   * Returns a new SparseString by deserializing the given state
   * from `SparseString.serialize`.
   *
   * @throws If the serialized form is invalid (see `SparseString.serialize`).
   */
  static deserialize(serialized: SerializedSparseString): SparseString {
    return new SparseString(
      deserializeItems(serialized, (allegedItem) => {
        if (!(typeof allegedItem === "string")) {
          throw new Error(`Invalid item in serialized state: ${allegedItem}`);
        }
        return new StringNode(allegedItem);
      })
    );
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

    return new SparseString(pairs);
  }

  /**
   * Returns a compact JSON representation of our state.
   *
   * See SerializedSparseString for a description of the format.
   */
  serialize(): SerializedSparseString {
    return super.serialize();
  }

  /**
   * Returns the char at index, or undefined if not present.
   *
   * @throws If `index < 0`. (It is okay for index to exceed `this.length`.)
   */
  get(index: number): string | undefined {
    const located = this._get(index);
    if (located === null) return undefined;
    const [item, offset] = located;
    return item[offset];
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
    for (const [index, item] of this.items()) {
      for (let j = 0; j < item.length; j++) {
        yield [index + j, item[j]];
      }
    }
  }

  /**
   * Sets chars starting at index.
   *
   * That is, sets all values in the range [index, index + chars.length) to the
   * given chars.
   *
   * @returns A sparse string of the previous values.
   * Index 0 in the returned string corresponds to `index` in this string.
   */
  set(index: number, chars: string): SparseString {
    return this._set(index, chars);
  }

  protected construct(start: Node<string> | null): this {
    return new SparseString(start) as this;
  }

  protected newNode(item: string): PresentNode<string> {
    return new StringNode(item);
  }
}

class StringNode extends PresentNode<string> {
  constructor(public item: string) {
    super();
  }

  get length(): number {
    return this.item.length;
  }

  splitContent(index: number): PresentNode<string> {
    const after = new StringNode(this.item.slice(index));
    this.item = this.item.slice(0, index);
    return after;
  }

  tryMergeContent(other: PresentNode<string>): boolean {
    this.item += (other as StringNode).item;
    return true;
  }

  cloneItem(): string {
    return this.item;
  }
}
