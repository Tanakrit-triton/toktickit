import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { Assignee } from "../../lab-03/tickets-api.js";
import { Callout } from "../../lab-03/components/Callout.js";
import { CREATABLE_ACTION_STATUSES, ACTION_STATUS_TEXT, editStatusOptions, isFullyEditable } from "../action-rules.js";
import * as actionsApi from "../actions-api.js";
import type { ActionStatus, ActionTaken, ActionWriteResult, UpdateActionInput } from "../actions-api.js";
import { fromBangkokInput, toBangkokInput } from "../bangkok-time.js";
import { ActionStatusBadge } from "./ActionBadges.js";

// Create Action and Edit Action dialog (docs/lab-04/ui-spec.md section 4.4).
//
// One component in two modes. It follows the Lab 3 dialog rules: role dialog,
// focus trap, Escape closes, focus returns to the opener. The server is the
// authority on every rule; the dialog only offers the BR-15 options and shows
// what the server answers. Input is kept on every failure.

const DESCRIPTION_MAX = 2000;
const RESULT_MAX = 2000;
const NOTE_MAX = 1000;
const ATTACHMENT_NOTES_MAX = 500;

type FieldKey =
  | "actionAt"
  | "description"
  | "status"
  | "result"
  | "performedById"
  | "followUpRequired"
  | "followUpNote"
  | "attachmentNotes";

/** Form order, which decides the first failing field to focus. */
const FIELD_ORDER: FieldKey[] = [
  "actionAt",
  "description",
  "status",
  "result",
  "performedById",
  "followUpRequired",
  "followUpNote",
  "attachmentNotes",
];

type Form = {
  actionAt: string;
  description: string;
  status: ActionStatus;
  result: string;
  performedById: string;
  followUpRequired: boolean;
  followUpNote: string;
  attachmentNotes: string;
};

const formFrom = (action: ActionTaken): Form => ({
  actionAt: toBangkokInput(action.actionAt),
  description: action.description,
  status: action.status,
  result: action.result ?? "",
  performedById: action.performedBy.id,
  followUpRequired: action.followUpRequired,
  followUpNote: action.followUpNote ?? "",
  attachmentNotes: action.attachmentNotes ?? "",
});

const blankToNull = (value: string) => (value.trim() === "" ? null : value);

/** BR-31: a UUID per dialog. randomUUID needs a secure context; localhost is one. */
function newRequestId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Only what differs from the stored action, plus its version (api-spec 2.3). */
function changesFrom(base: ActionTaken, form: Form): UpdateActionInput {
  const patch: UpdateActionInput = { version: base.version };
  const stored = formFrom(base);
  if (form.status !== stored.status) patch.status = form.status;
  if (form.actionAt !== stored.actionAt) patch.actionAt = fromBangkokInput(form.actionAt);
  if (form.description !== stored.description) patch.description = form.description;
  if (blankToNull(form.result) !== base.result) patch.result = blankToNull(form.result);
  if (form.performedById !== stored.performedById) patch.performedById = form.performedById;
  if (form.followUpRequired !== stored.followUpRequired) patch.followUpRequired = form.followUpRequired;
  if (form.followUpRequired && form.followUpNote !== stored.followUpNote) patch.followUpNote = form.followUpNote;
  if (blankToNull(form.attachmentNotes) !== base.attachmentNotes) patch.attachmentNotes = blankToNull(form.attachmentNotes);
  return patch;
}

export interface ActionDialogProps {
  ticketId: string;
  /** The action to edit; absent in create mode. */
  action?: ActionTaken;
  assignees: Assignee[];
  currentUser: { id: string; fullName: string };
  onSaved: (result: ActionWriteResult) => void;
  onClose: () => void;
  /** Re-fetches the ticket and its actions, and returns the latest copy of the edited action. */
  onReload: () => Promise<ActionTaken | null>;
}

