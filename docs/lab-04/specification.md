# Lab 4 Sprint Engineering Specification

**Project:** TokTickIT — Actions Taken, Dashboards, and Final Regression
**Sprint:** Lab 4 (Sprint 4)
**Author:** Tanakrit (67070503464)
**Issue:** #69 Sprint 4 engineering contract
**Status:** Draft for approval — must be merged before implementation PRs begin
**Inherits:** TokTickIT System-Level SDS v1.0 (D-01 … D-12), the merged Lab 2 contract in `docs/lab-02/`, and the merged Lab 3 contract in `docs/lab-03/`
**Companion documents:** `api-spec.md`, `ui-spec.md`, `tests.md`

Earlier identifiers carry a prefix so they cannot be confused with the Lab 4
identifiers defined here: `L2-BR-18`, `L3-BR-35`, `L3-DEV-10`.

---

## 1. Sprint Goal

Give IT Staff a reliable record of the work done on each ticket. Every ticket
can now hold many Actions Taken. Each one records when the work happened, what
was done, the result, who did it, and whether a follow-up is needed. The
Ticket Owner still coordinates the ticket, but any IT Staff member can record
an action. A ticket cannot be resolved while work on it is still open. Each
role gets a concise dashboard that links to the existing detailed screens.
The complete product built in Labs 1 to 3 keeps working, and stale updates no
longer silently overwrite another user's change.

---

## 2. Stakeholder Request Interpretation

The stakeholder wants a record of the work itself, not just of the
conversation. Comments and notes say what people said. Actions Taken say what
people did.

Five parts of the request need engineering interpretation.

**"Each action should contain … Performed by (auto)."** The handout (§3, §8.3)
lists seven fields with "Performed by" set automatically. Its own AC-01 and
the grading for Part 6 also require an assignee, action statuses (complete,
cancel), and rejection of an inactive assignee. These cannot all be true if
"Performed by" is only the creator. This contract resolves it with two fields
(DEC-01):
- `createdBy` is always set by the server from the session ("auto");
- `performedBy` defaults to the creator, and may be set to another active IT Staff or Administrator user. This is the assignee in AC-01 and BR-02.

**"Plan and track the actual work."** Planning implies that an action can exist
before it is finished. Each action therefore has its own status: Planned, In
Progress, Completed, or Cancelled (DEC-02).

**"IT Staff must review the work and formally update the Ticket."** The Lab 3
workflow already stops a Requester from resolving a ticket (L3-BR-05). Lab 4
adds the resolution gate: a ticket cannot become Resolved while any action is
still open, or while a follow-up is still marked as required (BR-20).

**"Concise dashboards connected to the detailed screens."** Dashboards are
counts and short lists calculated by the server. Each card links to a filtered
My Tickets or Ticket Queue view, or to a Ticket Detail screen. A dashboard
never replaces a list screen.

**"One user does not unknowingly overwrite another user's recent change"**
(handout §6.1). Lab 3 deferred this as L3-DEV-10. Lab 4 adds a version number
to tickets and actions. A write based on an old version is refused (BR-27).

---

## 3. Scope

### Included

- Actions Taken: data model, migration, list, create, edit, status changes, and follow-up flag
- Actions Taken visible to the ticket's Requester (read-only) and to IT Staff and Administrators
- Resolution gate based on open actions and outstanding follow-ups
- Optimistic concurrency (`version`) for every ticket workflow write and every action edit
- Idempotent action creation, so a double click or network retry never creates two actions
- Recording `resolvedAt` on tickets, with a backfill for existing Resolved and Closed tickets
- Ticket History (read-only list of Ticket Events) on IT Staff Ticket Detail
- Requester Dashboard and IT Staff Dashboard (the Administrator variant adds user counts)
- `status` and `statusGroup` filters on My Tickets, and `statusGroup` on the Ticket Queue, as dashboard drill-down targets
- Updated idempotent seed covering tickets with zero, one, and several actions
- Final hardening: regression of Labs 1 to 3, consistent feedback states, accessibility, responsive layout, and removal of leftover UI
- Automated tests at unit, migration, API, UI component, UI style, responsive, performance-smoke, regression, and E2E levels

### Excluded

Anything here appearing in the implementation is a defect.

