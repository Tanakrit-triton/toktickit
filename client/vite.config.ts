import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // The browser talks to the API same-origin: /api is forwarded to the
    // Express server, so the session cookie is sent and no CORS is needed
    // (docs/lab-03/api-spec.md section 1.3, DEC-04).
    proxy: { "/api": "http://localhost:3000" },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./tests/setup.ts",

    // The interaction-heavy Create Ticket tests drive a full form through
    // userEvent in jsdom and land near 5s, so the default timeout made them
    // pass or fail by machine load rather than by behaviour. Serialising the
    // files removes the CPU contention between them and the headroom below
    // removes the rest. A test that depends on machine speed is a flaky test.
    testTimeout: 15000,
    fileParallelism: false,

    // tests/ holds the Lab 1 suites; src/tests/ holds the Lab 2 suites
    // (tests.md sections 2.3 and 2.4). Both .test.ts and .test.tsx are collected
    // so non-component tests can live alongside component tests.
    include: [
      "tests/**/*.test.{ts,tsx}",
      "src/tests/**/*.test.{ts,tsx}",
    ],
  },
});
