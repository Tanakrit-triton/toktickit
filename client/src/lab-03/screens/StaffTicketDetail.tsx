import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { AttachmentSection } from "../../lab-02/components/AttachmentSection.js";
import { AppearsResolvedIndicator, ItPriorityBadge, PriorityBadge, StatusBadge } from "../components/Badges.js";
import { Callout } from "../components/Callout.js";
import { ConfirmDialog } from "../components/ConfirmDialog.js";
import { Composer, EntryList, NOTE_LABEL } from "../components/Conversation.js";
import { Forbidden } from "../components/Forbidden.js";
import * as ticketsApi from "../tickets-api.js";
import type { Assignee, CommentOrNote, Priority, StaffTicket, TicketStatus } from "../tickets-api.js";

// IT Staff Ticket Detail (docs/lab-03/ui-spec.md section 6.5).
//
// The ticket information is read-only. The operations card is the only region
// with editable operational fields (AC-34). Status buttons come from the
// server's availableTransitions and never from a copy of the matrix (api-spec
// 5.2). After any operation the detail is re-fetched, so the screen shows
// server state rather than assuming the change took effect.

/** specification.md 5.6, status-dependent operations. */
const OWNER_CHANGE_STATUSES = new Set<TicketStatus>(["NEW", "OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "REOPENED"]);
const PRIORITY_LOCKED_STATUSES = new Set<TicketStatus>(["CLOSED", "CANCELLED"]);
const PRIORITIES: Priority[] = ["LOW", "MEDIUM", "HIGH", "URGENT"];
const PRIORITY_TEXT: Record<Priority, string> = { LOW: "Low", MEDIUM: "Medium", HIGH: "High", URGENT: "Urgent" };

function transitionLabel(target: TicketStatus, current: TicketStatus): string {
  switch (target) {
    case "IN_PROGRESS":
      return current === "WAITING_FOR_REQUESTER" ? "Resume work" : "Start work";
    case "WAITING_FOR_REQUESTER":
      return "Wait for requester";
    case "RESOLVED":
      return "Resolve";
    case "CLOSED":
      return "Close";
    case "REOPENED":
      return "Reopen";
    case "CANCELLED":
      return "Cancel ticket";
    default:
      return target;
  }
}

type DialogSpec = {
  title: string;
  confirmLabel: string;
  confirmVariant?: "primary" | "destructive";
  cancelLabel?: string;
  reasonRequired?: boolean;
};

/** ui-spec.md 5.2. Targets without an entry need no confirmation (BR-37). */
function dialogFor(target: TicketStatus, ticketNumber: string): DialogSpec | null {
  switch (target) {
    case "RESOLVED":
      return { title: `Mark ${ticketNumber} as resolved?`, confirmLabel: "Resolve" };
    case "CLOSED":
      return { title: `Close ${ticketNumber}? Closed tickets are locked.`, confirmLabel: "Close ticket" };
    case "CANCELLED":
      return {
        title: `Cancel ${ticketNumber}?`,
        confirmLabel: "Cancel ticket",
        confirmVariant: "destructive",
        cancelLabel: "Keep ticket",
        reasonRequired: true,
      };
    case "REOPENED":
      return { title: `Reopen ${ticketNumber}?`, confirmLabel: "Reopen", reasonRequired: true };
    default:
      return null;
  }
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="zg-readonly-field">
      <span className="zg-label">{label}</span>
      <span className="zg-readonly-value">{value}</span>
    </div>
  );
}

type LoadState = "loading" | "ready" | "not-found" | "forbidden" | "failed";

export function StaffTicketDetail() {
  const { ticketId } = useParams();
  const [ticket, setTicket] = useState<StaffTicket | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [assignees, setAssignees] = useState<Assignee[]>([]);
  const [conflict, setConflict] = useState<string | null>(null);
  const [operationFailed, setOperationFailed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [pendingTransition, setPendingTransition] = useState<TicketStatus | null>(null);

  const load = useCallback(async () => {
    if (ticketId === undefined) return;
    try {
      setTicket(await ticketsApi.fetchStaffTicket(ticketId));
      setLoadState("ready");
    } catch (error) {
      const kind = error instanceof ticketsApi.TicketRequestError ? error.kind : "FAILED";
      setTicket(null);
      setLoadState(kind === "NOT_FOUND" ? "not-found" : kind === "FORBIDDEN" ? "forbidden" : "failed");
    }
  }, [ticketId]);

  useEffect(() => {
    void load();
    ticketsApi.fetchAssignees().then(setAssignees, () => setAssignees([]));
  }, [load]);

  /** Runs one operation, reports a 409 or a failure, and always re-fetches. */
  async function operate(key: string, request: () => Promise<unknown>) {
    setConflict(null);
    setOperationFailed(false);
    setBusy(key);
    try {
      await request();
    } catch (error) {
      if (error instanceof ticketsApi.TicketRequestError && error.kind === "CONFLICT") {
        setConflict(error.conflictMessage ?? "This ticket has changed.");
      } else {
        setOperationFailed(true);
      }
    } finally {
      setBusy(null);
      setPendingTransition(null);
      await load();
    }
  }

  if (loadState === "loading") {
    return (
      <section data-testid="staff-ticket-detail-screen" aria-busy="true">
        <div className="zg-skeleton" />
        <div className="zg-skeleton" />
      </section>
    );
  }
  if (loadState === "not-found") {
    return (
      <section className="zg-callout zg-callout--forbidden" data-testid="state-not-found">
        <span className="zg-callout-icon" aria-hidden="true">
          ?
        </span>
        <div>
          <p className="zg-callout-text">This ticket could not be found.</p>
          <Link to="/staff/queue">Back to Ticket Queue</Link>
        </div>
      </section>
    );
  }
  if (loadState === "forbidden") return <Forbidden landingPath="/staff/queue" />;
  if (loadState === "failed" || ticket === null) {
    return (
      <div>
        <Callout variant="error" testId="callout-error">
          Something went wrong. Try again.
        </Callout>
        <button type="button" className="zg-btn zg-btn--secondary" onClick={() => void load()}>
          Retry
        </button>
      </div>
    );
  }

  const dialog = pendingTransition === null ? null : dialogFor(pendingTransition, ticket.ticketNumber);

  return (
    <section data-testid="staff-ticket-detail-screen">
      <header className="zg-detail-header">
        <h1 className="zg-title zg-mono">{ticket.ticketNumber}</h1>
        <StatusBadge status={ticket.currentStatus} />
        <span className="zg-label">IT Priority</span>
        <ItPriorityBadge priority={ticket.itPriority} />
        {ticket.requesterIndicatedResolvedAt !== null && (
          <AppearsResolvedIndicator at={ticket.requesterIndicatedResolvedAt} />
        )}
      </header>

      {conflict !== null && (
        <Callout variant="conflict" testId="callout-conflict">
          {conflict} The ticket has been reloaded.
        </Callout>
      )}
      {operationFailed && (
        <Callout variant="error" testId="callout-error">
          Something went wrong. Try again.
        </Callout>
      )}

      <div className="zg-detail-layout">
        <OperationsCard
          ticket={ticket}
          assignees={assignees}
          busy={busy}
          onClaim={() => void operate("claim", () => ticketsApi.claimTicket(ticket.id))}
          onAssign={(ownerId) => void operate("assign", () => ticketsApi.assignTicket(ticket.id, ownerId))}
          onSavePriority={(priority) => void operate("priority", () => ticketsApi.changeItPriority(ticket.id, priority))}
          onTransition={(target) => {
            if (dialogFor(target, ticket.ticketNumber) !== null) setPendingTransition(target);
            else void operate(`status-${target}`, () => ticketsApi.changeStatus(ticket.id, target));
          }}
        />

        <div className="zg-detail-content">
          <section className="zg-card" data-testid="ticket-information">
            <h2 className="zg-section-title">Ticket information</h2>
            <div className="zg-grid-2">
              <Field label="Ticket Date" value={new Date(ticket.ticketDate).toLocaleString()} />
              <Field label="Requester" value={`${ticket.requester.fullName} (${ticket.requester.email})`} />
              <Field label="Category" value={ticket.category.name} />
              <Field label="Related System" value={ticket.relatedSystem.name} />
              <div className="zg-readonly-field">
                <span className="zg-label">Requested Priority</span>
                <PriorityBadge priority={ticket.requestedPriority} />
              </div>
            </div>
            <Field label="Summary" value={ticket.summary} />
            <div className="zg-readonly-field">
              <span className="zg-label">Description</span>
              <span className="zg-readonly-value zg-preserve-lines">{ticket.description}</span>
            </div>
          </section>

          <ConversationCard ticketId={ticket.id} closed={ticket.currentStatus === "CLOSED"} />

          <AttachmentSection
            ticketId={ticket.id}
            requesterId=""
            attachments={ticket.attachments}
            onChanged={() => void load()}
            mode="read-only"
          />
        </div>
      </div>

      {pendingTransition !== null && dialog !== null && (
        <ConfirmDialog
          title={dialog.title}
          reasonRequired={dialog.reasonRequired}
          confirmLabel={dialog.confirmLabel}
          confirmVariant={dialog.confirmVariant}
          cancelLabel={dialog.cancelLabel}
          onConfirm={(reason) => operate(`status-${pendingTransition}`, () => ticketsApi.changeStatus(ticket.id, pendingTransition, reason))}
          onClose={() => setPendingTransition(null)}
        />
      )}
    </section>
  );
}

function OperationsCard({
  ticket,
  assignees,
  busy,
  onClaim,
  onAssign,
  onSavePriority,
  onTransition,
}: {
  ticket: StaffTicket;
  assignees: Assignee[];
  busy: string | null;
  onClaim: () => void;
  onAssign: (ownerId: string) => void;
  onSavePriority: (priority: Priority) => void;
  onTransition: (target: TicketStatus) => void;
}) {
  const [assignee, setAssignee] = useState("");
  const [priority, setPriority] = useState<Priority>(ticket.itPriority);

  // Each re-fetch shows the server's values again.
  useEffect(() => {
    setPriority(ticket.itPriority);
    setAssignee("");
  }, [ticket]);

  const ownerChangeable = OWNER_CHANGE_STATUSES.has(ticket.currentStatus);
  const working = busy !== null;

  return (
    <aside className="zg-card zg-operations" data-testid="operations-card">
      <h2 className="zg-section-title">Operations</h2>

      <div className="zg-ops-group">
        <h3 className="zg-label">Ticket Owner</h3>
        <p className={ticket.owner === null ? "zg-muted" : undefined} data-testid="ticket-owner">
          {ticket.owner?.fullName ?? "Unassigned"}
        </p>
        {ticket.owner === null && ownerChangeable && (
          <button
            type="button"
            className="zg-btn zg-btn--secondary"
            data-testid="btn-claim"
            disabled={working}
            aria-busy={busy === "claim" ? "true" : undefined}
            onClick={onClaim}
          >
            {busy === "claim" ? "Claiming…" : "Claim"}
          </button>
        )}
        {ownerChangeable && (
          <>
            <label className="zg-label" htmlFor="ops-assignee">
              Assign to
            </label>
            <select
              id="ops-assignee"
              className="zg-field"
              data-testid="field-assignee"
              value={assignee}
              disabled={working}
              onChange={(e) => setAssignee(e.target.value)}
            >
              <option value="">Choose a person</option>
              {assignees.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.fullName}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="zg-btn zg-btn--secondary"
              data-testid="btn-assign"
              disabled={working || assignee === ""}
              aria-busy={busy === "assign" ? "true" : undefined}
              onClick={() => onAssign(assignee)}
            >
              {busy === "assign" ? "Assigning…" : "Assign"}
            </button>
          </>
        )}
      </div>

      <div className="zg-ops-group">
        {PRIORITY_LOCKED_STATUSES.has(ticket.currentStatus) ? (
          <>
            <h3 className="zg-label">IT Priority</h3>
            <ItPriorityBadge priority={ticket.itPriority} />
          </>
        ) : (
          <>
            <label className="zg-label" htmlFor="ops-it-priority">
              IT Priority
            </label>
            <select
              id="ops-it-priority"
              className="zg-field"
              data-testid="field-it-priority"
              value={priority}
              disabled={working}
              onChange={(e) => setPriority(e.target.value as Priority)}
            >
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_TEXT[p]}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="zg-btn zg-btn--secondary"
              data-testid="btn-save-it-priority"
              disabled={working || priority === ticket.itPriority}
              aria-busy={busy === "priority" ? "true" : undefined}
              onClick={() => onSavePriority(priority)}
            >
              {busy === "priority" ? "Saving…" : "Save"}
            </button>
          </>
        )}
      </div>

      <div className="zg-ops-group">
        <h3 className="zg-label">Status</h3>
        <StatusBadge status={ticket.currentStatus} />
        <div className="zg-ops-actions">
          {ticket.availableTransitions.map((target) => (
            <button
              key={target}
              type="button"
              className={`zg-btn ${target === "CANCELLED" ? "zg-btn--destructive" : "zg-btn--secondary"}`}
              data-testid={`btn-transition-${target}`}
              disabled={working}
              aria-busy={busy === `status-${target}` ? "true" : undefined}
              onClick={() => onTransition(target)}
            >
              {busy === `status-${target}` ? "Updating…" : transitionLabel(target, ticket.currentStatus)}
            </button>
          ))}
        </div>
      </div>
    </aside>
  );
}

type Tab = "comments" | "notes";

function ConversationCard({ ticketId, closed }: { ticketId: string; closed: boolean }) {
  const [tab, setTab] = useState<Tab>("comments");
  const [comments, setComments] = useState<CommentOrNote[] | null>(null);
  const [notes, setNotes] = useState<CommentOrNote[] | null>(null);
  const [failed, setFailed] = useState(false);
  const tabRefs = { comments: useRef<HTMLButtonElement>(null), notes: useRef<HTMLButtonElement>(null) };

  const load = useCallback(async () => {
    setFailed(false);
    try {
      const [c, n] = await Promise.all([ticketsApi.fetchComments(ticketId), ticketsApi.fetchNotes(ticketId)]);
      setComments(c);
      setNotes(n);
    } catch {
      setFailed(true);
    }
  }, [ticketId]);

  useEffect(() => {
    void load();
  }, [load]);

  // WAI-ARIA tabs: arrow keys move between the two tabs (ui-spec 10).
  function onTabKey(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const next: Tab = tab === "comments" ? "notes" : "comments";
    setTab(next);
    tabRefs[next].current?.focus();
  }

  const closedText = <p className="zg-helper">This ticket is closed. Reopen it to add comments or notes.</p>;

  return (
    <section className="zg-card" data-testid="conversation-card">
      <div role="tablist" aria-label="Conversation" className="zg-tabs">
        <button
          ref={tabRefs.comments}
          type="button"
          role="tab"
          id="tab-comments"
          className="zg-tab"
          data-testid="tab-comments"
          aria-selected={tab === "comments"}
          aria-controls="panel-comments"
          tabIndex={tab === "comments" ? 0 : -1}
          onClick={() => setTab("comments")}
          onKeyDown={onTabKey}
        >
          Public Comments ({comments?.length ?? 0})
        </button>
        <button
          ref={tabRefs.notes}
          type="button"
          role="tab"
          id="tab-notes"
          className="zg-tab"
          data-testid="tab-notes"
          aria-selected={tab === "notes"}
          aria-controls="panel-notes"
          tabIndex={tab === "notes" ? 0 : -1}
          onClick={() => setTab("notes")}
          onKeyDown={onTabKey}
        >
          Internal Notes ({notes?.length ?? 0})
        </button>
      </div>

      {failed && (
        <div>
          <Callout variant="error" testId="callout-error">
            Something went wrong. Try again.
          </Callout>
          <button type="button" className="zg-btn zg-btn--secondary" onClick={() => void load()}>
            Retry
          </button>
        </div>
      )}

      {/* Only the active panel is rendered, so only one composer exists. */}
      {tab === "comments" ? (
        <div role="tabpanel" id="panel-comments" aria-labelledby="tab-comments">
          {comments !== null && <EntryList entries={comments} kind="comment" emptyText="No comments yet." />}
          {closed ? (
            closedText
          ) : (
            <Composer
              label="Reply to the requester (visible to the requester)"
              fieldTestId="field-comment-body"
              buttonTestId="btn-post-comment"
              buttonText="Post comment"
              buttonVariant="primary"
              onPost={(body) => ticketsApi.postComment(ticketId, body)}
              onPosted={(entry) => setComments((current) => [...(current ?? []), entry])}
            />
          )}
        </div>
      ) : (
        <div role="tabpanel" id="panel-notes" aria-labelledby="tab-notes">
          {notes !== null && <EntryList entries={notes} kind="note" emptyText="No internal notes yet." />}
          {closed ? (
            closedText
          ) : (
            // The composer sits inside the note treatment (ui-spec 6.5).
            <div className="zg-note-composer">
              <Composer
                label={NOTE_LABEL}
                fieldTestId="field-note-body"
                buttonTestId="btn-post-note"
                buttonText="Post internal note"
                buttonVariant="primary"
                onPost={(body) => ticketsApi.postNote(ticketId, body)}
                onPosted={(entry) => setNotes((current) => [...(current ?? []), entry])}
              />
            </div>
          )}
        </div>
      )}
    </section>
  );
}
