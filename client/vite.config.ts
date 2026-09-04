import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
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
    include: ["tests/**/*.test.tsx"],
  },
});
