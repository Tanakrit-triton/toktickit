import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import * as api from "../api.js";
import type { ReferenceItem, Ticket } from "../api.js";
import { useRequester } from "../RequesterContext.js";
import { AttachmentSelection, type SelectedFile } from "../components/AttachmentSelection.js";

// Create Ticket screen -- ui-spec.md section 5.2.
//
// Attachment SELECTION and its client-side validation live here (AC-17).
// Upload, and the partial-success state that follows a failed upload, are #18:
// nothing on this screen sends a file.

const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;

const SUMMARY_MIN = 10;
const SUMMARY_MAX = 150;
const DESCRIPTION_MIN = 20;
const DESCRIPTION_MAX = 5000;

type Fields = {
  categoryId: string;
  relatedSystemId: string;
  requestedPriority: string;
  summary: string;
  description: string;
};

const EMPTY: Fields = {
  categoryId: "",
  relatedSystemId: "",
  requestedPriority: "",
  summary: "",
  description: "",
};

// Field order is the order ui-spec 5.2 fixes, and focus moves to the first
// entry in this list that failed.
const FIELD_ORDER: (keyof Fields)[] = [
  "categoryId",
  "relatedSystemId",
  "requestedPriority",
  "summary",
  "description",
];

const TEST_ID: Record<keyof Fields, string> = {
  categoryId: "category",
  relatedSystemId: "related-system",
  requestedPriority: "priority",
  summary: "summary",
  description: "description",
};

/**
 * Mirrors the server bounds in BR-19, BR-20, BR-21 and BR-23 so the Requester
 * gets immediate feedback. The server remains authoritative (BR-24); this only
 * decides whether a request is worth sending (AC-12).
 */
function validate(fields: Fields): Partial<Record<keyof Fields, string>> {
  const errors: Partial<Record<keyof Fields, string>> = {};
  const summary = fields.summary.trim();
  const description = fields.description.trim();

  if (!fields.categoryId) errors.categoryId = "Category is required.";
  if (!fields.relatedSystemId) errors.relatedSystemId = "Related System is required.";
  if (!fields.requestedPriority) errors.requestedPriority = "Requested Priority is required.";

  if (summary.length === 0) errors.summary = "Ticket Summary is required.";
  else if (summary.length < SUMMARY_MIN)
    errors.summary = `Ticket Summary must be at least ${SUMMARY_MIN} characters.`;
  else if (summary.length > SUMMARY_MAX)
    errors.summary = `Ticket Summary must be ${SUMMARY_MAX} characters or fewer.`;

  if (description.length === 0) errors.description = "Description is required.";
  else if (description.length < DESCRIPTION_MIN)
    errors.description = `Description must be at least ${DESCRIPTION_MIN} characters.`;
  else if (description.length > DESCRIPTION_MAX)
    errors.description = `Description must be ${DESCRIPTION_MAX} characters or fewer.`;

  return errors;
}

const today = () =>
  new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });

