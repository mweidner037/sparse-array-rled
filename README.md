# sparse-array-rled

Sparse array with run-length encoded deletions

```bash
npm i --save sparse-array-rled
```

## About

This package provides `SparseArray<T>`, a sparse array with values of type `T`.

`SparseArray<T>` behaves similarly to an ordinary `Array<T>` used in sparse mode.
However, it is additionally optimized for the following tasks:

1.  Convert between the array and a compact JSON representation
    with run-length encoded deletions (`SerializedSparseArray<T>`). For example, the sparse array `["foo", "bar", , , , "X", "yy"]` serializes to `[["foo", "bar"], 3, ["X", "yy"]]`.
2.  Iterate over present values only.
3.  Convert between a count `c` and the `c`-th present entry.

For ordinary array tasks, `SparseArray` aims to have comparable
memory usage and acceptable speed relative to an ordinary `Array`. However, indexed accesses are slower
in principle, due to internal searches (similar to balanced-tree
collections).

For special cases, `SparseString` and `SparseIndices` implement the same functionality with additional optimizations:

- `SparseString` is functionally identical to a `SparseArray` with single-char values,
  but it uses strings (e.g. `"abc"`) instead of arrays (e.g. `["a", "b", "c"]`) in its internal state
  and serialized form.
  This typically uses less memory (2x in our benchmarks) and results in smaller JSON,
  though with a slight cost in mutation speed.
- `SparseIndices` is functionally identical to a `SparseArray`, except that
  it only stores which indices are present, not their associated values.
  This typically uses much less memory (4x in our benchmarks) and results in much smaller JSON.

### Example Use Cases

I use this package in collaborative situations, where individual users perform actions in order, but some of these actions may be deleted/undone/not-yet-received - causing sparsity.

<a id="collaborative-text-editing"></a>

