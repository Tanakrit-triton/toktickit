# Lab 4 API Specification

**Project:** TokTickIT — Actions Taken, Dashboards, and Final Regression
**Base path:** `/api/v1`
**Companion documents:** `specification.md` (FR/BR/AC), `tests.md`, `docs/lab-03/api-spec.md` (the conventions and endpoints this document extends)
**Status:** Draft for approval — must be merged before implementation PRs begin

Earlier identifiers carry `L2-` or `L3-` prefixes. "Section" numbers without a
prefix refer to this document. BR, AC, and DEC numbers refer to
`docs/lab-04/specification.md`.

---

## 1. Conventions

Unchanged from L3 api-spec §1:
- Session cookie, CSRF header on every POST, PUT, PATCH, and DELETE, and the session resolution order (L3 §1.1–1.2).
- Error shape `{ "error": { "code", "message", "details"? } }`, with `details` on `422` only (L3 §1.4).
- Timestamps in ISO 8601 UTC with `Z`. String fields are trimmed before validation. Unknown query parameters give `400`. Unknown body properties are ignored. A malformed UUID in a path gives `400` (L3 §1.5).

### 1.1 Order of checks for every Lab 4 write

The first failure wins.

| # | Check | Failure |
|---|---|---|
| 1–5 | Session, active user, CSRF, password-change gate, role (L3 §1.1) | `401` / `403` |
| 6 | Path UUID format | `400` |
| 7 | Resource exists (and, for a Requester, is their own) | `404` |
| 8 | Body field validation | `422` with `details` |
| 9 | Version matches (BR-28, BR-29) | `409 STALE_UPDATE` |
| 10 | Domain rules: ticket state, action state, transitions, gate | `409` with the specific code |

A version mismatch is reported before domain rules. A user who was working on
an old view must reload before any domain message can be trusted.

For `PATCH /staff/actions/{actionId}`, Section 2.3 refines step 8 (Amendment 3):
step 8 checks only the body's shape (`version` present and an integer, `status`
a known value, `performedById` a UUID), and every field rule runs at step e,
on the resulting action, after the version and domain checks.

### 1.2 Shared DTOs (additions)

```ts
type ActionStatus = "PLANNED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";

type StaffUserRef = { id: string; fullName: string; isActive: boolean };

type ActionTaken = {
  id: string;
  ticketId: string;
  actionAt: string;              // ISO 8601 UTC
  description: string;
  result: string | null;
  status: ActionStatus;
  performedBy: StaffUserRef;     // BR-02, BR-04
  createdBy: StaffUserRef;       // BR-03
  followUpRequired: boolean;
  followUpNote: string | null;   // null whenever followUpRequired is false (BR-09)
  attachmentNotes: string | null;
  version: number;               // BR-29
  createdAt: string;
  updatedAt: string;
};

type StatusGroup = "ACTIVE" | "DONE";  // spec §5.4
```

`isActive` lets the UI mark an inactive performer "(inactive)" (BR-04). The
Requester receives the same `ActionTaken` shape, because the handout shows all
action fields to the Requester (§8.3). It contains no Internal Note data.

---

## 2. Actions Taken

### 2.1 `GET /api/v1/tickets/{ticketId}/actions`

Lists a ticket's actions in BR-19 order: `actionAt` asc, `createdAt` asc, `id` asc. Not paginated.

| Caller | Result |
|---|---|
| Requester, own ticket | `200` |
| Requester, other's ticket or none | `404 NOT_FOUND` (L3-BR-24) |
| IT Staff, Administrator | `200` for any ticket |

**200**

```json
{
  "data": [
    {
      "id": "6b1e…",
      "ticketId": "3f2b9c10-…",
      "actionAt": "2026-10-29T03:15:00.000Z",
      "description": "Replaced the laptop battery with a spare unit.",
      "result": "Battery holds charge for over 4 hours in testing.",
      "status": "COMPLETED",
      "performedBy": { "id": "…", "fullName": "Arisa Kongkaew", "isActive": true },
      "createdBy":   { "id": "…", "fullName": "Wichai Prasert", "isActive": true },
      "followUpRequired": true,
      "followUpNote": "Check again after one week of normal use.",
      "attachmentNotes": "See battery-report.pdf uploaded by the requester.",
      "version": 2,
      "createdAt": "2026-10-29T03:20:11.402Z",
      "updatedAt": "2026-10-29T04:02:55.118Z"
    }
  ]
}
```

