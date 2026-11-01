import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { MOBILE_QUERY, useMediaQuery } from "../../lab-02/useMediaQuery.js";
import { Callout } from "../../lab-03/components/Callout.js";
import { statusText } from "../../lab-03/components/Badges.js";
import type { Assignee } from "../../lab-03/tickets-api.js";
import { ACTION_EDITABLE_TICKET_STATUSES, summarize } from "../action-rules.js";
import * as actionsApi from "../actions-api.js";
import type { ActionSummary, ActionTaken, ActionWriteResult } from "../actions-api.js";
import { formatBangkok } from "../bangkok-time.js";
import { ActionStatusBadge, FollowUpIndicator } from "./ActionBadges.js";
import { ActionDialog } from "./ActionDialog.js";

// The Actions Taken card (docs/lab-04/ui-spec.md sections 4.1 and 4.2).
//
// Staff see "Actions Taken" with Record and Edit while the ticket allows it
// (BR-17), and never an Edit on a CANCELLED action (BR-16). The Requester sees
// the same list, read-only, titled "Work done on your ticket" (AC-11).
//
// Text is rendered as React text nodes only, so markup stays literal and line
// breaks are kept by zg-preserve-lines (AC-12).

type StaffProps = {
  mode: "staff";
  ticketStatus: string;
  /** From the detail's actionSummary (api-spec 3.1), when present. */
  summary?: ActionSummary;
  assignees: Assignee[];
  currentUser: { id: string; fullName: string };
  /** Applies the ticket's new version at once, then re-fetches the detail (Amendment 5). */
  onSaved: (ticketVersion: number) => void;
  onReloadTicket: () => Promise<void>;
};

type RequesterProps = { mode: "requester" };

export type ActionsTakenProps = {
  ticketId: string;
  /** The actions are re-fetched whenever this changes, e.g. the ticket version. */
  refreshKey?: unknown;
} & (StaffProps | RequesterProps);

type DialogState = { kind: "create" } | { kind: "edit"; action: ActionTaken } | null;

function lockedMessage(status: string): string | null {
  if (ACTION_EDITABLE_TICKET_STATUSES.has(status)) return null;
  if (status === "NEW") return "Actions can be recorded once the ticket is claimed.";
  return `This ticket is ${statusText(status)}. Reopen it to record more work.`;
}

function PerformedBy({ action }: { action: ActionTaken }) {
  return (
    <>
      <span>{action.performedBy.fullName}</span>
      {!action.performedBy.isActive && <span className="zg-muted"> (inactive)</span>}
      {action.createdBy.id !== action.performedBy.id && (
        <span className="zg-actions-small">Recorded by {action.createdBy.fullName}</span>
      )}
    </>
  );
}

function FollowUp({ action }: { action: ActionTaken }) {
  if (!action.followUpRequired) return <span aria-label="No follow-up">—</span>;
  return (
    <>
      <FollowUpIndicator />
      {action.followUpNote !== null && <span className="zg-actions-small zg-preserve-lines">{action.followUpNote}</span>}
    </>
  );
}

function ActionTime({ iso }: { iso: string }) {
  return <time dateTime={iso}>{formatBangkok(iso)}</time>;
}

/** Result and attachment notes, shown in Details on desktop and always on mobile. */
function Extra({ action }: { action: ActionTaken }) {
  return (
    <dl>
      <dt>Result</dt>
      <dd className="zg-preserve-lines">{action.result ?? "—"}</dd>
      <dt>Attachment notes</dt>
      <dd className="zg-preserve-lines">{action.attachmentNotes ?? "—"}</dd>
    </dl>
  );
}

