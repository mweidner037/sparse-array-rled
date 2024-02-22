import {
  SparseItems,
  SparseItemsManager,
  arrayItemManager,
} from "list-positions/build/commonjs/internal/sparse_items";
import { ISparseArray } from "./util";

const man = new SparseItemsManager(arrayItemManager<any>());

export class ListPositionsSparseArray<T> implements ISparseArray<T> {
  constructor(private items: SparseItems<T[]> = []) {}

  set(index: number, ...values: T[]): ISparseArray<T> {
    let replaced: SparseItems<T[]>;
    [this.items, replaced] = man.set(this.items, index, values);
    return new ListPositionsSparseArray(replaced);
  }

  delete(index: number, count = 0): ISparseArray<T> {
    let replaced: SparseItems<T[]>;
    [this.items, replaced] = man.delete(this.items, index, count);
    return new ListPositionsSparseArray(replaced);
  }
}
