import { hash, verify } from "@node-rs/argon2";

// Password hashing (BR-10, DEC-08).
//
// @node-rs/argon2 defaults to Argon2id with the OWASP baseline parameters
// (19 MiB memory, 2 iterations, 1 lane) and a fresh random salt per hash, so
// no option is overridden here. A plaintext password never leaves this
// module except as its hash.

export async function hashPassword(plain: string): Promise<string> {
  return hash(plain);
}

/**
 * True only when `plain` matches `passwordHash`. A malformed or foreign hash
 * is a failed verification, never an error the caller has to handle.
 */
export async function verifyPassword(passwordHash: string, plain: string): Promise<boolean> {
  try {
    return await verify(passwordHash, plain);
  } catch {
    return false;
  }
}
