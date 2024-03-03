import { SparseArray, SparseIndices, SparseString } from "../../src";
import { Implementation } from "../util";
import { SparseArray as SparseArrayAlternating } from "./alternating/sparse_array";
import { ListPositionsImpl } from "./list_positions";
import { SparseArray as SparseArrayPairs } from "./pairs/sparse_array";
import { PlainArray2Impl, PlainArrayImpl } from "./plain_array";
import { SparseArrayDirect } from "./sparse_array_direct";
import {
  WrapSparseArrayLike,
  WrapSparseIndicesLike,
  WrapSparseStringLike,
} from "./wrappers";
import { WrapOldSparseArrayLike } from "./wrappers_old";

export const allImpls: Implementation[] = [
  WrapSparseArrayLike(SparseArray),
  WrapSparseStringLike(SparseString),
  WrapSparseIndicesLike(SparseIndices),
  WrapOldSparseArrayLike(SparseArrayDirect),
  WrapOldSparseArrayLike(SparseArrayPairs, "SparseArrayPairs"),
  WrapOldSparseArrayLike(SparseArrayAlternating, "SparseArrayAltern"),
  PlainArrayImpl,
  PlainArray2Impl,
  ListPositionsImpl,
];
