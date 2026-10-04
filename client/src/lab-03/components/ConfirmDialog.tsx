import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";

// The confirmation dialog (docs/lab-03/ui-spec.md section 5.2), generalising
// the Lab 2 removal modal. Nothing is sent before Confirm. It traps focus,
// closes on Escape, returns focus to the control that opened it, and cannot be
// dismissed while its request is in flight.

const REASON_MIN = 5;
const REASON_MAX = 500;

export interface ConfirmDialogProps {
  title: string;
  text?: string;
  /** Cancel ticket and Reopen require a 5–500 character reason (BR-37). */
  reasonRequired?: boolean;
  confirmLabel: string;
  confirmVariant?: "primary" | "destructive";
  cancelLabel?: string;
  /** Receives the trimmed reason, or undefined when none is asked for. */
  onConfirm: (reason: string | undefined) => Promise<void>;
  onClose: () => void;
}

export function ConfirmDialog({
  title,
  text,
  reasonRequired = false,
  confirmLabel,
  confirmVariant = "primary",
  cancelLabel = "Cancel",
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const firstFieldRef = useRef<HTMLTextAreaElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const reasonId = useId();

  // Remember the trigger before focus moves in, and give it back on close,
  // however the dialog closes (ui-spec 5.2, L2 5.5).
  useLayoutEffect(() => {
    const trigger = document.activeElement as HTMLElement | null;
    (firstFieldRef.current ?? confirmRef.current)?.focus();
    return () => trigger?.focus();
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) {
        onClose();
        return;
      }
      if (event.key !== "Tab" || dialogRef.current === null) return;
      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>("textarea, button:not(:disabled)"),
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  async function confirm() {
    let trimmed: string | undefined;
    if (reasonRequired) {
      trimmed = reason.trim();
      if (trimmed.length < REASON_MIN || trimmed.length > REASON_MAX) {
        setReasonError(`Enter a reason of ${REASON_MIN}–${REASON_MAX} characters.`);
        firstFieldRef.current?.focus();
        return;
      }
    }
    setBusy(true);
    try {
      await onConfirm(trimmed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="zg-modal-backdrop">
      <div
        ref={dialogRef}
        className="zg-modal zg-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-testid="confirm-dialog"
      >
        <h2 id={titleId} className="zg-section-title">
          {title}
        </h2>
        {text !== undefined && <p>{text}</p>}

        {reasonRequired && (
          <label className="zg-label" htmlFor={reasonId}>
            Reason<span className="zg-required-marker" aria-hidden="true">*</span>
            <textarea
              id={reasonId}
              ref={firstFieldRef}
              className="zg-field"
              data-testid="field-dialog-reason"
              rows={3}
              maxLength={REASON_MAX}
              value={reason}
              disabled={busy}
              aria-invalid={reasonError !== null ? "true" : undefined}
              aria-describedby={reasonError !== null ? `${reasonId}-error` : undefined}
              onChange={(e) => {
                setReason(e.target.value);
                setReasonError(null);
              }}
            />
            {reasonError !== null && (
              <span className="zg-message-error" id={`${reasonId}-error`}>
                {reasonError}
              </span>
            )}
          </label>
        )}

        <div className="zg-actions">
          <button
            type="button"
            className="zg-btn zg-btn--secondary"
            data-testid="btn-dialog-cancel"
            disabled={busy}
            onClick={onClose}
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            className={`zg-btn zg-btn--${confirmVariant}`}
            data-testid="btn-confirm"
            disabled={busy}
            aria-busy={busy ? "true" : undefined}
            onClick={() => void confirm()}
          >
            {busy ? "Updating…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
