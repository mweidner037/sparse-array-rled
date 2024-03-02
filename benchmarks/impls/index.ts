import { SparseArray, SparseIndexes, SparseText } from "../../src";
import { Implementation } from "../util";
import { SparseArray as SparseArrayAlternating } from "./alternating/sparse_array";
import { ListPositionsImpl } from "./list_positions";
import { SparseArray as SparseArrayPairs } from "./pairs/sparse_array";
import { PlainArray2Impl, PlainArrayImpl } from "./plain_array";
import { SparseArrayDirect } from "./sparse_array_direct";
import {
  WrapSparseArrayLike,
  WrapSparseIndexesLike,
  WrapSparseTextLike,
} from "./wrappers";
import { WrapOldSparseArrayLike } from "./wrappers_old";

export const allImpls: Implementation[] = [
  WrapSparseArrayLike(SparseArray),
  WrapSparseTextLike(SparseText),
  WrapSparseIndexesLike(SparseIndexes),
  WrapOldSparseArrayLike(SparseArrayDirect),
  WrapOldSparseArrayLike(SparseArrayPairs, "SparseArrayPairs"),
  WrapOldSparseArrayLike(SparseArrayAlternating, "SparseArrayAltern"),
  PlainArrayImpl,
  PlainArray2Impl,
  ListPositionsImpl,
];