1. **Collaborative text/list editing:** Group sequential insertions by a single user into "bunches", which map a bunch ID to its sequence of values. Later, some values may be deleted, making the sequence sparse.
   - This is how [list-positions](https://github.com/mweidner037/list-positions#readme) represents the state of a `List`: as a `Map<bunchID, SparseArray>`.
2. **General collaboration or peer-to-peer networking:** Track which messages you've received from another user/peer using a `SparseIndices`. Typically, this will be a single number ("all messages 0 through n-1"), but dropped/reverted messages could make the indices sparse.
   - A `Map<peerID, SparseIndices>` generalizes vector clocks and provides a space-optimized alternative to dotted vector clocks, described [here](https://mattweidner.com/2023/09/26/crdt-survey-3.html#tracking-operations-vector-clocks-1).

## Usage

Create and mutate a sparse array:

```ts
import { SparseArray } from "sparse-array-rled";

const arr = SparseArray.new<string>();
arr.set(0, "a");
arr.set(1, "b");
arr.set(1, "c");
arr.set(4, "d");
arr.delete(0);

console.log([...arr.entries()]); // Prints [[1, 'c'], [4, 'd']]
```

Basic queries:

```ts
arr.get(1); // 'c'
arr.get(4); // 'd'
arr.get(0); // undefined
arr.get(10000); // undefined

arr.has(1); // true
arr.has(0); // false

// Length is the last present index + 1 (or 0 if empty).
console.log(arr.length); // Prints 5
// Note: All methods accept index arguments `>= this.length`, acting as if
// the array ends with infinitely many holes.
```

Queries that only consider present values:

```ts
const arr2 = SparseArray.new<string>();
arr2.set(0, "e");
arr2.set(1, "f");
arr2.set(5, "g");
arr2.set(6, "h");

// Total present values.
arr2.count(); // 4

// Present values within a given slice.
arr2.countBetween(0, 4); // 2

// Present values up to but excluding a given index, plus whether that index is present.
arr2.countAt(4); // 2
arr2.countAt(6); // 3

// Find the c-th present index, or -1 if c is too large.
arr2.indexOfCount(1); // 1
arr2.indexOfCount(2); // 5
arr2.indexOfCount(5); // -1
arr2.indexOfCount(1000); // -1
```

Bulk mutations are specially optimized:

```ts
const arr3 = SparseArray.new<string>();

// Set multiple values (the rest parameters).
arr3.set(0, "m", "n", "o", "p", "q");
// Delete multiple values (the second arg, which says how many to delete -
// *not* the index to end at.).
arr3.delete(3, 2);

console.log([...arr3.entries()]); // Prints [[0, 'm'], [1, 'n'], [2, 'o']]
```

Mutations return the previous values as a `SparseArray`:

```ts
// arr3 starts as above: entries [[0, 'm'], [1, 'n'], [2, 'o']].
const previous = arr3.delete(1, 5);
console.log([...previous.entries()]); // Prints [[0, 'n'], [1, 'o']]
console.log(previous.length); // Prints 2 (last present index + 1) - not necessarily the delete count.
```

### Serialized form

The serialized form, `SerializedSparseArray<T>`, uses run-length encoded deletions. Specifically, it is an array that alternates between:

- arrays of present values, and
- numbers, representing that number of deleted values.

For example:

```ts
const arr4 = SparseArray.new<string>();
arr4.set(0, "foo");
arr4.set(1, "bar");
arr4.set(5, "X");
arr4.set(6, "yy");

console.log(arr4.serialize()); // Prints [['foo', 'bar'], 3, ['X', 'yy']]
```

Deserialize with `const arr3 = SparseArray.fromSerialized(serialized)`.

`arr.toString()` returns the JSON-encoded serialized form.

### Iterators

`entries()` and `keys()` have the same signature as `Array`, but they do **not** visit empty slots (as seen in the code snippets above). `items()` is an optimized alternative that iterates over runs of present values.

`newSlicer()` is an additional iterator that lets you iterate through the array one "slice" at a time.

Iterators (`entries`, `keys`, `newSlicer`) are invalidated by concurrent mutations, unlike the built-in `Array` iterators (but like most Java Collections). We do **not** attempt to detect concurrent mutations and throw errors.

### SparseString and SparseIndices

`SparseString` and `SparseIndices` have essentially the same API as `SparseArray<T>`, except that `values: T[]` is replaced by `chars: string` for `SparseString` and `count: number` for `SparseIndices`.

## Internals

Internally, the state of a `SparseArray<T>` as stored as a singly-linked list of nodes, where each node represents either an array of present values or a number of deleted values. The nodes are normalized so that they are never empty and adjacent nodes always have different types. In other words, a `SparseArray<T>`'s internal state is a singly-linked list representation of its serialized state.

To reduce repetition and code size, most functionality for the three exported classes (`SparseArray`, `SparseString`, `SparseIndices`) is inherited from a common superclass, `SparseItems<I>`. It is a template class that defines mutations and queries in terms of items of type `I`, which are the content of present nodes: `T[]` for `SparseArray`, `string` for `SparseString`, `number` for `SparseIndices`.

## Performance

To benchmark the library, I applied the operations corresponding to a collaborative text-editing trace (Martin Kleppmann's [automerge-perf](https://github.com/automerge/automerge-perf)), simulating this library's usage by the [list-positions](https://github.com/mweidner037/list-positions#readme) library as described [above](#collaborative-text-editing). The trace uses 3301 sparse arrays with average final length 40.4 (max final length 7352). It is 260k ops long, with 182k sets and 77k deletes, and the ending state has 105k chars.

In addition to this library's classes, the benchmarks test two ways of using a plain `Array<string>` in sparse mode (see [benchmarks/impls/plain_array.ts](./benchmarks/impls/plain_array.ts)).

Results:

| Implementation | Total time (ms) | Ending memory usage (MB) |
| -------------- | --------------- | ------------------------ |
| SparseArray    | 59.3 +- 5.4     | 1.98                     |
| SparseString   | 67.5 +- 9.5     | 1.13                     |
| SparseIndices  | 53.2 +- 1.5     | 0.48                     |
| PlainArray     | 89.3 +- 1.1     | 2.02                     |
| PlainArray2    | 60.7 +- 2.8     | 1.90                     |

For additional microbenchmarks, see [benchmark_results.txt](./benchmark_results.txt), which reports the time to perform 1,000,000 operations of various types (implemented in [benchmarks/traces.ts](./benchmarks/traces.ts)).
