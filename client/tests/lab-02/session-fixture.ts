import { vi } from "vitest";
import * as authApi from "../../src/lab-03/auth-api.js";

// Since Lab 3 #38 the Requester is the signed-in user, not a selection kept in
// sessionStorage (docs/lab-03/tests.md REG-02). The kept Lab 2 screen tests
// mount the real AuthProvider in place of RequesterProvider and restore their
// Requester through the session call it makes at startup, GET /auth/me.

export function signInAs(requester: { id: string; fullName: string; email: string }) {
  return vi.spyOn(authApi, "fetchCurrentSession").mockResolvedValue({
    user: { ...requester, role: "REQUESTER", mustChangePassword: false },
    csrfToken: "csrf-token",
  });
}