An empty list is `{ "data": [] }`.

**Errors:** `400`, `401`, `403` (password change pending), `404`, `500`.

### 2.2 `POST /api/v1/staff/tickets/{ticketId}/actions`

IT Staff and Administrator only (`/staff/**` family).

**Request**

```json
{
  "clientRequestId": "0d8c9b52-6f7e-4a3b-9c2d-1e5f6a7b8c9d",
  "actionAt": "2026-10-29T03:15:00.000Z",
  "description": "Replaced the laptop battery with a spare unit.",
  "status": "COMPLETED",
  "result": "Battery holds charge for over 4 hours in testing.",
  "performedById": "…",
  "followUpRequired": false,
  "followUpNote": null,
  "attachmentNotes": null
}
```

| Field | Rule | `details` key on failure |
|---|---|---|
| `clientRequestId` | Required UUID (BR-31) | `clientRequestId` |
| `actionAt` | Required ISO 8601 with offset. Not before ticket `createdAt`, not after now + 30 days (BR-05). If `status` is `COMPLETED`, not after now + 5 minutes (BR-06). | `actionAt` |
| `description` | Required, 5–2000 after trimming (BR-07) | `description` |
| `status` | Optional, default `PLANNED`. One of `PLANNED`, `IN_PROGRESS`, `COMPLETED` (BR-14). | `status` |
| `result` | Optional, ≤ 2000. Required (≥ 1) when `status` is `COMPLETED` (BR-08). | `result` |
| `performedById` | Optional, default caller. If given: active `IT_STAFF` or `ADMINISTRATOR` (BR-04). | `performedById` |
| `followUpRequired` | Optional boolean, default `false` | `followUpRequired` |
| `followUpNote` | Required, 5–1000, when `followUpRequired` is true. Ignored and stored null otherwise (BR-09). | `followUpNote` |
| `attachmentNotes` | Optional, ≤ 500 (BR-10). Empty after trimming is stored as null. | `attachmentNotes` |
| `createdById`, `createdAt`, `version`, `id` | Ignored if sent (BR-03) | — |

Messages for the most common details:
- `performedById`: "Choose an active IT Staff or Administrator user."
- `followUpNote`: "Describe the follow-up that is needed (5–1000 characters)."
- `result` (completing): "Record the result before completing this action."
- `actionAt` (future completion): "A completed action cannot be dated in the future."
- `result` (cancelling): "Say why this action is being cancelled."

**Domain rules** (after validation):

| Rule | Failure |
|---|---|
| Ticket status is `OPEN`, `IN_PROGRESS`, `WAITING_FOR_REQUESTER`, or `REOPENED` (BR-17) | `409 TICKET_STATE_CONFLICT` "Actions can only be recorded on an open ticket. Claim or reopen it first." |

**Idempotency (BR-31).**
- If an action with this `clientRequestId` already exists on this ticket, respond `200` with that action. No change, no event, no version increment.
- If it exists on a different ticket, respond `422` with `details.clientRequestId`: "This request id was already used."
- The unique index on `clientRequestId` settles a race between two identical requests. The loser re-reads and returns `200`.
- The lookup runs once the ticket is found (step 7) and `clientRequestId` is a valid UUID, before the other field rules and the ticket-state rule. A retry therefore returns the original action even if the ticket's status has changed since (Amendment 3).

**Side effects, in one transaction:**
1. `UPDATE "Ticket" SET version = version + 1, "updatedAt" = now() WHERE id = $id AND "currentStatus" IN (active-for-actions) RETURNING version`. If no row is returned, the ticket left those statuses concurrently, so respond `409 TICKET_STATE_CONFLICT` (BR-30).
2. Insert the action with `createdById` = caller and `version` 0.
3. Write `ACTION_CREATED { actionId, status, performedById }` with actor = caller.

