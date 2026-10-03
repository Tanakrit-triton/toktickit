import request from "supertest";
import { app } from "../../src/app.js";

// The shared sign-in helper for API tests (docs/lab-03/tests.md section 1,
// Lab 3 rules).
//
// It signs in through the real POST /api/v1/auth/login, so nothing stubs the
// session middleware. The returned agent keeps the session cookie in its jar
// and sends the CSRF token as X-CSRF-Token on every request; GETs ignore it.

export const CSRF_HEADER = "X-CSRF-Token";

/** The local-only development password every seeded account has (AC-62). */
export function seedPassword(): string {
  const value = process.env.SEED_PASSWORD;
  if (!value) {
    throw new Error("SEED_PASSWORD must be set in server/.env for the API tests.");
  }
  return value;
}

export type SignedIn = {
  agent: ReturnType<typeof request.agent>;
  csrfToken: string;
  user: { id: string; fullName: string; email: string; role: string; mustChangePassword: boolean };
};

export async function loginAs(email: string, password: string = seedPassword()): Promise<SignedIn> {
  const agent = request.agent(app);
  const res = await agent.post("/api/v1/auth/login").send({ email, password });
  if (res.status !== 200) {
    throw new Error(`loginAs(${email}) failed with ${res.status}: ${res.text}`);
  }
  const { csrfToken, user } = res.body.data;
  agent.set(CSRF_HEADER, csrfToken);
  return { agent, csrfToken, user };
}
