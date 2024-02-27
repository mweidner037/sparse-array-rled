import { Implementation } from "../util";

export const PlainArrayImpl: Implementation = {
  name: "PlainArray",
  newEmpty() {
    return [];
  },
  isEmpty(arr: object) {
    // TODO: also if arr is all holes.
    const arr2 = arr as unknown[];
    return arr2.length === 0;
  },
  set(arr: object, index: number, ...values: unknown[]) {
    const arr2 = arr as unknown[];
    const replaced = arr2.slice(index, index + values.length);
    replaced.length = values.length;
    for (let i = 0; i < values.length; i++) {
      arr2[index + i] = values[i];
    }
    return replaced;
  },
  delete(arr: object, index: number, count = 1) {
    const arr2 = arr as unknown[];
    const replaced = arr2.slice(index, index + count);
    replaced.length = count;
    for (let i = 0; i < count; i++) {
      delete arr2[index + i];
    }
    return replaced;
  },
};

// PlainArray1Impl with some attempted optimizations.
export const PlainArray2Impl: Implementation = {
  name: "PlainArray2",
  newEmpty() {
    return [];
  },
  isEmpty(arr: object) {
    // TODO: also if arr is all holes.
    const arr2 = arr as unknown[];
    return arr2.length === 0;
  },
  set(arr: object, index: number, ...values: unknown[]) {
    const arr2 = arr as unknown[];
    // Add special case for appends (much faster).
    if (index === arr2.length) {
      arr2.push(...values);
      return new Array<unknown>(values.length);
    }
    const replaced = arr2.slice(index, index + values.length);
    replaced.length = values.length;
    for (let i = 0; i < values.length; i++) {
      arr2[index + i] = values[i];
    }
    return replaced;
  },
  delete(arr: object, index: number, count = 1) {
    const arr2 = arr as unknown[];

    if (index >= arr2.length) return new Array<unknown>(count);

    const replaced = arr2.slice(index, index + count);
    replaced.length = count;
    // Add special case for shortening (faster for backspace).
    if (index + count >= arr2.length) arr2.length = index;
    else {
      for (let i = 0; i < count; i++) {
        delete arr2[index + i];
      }
    }
    return replaced;
  },
};
