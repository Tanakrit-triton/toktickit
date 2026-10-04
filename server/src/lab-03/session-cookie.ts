import type { CookieOptions, Request, Response } from "express";
import { SESSION_ABSOLUTE_MS } from "./session-expiry.js";

// The session cookie (BR-15, api-spec.md section 1.1, DEV-09).
//
// HttpOnly, SameSite=Lax, Path=/, Max-Age 8 hours. Secure only in production:
// local development is plain HTTP, and Supertest's cookie jar does not send
// Secure cookies over HTTP.

export const SESSION_COOKIE = "toktickit_sid";

const baseOptions = (): CookieOptions => ({
  httpOnly: true,
  sameSite: "lax",
  path: "/",
  secure: process.env.NODE_ENV === "production",
});

/** The raw session token from the Cookie header, or null. */
export function readSessionToken(req: Request): string | null {
  const header = req.headers.cookie;
  if (typeof header !== "string") {
    return null;
  }
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator !== -1 && part.slice(0, separator).trim() === SESSION_COOKIE) {
      const value = part.slice(separator + 1).trim();
      return value === "" ? null : value;
    }
  }
  return null;
}

export function setSessionCookie(res: Response, token: string): void {
  // Express converts maxAge from milliseconds to the Max-Age attribute in seconds.
  res.cookie(SESSION_COOKIE, token, { ...baseOptions(), maxAge: SESSION_ABSOLUTE_MS });
}

export function clearSessionCookie(res: Response): void {
  res.cookie(SESSION_COOKIE, "", { ...baseOptions(), maxAge: 0 });
}
