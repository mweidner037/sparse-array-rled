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
 * Type of a class that looks like SparseString.
 */
export interface OldSparseStringLike {
  isEmpty(): boolean;
  set(index: number, chars: string): OldSparseStringLike;
  delete(index: number, count?: number): OldSparseStringLike;
}

/**
 * Given a SparseArray-like class, returns the obvious Implementation.
 */
export function WrapOldSparseStringLike(SparseStringLikeClass: {
  name: string;
  empty(): OldSparseStringLike;
}): Implementation {
  return {
    name: SparseStringLikeClass.name,
    newEmpty() {
      return SparseStringLikeClass.empty();
    },
    isEmpty(arr: object) {
      return (arr as OldSparseStringLike).isEmpty();
    },
    set(arr: object, index: number, ...values: unknown[]) {
      return (arr as OldSparseStringLike).set(index, values.join(""));
    },
    delete(arr: object, index: number, count?: number) {
      return (arr as OldSparseStringLike).delete(index, count);
    },
  };
}

/**
 * Type of a class that looks like SparseIndices.
 */
export interface OldSparseIndicesLike {
  isEmpty(): boolean;
  set(index: number, count?: number): OldSparseIndicesLike;
  delete(index: number, count?: number): OldSparseIndicesLike;
}

/**
 * Given a SparseIndices-like class, returns the obvious Implementation.
 */
export function WrapOldSparseIndicesLike(SparseIndicesLikeClass: {
  name: string;
  empty(): OldSparseIndicesLike;
}): Implementation {
  return {
    name: SparseIndicesLikeClass.name,
    newEmpty() {
      return SparseIndicesLikeClass.empty();
    },
    isEmpty(arr: object) {
      return (arr as OldSparseIndicesLike).isEmpty();
    },
    set(arr: object, index: number, ...values: unknown[]) {
      return (arr as OldSparseIndicesLike).set(index, values.length);
    },
    delete(arr: object, index: number, count?: number) {
      return (arr as OldSparseIndicesLike).delete(index, count);
    },
  };
}
