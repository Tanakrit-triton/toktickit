import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import * as api from "../api.js";
import type { TicketDetail } from "../api.js";
import { useRequester } from "../RequesterContext.js";
import { AttachmentSection } from "../components/AttachmentSection.js";

// Requester Ticket Detail -- ui-spec.md section 5.5.
//
// Two clearly separated regions. The ticket region is entirely read-only: no
// input, no edit control, no status control anywhere. Every interactive
// control on this screen belongs to the attachment region below it.

const PRIORITY_LABEL: Record<string, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  URGENT: "Urgent",
};

const PRIORITY_GLYPH: Record<string, string> = {
  LOW: "\u25CB",
  MEDIUM: "\u25D4",
  HIGH: "\u25D1",
  URGENT: "\u25CF",
};

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
  const { requester } = useRequester();
  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

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
            <span className="zg-badge zg-badge--status-new" data-testid="badge-status">
              New
            </span>
          </div>
          <Field label="Category" value={ticket.category.name} />
          <Field label="Related System" value={ticket.relatedSystem.name} />
          <div className="zg-readonly-field">
            <span className="zg-label">Requested Priority</span>
            <span
              className={`zg-badge zg-badge--priority-${ticket.requestedPriority.toLowerCase()}`}
              data-testid="badge-priority"
            >
              {PRIORITY_GLYPH[ticket.requestedPriority]}{" "}
              {PRIORITY_LABEL[ticket.requestedPriority] ?? ticket.requestedPriority}
            </span>
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

      {/* Region two: every interactive control on the screen. */}
      <AttachmentSection
        ticketId={ticket.id}
        requesterId={requester!.id}
        attachments={ticket.attachments}
        onChanged={() => void load()}
      />
    </section>
  );
}
