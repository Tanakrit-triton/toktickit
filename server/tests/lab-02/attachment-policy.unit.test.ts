import { describe, it, expect } from "vitest";
import {
  MAX_ATTACHMENT_BYTES,
  storedFilenameFor,
  validateAttachment,
} from "../../src/lab-02/attachment-policy.js";

// UT-09 .. UT-12 from docs/lab-02/tests.md section 2.1.
//
// Pure policy: type, size, and the stored name. Ownership and the five-file
// limit need a database and are proved at the API level.

const file = (originalname: string, mimetype: string, size = 1024) => ({
  originalname,
  mimetype,
  size,
});

describe("validateAttachment (UT-09 - AC-31, BR-30)", () => {
  it("accepts every permitted type", () => {
    const permitted = [
      file("photo.jpg", "image/jpeg"),
      file("photo.jpeg", "image/jpeg"),
      file("shot.png", "image/png"),
      file("shot.webp", "image/webp"),
      file("report.pdf", "application/pdf"),
    ];

    for (const candidate of permitted) {
      expect(validateAttachment(candidate), `${candidate.originalname} should be accepted`).toBeNull();
    }
  });

  it("accepts a permitted extension regardless of its letter case", () => {
    expect(validateAttachment(file("PHOTO.JPG", "image/jpeg"))).toBeNull();
    expect(validateAttachment(file("Report.PDF", "application/pdf"))).toBeNull();
  });

  it("rejects an impermissible type", () => {
    for (const candidate of [
      file("payload.exe", "application/x-msdownload"),
      file("notes.txt", "text/plain"),
      file("archive.zip", "application/zip"),
      file("script.js", "text/javascript"),
    ]) {
      const error = validateAttachment(candidate);
      expect(error, `${candidate.originalname} should be rejected`).not.toBeNull();
      expect(error!.status).toBe(415);
    }
  });

  it("rejects a file with no extension at all", () => {
    expect(validateAttachment(file("README", "application/pdf"))!.status).toBe(415);
  });
});

describe("validateAttachment (UT-10 - AC-31, BR-30)", () => {
  it("rejects an extension and a declared type that disagree", () => {
    // Both halves are individually permitted; only together are they a lie.
    // A .pdf announced as an image is the shape a smuggled file takes.
    const mismatched = [
      file("report.pdf", "image/png"),
      file("photo.png", "application/pdf"),
      file("photo.jpg", "image/webp"),
    ];

    for (const candidate of mismatched) {
      const error = validateAttachment(candidate);
      expect(error, `${candidate.originalname} as ${candidate.mimetype} should be rejected`).not.toBeNull();
      expect(error!.status).toBe(415);
    }
  });
});

describe("validateAttachment (UT-11 - AC-30, BR-31)", () => {
  it("accepts exactly 5 MB and rejects one byte more", () => {
    expect(MAX_ATTACHMENT_BYTES).toBe(5 * 1024 * 1024);
    expect(validateAttachment(file("big.pdf", "application/pdf", MAX_ATTACHMENT_BYTES))).toBeNull();

    const tooBig = validateAttachment(
      file("big.pdf", "application/pdf", MAX_ATTACHMENT_BYTES + 1),
    );
    expect(tooBig).not.toBeNull();
    expect(tooBig!.status).toBe(413);
  });

  it("rejects an empty file", () => {
    expect(validateAttachment(file("empty.pdf", "application/pdf", 0))).not.toBeNull();
  });
});

describe("storedFilenameFor (UT-12 - BR-34)", () => {
  it("builds a name from a generated identifier and the validated extension", () => {
    const stored = storedFilenameFor("holiday photo.png");

    expect(stored).toMatch(/^[0-9a-f-]{36}\.png$/);
    expect(stored).not.toContain("holiday");
  });

  it("never lets a client filename reach the stored path", () => {
    // The client name is metadata only. If it were used to build a path, each
    // of these would escape the storage directory (BR-34).
    const hostile = [
      "../../etc/passwd.png",
      "..\..\windows\system32\evil.png",
      "/absolute/path.png",
      "name\u0000truncated.png",
    ];

    for (const name of hostile) {
      const stored = storedFilenameFor(name);
      expect(stored, `${name} must not survive into the stored name`).toMatch(/^[0-9a-f-]{36}\.png$/);
      expect(stored).not.toContain("..");
      expect(stored).not.toContain("/");
      expect(stored).not.toContain("\\");
      expect(stored).not.toContain("\u0000");
    }
  });

  it("gives two uploads of the same filename different stored names", () => {
    expect(storedFilenameFor("photo.png")).not.toBe(storedFilenameFor("photo.png"));
  });
});