**201** `{ "data": ActionTaken, "ticketVersion": 7 }`

`ticketVersion` lets the client update its copy of the ticket without a re-fetch.
The client re-fetches anyway (L3 ui-spec §6.5).

**Errors:** `400`, `401`, `403`, `404`, `409`, `422`, `500`.

### 2.3 `PATCH /api/v1/staff/actions/{actionId}`

IT Staff and Administrator only. Partial update: only fields present are changed.

**Request**

```json
{ "version": 2, "status": "COMPLETED", "result": "Printer queue cleared; test page printed." }
```

| Field | Rule |
|---|---|
| `version` | Required integer (BR-29). Missing gives `422 details.version`. |
| `status` | Optional. Must follow the BR-15 table from the current status. |
| `actionAt`, `description`, `result`, `performedById`, `followUpRequired`, `followUpNote`, `attachmentNotes` | Same validation as Section 2.2, applied to the **resulting** action. Example: moving to `COMPLETED` while the stored `result` is null and none is sent gives `422 details.result`. |
| `ticketId`, `createdById`, `createdAt`, `clientRequestId` | Ignored (BR-01, BR-03) |

**Order of evaluation** (Section 1.1, then):

| # | Rule | Failure |
|---|---|---|
| a | Action `version` matches | `409 STALE_UPDATE` |
| b | Ticket status allows action edits (BR-17) | `409 TICKET_STATE_CONFLICT` |
| c | If `status` changes, the change is in the BR-15 table | `409 INVALID_ACTION_TRANSITION` "This action cannot move from {From} to {To}." |
| d | Action is not `CANCELLED`; on `COMPLETED`, only the permitted fields change (BR-16) | `409 ACTION_STATE_CONFLICT` "This action is {status} and can no longer be changed in that way." |
| e | Field rules on the resulting action | `422` with `details` |

Values equal to the stored ones, including `status`, are dropped before step c
(Amendment 1). A body that changes nothing returns `200` with no event and no
version increment.

**Side effects, in one transaction:**
1. `UPDATE "ActionTaken" SET …, version = version + 1 WHERE id = $id AND version = $expected`. If no row is updated, respond `409 STALE_UPDATE`.
2. Update the ticket's version and `updatedAt`, as in Section 2.2 step 1.
3. Write `ACTION_UPDATED { actionId, changes }` (BR-34).

**200** `{ "data": ActionTaken, "ticketVersion": 8 }`

**Errors:** `400`, `401`, `403`, `404`, `409`, `422`, `500`.

---

## 3. Ticket workflow changes

### 3.1 `GET /api/v1/staff/tickets/{ticketId}` — additions

The L3 §5.2 body gains four fields:

```json
{
  "data": {
    "…": "every Lab 3 field, unchanged",
    "version": 7,
    "resolvedAt": null,
    "actionSummary": { "total": 4, "open": 2, "outstandingFollowUps": 0 },
    "resolutionBlockers": { "openActions": 2, "outstandingFollowUps": 0 }
  }
}
```

- `resolutionBlockers` is `null` when the gate would pass (BR-20).
- `availableTransitions` is still computed from the matrix and the owner rule only. It **includes** `RESOLVED` when the matrix allows it, even if blocked, so the UI can show a disabled Resolve with its reason (`ui-spec.md` §4.3). The server enforces the gate on the write (Section 3.2).

### 3.2 Version on Lab 3 write endpoints

The three endpoints below now require `"version": <int>` in the body. Their
other request fields and responses are unchanged.

| Endpoint | Lab 3 reference |
|---|---|
| `PUT /api/v1/staff/tickets/{ticketId}/owner` | L3 §5.5 |
| `PUT /api/v1/staff/tickets/{ticketId}/it-priority` | L3 §5.6 |
| `POST /api/v1/staff/tickets/{ticketId}/status` | L3 §5.7 |

