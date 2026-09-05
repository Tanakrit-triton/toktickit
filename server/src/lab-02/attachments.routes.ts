import { Router, type Request, type Response } from "express";
import multer from "multer";
import { getPrisma } from "../prisma.js";
import { buildError } from "./errors.js";
import { requireRequester } from "./requester-context.js";
import {
  MAX_ACTIVE_ATTACHMENTS,
  MAX_ATTACHMENT_BYTES,
  storedFilenameFor,
  validateAttachment,
} from "./attachment-policy.js";
import { deleteAttachment, readAttachment, saveAttachment } from "./attachment-storage.js";

// Attachment endpoints (api-spec.md section 4).

export const attachmentsRouter = Router();

// Held in memory: nothing touches disk until the policy has accepted the file,
// so a rejected upload leaves no artefact behind. The limit is one byte above
// the policy maximum so an oversized file is reported by the policy with 413
// rather than by multer with its own error shape.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_ATTACHMENT_BYTES + 1, files: 1 },
});

const UUID_PATTERN =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

const REASON_MIN = 5;
const REASON_MAX = 200;

/**
 * One refusal for everything a Requester may not reach, so a foreign resource
 * and a missing one are byte-identical (BR-18, DEC-01).
 */
function refuse(res: Response): void {
  res.status(404).json(buildError("NOT_FOUND", "The requested resource does not exist."));
}

function badId(res: Response): void {
  res.status(400).json(buildError("BAD_REQUEST", "The identifier is not valid."));
}

/** storedFilename is deliberately absent from every shape below (BR-28). */
function toAttachmentResponse(row: {
  id: string;
  ticketId: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: Date;
  removedAt: Date | null;
  removedReason: string | null;
  uploadedBy?: { id: string; fullName: string };
}) {
  return {
    id: row.id,
    ticketId: row.ticketId,
    originalFilename: row.originalFilename,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    ...(row.uploadedBy ? { uploadedBy: row.uploadedBy } : {}),
    uploadedAt: row.uploadedAt.toISOString(),
    status: row.removedAt === null ? "ACTIVE" : "REMOVED",
    removedAt: row.removedAt === null ? null : row.removedAt.toISOString(),
    removedReason: row.removedReason,
  };
}

/** Resolves an attachment only if the selected Requester owns its Ticket (BR-38). */
async function findOwnedAttachment(attachmentId: string, requesterId: string) {
  const attachment = await getPrisma().attachment.findUnique({
    where: { id: attachmentId },
    include: { ticket: { select: { requesterId: true } } },
  });
  if (attachment === null || attachment.ticket.requesterId !== requesterId) return null;
  return attachment;
}

/** POST /api/v1/tickets/{ticketId}/attachments -- upload one file (FR-14, FR-26). */
attachmentsRouter.post(
  "/tickets/:ticketId/attachments",
  requireRequester,
  upload.single("file"),
  async (req: Request, res: Response) => {
    const prisma = getPrisma();
    const requester = req.requester!;
    const { ticketId } = req.params;

    if (!UUID_PATTERN.test(ticketId)) {
      badId(res);
      return;
    }

    const file = req.file;
    if (file === undefined) {
      // Well-formed multipart missing a required part: a field failure, not an
      // uninterpretable request, so 422 rather than 400 (api-spec 6).
      res
        .status(422)
        .json(
          buildError("VALIDATION_ERROR", "One or more fields are invalid.", {
            file: "Choose a file to attach.",
          }),
        );
      return;
    }

    try {
      // Ownership before policy: a Requester who cannot reach the ticket
      // learns nothing about it, not even whether their file would have been
      // acceptable.
      const ticket = await prisma.ticket.findUnique({
        where: { id: ticketId },
        select: { id: true, requesterId: true },
      });
      if (ticket === null || ticket.requesterId !== requester.id) {
        refuse(res);
        return;
      }

      const failure = validateAttachment(file);
      if (failure !== null) {
        res.status(failure.status).json(buildError(failure.code, failure.message));
        return;
      }

      // Removed attachments do not count toward the limit (BR-32).
      const active = await prisma.attachment.count({
        where: { ticketId, removedAt: null },
      });
      if (active >= MAX_ACTIVE_ATTACHMENTS) {
        res
          .status(409)
          .json(
            buildError(
              "ATTACHMENT_LIMIT_REACHED",
              `A ticket may have at most ${MAX_ACTIVE_ATTACHMENTS} attachments.`,
            ),
          );
        return;
      }

      const storedFilename = storedFilenameFor(file.originalname);
      await saveAttachment(storedFilename, file.buffer);

      const created = await prisma.attachment.create({
        data: {
          ticketId,
          originalFilename: file.originalname,
          storedFilename,
          mimeType: file.mimetype,
          sizeBytes: file.size,
          uploadedById: requester.id,
        },
        include: { uploadedBy: { select: { id: true, fullName: true } } },
      });

      res.status(201).json({ data: toAttachmentResponse(created) });
    } catch {
      res
        .status(500)
        .json(buildError("INTERNAL_ERROR", "The attachment could not be saved. Try again."));
    }
  },
);

