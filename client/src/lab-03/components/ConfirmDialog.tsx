import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";

// The confirmation dialog (docs/lab-03/ui-spec.md section 5.2), generalising
// the Lab 2 removal modal. Nothing is sent before Confirm. It traps focus,
// closes on Escape, returns focus to the control that opened it, and cannot be
// dismissed while its request is in flight.
//
// Set new initial password (ui-spec 6.6) asks for a password instead of a
// reason, validated against the BR-11 length rule before anything is sent.

const REASON_MIN = 5;
const REASON_MAX = 500;
const PASSWORD_MIN = 12;
const PASSWORD_MAX = 128;

/** Code points, not UTF-16 units, so an emoji counts once (BR-11). */
const codePoints = (value: string) => [...value].length;

export interface ConfirmDialogProps {
  title: string;
  text?: string;
  /** Cancel ticket and Reopen require a 5–500 character reason (BR-37). */
  reasonRequired?: boolean;
  confirmLabel: string;
  confirmVariant?: "primary" | "destructive";
  cancelLabel?: string;
  /** A password field, sent untrimmed (BR-11). Exclusive with reasonRequired. */
  passwordField?: { label: string; testId: string; emptyMessage: string };
  busyLabel?: string;
  /**
   * Receives the trimmed reason or the password, or undefined when neither is
   * asked for. A returned string is shown below the field as its error.
   */
  onConfirm: (value: string | undefined) => Promise<void | string>;
  onClose: () => void;
}

export function ConfirmDialog({
  title,
  text,
  reasonRequired = false,
  confirmLabel,
  confirmVariant = "primary",
  cancelLabel = "Cancel",
  passwordField,
  busyLabel = "Updating…",
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const firstFieldRef = useRef<HTMLTextAreaElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const passwordId = useId();
  const confirmRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const reasonId = useId();

  // Remember the trigger before focus moves in, and give it back on close,
  // however the dialog closes (ui-spec 5.2, L2 5.5).
  useLayoutEffect(() => {
    const trigger = document.activeElement as HTMLElement | null;
    (firstFieldRef.current ?? passwordRef.current ?? confirmRef.current)?.focus();
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
        dialogRef.current.querySelectorAll<HTMLElement>("textarea, input, button:not(:disabled)"),
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
    let value = trimmed;
    if (passwordField !== undefined) {
      const length = codePoints(password);
      const error =
        password === ""
          ? passwordField.emptyMessage
          : length < PASSWORD_MIN || length > PASSWORD_MAX
            ? `Password must be ${PASSWORD_MIN}–${PASSWORD_MAX} characters.`
            : null;
      if (error !== null) {
        setPasswordError(error);
        passwordRef.current?.focus();
        return;
      }
      value = password;
    }
    setBusy(true);
    let fieldError: void | string;
    try {
      fieldError = await onConfirm(value);
    } finally {
      setBusy(false);
    }
    if (typeof fieldError === "string") {
      setPasswordError(fieldError);
      passwordRef.current?.focus();
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

        {passwordField !== undefined && (
          <label className="zg-label" htmlFor={passwordId}>
            {passwordField.label}
            <span className="zg-required-marker" aria-hidden="true">*</span>
            <input
              id={passwordId}
              ref={passwordRef}
              type="password"
              autoComplete="new-password"
              className="zg-field"
              data-testid={passwordField.testId}
              value={password}
              disabled={busy}
              aria-invalid={passwordError !== null ? "true" : undefined}
              aria-describedby={`${passwordId}-helper${passwordError !== null ? ` ${passwordId}-error` : ""}`}
              onChange={(e) => {
                setPassword(e.target.value);
                setPasswordError(null);
              }}
            />
            <span className="zg-helper" id={`${passwordId}-helper`}>
              {PASSWORD_MIN}–{PASSWORD_MAX} characters. The user must change it at first sign-in.
            </span>
            {passwordError !== null && (
              <span
                className="zg-message-error"
                id={`${passwordId}-error`}
                data-testid={passwordField.testId.replace(/^field-/, "error-")}
              >
                {passwordError}
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
            {busy ? busyLabel : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
