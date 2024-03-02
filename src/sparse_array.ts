import { Pair, SparseItems } from "./sparse_items";

/**
 * Run-length encoding. Even indexes are T[], odd indexes are delete counts.
 */
export type SerializedSparseArray<T> = Array<T[] | number>;

export class SparseArray<T> extends SparseItems<T[]> {
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

  clone(): SparseArray<T> {
    // Deep copy.
    if (this.normalItem) {
      return this.construct(
        [{ index: 0, item: this.normalItem.slice() }],
        this.length
      );
    }

    const pairsCopy: Pair<T[]>[] = [];
    for (const pair of this.pairs) {
      pairsCopy.push({ index: pair.index, item: pair.item.slice() });
    }
    return this.construct(pairsCopy, this.length);
  }

  serialize(): SerializedSparseArray<T> {
    if (this.length === 0) return [];

    const savedState: SerializedSparseArray<T> = [];
    if (this.normalItem !== null) {
      // Maybe [].
      savedState.push(this.normalItem.slice());
      if (this.length > this.normalItem.length) {
        savedState.push(this.length - this.normalItem.length);
      }
    } else {
      if (this.pairs.length === 0) {
        savedState.push([], this.length);
      } else {
        if (this.pairs[0].index !== 0) savedState.push([], this.pairs[0].index);
        savedState.push(this.pairs[0].item.slice());
        let lastEnd = this.pairs[0].index + this.pairs[0].item.length;
        for (let i = 1; i < this.pairs.length; i++) {
          savedState.push(
            this.pairs[i].index - lastEnd,
            this.pairs[i].item.slice()
          );
          lastEnd = this.pairs[i].index + this.pairs[i].item.length;
        }
        if (this.length > lastEnd) savedState.push(this.length - lastEnd);
      }
    }
    return savedState;
  }

  hasGet(index: number): [has: true, get: T] | [has: false, get: undefined] {
    if (index < 0) throw new Error(`Invalid index: ${index}`);

    // TODO: deduplicate with other classes.
    if (this.normalItem !== null) {
      if (index < this.normalItem.length) return [true, this.normalItem[index]];
      else return [false, undefined];
    }

    // OPT: binary search in long lists?
    // OPT: test forward vs backward.
    for (let i = 0; i < this.pairs.length; i++) {
      const segIndex = this.pairs[i].index;
      if (index < segIndex) return [false, undefined];
      const segment = this.pairs[i].item;
      if (index < segIndex + segment.length) {
        return [true, segment[index - segIndex]];
      }
    }
    return [false, undefined];
  }

  has(index: number): boolean {
    return this.hasGet(index)[0];
  }

  get(index: number): T | undefined {
    return this.hasGet(index)[1];
  }

  count(): number {
    if (this.normalItem !== null) return this.normalItem.length;

    let count = 0;
    for (const pair of this.pairs) count += pair.item.length;
    return count;
  }

  countBetween(startIndex: number, endIndex: number): number {
    if (this.normalItem !== null) {
      return (
        Math.min(endIndex, this.normalItem.length) -
        Math.min(startIndex, this.normalItem.length)
      );
    }

    let count = 0;
    for (const pair of this.pairs) {
      if (pair.index >= endIndex) break;
      if (pair.index + pair.item.length >= startIndex) {
        count +=
          Math.min(endIndex, pair.index + pair.item.length) -
          Math.max(startIndex, pair.index);
      }
    }
    return count;
  }

  findPresent(
    count: number,
    startIndex = 0
  ): [index: number, value: T] | [index: -1, value: undefined] {
    if (this.normalItem !== null) {
      const index = startIndex + count;
      return index < this.normalItem.length
        ? [index, this.normalItem[index]]
        : [-1, undefined];
    }

    let countRemaining = count;
    let i = 0;
    for (; i < this.pairs.length; i++) {
      if (this.pairs[i].index + this.pairs[i].item.length >= startIndex) {
        // Adjust countRemaining as if startIndex was this.pairs[i].index.
        countRemaining += Math.max(0, startIndex - this.pairs[i].index);
        break;
      }
    }

    // We pretend that startIndex = this.pairs[i].index.
    for (; i < this.pairs.length; i++) {
      const itemLength = this.pairs[i].item.length;
      if (countRemaining < itemLength) {
        return [
          this.pairs[i].index + countRemaining,
          this.pairs[i].item[countRemaining],
        ];
      }
      countRemaining -= itemLength;
    }
    return [-1, undefined];
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

  toString(): string {
    return JSON.stringify(this.serialize());
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

  protected itemNewEmpty(): T[] {
    return [];
  }

  protected itemLength(item: T[]): number {
    return item.length;
  }

  protected itemMerge(a: T[], b: T[]): T[] {
    a.push(...b);
    return a;
  }

  protected itemSlice(item: T[], start: number, end?: number | undefined): T[] {
    return item.slice(start, end);
  }

  protected itemUpdate(item: T[], start: number, replace: T[]): T[] {
    if (start === item.length) item.push(...replace);
    else {
      for (let i = 0; i < replace.length; i++) item[start + i] = replace[i];
    }
    return item;
  }

  protected itemShorten(item: T[], newLength: number): T[] {
    item.length = newLength;
    return item;
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