export function ActionsTaken(props: ActionsTakenProps) {
  const { ticketId, refreshKey } = props;
  const staff = props.mode === "staff" ? props : null;
  const mobile = useMediaQuery(MOBILE_QUERY);
  const [actions, setActions] = useState<ActionTaken[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [dialog, setDialog] = useState<DialogState>(null);
  const [saved, setSaved] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const restoreFocus = useRef(false);

  const load = useCallback(async (): Promise<ActionTaken[] | null> => {
    try {
      const list = await actionsApi.fetchActions(ticketId);
      setActions(list);
      setLoadFailed(false);
      return list;
    } catch {
      setLoadFailed(true);
      return null;
    }
  }, [ticketId]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  // After a save, if the opener disappeared (an action became CANCELLED, so its
  // Edit is gone), focus moves to the card heading (ui-spec 4.4).
  useEffect(() => {
    if (!restoreFocus.current) return;
    restoreFocus.current = false;
    if (document.activeElement === null || document.activeElement === document.body) headingRef.current?.focus();
  }, [actions]);

  const canWrite = staff !== null && ACTION_EDITABLE_TICKET_STATUSES.has(staff.ticketStatus);
  const editable = (action: ActionTaken) => canWrite && action.status !== "CANCELLED";
  const summary = staff?.summary ?? summarize(actions ?? []);
  const title = staff !== null ? "Actions Taken" : "Work done on your ticket";

  function onSaved(result: ActionWriteResult) {
    setDialog(null);
    setSaved(true);
    restoreFocus.current = true;
    staff?.onSaved(result.ticketVersion);
    void load();
  }

  async function reloadForDialog(editedId: string | null): Promise<ActionTaken | null> {
    const [, list] = await Promise.all([staff?.onReloadTicket(), load()]);
    return editedId === null ? null : (list?.find((a) => a.id === editedId) ?? null);
  }

  const toggle = (id: string) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const editButton = (action: ActionTaken) =>
    editable(action) && (
      <button
        type="button"
        className="zg-btn zg-btn--secondary zg-btn--small"
        data-testid={`btn-edit-action-${action.id}`}
        aria-label={`Edit action from ${formatBangkok(action.actionAt)}`}
        onClick={() => {
          setSaved(false);
          setDialog({ kind: "edit", action });
        }}
      >
        Edit
      </button>
    );

  let list: JSX.Element | null = null;
  if (actions !== null && actions.length === 0) {
    list = (
      <p className="zg-helper" data-testid="actions-empty">
        No actions have been recorded yet.
      </p>
    );
  } else if (actions !== null && mobile) {
    list = (
      <ul className="zg-action-cards">
        {actions.map((action) => (
          <li key={action.id} className="zg-action-card" data-testid={`action-card-${action.id}`}>
            <dl>
              <dt>Date/Time</dt>
              <dd>
                <ActionTime iso={action.actionAt} />
              </dd>
              <dt>Description</dt>
              <dd className="zg-preserve-lines">{action.description}</dd>
              <dt>Performed by</dt>
              <dd>
                <PerformedBy action={action} />
              </dd>
              <dt>Status</dt>
              <dd>
                <ActionStatusBadge status={action.status} />
              </dd>
              <dt>Follow-up</dt>
              <dd>
                <FollowUp action={action} />
              </dd>
            </dl>
            <Extra action={action} />
            {editButton(action)}
          </li>
        ))}
      </ul>
    );
  } else if (actions !== null) {
    list = (
      <div className="zg-table-scroll">
        <table className="zg-table">
          <thead>
            <tr>
              <th scope="col">Date/Time</th>
              <th scope="col">Description</th>
              <th scope="col">Performed by</th>
              <th scope="col">Status</th>
              <th scope="col" className="zg-actions-col-follow-up">
                Follow-up
              </th>
              <th scope="col">{staff !== null ? "Edit" : <span className="visually-hidden">Details</span>}</th>
            </tr>
          </thead>
          <tbody>
            {actions.map((action) => {
              const open = expanded.has(action.id);
              const panelId = `action-details-${action.id}`;
              return (
                <Fragment key={action.id}>
                  <tr data-testid={`action-row-${action.id}`}>
                    <td>
                      <ActionTime iso={action.actionAt} />
                    </td>
                    <td>
                      <span className="zg-preserve-lines zg-clamp-2">{action.description}</span>
                    </td>
                    <td>
                      <PerformedBy action={action} />
                    </td>
                    <td>
                      <ActionStatusBadge status={action.status} />
                    </td>
                    <td className="zg-actions-col-follow-up">
                      <FollowUp action={action} />
                    </td>
                    <td>
                      <div className="zg-actions-row-buttons">
                        <button
                          type="button"
                          className="zg-btn zg-btn--secondary zg-btn--small"
                          data-testid={`btn-action-details-${action.id}`}
                          aria-expanded={open}
                          aria-controls={panelId}
                          onClick={() => toggle(action.id)}
                        >
                          Details
                        </button>
                        {editButton(action)}
                      </div>
                    </td>
                  </tr>
                  {open && (
                    <tr className="zg-actions-details" id={panelId}>
                      <td colSpan={6}>
                        <Extra action={action} />
                        <div className="zg-actions-follow-up-detail">
                          <FollowUp action={action} />
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  const locked = staff !== null ? lockedMessage(staff.ticketStatus) : null;

  return (
    <section className="zg-card zg-actions-card" id="actions" data-testid="actions-card" aria-labelledby="actions-heading">
      <h2 id="actions-heading" ref={headingRef} className="zg-section-title zg-actions-heading" tabIndex={-1}>
        {title}
      </h2>

      {saved && (
        <Callout variant="success" testId="callout-success">
          Action saved.
        </Callout>
      )}

      {actions === null && !loadFailed && (
        <div className="zg-skeleton" aria-busy="true" />
      )}
      {loadFailed && (
        <div>
          <Callout variant="error" testId="actions-error">
            We couldn't load the actions. Try again.
          </Callout>
          <button type="button" className="zg-btn zg-btn--secondary" onClick={() => void load()}>
            Retry
          </button>
        </div>
      )}

      {actions !== null && (
        <p className="zg-actions-summary" data-testid="actions-summary">
          {summary.total} actions · {summary.open} open · {summary.outstandingFollowUps} follow-ups outstanding
        </p>
      )}
      {list}

      {staff !== null && (
        <div className="zg-actions-footer">
          {locked !== null ? (
            <p className="zg-helper" data-testid="actions-locked-message">
              {locked}
            </p>
          ) : (
            <button
              type="button"
              className="zg-btn zg-btn--secondary"
              data-testid="btn-record-action"
              onClick={() => {
                setSaved(false);
                setDialog({ kind: "create" });
              }}
            >
              Record action
            </button>
          )}
        </div>
      )}

      {staff !== null && dialog !== null && (
        <ActionDialog
          ticketId={ticketId}
          action={dialog.kind === "edit" ? dialog.action : undefined}
          assignees={staff.assignees}
          currentUser={staff.currentUser}
          onSaved={onSaved}
          onClose={() => setDialog(null)}
          onReload={() => reloadForDialog(dialog.kind === "edit" ? dialog.action.id : null)}
        />
      )}
    </section>
  );
}
