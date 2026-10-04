import { useId, useState } from "react";
import { RoleBadge } from "./RoleBadge.js";
import { TicketRequestError, type CommentOrNote } from "../tickets-api.js";

// Public Comment and Internal Note items, and the composer both use
// (docs/lab-03/ui-spec.md section 8).
//
// Bodies are React text nodes only: no dangerouslySetInnerHTML, Markdown, or
// auto-linking, so markup shows as literal text (BR-49, AC-49).

export const NOTE_LABEL = "Internal note — not visible to Requester";
const BODY_MAX = 2000;

export function EntryItem({ entry, kind }: { entry: CommentOrNote; kind: "comment" | "note" }) {
  return (
    <li className={kind === "note" ? "zg-note-item" : "zg-comment-item"} data-testid={`${kind}-item-${entry.id}`}>
      {/* Carried by text as well as colour (AC-50). */}
      {kind === "note" && <span className="zg-note-label">{NOTE_LABEL}</span>}
      <div className="zg-entry-meta">
        <span className="zg-entry-author">{entry.author.fullName}</span>
        <RoleBadge role={entry.author.role} />
        <time className="zg-entry-time" dateTime={entry.createdAt} title={entry.createdAt}>
          {new Date(entry.createdAt).toLocaleString()}
        </time>
      </div>
      <p className="zg-entry-body zg-preserve-lines">{entry.body}</p>
    </li>
  );
}

export function EntryList({
  entries,
  kind,
  emptyText,
}: {
  entries: CommentOrNote[];
  kind: "comment" | "note";
  emptyText: string;
}) {
  if (entries.length === 0) return <p className="zg-helper">{emptyText}</p>;
  return (
    <ul className="zg-entry-list">
      {entries.map((entry) => (
        <EntryItem key={entry.id} entry={entry} kind={kind} />
      ))}
    </ul>
  );
}

export interface ComposerProps {
  label: string;
  fieldTestId: string;
  buttonTestId: string;
  buttonText: string;
  buttonVariant: "primary" | "secondary";
  rows?: number;
  /** Posts the trimmed body and returns the server's copy. */
  onPost: (body: string) => Promise<CommentOrNote>;
  onPosted: (entry: CommentOrNote) => void;
}

export function Composer({
  label,
  fieldTestId,
  buttonTestId,
  buttonText,
  buttonVariant,
  rows = 4,
  onPost,
  onPosted,
}: ComposerProps) {
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);
  const id = useId();
  const tooLong = body.trim().length > BODY_MAX;

  async function post() {
    const trimmed = body.trim();
    if (trimmed.length === 0) {
      setError("Write something before posting.");
      return;
    }
    if (trimmed.length > BODY_MAX) {
      setError(`Keep it to ${BODY_MAX} characters or fewer.`);
      return;
    }
    setPosting(true);
    setError(null);
    try {
      const entry = await onPost(trimmed);
      setBody("");
      onPosted(entry);
    } catch (failure) {
      if (failure instanceof TicketRequestError && failure.kind === "VALIDATION" && failure.details.body) {
        setError(failure.details.body);
      } else if (failure instanceof TicketRequestError && failure.kind === "CONFLICT" && failure.conflictMessage) {
        setError(failure.conflictMessage);
      } else {
        setError("Could not post. Try again.");
      }
    } finally {
      setPosting(false);
    }
  }

  return (
    <div className="zg-composer">
      <label className="zg-label" htmlFor={id}>
        {label}
      </label>
      <textarea
        id={id}
        className="zg-field"
        data-testid={fieldTestId}
        rows={rows}
        value={body}
        disabled={posting}
        aria-invalid={error !== null ? "true" : undefined}
        aria-describedby={`${id}-counter${error !== null ? ` ${id}-error` : ""}`}
        onChange={(e) => {
          setBody(e.target.value);
          setError(null);
        }}
      />
      <span id={`${id}-counter`} className={tooLong ? "zg-counter zg-counter--over" : "zg-counter"}>
        {body.length}/{BODY_MAX}
      </span>
      {error !== null && (
        <span className="zg-message-error" id={`${id}-error`}>
          {error}
        </span>
      )}
      <div className="zg-actions">
        <button
          type="button"
          className={`zg-btn zg-btn--${buttonVariant}`}
          data-testid={buttonTestId}
          disabled={posting}
          aria-busy={posting ? "true" : undefined}
          onClick={() => void post()}
        >
          {posting ? "Posting…" : buttonText}
        </button>
      </div>
    </div>
  );
}