export function ActionDialog({ ticketId, action, assignees, currentUser, onSaved, onClose, onReload }: ActionDialogProps) {
  const editing = action !== undefined;
  const [base, setBase] = useState<ActionTaken | undefined>(action);
  const [form, setForm] = useState<Form>(() =>
    action !== undefined
      ? formFrom(action)
      : {
          actionAt: toBangkokInput(new Date()),
          description: "",
          status: "PLANNED",
          result: "",
          performedById: currentUser.id,
          followUpRequired: false,
          followUpNote: "",
          attachmentNotes: "",
        },
  );
  // Generated once per open and reused for every retry from this dialog (BR-31).
  const [clientRequestId] = useState(newRequestId);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [errors, setErrors] = useState<Partial<Record<FieldKey, string>>>({});
  const [focusTick, setFocusTick] = useState(0);
  const [conflict, setConflict] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [confirmingReload, setConfirmingReload] = useState(false);
  const [reloading, setReloading] = useState(false);

  const dialogRef = useRef<HTMLDivElement>(null);
  const fieldRefs = useRef<Partial<Record<FieldKey, HTMLElement | null>>>({});
  const id = useId();
  const titleId = `${id}-title`;
  const fieldId = (key: FieldKey) => `${id}-${key}`;

  // Remember the opener before focus moves in, and give focus back on close.
  useLayoutEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    (fieldRefs.current.actionAt ?? fieldRefs.current.description)?.focus();
    return () => {
      if (opener?.isConnected) opener.focus();
    };
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !savingRef.current) {
        onClose();
        return;
      }
      if (event.key !== "Tab" || dialogRef.current === null) return;
      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          "input:not(:disabled), select:not(:disabled), textarea:not(:disabled), button:not(:disabled), a[href]",
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
  }, [onClose]);

  // After a 422, focus the first failing field once the fields are enabled again.
  useEffect(() => {
    if (focusTick === 0) return;
    const first = FIELD_ORDER.find((key) => errors[key] !== undefined);
    if (first !== undefined) fieldRefs.current[first]?.focus();
  }, [focusTick, errors]);

  const set = <K extends keyof Form>(key: K, value: Form[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => {
      if (current[key] === undefined) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  };

  async function save() {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setErrors({});
    setConflict(null);
    setFailed(false);
    setConfirmingReload(false);
    try {
      const result =
        base === undefined
          ? await actionsApi.createAction(ticketId, {
              clientRequestId,
              actionAt: fromBangkokInput(form.actionAt),
              description: form.description,
              status: form.status,
              result: blankToNull(form.result),
              performedById: form.performedById,
              followUpRequired: form.followUpRequired,
              followUpNote: form.followUpRequired ? form.followUpNote : null,
              attachmentNotes: blankToNull(form.attachmentNotes),
            })
          : await actionsApi.updateAction(base.id, changesFrom(base, form));
      onSaved(result);
    } catch (error) {
      if (error instanceof actionsApi.WorkflowRequestError && error.kind === "VALIDATION") {
        setErrors(error.details as Partial<Record<FieldKey, string>>);
        setFocusTick((tick) => tick + 1);
      } else if (error instanceof actionsApi.WorkflowRequestError && error.kind === "CONFLICT") {
        setConflict(error.conflictMessage ?? "This action has changed.");
      } else {
        setFailed(true);
      }
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  async function reload() {
    setReloading(true);
    try {
      const latest = await onReload();
      if (editing && latest !== null) {
        setBase(latest);
        setForm(formFrom(latest));
        setErrors({});
      }
      setConflict(null);
      setConfirmingReload(false);
    } finally {
      setReloading(false);
    }
  }

  const busy = saving || reloading;
  const current = base?.status;
  const statusLocked = current !== undefined && !isFullyEditable(current);
  const statusOptions = current === undefined ? CREATABLE_ACTION_STATUSES : editStatusOptions(current);
  const cancelling = editing && form.status === "CANCELLED" && current !== "CANCELLED";

  let resultLabel = "Result";
  if (!editing && form.status === "COMPLETED") resultLabel = "Result (required to complete)";
  if (editing && form.status === "COMPLETED") resultLabel = "Result (required)";
  if (cancelling) resultLabel = "Reason for cancelling (required)";

  // Every active staff user, plus the stored performer if they are no longer listed.
  const performerOptions = [...assignees.map((a) => ({ id: a.id, fullName: a.fullName, inactive: false }))];
  const ensure = (person: { id: string; fullName: string }, inactive: boolean) => {
    if (!performerOptions.some((p) => p.id === person.id)) performerOptions.push({ ...person, inactive });
  };
  if (base !== undefined) ensure(base.performedBy, !base.performedBy.isActive);
  else ensure(currentUser, false);

  const describedBy = (key: FieldKey, extra?: string) =>
    [extra, errors[key] !== undefined ? `${fieldId(key)}-error` : undefined].filter(Boolean).join(" ") || undefined;

  const fieldError = (key: FieldKey) =>
    errors[key] !== undefined && (
      <span className="zg-message-error" id={`${fieldId(key)}-error`}>
        {errors[key]}
      </span>
    );

  const counter = (key: FieldKey, length: number, max: number) => (
    <span id={`${fieldId(key)}-counter`} className={length > max ? "zg-counter zg-counter--over" : "zg-counter"}>
      {length}/{max}
    </span>
  );

  const ref = (key: FieldKey) => (el: HTMLElement | null) => {
    fieldRefs.current[key] = el;
  };

  const performer = base !== undefined && statusLocked ? base.performedBy : null;

  return (
    <div className="zg-modal-backdrop">
      <div
        ref={dialogRef}
        className="zg-modal zg-dialog zg-action-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-testid="action-dialog"
      >
        <h2 id={titleId} className="zg-section-title">
          {editing ? "Edit action" : "Record action"}
        </h2>

        {conflict !== null && (
          <div>
            <Callout variant="conflict" testId="callout-conflict">
              {conflict}
            </Callout>
            {confirmingReload ? (
              <div className="zg-actions-footer">
                <p>Discard your changes and load the latest version?</p>
                <div className="zg-actions">
                  <button type="button" className="zg-btn zg-btn--secondary" disabled={busy} onClick={() => setConfirmingReload(false)}>
                    Keep my changes
                  </button>
                  <button
                    type="button"
                    className="zg-btn zg-btn--secondary"
                    data-testid="btn-confirm-reload"
                    disabled={busy}
                    onClick={() => void reload()}
                  >
                    {reloading ? "Reloading…" : "Discard and reload"}
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                className="zg-btn zg-btn--secondary"
                data-testid="btn-reload-ticket"
                disabled={busy}
                onClick={() => (editing ? setConfirmingReload(true) : void reload())}
              >
                {reloading ? "Reloading…" : "Reload ticket"}
              </button>
            )}
          </div>
        )}
        {failed && (
          <Callout variant="error" testId="callout-action-error">
            We couldn't save the action. Your input is kept; please try again.
          </Callout>
        )}

        <div className="zg-form-row">
          <label className="zg-label" htmlFor={fieldId("actionAt")}>
            Action date and time (Bangkok)
          </label>
          <input
            id={fieldId("actionAt")}
            ref={ref("actionAt")}
            type="datetime-local"
            className="zg-field"
            data-testid="field-action-at"
            required
            value={form.actionAt}
            disabled={busy}
            aria-invalid={errors.actionAt !== undefined ? "true" : undefined}
            aria-describedby={describedBy("actionAt")}
            onChange={(e) => set("actionAt", e.target.value)}
          />
          {fieldError("actionAt")}
        </div>

        <div className="zg-form-row">
          <label className="zg-label" htmlFor={fieldId("description")}>
            Description
          </label>
          <textarea
            id={fieldId("description")}
            ref={ref("description")}
            className="zg-field"
            data-testid="field-action-description"
            rows={3}
            required
            value={form.description}
            disabled={busy}
            aria-invalid={errors.description !== undefined ? "true" : undefined}
            aria-describedby={describedBy("description", `${fieldId("description")}-counter`)}
            onChange={(e) => set("description", e.target.value)}
          />
          {counter("description", form.description.length, DESCRIPTION_MAX)}
          {fieldError("description")}
        </div>

        <div className="zg-form-row">
          {statusLocked ? (
            <>
              <span className="zg-label" id={fieldId("status")}>
                Status
              </span>
              <span data-testid="field-action-status" aria-labelledby={fieldId("status")}>
                <ActionStatusBadge status={current} />
              </span>
            </>
          ) : (
            <>
              <label className="zg-label" htmlFor={fieldId("status")}>
                Status
              </label>
              <select
                id={fieldId("status")}
                ref={ref("status")}
                className="zg-field"
                data-testid="field-action-status"
                value={form.status}
                disabled={busy}
                aria-invalid={errors.status !== undefined ? "true" : undefined}
                aria-describedby={describedBy("status")}
                onChange={(e) => set("status", e.target.value as ActionStatus)}
              >
                {statusOptions.map((status) => (
                  <option key={status} value={status}>
                    {ACTION_STATUS_TEXT[status]}
                  </option>
                ))}
              </select>
            </>
          )}
          {fieldError("status")}
        </div>

        <div className="zg-form-row">
          <label className="zg-label" htmlFor={fieldId("result")}>
            {resultLabel}
          </label>
          <textarea
            id={fieldId("result")}
            ref={ref("result")}
            className="zg-field"
            data-testid="field-action-result"
            rows={3}
            value={form.result}
            disabled={busy}
            aria-required={resultLabel.includes("required") ? "true" : undefined}
            aria-invalid={errors.result !== undefined ? "true" : undefined}
            aria-describedby={describedBy("result", `${fieldId("result")}-counter`)}
            onChange={(e) => set("result", e.target.value)}
          />
          {counter("result", form.result.length, RESULT_MAX)}
          {fieldError("result")}
        </div>

        <div className="zg-form-row">
          {performer !== null ? (
            <>
              <span className="zg-label" id={fieldId("performedById")}>
                Performed by
              </span>
              <span className="zg-readonly-value" data-testid="field-action-performer" aria-labelledby={fieldId("performedById")}>
                {performer.fullName}
                {!performer.isActive && <span className="zg-muted"> (inactive)</span>}
              </span>
            </>
          ) : (
            <>
              <label className="zg-label" htmlFor={fieldId("performedById")}>
                Performed by
              </label>
              <select
                id={fieldId("performedById")}
                ref={ref("performedById")}
                className="zg-field"
                data-testid="field-action-performer"
                value={form.performedById}
                disabled={busy}
                aria-invalid={errors.performedById !== undefined ? "true" : undefined}
                aria-describedby={describedBy("performedById")}
                onChange={(e) => set("performedById", e.target.value)}
              >
                {performerOptions.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.inactive ? `${person.fullName} (inactive)` : person.fullName}
                  </option>
                ))}
              </select>
            </>
          )}
          {fieldError("performedById")}
        </div>

        <div className="zg-form-row">
          <label className="zg-check">
            <input
              ref={ref("followUpRequired")}
              type="checkbox"
              data-testid="field-follow-up-required"
              checked={form.followUpRequired}
              disabled={busy}
              aria-invalid={errors.followUpRequired !== undefined ? "true" : undefined}
              onChange={(e) => set("followUpRequired", e.target.checked)}
            />
            Follow-up required?
          </label>
          {fieldError("followUpRequired")}
        </div>

        {form.followUpRequired && (
          <div className="zg-form-row">
            <label className="zg-label" htmlFor={fieldId("followUpNote")}>
              Follow-up note (required)
            </label>
            <textarea
              id={fieldId("followUpNote")}
              ref={ref("followUpNote")}
              className="zg-field"
              data-testid="field-follow-up-note"
              rows={2}
              value={form.followUpNote}
              disabled={busy}
              aria-required="true"
              aria-invalid={errors.followUpNote !== undefined ? "true" : undefined}
              aria-describedby={describedBy("followUpNote", `${fieldId("followUpNote")}-counter`)}
              onChange={(e) => set("followUpNote", e.target.value)}
            />
            {counter("followUpNote", form.followUpNote.length, NOTE_MAX)}
            {fieldError("followUpNote")}
          </div>
        )}

        <div className="zg-form-row">
          <label className="zg-label" htmlFor={fieldId("attachmentNotes")}>
            Attachment notes
          </label>
          <input
            id={fieldId("attachmentNotes")}
            ref={ref("attachmentNotes")}
            type="text"
            className="zg-field"
            data-testid="field-attachment-notes"
            value={form.attachmentNotes}
            disabled={busy}
            aria-invalid={errors.attachmentNotes !== undefined ? "true" : undefined}
            aria-describedby={describedBy("attachmentNotes", `${fieldId("attachmentNotes")}-hint ${fieldId("attachmentNotes")}-counter`)}
            onChange={(e) => set("attachmentNotes", e.target.value)}
          />
          <span className="zg-helper" id={`${fieldId("attachmentNotes")}-hint`}>
            Which attachment to look at, e.g. error-screenshot.png
          </span>
          {counter("attachmentNotes", form.attachmentNotes.length, ATTACHMENT_NOTES_MAX)}
          {fieldError("attachmentNotes")}
        </div>

        {cancelling && <p className="zg-action-dialog-warning">Cancelled actions cannot be edited again.</p>}

        <div className="zg-actions">
          <button type="button" className="zg-btn zg-btn--secondary" data-testid="btn-action-cancel" disabled={saving} onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className={`zg-btn ${cancelling ? "zg-btn--destructive" : "zg-btn--primary"}`}
            data-testid="btn-save-action"
            disabled={busy}
            aria-busy={saving ? "true" : undefined}
            onClick={() => void save()}
          >
            {saving ? "Saving…" : editing ? "Save changes" : "Save action"}
          </button>
        </div>
      </div>
    </div>
  );
}
