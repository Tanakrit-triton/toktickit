import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],

    // Run test files one at a time.
    //
    // The API suites share one database and some of them create fixture rows,
    // so files running concurrently can observe each other's fixtures. The
    // concrete case: reference-data.api.test.ts creates an inactive Category
    // to prove it is excluded (API-38), while the Lab 1 categories test asserts
    // that the unfiltered GET /api/categories returns exactly four rows. Those
    // two overlapping is a race, and a race is a flaky test.
    //
    // Serialising is the fix that keeps the Lab 1 route unchanged as A-04
    // requires. The alternative -- filtering isActive in the Lab 1 route --
    // would silently alter behaviour the specification promises to preserve.
    fileParallelism: false,
  },
});
