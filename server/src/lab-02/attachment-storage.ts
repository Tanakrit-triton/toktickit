import { mkdir, unlink, writeFile } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { join, resolve } from "node:path";

// Attachment binary storage.
//
// DEV-02: the local filesystem stands in for the SeaweedFS adapter D-06
// specifies. PostgreSQL still holds metadata only, so the boundary D-06 draws
// is preserved and only the adapter differs. Everything below is behind this
// one interface, so substituting an S3 client touches no route or service.

const STORAGE_ROOT = resolve(process.cwd(), "storage", "attachments");

function pathFor(storedFilename: string): string {
  const path = resolve(STORAGE_ROOT, storedFilename);
  // Defence in depth. storedFilenameFor already yields a UUID plus one of four
  // extensions, so this cannot currently trigger; it is here so a future change
  // to naming cannot silently reintroduce traversal.
  if (!path.startsWith(STORAGE_ROOT)) {
    throw new Error("refusing to resolve a path outside the attachment store");
  }
  return path;
}

export async function saveAttachment(storedFilename: string, contents: Buffer): Promise<void> {
  await mkdir(STORAGE_ROOT, { recursive: true });
  await writeFile(pathFor(storedFilename), contents);
}

export function readAttachment(storedFilename: string): NodeJS.ReadableStream {
  return createReadStream(pathFor(storedFilename));
}

/**
 * Deletes the binary. A missing file is not an error: removal must succeed so
 * the metadata can be marked, and a file already gone is the desired end state.
 */
export async function deleteAttachment(storedFilename: string): Promise<void> {
  try {
    await unlink(pathFor(storedFilename));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

export { STORAGE_ROOT };