export function CreateTicket() {
  const { requester } = useRequester();
  const [categories, setCategories] = useState<ReferenceItem[]>([]);
  const [systems, setSystems] = useState<ReferenceItem[]>([]);
  const [referenceLoading, setReferenceLoading] = useState(true);
  const [fields, setFields] = useState<Fields>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<keyof Fields, string>>>({});
  const [files, setFiles] = useState<SelectedFile[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [failed, setFailed] = useState(false);
  const [created, setCreated] = useState<Ticket | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [c, s] = await Promise.all([api.fetchCategories(), api.fetchRelatedSystems()]);
        if (!cancelled) {
          setCategories(c);
          setSystems(s);
        }
      } catch {
        // Reference data is required to classify a ticket. The failure surfaces
        // as empty, disabled selects plus the API failure callout on submit;
        // the thrown error itself never reaches the page (BR-28).
        if (!cancelled) {
          setCategories([]);
          setSystems([]);
        }
      } finally {
        if (!cancelled) setReferenceLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const set = useCallback((key: keyof Fields, value: string) => {
    setFields((prev) => ({ ...prev, [key]: value }));
    // Clearing on edit means a message never outlives the problem it describes.
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  }, []);

  function focusFirstInvalid(found: Partial<Record<keyof Fields, string>>) {
    const first = FIELD_ORDER.find((key) => found[key]);
    if (!first) return;
    formRef.current
      ?.querySelector<HTMLElement>(`[data-testid="field-${TEST_ID[first]}"]`)
      ?.focus();
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting || requester === null) return;

    const found = validate(fields);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      setFailed(false);
      focusFirstInvalid(found);
      return;
    }

    // Disabled for the whole in-flight window, which is what prevents a second
    // Ticket from repeated clicking (BR-25, AC-15).
    setSubmitting(true);
    setFailed(false);
    try {
      const ticket = await api.createTicket(requester.id, {
        categoryId: Number(fields.categoryId),
        relatedSystemId: Number(fields.relatedSystemId),
        requestedPriority: fields.requestedPriority,
        summary: fields.summary.trim(),
        description: fields.description.trim(),
      });
      setCreated(ticket);
    } catch (error) {
      if (error instanceof api.TicketValidationError) {
        // The server is authoritative (BR-24): its per-field messages replace
        // whatever the client decided.
        const serverErrors = error.details as Partial<Record<keyof Fields, string>>;
        setErrors(serverErrors);
        focusFirstInvalid(serverErrors);
      } else {
        setFailed(true);
      }
    } finally {
      // Every entered value is untouched here, so a failure leaves the form
      // exactly as the Requester left it (BR-27, AC-16).
      setSubmitting(false);
    }
  }

  function handleCreateAnother() {
    setCreated(null);
    setFields(EMPTY);
    setErrors({});
    setFiles([]);
    setFailed(false);
  }

  if (created !== null) {
    return (
      <section className="zg-card zg-create-card zg-created" data-testid="state-created">
        <p className="zg-created-mark" aria-hidden="true">{"\u2714"}</p>
        <h1 className="zg-title">Ticket created</h1>
        <p className="zg-created-number">{created.ticketNumber}</p>
        <p className="zg-helper">Keep this number to refer to your request.</p>
        <div className="zg-actions">
          <Link
            className="zg-btn zg-btn--primary"
            data-testid="btn-view-ticket"
            to={`/tickets/${created.id}`}
          >
            View Ticket
          </Link>
          <button
            type="button"
            className="zg-btn zg-btn--secondary"
            data-testid="btn-create-another"
            onClick={handleCreateAnother}
          >
            Create Another
          </button>
        </div>
      </section>
    );
  }

  const message = (key: keyof Fields) =>
    errors[key] ? (
      <span className="zg-message-error" id={`error-${TEST_ID[key]}`} data-testid={`error-${TEST_ID[key]}`}>
        {errors[key]}
      </span>
    ) : null;

  const fieldProps = (key: keyof Fields) => ({
    "data-testid": `field-${TEST_ID[key]}`,
    className: "zg-field",
    value: fields[key],
    disabled: submitting,
    "aria-invalid": errors[key] ? ("true" as const) : undefined,
    "aria-describedby": errors[key] ? `error-${TEST_ID[key]}` : undefined,
  });

  return (
    <form
      ref={formRef}
      className="zg-card zg-create-card"
      data-testid="create-ticket-screen"
      onSubmit={handleSubmit}
      noValidate
    >
      <h1 className="zg-title">Create Ticket</h1>

      {/* 1. System-generated group: read-only, visually distinct from the
          editable fields below (ui-spec 5.2, BR-07). */}
      <fieldset className="zg-group">
        <legend className="zg-legend">Ticket information</legend>
        <div className="zg-grid-3">
          <label className="zg-label">
            Ticket Number
            <input className="zg-field" data-testid="field-ticket-number" readOnly value="Will be generated on submission" />
          </label>
          <label className="zg-label">
            Ticket Date
            <input className="zg-field" data-testid="field-ticket-date" readOnly value={today()} />
          </label>
          <label className="zg-label">
            Requester
            <input className="zg-field" data-testid="field-requester" readOnly value={requester?.fullName ?? ""} />
          </label>
        </div>
      </fieldset>

      {/* 2. Classification group. */}
      <fieldset className="zg-group">
        <legend className="zg-legend">Classification</legend>
        <div className="zg-grid-2">
          <label className="zg-label" htmlFor="field-category">
            Category<span className="zg-required-marker" aria-hidden="true">*</span>
            <select
              id="field-category"
              {...fieldProps("categoryId")}
              disabled={submitting || referenceLoading}
              required
              onChange={(e) => set("categoryId", e.target.value)}
            >
              <option value="">{referenceLoading ? "Loading..." : "Select a Category"}</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            {message("categoryId")}
          </label>

          <label className="zg-label" htmlFor="field-related-system">
            Related System<span className="zg-required-marker" aria-hidden="true">*</span>
            <select
              id="field-related-system"
              {...fieldProps("relatedSystemId")}
              disabled={submitting || referenceLoading}
              required
              onChange={(e) => set("relatedSystemId", e.target.value)}
            >
              <option value="">{referenceLoading ? "Loading..." : "Select a Related System"}</option>
              {systems.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            {message("relatedSystemId")}
          </label>
        </div>

        <label className="zg-label" htmlFor="field-priority">
          Requested Priority<span className="zg-required-marker" aria-hidden="true">*</span>
          <select
            id="field-priority"
            {...fieldProps("requestedPriority")}
            required
            onChange={(e) => set("requestedPriority", e.target.value)}
          >
            <option value="">Select a Requested Priority</option>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>{p.charAt(0) + p.slice(1).toLowerCase()}</option>
            ))}
          </select>
          {message("requestedPriority")}
        </label>
      </fieldset>

      {/* 3. Detail group: both full width, Description at least 6 rows. */}
      <fieldset className="zg-group">
        <legend className="zg-legend">Problem detail</legend>
        <label className="zg-label" htmlFor="field-summary">
          Ticket Summary<span className="zg-required-marker" aria-hidden="true">*</span>
          <input
            id="field-summary"
            type="text"
            {...fieldProps("summary")}
            required
            maxLength={SUMMARY_MAX}
            onChange={(e) => set("summary", e.target.value)}
          />
          {message("summary")}
        </label>

        <label className="zg-label" htmlFor="field-description">
          Description<span className="zg-required-marker" aria-hidden="true">*</span>
          <textarea
            id="field-description"
            rows={6}
            {...fieldProps("description")}
            required
            maxLength={DESCRIPTION_MAX}
            onChange={(e) => set("description", e.target.value)}
          />
          {message("description")}
        </label>
      </fieldset>

      {/* 4. Attachments. Selection and validation only; upload is #18. */}
      <AttachmentSelection files={files} onChange={setFiles} disabled={submitting} />

      {/* API failure callout sits above the actions, with every entered value
          left untouched (ui-spec 5.2, AC-16). */}
      {failed && (
        <div className="zg-callout-error" data-testid="state-create-failed" role="alert">
          The ticket could not be created. Your details have been kept - try again.
        </div>
      )}

      {/* 5. Actions. */}
      <div className="zg-actions">
        <button
          type="submit"
          className="zg-btn zg-btn--primary"
          data-testid="btn-submit-ticket"
          disabled={submitting}
          aria-busy={submitting ? "true" : undefined}
        >
          {submitting ? "Submitting..." : "Submit Ticket"}
        </button>
        <Link
          className="zg-btn zg-btn--secondary"
          data-testid="btn-cancel"
          to="/tickets"
          aria-disabled={submitting ? "true" : undefined}
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