- A missing or non-integer `version` gives `422 details.version`.
- A mismatch gives `409 STALE_UPDATE` before any other domain check (Section 1.1).
- A no-change request (same owner, same priority) still needs the current version, and still makes no change and writes no event (L3-BR-30).

`POST …/claim` and `POST /tickets/{id}/appears-resolved` take no `version`
(BR-32), but both increment it.

### 3.3 `POST /api/v1/staff/tickets/{ticketId}/status` — gate and `resolvedAt`

Order of evaluation, extending L3 §5.7:

| # | Rule | Failure |
|---|---|---|
| 1 | `status` is a `TicketStatus`, and `version` is an integer | `422` |
| 2 | Version matches | `409 STALE_UPDATE` |
| 3 | (current, target) is in the matrix | `409 INVALID_STATUS_TRANSITION` |
| 4 | Owner present when required | `409 TICKET_OWNER_REQUIRED` |
| 5 | Reason, for `CANCELLED` and `REOPENED` | `422 details.reason` |
| 6 | **Target `RESOLVED`: no open action, no outstanding follow-up (BR-20)** | `409 RESOLUTION_BLOCKED` |

`RESOLUTION_BLOCKED` message: "This ticket cannot be resolved yet: {n} action(s)
still open and {m} follow-up(s) outstanding." Both counts are always shown, even
when one is 0.

The gate counts are read inside the same transaction as the conditional status
update. The action-create path updates the same ticket row (Section 2.2), so the
two cannot interleave (BR-30).

**Additional side effects:** set `resolvedAt = now()` when entering `RESOLVED`.
Clear it when entering `REOPENED` (BR-25). Increment `version`.

### 3.4 `GET /api/v1/staff/tickets/{ticketId}/history`

IT Staff and Administrator only. Lists Ticket Events oldest first, then by `id` (BR-34). Not paginated.

**200**

```json
{
  "data": [
    { "id": "…", "eventType": "OWNER_CHANGED", "actor": { "id": "…", "fullName": "Wichai Prasert" },
      "payload": { "fromOwnerId": null, "toOwnerId": "…", "cause": "CLAIM" },
      "createdAt": "2026-10-20T02:00:00.000Z" },
    { "id": "…", "eventType": "ACTION_UPDATED", "actor": { "id": "…", "fullName": "Arisa Kongkaew" },
      "payload": { "actionId": "…", "changes": { "status": { "from": "IN_PROGRESS", "to": "COMPLETED" }, "result": { "changed": true } } },
      "createdAt": "2026-10-29T04:02:55.118Z" }
  ],
  "users": { "<uuid>": "Wichai Prasert" }
}
```

- `actor` is `null` only for the L3-BR-40 owner clearance.
- `users` maps every user id that appears in any payload to a display name, so the client never has to resolve ids.
- Payloads never contain secrets (L3-BR-56) or text bodies.

There is no write endpoint for events.

**Errors:** `400`, `401`, `403`, `404`, `500`.

---

## 4. List filters for drill-down

### 4.1 `GET /api/v1/tickets` (My Tickets) — new parameters

| Parameter | Values | Rule |
|---|---|---|
| `status` | One `TicketStatus` | Filters to that status |
| `statusGroup` | `ACTIVE` or `DONE` | Filters to the group (spec §5.4) |

- Sending both `status` and `statusGroup` gives `400` "Use either status or statusGroup, not both."
- Any other value gives `400`.
- Every Lab 2 parameter and rule is unchanged (L2-BR-47).

### 4.2 `GET /api/v1/staff/tickets` (Ticket Queue) — new parameter

`statusGroup` (`ACTIVE` or `DONE`) is added with the same rule: it cannot be
combined with `status`. Every Lab 3 parameter is unchanged.

---

## 5. Dashboards

Both endpoints return counts and short lists only, never full collections
(handout §6.2). Every value is computed at request time (BR-35). The window
follows BR-36.

### 5.1 `GET /api/v1/dashboard/requester`

