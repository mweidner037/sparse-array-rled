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
];

export const arrTypes = Object.fromEntries(
  arrTypesArray.map((arrType) => [arrType.name, arrType])
);
