# Lab 3 Sprint Engineering Specification

**Project:** TokTickIT — Users, Roles, IT Staff Ticketing, and Admin Screens
**Sprint:** Lab 3 (Sprint 3)
**Author:** Tanakrit (67070503464)
**Issue:** #34 Sprint 3 engineering contract
**Status:** Draft for approval — must be merged before implementation PRs begin
**Inherits:** TokTickIT System-Level SDS v1.0 (D-01 … D-12) and the merged Lab 2 contract in `docs/lab-02/`
**Companion documents:** `api-spec.md`, `ui-spec.md`, `tests.md`

Lab 2 identifiers are cited with an `L2-` prefix (`L2-BR-18`, `L2-DEC-01`) so they
cannot be confused with the Lab 3 identifiers defined here.

---

## 1. Sprint Goal

Replace the Development Requester selector with real email-and-password
authentication and server-enforced role-based authorization. Requesters keep
every Lab 2 function under their authenticated identity and can now talk to IT
through Public Comments and say that a problem appears resolved. IT Staff get a
shared Ticket Queue and an operational Ticket Detail screen: they can claim and
reassign tickets, set IT Priority, move tickets through a defined workflow, and
keep Internal Notes the Requester never sees. Administrators get one minimal
User Management screen covering accounts, roles, activation and initial
passwords. None of this may cost any Lab 2 data or behaviour.

---

## 2. Stakeholder Request Interpretation

The stakeholder wants the system to know who is acting, and to let each person
do exactly what their role allows, enforced by the server rather than by
hiding buttons.

Four parts of the request need engineering interpretation:

**"Replace it with secure login."** Accounts are created by an Administrator,
and credentials are handed over outside the application (D-05). Secure means:
- passwords stored only as Argon2id hashes;
- an opaque server-side session in an HttpOnly cookie (D-04);
- CSRF protection on every state-changing request;
- login failures that do not reveal which accounts exist;
- a forced password change before an initial password can be used for anything else.

