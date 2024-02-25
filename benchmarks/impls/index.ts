import { Implementation } from "../util";
import { SparseArrayImpl, SparseIndexesImpl, SparseTextImpl } from "./library";
import { ListPositionsImpl } from "./list_positions";
import { SparseArray as SparseArrayPairs } from "./pairs/sparse_array";
import { PlainArray2Impl, PlainArrayImpl } from "./plain_array";
import { SparseArrayDirect } from "./sparse_array_direct";
import { WrapSparseArrayLike } from "./wrappers";

export const allImpls: Implementation[] = [
  SparseArrayImpl,
  SparseTextImpl,
  SparseIndexesImpl,
  WrapSparseArrayLike(SparseArrayDirect),
  WrapSparseArrayLike(SparseArrayPairs, "SparseArrayPairs"),
  PlainArrayImpl,
  PlainArray2Impl,
  ListPositionsImpl,
];