- **Handout §4.2 exclusions:** SLA clocks, escalation, on-call scheduling, breach notifications; email, SMS, LINE, push, or any other notification; inventory, spare parts, purchasing, cost accounting; time sheets, billing, payroll, labor cost; multi-level approvals and electronic signatures; BI tools, custom report builders, export warehouses; multi-tenancy and production cloud operations
- **Action extras:** deleting actions; uploading files to an action (Attachment Notes is free text pointing at the ticket's existing attachments, DEC-05); time spent or duration fields; action templates; bulk action edits
- **Dashboard extras:** charts, date-range pickers, export, user-configurable cards, auto-refresh
- **Still deferred:** Requester cancel and reopen (L3-DEV-05), staff attachment upload (L3-DEV-07), resolution summary (L3-DEV-11), content-based upload detection (L3-DEV-15), editing or deleting comments and notes
- **Landing page change:** `/` keeps the Lab 3 landing screens (DEC-11)

---

## 4. Functional Requirements

### Actions Taken

| ID | Requirement |
|---|---|
| FR-01 | The system shall let IT Staff and Administrators create an Action Taken on a ticket, recording action date and time, description, status, result, performer, follow-up flag, follow-up note, and attachment notes. |
| FR-02 | The system shall record the creator and creation time of every Action Taken automatically. |
| FR-03 | The system shall let IT Staff and Administrators edit an Action Taken and change its status, as permitted by Section 5.2. |
| FR-04 | The system shall list a ticket's Actions Taken in a stable order on IT Staff Ticket Detail and on Requester Ticket Detail. |
| FR-05 | The system shall show Actions Taken to the ticket's Requester read-only, and shall not let a Requester create or change them. |

### Ticket workflow

| ID | Requirement |
|---|---|
| FR-06 | The system shall enforce the final ticket transition matrix in Section 5.4 on the server. |
| FR-07 | The system shall refuse to resolve a ticket while it has open actions or outstanding follow-ups, and say why. |
| FR-08 | The system shall detect a write based on an outdated ticket or action, refuse it, and let the user reload without losing what they typed. |
| FR-09 | The system shall show IT Staff and Administrators a read-only, append-only history of a ticket's owner, status, IT Priority, resolution-indication, and action changes. |

### Dashboards

| ID | Requirement |
|---|---|
| FR-10 | The system shall provide a Requester Dashboard showing only the authenticated Requester's tickets: open tickets, tickets waiting for them, recently updated tickets, and recently resolved tickets. |
| FR-11 | The system shall provide an IT Staff Dashboard showing unassigned tickets, tickets owned by the current user, the current user's open actions, ticket counts by status and by IT Priority, urgent tickets, and recently updated tickets. |
| FR-12 | The system shall show Administrators the IT Staff Dashboard plus counts of user accounts by role and activation state. |
| FR-13 | The system shall calculate every dashboard value on the server, and link every card or list item to a filtered list or Ticket Detail where practical. |

### Hardening and regression

| ID | Requirement |
|---|---|
| FR-14 | The system shall keep every Lab 1, Lab 2, and Lab 3 function working for the roles permitted to use it. |
| FR-15 | The system shall present consistent loading, validation, success, empty, no-results, forbidden, not-found, conflict, and safe-failure feedback on every screen. |
| FR-16 | The system shall prevent or safely absorb duplicate submissions caused by repeated clicks or network retries. |
| FR-17 | The system shall render every screen usably at desktop, tablet, and mobile widths, meeting the Lab 2 and Lab 3 responsive and accessibility rules. |
| FR-18 | The system shall migrate the Lab 3 database without losing or changing any existing User, Ticket, Attachment, Public Comment, Internal Note, Ticket Event, or Session row. |

---

## 5. Business Rules

### 5.1 Actions Taken: structure and fields

| ID | Rule |
|---|---|
| BR-01 | An Action Taken belongs to exactly one ticket. It never moves to another ticket. |
| BR-02 | The Ticket Owner coordinates the ticket, but an Action Taken may be performed by a different IT Staff member or Administrator. Performer and owner are independent fields. |
| BR-03 | `createdBy` and `createdAt` are set by the server from the session and the clock. Any value supplied by the client is ignored. |
| BR-04 | `performedBy` defaults to the caller. When it is set on create, or changed on edit, it must be an existing, active user with role `IT_STAFF` or `ADMINISTRATOR`. Otherwise the request is refused with 422 on `performedById`. An action keeps its performer if that user is later deactivated, and shows "(inactive)" beside the name. |
| BR-05 | `actionAt` (Action Date/Time) is required. It must not be earlier than the ticket's `createdAt`, and not later than 30 days after the current time. |
| BR-06 | An action in, or moving to, `COMPLETED` must have `actionAt` no later than the current time plus 5 minutes. Completed work cannot be dated in the future. The 5 minutes absorb clock skew between client and server. |
| BR-07 | `description` is trimmed and must be 5–2000 characters. |
| BR-08 | `result` is trimmed and is at most 2000 characters. It is required (at least 1 character) when the action is in, or moves to, `COMPLETED` or `CANCELLED`. For a cancelled action, the result records why. |
| BR-09 | `followUpRequired` is a boolean, false by default. When it is true, `followUpNote` is required: trimmed, 5–1000 characters. When it is false, `followUpNote` is stored as null, whatever the client sent. |
| BR-10 | `attachmentNotes` is optional free text, trimmed, at most 500 characters. It tells the reader which of the ticket's attachments to look at. It is not a link and does not validate filenames (DEC-05). |
| BR-11 | All action text is stored and rendered as plain text with line breaks preserved, never as HTML or Markdown (as L3-BR-49). |
| BR-12 | Actions are never deleted. Cancelling replaces deletion. |

### 5.2 Actions Taken: status and editing

| ID | Rule |
|---|---|
| BR-13 | The action statuses are Planned, In Progress, Completed, and Cancelled, stored as `PLANNED`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED`. |
| BR-14 | An action may be created as `PLANNED`, `IN_PROGRESS`, or `COMPLETED`. It cannot be created as `CANCELLED`. |
| BR-15 | Only the action transitions in the table below are permitted. Any other change of `status`, including any change from a terminal status, is refused with `INVALID_ACTION_TRANSITION`. An edit that repeats the stored status is not a status change, and is treated like any other unchanged value (Amendment 1). |
| BR-16 | `PLANNED` and `IN_PROGRESS` actions are fully editable. On a `COMPLETED` action, only `description`, `result`, `followUpRequired`, `followUpNote`, `attachmentNotes`, and `actionAt` may change; changing `performedById` is refused with `ACTION_STATE_CONFLICT`. A `CANCELLED` action is read-only, and any field edit is refused with `ACTION_STATE_CONFLICT`. A status change on either is refused by BR-15 with `INVALID_ACTION_TRANSITION`, which is checked first (Amendment 1). |
| BR-17 | Actions may be created or edited only while the ticket is `OPEN`, `IN_PROGRESS`, `WAITING_FOR_REQUESTER`, or `REOPENED`. In `NEW` (claim the ticket first), `RESOLVED`, `CLOSED`, or `CANCELLED`, the request is refused with `TICKET_STATE_CONFLICT`. |
| BR-18 | Creating or editing an action does not change the ticket's status, owner, or IT Priority. No hidden side effect (as L3-DEC-09). |
| BR-19 | Actions are listed by `actionAt` ascending, then `createdAt` ascending, then `id` ascending, so the order is stable even when two actions share a time. |

**Action transition table (BR-15).** IT Staff or Administrator only.

| From | To | Extra requirement |
|---|---|---|
| PLANNED | IN_PROGRESS | — |
| PLANNED | COMPLETED | `result` (BR-08), `actionAt` not in the future (BR-06) |
| PLANNED | CANCELLED | `result` stating why (BR-08) |
| IN_PROGRESS | COMPLETED | `result`, `actionAt` not in the future |
| IN_PROGRESS | CANCELLED | `result` stating why |

`COMPLETED` and `CANCELLED` are terminal. To redo work, record a new action.

**"Open" and "outstanding".** An action is *open* when its status is `PLANNED`
or `IN_PROGRESS`. A follow-up is *outstanding* when an action that is not
`CANCELLED` has `followUpRequired = true`.

### 5.3 Resolution gate

| ID | Rule |
|---|---|
| BR-20 | A ticket may move to `RESOLVED` only when it has no open action and no outstanding follow-up. Otherwise the transition is refused with `409 RESOLUTION_BLOCKED`, and the message states both counts. The rule is enforced in the same transaction as the status change, so it holds even when a client bypasses the screen. |
| BR-21 | A ticket with no actions at all may be resolved. Legacy tickets therefore keep their Lab 3 behaviour (DEC-04). |
| BR-22 | A follow-up is cleared by editing that action and setting `followUpRequired` to false, normally after a new action records the follow-up work. |
| BR-23 | A Requester's "Problem appears resolved" indication stays advisory (L3-BR-43). It never changes the status and never satisfies or bypasses the gate. |

### 5.4 Final ticket status transitions

The Lab 3 matrix (L3-BR-34 to L3-BR-41) is the final matrix, with the
resolution gate added to every transition into `RESOLVED`. It is restated here
in full so that this document is complete.

| ID | Rule |
|---|---|
| BR-24 | Only the transitions below are permitted, only for IT Staff and Administrators, and only with the current ticket `version` (BR-27). Every other pair is refused with `INVALID_STATUS_TRANSITION`. |
| BR-25 | Entering `RESOLVED` sets `resolvedAt` to the current time. Entering `CLOSED` keeps it. Entering `REOPENED` clears it. No other transition changes it. |
| BR-26 | Requesters may still perform no transition (L3-DEV-05). |

| From | To | Owner required | Input | Confirmation | Gate (BR-20) |
|---|---|---|---|---|---|
| NEW | OPEN | set by claim or assign (L3-BR-38) | — | — | — |
| NEW | CANCELLED | no | reason | yes | — |
| OPEN | IN_PROGRESS | yes | — | — | — |
| OPEN | RESOLVED | yes | — | yes | **yes** |
| OPEN | CANCELLED | no | reason | yes | — |
| IN_PROGRESS | WAITING_FOR_REQUESTER | yes | — | — | — |
| IN_PROGRESS | RESOLVED | yes | — | yes | **yes** |
| IN_PROGRESS | CANCELLED | no | reason | yes | — |
| WAITING_FOR_REQUESTER | IN_PROGRESS | yes | — | — | — |
| WAITING_FOR_REQUESTER | RESOLVED | yes | — | yes | **yes** |
| WAITING_FOR_REQUESTER | CANCELLED | no | reason | yes | — |
| REOPENED | IN_PROGRESS | yes | — | — | — |
| REOPENED | RESOLVED | yes | — | yes | **yes** |
| REOPENED | CANCELLED | no | reason | yes | — |
| RESOLVED | CLOSED | yes | — | yes | — |
| RESOLVED | REOPENED | no | reason | yes | — |
| CLOSED | REOPENED | no | reason | yes | — |
| CANCELLED | REOPENED | no | reason | yes | — |

`RESOLVED → CLOSED` needs no gate: actions cannot be created or edited while
the ticket is `RESOLVED` (BR-17), so the gate still holds. Cancelling a ticket
with open actions is permitted. Those actions stay as they are, and dashboards
ignore actions on tickets that are not active (BR-35).

**Ticket status groups**, used by dashboards and filters:
- **Active:** `NEW`, `OPEN`, `IN_PROGRESS`, `WAITING_FOR_REQUESTER`, `REOPENED`.
- **Done:** `RESOLVED`, `CLOSED`.
- `CANCELLED` is in neither group.

### 5.5 Concurrency and duplicate submission

| ID | Rule |
|---|---|
| BR-27 | Every ticket has an integer `version`, starting at 0. It increases by 1 on every change to the ticket row: claim, owner change, IT Priority change, status change, resolution indication, and every action create or edit on that ticket. |
| BR-28 | Owner change, IT Priority change, and status change require the client's `version`. If it differs from the stored version, the request is refused with `409 STALE_UPDATE` and nothing changes. The check and the update are one conditional `UPDATE … WHERE version = $expected`. |
| BR-29 | Every action has its own `version`. An action edit requires it, with the same `STALE_UPDATE` rule. |
| BR-30 | Action create increments the ticket's `version` with a conditional update on the ticket's status in the same transaction. A resolve and an action create racing on one ticket therefore serialize: whichever commits second receives `STALE_UPDATE` or `TICKET_STATE_CONFLICT`. |
| BR-31 | Action create requires a client-generated `clientRequestId` (UUID). A repeat of the same id on the same ticket returns the existing action with 200 and creates nothing. The same id on a different ticket is refused with 422. |
| BR-32 | Claim keeps its conditional update (L3-DEC-13) and needs no version. "Problem appears resolved" needs no version, because repeating it is already refused (L3-BR-44). Both still increment the version. |
| BR-33 | Posting a Public Comment, and creating or editing an action, set the ticket's `updatedAt` to the current time, so "recently updated" reflects activity the Requester can see. Posting an Internal Note does not, so the Requester cannot infer that a note exists (L3-BR-53). |

### 5.6 Authorization matrix (Lab 4 operations)

The Lab 3 matrix (L3 §5.5) is unchanged. Rows added:

| Operation | Requester | IT Staff | Administrator |
|---|---|---|---|
| List a ticket's Actions Taken | Own; else 404 | Yes | Yes |
| Create, edit, change status of an Action Taken | 403 | Yes | Yes |
| Read Ticket History | 403 | Yes | Yes |
| Requester Dashboard | Yes (own data only) | 403 | 403 |
| IT Staff Dashboard | 403 | Yes | Yes, plus user counts |

A Requester's action list contains only actions on their own tickets. The role
check runs before any lookup (L3-BR-23).

### 5.7 Ticket History

| ID | Rule |
|---|---|
| BR-34 | Ticket Events stay append-only (L3-BR-54). Lab 4 adds `ACTION_CREATED { actionId, status, performedById }` and `ACTION_UPDATED { actionId, changes }`, where `changes` lists each changed field. For `status`, `performedById`, and `followUpRequired`, it holds `{ from, to }`. For text fields, it holds `{ changed: true }` only. History is listed oldest first, then by `id`, and is visible only to IT Staff and Administrators. |

### 5.8 Dashboards

| ID | Rule |
|---|---|
| BR-35 | Every dashboard value is calculated by the server from the database at request time. Nothing is cached or stored. Actions on tickets outside the Active group are ignored. |
| BR-36 | **Recent window.** "Recent" means from 00:00 Asia/Bangkok, six calendar days before today, up to the request time: today plus the previous six days. Thailand has no daylight-saving time, so this is a fixed UTC+07:00 offset (A-02). The response states the window. |
| BR-37 | A dashboard list shows at most 5 items. Its count, where it has one, is the full count, not the length of the list. |
| BR-38 | A count of zero is shown as 0 with an empty message. It is never hidden. A list with no items shows its empty message. |
| BR-39 | The Requester Dashboard filters every query on `requesterId = caller`. No value describes another Requester's tickets. |

**Requester Dashboard metrics** (all filtered by BR-39):

| Key | Label | Calculation | Drill-down |
|---|---|---|---|
| `openTickets` | Open tickets | count, status in Active | `/tickets?statusGroup=ACTIVE` |
| `waitingForMe` | Waiting for you | count, status = `WAITING_FOR_REQUESTER` | `/tickets?status=WAITING_FOR_REQUESTER` |
| `updatedRecently` | Updated recently | count, `updatedAt` in window | `/tickets?sortBy=updatedAt&sortOrder=desc` |
| `resolvedRecently` | Resolved recently | count, status in Done and `resolvedAt` in window | `/tickets?statusGroup=DONE` |
| list `needsAttention` | Needs your attention | status = `WAITING_FOR_REQUESTER`, `updatedAt` desc | each item → `/tickets/{id}` |
| list `recentlyUpdated` | Recently updated | `updatedAt` in window, `updatedAt` desc | each item → `/tickets/{id}` |
| list `recentlyResolved` | Recently resolved | Done, `resolvedAt` in window, `resolvedAt` desc | each item → `/tickets/{id}` |

**IT Staff Dashboard metrics:**

| Key | Label | Calculation | Drill-down |
|---|---|---|---|
| `unassigned` | Unassigned | count, Active and `ownerId` null | `/staff/queue?owner=unassigned&statusGroup=ACTIVE` |
| `ownedByMe` | Owned by me | count, Active and `ownerId` = caller | `/staff/queue?owner=me&statusGroup=ACTIVE` |
| `myOpenActions` | My open actions | count, actions with `performedById` = caller, status open, ticket Active | list items |
| `byStatus` | Tickets by status | count per status, all 8 always present | `/staff/queue?status={S}` |
| `activeByItPriority` | Active by IT Priority | count per IT Priority over Active, all 4 always present | `/staff/queue?itPriority={P}&statusGroup=ACTIVE` |
| list `myOpenActions` | My open actions | as above, `actionAt` asc | each → `/staff/tickets/{ticketId}#actions` |
| list `urgent` | Urgent and active | Active and `itPriority = URGENT`, `createdAt` asc (oldest first) | each → `/staff/tickets/{id}` |
| list `recentlyUpdated` | Recently updated | all tickets, `updatedAt` in window, `updatedAt` desc | each → `/staff/tickets/{id}` |
| `users` (Administrator only) | User accounts | active count per role, plus total inactive | none (DEC-10) |

---

## 6. UI Specification Summary

The full specification is in `ui-spec.md`. This section records the binding decisions.

### Screens and routes

| Route | Screen | Roles |
|---|---|---|
| `/dashboard` | Requester Dashboard | Requester |
| `/staff/dashboard` | IT Staff Dashboard (Administrator variant adds user counts) | IT Staff, Administrator |
| `/tickets` | My Tickets, now reading `status` and `statusGroup` from the URL | Requester |
| `/tickets/{ticketId}` | Requester Ticket Detail, with a read-only Actions Taken card | Requester |
| `/staff/queue` | Ticket Queue, now reading `statusGroup` from the URL | IT Staff, Administrator |
| `/staff/tickets/{ticketId}` | IT Staff Ticket Detail, with Actions Taken and History | IT Staff, Administrator |
| All other Lab 2 and Lab 3 routes | unchanged | unchanged |

Navigation by role (Dashboard comes first):
- **Requester:** Dashboard, My Tickets, Create Ticket.
- **IT Staff:** Dashboard, Ticket Queue.
- **Administrator:** Dashboard, Ticket Queue, User Management.

`/` keeps the Lab 3 landing (DEC-11).

### Binding decisions

- No new colour tokens. Action status badges reuse existing tokens (`ui-spec.md` §6).
- Actions Taken on Staff Detail: a list, a Create Action dialog, and an Edit Action dialog. On Requester Detail: the same list, read-only, with no controls.
- Status buttons come only from the server's `availableTransitions`. When the gate blocks resolving, the Resolve button stays visible but disabled, with the reason beside it from `resolutionBlockers`. The server still enforces the gate.
- A `STALE_UPDATE` conflict shows the Conflict callout with "Reload ticket". Dialog input is kept until the user closes the dialog.
- Dashboard metric cards are links (`<a>`) with a visible label, value, and accessible name, e.g. "Open tickets: 3. View list".
- Every leftover element from earlier labs (placeholder text, unused nav, debug output, console errors) is removed (`ui-spec.md` §10).

---

## 7. Data Changes

### 7.1 Models

| Model | Change |
|---|---|
| `ActionTaken` | New. `id` UUID; `ticketId` (FK → `Ticket`, restrict); `createdById` (FK → `User`, restrict); `performedById` (FK → `User`, restrict); `actionAt` `TIMESTAMP(3)` (UTC, no time zone, like every other timestamp column; Amendment 2); `description` text; `result` text nullable; `status ActionStatus`; `followUpRequired` boolean default false; `followUpNote` text nullable; `attachmentNotes` text nullable; `clientRequestId` UUID unique; `version` int default 0; `createdAt`; `updatedAt`. |
| `Ticket` | New fields: `version Int @default(0)`, `resolvedAt DateTime?`. |
| `User` | New back-relations only (`createdActions`, `performedActions`). No column change. |
| Every other model | Unchanged. |

### 7.2 Enums

- `ActionStatus`: new — `PLANNED`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED`.
- `TicketEventType`: add `ACTION_CREATED`, `ACTION_UPDATED`.
- `TicketStatus`, `Priority`, `Role`: unchanged.

### 7.3 Indexes and constraints

| Item | Purpose |
|---|---|
| Index `ActionTaken(ticketId, actionAt, createdAt)` | The per-ticket list in BR-19 order |
| Index `ActionTaken(performedById, status)` | "My open actions" on the IT Staff Dashboard |
| Unique `ActionTaken(clientRequestId)` | Idempotent create (BR-31) |
| Check `followUpRequired = false OR followUpNote IS NOT NULL` | Database backstop for BR-09 |
| Index `Ticket(requesterId, currentStatus)` | Requester Dashboard counts |
| Index `Ticket(resolvedAt)` | "Resolved recently" |
| Kept | All Lab 2 and Lab 3 indexes, including `Ticket(ownerId)` and `Ticket(currentStatus, createdAt)` |

All new foreign keys are `ON DELETE RESTRICT`. Tickets and their history are
never cascade-deleted (SDS).

### 7.4 Migration

One migration, `lab_04_actions_taken`, generated with
`prisma migrate dev --create-only` and checked by hand before it is applied
(CLAUDE.md). It only adds things:

| Step | SQL intent | Why checked by hand |
|---|---|---|
| 1 | `CREATE TYPE "ActionStatus"` | — |
| 2 | `ALTER TYPE "TicketEventType" ADD VALUE 'ACTION_CREATED'`, `'ACTION_UPDATED'` | Must be add-only, never drop-and-recreate |
| 3 | `ALTER TABLE "Ticket" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0`, `ADD COLUMN "resolvedAt" TIMESTAMP(3)` | Existing rows get version 0 |
| 4 | Backfill `resolvedAt` for `RESOLVED` and `CLOSED` tickets: the `createdAt` of the latest `STATUS_CHANGED` event whose `payload->>'to' = 'RESOLVED'`; if none exists, the ticket's `updatedAt` | Prisma cannot generate data backfills |
| 5 | `CREATE TABLE "ActionTaken"` with FKs, the check constraint, and indexes | The check constraint is hand-written |
| 6 | Create the two new `Ticket` indexes | — |

**Legacy behaviour.** Existing tickets have no actions. The gate (BR-20) counts
nothing for them, so they resolve exactly as in Lab 3 (BR-21). Existing Ticket
Events are not rewritten.

**Rollback and recovery (DEC-08).**
- Before migrating a database that holds real data, take `pg_dump -Fc`. The README gives the command. Restoring that dump is the recovery path.
- `server/prisma/rollback/lab_04_down.sql` drops `ActionTaken`, the two `Ticket` columns, the new indexes, and `ActionStatus`, then deletes the matching row from `_prisma_migrations`.
- PostgreSQL cannot remove enum values, so the two new `TicketEventType` values stay after rollback. That is harmless, because no Lab 3 code writes them. MIG-05 confirms that a rolled-back database differs from the Lab 3 schema only in those two values (Amendment 2).

### 7.5 Seed

The seed stays idempotent (L3 §7.5). Accounts are unchanged. Actions are
upserted by fixed UUIDs, with fixed `clientRequestId` values. The seed then sets
each seeded ticket's `version` and `resolvedAt` to fixture values, so that
repeated runs agree.

| Fixture | Content |
|---|---|
| Ticket with zero actions | At least one Active ticket (e.g. the seeded OPEN ticket) |
| Ticket with one action | One COMPLETED action, no follow-up; resolvable |
| Ticket with several actions | The seeded IN_PROGRESS ticket: one COMPLETED by its owner, one IN_PROGRESS performed by a different IT Staff member (BR-02), one PLANNED, one CANCELLED. Resolution is blocked. |
| Outstanding follow-up | The seeded WAITING_FOR_REQUESTER ticket: one COMPLETED action with `followUpRequired = true`. Resolution is blocked. |
| Resolved and Closed tickets | Have `resolvedAt` inside the recent window (one each) and outside it (at least one) |
| Zero-metric fixtures | Pimchanok Sonthi has no tickets: every Requester metric is 0. Teerapat Boonsri performs no open action: "My open actions" is 0. |
| Non-zero fixtures | Napat Chaiwong has a WAITING_FOR_REQUESTER ticket; Arisa Kongkaew has open actions; at least one ticket is URGENT and Active. |

**Added tickets (Amendment 2).** The nine Lab 3 tickets cannot hold every
fixture above, so the seed adds two. Both are requested by a Lab 3 ticket
Requester (never Pimchanok Sonthi), and no account is added or changed.

| Ticket | Content | Satisfies |
|---|---|---|
| #10 | CLOSED, requested by Thanawat Rattana, owned by Wichai Prasert, `resolvedAt` outside the recent window | Resolved and Closed: outside the window |
| #11 | WAITING_FOR_REQUESTER, requested by Napat Chaiwong, owned by Wichai Prasert, one PLANNED action performed by Arisa Kongkaew. Resolution is deliberately blocked by the gate (the open PLANNED action), so no test may resolve it. | Napat's WAITING_FOR_REQUESTER ticket; Arisa's open action on another owner's ticket (tests.md §1) |

Seeded "recent" timestamps are relative to the time the seed runs, so the
recent window is never empty on demonstration day. All text is fictional.

**`resolvedAt` and history (Amendment 2).** The seeded `resolvedAt` values are
fixtures, not derived from events. A recent `resolvedAt` is therefore later than
the ticket's September STATUS_CHANGED → RESOLVED event, and later than its
`updatedAt`. The §7.4 backfill rule applies to migrated rows only. Existing Ticket
Events are never modified to match.

---

## 8. API Contract

Full shapes are in `api-spec.md`. This section fixes the capabilities.
Conventions (session, CSRF, error shape, 400/422 distinction, unknown
parameters rejected) are unchanged from L3 api-spec §1.

| Capability | Method and path | Success |
|---|---|---|
| List actions (Requester own, or staff) | `GET /api/v1/tickets/{ticketId}/actions` | 200 |
| Create action | `POST /api/v1/staff/tickets/{ticketId}/actions` | 201, or 200 on idempotent repeat |
| Edit action or change its status | `PATCH /api/v1/staff/actions/{actionId}` | 200 |
| Ticket History | `GET /api/v1/staff/tickets/{ticketId}/history` | 200 |
| Requester Dashboard | `GET /api/v1/dashboard/requester` | 200 |
| IT Staff Dashboard | `GET /api/v1/staff/dashboard` | 200 |
| Changed: assign, IT Priority, status | Lab 3 paths; body gains required `version` | 200 |
| Changed: staff ticket detail | Lab 3 path; adds `version`, `resolvedAt`, `actionSummary`, `resolutionBlockers` | 200 |
| Changed: My Tickets list | Lab 2 path; accepts `status` and `statusGroup` | 200 |
| Changed: Ticket Queue | Lab 3 path; accepts `statusGroup` | 200 |
| Every other Lab 1–3 endpoint | unchanged | unchanged |

New error codes, all `409`: `STALE_UPDATE`, `RESOLUTION_BLOCKED`,
`INVALID_ACTION_TRANSITION`, `ACTION_STATE_CONFLICT`. The rest of the catalogue
is unchanged (L3 api-spec §9).

---

## 9. Acceptance Criteria

### Actions Taken

| ID | Criterion |
|---|---|
| AC-01 | Given a permitted IT Staff user and valid data, when an Action Taken is created, then it is saved under the correct ticket with the authenticated creator and the approved performer. |
| AC-02 | Given an Action Taken created with no performer, when it is saved, then the performer is the creator. Given another active IT Staff or Administrator as performer, then that user is recorded and the Ticket Owner is unchanged. |
| AC-03 | Given a performer who is inactive, a Requester, or unknown, when an action is created or reassigned to them, then the request is refused with 422 on `performedById`. |
| AC-04 | Given a client that supplies `createdById` or `createdAt`, when the action is created, then the server's values are stored instead. |
| AC-05 | Given a description of 4 or 2001 characters, `followUpRequired` true with no note, a note of 1001 characters, attachment notes of 501 characters, or `actionAt` before the ticket's creation or more than 30 days ahead, when an action is saved, then it is refused with 422 and field details. The boundary values 5, 2000, 1000, and 500 are accepted. |
| AC-06 | Given an action moving to COMPLETED or CANCELLED without a result, or to COMPLETED with `actionAt` in the future, when it is saved, then it is refused with 422. |
| AC-07 | Given each permitted action transition, when it is applied, then it succeeds. Given any other transition, including from a terminal status, then it is refused with `INVALID_ACTION_TRANSITION` and nothing changes. |
| AC-08 | Given a COMPLETED action, when its performer is changed, then the request is refused with `ACTION_STATE_CONFLICT`. Its description, result, follow-up fields, attachment notes, and date can still be edited. Given a CANCELLED action, every field edit is refused with `ACTION_STATE_CONFLICT`. A status change on either is refused with `INVALID_ACTION_TRANSITION`. |
| AC-09 | Given a ticket in NEW, RESOLVED, CLOSED, or CANCELLED, when an action is created or edited, then it is refused with `TICKET_STATE_CONFLICT`. |
| AC-10 | Given a ticket with several actions, including two with the same `actionAt`, when the list is requested twice, then both responses list the actions in the same BR-19 order. |
| AC-11 | Given the ticket's Requester, when the action list is requested, then every action is returned read-only. Given another Requester, then the response is 404. Given a Requester calling create or edit, then the response is 403. |
| AC-12 | Given action text containing `<script>` and line breaks, when it is displayed, then the markup appears as literal text and the line breaks are preserved. |
| AC-13 | Given an action create or edit, when it commits, then exactly one `ACTION_CREATED` or `ACTION_UPDATED` event exists with the actor and the changed fields, and the ticket's `version` and `updatedAt` have advanced. |

### Ticket workflow and concurrency

| ID | Criterion |
|---|---|
| AC-14 | Given a ticket with an open action or an outstanding follow-up, when IT Staff try to resolve it through the API, then the request is refused with `RESOLUTION_BLOCKED`, the message gives both counts, and the status is unchanged. |
| AC-15 | Given a ticket whose actions are all COMPLETED or CANCELLED with no follow-up, or a ticket with no actions, when it is resolved, then it becomes RESOLVED and `resolvedAt` is set. |
| AC-16 | Given every permitted pair in the Section 5.4 matrix, when it is performed with the current version, then it succeeds. Given every other pair, then it is refused with `INVALID_STATUS_TRANSITION`. |
| AC-17 | Given a ticket that was reopened, when it is read, then `resolvedAt` is null. Given RESOLVED → CLOSED, then `resolvedAt` is unchanged. |
| AC-18 | Given two users who loaded the same ticket version, when both change status, owner, or IT Priority, then the first succeeds and the second receives `STALE_UPDATE` with nothing changed. The same holds for two edits of one action. |
| AC-19 | Given a resolve and an action create racing on the same ticket, when both complete, then the ticket is never RESOLVED with an open action. |
| AC-20 | Given an action create retried with the same `clientRequestId`, when the second request arrives, then the same action is returned and only one exists. In the UI, clicking Save twice quickly creates one action. |
| AC-21 | Given a `STALE_UPDATE` in an action dialog, when it is shown, then the user's input stays in the dialog and a "Reload ticket" control refreshes the data. |
| AC-22 | Given the Staff Ticket Detail of a blocked ticket, when it renders, then Resolve is disabled and the blocking reason is shown in text. A Requester's "appears resolved" indication does not enable it. |
| AC-23 | Given a ticket with owner, status, IT Priority, indication, and action changes, when its History is opened by IT Staff, then the events appear oldest first with actor and change. Given a Requester, then the History endpoint returns 403. |

### Dashboards

| ID | Criterion |
|---|---|
| AC-24 | Given an authenticated Requester, when dashboard data is retrieved, then only metrics and recent tickets owned by that Requester are returned. |
| AC-25 | Given the seeded database, when each Requester and IT Staff metric is retrieved, then its value equals an independent Prisma query implementing the Section 5.8 calculation. |
| AC-26 | Given a ticket updated at 23:59 Asia/Bangkok seven days ago and another at 00:00 six days ago, when the dashboard is retrieved, then only the second counts as recent. |
| AC-27 | Given a Requester with no tickets, or IT Staff with no open actions, when the dashboard renders, then each card shows 0 and each list shows its empty message. |
| AC-28 | Given a dashboard card or list item, when it is activated by mouse or keyboard, then the matching filtered list or Ticket Detail opens, and the list's count matches the card. |
| AC-29 | Given IT Staff, when the Requester Dashboard endpoint is called, then the response is 403. Given a Requester, when the IT Staff Dashboard endpoint is called, then the response is 403. Given an Administrator, then the IT Staff Dashboard includes user counts. |
| AC-30 | Given each dashboard, when it is loading, fails, or is opened by the wrong role, then distinct loading, safe-failure with Retry, and forbidden states are shown. |
| AC-31 | Given a seeded database with 1,000 additional tickets, when each dashboard endpoint is called 20 times, then the 95th-percentile response time is under 500 ms on the development machine. |

### Migration, seed, and regression

| ID | Criterion |
|---|---|
| AC-32 | Given a database populated under the Lab 3 schema, when the Lab 4 migration is applied, then every existing row survives unchanged, every ticket has version 0, and every RESOLVED or CLOSED ticket has `resolvedAt` per Section 7.4. |
| AC-33 | Given the rollback script applied after the migration, when the database is compared with the Lab 3 schema, then they differ only in the two TicketEventType values. |
| AC-34 | Given the seed has run, when it runs again, then no row is duplicated and fixture values are restored. The database contains the Section 7.5 fixtures. |
| AC-35 | Given the final `main`, when every Lab 1, Lab 2, and Lab 3 suite runs, then all pass, or each superseded test is mapped in `tests.md` Section 4. |
| AC-36 | Given each role, when it signs in and uses the representative Lab 2 and Lab 3 flows (create ticket, attachments, comments, notes, claim, assign, transitions, user management), then each still works end to end. |

### Presentation and accessibility

| ID | Criterion |
|---|---|
| AC-37 | Given each viewport width, when the dashboards and Ticket Details with Actions Taken render, then there is no horizontal page scrolling, clipping, or overlap. |
| AC-38 | Given an action status, ticket status, or IT Priority badge, when it renders, then its value is conveyed by text as well as colour. Every computed colour appears in the token table. |
| AC-39 | Given keyboard-only use, when the user moves through dashboards, the Actions Taken list, and the action dialogs, then every control is reachable, focus is visible, and dialogs trap and return focus. |
| AC-40 | Given any screen, when it is used normally, then the browser console shows no errors, there are no broken links, and no placeholder text or unfinished control remains. |

---

## 10. Definition of Done

### Part 1 — Product completion

The coding agent may report an Issue complete only when every AC that
`tests.md` Section 3 assigns to it maps to a passing test, and every
applicable item below holds. The sprint is complete only when all items hold
on the final `main`.

- Every FR in Section 4 is implemented and every AC in Section 9 is satisfied.
- Every AC maps to at least one passing automated test, recorded in `tests.md` with its real file path.
- All tests pass from the documented commands. Nothing is skipped, disabled, `.only`-scoped, or flaky, except the declared viewport guards.
- Every Lab 1–3 test passes, or is superseded with its mapping in `tests.md` Section 4.
- The migration was generated with `--create-only`, checked against Section 7.4, and applies to both an empty database and a populated Lab 3 database. A second `prisma migrate dev` reports the schema in sync. The rollback script was run once and MIG-05 passed.
- The seed is idempotent, contains the Section 7.5 fixtures, and contains no real secret.
- Every endpoint matches `api-spec.md`, including bodies, status codes, error codes, and authorization.
- The resolution gate and the version check are enforced on the server and proved by API tests that bypass the UI.
- The action transition table and the ticket matrix are each proved exhaustively by unit test.
- Every dashboard metric is proved against an independent query (AC-25).
- No Requester-facing response contains Internal Notes, Ticket History, a password hash, or a session token.
- Every Lab 4 screen has the states `ui-spec.md` lists and uses only listed tokens.
- Every Issue delivering a screen was verified in a running browser before it was reported complete.
- Screenshots exist at the `ui-spec.md` §11 paths, and the visual and accessibility checklist in `tests.md` is complete.
- The browser console is clean on every screen (AC-40).
- Nothing from the Section 3 exclusion list is present.
- `README.md` covers setup, environment, migration, backup and rollback, seed, test commands, and a demonstration script, and was executed from a clean checkout.

### Part 2 — Course delivery

- Work was split into Issues #69 to #75, each on its own feature branch from `lab4-staging`.
- Every feature branch reached `lab4-staging` through a peer-reviewed PR, linked to its Issue in the Development sidebar.
- One release PR (#75) merged `lab4-staging` into `main`. Nothing was committed directly to `main` or `lab4-staging`.
- Test-only commits come before implementation commits in each Issue's history (TDD).
- `reviewer.md` records reviewers, PR links, comments, responses, and approvals, all verifiable from GitHub.
- `ai-use.md` names the LLM, lists 6–10 key prompts, and includes "My Reflection".
- Every Issue is in Done on the Project board.
- One PDF uses the headings Answer Part 1 to Answer Part 9, in order.

---

## 11. Assumptions and Decisions

### Decisions taken within this sprint

| ID | Decision | Rationale |
|---|---|---|
| DEC-01 | Two people fields: `createdBy` (auto, from session) and `performedBy` (defaults to caller, may be another active staff user). | The handout's field list says "Performed by (auto)", but its AC-01 and Part 6 require an assignee and inactive-assignee rejection. Two fields satisfy both and keep an honest audit of who recorded the work. |
| DEC-02 | Actions have their own four-value status. | Part 6 grades complete and cancel, and the stakeholder asks to *plan* work. A boolean "done" cannot express planned or cancelled. |
| DEC-03 | The resolution gate counts open actions and outstanding follow-ups. | "Follow-up required" is meaningless if a ticket can be resolved while it is set. Both conditions are cheap to count in the transaction. |
| DEC-04 | A ticket with no actions may still be resolved. | Requiring at least one action would change Lab 3 behaviour for every legacy ticket, and would break Lab 3 tests the handout says must keep passing. The stakeholder did not ask for it. |
| DEC-05 | Attachment Notes is free text, not a link to an Attachment row. | The stakeholder describes it as "what file to look for". A foreign key would add a second attachment workflow that the handout excludes. |
| DEC-06 | `version` integer on Ticket and ActionTaken, checked by conditional update. Closes L3-DEV-10. | Handout §6.1. An integer is simpler and more exact than comparing `updatedAt` timestamps, which can collide within one millisecond. |
| DEC-07 | Idempotent action create with a client-generated `clientRequestId`. | Handout §8.5 requires that network retries are handled. Disabling the button covers double clicks but not a retry after a lost response. Ticket creation keeps the Lab 2 busy-state protection only (L3-DEC-17); its risk is recorded in `tests.md` §9. |
| DEC-08 | Recovery is `pg_dump` before migrating, plus a tested down script. | Prisma has no down migrations. A dump is the only full recovery. The down script proves the migration is reversible for development. |
| DEC-09 | `resolvedAt` is stored, not derived from events at query time. | "Resolved recently" needs an indexed column. Deriving it from JSON event payloads on every dashboard request would be slow and hard to test. |
| DEC-10 | Administrator user counts have no drill-down. | User Management has no URL-driven filter. Adding one widens a finished Lab 3 screen for a card the handout calls optional. |
| DEC-11 | `/` keeps the Lab 3 landing screens. Dashboard is the first navigation item. | Changing the landing would break Lab 3 routing and E2E tests late in the final sprint. The dashboard is still one click from every screen. |
| DEC-12 | Dashboard drill-down uses new `status` and `statusGroup` filters on existing lists. | The handout requires drill-down into the detailed screens. Adding filters reuses those screens instead of building new ones. |
| DEC-13 | Ticket History is a read-only staff tab over existing Ticket Events. | Part 7 asks for evidence of append-only behaviour and stable ordering. L3-DEV-12 named this as Lab 4 scope. |

### Amendments after approval

| ID | Found in | Change | Why |
|---|---|---|---|
| Amendment 1 | #70, writing UT-03 | BR-15, BR-16, and AC-08: a status change on a terminal action is always `INVALID_ACTION_TRANSITION`; `ACTION_STATE_CONFLICT` is only for field edits. Repeating the stored status is a no-op. | The approved text gave two different codes for the same request (COMPLETED → IN_PROGRESS was `ACTION_STATE_CONFLICT` under BR-16 and `INVALID_ACTION_TRANSITION` under AC-07 and ACT-07), and both refused and accepted a repeated status (ACT-07 against ACT-16). One request must have one outcome. |
| Amendment 2 | #70, planning MIG-05 and the seed | AC-33, §7.4, and MIG-05: the rollback is proved by comparing the rolled-back database with the Lab 3 schema (`prisma migrate diff`), and only the two `TicketEventType` values may differ. §7.5: seed tickets #10 and #11 added; #11 is deliberately blocked by the resolution gate (its open PLANNED action), so no test may resolve it; seeded `resolvedAt` may differ from event times. §7.1: `actionAt` is `TIMESTAMP(3)`. | Running the Lab 3 suite needs the Lab 3 Prisma client, so a second dependency install inside the test: slow, network-dependent, and flaky. The nine Lab 3 tickets had no room for an old `resolvedAt`, Napat's WAITING_FOR_REQUESTER ticket, or Arisa's action on another owner's ticket. Every other timestamp column is `TIMESTAMP(3)`, and §7.1 alone said `timestamptz`. |

### Carried deviations

L3-DEV-01 (Zen Green instead of the D-09 palette), L3-DEV-02 (local filesystem
storage), L3-DEV-05 to L3-DEV-09, and L3-DEV-11 to L3-DEV-16 remain in force
unchanged. L3-DEV-10 is closed by DEC-06.

### Open assumptions

| ID | Assumption | Confirmation path |
|---|---|---|
| A-01 | DEC-01 is how the handout's two descriptions of the performer field are meant to fit together. | Asked the TA. If the answer differs, an amendment PR updates this document before the Actions Taken UI merges. |
| A-02 | The deployment time zone is Asia/Bangkok, UTC+07:00, with no daylight saving. | Fixed by KMUTT's location. |
| A-03 | Dashboard queries stay fast enough without caching at course data sizes. | PERF-01 (AC-31). |
| A-04 | The development machine used for PERF-01 is the one used for the demonstration. | Recorded with the PERF-01 result in `tests.md` §8. |
