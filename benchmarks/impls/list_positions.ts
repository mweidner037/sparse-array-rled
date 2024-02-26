import {
  SparseItems,
  SparseItemsManager,
  arrayItemManager,
} from "list-positions/build/commonjs/internal/sparse_items";
import { Implementation } from "../util";

// The sparse array implementation from old versions of list-positions.
// I started the rle-sparse-array project in order to optimize this implementation,
// so it's good to measure the improvement since then.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const man = new SparseItemsManager(arrayItemManager<any>());

type ItemsWrapper = {
  items: SparseItems<unknown[]>;
};

export const ListPositionsImpl: Implementation = {
  name: "ListPositions",

  newEmpty(): object {
    return { items: [] };
  },

  isEmpty(arr: object) {
    const wrapper = arr as ItemsWrapper;
    return wrapper.items.length === 0;
  },

  set: function (arr: object, index: number, ...values: unknown[]): object {
    const wrapper = arr as ItemsWrapper;
    let replaced: SparseItems<unknown[]>;
    [wrapper.items, replaced] = man.set(wrapper.items, index, values);
    return replaced;
  },

  delete: function (arr: object, index: number, count = 1): object {
    const wrapper = arr as ItemsWrapper;
    let replaced: SparseItems<unknown[]>;
    [wrapper.items, replaced] = man.delete(wrapper.items, index, count);
    return replaced;
  },
};
