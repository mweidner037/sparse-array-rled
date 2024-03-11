import { SparseArray, SparseIndices, SparseString } from "../../src";
import { Implementation } from "../util";
import { PlainArray2Impl, PlainArrayImpl } from "./plain_array";
import {
  WrapSparseArrayLike,
  WrapSparseIndicesLike,
  WrapSparseStringLike,
} from "./wrappers";

export const allImpls: Implementation[] = [
  WrapSparseArrayLike(SparseArray),
  WrapSparseStringLike(SparseString),
  WrapSparseIndicesLike(SparseIndices),
  PlainArrayImpl,
  PlainArray2Impl,
];
