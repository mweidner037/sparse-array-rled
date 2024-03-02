import { Implementation } from "../util";

/**
 * Type of a class that looks like SparseArray.
 */
export interface OldSparseArrayLike {
  isEmpty(): boolean;
  set(index: number, ...values: unknown[]): OldSparseArrayLike;
  delete(index: number, count?: number): OldSparseArrayLike;
}

/**
 * Given a SparseArray-like class, returns the obvious Implementation.
 */
export function WrapOldSparseArrayLike(
  SparseArrayLikeClass: {
    name: string;
    empty(): OldSparseArrayLike;
  },
  name?: string
): Implementation {
  return {
    name: name ?? SparseArrayLikeClass.name,
    newEmpty() {
      return SparseArrayLikeClass.empty();
    },
    isEmpty(arr: object) {
      return (arr as OldSparseArrayLike).isEmpty();
    },
    set(arr: object, index: number, ...values: unknown[]) {
      return (arr as OldSparseArrayLike).set(index, ...values);
    },
    delete(arr: object, index: number, count?: number) {
      return (arr as OldSparseArrayLike).delete(index, count);
    },
  };
}

/**
 * Type of a class that looks like SparseText.
 */
export interface OldSparseTextLike {
  isEmpty(): boolean;
  set(index: number, chars: string): OldSparseTextLike;
  delete(index: number, count?: number): OldSparseTextLike;
}

/**
 * Given a SparseArray-like class, returns the obvious Implementation.
 */
export function WrapOldSparseTextLike(SparseTextLikeClass: {
  name: string;
  empty(): OldSparseTextLike;
}): Implementation {
  return {
    name: SparseTextLikeClass.name,
    newEmpty() {
      return SparseTextLikeClass.empty();
    },
    isEmpty(arr: object) {
      return (arr as OldSparseTextLike).isEmpty();
    },
    set(arr: object, index: number, ...values: unknown[]) {
      return (arr as OldSparseTextLike).set(index, values.join(""));
    },
    delete(arr: object, index: number, count?: number) {
      return (arr as OldSparseTextLike).delete(index, count);
    },
  };
}

/**
 * Type of a class that looks like SparseIndexes.
 */
export interface OldSparseIndexesLike {
  isEmpty(): boolean;
  set(index: number, count?: number): OldSparseIndexesLike;
  delete(index: number, count?: number): OldSparseIndexesLike;
}

/**
 * Given a SparseIndexes-like class, returns the obvious Implementation.
 */
export function WrapOldSparseIndexesLike(SparseIndexesLikeClass: {
  name: string;
  empty(): OldSparseIndexesLike;
}): Implementation {
  return {
    name: SparseIndexesLikeClass.name,
    newEmpty() {
      return SparseIndexesLikeClass.empty();
    },
    isEmpty(arr: object) {
      return (arr as OldSparseIndexesLike).isEmpty();
    },
    set(arr: object, index: number, ...values: unknown[]) {
      return (arr as OldSparseIndexesLike).set(index, values.length);
    },
    delete(arr: object, index: number, count?: number) {
      return (arr as OldSparseIndexesLike).delete(index, count);
    },
  };
}
