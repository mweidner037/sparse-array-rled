import { Implementation } from "../util";
import { SparseArrayImpl, SparseTextImpl, SparseIndexesImpl } from "./library";
import { ListPositionsImpl } from "./list_positions";
import { PlainArrayImpl, PlainArray2Impl } from "./plain_array";
import { SparseArrayDirectImpl } from "./sparse_array_direct";

export const allImpls: Implementation[] = [
  SparseArrayImpl,
  SparseTextImpl,
  SparseIndexesImpl,
  SparseArrayDirectImpl,
  PlainArrayImpl,
  PlainArray2Impl,
  ListPositionsImpl,
];
