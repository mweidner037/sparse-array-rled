import { allImpls } from "./impls";
import { textTrace } from "./traces";
import { timeOne } from "./util";

// Usage: npm run profile [implName = "SparseArray"]
// Wait for "Ready to profile", then profile with Node inspector and
// look for the _TRACE_LIST object's memory usage.

const implName = process.argv[2] ?? "SparseArray";
const impl = allImpls.find((impl) => impl.name === implName);
if (impl === undefined) {
  console.error("Invalid implName arg:", implName);
  console.error("Options:", JSON.stringify(allImpls.map((impl) => impl.name)));
  process.exit(1);
}

void (async function () {
  await timeOne(textTrace, impl, true);
})();
