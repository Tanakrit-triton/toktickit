import { execSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { RESTARTED_API_PID_FILE } from "./lab-02/helpers.js";

// Lab 2 E2E-05 stops the API and restarts it detached, so the rest of the run
// has a backend. That process belongs to the run, so the run stops it: the
// whole tree (shell, npm, tsx watch, node), leaving no detached API behind.

export default function globalTeardown(): void {
  if (!existsSync(RESTARTED_API_PID_FILE)) return;
  const pid = Number(readFileSync(RESTARTED_API_PID_FILE, "utf8").trim());
  rmSync(RESTARTED_API_PID_FILE, { force: true });
  if (!Number.isInteger(pid) || pid <= 0) return;
  try {
    if (process.platform === "win32") {
      execSync(`taskkill /PID ${pid} /T /F`, { stdio: "ignore" });
    } else {
      process.kill(-pid, "SIGTERM");
    }
  } catch {
    // Already gone.
  }
}
