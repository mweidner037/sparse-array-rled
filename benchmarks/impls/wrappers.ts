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
 * Type of a class that looks like SparseString.
 */
export interface SparseStringLike {
  isEmpty(): boolean;
  set(index: number, chars: string): SparseStringLike;
  delete(index: number, count?: number): SparseStringLike;
}

/**
 * Given a SparseArray-like class, returns the obvious Implementation.
 */
export function WrapSparseStringLike(SparseStringLikeClass: {
  name: string;
  "new"(): SparseStringLike;
}): Implementation {
  return {
    name: SparseStringLikeClass.name,
    newEmpty() {
      return SparseStringLikeClass.new();
    },
    isEmpty(arr: object) {
      return (arr as SparseStringLike).isEmpty();
    },
    set(arr: object, index: number, ...values: unknown[]) {
      return (arr as SparseStringLike).set(index, values.join(""));
    },
    delete(arr: object, index: number, count?: number) {
      return (arr as SparseStringLike).delete(index, count);
    },
  };
}

/**
 * Type of a class that looks like SparseIndices.
 */
export interface SparseIndicesLike {
  isEmpty(): boolean;
  set(index: number, count?: number): SparseIndicesLike;
  delete(index: number, count?: number): SparseIndicesLike;
}

/**
 * Given a SparseIndices-like class, returns the obvious Implementation.
 */
export function WrapSparseIndicesLike(SparseIndicesLikeClass: {
  name: string;
  "new"(): SparseIndicesLike;
}): Implementation {
  return {
    name: SparseIndicesLikeClass.name,
    newEmpty() {
      return SparseIndicesLikeClass.new();
    },
    isEmpty(arr: object) {
      return (arr as SparseIndicesLike).isEmpty();
    },
    set(arr: object, index: number, ...values: unknown[]) {
      return (arr as SparseIndicesLike).set(index, values.length);
    },
    delete(arr: object, index: number, count?: number) {
      return (arr as SparseIndicesLike).delete(index, count);
    },
  };
}
