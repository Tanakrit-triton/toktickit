import { useEffect, useId, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import type { Role } from "../auth-api.js";
import { Callout } from "./Callout.js";
import { ConfirmDialog } from "./ConfirmDialog.js";
import { createUser, setInitialPassword, updateUser, UserRequestError } from "../users-api.js";
import type { AdminUser, UserChanges } from "../users-api.js";

// The User Management dialog (docs/lab-03/ui-spec.md section 6.6). Create and
// edit share it. The client checks mirror BR-06, BR-11, and BR-61 so obvious
// mistakes cost no request; the server stays authoritative. Focus behaviour
// follows the confirmation dialog (ui-spec 5.2 and 10).

const FULL_NAME_MIN = 2;
const FULL_NAME_MAX = 100;
const EMAIL_MAX = 254;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_MIN = 12;
const PASSWORD_MAX = 128;

export const ROLE_OPTIONS: [Role, string][] = [
  ["REQUESTER", "Requester"],
  ["IT_STAFF", "IT Staff"],
  ["ADMINISTRATOR", "Administrator"],
];

type Field = "fullName" | "email" | "role" | "isActive" | "initialPassword";

/** Field key to the ui-spec 11 hook suffix; errors use `error-{suffix}`. */
const HOOK: Record<Field, string> = {
  fullName: "full-name",
  email: "user-email",
  role: "role",
  isActive: "active",
  initialPassword: "initial-password",
};

const ORDER: Field[] = ["fullName", "email", "role", "isActive", "initialPassword"];

interface Values {
  fullName: string;
  email: string;
  role: Role | "";
  isActive: boolean;
  initialPassword: string;
}

type Errors = Partial<Record<Field, string>>;

const codePoints = (value: string) => [...value].length;

function validate(values: Values, creating: boolean): Errors {
  const errors: Errors = {};
  const name = values.fullName.trim();
  if (name === "") errors.fullName = "Full name is required.";
  else if (name.length < FULL_NAME_MIN) errors.fullName = `Full name must be at least ${FULL_NAME_MIN} characters.`;
  else if (name.length > FULL_NAME_MAX) errors.fullName = `Full name must be ${FULL_NAME_MAX} characters or fewer.`;

  const email = values.email.trim().toLowerCase();
  if (email === "") errors.email = "Email is required.";
  else if (email.length > EMAIL_MAX) errors.email = `Email must be ${EMAIL_MAX} characters or fewer.`;
  else if (!EMAIL_PATTERN.test(email)) errors.email = "Enter an email address in the form name@example.com.";

  if (values.role === "") errors.role = "Choose a role: Requester, IT Staff, or Administrator.";

  if (creating) {
    const length = codePoints(values.initialPassword);
    if (values.initialPassword === "") errors.initialPassword = "Enter an initial password.";
    else if (length < PASSWORD_MIN || length > PASSWORD_MAX)
      errors.initialPassword = `Password must be ${PASSWORD_MIN}–${PASSWORD_MAX} characters.`;
  }
  return errors;
}

/** Only what changed is sent (UI-41). Email is compared after normalisation (BR-06). */
function changesFrom(user: AdminUser, values: Values): UserChanges {
  const changes: UserChanges = {};
  const name = values.fullName.trim();
  const email = values.email.trim();
  if (name !== user.fullName) changes.fullName = name;
  if (email.toLowerCase() !== user.email) changes.email = email;
  if (values.role !== "" && values.role !== user.role) changes.role = values.role;
  if (values.isActive !== user.isActive) changes.isActive = values.isActive;
  return changes;
}

/** The safe in-dialog message for a failure that is not a field error or a 409 (AC-68). */
function failureMessage(error: unknown): string {
  if (error instanceof UserRequestError) {
    if (error.kind === "FORBIDDEN") return "You do not have permission to do this.";
    if (error.kind === "NOT_FOUND") return "This user could not be found.";
  }
  return "Something went wrong. Try again.";
}

export interface UserDialogProps {
  /** The user being edited, or undefined to create one. */
  user?: AdminUser;
  /** True on the signed-in Administrator's own row (BR-63). */
  isSelf: boolean;
  onClose: () => void;
  /** Called after a successful save with the Success callout text. */
  onSaved: (message: string) => void;
}

export function UserDialog({ user, isSelf, onClose, onSaved }: UserDialogProps) {
  const creating = user === undefined;
  const [values, setValues] = useState<Values>({
    fullName: user?.fullName ?? "",
    email: user?.email ?? "",
    role: user?.role ?? "",
    isActive: user?.isActive ?? true,
    initialPassword: "",
  });
  const [errors, setErrors] = useState<Errors>({});
  const [conflict, setConflict] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const dialogRef = useRef<HTMLFormElement>(null);
  const titleId = useId();
  const selfHelpId = useId();

  const fieldId = (field: Field) => `user-dialog-${HOOK[field]}`;
  const errorId = (field: Field) => `user-dialog-error-${HOOK[field]}`;

  useLayoutEffect(() => {
    const trigger = document.activeElement as HTMLElement | null;
    document.getElementById(fieldId("fullName"))?.focus();
    return () => trigger?.focus();
  }, []);

  useEffect(() => {
    // While the password confirmation is open, it owns the keyboard.
    if (confirmOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) {
        onClose();
        return;
      }
      if (event.key !== "Tab" || dialogRef.current === null) return;
      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          "input:not(:disabled), select:not(:disabled), button:not(:disabled)",
        ),
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
  }, [busy, confirmOpen, onClose]);

  function set<K extends keyof Values>(field: K, value: Values[K]) {
    setValues((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: undefined }));
  }

  function showErrors(found: Errors) {
    setErrors(found);
    const first = ORDER.find((f) => found[f] !== undefined);
    if (first !== undefined) document.getElementById(fieldId(first))?.focus();
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setConflict(null);
    setFailure(null);
    const found = validate(values, creating);
    if (Object.keys(found).length > 0) {
      showErrors(found);
      return;
    }

    let request: Promise<AdminUser>;
    if (creating) {
      request = createUser({
        fullName: values.fullName.trim(),
        email: values.email.trim(),
        role: values.role as Role,
        isActive: values.isActive,
        // Never trimmed (BR-11).
        initialPassword: values.initialPassword,
      });
    } else {
      const changes = changesFrom(user, values);
      // PATCH needs at least one field; with nothing changed there is nothing to save.
      if (Object.keys(changes).length === 0) {
        onClose();
        return;
      }
      request = updateUser(user.id, changes);
    }

    setBusy(true);
    try {
      await request;
    } catch (error) {
      setBusy(false);
      if (error instanceof UserRequestError && error.kind === "CONFLICT" && error.conflict !== null) {
        if (error.conflict.code === "EMAIL_ALREADY_EXISTS") showErrors({ email: error.conflict.message });
        else setConflict(error.conflict.message);
      } else if (error instanceof UserRequestError && error.kind === "VALIDATION") {
        const fromServer: Errors = {};
        for (const field of ORDER) {
          if (error.details[field] !== undefined) fromServer[field] = error.details[field];
        }
        if (Object.keys(fromServer).length > 0) showErrors(fromServer);
        else setFailure(failureMessage(error));
      } else {
        setFailure(failureMessage(error));
      }
      return;
    }
    setBusy(false);
    onSaved("User saved.");
  }

  async function confirmInitialPassword(password: string | undefined): Promise<void | string> {
    try {
      await setInitialPassword(user!.id, password ?? "");
    } catch (error) {
      if (error instanceof UserRequestError && error.kind === "VALIDATION") {
        return error.details.initialPassword ?? "Password must be 12–128 characters.";
      }
      setConfirmOpen(false);
      setFailure(failureMessage(error));
      return;
    }
    onSaved("Initial password set.");
  }

  const describedBy = (field: Field, extra?: string) =>
    [extra, errors[field] !== undefined ? errorId(field) : undefined].filter(Boolean).join(" ") || undefined;

  const fieldError = (field: Field) =>
    errors[field] !== undefined && (
      <span className="zg-message-error" id={errorId(field)} data-testid={`error-${HOOK[field]}`}>
        {errors[field]}
      </span>
    );

  const selfLocked = !creating && isSelf;

  return (
    <div className="zg-modal-backdrop">
      <form
        ref={dialogRef}
        className="zg-modal zg-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-testid="user-dialog"
        noValidate
        onSubmit={(e) => void submit(e)}
      >
        <h2 id={titleId} className="zg-section-title">
          {creating ? "Create user" : `Edit ${user.fullName}`}
        </h2>

        {conflict !== null && (
          <Callout variant="conflict" testId="callout-conflict">
            {conflict}
          </Callout>
        )}
        {failure !== null && (
          <Callout variant="error" testId="callout-error">
            {failure}
          </Callout>
        )}

        <label className="zg-label" htmlFor={fieldId("fullName")}>
          Full name<span className="zg-required-marker" aria-hidden="true">*</span>
          <input
            id={fieldId("fullName")}
            className="zg-field"
            data-testid="field-full-name"
            maxLength={FULL_NAME_MAX + 20}
            value={values.fullName}
            disabled={busy}
            aria-invalid={errors.fullName !== undefined ? "true" : undefined}
            aria-describedby={describedBy("fullName")}
            onChange={(e) => set("fullName", e.target.value)}
          />
          {fieldError("fullName")}
        </label>

        <label className="zg-label" htmlFor={fieldId("email")}>
          Email<span className="zg-required-marker" aria-hidden="true">*</span>
          <input
            id={fieldId("email")}
            type="email"
            className="zg-field"
            data-testid="field-user-email"
            value={values.email}
            disabled={busy}
            aria-invalid={errors.email !== undefined ? "true" : undefined}
            aria-describedby={describedBy("email")}
            onChange={(e) => set("email", e.target.value)}
          />
          {fieldError("email")}
        </label>

        <label className="zg-label" htmlFor={fieldId("role")}>
          Role<span className="zg-required-marker" aria-hidden="true">*</span>
          <select
            id={fieldId("role")}
            className="zg-field"
            data-testid="field-role"
            value={values.role}
            disabled={busy || selfLocked}
            aria-invalid={errors.role !== undefined ? "true" : undefined}
            aria-describedby={describedBy("role", selfLocked ? selfHelpId : undefined)}
            onChange={(e) => set("role", e.target.value as Role | "")}
          >
            {creating && <option value="">Select a role</option>}
            {ROLE_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          {fieldError("role")}
        </label>

        <label className="zg-label zg-checkbox" htmlFor={fieldId("isActive")}>
          <input
            id={fieldId("isActive")}
            type="checkbox"
            data-testid="field-active"
            checked={values.isActive}
            disabled={busy || selfLocked}
            aria-describedby={describedBy("isActive", selfLocked ? selfHelpId : undefined)}
            onChange={(e) => set("isActive", e.target.checked)}
          />
          Active
        </label>
        {fieldError("isActive")}

        {selfLocked && (
          <p className="zg-helper" id={selfHelpId}>
            You cannot change your own role or deactivate your own account.
          </p>
        )}

        {creating && (
          <label className="zg-label" htmlFor={fieldId("initialPassword")}>
            Initial password<span className="zg-required-marker" aria-hidden="true">*</span>
            <input
              id={fieldId("initialPassword")}
              type="password"
              autoComplete="new-password"
              className="zg-field"
              data-testid="field-initial-password"
              value={values.initialPassword}
              disabled={busy}
              aria-invalid={errors.initialPassword !== undefined ? "true" : undefined}
              aria-describedby={describedBy("initialPassword", `${fieldId("initialPassword")}-helper`)}
              onChange={(e) => set("initialPassword", e.target.value)}
            />
            <span className="zg-helper" id={`${fieldId("initialPassword")}-helper`}>
              12–128 characters. The user must change it at first sign-in.
            </span>
            {fieldError("initialPassword")}
          </label>
        )}

        {!creating && (
          <p>
            <button
              type="button"
              className="zg-btn zg-btn--secondary"
              data-testid="btn-set-initial-password"
              disabled={busy}
              onClick={() => {
                setFailure(null);
                setConfirmOpen(true);
              }}
            >
              Set new initial password
            </button>
          </p>
        )}

        <div className="zg-actions">
          <button
            type="button"
            className="zg-btn zg-btn--secondary"
            data-testid="btn-dialog-cancel"
            disabled={busy}
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="zg-btn zg-btn--primary"
            data-testid="btn-save-user"
            disabled={busy}
            aria-busy={busy ? "true" : undefined}
          >
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </form>

      {confirmOpen && user !== undefined && (
        <ConfirmDialog
          title={`Set a new initial password for ${user.fullName}?`}
          text="They will be signed out and must change it at next login."
          passwordField={{
            label: "New initial password",
            testId: "field-initial-password",
            emptyMessage: "Enter an initial password.",
          }}
          confirmLabel="Set password"
          busyLabel="Saving…"
          onConfirm={confirmInitialPassword}
          onClose={() => setConfirmOpen(false)}
        />
      )}
    </div>
  );
}
