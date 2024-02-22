import { SparseIndexes, SparseText } from "../src";
import { ISparseArray } from "./util";

export class SparseTextWrapper<T> implements ISparseArray<T> {
  constructor(readonly text = SparseText.empty()) {}

  set(index: number, ...values: T[]): ISparseArray<T> {
    return new SparseTextWrapper(this.text.set(index, values.join("")));
  }

  delete(index: number, count = 1): ISparseArray<T> {
    return new SparseTextWrapper(this.text.delete(index, count));
  }
}

export class SparseIndexesWrapper<T> implements ISparseArray<T> {
  constructor(readonly indexes = SparseIndexes.empty()) {}

  set(index: number, ...values: T[]): ISparseArray<T> {
    return new SparseIndexesWrapper(this.indexes.set(index, values.length));
  }

  delete(index: number, count = 1): ISparseArray<T> {
    return new SparseIndexesWrapper(this.indexes.delete(index, count));
  }
}
