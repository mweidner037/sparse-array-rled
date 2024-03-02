import { Implementation } from "../util";

/**
 * Type of a class that looks like SparseArray.
 */
export interface SparseArrayLike {
  isEmpty(): boolean;
  set(index: number, ...values: unknown[]): SparseArrayLike;
  delete(index: number, count?: number): SparseArrayLike;
}

/**
 * Given a SparseArray-like class, returns the obvious Implementation.
 */
export function WrapSparseArrayLike(
  SparseArrayLikeClass: {
    name: string;
    "new"(): SparseArrayLike;
  },
  name?: string
): Implementation {
  return {
    name: name ?? SparseArrayLikeClass.name,
    newEmpty() {
      return SparseArrayLikeClass.new();
    },
    isEmpty(arr: object) {
      return (arr as SparseArrayLike).isEmpty();
    },
    set(arr: object, index: number, ...values: unknown[]) {
      return (arr as SparseArrayLike).set(index, ...values);
    },
    delete(arr: object, index: number, count?: number) {
      return (arr as SparseArrayLike).delete(index, count);
    },
  };
}

/**
 * Type of a class that looks like SparseText.
 */
export interface SparseTextLike {
  isEmpty(): boolean;
  set(index: number, chars: string): SparseTextLike;
  delete(index: number, count?: number): SparseTextLike;
}

/**
 * Given a SparseArray-like class, returns the obvious Implementation.
 */
export function WrapSparseTextLike(SparseTextLikeClass: {
  name: string;
  "new"(): SparseTextLike;
}): Implementation {
  return {
    name: SparseTextLikeClass.name,
    newEmpty() {
      return SparseTextLikeClass.new();
    },
    isEmpty(arr: object) {
      return (arr as SparseTextLike).isEmpty();
    },
    set(arr: object, index: number, ...values: unknown[]) {
      return (arr as SparseTextLike).set(index, values.join(""));
    },
    delete(arr: object, index: number, count?: number) {
      return (arr as SparseTextLike).delete(index, count);
    },
  };
}

/**
 * Type of a class that looks like SparseIndexes.
 */
export interface SparseIndexesLike {
  isEmpty(): boolean;
  add(index: number, count?: number): SparseIndexesLike;
  delete(index: number, count?: number): SparseIndexesLike;
}

/**
 * Given a SparseIndexes-like class, returns the obvious Implementation.
 */
export function WrapSparseIndexesLike(SparseIndexesLikeClass: {
  name: string;
  "new"(): SparseIndexesLike;
}): Implementation {
  return {
    name: SparseIndexesLikeClass.name,
    newEmpty() {
      return SparseIndexesLikeClass.new();
    },
    isEmpty(arr: object) {
      return (arr as SparseIndexesLike).isEmpty();
    },
    set(arr: object, index: number, ...values: unknown[]) {
      return (arr as SparseIndexesLike).add(index, values.length);
    },
    delete(arr: object, index: number, count?: number) {
      return (arr as SparseIndexesLike).delete(index, count);
    },
  };
}
