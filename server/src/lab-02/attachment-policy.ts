import { randomUUID } from "node:crypto";
import { extname } from "node:path";

// Attachment policy (BR-30, BR-31, BR-34, api-spec.md 4.1).

export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
export const MAX_ACTIVE_ATTACHMENTS = 5;

/**
 * Permitted MIME types and the extensions each may carry. Both halves must be
 * permitted AND must agree: a .pdf announced as an image is the shape a
 * smuggled file takes, and either half alone would let it through.
 *
 * Validation is by extension and declared type only. Content sniffing is
 * deferred (A-02), so a forged type on a permitted extension still passes;
 * the stored file is never executed or rendered inline.
 */
const PERMITTED: Record<string, readonly string[]> = {
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/webp": [".webp"],
  "application/pdf": [".pdf"],
};

export interface AttachmentCandidate {
  originalname: string;
  mimetype: string;
  size: number;
}

export interface PolicyFailure {
  status: 413 | 415;
  code: "FILE_TOO_LARGE" | "UNSUPPORTED_FILE_TYPE";
  message: string;
}

/** Lower-cased extension including the dot, or "" when there is none. */
export function extensionOf(filename: string): string {
  return extname(filename).toLowerCase();
}

export function validateAttachment(file: AttachmentCandidate): PolicyFailure | null {
  const permittedExtensions = PERMITTED[file.mimetype];
  const extension = extensionOf(file.originalname);

  if (permittedExtensions === undefined || !permittedExtensions.includes(extension)) {
    return {
      status: 415,
      code: "UNSUPPORTED_FILE_TYPE",
      message: "Attach a JPG, PNG, WEBP, or PDF file.",
    };
  }

  if (file.size <= 0) {
    return {
      status: 415,
      code: "UNSUPPORTED_FILE_TYPE",
      message: "The file is empty.",
    };
  }

  if (file.size > MAX_ATTACHMENT_BYTES) {
    return {
      status: 413,
      code: "FILE_TOO_LARGE",
      message: "Each attachment must be 5 MB or smaller.",
    };
  }

  return null;
}

/**
 * The name the file is stored under: a generated identifier plus the validated
 * extension.
 *
 * The client filename is metadata only and never contributes to the path.
 * Only the extension is taken from it, and only after validateAttachment has
 * confirmed the extension is one of four literals -- so "../../etc/passwd.png"
 * yields a UUID and ".png", and path traversal is not a risk that has to be
 * defended against later (BR-34).
 */
export function storedFilenameFor(originalFilename: string): string {
  return `${randomUUID()}${extensionOf(originalFilename)}`;
}
