# Lab 3 API Specification

**Project:** TokTickIT — Users, Roles, IT Staff Ticketing, and Admin Screens
**Base path:** `/api/v1`
**Companion documents:** `specification.md` (FR/BR/AC), `tests.md` (test traceability), `docs/lab-02/api-spec.md` (Lab 2 endpoints this document extends)
**Status:** Draft for approval — must be merged before implementation PRs begin

Lab 2 identifiers carry an `L2-` prefix. "Section" numbers without a prefix
refer to this document.

---

## 1. Conventions

### 1.1 Authentication

Identity comes from an opaque server-side session (D-04, BR-15).

| Item | Value |
|---|---|
| Cookie | `toktickit_sid`, HttpOnly, SameSite=Lax, Path=/, Max-Age=28800. Secure only when `NODE_ENV=production` (DEV-09). |
| Token | 32 random bytes, base64url. The database stores only its SHA-256 hash. |
| Expiry | 30 minutes idle, 8 hours absolute (BR-16). |
| Client access | Client JavaScript never reads the cookie. |

The `X-Dev-Requester-Id` header from Lab 2 is gone. A request that still sends
it is authenticated by session only, and the header is ignored.

**Session resolution order** for every protected endpoint. The first failure wins.

| # | Check | Failure |
|---|---|---|
| 1 | A cookie is present, resolves to a session row, is not revoked, and is within both expiry limits | `401 UNAUTHENTICATED` |
| 2 | The session's user exists and `isActive` is true (BR-19) | `401 UNAUTHENTICATED` |
| 3 | The CSRF token matches, for POST, PUT, PATCH, and DELETE (Section 1.2) | `403 CSRF_INVALID` |
| 4 | `mustChangePassword` is false, unless the endpoint is exempt (BR-21) | `403 PASSWORD_CHANGE_REQUIRED` |
| 5 | The caller's role is permitted for the route family (BR-23) | `403 FORBIDDEN` |
| 6 | Path and body validation, resource lookup and ownership, domain rules | `400` / `404` / `422` / `409` |

Exempt from step 4: `GET /auth/me`, `POST /auth/password`, `POST /auth/logout`.

Step 5 runs before any resource is read. A role refusal therefore has the same
body whether or not the addressed resource exists.

Each successful request updates the session's `lastSeenAt`. The write is
skipped when `lastSeenAt` is less than 60 seconds old (A-03).

### 1.2 CSRF

Every session carries a CSRF token: 32 random bytes, base64url, stored on the
session row (DEC-05).

- `POST /auth/login`, `GET /auth/me`, and `POST /auth/password` return it in the body as `csrfToken`.
- The client keeps it in memory and sends it as `X-CSRF-Token` on every POST, PUT, PATCH, and DELETE.
- The comparison is constant-time.
- `POST /auth/login` is the only state-changing endpoint exempt, because no session exists yet.
- GET requests never change state and never need the token.

### 1.3 Origin

In development, the Vite dev server on `:5173` proxies `/api` to the API on
`:3000` (DEC-04). The client calls relative URLs such as `/api/v1/...`.
`cors()` is removed from the server, so the API sends no CORS headers.

### 1.4 Error shape

The Lab 2 shape is unchanged (L2-BR-29, BR-67, DEV-08):

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "One or more fields are invalid.", "details": { "email": "Enter a valid email address." } } }
```

`details` appears only on `422`. Every code is listed in Section 9.

### 1.5 List shape and general rules

- Paginated lists return `{ "data": [...], "meta": { "page", "pageSize", "totalItems", "totalPages" } }` (L2 §1.4). Unpaginated lists return `{ "data": [...] }`.
- Timestamps are ISO 8601 UTC with a `Z` suffix.
- String fields are trimmed before validation, except passwords, which are never trimmed (BR-11).
- Unknown query parameters are rejected with `400`. Unknown body properties are ignored.
- Identifiers: users, tickets, attachments, comments, and notes use UUIDs. A malformed UUID in a path gives `400`.

### 1.6 Shared DTOs

```ts
type UserSummary   = { id: string; fullName: string };
type CurrentUser   = { id: string; fullName: string; email: string; role: Role; mustChangePassword: boolean };
type Role          = "REQUESTER" | "IT_STAFF" | "ADMINISTRATOR";
type Priority      = "LOW" | "MEDIUM" | "HIGH" | "URGENT";
type TicketStatus  = "NEW" | "OPEN" | "IN_PROGRESS" | "WAITING_FOR_REQUESTER"
                   | "RESOLVED" | "CLOSED" | "REOPENED" | "CANCELLED";