Requester only. IT Staff and Administrators get `403 FORBIDDEN`. No query
parameters. Every query filters on `requesterId = caller` (BR-39).

**200**

```json
{
  "data": {
    "generatedAt": "2026-10-30T13:00:00.000Z",
    "window": { "from": "2026-10-23T17:00:00.000Z", "to": "2026-10-30T13:00:00.000Z", "timeZone": "Asia/Bangkok" },
    "metrics": {
      "openTickets":      { "count": 3, "link": "/tickets?statusGroup=ACTIVE" },
      "waitingForMe":     { "count": 1, "link": "/tickets?status=WAITING_FOR_REQUESTER" },
      "updatedRecently":  { "count": 2, "link": "/tickets?sortBy=updatedAt&sortOrder=desc" },
      "resolvedRecently": { "count": 1, "link": "/tickets?statusGroup=DONE" }
    },
    "lists": {
      "needsAttention":   [ { "id": "…", "ticketNumber": "TKT-2026-00005", "summary": "…", "currentStatus": "WAITING_FOR_REQUESTER", "updatedAt": "…" } ],
      "recentlyUpdated":  [ ],
      "recentlyResolved": [ { "id": "…", "ticketNumber": "…", "summary": "…", "currentStatus": "RESOLVED", "resolvedAt": "…" } ]
    }
  }
}
```

- `window.from` is 00:00 Asia/Bangkok six days before today, expressed in UTC (the example is 24 Oct 00:00 +07:00).
- `link` values are client routes. The client renders them as links and never builds them itself.
- List items use one shape: `{ id, ticketNumber, summary, currentStatus, updatedAt, resolvedAt? }`. At most 5 per list (BR-37).
- Empty lists are `[]`. Zero counts are `0` (BR-38).

**Errors:** `401`, `403`, `500`.

### 5.2 `GET /api/v1/staff/dashboard`

IT Staff and Administrator. Requesters get `403 FORBIDDEN`. No query parameters.

**200**

```json
{
  "data": {
    "generatedAt": "…",
    "window": { "from": "…", "to": "…", "timeZone": "Asia/Bangkok" },
    "metrics": {
      "unassigned":    { "count": 2, "link": "/staff/queue?owner=unassigned&statusGroup=ACTIVE" },
      "ownedByMe":     { "count": 3, "link": "/staff/queue?owner=me&statusGroup=ACTIVE" },
      "myOpenActions": { "count": 2, "link": null }
    },
    "byStatus": [
      { "status": "NEW", "count": 2, "link": "/staff/queue?status=NEW" }
    ],
    "activeByItPriority": [
      { "itPriority": "URGENT", "count": 1, "link": "/staff/queue?itPriority=URGENT&statusGroup=ACTIVE" }
    ],
    "lists": {
      "myOpenActions": [
        { "actionId": "…", "ticketId": "…", "ticketNumber": "TKT-2026-00004", "description": "Collect diagnostic logs from the printer", "status": "PLANNED", "actionAt": "…" }
      ],
      "urgent":          [ { "id": "…", "ticketNumber": "…", "summary": "…", "currentStatus": "OPEN", "owner": null, "createdAt": "…" } ],
      "recentlyUpdated": [ { "id": "…", "ticketNumber": "…", "summary": "…", "currentStatus": "IN_PROGRESS", "updatedAt": "…" } ]
    },
    "users": null
  }
}
```

- `byStatus` always has 8 entries, in the L3 queue lifecycle order (`STATUS_ORDER`). `activeByItPriority` always has 4, from URGENT down to LOW. Zero entries are included.
- `myOpenActions` items link to `/staff/tickets/{ticketId}#actions`. The client builds that from `ticketId`, because it is a fixed route pattern.
- `myOpenActions.description` is cut to 120 characters with "…" on the server.
- `users` is `null` for IT Staff. For an Administrator it is:

```json
{ "active": { "REQUESTER": 5, "IT_STAFF": 3, "ADMINISTRATOR": 1 }, "inactive": 2 }
```

