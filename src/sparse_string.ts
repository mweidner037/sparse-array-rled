import {
  PresentNode,
  Node,
  SparseItems,
  deserializeItems,
} from "./sparse_items";

/**
 * Serialized form of a `SparseString<E>`.
 *
 * The serialized form uses a compact JSON representation with run-length encoded deletions. It consists of:
 * - strings of concatenated present chars,
 * - embedded objects of type `E`, and
 * - numbers, representing that number of deleted indices.
 *
 * For example, the sparse string `["a", "b", , , , "f", "g"]` serializes to `["ab", 3, "fg"]`.
 *
 * As an example with an embed, the sparse string `["h", "i", " ", { type: "image", ... }, "!"]`
 * serializes to `["hi ", { type: "image", ... }, "!"]`.
 *
 * Trivial entries (empty strings, 0s, & trailing deletions) are always omitted.
 * For example, the sparse string `[, , "x", "y"]` serializes to `[2, "xy"]`.
 */
export type SerializedSparseString<E extends object | never = never> = (
  | string
  | E
  | number
)[];

/**
 * Iterator-like object returned by SparseString.newSlicer().
 *
 * Call nextSlice repeatedly to enumerate the slices in order.
 */
export interface StringSlicer<E extends object | never = never> {
  /**
   * Returns an array of items in the next slice,
   * continuing from the previous index (inclusive) to endIndex (exclusive).
   *
   * Each item [index, charsOrEmbed] indicates either a run of present chars or a single embed,
   * starting at index and ending at either endIndex, a deleted index, an embed, or a char following an embed.
   *
   * The first call starts at index 0. To end at the end of the array,
   * set `endIndex = null`.
   *
   * @throws If endIndex is less than the previous index.
   */
  nextSlice(
    endIndex: number | null
  ): Array<[index: number, charsOrEmbed: string | E]>;
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
 * The sparse string may also contain embedded objects of type `E`.
 * Each embed takes the place of a single character. You can use embeds to represent
 * non-text content, like images and videos, that may appear inline in a text document.
 * If you do not specify the generic type `E`, it defaults to `never`, i.e., no embeds are allowed.
 *
 * @see SparseIndices To track a sparse array's present indices independent of its values.
 * @typeParam E - The type of embeds, or `never` (no embeds allowed) if not specified.
 * Embeds must be non-null objects.
 */
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
   * Note that we do **not** check whether the embeds match type `E`.
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
          throw new Error(`Invalid entry in serialized state: ${allegedItem}`);
        }
      })
    );
  }

  /**
   * Returns a compact JSON representation of our state.
   *
   * See SerializedSparseString for a description of the format.
   */
  serialize(): SerializedSparseString<E> {
    return super.serialize();
  }

  /**
   * Returns the char (or embed) at index, or undefined if not present.
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
   * Iterates over the present [index, char (or embed)] pairs, in order.
   */
  *entries(): IterableIterator<[index: number, charOrEmbed: string | E]> {
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
   * Each item [index, charsOrEmbed] indicates either a run of present chars or a single embed,
   * starting at index and ending at either a deleted index, an embed, or a char following an embed.
   */
  items(): IterableIterator<[index: number, charsOrEmbed: string | E]> {
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
  /**
   * Sets the value at index to the given embed.
   *
   * @returns A sparse string of the previous value.
   * Index 0 in the returned string corresponds to `index` in this string.
   */
  set(index: number, embed: E): SparseString<E>;
  set(index: number, item: string | E) {
    return this._set(index, item);
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
    // We don't deep-clone embeds, only their wrapper items.
    return this.item;
  }
}