/** GET /api/v1/tickets/{ticketId}/attachments -- metadata for an owned Ticket (FR-25). */
attachmentsRouter.get(
  "/tickets/:ticketId/attachments",
  requireRequester,
  async (req: Request, res: Response) => {
    const prisma = getPrisma();
    const requester = req.requester!;
    const { ticketId } = req.params;

    if (!UUID_PATTERN.test(ticketId)) {
      badId(res);
      return;
    }

    try {
      const ticket = await prisma.ticket.findUnique({
        where: { id: ticketId },
        select: { requesterId: true },
      });
      if (ticket === null || ticket.requesterId !== requester.id) {
        refuse(res);
        return;
      }

      // Removed attachments are returned with full metadata so the client can
      // render them in a removed state (BR-40, FR-29).
      const rows = await prisma.attachment.findMany({
        where: { ticketId },
        orderBy: { uploadedAt: "asc" },
      });

      res.status(200).json({ data: rows.map(toAttachmentResponse) });
    } catch {
      res
        .status(500)
        .json(buildError("INTERNAL_ERROR", "Could not load the attachments. Try again."));
    }
  },
);

/** GET /api/v1/attachments/{attachmentId}/download -- stream an active attachment (FR-27). */
attachmentsRouter.get(
  "/attachments/:attachmentId/download",
  requireRequester,
  async (req: Request, res: Response) => {
    const requester = req.requester!;
    const { attachmentId } = req.params;

    if (!UUID_PATTERN.test(attachmentId)) {
      badId(res);
      return;
    }

    try {
      const attachment = await findOwnedAttachment(attachmentId, requester.id);
      if (attachment === null) {
        refuse(res);
        return;
      }

      if (attachment.removedAt !== null) {
        // 410 rather than 404: this Requester can still see the attachment's
        // metadata in the list, so reporting it as never having existed would
        // contradict what they are looking at.
        res
          .status(410)
          .json(buildError("ATTACHMENT_REMOVED", "This attachment has been removed."));
        return;
      }

      // Content-Disposition carries the original filename so the download is
      // recognisable; the stored name never leaves the server (BR-28, AC-32).
      res.setHeader("Content-Type", attachment.mimeType);
      res.setHeader("Content-Length", String(attachment.sizeBytes));
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${attachment.originalFilename.replace(/"/g, "")}"`,
      );
      readAttachment(attachment.storedFilename).pipe(res);
    } catch {
      res
        .status(500)
        .json(buildError("INTERNAL_ERROR", "The attachment could not be downloaded. Try again."));
    }
  },
);

/** DELETE /api/v1/attachments/{attachmentId} -- soft removal (FR-28). */
attachmentsRouter.delete(
  "/attachments/:attachmentId",
  requireRequester,
  async (req: Request, res: Response) => {
    const prisma = getPrisma();
    const requester = req.requester!;
    const { attachmentId } = req.params;

    if (!UUID_PATTERN.test(attachmentId)) {
      badId(res);
      return;
    }

    try {
      const attachment = await findOwnedAttachment(attachmentId, requester.id);
      if (attachment === null) {
        refuse(res);
        return;
      }

      const raw = (req.body ?? {}) as Record<string, unknown>;
      const reason = typeof raw.removalReason === "string" ? raw.removalReason.trim() : "";
      if (reason.length < REASON_MIN || reason.length > REASON_MAX) {
        res.status(422).json(
          buildError("VALIDATION_ERROR", "One or more fields are invalid.", {
            removalReason:
              reason.length === 0
                ? "A reason for removal is required."
                : `The reason must be between ${REASON_MIN} and ${REASON_MAX} characters.`,
          }),
        );
        return;
      }

      if (attachment.removedAt !== null) {
        // Not idempotent by design, so a double submission is visible rather
        // than silently accepted (api-spec 4.4).
        res
          .status(409)
          .json(
            buildError("ATTACHMENT_ALREADY_REMOVED", "This attachment has already been removed."),
          );
        return;
      }

      // Soft at the record level, hard on disk: the row is retained and marked
      // while the binary is deleted in the same operation, so a removed file
      // is unrecoverable through any download path even if a guard were
      // defective (BR-35, BR-39, DEC-05).
      const updated = await prisma.attachment.update({
        where: { id: attachmentId },
        data: { removedAt: new Date(), removedById: requester.id, removedReason: reason },
      });
      await deleteAttachment(attachment.storedFilename);

      res.status(200).json({ data: toAttachmentResponse(updated) });
    } catch {
      res
        .status(500)
        .json(buildError("INTERNAL_ERROR", "The attachment could not be removed. Try again."));
    }
  },
);
