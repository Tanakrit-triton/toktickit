import { useEffect, useRef, useState } from "react";
import * as api from "../api.js";
import type { Attachment } from "../api.js";
import { humanSize, truncateMiddle, validateSelection } from "./AttachmentSelection.js";

// Attachment section on Ticket Detail -- ui-spec.md section 5.5.
//
// This region carries every interactive control on the screen; the ticket
// region above it carries none.

const MAX_ACTIVE = 5;
const REASON_MIN = 5;
const REASON_MAX = 200;

export interface AttachmentSectionProps {
  ticketId: string;
  requesterId: string;
  attachments: Attachment[];
  onChanged: () => void;
}

const REFUSAL_TEXT: Record<api.UploadRefusal, string> = {
  TOO_LARGE: "File exceeds 5 MB",
  UNSUPPORTED_TYPE: "File type not permitted",
  LIMIT_REACHED: "Maximum of 5 attachments reached.",
  FAILED: "The attachment could not be uploaded. Try again.",
};

export function AttachmentSection({
  ticketId,
  requesterId,
  attachments,
  onChanged,
}: AttachmentSectionProps) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [pendingRemoval, setPendingRemoval] = useState<Attachment | null>(null);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  // Removed attachments keep their metadata but stop occupying a slot (BR-32).
  const activeCount = attachments.filter((a) => a.status === "ACTIVE").length;
  const limitReached = activeCount >= MAX_ACTIVE;

  useEffect(() => {
    if (pendingRemoval !== null) reasonRef.current?.focus();
  }, [pendingRemoval]);

  useEffect(() => {
    if (pendingRemoval === null) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeModal();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [pendingRemoval]);

  function closeModal() {
    setPendingRemoval(null);
    setReason("");
    setReasonError(null);
    // Focus returns to the control that opened the dialogue (ui-spec 5.5).
    triggerRef.current?.focus();
  }

  async function handleFiles(list: FileList | null) {
    if (list === null || list.length === 0) return;
    const file = list[0];
    if (inputRef.current) inputRef.current.value = "";

    // Rejected client-side before any request: the server enforces the same
    // policy, but sending a file known to be impermissible wastes the upload
    // and delays the message (BR-24, AC-17).
    const localError = validateSelection(file);
    if (localError !== null) {
      setUploadError(localError);
      return;
    }

    setUploadError(null);
    setUploading(true);
    try {
      await api.uploadAttachment(requesterId, ticketId, file);
      onChanged();
    } catch (error) {
      setUploadError(
        error instanceof api.AttachmentUploadError
          ? REFUSAL_TEXT[error.refusal]
          : REFUSAL_TEXT.FAILED,
      );
    } finally {
      setUploading(false);
    }
  }

  async function confirmRemoval() {
    const trimmed = reason.trim();
    if (trimmed.length < REASON_MIN || trimmed.length > REASON_MAX) {
      setReasonError(
        trimmed.length === 0
          ? "A reason for removal is required."
          : `The reason must be between ${REASON_MIN} and ${REASON_MAX} characters.`,
      );
      return;
    }

    setRemoving(true);
    try {
      await api.removeAttachment(requesterId, pendingRemoval!.id, trimmed);
      closeModal();
      onChanged();
    } catch {
      setReasonError("The attachment could not be removed. Try again.");
    } finally {
      setRemoving(false);
    }
  }

  return (
    <section className="zg-card" data-testid="attachment-section">
      <h2 className="zg-section-title">Attachments</h2>

      {limitReached ? (
        <p className="zg-helper" data-testid="attachment-limit-reached">
          Maximum of 5 attachments reached.
        </p>
      ) : (
        <div className="zg-dropzone">
          <p>Add an attachment</p>
          <p className="zg-helper">JPG, PNG, WEBP, or PDF. Maximum 5 MB each, up to 5 files.</p>
          <input
            ref={inputRef}
            type="file"
            className="zg-file-input"
            data-testid="field-attachments"
            disabled={uploading}
            onChange={(e) => void handleFiles(e.target.files)}
          />
          {uploading && (
            <p className="zg-helper" data-testid="attachment-uploading" aria-live="polite">
              Uploading...
            </p>
          )}
        </div>
      )}

      {uploadError !== null && (
        <p className="zg-message-error" data-testid="attachment-error" role="alert">
          {uploadError}
        </p>
      )}

      <ul className="zg-attachment-list">
        {attachments.map((attachment) => {
          const removed = attachment.status === "REMOVED";
          return (
            <li
              key={attachment.id}
              className={removed ? "zg-attachment-row zg-attachment-row--removed" : "zg-attachment-row"}
              data-testid={`attachment-row-${attachment.id}`}
            >
              <span className="zg-attachment-name" title={attachment.originalFilename}>
                {truncateMiddle(attachment.originalFilename)}
              </span>
              <span className="zg-helper">{humanSize(attachment.sizeBytes)}</span>

              {removed ? (
                <>
                  {/* Metadata survives, the file does not (BR-40, AC-35). The
                      absence of a Download control here is the point. */}
                  <span className="zg-badge zg-badge--status-removed" data-testid="badge-removed">
                    Removed
                  </span>
                  <span className="zg-helper">{attachment.removedReason}</span>
                  <span className="zg-helper">
                    {attachment.removedAt === null
                      ? ""
                      : new Date(attachment.removedAt).toLocaleString()}
                  </span>
                </>
              ) : (
                <>
                  <span className="zg-helper">
                    {new Date(attachment.uploadedAt).toLocaleDateString()}
                  </span>
                  <a
                    className="zg-btn zg-btn--tertiary"
                    data-testid="btn-download"
                    href={api.attachmentDownloadUrl(attachment.id)}
                  >
                    Download
                  </a>
                  <button
                    type="button"
                    className="zg-btn zg-btn--destructive"
                    data-testid="btn-remove"
                    onClick={(event) => {
                      triggerRef.current = event.currentTarget;
                      setPendingRemoval(attachment);
                    }}
                  >
                    Remove
                  </button>
                </>
              )}
            </li>
          );
        })}
      </ul>

      {/* Removal is never a single unconfirmed click (BR-37). Opening this
          dialogue sends nothing; only Remove below does. */}
      {pendingRemoval !== null && (
        <div className="zg-modal-backdrop" data-testid="removal-modal-backdrop">
          <div
            className="zg-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="removal-title"
            data-testid="removal-modal"
          >
            <h3 id="removal-title" className="zg-section-title">
              Remove attachment
            </h3>
            <p>{pendingRemoval.originalFilename}</p>

            <label className="zg-label" htmlFor="removal-reason">
              Reason for removal<span className="zg-required-marker" aria-hidden="true">*</span>
              <textarea
                id="removal-reason"
                ref={reasonRef}
                className="zg-field"
                data-testid="field-removal-reason"
                rows={3}
                maxLength={REASON_MAX}
                value={reason}
                aria-invalid={reasonError ? "true" : undefined}
                aria-describedby={reasonError ? "error-removal-reason" : undefined}
                onChange={(e) => {
                  setReason(e.target.value);
                  setReasonError(null);
                }}
              />
              {reasonError !== null && (
                <span
                  className="zg-message-error"
                  id="error-removal-reason"
                  data-testid="error-removal-reason"
                >
                  {reasonError}
                </span>
              )}
            </label>

            <div className="zg-actions">
              <button
                type="button"
                className="zg-btn zg-btn--secondary"
                data-testid="btn-cancel-removal"
                onClick={closeModal}
              >
                Cancel
              </button>
              <button
                type="button"
                className="zg-btn zg-btn--destructive"
                data-testid="btn-confirm-removal"
                disabled={removing}
                aria-busy={removing ? "true" : undefined}
                onClick={() => void confirmRemoval()}
              >
                {removing ? "Removing..." : "Remove"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