type CommentOrNote = { id: string; ticketId: string; author: UserSummary & { role: Role };
                       body: string; createdAt: string };
```

No DTO ever contains `passwordHash`, a session token, `storedFilename`, or
Ticket Event payloads (BR-57, BR-68).

---

## 2. Authentication endpoints

### 2.1 `POST /api/v1/auth/login`

Public. Exempt from CSRF.

**Request**

```json
{ "email": "napat.cha@kmutt.ac.th", "password": "••••••••••••" }
```

| Field | Rule |
|---|---|
| `email` | Required. Trimmed and lowercased (BR-06). |
| `password` | Required, non-empty. Not trimmed. |

**Order of evaluation**

1. Validation: a missing field gives `422`.
2. Throttle: if the client address and email pair has five failures in the last 15 minutes, return `429 TOO_MANY_ATTEMPTS` with `Retry-After` in seconds (BR-09).
3. Look up the user by normalised email.
4. Verify the password. If the user is unknown or has a null `passwordHash`, verify against a fixed dummy Argon2id hash so the timing matches (BR-07). On failure, count the attempt and return `401 INVALID_CREDENTIALS`.
5. The password is correct but the user is inactive: return `403 ACCOUNT_INACTIVE` (BR-08). This is not counted as a failure.
6. Success:
   - clear the throttle counter;
   - revoke any session presented by the incoming cookie;
   - create a new session and set the cookie (BR-17).

**200**

```json
{
  "data": {
    "user": { "id": "8f14e45f-...", "fullName": "Napat Chaiwong", "email": "napat.cha@kmutt.ac.th",
              "role": "REQUESTER", "mustChangePassword": false },
    "csrfToken": "q1Vb…"
  }
}
```

**Errors**

| Status | Code | Message (exact) |
|---|---|---|
| `401` | `INVALID_CREDENTIALS` | "The email or password is incorrect." |
| `403` | `ACCOUNT_INACTIVE` | "This account is inactive. Contact your administrator." |
| `429` | `TOO_MANY_ATTEMPTS` | "Too many sign-in attempts. Try again in a few minutes." |

Also `400`, `422`, and `500`. The `401` body is byte-identical for an unknown
email, a wrong password, and a null password hash (AC-05, AC-13).

**Test hook.** The throttle module exports `resetLoginThrottle()`. Only test
code calls it; it has no HTTP route. Throttling is never disabled in tests (BR-09).

### 2.2 `POST /api/v1/auth/logout`

Session optional. CSRF is required when a session exists.

- **204**, no body. The session is revoked and the cookie is cleared with `Max-Age=0`.
- Without a valid session, also `204`, with no effect (BR-18).

**Errors:** `403 CSRF_INVALID`, `500`.

### 2.3 `GET /api/v1/auth/me`

Requires a session. Exempt from the password-change gate.

**200** `{ "data": { "user": CurrentUser, "csrfToken": string } }`

**Errors:** `401`, `500`.

### 2.4 `POST /api/v1/auth/password`

Requires a session and CSRF. Exempt from the password-change gate.

**Request**

```json
{ "currentPassword": "…", "newPassword": "…", "confirmPassword": "…" }
```

| Field | Rule | Error in `details` |
|---|---|---|
| `currentPassword` | Required. Must verify against the stored hash. | "Current password is incorrect." |
| `newPassword` | 12–128 Unicode code points, not trimmed (BR-11) | "Password must be 12–128 characters." |
| `newPassword` | Must differ from the current password | "New password must be different from the current password." |
| `confirmPassword` | Must equal `newPassword` | "Passwords do not match." |

Every failing field is reported together in one `422`.

**On success (BR-12):**
- store the new hash, set `mustChangePassword = false`, set `passwordChangedAt`;
- revoke every other session of the user;
- rotate the current session: revoke it, issue a new one, and set the new cookie.

**200** `{ "data": { "user": CurrentUser, "csrfToken": string } }`. The CSRF token is new.

**Errors:** `401`, `403 CSRF_INVALID`, `422`, `500`.

---

## 3. Reference data

| Endpoint | Change from Lab 2 |
|---|---|
| `GET /api/v1/categories` | Now requires a session. Any role. Gated by the password-change rule. Response unchanged. |
| `GET /api/v1/related-systems` | Same as above. |
| `GET /api/v1/dev-requesters` | **Removed.** The route no longer exists and answers `404 NOT_FOUND`. |
| `GET /api/categories` (Lab 1) | **Unchanged and public** (BR-22, L2-A-04). |
| `GET /api/health` | Unchanged and public. |

---

## 4. Requester endpoints (Lab 2, continued)

Paths, request bodies, and success shapes are unchanged from L2 api-spec §3–4,
except for the additions below. The route family is restricted to the
`REQUESTER` role (BR-25), except for the shared attachment endpoints in Section 4.2.

| Endpoint | Roles | Lab 3 change |
|---|---|---|
| `POST /tickets` | Requester | The Requester of the new ticket is the session user (DEC-20 terminology). A body `requesterId` is ignored (BR-03). Sets `itPriority = requestedPriority`. The response adds `itPriority`, `owner: null`, and `requesterIndicatedResolvedAt: null`. |
| `GET /tickets` | Requester | Scoped to the session user. Query parameters unchanged. |
| `GET /tickets/{ticketId}` | Requester | Own ticket only, otherwise `404`. The response adds `owner: UserSummary \| null` and `requesterIndicatedResolvedAt: string \| null`. It never includes notes or note counts (BR-53). |
| `POST /tickets/{ticketId}/attachments` | Requester | Own ticket only. `409 TICKET_STATE_CONFLICT` when CLOSED or CANCELLED (BR-59). |
| `DELETE /attachments/{attachmentId}` | Requester | Own ticket only. `409 TICKET_STATE_CONFLICT` when CLOSED or CANCELLED (BR-59). |

The Requester response deliberately omits `itPriority`. IT Priority is an IT
working value; the Requester sees their own Requested Priority. The create
response is the one exception, because it echoes the stored row.

### 4.1 Status-code changes for every Lab 2 Requester endpoint

| Lab 2 | Lab 3 |
|---|---|
| `428 REQUESTER_NOT_SELECTED` | `401 UNAUTHENTICATED` |
| `403 REQUESTER_INACTIVE` | `401 UNAUTHENTICATED` (BR-19). At login: `403 ACCOUNT_INACTIVE`. |
| — | `403 FORBIDDEN` for IT Staff or Administrator calling a Requester-only endpoint |
| — | `403 CSRF_INVALID`, `403 PASSWORD_CHANGE_REQUIRED` |

### 4.2 Shared attachment endpoints

| Endpoint | Requester | IT Staff, Administrator |
|---|---|---|
| `GET /tickets/{ticketId}/attachments` | Own ticket only, else `404` | Any ticket |
| `GET /attachments/{attachmentId}/download` | Own ticket only, else `404` | Any ticket |
| `POST /tickets/{ticketId}/attachments` | Own, not CLOSED or CANCELLED | `403 FORBIDDEN` (DEV-07) |
| `DELETE /attachments/{attachmentId}` | Own, not CLOSED or CANCELLED | `403 FORBIDDEN` (DEV-07) |

The download response is unchanged from L2 §4.3. Because the client now uses
the same-origin relative URL and the browser sends the session cookie, a plain
`<a href>` click downloads the file (AC-23, DEC-04).

---

## 5. IT Staff endpoints

Route family `/api/v1/staff/**`, open to `IT_STAFF` and `ADMINISTRATOR` (BR-26).
A Requester gets `403 FORBIDDEN` for every path under the prefix, including
paths that do not exist (BR-23).

### 5.1 `GET /api/v1/staff/tickets` — Ticket Queue

**Query parameters**

| Name | Type | Default | Rules |
|---|---|---|---|
| `q` | string | — | Trimmed, at most 150 characters. Case-insensitive substring match on `ticketNumber`, `summary`, and the Requester's `fullName`. Empty after trimming is treated as absent. |
| `status` | enum | — | One `TicketStatus` |
| `itPriority` | enum | — | One `Priority` |
| `categoryId` | integer | — | Must exist |
| `owner` | string | — | `me`, `unassigned`, or the UUID of an existing IT Staff or Administrator user |
| `sortBy` | enum | `itPriority` | `ticketNumber`, `createdAt`, `updatedAt`, `itPriority`, `status` |
| `sortOrder` | enum | `desc` | `asc`, `desc` |
| `page` | integer | `1` | ≥ 1 |
| `pageSize` | integer | `20` | `10`, `20`, or `50` |

**Ordering**
- `itPriority` sorts by severity, `LOW < MEDIUM < HIGH < URGENT`.
- `status` sorts in lifecycle order: `NEW`, `OPEN`, `IN_PROGRESS`, `WAITING_FOR_REQUESTER`, `REOPENED`, `RESOLVED`, `CLOSED`, `CANCELLED`.
- **Default order** (no `sortBy`): `itPriority desc`, then `createdAt asc`, then `id asc`.
- With an explicit `sortBy`, the secondary keys are `createdAt asc`, then `id asc`.

Any parameter outside these rules, and any unlisted parameter, gives `400`. A
page beyond the last returns `data: []` with correct `meta`.

**200**

```json
{
  "data": [
    {
      "id": "3f2b9c10-...",
      "ticketNumber": "TKT-2026-00042",
      "summary": "Laptop battery drains within one hour",
      "requester": { "id": "8f14e45f-...", "fullName": "Napat Chaiwong" },
      "category": { "id": 2, "name": "Hardware" },
      "requestedPriority": "HIGH",
      "itPriority": "URGENT",
      "currentStatus": "IN_PROGRESS",
      "owner": { "id": "a87ff679-...", "fullName": "Somchai Itsara" },
      "requesterIndicatedResolvedAt": null,
      "createdAt": "2026-09-01T13:24:07.512Z",
      "updatedAt": "2026-10-02T08:11:40.003Z"
    }
  ],
  "meta": { "page": 1, "pageSize": 20, "totalItems": 37, "totalPages": 2 }
}
```

**Errors:** `400`, `401`, `403`, `500`.

### 5.2 `GET /api/v1/staff/tickets/{ticketId}`

**200**

```json
{
  "data": {
    "id": "3f2b9c10-...",
    "ticketNumber": "TKT-2026-00042",
    "ticketDate": "2026-09-01T13:24:07.512Z",
    "requester": { "id": "8f14e45f-...", "fullName": "Napat Chaiwong", "email": "napat.cha@kmutt.ac.th" },
    "category": { "id": 2, "name": "Hardware" },
    "relatedSystem": { "id": 7, "name": "Corporate Laptop" },
    "summary": "Laptop battery drains within one hour",
    "description": "…",
    "requestedPriority": "HIGH",
    "itPriority": "URGENT",
    "currentStatus": "IN_PROGRESS",
    "owner": { "id": "a87ff679-...", "fullName": "Somchai Itsara" },
    "requesterIndicatedResolvedAt": null,
    "availableTransitions": ["WAITING_FOR_REQUESTER", "RESOLVED", "CANCELLED"],
    "attachments": [ /* L2 §4.2 attachment metadata */ ],
    "createdAt": "2026-09-01T13:24:07.512Z",
    "updatedAt": "2026-10-02T08:11:40.003Z"
  }
}
```

`availableTransitions` is computed on the server from the transition matrix
(BR-35) and the owner rule (BR-36) for the current state. The UI renders
status actions from this list and never duplicates the matrix.

Comments and notes are fetched separately (Section 6).

**Errors:** `400`, `401`, `403`, `404`, `500`.

### 5.3 `GET /api/v1/staff/assignees`

Lists users eligible to be Ticket Owner: active, role `IT_STAFF` or
`ADMINISTRATOR`, sorted by `fullName`. Unpaginated.

**200** `{ "data": [ { "id": "...", "fullName": "...", "role": "IT_STAFF" } ] }`

**Errors:** `401`, `403`, `500`.

### 5.4 `POST /api/v1/staff/tickets/{ticketId}/claim`

No body. Assigns the caller as owner with a conditional update: `ownerId IS NULL`
and status in the claimable set (BR-29, DEC-13). A claim on a `NEW` ticket also
moves it to `OPEN` in the same transaction (BR-31).

**Events:**
- `OWNER_CHANGED { fromOwnerId: null, toOwnerId: caller, cause: "CLAIM" }`;
- when NEW → OPEN, also `STATUS_CHANGED { from: "NEW", to: "OPEN" }`.

**200** — the Section 5.2 detail.

**Errors**

| Status | Code | When |
|---|---|---|
| `409` | `TICKET_ALREADY_CLAIMED` | The ticket already has an owner, including one set by a concurrent claim |
| `409` | `TICKET_STATE_CONFLICT` | The status is RESOLVED, CLOSED, or CANCELLED |

Also `400`, `401`, `403`, `404`, `500`.

### 5.5 `PUT /api/v1/staff/tickets/{ticketId}/owner`

**Request** `{ "ownerId": "a87ff679-..." }`

| Rule | Failure |
|---|---|
| `ownerId` is a UUID of an existing, active user with role `IT_STAFF` or `ADMINISTRATOR` (BR-28) | `422`, `details.ownerId`: "Choose an active IT Staff or Administrator user." |
| The status is assignable (Section 5.6 of `specification.md`) | `409 TICKET_STATE_CONFLICT` |

**Behaviour**
- Assigning the current owner returns `200` with no change and no event (BR-30).
- A `NEW` ticket moves to `OPEN` (BR-31).
- **Events:** `OWNER_CHANGED { fromOwnerId, toOwnerId, cause: "ASSIGN" }`, plus `STATUS_CHANGED` when NEW → OPEN.

There is no version check (DEV-10): a concurrent reassignment is last write
wins, and both are recorded as events.

**200** — the Section 5.2 detail.

**Errors:** `400`, `401`, `403`, `404`, `409`, `422`, `500`.

### 5.6 `PUT /api/v1/staff/tickets/{ticketId}/it-priority`

**Request** `{ "itPriority": "URGENT" }`

| Rule | Failure |
|---|---|
| One `Priority` value | `422`, `details.itPriority` |
| The status is not CLOSED or CANCELLED (BR-33) | `409 TICKET_STATE_CONFLICT` |

**Behaviour**
- The same value returns `200` with no event.
- Otherwise, `IT_PRIORITY_CHANGED { from, to }`.
- `requestedPriority` is never modified.

**200** — the Section 5.2 detail.

**Errors:** `400`, `401`, `403`, `404`, `409`, `422`, `500`.

### 5.7 `POST /api/v1/staff/tickets/{ticketId}/status`

**Request** `{ "status": "CANCELLED", "reason": "Duplicate of TKT-2026-00040" }`

| Rule | Failure |
|---|---|
| `status` is one `TicketStatus` | `422`, `details.status` |
| (current, target) is a row of the transition matrix (BR-35). A target of `OPEN` from `NEW` is refused here, because claim or assign performs it (BR-38). | `409 INVALID_STATUS_TRANSITION` |
| If the target requires an owner, one exists (BR-36) | `409 TICKET_OWNER_REQUIRED` |
| For a target of `CANCELLED` or `REOPENED`, `reason` is 5–500 characters after trimming (BR-37) | `422`, `details.reason` |
| For any other target, `reason` is ignored | — |

**Order of evaluation:** validation (`422` for `status`), then transition
(`409`), then owner (`409`), then reason (`422`). A transition that is
impossible is reported as such even if the reason is also missing.

**Side effects, in one transaction:**
- update `currentStatus`;
- `STATUS_CHANGED { from, to, reason? }`;
- for a target of `REOPENED`:
  - clear `requesterIndicatedResolvedAt`;
  - if the owner is no longer an active `IT_STAFF` or `ADMINISTRATOR`, clear `ownerId` and add `OWNER_CHANGED { fromOwnerId, toOwnerId: null, cause: "OWNER_INELIGIBLE_ON_REOPEN" }` with a null actor (BR-40, BR-55).

**200** — the Section 5.2 detail.

**Errors:** `400`, `401`, `403`, `404`, `409`, `422`, `500`.

Messages:
- `INVALID_STATUS_TRANSITION`: "This ticket cannot move from {From} to {To}."
- `TICKET_OWNER_REQUIRED`: "Assign a Ticket Owner before moving this ticket to {To}."

Statuses are rendered with their display names.

---

## 6. Public Comments, Internal Notes, and resolution indication

### 6.1 `GET /api/v1/tickets/{ticketId}/comments`

| Caller | Access |
|---|---|
| Requester | The ticket's Requester only, else `404` (BR-24) |
| IT Staff, Administrator | Any ticket |

**200** `{ "data": CommentOrNote[] }`, oldest first, unpaginated (BR-51).

**Errors:** `400`, `401`, `403`, `404`, `500`.

### 6.2 `POST /api/v1/tickets/{ticketId}/comments`

Same access as Section 6.1. CSRF required.

**Request** `{ "body": "Please try restarting with the charger connected." }`

| Rule | Failure |
|---|---|
| `body` is 1–2000 characters after trimming (BR-47) | `422`, `details.body`: "Comment must be 1–2000 characters." |
| The ticket is not CLOSED (BR-52) | `409 TICKET_STATE_CONFLICT` |

Author and time come from the session and the server clock. A client-supplied
`authorId` or `createdAt` is ignored (BR-48). The body is stored exactly as
trimmed. No sanitisation is applied, because rendering is plain text (BR-49).

**201** `{ "data": CommentOrNote }`

**Errors:** `400`, `401`, `403`, `404`, `409`, `422`, `500`.

### 6.3 `GET /api/v1/tickets/{ticketId}/notes`

`IT_STAFF` and `ADMINISTRATOR` only.

A Requester gets `403 FORBIDDEN` before any lookup. The body is identical for
their own ticket, another Requester's ticket, and a ticket that does not exist
(AC-04, BR-23).

**200** `{ "data": CommentOrNote[] }`, oldest first.

**Errors:** `400`, `401`, `403`, `404`, `500`.

### 6.4 `POST /api/v1/tickets/{ticketId}/notes`

Same access as Section 6.3. Same body rules and CLOSED rule as Section 6.2. The
`details.body` message reads "Note must be 1–2000 characters."

**201** `{ "data": CommentOrNote }`

**Errors:** `400`, `401`, `403`, `404`, `409`, `422`, `500`.

### 6.5 `POST /api/v1/tickets/{ticketId}/appears-resolved`

Requester only, own ticket. IT Staff and Administrators get `403`. No body.

| Rule | Failure |
|---|---|
| The caller is the ticket's Requester | `404` |
| The status is OPEN, IN_PROGRESS, WAITING_FOR_REQUESTER, or REOPENED (BR-43) | `409 TICKET_STATE_CONFLICT` |
| `requesterIndicatedResolvedAt` is null (BR-44) | `409 RESOLUTION_ALREADY_INDICATED` |

On success, one transaction sets `requesterIndicatedResolvedAt` to now and writes
`RESOLUTION_INDICATED {}`. The status is unchanged.

**200** `{ "data": { "requesterIndicatedResolvedAt": "2026-10-02T09:00:00.000Z" } }`

**Errors:** `400`, `401`, `403`, `404`, `409`, `500`.

---

## 7. Administrator endpoints

Route family `/api/v1/admin/**`, open to `ADMINISTRATOR` only. Every other role
gets `403 FORBIDDEN` for every path under the prefix (BR-23).

```ts
type AdminUser = { id: string; fullName: string; email: string; role: Role;
                   isActive: boolean; mustChangePassword: boolean;
                   createdAt: string; updatedAt: string };
```

### 7.1 `GET /api/v1/admin/users`

| Name | Rules |
|---|---|
| `q` | Optional. Trimmed, at most 100 characters. Case-insensitive substring match on `fullName` or `email`. |
| `role` | Optional. One `Role`. |

Any other parameter, or an invalid `role`, gives `400`. The list is sorted by
`fullName` ascending and is not paginated (BR-66).

**200** `{ "data": AdminUser[] }`

**Errors:** `400`, `401`, `403`, `500`.

### 7.2 `POST /api/v1/admin/users`

**Request**

```json
{ "fullName": "Malee Srisuk", "email": "malee.sri@kmutt.ac.th", "role": "IT_STAFF",
  "isActive": true, "initialPassword": "••••••••••••" }
```

| Field | Rule | Failure |
|---|---|---|
| `fullName` | Required, trimmed, 2–100 characters | `422` |
| `email` | Required, BR-06 | `422` |
| `email` | Not already used, compared after normalisation | `409 EMAIL_ALREADY_EXISTS` |
| `role` | Required, one `Role` (BR-60) | `422` |
| `isActive` | Required, boolean | `422` |
| `initialPassword` | Required, BR-11 length rule | `422` |

Field failures (`422`) are reported together. The duplicate check runs only
when every field is valid.

The new user has `mustChangePassword = true` (BR-62).

**201** `{ "data": AdminUser }`

**Errors:** `400`, `401`, `403`, `409`, `422`, `500`.

### 7.3 `PATCH /api/v1/admin/users/{userId}`

**Request:** any subset of `{ "fullName", "email", "role", "isActive" }`. At least
one field is required. Each field follows the Section 7.2 rules. Any other body
property is ignored; in particular a password cannot be set here.

The checks run inside one transaction that locks the active Administrator rows
(BR-63). The order is:

| # | Check | Failure |
|---|---|---|
| 1 | The acting user is still an active Administrator | `403 FORBIDDEN` |
| 2 | Field validation | `422` |
| 3 | The target user exists | `404` |
| 4 | Email is unique | `409 EMAIL_ALREADY_EXISTS` |
| 5 | After the change, at least one active Administrator remains | `409 LAST_ADMINISTRATOR` — "At least one active Administrator must remain." |
| 6 | Not deactivating self | `409 CANNOT_DEACTIVATE_SELF` — "You cannot deactivate your own account." |
| 7 | Not changing own role | `409 CANNOT_CHANGE_OWN_ROLE` — "You cannot change your own role." |
| 8 | If deactivating, or changing the role to `REQUESTER`: the target owns no ticket in NEW, OPEN, IN_PROGRESS, WAITING_FOR_REQUESTER, or REOPENED | `409 USER_HAS_OPEN_TICKETS` — "This user owns {n} open tickets. Reassign them first." |

**Side effects:** if `isActive` changes to false, or `role` changes, every
session of the target is revoked (BR-64). Changing only the name or email
revokes nothing.

**200** `{ "data": AdminUser }`

**Errors:** `400`, `401`, `403`, `404`, `409`, `422`, `500`.

### 7.4 `POST /api/v1/admin/users/{userId}/initial-password`

**Request** `{ "initialPassword": "••••••••••••" }`, following the BR-11 length
rule. Failure: `422`, `details.initialPassword`.

**Effect (BR-13, BR-64):** store the hash, set `mustChangePassword = true`, and
revoke every session of the target.

- Setting a new initial password on one's own account is permitted. It revokes the caller's own sessions too, so the next request is `401`.
- Setting one on an inactive user is permitted. It takes effect when the user is reactivated.

**200** `{ "data": AdminUser }`

**Errors:** `400`, `401`, `403`, `404`, `422`, `500`.

---

## 8. Ticket Events

Ticket Events have no endpoint in Lab 3 (BR-57, DEV-12). They are written by
the operations in Sections 5 and 6 and verified in API tests by querying the
database. The payloads are fixed by BR-55.

| Operation | Events, in one transaction with the change |
|---|---|
| Claim | `OWNER_CHANGED` (cause `CLAIM`); `STATUS_CHANGED` if NEW → OPEN |
| Assign or reassign | `OWNER_CHANGED` (cause `ASSIGN`); `STATUS_CHANGED` if NEW → OPEN; none if unchanged |
| IT Priority | `IT_PRIORITY_CHANGED`; none if unchanged |
| Status | `STATUS_CHANGED`; plus `OWNER_CHANGED` (cause `OWNER_INELIGIBLE_ON_REOPEN`, null actor) when BR-40 clears the owner |
| Problem appears resolved | `RESOLUTION_INDICATED` |

---

## 9. Status codes and error catalogue

Codes carried from Lab 2 unchanged: `BAD_REQUEST` (400), `NOT_FOUND` (404),
`ATTACHMENT_LIMIT_REACHED` (409), `ATTACHMENT_ALREADY_REMOVED` (409),
`ATTACHMENT_REMOVED` (410), `FILE_TOO_LARGE` (413), `UNSUPPORTED_FILE_TYPE` (415),
`VALIDATION_ERROR` (422), `INTERNAL_ERROR` (500).

Retired: `REQUESTER_NOT_SELECTED` (428), `REQUESTER_INACTIVE` (403).

New in Lab 3:

| Status | Code | When |
|---|---|---|
| `401` | `UNAUTHENTICATED` | No session cookie; the session is unknown, revoked, or expired; or the user is inactive |
| `401` | `INVALID_CREDENTIALS` | Login with an unknown email, a wrong password, or no password set |
| `403` | `ACCOUNT_INACTIVE` | Login with the correct password for an inactive account |
| `403` | `FORBIDDEN` | The role is not permitted for the route family or operation |
| `403` | `CSRF_INVALID` | A state-changing request with a missing or wrong `X-CSRF-Token` |
| `403` | `PASSWORD_CHANGE_REQUIRED` | `mustChangePassword` is true and the endpoint is not exempt |
| `409` | `TICKET_ALREADY_CLAIMED` | Claiming a ticket that already has an owner |
| `409` | `INVALID_STATUS_TRANSITION` | The (current, target) pair is not in the matrix |
| `409` | `TICKET_OWNER_REQUIRED` | The target status requires an owner and the ticket has none |
| `409` | `TICKET_STATE_CONFLICT` | The operation is not permitted in the ticket's current status |
| `409` | `RESOLUTION_ALREADY_INDICATED` | Indicating "appears resolved" when it is already indicated |
| `409` | `EMAIL_ALREADY_EXISTS` | Creating or editing a user with an email already in use |
| `409` | `LAST_ADMINISTRATOR` | The change would leave no active Administrator |
| `409` | `CANNOT_DEACTIVATE_SELF` | An Administrator deactivating their own account |
| `409` | `CANNOT_CHANGE_OWN_ROLE` | An Administrator changing their own role |
| `409` | `USER_HAS_OPEN_TICKETS` | Deactivating or demoting a user who owns open tickets |
| `429` | `TOO_MANY_ATTEMPTS` | Login throttled (BR-09). The response carries `Retry-After`. |

**401 vs 403.** `401` means "we do not know who you are": the client sends the
user to Login. `403` means "we know who you are and the answer is no": the
client shows the forbidden state. The exceptions are `PASSWORD_CHANGE_REQUIRED`,
which sends the user to Change Password, and `CSRF_INVALID`, which the client
handles by refreshing the token from `GET /auth/me` and reporting a safe failure.

---

## 10. Authorization by endpoint

This table is the source for the table-driven negative tests in `tests.md`
(AUZ-01, AUZ-05, AUZ-06, and the role-negative test in each Issue).

| Endpoint | No session | Requester | IT Staff | Administrator |
|---|---|---|---|---|
| `POST /auth/login` | ✓ | ✓ | ✓ | ✓ |
| `POST /auth/logout` | 204 | ✓ | ✓ | ✓ |
| `GET /auth/me`, `POST /auth/password` | 401 | ✓ | ✓ | ✓ |
| `GET /categories`, `GET /related-systems` | 401 | ✓ | ✓ | ✓ |
| `POST /tickets`, `GET /tickets`, `GET /tickets/{id}` | 401 | own / 404 | 403 | 403 |
| `GET /tickets/{id}/attachments`, `GET /attachments/{id}/download` | 401 | own / 404 | ✓ | ✓ |
| `POST /tickets/{id}/attachments`, `DELETE /attachments/{id}` | 401 | own / 404 / 409 | 403 | 403 |
| `GET`, `POST /tickets/{id}/comments` | 401 | own / 404 | ✓ | ✓ |
| `GET`, `POST /tickets/{id}/notes` | 401 | 403 | ✓ | ✓ |
| `POST /tickets/{id}/appears-resolved` | 401 | own / 404 / 409 | 403 | 403 |
| `/staff/**` | 401 | 403 | ✓ | ✓ |
| `/admin/**` | 401 | 403 | 403 | ✓ |
| `GET /api/categories`, `GET /api/health` (Lab 1) | ✓ | ✓ | ✓ | ✓ |

---

## 11. Deferred beyond Lab 3

Recorded so that no Lab 3 implementation anticipates them.

- A ticket version field and stale-update `409` (DEV-10)
- Ticket Event read API and history screen; creation and attachment events (DEV-12)
- Resolution summary (DEV-11)
- Staff attachment upload and removal (DEV-07)
- Requester cancel and reopen (DEV-05)
- Actions Taken and the rule that blocks resolution on open actions (Lab 4)
- Content-based upload type detection (DEV-15); idempotency keys (DEC-17)
- Correlation IDs in error bodies (DEV-08)