**Errors:** `401`, `403`, `500`.

### 5.3 Reference queries

API tests compare each value with these Prisma queries (AC-25). They are the
normative calculation. `ACTIVE` and `DONE` are the spec §5.4 groups, and `W` is
the window start.

| Metric | Prisma |
|---|---|
| `openTickets` | `ticket.count({ where: { requesterId: me, currentStatus: { in: ACTIVE } } })` |
| `waitingForMe` | `ticket.count({ where: { requesterId: me, currentStatus: "WAITING_FOR_REQUESTER" } })` |
| `updatedRecently` | `ticket.count({ where: { requesterId: me, updatedAt: { gte: W } } })` |
| `resolvedRecently` | `ticket.count({ where: { requesterId: me, currentStatus: { in: DONE }, resolvedAt: { gte: W } } })` |
| `unassigned` | `ticket.count({ where: { ownerId: null, currentStatus: { in: ACTIVE } } })` |
| `ownedByMe` | `ticket.count({ where: { ownerId: me, currentStatus: { in: ACTIVE } } })` |
| `myOpenActions` | `actionTaken.count({ where: { performedById: me, status: { in: ["PLANNED","IN_PROGRESS"] }, ticket: { currentStatus: { in: ACTIVE } } } })` |
| `byStatus[S]` | `ticket.count({ where: { currentStatus: S } })` |
| `activeByItPriority[P]` | `ticket.count({ where: { itPriority: P, currentStatus: { in: ACTIVE } } })` |

---

## 6. Ticket Events (additions)

| Operation | Events, in one transaction with the change |
|---|---|
| Create action | `ACTION_CREATED { actionId, status, performedById }`; none on an idempotent repeat |
| Edit action | `ACTION_UPDATED { actionId, changes }`; none if nothing changed |
| Status → RESOLVED / REOPENED | `STATUS_CHANGED` as in Lab 3. `resolvedAt` is not written to the payload. |

---

## 7. Error catalogue (additions)

Every Lab 2 and Lab 3 code is unchanged (L3 api-spec §9).

| Status | Code | When |
|---|---|---|
| `409` | `STALE_UPDATE` | The `version` sent for a ticket or action is not the stored one. Message: "This ticket was changed by someone else. Reload to see the latest version." |
| `409` | `RESOLUTION_BLOCKED` | Resolving a ticket with open actions or outstanding follow-ups (BR-20) |
| `409` | `INVALID_ACTION_TRANSITION` | An action status change not in the BR-15 table |
| `409` | `ACTION_STATE_CONFLICT` | A field edit on a CANCELLED action, or a performer change on a COMPLETED one (BR-16). Status changes are `INVALID_ACTION_TRANSITION`. |

`TICKET_STATE_CONFLICT` gains one more use: creating or editing an action on a
ticket in NEW, RESOLVED, CLOSED, or CANCELLED (BR-17).

---

## 8. Authorization by endpoint (additions)

The L3 §10 table is unchanged. These rows are added, and are the source for the
table-driven negative tests (AUZ-* in `tests.md`).

| Endpoint | No session | Requester | IT Staff | Administrator |
|---|---|---|---|---|
| `GET /tickets/{id}/actions` | 401 | own / 404 | ✓ | ✓ |
| `POST /staff/tickets/{id}/actions` | 401 | 403 | ✓ | ✓ |
| `PATCH /staff/actions/{id}` | 401 | 403 | ✓ | ✓ |
| `GET /staff/tickets/{id}/history` | 401 | 403 | ✓ | ✓ |
| `GET /dashboard/requester` | 401 | ✓ (own data) | 403 | 403 |
| `GET /staff/dashboard` | 401 | 403 | ✓ | ✓ + `users` |

---

## 9. Not provided

Recorded so that no implementation anticipates them.

- Deleting an action (BR-12), and any file upload on an action (DEC-05)
- An event write API; history for Requesters
- Dashboard query parameters, date ranges, export, or caching
- A version on ticket creation, comments, or notes (these are inserts, not updates)
