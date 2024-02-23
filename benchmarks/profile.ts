import { arrTypes } from "./array_types";
import { martinTrace } from "./traces";
import { setProfile, timeOne } from "./util";

// Usage: npm run profile [arrType = "SparseArray"]

const arrTypeName = process.argv[2] ?? "SparseArray";
const arrType = arrTypes[arrTypeName];
if (arrType === undefined) {
  console.error("Invalid arrType arg:", arrTypeName);
  process.exit(1);
}

setProfile(true);

void (async function () {
  await timeOne(martinTrace, arrType);
})();
