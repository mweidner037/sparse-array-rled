import { SparseArray, SparseIndexes, SparseText } from "../../src";
import {
  WrapSparseArrayLike,
  WrapSparseIndexesLike,
  WrapSparseTextLike,
} from "./wrappers";

// The implementations published in the library (SparseArray etc.).

export const SparseArrayImpl = WrapSparseArrayLike(SparseArray);
export const SparseTextImpl = WrapSparseTextLike(SparseText);
export const SparseIndexesImpl = WrapSparseIndexesLike(SparseIndexes);
