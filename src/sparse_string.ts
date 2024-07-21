import {
  PresentNode,
  Node,
  SparseItems,
  deserializeItems,
} from "./sparse_items";

/**
 * Serialized form of a SparseString.
 *
 * The serialized form uses a compact JSON representation with run-length encoded deletions. It consists of:
 * - strings of concatenated present chars,
 * - embedded objects of type E, and
 * - numbers, representing that number of deleted chars.
 *
 * For example, the sparse string `["a", "b", , , , "f", "g"]` serializes to `["ab", 3, "fg"]`.
 *
 * Trivial entries (empty strings, 0s, & trailing deletions) are always omitted.
 */
export type SerializedSparseString<E extends object | never = never> = (
  | string
  | E
  | number
)[];

/**
 * Iterator-like object returned by SparseText.newSlicer().
 *
 * Call nextSlice repeatedly to enumerate the slices in order.
 */
export interface StringSlicer<E extends object | never = never> {
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
  nextSlice(endIndex: number | null): Array<[index: number, chars: string | E]>;
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
// TODO: default to never, once we check all usages.
// TODO: test that never does what you expect for consumers.
export class SparseString<E extends object | never = never> extends SparseItems<
  string | E
> {
  // So list-positions can refer to unbound versions, we avoid using
  // "this" in static methods.
  /**
   * Returns a new, empty SparseString.
   */
  static new<E extends object | never = never>(): SparseString<E> {
    return new SparseString(null);
  }

  /**
   * Returns a new SparseString by deserializing the given state
   * from `SparseString.serialize`.
   *
   * @throws If the serialized form is invalid (see `SparseString.serialize`).
   */
  static deserialize<E extends object | never = never>(
    serialized: SerializedSparseString<E>
  ): SparseString<E> {
    return new SparseString<E>(
      deserializeItems<string | E>(serialized, (allegedItem) => {
        if (typeof allegedItem === "string") {
          return new StringNode(allegedItem);
        } else if (typeof allegedItem === "object" && allegedItem !== null) {
          // We exclude null as it is not assignable to TypeScript's `object` type.
          return new EmbedNode(allegedItem as E);
        } else {
          throw new Error(`Invalid item in serialized state: ${allegedItem}`);
        }
      })
    );
  }

  // /**
  //  * Returns a new SparseString with the given entries.
  //  *
  //  * The entries must be in order by index.
  //  *
  //  * @see SparseString.entries
  //  */
  // static fromEntries<E extends object | never = never>(
  //   entries: Iterable<[index: number, char: string | E]>
  // ): SparseString<E> {
  //   const pairs: Pair<string>[] = [];
  //   let curLength = 0;

  //   for (const [index, char] of entries) {
  //     if (index < curLength) {
  //       throw new Error(
  //         `Out-of-order index in entries: ${index}, previous was ${
  //           curLength - 1
  //         }`
  //       );
  //     }

  //     if (index === curLength && pairs.length !== 0) {
  //       pairs[pairs.length - 1].item += char;
  //     } else {
  //       checkIndex(index);
  //       pairs.push({ index, item: char });
  //     }
  //     curLength = index + 1;
  //   }

  //   return new SparseString(pairs);
  // }

  /**
   * Returns a compact JSON representation of our state.
   *
   * See SerializedSparseString for a description of the format.
   */
  serialize(): SerializedSparseString<E> {
    return super.serialize();
  }

  /**
   * Returns the char at index, or undefined if not present.
   *
   * @throws If `index < 0`. (It is okay for index to exceed `this.length`.)
   */
  get(index: number): string | E | undefined {
    const located = this._get(index);
    if (located === null) return undefined;
    const [item, offset] = located;
    if (typeof item === "string") return item[offset];
    else return item;
  }

  newSlicer(): StringSlicer<E> {
    return super.newSlicer();
  }

  /**
   * Iterates over the present [index, char] pairs, in order.
   *
   * @see SparseText.fromEntries
   */
  *entries(): IterableIterator<[index: number, char: string | E]> {
    for (const [index, item] of this.items()) {
      if (typeof item === "string") {
        for (let j = 0; j < item.length; j++) {
          yield [index + j, item[j]];
        }
      } else yield [index, item];
    }
  }

  /**
   * Iterates over the present items, in order.
   *
   * Each item [index, values] indicates either a run of present chars or a single embed,
   * starting at index and ending at either a deleted value or a value of the opposite type
   * (char vs embed).
   */
  items(): IterableIterator<[index: number, values: string | E]> {
    return super.items();
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
  set(index: number, chars: string): SparseString<E>;
  set(index: number, value: E): SparseString<E>;
  set(index: number, values: string | E) {
    return this._set(index, values);
  }

  protected construct(start: Node<string> | null): this {
    return new SparseString(start) as this;
  }

  protected newNode(item: string | E): PresentNode<string | E> {
    if (typeof item === "string") return new StringNode(item);
    else return new EmbedNode(item);
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
    if (other instanceof StringNode) {
      this.item += other.item;
      return true;
    }
    return false;
  }

  sliceItem(start?: number, end?: number): string {
    return this.item.slice(start, end);
  }
}

class EmbedNode<E extends object | never> extends PresentNode<E> {
  constructor(public item: E) {
    super();
    if (!(typeof item === "object" && item !== null)) {
      throw new Error(`Embeds must be objects; received ${item}`);
    }
  }

  get length(): number {
    return 1;
  }

  splitContent(): PresentNode<E> {
    throw new Error("Internal error");
  }

  tryMergeContent(): boolean {
    return false;
  }

  sliceItem(): E {
    // We don't deep-clone values, only their wrapper items.
    return this.item;
  }
}
