import type { Role } from "./auth-api.js";

// Route vocabulary shared by the shell, the guards, and the auth screens
// (docs/lab-03/specification.md section 6, ui-spec.md section 4).

/** `/` and post-login landing route by role. */
export function landingFor(role: Role): string {
  return role === "REQUESTER" ? "/tickets" : "/staff/queue";
}

/**
 * `next` is honoured only if it is a path on this site: a single leading `/`,
 * not `//` and not `/\` (which browsers treat as `//`), and no scheme. Anything
 * else is ignored, which prevents an open redirect (ui-spec.md section 4).
 */
export function safeNext(next: string | null): string | null {
  if (next === null || !next.startsWith("/")) return null;
  if (next.startsWith("//") || next.includes("\\") || /^\/[^?#]*:/.test(next)) return null;
  return next;
}
