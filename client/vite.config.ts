import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./tests/setup.ts",
    // tests/ holds the Lab 1 suites; src/tests/ holds the Lab 2 suites
    // (tests.md sections 2.3 and 2.4). Both .test.ts and .test.tsx are collected
    // so non-component tests can live alongside component tests.
    include: [
      "tests/**/*.test.{ts,tsx}",
      "src/tests/**/*.test.{ts,tsx}",
    ],
  },
});
