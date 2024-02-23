import { SparseArray, SparseIndexes, SparseText } from "../src";
import { SparseArrayType } from "./util";

const arrTypesArray: SparseArrayType[] = [
  {
    name: "SparseArray",
    construct() {
      return SparseArray.empty<unknown>();
    },
    set(arr: object, index: number, ...values: unknown[]) {
      return (arr as SparseArray<unknown>).set(index, ...values);
    },
    delete(arr: object, index: number, count?: number) {
      return (arr as SparseArray<unknown>).delete(index, count);
    },
  },
  {
    name: "SparseText",
    construct() {
      return SparseText.empty();
    },
    set(arr: object, index: number, ...values: unknown[]) {
      return (arr as SparseText).set(index, values.join(""));
    },
    delete(arr: object, index: number, count?: number) {
      return (arr as SparseText).delete(index, count);
    },
  },
  {
    name: "SparseIndexes",
    construct() {
      return SparseIndexes.empty();
    },
    set(arr: object, index: number, ...values: unknown[]) {
      return (arr as SparseIndexes).set(index, values.length);
    },
    delete(arr: object, index: number, count?: number) {
      return (arr as SparseIndexes).delete(index, count);
    },
  },
  {
    name: "PlainArray",
    construct() {
      return [];
    },
    set(arr: object, index: number, ...values: unknown[]) {
      const arr2 = arr as unknown[];
      const replaced = arr2.slice(index, index + values.length);
      replaced.length = values.length;
      for (let i = 0; i < values.length; i++) {
        arr2[index + i] = values[i];
      }
      return replaced;
    },
    delete(arr: object, index: number, count = 1) {
      const arr2 = arr as unknown[];
      const replaced = arr2.slice(index, index + count);
      replaced.length = count;
      for (let i = 0; i < count; i++) {
        delete arr2[index + i];
      }
      return replaced;
    },
  },
  {
    name: "PlainArray2",
    construct() {
      return [];
    },
    set(arr: object, index: number, ...values: unknown[]) {
      const arr2 = arr as unknown[];
      // Add special case for appends (much faster).
      if (index === arr2.length) {
        arr2.push(...values);
        return new Array<unknown>(values.length);
      }
      const replaced = arr2.slice(index, index + values.length);
      replaced.length = values.length;
      for (let i = 0; i < values.length; i++) {
        arr2[index + i] = values[i];
      }
      return replaced;
    },
    delete(arr: object, index: number, count = 1) {
      const arr2 = arr as unknown[];
      const replaced = arr2.slice(index, index + count);
      replaced.length = count;
      for (let i = 0; i < count; i++) {
        delete arr2[index + i];
      }
      return replaced;
    },
  },
];

export const arrTypes = Object.fromEntries(
  arrTypesArray.map((arrType) => [arrType.name, arrType])
);