**"Requesters must continue using the ticket functions built in Lab 2."** This
is a regression constraint as much as a feature. Every Lab 2 endpoint keeps its
path and response shape. The only change is where identity comes from: the
`X-Dev-Requester-Id` header is replaced by the session. The ownership guarantee
from L2-BR-18 (another Requester's ticket is reported as not existing) is kept
exactly.

**"Update the Ticket through its permitted workflow."** The labsheet names eight
statuses but leaves the transitions to us. Section 5.6 fixes them as a matrix.
Anything not in the matrix is refused.

**"Requesters may indicate that a problem appears resolved."** This is a flag
and an audit event. It never changes the ticket's status. IT Staff stay
responsible for formally resolving and closing.

---

## 3. Scope

### Included

- Login, logout, current-user retrieval, and mandatory first-login password change
- Voluntary password change for any signed-in user
- PostgreSQL-backed sessions with idle and absolute expiry, rotation, and revocation
- CSRF protection for cookie-authenticated state changes
- Role-based navigation and server-side authorization for Requester, IT Staff and Administrator
- Migrating the Lab 2 Development Requester records into the User model without moving data
- Removing the Development Requester selector, the Change Requester action, the development notice, the `GET /api/v1/dev-requesters` endpoint, and the client's stored selection
- All Lab 2 Requester ticket and attachment functions, now under the authenticated identity
- IT Staff Ticket Queue with search, filters, sorting and pagination
- IT Staff Ticket Detail: claim, assign and reassign, IT Priority, status transitions, cancel and reopen
- Public Comments for Requester, IT Staff and Administrator; Internal Notes for IT Staff and Administrator
- The Requester "Problem Appears Resolved" action
- An append-only TicketEvent record for owner, status, IT Priority and resolution-indication changes
- Administrator User Management: list, search, role filter, create, edit, activate or deactivate, set new initial password
- An idempotent seed covering all three roles, tickets in every status, and example comments and notes
- Zen Green extensions for the new screens, badges and feedback states
- Automated tests at unit, API, UI component, UI style, responsive, migration, regression and E2E levels

### Excluded

Explicitly out of scope for Lab 3. Any of these appearing in the implementation is a defect.

- **Identity extras:** email invitations, email delivery of passwords or reset links, password-reset email, multi-factor authentication, social login, single sign-on, self-registration, account unlocking, approval workflows
- **User-model extras:** multiple roles per user, user deletion, bulk operations, import or export, role history, account-history screens, departments, organisations, profile photos
- **User-list extras:** mandatory pagination, multi-column sorting, multiple simultaneous filters
- **Ticket extras:** Actions Taken (Lab 4), the rule blocking resolution while Actions Taken are open (Lab 4), SLA calculation, escalation rules, resolution summaries (DEV-11), stale-update version checking (DEV-10)
- **Collaboration extras:** editing or deleting comments and notes
- **Platform extras:** notification services and indicators, dashboards and KPI analytics beyond simple queue counts, multi-tenancy, production deployment or cloud infrastructure changes
- **Deferred from Lab 2 again:** content-based upload type detection (DEV-15) and idempotency keys (DEC-17)

---

## 4. Functional Requirements

### Authentication and session

| ID | Requirement |
|---|---|
| FR-01 | The system shall authenticate a user by email address and password and establish a server-side session. |
| FR-02 | The system shall end the session on logout, so that the session cookie no longer grants access. |
| FR-03 | The system shall return the authenticated user's identity, role, and password-change state on request. |
| FR-04 | The system shall require a user whose password must be changed to save a new valid password before any other application function is available. |
| FR-05 | The system shall allow any authenticated user to change their own password by supplying the current one. |
| FR-06 | The system shall expire sessions after a period of inactivity and after a maximum lifetime, whichever comes first. |

### Authorization and navigation

| ID | Requirement |
|---|---|
| FR-07 | The system shall enforce the authorization matrix in Section 5.5 on the server for every protected endpoint. |
| FR-08 | The system shall present only the navigation destinations permitted for the user's role. |
| FR-09 | The system shall redirect unauthenticated access to a protected screen to the Login screen, and show a forbidden state when an authenticated user opens a screen their role does not permit. |

### Requester

| ID | Requirement |
|---|---|
| FR-10 | The system shall provide every Lab 2 Requester ticket and attachment function using the authenticated Requester as the identity, with the Development Requester selector removed. |
| FR-11 | The system shall allow a Requester to read and post Public Comments on their own tickets. |
| FR-12 | The system shall allow a Requester to indicate that the problem on their own ticket appears resolved. |

### IT Staff ticket operations

| ID | Requirement |
|---|---|
| FR-13 | The system shall provide a Ticket Queue listing all tickets, with search, filtering, sorting, and pagination. |
| FR-14 | The system shall provide an IT Staff Ticket Detail view showing ticket information, Requester, Ticket Owner, IT Priority, status, attachments, Public Comments, and Internal Notes. |
| FR-15 | The system shall allow IT Staff to claim an unassigned ticket. |
| FR-16 | The system shall allow IT Staff to assign or reassign a ticket to any active IT Staff or Administrator user. |
| FR-17 | The system shall allow IT Staff to change a ticket's IT Priority. |
| FR-18 | The system shall allow IT Staff to change a ticket's status as permitted by the transition matrix, including cancelling and reopening with a reason. |
| FR-19 | The system shall allow IT Staff to read and post Public Comments on any ticket. |
| FR-20 | The system shall allow IT Staff to read and post Internal Notes on any ticket. |
| FR-21 | The system shall allow IT Staff to list and download the attachments of any ticket. |
| FR-22 | The system shall record an append-only Ticket Event for every owner, status, IT Priority, and resolution-indication change. |

### Administrator user management

| ID | Requirement |
|---|---|
| FR-23 | The system shall list users with name, email, role, and activation status, searchable by name or email and optionally filtered by role. |
| FR-24 | The system shall allow an Administrator to create a user with a name, an email address, one role, an activation state, and an initial password. |
| FR-25 | The system shall allow an Administrator to edit a user's name, email address, role, and activation state. |
| FR-26 | The system shall allow an Administrator to set a new initial password, which the user must change at the next login. |

### Cross-cutting

| ID | Requirement |
|---|---|
| FR-27 | The system shall present distinct feedback for processing, validation, success, empty, no-results, forbidden, not-found, conflict, and safe failure conditions wherever they can occur. |
| FR-28 | The system shall render every Lab 3 screen usably at desktop, tablet, and mobile widths, meeting the Lab 2 responsive and accessibility rules. |
| FR-29 | The system shall migrate the Lab 2 database without losing or re-owning any Requester, Ticket, or Attachment record. |

---

## 5. Business Rules

### 5.1 Authentication and passwords

| ID | Rule |
|---|---|
| BR-01 | Only an active user with valid credentials may authenticate. |
| BR-02 | A user marked as requiring a password change cannot enter the normal application until a new valid password is saved. |
| BR-03 | The authenticated user identity, not a `requesterId` supplied by the client, determines ownership of Requester operations. A client-supplied `requesterId` is ignored outright, as in L2-BR-08. |
| BR-04 | Public Comments are visible to the ticket's Requester, IT Staff, and Administrator. Internal Notes are visible only to IT Staff and Administrator. |
| BR-05 | A Requester may indicate that the problem appears resolved, but cannot formally set the ticket to Resolved or Closed. |
| BR-06 | Email addresses are trimmed and lowercased before validation, storage, comparison, and login. They must be a syntactically valid address of at most 254 characters, and are unique after normalisation. |
| BR-07 | Every login failure caused by an unknown email, a wrong password, or an account with no password set returns the same status, code, and message. A password verification is performed even when the email is unknown, so that response time does not reveal whether the account exists. |
| BR-08 | An inactive account is reported as inactive only after its password has been verified as correct. With a wrong password, an inactive account receives the generic failure from BR-07. |
| BR-09 | After five failed login attempts for the same client address and email within 15 minutes, further attempts for that pair are refused until the window has passed, even with the correct password. A successful login clears the counter. No lockout state is stored, so no account ever needs unlocking. The counter is held in process memory (A-02) and exposes a reset function to test code only; it is never disabled in tests. |
| BR-10 | Passwords are stored only as Argon2id hashes produced by `@node-rs/argon2`. A plaintext password is never stored, logged, returned in a response, or written to a Ticket Event. |
| BR-11 | A password is 12–128 Unicode code points. It is not trimmed and is never truncated. A new password must differ from the user's current password, and must match its confirmation. |
| BR-12 | Changing one's own password requires the current password. On success, `mustChangePassword` becomes false, `passwordChangedAt` is recorded, every other session of that user is revoked, and the current session is rotated. |
| BR-13 | A password set by an Administrator, at creation or as a new initial password, always sets `mustChangePassword` to true and revokes every existing session of that user. The Administrator conveys it to the user outside the application (D-05). |
| BR-14 | A user whose `passwordHash` is null cannot authenticate. Lab 2 Development Requesters arrive in this state after migration (Section 7.3). |

### 5.2 Sessions and CSRF

| ID | Rule |
|---|---|
| BR-15 | A session token is 32 cryptographically random bytes. The browser holds it in the `toktickit_sid` cookie, which is HttpOnly, SameSite=Lax, Path=/, has a Max-Age of 8 hours, and is Secure in production (DEV-09). The database stores only the SHA-256 hash of the token. |
| BR-16 | A session expires 30 minutes after its last use or 8 hours after creation, whichever comes first. An expired or revoked session is treated exactly as no session. |
| BR-17 | Login always issues a new session, and revokes any session the browser presented with the login request. A password change rotates the current session. |
| BR-18 | Logout revokes the session on the server and clears the cookie. Logout without a valid session succeeds without effect. |
| BR-19 | Each authenticated request loads the user through the session and re-checks `isActive`. A deactivated user's next request is unauthenticated even if a session row survived. |
| BR-20 | Each session carries a CSRF token. Every POST, PUT, PATCH, and DELETE except login must send it in the `X-CSRF-Token` header. A missing or mismatched token is refused before any change is made. |
| BR-21 | While `mustChangePassword` is true, only `GET /auth/me`, `POST /auth/password`, and `POST /auth/logout` are available. Every other protected endpoint is refused with `PASSWORD_CHANGE_REQUIRED`. |

### 5.3 Authorization

| ID | Rule |
|---|---|
| BR-22 | Access is denied by default. Every `/api/v1` endpoint requires a session except `POST /api/v1/auth/login`. The Lab 1 routes `GET /api/health` and `GET /api/categories` remain public and unchanged (L2-A-04). |
| BR-23 | The role check runs before any resource is looked up. A role refusal is a 403 whose body is identical whether or not the addressed resource exists. |
| BR-24 | A Requester can reach a ticket, its attachments, and its Public Comments only when they are that ticket's Requester. Any other ticket is answered with 404, identical to a ticket that does not exist (L2-BR-18, DEC-01). |
| BR-25 | Only a Requester may create a ticket (DEV-06). The My Tickets endpoints are for the Requester role only; IT Staff and Administrators use the Ticket Queue. |
| BR-26 | An Administrator may perform every IT Staff ticket operation (DEC-18). IT Staff may not perform any user-management operation. |
| BR-27 | IT Staff and Administrators may read every ticket. They have no resource-level restriction on tickets. |

### 5.4 Ticket Owner and IT Priority

| ID | Rule |
|---|---|
| BR-28 | A ticket has zero or one Ticket Owner. At the moment of assignment, the owner must be an active user with the IT Staff or Administrator role. |
| BR-29 | Claiming assigns the caller as owner of an unassigned ticket. The claim succeeds only if the ticket is still unassigned at the moment of the update, so of two simultaneous claims exactly one succeeds. |
| BR-30 | Assigning or reassigning sets the owner to any eligible user, the caller included. Assigning the current owner again changes nothing and records no event. |
| BR-31 | Claiming or assigning a ticket in status NEW moves it to OPEN in the same transaction. In any other assignable status, the status is unchanged. |
| BR-32 | Owner changes are permitted in NEW, OPEN, IN_PROGRESS, WAITING_FOR_REQUESTER, and REOPENED. A ticket cannot be unassigned in Lab 3, except by BR-40. |
| BR-33 | IT Priority uses the Requested Priority vocabulary (D-03). It is set equal to Requested Priority when a ticket is created, and existing tickets are backfilled the same way. IT Staff may change it in any status except CLOSED and CANCELLED. Requested Priority never changes after creation. |

### 5.5 Authorization matrix

"Own" means the caller is the ticket's Requester. "403" is a role refusal (BR-23). "404" means the resource does not exist or is not the caller's (BR-24). No session gives 401 on every row except login.

| Operation | Requester | IT Staff | Administrator |
|---|---|---|---|
| Log in, log out, current user, change own password | Yes | Yes | Yes |
| Reference data (`/api/v1/categories`, `/api/v1/related-systems`) | Yes | Yes | Yes |
| Create ticket | Yes | 403 | 403 |
| My Tickets list and detail | Own; else 404 | 403 | 403 |
| Ticket Queue, staff ticket detail, assignee list | 403 | Yes | Yes |
| Claim, assign, reassign | 403 | Yes | Yes |
| Change IT Priority | 403 | Yes | Yes |
| Change status, including cancel and reopen | 403 | Yes | Yes |
| Indicate problem appears resolved | Own; else 404 | 403 | 403 |
| Read and post Public Comments | Own; else 404 | Yes | Yes |
| Read and post Internal Notes | 403 | Yes | Yes |
| List and download attachments | Own; else 404 | Yes | Yes |
| Upload and remove attachments | Own, ticket not CLOSED or CANCELLED | 403 | 403 |
| List, search, and filter users | 403 | 403 | Yes |
| Create and edit users | 403 | 403 | Yes, subject to BR-60 to BR-63 |
| Set new initial password | 403 | 403 | Yes |

### 5.6 Ticket status

| ID | Rule |
|---|---|
| BR-34 | The statuses are New, Open, In Progress, Waiting for Requester, Resolved, Closed, Reopened, and Cancelled, stored as `NEW`, `OPEN`, `IN_PROGRESS`, `WAITING_FOR_REQUESTER`, `RESOLVED`, `CLOSED`, `REOPENED`, and `CANCELLED`. |
| BR-35 | Only the transitions in the matrix below are permitted, and only IT Staff and Administrators may perform them. Any other transition is refused with `INVALID_STATUS_TRANSITION` and changes nothing. |
| BR-36 | A ticket must have a Ticket Owner to enter OPEN, IN_PROGRESS, WAITING_FOR_REQUESTER, RESOLVED, or CLOSED. A transition that would break this is refused with `TICKET_OWNER_REQUIRED`. |
| BR-37 | Cancelling and reopening require a reason of 5–500 characters after trimming, and an explicit confirmation in the UI. Resolving and closing require confirmation. No other transition requires confirmation. |
| BR-38 | NEW → OPEN happens only through claim or assign (BR-31), never through the status endpoint. |
| BR-39 | A CLOSED ticket is locked. Comments, notes, owner changes, IT Priority changes, and attachment uploads or removals are refused with `TICKET_STATE_CONFLICT`. The only permitted change is reopening. |
| BR-40 | Reopening clears the Requester's resolution indication. If the current owner is no longer an active IT Staff or Administrator user, reopening also clears the owner and records that as an owner change. |
| BR-41 | A CANCELLED ticket refuses owner changes, IT Priority changes, and attachment uploads or removals. Public Comments and Internal Notes remain permitted. |
| BR-42 | Lab 3 records no resolution summary (DEV-11). Staff explain the fix in a Public Comment. |

**Transition matrix (BR-35).** All rows: IT Staff or Administrator only. Each row writes one `STATUS_CHANGED` event.

| From | To | Owner required | Input | Confirmation |
|---|---|---|---|---|
| NEW | OPEN | set by claim or assign | — | — |
| NEW | CANCELLED | no | reason | yes |
| OPEN | IN_PROGRESS | yes | — | — |
| OPEN | RESOLVED | yes | — | yes |
| OPEN | CANCELLED | no | reason | yes |
| IN_PROGRESS | WAITING_FOR_REQUESTER | yes | — | — |
| IN_PROGRESS | RESOLVED | yes | — | yes |
| IN_PROGRESS | CANCELLED | no | reason | yes |
| WAITING_FOR_REQUESTER | IN_PROGRESS | yes | — | — |
| WAITING_FOR_REQUESTER | RESOLVED | yes | — | yes |
| WAITING_FOR_REQUESTER | CANCELLED | no | reason | yes |
| REOPENED | IN_PROGRESS | yes | — | — |
| REOPENED | RESOLVED | yes | — | yes |
| REOPENED | CANCELLED | no | reason | yes |
| RESOLVED | CLOSED | yes | — | yes |
| RESOLVED | REOPENED | no | reason | yes |
| CLOSED | REOPENED | no | reason | yes |
| CANCELLED | REOPENED | no | reason | yes |

Every pair not listed is refused, including any transition into NEW, RESOLVED → CANCELLED, CLOSED → CANCELLED, and a transition to the current status. A Requester can perform none of them (DEV-05).

**Status-dependent operations.**

| Operation | Permitted in |
|---|---|
| Claim, assign, reassign | NEW, OPEN, IN_PROGRESS, WAITING_FOR_REQUESTER, REOPENED |
| Change IT Priority | every status except CLOSED and CANCELLED |
| Indicate problem appears resolved | OPEN, IN_PROGRESS, WAITING_FOR_REQUESTER, REOPENED |
| Post Public Comment or Internal Note | every status except CLOSED |
| Requester upload or remove attachment | every status except CLOSED and CANCELLED |

Mapping from the Lab 2 enum (Section 7.3): `CLAIMED` → `OPEN`, `PENDING_CONFIRMATION` → `WAITING_FOR_REQUESTER`. The other six values keep their names.

### 5.7 Problem appears resolved

| ID | Rule |
|---|---|
| BR-43 | A Requester may indicate on their own ticket, in a status listed in Section 5.6, that the problem appears resolved. The UI confirms first. The server records `requesterIndicatedResolvedAt` and a `RESOLUTION_INDICATED` event. The status never changes. |
| BR-44 | Indicating again while the indication is already set is refused with `RESOLUTION_ALREADY_INDICATED`. Indicating in any other status is refused with `TICKET_STATE_CONFLICT`. |
| BR-45 | The indication is shown to IT Staff in the Ticket Queue and on Ticket Detail. It is cleared only by reopening (BR-40). |

### 5.8 Public Comments and Internal Notes

| ID | Rule |
|---|---|
| BR-46 | Comments and notes are append-only. No API edits or deletes them. |
| BR-47 | The body is trimmed and must be 1–2000 characters. Empty or whitespace-only content is rejected. |
| BR-48 | Author and creation time are set by the server. Any author or time supplied by the client is ignored. |
| BR-49 | Bodies are rendered as plain text with line breaks preserved. They are never interpreted as HTML or Markdown. |
| BR-50 | Comments and notes are stored in separate tables and reached through separate endpoints, so no flag can make a note public. |
| BR-51 | Both are listed oldest first, without pagination. |
| BR-52 | Neither may be posted on a CLOSED ticket (BR-39). |
| BR-53 | No Requester-facing response includes Internal Note content, count, or existence. |

### 5.9 Ticket Events

| ID | Rule |
|---|---|
| BR-54 | A Ticket Event is written in the same transaction as the change it records, and is never updated or deleted. |
| BR-55 | Event types and payloads: `OWNER_CHANGED { fromOwnerId, toOwnerId, cause }`, `STATUS_CHANGED { from, to, reason? }`, `IT_PRIORITY_CHANGED { from, to }`, `RESOLUTION_INDICATED {}`. The actor is the authenticated user, or null only for the owner clearance in BR-40, whose `cause` is `OWNER_INELIGIBLE_ON_REOPEN`. |
| BR-56 | Event payloads never contain passwords, hashes, session tokens, CSRF tokens, or attachment content. |
| BR-57 | Lab 3 stores events but exposes no event API or history screen (DEV-12). |

### 5.10 Attachments

The Lab 2 attachment policy (L2-BR-30 to L2-BR-42) remains in force unchanged, except as amended by these two rules.

| ID | Rule |
|---|---|
| BR-58 | IT Staff and Administrators may list and download the attachments of any ticket. They may not upload or remove attachments (DEV-07). |
| BR-59 | A Requester's upload or removal is refused with `TICKET_STATE_CONFLICT` when the ticket is CLOSED or CANCELLED. |

### 5.11 Administrator user management

| ID | Rule |
|---|---|
| BR-60 | Every user has exactly one role: `REQUESTER`, `IT_STAFF`, or `ADMINISTRATOR`. Any other value is a validation failure. |
| BR-61 | Full name is trimmed and must be 2–100 characters. Email follows BR-06. A duplicate email, compared after normalisation, is refused with `EMAIL_ALREADY_EXISTS` on both create and edit. |
| BR-62 | Creating a user requires full name, email, role, activation state, and an initial password following BR-11, and always sets `mustChangePassword` (BR-13). Editing changes only full name, email, role, and activation state. Passwords change only through BR-12 or the new-initial-password operation. |
| BR-63 | Safety rules, checked in this order inside one transaction that locks the active Administrator rows: **(1)** a change that would leave no active Administrator is refused with `LAST_ADMINISTRATOR`; **(2)** an Administrator cannot deactivate their own account (`CANNOT_DEACTIVATE_SELF`) or change their own role (`CANNOT_CHANGE_OWN_ROLE`); **(3)** deactivating a user, or changing their role to `REQUESTER`, while they own a ticket in NEW, OPEN, IN_PROGRESS, WAITING_FOR_REQUESTER, or REOPENED is refused with `USER_HAS_OPEN_TICKETS`, naming the count. The transaction also re-checks that the acting Administrator is still active and still an Administrator. |
| BR-64 | Deactivating a user, changing their role, or setting a new initial password revokes every session of that user (SDS: rotate on privilege change). |
| BR-65 | Users are never deleted. Deactivation replaces deletion. |
| BR-66 | The user list is not paginated. Search is a case-insensitive substring match on full name or email; the role filter is optional and single-valued. The list is sorted by full name ascending. |

Why BR-63 checks the last-Administrator rule first: an Administrator cannot
change their own role or deactivate themselves, so a single serial request can
only empty the Administrator set when the sole Administrator targets their own
account. Checking (1) before (2) makes that case report `LAST_ADMINISTRATOR`,
which is the more informative message. The lock and the re-check of the actor
close the remaining case: two Administrators demoting each other at the same time.

### 5.12 Validation, failure, and regression

| ID | Rule |
|---|---|
| BR-67 | The Lab 2 error shape `{ "error": { "code", "message", "details"? } }` (L2-BR-29), the 400 / 422 distinction, and the rejection of unknown query parameters (L2-BR-47) apply to every Lab 3 endpoint (DEV-08). |
| BR-68 | No response reveals another user's tickets, attachments, comments, or notes, a password hash, a session token, or internal storage identifiers (L2-BR-28). |
| BR-69 | Every Lab 2 business rule remains in force except those replaced here: L2-BR-03 and L2-BR-10 to L2-BR-15 (the selector) by BR-01 to BR-21; L2-BR-08 by BR-03; L2-BR-16 by BR-28 to BR-32 (the ticket's Requester still never changes); and L2-BR-38 by BR-58 and BR-59. |
| BR-70 | Every Lab 2 automated test keeps passing, or is superseded by a named Lab 3 test with the mapping recorded in `tests.md` Section 4. No Lab 2 test is deleted silently. |

---

## 6. UI Specification Summary

The complete specification is in `ui-spec.md`. This section records the binding decisions.

### Screens and routes

| Route | Screen | Roles |
|---|---|---|
| `/login` | Login | unauthenticated |
| `/change-password` | Change Password: forced mode when `mustChangePassword`, voluntary otherwise | all |
| `/tickets` | My Tickets (Lab 2) | Requester |
| `/tickets/new` | Create Ticket (Lab 2) | Requester |
| `/tickets/{ticketId}` | Requester Ticket Detail, with Public Comments and Problem Appears Resolved added | Requester |
| `/staff/queue` | IT Staff Ticket Queue | IT Staff, Administrator |
| `/staff/tickets/{ticketId}` | IT Staff Ticket Detail | IT Staff, Administrator |
| `/admin/users` | User Management | Administrator |
| `/lab-01` | Lab 1 page, unchanged and outside the shell (L2-A-05) | public |

`/` redirects by role: Requester → `/tickets`, IT Staff and Administrator → `/staff/queue`.

Navigation by role:
- **Requester:** My Tickets, Create Ticket.
- **IT Staff:** Ticket Queue.
- **Administrator:** Ticket Queue, User Management.

### Shell

- The header shows the user's full name, a role badge, a Change Password link, and a Logout action.
- The selector, the Change Requester action, and the "not a login" development notice are removed.

### Visual rules

- No new colour tokens are introduced. Every new badge and region uses the Lab 2 token table.
- Status, IT Priority, role, and account-status badges always carry text.
- Internal Notes are visually distinct from Public Comments:
  - a warning-toned left border and an "Internal note — not visible to Requester" label;
  - their own region on Staff Detail, with only one composer visible at a time.
- Each destructive or formal action uses a confirmation dialog that traps focus. These are cancel, reopen, resolve, close, problem appears resolved, and set new initial password.
- Forbidden, not-found, conflict, and safe-failure feedback use one shared callout component.

---

## 7. Data Changes

### 7.1 Models

| Model | Change |
|---|---|
| `User` | The Prisma model `RequesterUser` is renamed `User` and mapped to the existing table with `@@map("RequesterUser")` (DEC-02). New fields: `role Role @default(REQUESTER)`, `passwordHash String?`, `mustChangePassword Boolean @default(true)`, `passwordChangedAt DateTime?`. |
| `Ticket` | New fields: `ownerId String?` (FK → `User`, restrict), `itPriority Priority` (not null after backfill), `requesterIndicatedResolvedAt DateTime?`. `requesterId` keeps its meaning: the ticket's Requester. |
| `PublicComment` | New. `id` UUID, `ticketId` (FK), `authorId` (FK → `User`), `body` text, `createdAt`. |
| `InternalNote` | New. Same shape as `PublicComment`, in its own table (BR-50). |
| `TicketEvent` | New. `id` UUID, `ticketId` (FK), `actorId` (FK → `User`, nullable for BR-40), `eventType TicketEventType`, `payload Json`, `createdAt`. |
| `Session` | New. `id` (SHA-256 hex of the token), `userId` (FK), `csrfToken`, `createdAt`, `lastSeenAt`, `expiresAt` (absolute), `revokedAt DateTime?`. |
| `Category`, `RelatedSystem`, `Attachment`, `TicketNumberSequence` | Unchanged. `Attachment.uploadedById` and `removedById` now reference `User`, which is the same table. |

### 7.2 Enums

- `Role`: `REQUESTER`, `IT_STAFF`, `ADMINISTRATOR`.
- `Priority`: the Prisma name for the existing database enum `RequestedPriority`, mapped with `@@map("RequestedPriority")` (DEC-16). It is used by both `requestedPriority` and `itPriority`. No SQL change.
- `TicketStatus`: values renamed in place (DEC-15).
- `TicketEventType`: `OWNER_CHANGED`, `STATUS_CHANGED`, `IT_PRIORITY_CHANGED`, `RESOLUTION_INDICATED`.

### 7.3 Migration

One migration, generated with `prisma migrate dev --create-only` and edited by
hand before it is applied. Per CLAUDE.md, a generated migration that drops or
recreates `RequesterUser`, `Ticket`, or `Attachment` is never accepted.

| Step | SQL intent | Why hand-edited |
|---|---|---|
| 1 | `ALTER TYPE "TicketStatus" RENAME VALUE 'CLAIMED' TO 'OPEN'` and `'PENDING_CONFIRMATION' TO 'WAITING_FOR_REQUESTER'` | Prisma generates a drop-and-recreate of the enum for a rename |
| 2 | `CREATE TYPE "Role"`; add `role`, `passwordHash`, `mustChangePassword`, `passwordChangedAt` to `"RequesterUser"`, so existing rows get `REQUESTER`, null, true, null | Add-only; verified that no table drop is generated |
| 3 | `UPDATE "RequesterUser" SET email = lower(trim(email))`, with a pre-check that fails the migration if that creates a duplicate | Normalisation for BR-06 |
| 4 | Add `"Ticket"."itPriority"` as nullable, run `UPDATE "Ticket" SET "itPriority" = "requestedPriority"`, then `SET NOT NULL` | Backfill for BR-33; Prisma would add NOT NULL without a value |
| 5 | Add `ownerId` (FK, ON DELETE RESTRICT) and `requesterIndicatedResolvedAt` to `"Ticket"` | Add-only |
| 6 | Create `PublicComment`, `InternalNote`, `TicketEvent`, `Session` and their indexes | New tables |

After the migration is applied, a second `prisma migrate dev` must report that
the schema is in sync, and `prisma migrate diff` from the migrations folder to
the schema must be empty (MIG-04).

**How existing Development Requesters get passwords (DEC-03).**
- Migrated users have a null `passwordHash` and cannot log in (BR-14).
- In a real deployment, an Administrator issues each one an initial password through User Management.
- Locally, the seed sets the documented development password for every seeded account (Section 7.5).

**How the selector is removed.**
- **Server:** `GET /api/v1/dev-requesters` and the `X-Dev-Requester-Id` middleware are deleted. A request that still sends the header is authenticated by session only; the header is ignored.
- **Client:** `RequesterSelection`, `RequesterContext`, and the Change Requester action are deleted. At startup, the client removes the `toktickit.selectedRequester` key from sessionStorage once.
- **Interim, #35 to #37:** #35 renames the model to `User` and seeds IT Staff and Administrators before #37 removes the selector. Until then, `GET /api/v1/dev-requesters` and the `X-Dev-Requester-Id` middleware filter on `role = REQUESTER` as well as `isActive`, so no IT Staff or Administrator account can be selected or act as a Requester. L2 API-40's expected count uses the same filter (`tests.md` Section 4.2).

### 7.4 Constraints and indexes

| Item | Decision |
|---|---|
| Unique | `User.email` (stored normalised), plus the Lab 2 uniques |
| Foreign keys | `Ticket.ownerId`; `PublicComment.ticketId` and `authorId`; `InternalNote.ticketId` and `authorId`; `TicketEvent.ticketId` and `actorId`; `Session.userId`. All ON DELETE RESTRICT: tickets and their history are never cascade-deleted (SDS). |
| Index | `Ticket(ownerId)` — the `owner=me` and `owner=unassigned` queue filters, and the open-ticket count in BR-63 |
| Index | `Ticket(currentStatus, createdAt)` — status filter plus the default queue order |
| Index | `PublicComment(ticketId, createdAt)`, `InternalNote(ticketId, createdAt)`, `TicketEvent(ticketId, createdAt)` — always read per ticket in time order |
| Index | `Session(userId)` — revoking all sessions of a user |
| Kept | `Ticket(requesterId, createdAt DESC)` from Lab 2, still the My Tickets access path |

### 7.5 Seed

The seed is idempotent. Users are upserted by email. Seeded tickets are upserted
by fixed UUIDs, and receive their Ticket Number from the normal allocator only
when first created. Comments and notes are upserted by fixed UUIDs.

On every run, the seed resets each seeded account's `passwordHash`,
`mustChangePassword`, `role`, and `isActive` to its fixture values, and revokes
that account's sessions. This makes first-login and password-change E2E tests
repeatable.

The password comes from `SEED_PASSWORD` in `server/.env`. `.env.example` and the
README document a local-only development value. If the variable is missing, the
seed fails with a safe message. No real password appears in the repository.

| Accounts | Count |
|---|---|
| Active Requesters | 4 (the four Lab 2 Development Requesters, emails unchanged) |
| Inactive Requester | 1 (the Lab 2 inactive Requester) |
| Requester fixture with `mustChangePassword = true` | 1 |
| Active IT Staff | 3 |
| Inactive IT Staff | 1 |
| Active Administrator | 1 |

Every seeded account except the must-change fixture has `mustChangePassword = false`.

The fixture accounts, fixed in #35 (all fictional):

| Full name | Email | Role | Active | Must change |
|---|---|---|---|---|
| Napat Chaiwong | napat.cha@kmutt.ac.th | REQUESTER | yes | no |
| Siriporn Meesuk | siriporn.mee@kmutt.ac.th | REQUESTER | yes | no |
| Thanawat Rattana | thanawat.rat@kmutt.ac.th | REQUESTER | yes | no |
| Pimchanok Sonthi | pimchanok.son@kmutt.ac.th | REQUESTER | yes | no |
| Kittipong Wong (inactive) | kittipong.won@kmutt.ac.th | REQUESTER | no | no |
| Chayanin Boonmee | chayanin.boo@kmutt.ac.th | REQUESTER | yes | yes |
| Wichai Prasert | wichai.pra@kmutt.ac.th | IT_STAFF | yes | no |
| Arisa Kongkaew | arisa.kon@kmutt.ac.th | IT_STAFF | yes | no |
| Teerapat Boonsri | teerapat.boo@kmutt.ac.th | IT_STAFF | yes | no |
| Nattapong Saelim (inactive) | nattapong.sae@kmutt.ac.th | IT_STAFF | no | no |
| Sasithorn Pholchai | sasithorn.pho@kmutt.ac.th | ADMINISTRATOR | yes | no |

| Tickets and history | Content |
|---|---|
| Tickets | At least one in each of the eight statuses, across all four priorities, both assigned and unassigned. They belong to Napat Chaiwong, Siriporn Meesuk, and Thanawat Rattana only: Pimchanok Sonthi stays ticket-free, because she is the Lab 2 empty-list fixture (L2 AC-24) that the Lab 2 E2E suite relies on. |
| Public Comments | Examples from Requesters and IT Staff |
| Internal Notes | Examples from IT Staff |
| Ticket Events | Consistent with the seeded owners and statuses |

All seeded text is fictional and contains no sensitive information.

---

## 8. API Contract

Full shapes are in `api-spec.md`. This section fixes the capability set and the conventions.

### Authentication mechanism

- **Session:** an opaque session cookie `toktickit_sid` (BR-15).
- **CSRF:** a CSRF token returned by login and by `GET /auth/me`, sent back in `X-CSRF-Token` on every state change (BR-20).
- **Same origin:** the browser talks to the API same-origin through the Vite proxy in development (DEC-04). `cors()` is removed.

### Capabilities

| Capability | Method and path | Success |
|---|---|---|
| Log in | `POST /api/v1/auth/login` | 200 |
| Log out | `POST /api/v1/auth/logout` | 204 |
| Current user | `GET /api/v1/auth/me` | 200 |
| Change own password | `POST /api/v1/auth/password` | 200 |
| Reference data | `GET /api/v1/categories`, `GET /api/v1/related-systems` | 200 |
| Lab 2 Requester ticket and attachment endpoints | unchanged paths (L2 api-spec §3–4) | unchanged |
| Ticket Queue | `GET /api/v1/staff/tickets` | 200 |
| Staff ticket detail | `GET /api/v1/staff/tickets/{ticketId}` | 200 |
| Eligible owners | `GET /api/v1/staff/assignees` | 200 |
| Claim | `POST /api/v1/staff/tickets/{ticketId}/claim` | 200 |
| Assign or reassign | `PUT /api/v1/staff/tickets/{ticketId}/owner` | 200 |
| Change IT Priority | `PUT /api/v1/staff/tickets/{ticketId}/it-priority` | 200 |
| Change status | `POST /api/v1/staff/tickets/{ticketId}/status` | 200 |
| Public Comments | `GET`, `POST /api/v1/tickets/{ticketId}/comments` | 200 / 201 |
| Internal Notes | `GET`, `POST /api/v1/tickets/{ticketId}/notes` | 200 / 201 |
| Problem appears resolved | `POST /api/v1/tickets/{ticketId}/appears-resolved` | 200 |
| List users | `GET /api/v1/admin/users` | 200 |
| Create user | `POST /api/v1/admin/users` | 201 |
| Edit user | `PATCH /api/v1/admin/users/{userId}` | 200 |
| Set new initial password | `POST /api/v1/admin/users/{userId}/initial-password` | 200 |
| *Removed:* Development Requesters | `GET /api/v1/dev-requesters` | 404 |

### Status codes

| Status | Use |
|---|---|
| 200, 201, 204 | Success |
| 400 | Malformed request, malformed UUID, unknown or invalid query parameter |
| 401 | No session, or an expired or revoked one (`UNAUTHENTICATED`); failed login (`INVALID_CREDENTIALS`) |
| 403 | Role refusal (`FORBIDDEN`), CSRF failure (`CSRF_INVALID`), forced password change pending (`PASSWORD_CHANGE_REQUIRED`), inactive account at login (`ACCOUNT_INACTIVE`) |
| 404 | Resource missing, or not the Requester's own (BR-24) |
| 409 | Domain conflicts: attachment rules (Lab 2), claim race, invalid transition, owner required, ticket state, duplicate email, Administrator safety rules |
| 410, 413, 415 | Lab 2 attachment rules, unchanged |
| 422 | Field validation failure, with `details` |
| 429 | Login throttled (`TOO_MANY_ATTEMPTS`) |
| 500 | Unexpected error, reported safely |

The Lab 2 codes `428 REQUESTER_NOT_SELECTED` and `403 REQUESTER_INACTIVE` are retired.

---

## 9. Acceptance Criteria

### Authentication

| ID | Criterion |
|---|---|
| AC-01 | Given an active user with valid credentials, when the user logs in, then the backend establishes authenticated access and returns the permitted user identity and role. |
| AC-02 | Given a user who must change the initial password, when login succeeds, then normal application screens and APIs remain unavailable until a valid new password is saved. |
| AC-03 | Given an authenticated Requester, when the client supplies another `requesterId`, then the backend still applies the authenticated identity and does not return or create another Requester's data. |
| AC-04 | Given a Requester account, when an Internal Note endpoint is requested, then the operation is rejected without exposing note content. |
| AC-05 | Given a wrong password for an existing account, and separately an unknown email, when each login is attempted, then the two responses are identical in status, code, and message. |
| AC-06 | Given an inactive account, when its correct password is submitted, then the user is told the account is inactive. When a wrong password is submitted, the generic failure is returned. |
| AC-07 | Given five failed logins for one email from one client within 15 minutes, when a sixth is attempted, then it is refused as throttled even with the correct password. |
| AC-08 | Given a signed-in user, when they log out, then requests with the old session are unauthenticated and opening a protected screen directly shows Login. |
| AC-09 | Given a session unused for 30 minutes, or created more than 8 hours ago, when it is next presented, then the request is unauthenticated. |
| AC-10 | Given a password change, when the current password is wrong, the new password is 11 or 129 code points, equals the current one, or does not match its confirmation, then it is rejected. Passwords of 12 and 128 code points are accepted. |
| AC-11 | Given a user signed in on two browsers, when they change their password on one, then the other session ends and the one used for the change continues. |
| AC-12 | Given a signed-in user, when a state-changing request omits or alters the CSRF token, then it is refused and nothing changes. |
| AC-13 | Given a Lab 2 Development Requester migrated without a password, when a login is attempted for that email, then it fails with the generic failure. |
| AC-14 | Given the Login screen, when fields are empty, a request is in flight, or the API fails, then field messages, a busy state, and a safe failure message are shown respectively. |

### Authorization and shell

| ID | Criterion |
|---|---|
| AC-15 | Given no session, when any protected `/api/v1` endpoint is called, then the response is 401. The Lab 1 `GET /api/categories` still answers 200 without a session. |
| AC-16 | Given a Requester, when any IT Staff or Administrator endpoint is called, then the response is 403 with the same body whether or not the addressed resource exists. |
| AC-17 | Given an IT Staff user, when any Administrator endpoint is called, then the response is 403. |
| AC-18 | Given a signed-in user of each role, when the shell renders, then it shows the user's name and role and offers only that role's destinations, and `/` opens the role's landing screen. |
| AC-19 | Given a Requester, when they open `/staff/queue` or `/admin/users` directly, then a forbidden state is shown and no protected data is displayed. |
| AC-20 | Given an IT Staff or Administrator user, when they attempt to create a ticket or open My Tickets through the API, then the request is refused with 403. |

### Requester

| ID | Criterion |
|---|---|
| AC-21 | Given an authenticated Requester, when they create, list, open, upload to, download from, and remove attachments on their own tickets, then every Lab 2 behaviour works, and no Development Requester selector, Change Requester action, or development notice exists. |
| AC-22 | Given Requester B, when Requester A's ticket, attachment, or Public Comments are requested, then the response is 404 and identical to a ticket that does not exist. |
| AC-23 | Given an active attachment on Ticket Detail, when the Download control is clicked in the browser, then the file downloads with its original filename. |
| AC-24 | Given a CLOSED or CANCELLED ticket, when its Requester uploads or removes an attachment, then the request is refused and the UI does not offer those controls. |
| AC-25 | Given a Requester on their own ticket, when they post a Public Comment, then it appears with their name and the server time, and IT Staff can read it. |
| AC-26 | Given a Requester's own ticket in OPEN, IN_PROGRESS, WAITING_FOR_REQUESTER, or REOPENED, when they confirm "Problem appears resolved", then the indication and an event are recorded, the status is unchanged, and IT Staff see the indication in the queue and on detail. |
| AC-27 | Given a Requester, when they attempt any status change, cancel, reopen, claim, assignment, or IT Priority change, then the request is refused with 403 and the UI offers no such control. |

### IT Staff Ticket Queue

| ID | Criterion |
|---|---|
| AC-28 | Given IT Staff or an Administrator, when the queue loads, then tickets from every Requester are listed with Ticket Number, Summary, Requester, IT Priority, Status, Owner, and Last Updated. |
| AC-29 | Given a search term, when it is applied, then only tickets whose Ticket Number, Summary, or Requester name contains it, case-insensitively, are listed. |
| AC-30 | Given a status, IT Priority, category, or owner filter (`me`, `unassigned`, or a user), when it is applied, then only matching tickets are listed. |
| AC-31 | Given no sort, when the queue loads, then tickets are ordered by IT Priority descending, then oldest first. Each documented sort field orders correctly in both directions. |
| AC-32 | Given more tickets than the page size, when page 2 is requested, then the next set and correct metadata are returned. Page sizes 10, 20, and 50 are accepted, 20 is the default, and any other value or unknown parameter is rejected with 400. |
| AC-33 | Given the queue, when it is loading, has no tickets, has no matches, or fails, then distinct loading, empty, no-results, and failure states are shown. At mobile width, rows render as cards. |

### IT Staff Ticket Detail and operations

| ID | Criterion |
|---|---|
| AC-34 | Given IT Staff open a ticket, when Detail renders, then ticket information is grouped and read-only, only the operational fields are editable, and attachments can be listed and downloaded but not uploaded or removed. |
| AC-35 | Given an unassigned NEW ticket, when IT Staff claim it, then they become the Ticket Owner and the status becomes OPEN. |
| AC-36 | Given two IT Staff claiming the same unassigned ticket at once, when both requests complete, then exactly one succeeds and the other receives a conflict, which the UI reports and then reloads the ticket. |
| AC-37 | Given an assignable ticket, when IT Staff assign it to an active IT Staff or Administrator user, then the owner changes. Assigning to a Requester, an inactive user, or an unknown user is rejected with 422. |
| AC-38 | Given a ticket, when it is created, then its IT Priority equals its Requested Priority. When IT Staff change the IT Priority, then it changes and Requested Priority does not. |
| AC-39 | Given each permitted transition in the matrix, when IT Staff perform it, then it succeeds. Given any unlisted transition, it is refused with `INVALID_STATUS_TRANSITION` and nothing changes. |
| AC-40 | Given a ticket without an owner, when a transition requiring an owner is attempted, then it is refused with `TICKET_OWNER_REQUIRED`. |
| AC-41 | Given a cancel or reopen, when no reason or a reason under 5 characters is supplied, then it is rejected. In the UI, it is never sent before confirmation. |
| AC-42 | Given a ticket with a resolution indication whose owner has since been deactivated, when it is reopened, then the indication is cleared and the owner is cleared. |
| AC-43 | Given a CLOSED ticket, when a comment, note, owner change, IT Priority change, or attachment change is attempted, then it is refused with `TICKET_STATE_CONFLICT`. |
| AC-44 | Given an Administrator, when they claim, assign, change IT Priority, and change status, then each succeeds exactly as it does for IT Staff. |
| AC-45 | Given an owner, status, IT Priority, or resolution-indication change, when it commits, then exactly one matching Ticket Event exists with the actor and the before and after values, and no secret in its payload. |

### Public Comments and Internal Notes

| ID | Criterion |
|---|---|
| AC-46 | Given IT Staff post a Public Comment, when the Requester opens the ticket, then the comment is visible with the author's name and a server-set time. |
| AC-47 | Given IT Staff post an Internal Note, when IT Staff or an Administrator open the ticket, then the note is visible. No Requester-facing response contains it. |
| AC-48 | Given a comment or note body that is empty, whitespace only, or 2001 characters long, when it is posted, then it is rejected with 422. Bodies of 1 and 2000 characters are accepted. |
| AC-49 | Given a body containing `<script>` and line breaks, when it is displayed, then the markup appears as literal text and the line breaks are preserved. |
| AC-50 | Given Staff Ticket Detail, when it renders, then Public Comments and Internal Notes are in visually distinct regions, and the note composer is labelled as not visible to the Requester. |

### Administrator user management

| ID | Criterion |
|---|---|
| AC-51 | Given an Administrator, when User Management loads, then users are listed with Name, Email, Role, Status, and an Edit action, searchable by name or email and filterable by one role. |
| AC-52 | Given valid user details and an initial password, when an Administrator creates the user, then the user can log in and must change the password before using the application. |
| AC-53 | Given an email already in use, in any letter case, or an invalid role, when a user is created or edited, then the request is rejected and the message appears beside the field. |
| AC-54 | Given an existing user, when an Administrator edits the name, email, role, or activation state, then the change is saved and shown. |
| AC-55 | Given a user, when an Administrator sets a new initial password, then the user's existing sessions end and the user must change the password at the next login. |
| AC-56 | Given two active Administrators, when one tries to deactivate their own account or change their own role, then the change is refused. |
| AC-57 | Given the only active Administrator, when any change would leave no active Administrator, including two Administrators demoting each other at once, then the change is refused with `LAST_ADMINISTRATOR`. |
| AC-58 | Given an IT Staff user who owns an open ticket, when an Administrator deactivates them or changes their role to Requester, then the change is refused and the message states how many open tickets they own. |
| AC-59 | Given a signed-in user, when an Administrator deactivates them or changes their role, then that user's next request is unauthenticated. A deactivated user who logs in with the correct password is told the account is inactive. |
| AC-60 | Given a Requester or IT Staff user, when the User Management API or screen is opened, then access is refused (403, or the forbidden state). |

### Migration and seed

| ID | Criterion |
|---|---|
| AC-61 | Given a database populated under the Lab 2 schema, when the Lab 3 migration is applied, then every Requester, Ticket, and Attachment row survives with the same ids and ticket Requesters. Former Development Requesters have the REQUESTER role and no password, `CLAIMED` and `PENDING_CONFIRMATION` are renamed, and IT Priority equals Requested Priority. |
| AC-62 | Given the seed has run, when it runs again, after a seeded account's password and password-change flag have been altered, then no record is duplicated and the account's fixture values are restored. |
| AC-63 | Given a seeded database, when it is inspected, then it contains the accounts in Section 7.5, tickets in every status with assigned and unassigned owners, and example comments and notes. |

### Presentation and accessibility

| ID | Criterion |
|---|---|
| AC-64 | Given each of the three viewport widths, when Login, Change Password, Ticket Queue, Staff Ticket Detail, and User Management render, then no horizontal page scrolling occurs and nothing is clipped or overlapping. |
| AC-65 | Given a status, IT Priority, role, or account-status badge, when it renders, then the value is conveyed by text as well as colour. |
| AC-66 | Given any Lab 3 screen, when its computed colours are inspected, then every colour appears in the `ui-spec.md` token table. |
| AC-67 | Given keyboard-only use of the Lab 3 screens, when focus moves through them and through every dialog, then every control is reachable, focus is visible, and dialogs trap focus and return it on close. |
| AC-68 | Given a forbidden, not-found, conflict, or unexpected server response on a Lab 3 screen, when it is received, then a distinct, safe message is shown with no status code, stack trace, or internal detail. |

---

## 10. Definition of Done

### Part 1 — Product completion

The coding agent may report an Issue complete only when the ACs that `tests.md`
Section 3 assigns to it map to passing tests and every applicable item below
holds. The sprint is complete only when all of them hold on the final `main`.

- Every FR in Section 4 is implemented and every AC in Section 9 is satisfied.
- Every AC maps to at least one passing automated test, recorded in `tests.md` with its real test-file path and owning Issue.
- All tests pass from the documented commands. No test is skipped, disabled, commented out, `.only`-scoped, or flaky. The Lab 2 viewport guards (L2 tests §6) are the only conditional skips, and any Lab 3 equivalents are declared the same way.
- Every Lab 2 test passes, or is superseded with its mapping in `tests.md` Section 4.
- The migration was generated with `--create-only`, hand-edited as in Section 7.3, and applies to both an empty database and a populated Lab 2 database. A second `prisma migrate dev` reports the schema in sync.
- The seed is idempotent and restores fixture credentials on every run. No real password or secret is committed.
- Every endpoint conforms to `api-spec.md`, including the error shape, status codes, CSRF rule, and session cookie flags.
- The authorization matrix in Section 5.5 is enforced server-side, and every protected endpoint has a negative test for each refused role.
- The transition matrix in Section 5.6 is enforced server-side and proved exhaustively by unit test.
- No Requester-facing response contains Internal Note data, a password hash, or a session token.
- Every colour, spacing value, and component state used appears in `ui-spec.md`. The Lab 3 screens have the feedback states that `ui-spec.md` lists.
- Every Issue delivering a screen was verified in a running browser before being reported complete (L2 tests §7.1).
- Screenshots exist under `artifacts/lab-03/screenshots/` at the paths in `ui-spec.md` Section 12, and the visual checklist in `tests.md` is complete.
- Nothing from the Section 3 exclusion list is present.
- `README.md` setup, environment (including `SEED_PASSWORD`), run, seed, and test instructions are current and were executed from a clean checkout.

### Part 2 — Course delivery

- Work was decomposed into Issues #33 to #48, each on its own feature branch.
- Every feature branch reached `lab3-staging` through a peer-reviewed PR linked to its Issue through the Development sidebar. The stacked chain #35 → #36 → #37 targeted the previous branch and was retargeted after each lower PR merged.
- A single release PR (#48) merged `lab3-staging` into `main`. No commit was made directly to `main` or `lab3-staging`.
- `reviewer.md` records reviewers, PR links, comments, responses, and approvals, and every statement in it is verifiable from the repository history.
- `ai-use.md` names the LLM, tabulates 6–10 key prompts, and includes "My Reflection".
- All Issues are in Done on the Project board.
- One PDF uses the headings Answer Part 1 to Answer Part 9 in order.

---

## 11. Assumptions and Decisions

### Deviations from the approved System-Level SDS

| ID | SDS baseline | Lab 3 deviation | Rationale |
|---|---|---|---|
| DEV-01 | D-09 KMUTT palette | Zen Green, carried forward from L2-DEV-01 | The labsheet mandates Zen Green again. The D-09 amendment that L2-DEV-01 said was required has still not been made and remains outstanding. |
| DEV-02 | D-06 SeaweedFS | Local filesystem, carried forward from L2-DEV-02 | The labsheet excludes infrastructure changes. The storage interface is unchanged. |
| DEV-03 | D-02 statuses: New, Assigned, In Progress, Pending Requester, Resolved, Closed, Cancelled | The labsheet's eight statuses: Open replaces Assigned, Waiting for Requester replaces Pending Requester, and Reopened is added | The labsheet is the graded sprint contract. An amendment to D-02 is requested. L2-DEC-06 claimed the Lab 2 enum matched D-02; it did not. |
| DEV-04 | Reopening goes to In Progress if an owner exists, otherwise New | Reopening goes to REOPENED | The labsheet requires a Reopened status. |
| DEV-05 | D-02: any user with read access may cancel or reopen | Only IT Staff and Administrators may cancel or reopen | Product decision for Lab 3: Requesters signal through comments and "appears resolved", and IT stays responsible for the formal workflow. |
| DEV-06 | Every role may create tickets | Only Requesters create tickets | The labsheet grants creation to Requesters only. CLAUDE.md forbids widening scope. |
| DEV-07 | IT Staff may upload, and may remove others' attachments with a reason | IT Staff and Administrators may list and download only | The labsheet asks only for "existing Attachments" on Staff Detail. |
| DEV-08 | Error envelope `{ code, message, fieldErrors[], correlationId }` | The Lab 2 envelope `{ code, message, details? }` is kept | It shipped in Lab 2, and the client plus over 40 tests depend on it. Never recorded in Lab 2; recorded now. |
| DEV-09 | Secure cookie flag always | Secure only when `NODE_ENV=production` | Local development uses plain HTTP, and Supertest's cookie jar does not send Secure cookies over HTTP. HttpOnly and SameSite=Lax always apply. |
| DEV-10 | Ticket `version` field; stale update → 409 | No version field and no stale-update check | Deferred. Conflict feedback comes from `TICKET_ALREADY_CLAIMED` and `INVALID_STATUS_TRANSITION`. Two concurrent reassignments or IT Priority changes resolve as last write wins, and both are recorded as events. |
| DEV-11 | `resolutionSummary` field | No resolution summary | Staff explain the fix in a Public Comment. |
| DEV-12 | Events for ticket creation and attachment changes; removal shown in ticket history | Only owner, status, IT Priority, and resolution-indication events. No event API, no history screen, no backfill. | Limits Lab 3 to the events its own features produce. The remainder is natural Lab 4 scope alongside Actions Taken. |
| DEV-13 | Field names `title`, `ticketNo`, `status`, `displayName`, `deletedAt`, `storageKey`; table `User` | Lab 2 names kept; the `User` model is mapped to table `RequesterUser` | Renaming is destructive and gains nothing. Extends L2-DEC-04. |
| DEV-14 | D-07 in-app notification indicator in the header | None | The labsheet excludes notification services. |
| DEV-15 | Upload validation includes the detected content type | Extension plus declared MIME type, as in Lab 2 | Lab 2 tests §7.2 scheduled this for Lab 3. The labsheet does not require it, so it is deferred again with the same risk statement. |
| DEV-16 | Authorization failures return 403 | A Requester denied a specific ticket gets 404; role refusals get 403 | Keeps L2-DEC-01 and labsheet §6.2 (no existence leak). Recorded as a clarification of the SDS status-code rule. |

### Decisions taken within this sprint

| ID | Decision | Rationale |
|---|---|---|
| DEC-01 | Role refusal → 403, checked before lookup. Resource refusal → 404. | Keeps L2-DEC-01, prevents existence leaks (labsheet §6.2), and still lets the UI show a forbidden state. |
| DEC-02 | The Prisma model `User` is mapped onto the existing `RequesterUser` table. | Zero data movement and no foreign-key churn, satisfying the CLAUDE.md migration rule. The cost is a table name that reads oddly. |
| DEC-03 | Migrated users get a null password. The seed sets a documented local-only password from `SEED_PASSWORD`. | No credential enters migration history, and a real deployment requires an Administrator to issue passwords. Local testing stays reproducible. |
| DEC-04 | The Vite dev server proxies `/api` to the API. The client uses relative URLs. `cors()` is removed. | Same-origin in development matches D-08 (Express serves the SPA) and avoids credentialed CORS. It also fixes a latent Lab 2 defect: the Download link is a cross-origin `<a href>` that could not carry the identity header, so a real click returned 428. API-28 and E2E-04 passed only because they bypassed the link. |
| DEC-05 | CSRF uses a synchronizer token stored on the session row. | The simplest robust option when sessions already live in the database. SameSite=Lax alone does not cover same-site subdomains. |
| DEC-06 | Login throttling is in memory, per client address and email, with no stored lockout. | Meets the SDS rate-limiting rule without the account unlocking the labsheet excludes. One process serves the application (D-08). |
| DEC-07 | "Account inactive" is revealed only after the password is verified. | Satisfies both the labsheet's clear inactive response and the SDS rule not to reveal whether an account exists. |
| DEC-08 | Passwords are 12–128 code points, hashed with Argon2id via `@node-rs/argon2`. | Follows OWASP length guidance. `@node-rs/argon2` ships prebuilt binaries and needs no install script. |
| DEC-09 | Deactivating or demoting a user who owns open tickets is refused, not cascaded. | Keeps the labsheet rule that the owner is an active staff user, with no hidden status side effects. |
| DEC-10 | Last-Administrator and self-protection checks run in one locking transaction, last-Administrator first (BR-63). | Correct under concurrency, and makes both labsheet rules observable. |
| DEC-11 | Queue: search over number, summary, and Requester name; single-valued filters; IT Priority then age as the default order; page sizes 10, 20, 50 with 20 as default. | Reuses the Lab 2 list rules and validators. A queue is scanned more than a personal list, so the default page is larger. |
| DEC-12 | Comments and notes: 1–2000 characters, plain text, separate tables. | Safe rendering by default. Separate storage makes accidental publication of a note structurally impossible. |
| DEC-13 | Claim is a conditional update on `ownerId IS NULL`. | Gives a correct race outcome without the version field deferred by DEV-10. |
| DEC-14 | Reopening clears an owner who is no longer eligible. | Resolved and closed tickets keep their historical owner, as DEC-09 allows, yet a reopened ticket never carries an ineligible owner. |
| DEC-15 | `TicketStatus` values are renamed in place with `ALTER TYPE … RENAME VALUE`. | Every Lab 2 row is `NEW`, so the rename touches no data. Prisma's generated drop-and-recreate is rejected. |
| DEC-16 | The Prisma enum is renamed `Priority` and mapped to the existing `RequestedPriority` type. | It now serves both priorities. No SQL change. |
| DEC-17 | Idempotency keys are deferred again. | L2-DEC-07 expected them in Lab 3. The labsheet does not require them, and duplicate ticket creation is still prevented by the busy state. |
| DEC-18 | Administrators may perform every IT Staff ticket operation. | Labsheet §4.3 leaves this to the matrix, the SDS defines Administrator as IT Staff authority plus administration, and labsheet §4.5 allows an Administrator Ticket Owner. |
| DEC-19 | Any active IT Staff member may operate any ticket, not only its owner. | The queue is shared. Ownership records accountability, not exclusive edit rights. |
| DEC-20 | "Requester" means the person who raised the ticket (`requesterId`). "Ticket Owner" means the assigned IT Staff or Administrator (`ownerId`). | Lab 2 used "owned by" for the Requester, and the labsheet and SDS use "Ticket Owner" for staff. Lab 3 documents use the two terms only in these senses. Lab 2 documents are left as written. |

### Open assumptions

| ID | Assumption | Confirmation path |
|---|---|---|
| A-01 | The client address used by BR-09 is Express's `req.ip` without proxy trust, because the API runs on one host (D-08). | Revisit if a reverse proxy is introduced. |
| A-02 | Throttle state is lost when the process restarts. | Acceptable for one process. Recorded so it is not mistaken for a defect. |
| A-03 | `lastSeenAt` is written at most once a minute per session, so idle expiry is accurate to about one minute. | UT-03 tests the boundary on the stored value. |
| A-04 | The Lab 1 page and routes stay public and unchanged (L2-A-04, L2-A-05). | REG-04. |
| A-05 | Comment and note lists are short enough to return whole. | Revisit if a ticket's history grows beyond a few hundred entries. |
