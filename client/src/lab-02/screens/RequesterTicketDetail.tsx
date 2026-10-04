import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import * as api from "../api.js";
import type { TicketDetail } from "../api.js";
import { useAuth } from "../../lab-03/AuthContext.js";
import { AttachmentSection } from "../components/AttachmentSection.js";
import { AppearsResolvedIndicator, PriorityBadge, StatusBadge } from "../../lab-03/components/Badges.js";
import { Callout } from "../../lab-03/components/Callout.js";
import { ConfirmDialog } from "../../lab-03/components/ConfirmDialog.js";
import { RequesterComments } from "../../lab-03/components/RequesterComments.js";
import * as ticketsApi from "../../lab-03/tickets-api.js";

// Requester Ticket Detail -- ui-spec.md section 5.5.
//
// The ticket region is entirely read-only: no input, no edit control, no
// status control anywhere.
//
// Lab 3 (#44, docs/lab-03/ui-spec.md 6.3) adds "Assigned to", the resolution
// panel, the Comments card, and the attachment lock. The Requester still gets
// no status, cancel, reopen, claim, assign, or IT Priority control, and no
// Internal Notes (AC-27, BR-53).

/** Statuses in which "Problem appears resolved" may be indicated (BR-43). */
const RESOLUTION_STATUSES = new Set(["OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "REOPENED"]);

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="zg-readonly-field">
      <span className="zg-label">{label}</span>
      <span className="zg-readonly-value">{value}</span>
    </div>
  );
}

export function RequesterTicketDetail() {
  const { ticketId } = useParams();
  // The signed-in Requester (Lab 3 #38); the route guard admits no other role.
  const { user: requester } = useAuth();
  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [conflict, setConflict] = useState<string | null>(null);
  const [actionFailed, setActionFailed] = useState(false);

  const load = useCallback(async () => {
    if (requester === null || ticketId === undefined) return;
    setLoading(true);
    setFailed(false);
    try {
      setTicket(await api.fetchTicket(requester.id, ticketId));
    } catch {
      // A ticket that does not exist and one owned by somebody else are
      // refused identically by the server, and are presented identically here
      // (BR-18, DEC-01). The thrown error never reaches the page (BR-28).
      setTicket(null);
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [requester, ticketId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function indicateResolved() {
    setConflict(null);
    setActionFailed(false);
    try {
      const { requesterIndicatedResolvedAt } = await ticketsApi.indicateAppearsResolved(ticketId!);
      setTicket((current) => (current === null ? current : { ...current, requesterIndicatedResolvedAt }));
    } catch (error) {
      if (error instanceof ticketsApi.TicketRequestError && error.kind === "CONFLICT") {
        setConflict(error.conflictMessage ?? "This ticket has changed.");
        void load();
      } else {
        setActionFailed(true);
      }
    } finally {
      setConfirming(false);
    }
  }

  if (loading) {
    return (
      <p className="zg-helper" data-testid="state-loading" aria-busy="true">
        Loading the ticket...
      </p>
    );
  }

  if (failed || ticket === null) {
    return (
      <div className="zg-callout-error" data-testid="state-detail-failed" role="alert">
        <p>This ticket could not be found.</p>
        <Link className="zg-btn zg-btn--secondary" data-testid="btn-back-to-list" to="/tickets">
          Back to My Tickets
        </Link>
      </div>
    );
  }

  return (
    <section data-testid="ticket-detail-screen">
      <div className="zg-list-header">
        <h1 className="zg-title">{ticket.ticketNumber}</h1>
        <Link className="zg-btn zg-btn--secondary" data-testid="btn-back-to-list" to="/tickets">
          Back to My Tickets
        </Link>
      </div>

      {/* Region one: read-only. Deliberately contains no control of any kind. */}
      <section className="zg-card" data-testid="ticket-information">
        <div className="zg-grid-2">
          <Field label="Ticket Number" value={ticket.ticketNumber} />
          <Field label="Ticket Date" value={new Date(ticket.ticketDate).toLocaleString()} />
          <Field label="Requester" value={ticket.requester.fullName} />
          <div className="zg-readonly-field">
            <span className="zg-label">Current Status</span>
            <StatusBadge status={ticket.currentStatus} />
          </div>
          <div className="zg-readonly-field">
            <span className="zg-label">Assigned to</span>
            {ticket.owner ? (
              <span className="zg-readonly-value">{ticket.owner.fullName}</span>
            ) : (
              <span className="zg-readonly-value zg-muted">Not yet assigned</span>
            )}
          </div>
          <Field label="Category" value={ticket.category.name} />
          <Field label="Related System" value={ticket.relatedSystem.name} />
          <div className="zg-readonly-field">
            <span className="zg-label">Requested Priority</span>
            <PriorityBadge priority={ticket.requestedPriority} />
          </div>
        </div>

        <Field label="Ticket Summary" value={ticket.summary} />

        <div className="zg-readonly-field">
          <span className="zg-label">Description</span>
          {/* Line breaks preserved, wrapped, never truncated (ui-spec 5.5). */}
          <span className="zg-readonly-value zg-preserve-lines" data-testid="ticket-description">
            {ticket.description}
          </span>
        </div>
      </section>

      {conflict !== null && (
        <Callout variant="conflict" testId="callout-conflict">
          {conflict} The ticket has been reloaded.
        </Callout>
      )}
      {actionFailed && (
        <Callout variant="error" testId="callout-error">
          Something went wrong. Try again.
        </Callout>
      )}

      {RESOLUTION_STATUSES.has(ticket.currentStatus) && (
        <section className="zg-card" data-testid="resolution-panel">
          {ticket.requesterIndicatedResolvedAt ? (
            <AppearsResolvedIndicator at={ticket.requesterIndicatedResolvedAt} />
          ) : (
            <>
              <p>Has the problem gone away?</p>
              <button
                type="button"
                className="zg-btn zg-btn--secondary"
                data-testid="btn-appears-resolved"
                onClick={() => setConfirming(true)}
              >
                Problem appears resolved
              </button>
            </>
          )}
        </section>
      )}

      <RequesterComments ticketId={ticket.id} closed={ticket.currentStatus === "CLOSED"} />

      <AttachmentSection
        ticketId={ticket.id}
        requesterId={requester!.id}
        attachments={ticket.attachments}
        onChanged={() => void load()}
        mode={ticket.currentStatus === "CLOSED" || ticket.currentStatus === "CANCELLED" ? "locked" : "edit"}
      />

      {confirming && (
        <ConfirmDialog
          title="Tell IT the problem appears resolved?"
          text="IT will review and formally resolve the ticket."
          confirmLabel="Yes, it appears resolved"
          onConfirm={() => indicateResolved()}
          onClose={() => setConfirming(false)}
        />
      )}
    </section>
  );
}
