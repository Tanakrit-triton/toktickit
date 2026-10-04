# Lab 3 Test Plan and Results

**Project:** TokTickIT — Users, Roles, IT Staff Ticketing, and Admin Screens
**Companion documents:** `specification.md` (FR/BR/AC), `api-spec.md` (contract), `ui-spec.md` (UI), `docs/lab-02/tests.md` (the Lab 2 suite this plan preserves)
**Status:** Draft for approval — written from the specification **before** implementation, not reconstructed from generated tests

Lab 2 test identifiers carry an `L2` prefix (`L2 API-08`). Unprefixed
identifiers are the Lab 3 tests defined here.

**This document is the scope of record for Issues #35 to #47.** Each Issue body
points here. Section 3 lists, per Issue, the acceptance criteria it delivers
and the tests that prove them. An implementation session can be scoped from
this file alone.

---

## 1. Test Strategy

The Lab 2 strategy (L2 §1) carries over:
- tests are planned from the acceptance criteria;
- one behaviour per test;
- observable behaviour only;
- `data-testid` hooks, never CSS classes;
- a negative test for every protected operation.

Lab 3 adds the rules below.

### Lab 3 rules

- **TDD order is visible in history.** For every Issue, the failing tests are committed alone first, observed to fail for the expected reason, and the implementation follows in a separate commit (CLAUDE.md).
- **Authorization is tested table-driven.** `api-spec.md` §10 is the source table. Every protected endpoint is exercised with no session and with each refused role.
- **Role-negative tests live with the endpoints they protect.** #37 proves the route-family guards. #39–#42 each prove their own endpoints refuse the wrong roles.
- **Real sessions in API tests.** API tests sign in through the real `POST /auth/login`, using the shared helper `server/tests/helpers/session.ts`. It exports `loginAs(email)` and returns a Supertest agent holding the cookie plus the `csrfToken`, which the helper attaches to every non-GET request. Nothing stubs the session middleware in API tests.
- **Throttle isolation without disabling it.** API test files call `resetLoginThrottle()` in `beforeEach`. Throttling stays active in every suite, so UT-05 and API-05 exercise the real limiter (BR-09).
- **Events are verified in the database.** Ticket Events have no API (BR-57), so API tests query `TicketEvent` through Prisma after each operation.
- **Every Issue that delivers a screen is opened in a real browser before it is reported complete** (L2 §7.1). No component test replaces that.

### Levels

| Level | Tool | Scope |
|---|---|---|
| Unit | Vitest | Password hashing and policy, email normalisation, session expiry, login throttle, session gate, queue query parsing and ordering, transition matrix and status guards, comment body validation, admin guard order |
| Migration / seed | Vitest + Prisma CLI | Migration SQL content, upgrade from a populated Lab 2 database, schema drift, seed idempotency and content |
| API | Vitest + Supertest | Every endpoint in `api-spec.md` against a migrated, seeded test database, with real sessions |
| Regression | Existing suites | The Lab 1 and Lab 2 server, client, and E2E suites under authentication |
| UI component | Vitest + Testing Library | Each Lab 3 screen with the API module mocked |
| UI style | Vitest + Testing Library | Badges, note/comment distinction, button hierarchy, token conformance, focus |
| Responsive | Playwright | Lab 3 screens at the three Lab 2 viewports, with screenshots |
| E2E | Playwright | Full stack through a real browser and database |

### Test data

API and E2E suites run against a dedicated test database, migrated and seeded
before each suite. For the server suites this is `TEST_DATABASE_URL` in
`server/.env` (#35): `vitest.config.ts` hands it to every worker as
`DATABASE_URL`, refuses to start if it is missing or equal to `DATABASE_URL`,
and `tests/global-setup.ts` runs `prisma migrate deploy` and the seed against
it before any file runs. The Lab 3 seed (`specification.md` §7.5) supplies every
fixture:

| Fixture | Used for |
|---|---|
| 4 active Requesters | Cross-Requester negative tests |
| 1 inactive Requester | Inactive-account tests |
| 1 must-change Requester | First-login tests |
| 3 active IT Staff | Concurrent claims; open-ticket admin rules |
| 1 inactive IT Staff | Ineligible assignee; reopen owner clearance |
| 1 active Administrator | Last-Administrator rules |
| Tickets in all eight statuses | Status-dependent operations |

Tests that need a second Administrator, or a ticket in a specific state, create
it in their own setup and do not alter shared fixtures. The seed resets fixture
credentials on every run (AC-62), so first-login E2E tests are repeatable.

**E2E-08 precondition.** The seed resets only seeded accounts, and users are
never deleted (BR-65). An Administrator created by one run therefore survives
into the next. The last-Administrator step depends on the seeded Administrator
being the only active one, so E2E-08 makes that true itself:

| Step | When | Action |
|---|---|---|
| (a) | First | Signed in as the seeded Administrator, list users with `GET /api/v1/admin/users?role=ADMINISTRATOR`. Deactivate every active Administrator except the seeded one with `PATCH /api/v1/admin/users/{id} { "isActive": false }`. Each call must return 200; any other status fails the test. |
| (b) | Before the self-deactivation step | Create the second Administrator through the UI with an email unique to the run, `e2e-admin-{timestamp}-{random}@example.test`. A repeated run can never hit `EMAIL_ALREADY_EXISTS`. |
| (c) | At the end, in `finally` | Deactivate the Administrator from step (b) through the API. A run, passing or failing, normally leaves no extra active Administrator. If the process dies before `finally` runs, step (a) of the next run removes the leftover. |

Step (a) is what makes the test repeatable. Step (c) only keeps the database
tidy between runs.

**Users created by E2E tests.** The same reasoning applies to E2E-06 and
E2E-07. Each creates its own user with an email unique to the run, never edits
a seeded or previously created account, and deactivates its user in `finally`.
A repeated run therefore never hits `EMAIL_ALREADY_EXISTS` and never depends on
state left by an earlier run. Deactivated leftovers are harmless: they cannot
sign in, are excluded from `GET /staff/assignees`, and own no tickets.

The migration tests (MIG-02, MIG-03) need a database that starts at the Lab 2
schema. They run in an isolated PostgreSQL schema, `?schema=lab3_migration_test`
on `DATABASE_URL`:
1. apply only the Lab 1 and Lab 2 migrations;
2. insert Lab 2–shaped rows;
3. apply the Lab 3 migration;
4. assert on the result.

The schema is dropped afterwards.

---

## 2. Planned Tests

`Final` is completed after implementation. Every row starts as **Planned**.

### 2.1 Unit — `server/tests/lab-03/*.unit.test.ts`

| Test ID | Type | Req / AC | What it tests | Expected result | Test file | Issue | Final |
|---|---|---|---|---|---|---|---|
| UT-01 | Unit | BR-10 | Argon2id hashing | The hash starts with `$argon2id$`, two hashes of one password differ, verify accepts the right password and rejects a wrong one | `password-hash.unit.test.ts` | #35 | Pass |
| UT-02 | Unit | BR-06 | Email normalisation | Trimmed and lowercased. Invalid syntax and 255 characters are rejected; 254 is accepted. | `email.unit.test.ts` | #35 | Pass |
| UT-03 | Unit | AC-09, BR-16 | Session expiry | With a fake clock: idle 29:59 valid, 30:00 expired; an active session expires at 8 h absolute | `session-expiry.unit.test.ts` | #35 | Pass |
| UT-04 | Unit | AC-10, BR-11 | Password policy | 11 code points rejected, 12 accepted, 128 accepted, 129 rejected. An emoji counts as one code point. Leading and trailing spaces are kept, not trimmed. Equal to current is rejected; a mismatched confirmation is rejected. | `password-policy.unit.test.ts` | #36 | Pass |
| UT-05 | Unit | AC-07, BR-09 | Login throttle | Five failures allowed, the sixth blocked for the same address and email. A different email from the same address is not blocked. A success clears the counter. The fake-clock window expires at 15 min. `resetLoginThrottle()` clears all state. | `login-throttle.unit.test.ts` | #36 | Pass |
| UT-06 | Unit | AC-02, AC-09, BR-21 | Session middleware gate | Missing, expired, or revoked session → 401. A `mustChangePassword` session → 403 `PASSWORD_CHANGE_REQUIRED`, except on the three exempt routes. | `require-session.unit.test.ts` | #36 | Pass |
| UT-07 | Unit | AC-32 | Queue query parser | Page size only 10/20/50, default 20. An unknown parameter, a bad `owner`, a bad `status`, and `q` over 150 characters are each rejected. | `queue-query.unit.test.ts` | #39 | Pass |
| UT-08 | Unit | AC-31 | Queue comparators | IT Priority orders LOW < MEDIUM < HIGH < URGENT. Status orders in lifecycle order. The default key is `itPriority desc, createdAt asc, id asc`. | `queue-query.unit.test.ts` | #39 | Pass |
| UT-09 | Unit | AC-39, BR-35 | Transition matrix, exhaustive | All 64 (from, to) pairs: exactly the 18 matrix rows are permitted, every other pair is refused, and none is permitted for the Requester role | `transitions.unit.test.ts` | #40 | Pass |
| UT-10 | Unit | AC-40, AC-43, BR-36 | Status guards | The owner requirement per target status. The claimable, assignable, and IT-Priority-editable status sets match `specification.md` §5.6. | `transitions.unit.test.ts` | #40 | Pass |
| UT-11 | Unit | AC-48, BR-47 | Comment and note body | Empty and whitespace-only rejected; 1 accepted; 2000 accepted; 2001 rejected; length measured after trimming | `comment-body.unit.test.ts` | #41 | Pass |
| UT-12 | Unit | AC-56, AC-57, BR-63 | Admin guard order | Given counts and actor: the sole Administrator deactivating self → `LAST_ADMINISTRATOR`; with two Administrators → `CANNOT_DEACTIVATE_SELF`; self role change → `CANNOT_CHANGE_OWN_ROLE`; open tickets → `USER_HAS_OPEN_TICKETS` | `admin-guards.unit.test.ts` | #42 | Pass |

### 2.2 Migration, seed, and session store — `server/tests/lab-03/`

| Test ID | Type | Req / AC | What it tests | Expected result | Test file | Issue | Final |
|---|---|---|---|---|---|---|---|
| MIG-01 | Migration | AC-61 | Migration SQL is non-destructive | The Lab 3 `migration.sql` contains no `DROP TABLE` or `CREATE TABLE` for `RequesterUser`, `Ticket`, or `Attachment`, and no `DROP TYPE "TicketStatus"` | `migration.api.test.ts` | #35 | Pass |
| MIG-02 | Migration | AC-61, FR-29 | Upgrade preserves Lab 2 data | Lab 2–shaped Requesters, Tickets, and Attachments (active and removed) survive with identical ids, `requesterId`, Ticket Numbers, and attachment metadata | `migration.api.test.ts` | #35 | Pass |
| MIG-03 | Migration | AC-61, AC-13 | Upgrade backfills and renames | Former Development Requesters have role `REQUESTER`, null `passwordHash`, and `mustChangePassword` true. A `CLAIMED` row reads `OPEN`; a `PENDING_CONFIRMATION` row reads `WAITING_FOR_REQUESTER`. Every `itPriority` equals `requestedPriority`. | `migration.api.test.ts` | #35 | Pass |
| MIG-04 | Migration | AC-61, DoD | No schema drift | `prisma migrate diff --from-migrations … --to-schema-datamodel … --exit-code` reports no difference | `migration.api.test.ts` | #35 | Pass |
| SEED-01 | Seed | AC-62 | Seed idempotent | Running the seed twice leaves every table's row count unchanged | `seed.api.test.ts` | #35 | Pass |
| SEED-02 | Seed | AC-62 | Fixture reset | After a seeded account's password, `mustChangePassword`, role, and `isActive` are altered and a session is created, reseeding restores all four and revokes the session | `seed.api.test.ts` | #35 | Pass |
| SEED-03 | Seed | AC-63 | Seeded accounts | Exactly the accounts in `specification.md` §7.5, by role and activation, including one must-change Requester | `seed.api.test.ts` | #35 | Pass |
| SEED-04 | Seed | AC-63 | Seeded tickets and history | At least one ticket per status, both assigned and unassigned, every priority, and at least one comment and one note | `seed.api.test.ts` | #35 | Pass |
| SES-01 | API | BR-15 | Token storage | A created session row's id is the SHA-256 of the token. The raw token appears in no column. A CSRF token is present. | `sessions.api.test.ts` | #35 | Pass |
| SES-02 | API | AC-11, BR-64 | Revoke all for user | `revokeAllSessions(userId)` sets `revokedAt` on every session of the user and on no one else's. A revoked token no longer resolves. | `sessions.api.test.ts` | #35 | Pass |

### 2.3 API — authentication — `server/tests/lab-03/auth.api.test.ts`

| Test ID | Type | Req / AC | What it tests | Expected result | Test file | Issue | Final |
|---|---|---|---|---|---|---|---|
| API-01 | API | AC-01 | Valid login | 200. `Set-Cookie toktickit_sid` with HttpOnly, SameSite=Lax, and no Secure in test. The body has the user, role, and `csrfToken`. | `auth.api.test.ts` | #36 | Pass |
| API-02 | API | AC-05, BR-07 | Indistinguishable failures | Wrong password and unknown email return byte-identical 401 `INVALID_CREDENTIALS` bodies | `auth.api.test.ts` | #36 | Pass |
| API-03 | API | AC-06, BR-08 | Inactive account | Correct password → 403 `ACCOUNT_INACTIVE`. Wrong password → the generic 401 body. | `auth.api.test.ts` | #36 | Pass |
| API-04 | API | AC-13, BR-14 | Null password hash | A user with null `passwordHash` → the generic 401 body | `auth.api.test.ts` | #36 | Pass |
| API-05 | API | AC-07, BR-09 | Throttling over HTTP | Five wrong passwords, then the correct one → 429 `TOO_MANY_ATTEMPTS` with `Retry-After`. After `resetLoginThrottle()`, the correct password → 200. | `auth.api.test.ts` | #36 | Pass |
| API-06 | API | AC-01, BR-17 | Login rotation | A login sent with an existing session cookie revokes that session and issues a new one | `auth.api.test.ts` | #36 | Pass |
| API-07 | API | AC-01, BR-06 | Case-insensitive email | Logging in with ` NAPAT.CHA@KMUTT.AC.TH ` succeeds | `auth.api.test.ts` | #36 | Pass |
| API-08 | API | AC-01 | Current user | `GET /auth/me` with a session → user and `csrfToken`. Without one → 401 `UNAUTHENTICATED`. | `auth.api.test.ts` | #36 | Pass |
| API-09 | API | AC-08, BR-18 | Logout | 204 and the cookie is cleared. The old cookie → 401. Logout without a session → 204. | `auth.api.test.ts` | #36 | Pass |
| API-10 | API | AC-02, AC-10, BR-12 | Password change success | The must-change fixture changes its password: `mustChangePassword` becomes false, the new password logs in, the old one fails | `auth.api.test.ts` | #36 | Pass |
| API-11 | API | AC-10 | Password change failures | A wrong current password, 11 code points, equal to current, and a mismatch each → 422 with the field named in `details`. All failures are reported together. | `auth.api.test.ts` | #36 | Pass |
| API-12 | API | AC-11, BR-12 | Other sessions revoked | With two agents signed in as one user, a change on agent A gives agent B 401, while A continues with its rotated cookie and new `csrfToken` | `auth.api.test.ts` | #36 | Pass |
| API-13 | API | AC-01, BR-10, BR-68 | No secrets in responses | No auth response body contains `passwordHash`, a `$argon2` string, or the session token | `auth.api.test.ts` | #36 | Pass |

### 2.4 API — authorization and Requester migration — `server/tests/lab-03/authorization.api.test.ts`

| Test ID | Type | Req / AC | What it tests | Expected result | Test file | Issue | Final |
|---|---|---|---|---|---|---|---|
| AUZ-01 | API | AC-15, BR-22 | No session, table-driven | Every protected `/api/v1` endpoint listed in `api-spec.md` §10 at the time of #37 → 401 `UNAUTHENTICATED` | `authorization.api.test.ts` | #37 | Pass |
| AUZ-02 | API | AC-15, A-04 | Lab 1 stays public | `GET /api/categories` and `GET /api/health` → 200 without a session, with Lab 1 bodies unchanged | `authorization.api.test.ts` | #37 | Pass |
| AUZ-03 | API | AC-15 | Reference data needs a session | `/api/v1/categories` and `/related-systems` → 401 without a session, 200 for each role | `authorization.api.test.ts` | #37 | Pass |
| AUZ-04 | API | AC-21 | Selector endpoint removed | `GET /api/v1/dev-requesters` → 404 with or without a session | `authorization.api.test.ts` | #37 | Pass |
| AUZ-05 | API | AC-16, BR-23 | Route-family guard: Requester | A Requester calling `GET /api/v1/staff/tickets`, `GET /api/v1/staff/tickets/{existing id}`, `GET /api/v1/staff/tickets/{random uuid}`, and `GET /api/v1/admin/users` gets 403 `FORBIDDEN` with identical bodies | `authorization.api.test.ts` | #37 | Pass |
| AUZ-06 | API | AC-17 | Route-family guard: IT Staff | IT Staff calling `GET /api/v1/admin/users` and `POST /api/v1/admin/users` → 403 | `authorization.api.test.ts` | #37 | Pass |
| AUZ-07 | API | AC-20, BR-25 | Requester-only endpoints | IT Staff and Administrator calling `POST /tickets` and `GET /tickets` → 403. No ticket is created. | `authorization.api.test.ts` | #37 | Pass |
| AUZ-08 | API | AC-03, BR-03 | Body `requesterId` ignored | A Requester creating a ticket with another Requester's id in the body becomes its Requester | `authorization.api.test.ts` | #37 | Pass |
| AUZ-09 | API | AC-22, BR-24 | Cross-Requester isolation | Requester B requesting A's ticket, attachment list, download, and removal, and a random UUID, gets identical 404 bodies. A's attachment stays active. | `authorization.api.test.ts` | #37 | Pass |
| AUZ-10 | API | AC-12, BR-20 | CSRF enforced | For `POST /tickets`, upload, `DELETE /attachments/{id}`, `POST /auth/password`, and `POST /auth/logout`: a missing or wrong `X-CSRF-Token` → 403 `CSRF_INVALID`, and the database is unchanged | `authorization.api.test.ts` | #37 | Pass |
| AUZ-11 | API | AC-12 | CSRF exemptions | `POST /auth/login` and every GET succeed without the header | `authorization.api.test.ts` | #37 | Pass |
| AUZ-12 | API | AC-02, BR-21 | Password-change gate applied | The must-change fixture gets 403 `PASSWORD_CHANGE_REQUIRED` on `/tickets`, `/categories`, `/staff/tickets`, and `/admin/users`. `GET /auth/me` → 200. | `authorization.api.test.ts` | #37 | Pass |
| AUZ-13 | API | AC-24, BR-59 | Attachment state lock | On the Requester's own CLOSED and CANCELLED tickets, upload and removal → 409 `TICKET_STATE_CONFLICT`. On a NEW ticket both still succeed. | `authorization.api.test.ts` | #37 | Pass |
| AUZ-14 | API | AC-59, BR-19 | Deactivation takes effect immediately | After a signed-in user's `isActive` is set false directly in the database, their next request → 401 | `authorization.api.test.ts` | #37 | Pass |
| AUZ-15 | API | AC-34, BR-58 | Staff attachment access | IT Staff and Administrator can list and download attachments on any ticket. Upload and removal → 403. | `authorization.api.test.ts` | #37 | Pass |

### 2.5 API — Ticket Queue — `server/tests/lab-03/staff-queue.api.test.ts`

| Test ID | Type | Req / AC | What it tests | Expected result | Test file | Issue | Final |
|---|---|---|---|---|---|---|---|
| QUE-01 | API | AC-28 | Queue contents | IT Staff and Administrator see tickets from every Requester. Items carry the `api-spec.md` §5.1 fields and no `description`. | `staff-queue.api.test.ts` | #39 | Pass |
| QUE-02 | API | AC-16, AC-28 | Requester refused | A Requester gets 403 on `GET /staff/tickets` with any parameters | `staff-queue.api.test.ts` | #39 | Pass |
| QUE-03 | API | AC-29 | Search | `q` matches a partial Ticket Number, a summary word, and a Requester name, case-insensitively, and nothing else | `staff-queue.api.test.ts` | #39 | Pass |
| QUE-04 | API | AC-30 | Status filter | Only tickets in the given status | `staff-queue.api.test.ts` | #39 | Pass |
| QUE-05 | API | AC-30 | IT Priority and category filters | Only tickets matching each filter, and both together | `staff-queue.api.test.ts` | #39 | Pass |
| QUE-06 | API | AC-30 | Owner filter | `me` returns the caller's tickets, `unassigned` returns those with a null owner, `{uuid}` returns that user's tickets. A Requester's UUID → 400. | `staff-queue.api.test.ts` | #39 | Pass |
| QUE-07 | API | AC-31 | Default order | Without `sortBy`: URGENT before HIGH, and within a priority the oldest first | `staff-queue.api.test.ts` | #39 | Pass |
| QUE-08 | API | AC-31 | Explicit sorts | `itPriority` asc and desc by severity, `status` in lifecycle order, `updatedAt` desc, `ticketNumber` asc | `staff-queue.api.test.ts` | #39 | Pass |
| QUE-09 | API | AC-32 | Pagination | Default page size 20. Page 2 returns the next set with correct `meta`. | `staff-queue.api.test.ts` | #39 | Pass |
| QUE-10 | API | AC-32 | Invalid parameters | `pageSize=25`, `foo=1`, `owner=someone`, and `status=ASSIGNED` each → 400 | `staff-queue.api.test.ts` | #39 | Pass |
| QUE-11 | API | AC-32 | Page past the end | Empty `data` with correct `meta` | `staff-queue.api.test.ts` | #39 | Pass |

### 2.6 API — Ticket operations — `server/tests/lab-03/staff-ticket-detail.api.test.ts`

| Test ID | Type | Req / AC | What it tests | Expected result | Test file | Issue | Final |
|---|---|---|---|---|---|---|---|
| OPS-01 | API | AC-34 | Staff detail | 200 with Requester, owner, `itPriority`, `requesterIndicatedResolvedAt`, `availableTransitions`, and attachments. An unknown id → 404; a malformed id → 400. | `staff-ticket-detail.api.test.ts` | #40 | Pass |
| OPS-02 | API | AC-35, AC-45 | Claim a NEW ticket | 200. The owner is the caller and the status is OPEN. One `OWNER_CHANGED` (cause `CLAIM`) and one `STATUS_CHANGED` NEW → OPEN event, with the caller as actor. | `staff-ticket-detail.api.test.ts` | #40 | Pass |
| OPS-03 | API | AC-36, BR-29 | Concurrent claims | Two IT Staff claim the same ticket in parallel: one 200, one 409 `TICKET_ALREADY_CLAIMED`. Exactly one `OWNER_CHANGED` event exists. | `staff-ticket-detail.api.test.ts` | #40 | Pass |
| OPS-04 | API | AC-36 | Claim refusals | Claiming an owned ticket → 409 `TICKET_ALREADY_CLAIMED`. Claiming a CLOSED ticket → 409 `TICKET_STATE_CONFLICT`. | `staff-ticket-detail.api.test.ts` | #40 | Pass |
| OPS-05 | API | AC-37, BR-28 | Assign eligibility | Assigning to an active IT Staff or Administrator → 200. To a Requester, the inactive IT Staff, or an unknown UUID → 422 `details.ownerId`. | `staff-ticket-detail.api.test.ts` | #40 | Pass |
| OPS-06 | API | AC-37, AC-45, BR-30 | Reassign and no-op | Reassigning records `OWNER_CHANGED` with from and to. Assigning the current owner → 200 with no event. | `staff-ticket-detail.api.test.ts` | #40 | Pass |
| OPS-07 | API | AC-38, BR-33 | IT Priority on create | A ticket created by a Requester has `itPriority` equal to `requestedPriority` | `staff-ticket-detail.api.test.ts` | #40 | Pass |
| OPS-08 | API | AC-38, AC-45 | Change IT Priority | 200. `IT_PRIORITY_CHANGED` with from and to. `requestedPriority` unchanged. Setting the same value adds no event. CLOSED and CANCELLED → 409. | `staff-ticket-detail.api.test.ts` | #40 | Pass |
| OPS-09 | API | AC-39, AC-45 | Permitted transitions | Table-driven over the 17 status-endpoint rows of the matrix: each → 200 with one `STATUS_CHANGED` event carrying from, to, and any reason | `staff-ticket-detail.api.test.ts` | #40 | Pass |
| OPS-10 | API | AC-39, BR-38 | Refused transitions | NEW → OPEN through the status endpoint, NEW → RESOLVED, RESOLVED → CANCELLED, CLOSED → CANCELLED, OPEN → NEW, and OPEN → OPEN each → 409 `INVALID_STATUS_TRANSITION`, with no change and no event | `staff-ticket-detail.api.test.ts` | #40 | Pass |
| OPS-11 | API | AC-40, BR-36 | Owner required | REOPENED with no owner → IN_PROGRESS gives 409 `TICKET_OWNER_REQUIRED`. After a claim, the same transition succeeds. | `staff-ticket-detail.api.test.ts` | #40 | Pass |
| OPS-12 | API | AC-41, BR-37 | Reason rules | Cancel and reopen with no reason, or a 4-character reason → 422 `details.reason`. Five characters → 200, with the reason in the event payload. | `staff-ticket-detail.api.test.ts` | #40 | Pass |
| OPS-13 | API | AC-42, BR-40 | Reopen side effects | Reopening a RESOLVED ticket that has a resolution indication and whose owner is now inactive clears both. `OWNER_CHANGED` has cause `OWNER_INELIGIBLE_ON_REOPEN` and a null actor. With an eligible owner, the owner is kept. | `staff-ticket-detail.api.test.ts` | #40 | Pass |
| OPS-14 | API | AC-43, BR-39 | CLOSED lock for operations | On a CLOSED ticket, claim, assign, and IT Priority each → 409 `TICKET_STATE_CONFLICT`. Reopen → 200. | `staff-ticket-detail.api.test.ts` | #40 | Pass |
| OPS-15 | API | AC-44, BR-26 | Administrator parity | The Administrator claims, assigns, changes IT Priority, and changes status with the same outcomes and events as IT Staff | `staff-ticket-detail.api.test.ts` | #40 | Pass |
| OPS-16 | API | AC-27 | Requester refused | A Requester calling claim, owner, it-priority, and status (cancel and reopen included) on their own ticket and on a random UUID gets identical 403 bodies | `staff-ticket-detail.api.test.ts` | #40 | Pass |
| OPS-17 | API | AC-45, BR-56 | Event payload safety | Across every operation above, no event payload contains a password, hash, session token, or CSRF token. Every event has `ticketId`, `eventType`, and `createdAt`. | `staff-ticket-detail.api.test.ts` | #40 | Pass |
| OPS-18 | API | AC-37 | Assignee list | `GET /staff/assignees` returns exactly the active IT Staff and Administrators, sorted by name. A Requester → 403. | `staff-ticket-detail.api.test.ts` | #40 | Pass |

### 2.7 API — comments, notes, resolution indication — `server/tests/lab-03/comments-notes.api.test.ts`

| Test ID | Type | Req / AC | What it tests | Expected result | Test file | Issue | Final |
|---|---|---|---|---|---|---|---|
| CMN-01 | API | AC-46, BR-48 | Staff comment visible to Requester | IT Staff posts → 201. The Requester's list contains it with the staff member's name and role and a server `createdAt`. A body `authorId` or `createdAt` is ignored. | `comments-notes.api.test.ts` | #41 | Pass |
| CMN-02 | API | AC-25 | Requester comment | The Requester posts on their own ticket → 201. IT Staff can read it. | `comments-notes.api.test.ts` | #41 | Pass |
| CMN-03 | API | AC-22 | Cross-Requester comments | Requester B listing or posting on A's ticket, and on a random UUID, gets identical 404 bodies | `comments-notes.api.test.ts` | #41 | Pass |
| CMN-04 | API | AC-47 | Notes for staff | IT Staff posts a note → 201. Both IT Staff and the Administrator list it, oldest first. | `comments-notes.api.test.ts` | #41 | Pass |
| CMN-05 | API | AC-04, BR-23 | Notes refused to Requester | A Requester's GET and POST on notes, for their own ticket, another's, and a random UUID, get identical 403 bodies with no note content | `comments-notes.api.test.ts` | #41 | Pass |
| CMN-06 | API | AC-47, BR-53 | No note leakage | After notes exist, no Requester-facing response contains the note body, a note id, or a note count. This covers ticket detail, comments, and My Tickets. | `comments-notes.api.test.ts` | #41 | Pass |
| CMN-07 | API | AC-48 | Body bounds over HTTP | Empty, whitespace-only, and 2001 characters → 422 `details.body`. 1 and 2000 → 201. Checked for comments and notes. | `comments-notes.api.test.ts` | #41 | Pass |
| CMN-08 | API | AC-43, BR-52 | CLOSED refuses, CANCELLED allows | Comment and note on CLOSED → 409 `TICKET_STATE_CONFLICT`. On CANCELLED → 201. | `comments-notes.api.test.ts` | #41 | Pass |
| CMN-09 | API | AC-26, AC-45, BR-43 | Appears resolved | The Requester on their own OPEN ticket → 200. `requesterIndicatedResolvedAt` is set, one `RESOLUTION_INDICATED` event exists, and the status is still OPEN. IT Staff see the indication on the staff detail. The queue item is covered elsewhere: see *CMN-09: where IT Staff see the indication* below. | `comments-notes.api.test.ts` | #41 | Pass |
| CMN-10 | API | AC-26, BR-44 | Appears-resolved refusals | In NEW, RESOLVED, CLOSED, and CANCELLED → 409 `TICKET_STATE_CONFLICT`. A second time → 409 `RESOLUTION_ALREADY_INDICATED`. On another's ticket → 404. As IT Staff → 403. | `comments-notes.api.test.ts` | #41 | Pass |
| CMN-11 | API | AC-49, BR-49 | Body stored verbatim | `<script>alert(1)</script>\nline two` is stored and returned exactly, trimmed only, without escaping or stripping | `comments-notes.api.test.ts` | #41 | Pass |
| CMN-12 | API | AC-26 | Requester detail additions | `GET /tickets/{id}` includes `owner` and `requesterIndicatedResolvedAt`, and does not include `itPriority` | `comments-notes.api.test.ts` | #41 | Pass |

### 2.8 API — user administration — `server/tests/lab-03/users-admin.api.test.ts`

| Test ID | Type | Req / AC | What it tests | Expected result | Test file | Issue | Final |
|---|---|---|---|---|---|---|---|
| ADM-01 | API | AC-51 | User list | Every user with the `AdminUser` fields, sorted by `fullName`. No `passwordHash`. | `users-admin.api.test.ts` | #42 | Pass |
| ADM-02 | API | AC-51, BR-66 | Search and role filter | `q` matches part of a name and part of an email, case-insensitively. `role=IT_STAFF` returns only IT Staff. Both combine. `role=AGENT` and an unknown parameter → 400. | `users-admin.api.test.ts` | #42 | Pass |
| ADM-03 | API | AC-52, BR-62 | Create user | 201 with `mustChangePassword` true. The new user can log in and is then gated by `PASSWORD_CHANGE_REQUIRED`. | `users-admin.api.test.ts` | #42 | Pass |
| ADM-04 | API | AC-53, BR-61 | Duplicate email | Creating with an existing email in different case, and editing a user to another's email → 409 `EMAIL_ALREADY_EXISTS` | `users-admin.api.test.ts` | #42 | Pass |
| ADM-05 | API | AC-53, BR-60 | Create validation | An invalid role, a missing name, a 1-character name, an invalid email, and an 11-code-point password → one 422 naming each field | `users-admin.api.test.ts` | #42 | Pass |
| ADM-06 | API | AC-54 | Edit user | Changing name, email, role, and `isActive` → 200 with each change persisted. A `password` field in the body is ignored. | `users-admin.api.test.ts` | #42 | Pass |
| ADM-07 | API | AC-55, BR-13 | New initial password | 200. `mustChangePassword` true, the target's existing session → 401, the new password logs in, and the old password fails. | `users-admin.api.test.ts` | #42 | Pass |
| ADM-08 | API | AC-56, BR-63 | Self-protection | With a second active Administrator present: self-deactivation → 409 `CANNOT_DEACTIVATE_SELF`; self role change → 409 `CANNOT_CHANGE_OWN_ROLE`; self name change → 200 | `users-admin.api.test.ts` | #42 | Pass |
| ADM-09 | API | AC-57 | Last Administrator, serial | The sole active Administrator deactivating self or changing own role → 409 `LAST_ADMINISTRATOR` | `users-admin.api.test.ts` | #42 | Pass |
| ADM-10 | API | AC-57, BR-63 | Last Administrator, concurrent | Two Administrators each demote the other in parallel: exactly one succeeds, and at least one active Administrator remains | `users-admin.api.test.ts` | #42 | Pass |
| ADM-11 | API | AC-58 | Open-ticket block | Deactivating, or demoting to Requester, an IT Staff member who owns two open tickets → 409 `USER_HAS_OPEN_TICKETS`, whose message contains "2". With only CLOSED tickets → 200. | `users-admin.api.test.ts` | #42 | Pass |
| ADM-12 | API | AC-59, BR-64 | Session revocation | Deactivating a signed-in user, and separately changing a role, makes the target's next request 401. A deactivated user's correct-password login → 403 `ACCOUNT_INACTIVE`. A name-only edit keeps the session. | `users-admin.api.test.ts` | #42 | Pass |
| ADM-13 | API | AC-60 | Non-Administrators refused | Requester and IT Staff on every `/admin/users` endpoint → 403 | `users-admin.api.test.ts` | #42 | Pass |
| ADM-14 | API | AC-54 | Unknown and malformed ids | PATCH or initial-password on an unknown UUID → 404; on a malformed id → 400 | `users-admin.api.test.ts` | #42 | Pass |

### 2.9 Regression — existing suites

| Test ID | Type | Req / AC | What it tests | Expected result | Test file | Issue | Final |
|---|---|---|---|---|---|---|---|
| REG-01 | Regression | AC-21, BR-70 | Lab 2 server suite under sessions | Every kept test in `server/tests/lab-02/` passes using `loginAs()` from `server/tests/helpers/session.ts` instead of the header. Superseded tests are handled per Section 4. | `server/tests/lab-02/*` | #37 | Pass |
| REG-02 | Regression | AC-21, BR-70 | Lab 2 client suite under auth context | Every kept test in `client/tests/lab-02/` passes with the auth provider in place of `RequesterProvider` | `client/tests/lab-02/*` | #38 | Pass |
| REG-03 | Regression | AC-21, BR-70 | Lab 2 E2E suite under login | `e2e/lab-02/` passes: L2 E2E-01 to E2E-03 are rewritten to sign in, and E2E-04, E2E-05, and the responsive specs use the login helper | `e2e/lab-02/*` | #38 | Pass |
| REG-04 | Regression | AC-15, A-04 | Lab 1 suites unchanged | `server/tests/lab-01/` and `client/tests/lab-01/` pass with no edits, through the Vite proxy for the client | `server/tests/lab-01/*`, `client/tests/lab-01/*` | #38 | Pass |

### 2.10 UI component — `client/tests/lab-03/`

| Test ID | Type | Req / AC | What it tests | Expected result | Test file | Issue | Final |
|---|---|---|---|---|---|---|---|
| UI-01 | UI | AC-14 | Login validation | Labelled fields. An empty submit shows a message below each empty field and sends no request. | `Login.test.tsx` | #38 | Pass |
| UI-02 | UI | AC-14 | Login busy | While in flight, Sign in is busy and disabled and the fields are disabled | `Login.test.tsx` | #38 | Pass |
| UI-03 | UI | AC-05 | Invalid credentials | Generic callout. The password is cleared, the email kept, focus moves to Password, and no field is marked invalid. | `Login.test.tsx` | #38 | Pass |
| UI-04 | UI | AC-06 | Inactive account | The inactive callout text is shown | `Login.test.tsx` | #38 | Pass |
| UI-05 | UI | AC-07 | Throttled | The try-later callout is shown | `Login.test.tsx` | #38 | Pass |
| UI-06 | UI | AC-14 | Login failure | On a network failure, a safe callout with no status code. Fields kept. | `Login.test.tsx` | #38 | Pass |
| UI-07 | UI | AC-01, AC-02 | Login outcome | Success navigates to the role's landing route. `mustChangePassword` navigates to Change Password in forced mode. | `Login.test.tsx` | #38 | Pass |
| UI-08 | UI | AC-10 | Client password rules | 11 code points, a mismatch, and equal to current are each blocked with a message below the field and no request | `ChangePassword.test.tsx` | #38 | Pass |
| UI-09 | UI | AC-10 | Server field errors | A 422 `details.currentPassword` renders below Current password | `ChangePassword.test.tsx` | #38 | Pass |
| UI-10 | UI | AC-02 | Change success | The new `csrfToken` is stored, forced mode ends, and the app navigates to landing with the "Password changed." callout | `ChangePassword.test.tsx` | #38 | Pass |
| UI-11 | UI | AC-02 | Forced mode | No navigation and no Change password link. Visiting `/tickets` renders Change Password. | `ChangePassword.test.tsx` | #38 | Pass |
| UI-12 | UI | AC-18 | Shell identity | The user's name, role badge, Change password link, and Log out are present | `AppShell.test.tsx` | #38 | Pass |
| UI-13 | UI | AC-18, FR-08 | Role navigation | Requester: My Tickets and Create Ticket only. IT Staff: Ticket Queue only. Administrator: Ticket Queue and User Management only. | `AppShell.test.tsx` | #38 | Pass |
| UI-14 | UI | AC-21 | Selector removed | No Development Requester selector, no Change Requester action, and no development notice anywhere in the shell | `AppShell.test.tsx` | #38 | Pass |
| UI-15 | UI | AC-08 | Logout | Log out calls the API, clears cached ticket data, and shows Login. Signing in as another user shows none of the previous user's data. | `AppShell.test.tsx` | #38 | Pass |
| UI-16 | UI | AC-08 | Unauthenticated redirect | A protected route redirects to `/login?next=…`. `next=//evil.example` and `next=https://evil.example` are ignored after login. | `routing.test.tsx` | #38 | Pass |
| UI-17 | UI | AC-19, AC-60 | Forbidden route | A Requester at `/staff/queue` and `/admin/users`, and IT Staff at `/admin/users`, see `state-forbidden`, and no protected API call is made | `routing.test.tsx` | #38 | Pass |
| UI-18 | UI | AC-18 | Landing redirect | `/` goes to `/tickets` for a Requester and to `/staff/queue` for IT Staff and Administrators. `/lab-01` renders outside the shell without a session. | `routing.test.tsx` | #38 | Pass |
| UI-19 | UI | AC-21 | Legacy state removed | A pre-existing `toktickit.selectedRequester` sessionStorage key is removed on startup | `routing.test.tsx` | #38 | Pass |
| UI-20 | UI | AC-12, DEC-04 | API client | Requests use relative `/api/v1/...` URLs. Non-GET requests carry `X-CSRF-Token`; GET requests do not. A 401 response triggers the session-ended redirect. | `api-client.test.ts` | #38 | Pass |
| UI-21 | UI | AC-28 | Queue rendering | The seven columns. An unassigned owner shows "Unassigned". Status and IT Priority badges are present. | `StaffTicketQueue.test.tsx` | #43 | Pass |
| UI-22 | UI | AC-29, AC-30, AC-31 | Queue controls | Search, each filter, and each sort option send the documented parameters and reset to page 1. Clear Filters restores the defaults. | `StaffTicketQueue.test.tsx` | #43 | Pass |
| UI-23 | UI | AC-33, AC-68 | Queue states | Loading, empty, no-results, failure with Retry, and forbidden are distinct in wording and action | `StaffTicketQueue.test.tsx` | #43 | Pass |
| UI-24 | UI | AC-33 | Queue mobile cards | Below 768px, cards and no table. At desktop, a table and no cards. | `StaffTicketQueue.test.tsx` | #43 | Pass |
| UI-25 | UI | AC-32 | Queue pagination | Exactly 10, 20, and 50 are offered, with 20 selected by default. Changing the size requests it and returns to page 1. | `StaffTicketQueue.test.tsx` | #43 | Pass |
| UI-26 | UI | AC-26 | Indication in queue | A row with `requesterIndicatedResolvedAt` shows the compact indicator | `StaffTicketQueue.test.tsx` | #43 | Pass |
| UI-27 | UI | AC-34 | Staff detail layout | Ticket information has no editable control. Editable fields exist only inside `operations-card`. | `StaffTicketDetail.test.tsx` | #44 | Pass |
| UI-28 | UI | AC-35, AC-37 | Owner controls | Claim is shown only when unassigned and claimable. The assignee select lists `/staff/assignees`. A successful claim or assign re-fetches the detail. | `StaffTicketDetail.test.tsx` | #44 | Pass |
| UI-29 | UI | AC-39 | Transition buttons | Exactly one button per `availableTransitions` entry, with the `ui-spec.md` §6.5 labels, and none for unlisted statuses | `StaffTicketDetail.test.tsx` | #44 | Pass |
| UI-30 | UI | AC-41 | Confirmation dialogs | Resolve and Close open a dialog. Cancel and Reopen require a reason, blocked under 5 characters. No request is sent before confirm, and focus returns to the trigger. | `StaffTicketDetail.test.tsx` | #44 | Pass |
| UI-31 | UI | AC-36, AC-68 | Conflict handling | A 409 shows `callout-conflict` with the server message and re-fetches the detail | `StaffTicketDetail.test.tsx` | #44 | Pass |
| UI-32 | UI | AC-50 | Comment and note regions | Separate tabs. Only the active tab's composer is rendered. The note composer and note items carry the "Internal note — not visible to Requester" label. | `StaffTicketDetail.test.tsx` | #44 | Pass |
| UI-33 | UI | AC-49 | Safe body rendering | A body containing `<script>` renders as literal text with no script element in the DOM, and its line breaks are preserved | `StaffTicketDetail.test.tsx` | #44 | Pass |
| UI-34 | UI | AC-34 | Staff attachments read-only | Download links are present. No Add Attachment control, drop zone, or Remove button. | `StaffTicketDetail.test.tsx` | #44 | Pass |
| UI-35 | UI | AC-25 | Requester comments | The Comments card lists comments, posting appends one, and no notes or note tab appear | `RequesterTicketDetail.test.tsx` | #44 | Pass |
| UI-36 | UI | AC-26 | Appears resolved | The button appears only in eligible statuses. Confirming shows the indicator and hides the button. Cancelling the dialog sends nothing. | `RequesterTicketDetail.test.tsx` | #44 | Pass |
| UI-37 | UI | AC-27 | No staff controls for Requester | No status, cancel, reopen, claim, assign, or IT Priority control in any ticket status | `RequesterTicketDetail.test.tsx` | #44 | Pass |
| UI-38 | UI | AC-24 | Attachment lock in UI | On CLOSED and CANCELLED: no Add Attachment and no Remove, and the helper text is shown. Download remains. | `RequesterTicketDetail.test.tsx` | #44 | Pass |
| UI-39 | UI | AC-51 | User list | Name, Email, Role badge, Status badge, and Edit per user. Search and role filter send `q` and `role`. The own row is marked "(you)". | `UserManagement.test.tsx` | #45 | Pass |
| UI-40 | UI | AC-52, AC-53 | Create dialog | Client validation below the fields. A server `EMAIL_ALREADY_EXISTS` renders below Email. Success closes the dialog, refreshes the list, and shows "User saved." | `UserManagement.test.tsx` | #45 | Pass |
| UI-41 | UI | AC-54, AC-56 | Edit dialog | Fields are prefilled and saving sends only the changed fields. On the own row, Role and Active are disabled with the explanation. | `UserManagement.test.tsx` | #45 | Pass |
| UI-42 | UI | AC-55 | Set new initial password | Opens a confirmation dialog with a password field validated against BR-11. Success shows "Initial password set." | `UserManagement.test.tsx` | #45 | Pass |
| UI-43 | UI | AC-57, AC-58, AC-68 | Safety conflicts | `LAST_ADMINISTRATOR` and `USER_HAS_OPEN_TICKETS` responses render as a conflict callout inside the dialog, with input kept | `UserManagement.test.tsx` | #45 | Pass |
| UI-44 | UI | AC-51, AC-60, AC-68 | User list states | Loading, no-results with Clear, failure with Retry, and forbidden. Cards below 768px. | `UserManagement.test.tsx` | #45 | Pass |

### 2.11 UI style — `client/tests/lab-03/theme.style.test.tsx`

| Test ID | Type | Req / AC | What it tests | Expected result | Test file | Issue | Final |
|---|---|---|---|---|---|---|---|
| STY-01 | UI style | AC-65 | Status badges | All eight statuses render their display text, with the background and text tokens from `ui-spec.md` §7.1 | `theme.style.test.tsx` | #43 | Pass |
| STY-02 | UI style | AC-65 | IT Priority badge | Text plus glyph for all four values | `theme.style.test.tsx` | #43 | Pass |
| STY-03 | UI style | AC-65 | Role badge | Text for all three roles. The Administrator badge in the header has its 1px border. | `theme.style.test.tsx` | #38 | Pass |
| STY-04 | UI style | AC-50 | Note vs comment | Note items use `--zg-warning-bg` with a 3px `--zg-warning` left border and the text label. Comment items use `--zg-surface`. The two differ in computed background. | `theme.style.test.tsx` | #44 | Pass |
| STY-05 | UI style | ui-spec §2 | Primary button count | At most one visible primary button on each Lab 3 screen, and on Staff Detail in each composer tab | `theme.style.test.tsx` | #47 | Pass |
| STY-06 | UI style | AC-66 | Token conformance | Every computed colour on the six Lab 3 screens appears in the L2 §1.1 token table | `theme.style.test.tsx` | #47 | Pass |
| STY-07 | UI style | AC-67 | Focus and dialogs | Focused controls show the focus ring. Every dialog traps Tab and restores focus on close. | `theme.style.test.tsx` | #47 | Pass |
| STY-08 | UI style | AC-67 | Keyboard reach | Tab order reaches every control in visual order on each Lab 3 screen. Staff Detail tabs respond to arrow keys. | `theme.style.test.tsx` | #47 | Pass |
| STY-09 | UI style | AC-68 | Callout variants | Forbidden, not-found, conflict, and error callouts differ in computed background and border, each has text and an icon, and none renders a digit-only status code | `theme.style.test.tsx` | #47 | Pass |

### 2.12 Responsive — `e2e/lab-03/responsive.spec.ts`

| Test ID | Type | Req / AC | What it tests | Expected result | Test file | Issue | Final |
|---|---|---|---|---|---|---|---|
| RSP-01 | Responsive | AC-64 | Desktop 1440×900 | Login, Change Password, Queue, Staff Detail, Requester Detail with comments, and User Management: no horizontal scroll, no clipped or overlapping element | `responsive.spec.ts` | #47 | Pass |
| RSP-02 | Responsive | AC-64 | Tablet 834×1112 | The same assertions. The Queue hides the Requester column. | `responsive.spec.ts` | #47 | Pass |
| RSP-03 | Responsive | AC-64 | Mobile 390×844 | The same assertions | `responsive.spec.ts` | #47 | Pass |
| RSP-04 | Responsive | AC-64 | Mobile list forms | The Queue and User Management render cards, not tables, below 768px | `responsive.spec.ts` | #47 | Pass |
| RSP-05 | Responsive | AC-64 | Mobile dialogs and touch targets | Dialogs fit the viewport with stacked actions. Interactive elements are at least 44×44px. | `responsive.spec.ts` | #47 | Pass |
| RSP-06 | Responsive | ui-spec §12 | Screenshot capture | Every path in `ui-spec.md` §12 is produced | `responsive.spec.ts` | #47 | Pass |

### 2.13 End-to-end — `e2e/lab-03/`

| Test ID | Type | Req / AC | What it tests | Expected result | Test file | Issue | Final |
|---|---|---|---|---|---|---|---|
| E2E-01 | E2E | AC-01, AC-05, AC-06, AC-08 | Sign-in journey | An invalid login shows the generic message. The inactive account shows the inactive message. A valid login shows the shell with name and role. Logout, then visiting `/tickets` directly, shows Login. | `authentication.spec.ts` | #46 | Pass |
| E2E-02 | E2E | AC-02 | First-login change | The must-change fixture signs in, is held on Change Password, sets a new password, and lands on My Tickets | `authentication.spec.ts` | #46 | Pass |
| E2E-03 | E2E | AC-26, AC-35, AC-38, AC-39, AC-46, AC-47 | Staff ticket flow | Staff claim a NEW ticket, raise IT Priority, Start work, post a comment, and post a note. The Requester sees the comment but not the note, and indicates appears resolved. Staff see the indicator, Resolve, then Close. | `staff-ticket-flow.spec.ts` | #46 | Pass |
| E2E-04 | E2E | AC-04, AC-16, AC-19 | Requester boundaries | A Requester opening `/staff/queue` sees the forbidden state. Their `page.request` to `/staff/tickets` and to `/tickets/{id}/notes` → 403 with no note text. | `staff-ticket-flow.spec.ts` | #46 | Pass |
| E2E-05 | E2E | AC-23 | Real Download click | Clicking Download on Requester Detail, and on Staff Detail, triggers a browser download whose suggested filename is the original filename (D-25) | `staff-ticket-flow.spec.ts` | #46 | Pass |
| E2E-06 | E2E | AC-52 | Create user and first login | Through the UI, the Administrator creates an IT Staff user with an email unique to the run, `e2e-staff-{timestamp}-{random}@example.test`. That user signs in, must change the password, and then sees the Ticket Queue. In `finally`, the user is deactivated through the API. | `user-administration.spec.ts` | #46 | Pass |
| E2E-07 | E2E | AC-54, AC-55, AC-59 | Edit, deactivate, new password | **Setup:** through the API, the test creates its own target user with an email unique to the run, `e2e-target-{timestamp}-{random}@example.test`, then signs in as that user and changes the password, so `mustChangePassword` is false. **Flow, through the UI:** the Administrator edits the target's name. The Administrator deactivates the target, who then cannot sign in (inactive message). The Administrator reactivates the target and sets a new initial password; the target's next sign-in requires a change. In `finally`, the target is deactivated through the API. | `user-administration.spec.ts` | #46 | Pass |
| E2E-08 | E2E | AC-56, AC-57, AC-60 | Safety and access | Precondition steps (a)–(c) in Section 1, *E2E-08 precondition*, run as part of the test. After step (a), the seeded Administrator, as sole active Administrator, tries to deactivate their own account and sees the last-Administrator message. After step (b) creates a second Administrator, the same attempt shows the self-deactivation message. IT Staff opening `/admin/users` sees the forbidden state. Step (c) then runs. | `user-administration.spec.ts` | #46 | Pass |
| E2E-09 | E2E | AC-41 | Cancel and reopen | Staff cancel a ticket with a reason through the dialog, then reopen it with a reason. The status badge shows Cancelled, then Reopened. | `staff-ticket-flow.spec.ts` | #46 | Pass |

### Tests added after the plan was written

Any test added during implementation is listed here with the reason and
whether it was red first, as in L2 tests §2. It is not folded silently into
Section 2.

No new test IDs so far. #35 added assertions inside planned tests, listed here
so none is folded in silently. All were committed with their tests and were red
first:

| Test | Added assertion | Reason |
|---|---|---|
| MIG-03 | An existing mixed-case, space-padded email is trimmed and lowercased | `specification.md` §7.3 step 3 had no test |
| SEED-03 | Every seeded account's hash verifies against `SEED_PASSWORD` | §7.3: the seed sets the development password for every seeded account |
| SEED-04 | Pimchanok Sonthi owns no ticket | Keeps the L2 AC-24 empty-list fixture the Lab 2 E2E suite relies on (§7.5) |
| SEED-04 | Seeded owners are IT Staff or Administrators; each ticket's latest `OWNER_CHANGED` and `STATUS_CHANGED` match its owner and status | §7.5: events consistent with the seeded owners and statuses; BR-28 |
| SES-01 | The token decodes to 32 bytes; `expiresAt` is 8 hours after `createdAt` | BR-15 and BR-16, at the point the row is written |
| UT-02 | An address without a dotted domain (`user@example`) is invalid syntax | The reading of "syntactically valid" in BR-06 |

#36 added the assertions below inside its planned tests. All were committed
with their tests and were red first. #36 also adds the shared helper
`server/tests/helpers/session.ts` (`loginAs`, Section 1), because its API tests
are the first to sign in.

| Test | Added assertion | Reason |
|---|---|---|
| UT-04 | A trailing space makes a different password; every failing field is reported together | BR-11 (never trimmed) at the equality check; api-spec §2.4 "reported together" at unit level |
| UT-05 | The same email from a different address is not blocked; `retryAfterSeconds` counts down to the end of the window; only failures inside the window count | BR-09 keys on the address *and* the email; api-spec §2.1 `Retry-After`; the window is sliding |
| UT-06 | An inactive user's session → 401; the attached identity carries no secret; the cookie is found among other cookies; `lastSeenAt` is written once 60 s old and not before; a dead must-change session gets 401, not 403 | BR-19 and api-spec §1.1 steps 1–2 belong to the same middleware; A-03; step order |
| API-01 | The session row belongs to the signed-in user and holds the returned `csrfToken`; a missing email or password → 422 with no cookie | api-spec §2.1 step 1 had no test |
| API-08 | The must-change fixture gets 200 from `GET /auth/me` | BR-21 exemption, over HTTP |
| API-09 | The 204 has an empty body | api-spec §2.2 "no body" |
| API-11 | Each failure leaves the stored hash unchanged; no session → 401 | "Rejected" means nothing changes |
| API-12 | Afterwards, the rotated session is the user's only live session | BR-12 revokes every other session and the current one |
| API-13 | Failure bodies (401, 422) and logout are checked as well as successes | BR-68 applies to every auth response |

#37 added the assertions below inside its planned tests. All were committed
with their tests and were red first.

| Test | Added assertion | Reason |
|---|---|---|
| AUZ-04 | The 404 body has code `NOT_FOUND` | api-spec §3 "answers `404 NOT_FOUND`". Any unknown `/api/v1` path gets the same code, with a message that differs from the ownership refusal so the two never match byte for byte. |
| AUZ-05 | A non-existent path under `/staff` and under `/admin` gets the same 403 | api-spec §5 and §7: "including paths that do not exist" (BR-23) |
| AUZ-07 | `GET /tickets/{id}` is refused too | api-spec §10 lists it on the same row as `POST` and `GET /tickets` |
| AUZ-10 | The must-change fixture's `POST /tickets` with no CSRF token gets `CSRF_INVALID`, not `PASSWORD_CHANGE_REQUIRED` | api-spec §1.1 checks step 3 before step 4 |
| AUZ-14 | `/categories` and `/auth/me` are refused as well as `/tickets` | BR-19 applies to every protected endpoint, including the password-gate exemptions |

**Fixture changes made in #37.** No assertion changed.

| File | Change | Why |
|---|---|---|
| `require-session.unit.test.ts` (UT-06) | The harness sends the session's CSRF token on every request | #37 enforces CSRF inside `requireSession` at step 3, so UT-06's POST cases would otherwise stop at `CSRF_INVALID` before reaching the gate they test |
| `server/tests/helpers/session.ts` | Adds `signInFields()`: a seed-password hash and `mustChangePassword: false` | Lets the users a test creates for itself sign in through `loginAs()` |
| Lab 2 `attachments`, `my-tickets`, `ticket-detail` | The suite's own Requesters get `signInFields()`, sign in with `loginAs()`, and their sessions are deleted before the users | REG-01. A session row blocks deleting its user (ON DELETE RESTRICT, §7.4). |
| Lab 2 `create-ticket` | Kept tests post through a `loginAs()` agent. The active-Requester lookup also filters `mustChangePassword: false`. | REG-01. Sorted by name, the first active Requester is now the must-change fixture. |
| Lab 2 `reference-data` (API-38, API-39) | Sign in with `loginAs()` | The reference data now needs a session (AUZ-03) |

#38 added the assertions below inside its planned tests. All were committed
with their tests and were red first.

| Test | Added assertion | Reason |
|---|---|---|
| UI-01 | Email has `type="email"` and `autocomplete="username"`; Password has `autocomplete="current-password"`; focus starts on Email | ui-spec §6.1, element table and Initial state |
| UI-07 | IT Staff land on `/staff/queue` | ui-spec §4 landing routes, at the point of login |
| UI-11 | The forced shell keeps the user display and Log out; the brand is not a link; no ticket request is made on `/tickets` | ui-spec §3, forced mode |
| UI-12, UI-13 | Change password and each navigation item link to their routes | ui-spec §3 and specification.md §6 routes |
| UI-15 | Logout lands on plain `/login`, with no `next` | Keeps the previous user's path from steering the next user |
| UI-16 | `next` is honoured after login; `next=/\evil.example` is ignored too | ui-spec §4 `next` safety. Browsers treat `/\` as `//`. |
| UI-17 | A permitted Administrator at `/admin/users` sees no forbidden state; the forbidden state has the `<h1>` "Access denied" and no status code | ui-spec §10 and §5.1, AC-68 |
| UI-18 | An authenticated user at `/login` goes to their landing route | ui-spec §4 |
| UI-19 | An unrelated sessionStorage key survives | Only the legacy key is removed |
| UI-20 | The Lab 2 API functions also use relative URLs; `createTicket` sends the CSRF token and no `X-Dev-Requester-Id`; the session-ended callout has `role="status"` | DEC-04 covers every client call; ui-spec §10 |
| STY-03 | Each role badge uses the ui-spec §7.3 background and text tokens, and carries `data-role` | ui-spec §7.3 |

**Fixture changes made in #38.** No assertion changed, except the one RSP-06
row below.

| File | Change | Why |
|---|---|---|
| `client/tests/lab-02/session-fixture.ts` (new) | `signInAs()` mocks the startup `GET /auth/me` session | REG-02: the kept Lab 2 screen tests restore their Requester through the auth provider |
| Lab 2 `CreateTicket`, `MyTickets`, `RequesterTicketDetail`, `theme.style` (client) | `AuthProvider` replaces `RequesterProvider`; each render helper calls `signInAs()` instead of writing `toktickit.selectedRequester` | REG-02. In the render helper rather than `beforeEach`, because UI-24 and STY-08 reset mocks mid-test. |
| `e2e/lab-02/helpers.ts` | `signInAs()` and `submitLogin()` replace `enterAs()`. The password comes from `SEED_PASSWORD` or `server/.env`. A page already signed in is sent on by `/login`, so the form is filled only when it shows, as `enterAs()` did for the selector. | REG-03 |
| `e2e/lab-02/requester-ticket-flow.spec.ts` | E2E-01 to E2E-03 rewritten in place (§4.1). E2E-04 downloads through the page's own session, with no header. | REG-03 |
| `e2e/lab-02/responsive.spec.ts` | Signs in with `signInAs()`. Ticket Detail finds the ticket id with a same-origin fetch. The empty/no-results case logs out and signs in instead of changing Requester. | REG-03 |
| `e2e/lab-02/responsive.spec.ts` (L2 RSP-06) | The 44px touch-target check measures `btn-logout` instead of `btn-change-requester` | The Change Requester action is removed. Log out is the identity-panel action that replaces it. **This changes the element measured, not the assertion.** |

#39 added the assertions below inside its planned tests. All were committed
with their tests and were red first, except QUE-02 as noted.

| Test | Added assertion | Reason |
|---|---|---|
| UT-07 | A repeated parameter, a page below 1 or not an integer, an unlisted `sortBy` or `sortOrder`, a bad `itPriority`, and a non-positive `categoryId` are each rejected; a `q` empty after trimming is absent | api-spec §5.1: "any parameter outside these rules … gives `400`" and "empty after trimming is treated as absent" |
| UT-08 | With `sortBy=createdAt`, the secondary keys do not repeat `createdAt` | api-spec §5.1 secondary keys; a repeated key is redundant |
| QUE-01 | Every item field equals the stored value; description text appears nowhere in the item | AC-28 lists the values, not only the keys |
| QUE-02 | The 403 bodies are byte-identical across parameter sets, valid and invalid | BR-23: the role check runs before validation. **Green before implementation:** the `/staff` family guard from #37 already refuses a Requester, so this test could not be red in #39. |
| QUE-03 | Neither the description, the owner's name, nor the category name is searched | "and nothing else" in QUE-03 |
| QUE-05 | Two filters that exclude each other return no tickets | Filters combine with AND |
| QUE-06 | `owner=me` is the caller, not any staff member; a UUID matching no user → 400 | api-spec §5.1: `owner` is "an existing IT Staff or Administrator user" |
| QUE-08 | `status` descending, and `createdAt` in both directions | AC-31: "each documented sort field orders correctly in both directions" |
| QUE-09 | Page size 10 gives correct `meta` on page 3 | AC-32 accepts 10 |
| QUE-10 | A `categoryId` that does not exist → 400 | api-spec §5.1: `categoryId` "must exist" |

#40 added the assertions below inside its planned tests. All were committed
with their tests and were red first, except where the next table says otherwise.

| Test | Added assertion | Reason |
|---|---|---|
| OPS-01 | The whole body equals the api-spec §5.2 shape, including the Requester's email, with no `storedFilename`. `availableTransitions` is `[WAITING_FOR_REQUESTER, RESOLVED, CANCELLED]` for an owned IN_PROGRESS ticket and `[CANCELLED]` for an unowned NEW or REOPENED ticket. | api-spec §5.2: computed from the matrix (BR-35) and the owner rule (BR-36). NEW → OPEN is never offered, because only claim or assign performs it (BR-38). |
| OPS-03 | The race runs five times, and the losing body is `TICKET_ALREADY_CLAIMED` | A single run could pass by luck |
| OPS-04 | Claiming a RESOLVED or CANCELLED ticket → `TICKET_STATE_CONFLICT`. An unknown id → 404; a malformed id → 400. | api-spec §5.4 lists RESOLVED, CLOSED, and CANCELLED |
| OPS-05 | A malformed or missing `ownerId` → 422 with the api-spec message | api-spec §5.5 |
| OPS-06 | Reassigning an IN_PROGRESS ticket keeps IN_PROGRESS. The no-op leaves the row, `updatedAt` included, unchanged. | BR-31; BR-30 "changes nothing" |
| OPS-08 | `urgent`, `CRITICAL`, a missing value, and a number → 422 `details.itPriority` | api-spec §5.6 |
| OPS-09 | Every row sends a padded reason. It is stored trimmed for CANCELLED and REOPENED, and absent from the payload otherwise. | api-spec §5.7: "for any other target, `reason` is ignored" |
| OPS-10 | The message is "This ticket cannot move from New to Resolved." RESOLVED → CANCELLED with no reason is still 409, not 422. An unknown or missing `status` → 422 `details.status`. | api-spec §5.7 messages and order of evaluation |
| OPS-11 | The `TICKET_OWNER_REQUIRED` message names In Progress. Claiming the REOPENED ticket leaves it REOPENED. | api-spec §5.7 messages; BR-31 moves only NEW |
| OPS-12 | A reason of 4 characters padded with spaces, 501 characters, or a number → 422. 500 characters → 200. | BR-37: 5–500 characters after trimming |
| OPS-13 | An owner who is still active but is now a Requester is cleared the same way | BR-40: "no longer an active IT Staff or Administrator user" |
| OPS-17 | Payload keys are exactly the BR-55 set per event type. Searched for: the seed password, every hash, the raw session token, every session id and CSRF token of the users involved. | BR-55, BR-56 |
| OPS-18 | Each item is exactly `{ id, fullName, role }` | api-spec §5.3 |

**Green before the #40 implementation.** These were run with the tests commit
and already passed. They are kept, and no code was changed to make them red.

| Test | Why it was already green |
|---|---|
| OPS-16 | The `/staff` route-family guard from #37 (AUZ-05) refuses a Requester on every path, before any lookup. OPS-16 stays as #40's own role-negative test for its endpoints (Section 1, Lab 3 rules). |
| OPS-18, Requester case | The same #37 guard |
| OPS-09, "has 17 status-endpoint rows" | A check on the test's own table, not on behaviour |

**OPS-07** was red, but only because `GET /staff/tickets/{id}`, which it reads
through, did not exist yet (404). The behaviour it observes, `itPriority` set
equal to `requestedPriority` on create, is #35's code and was not changed by #40.

#41 added the assertions below inside its planned tests. All were committed
with their tests and were red first. No existing test needed a fixture change.

| Test | Added assertion | Reason |
|---|---|---|
| UT-11 | `BODY_MAX` is 2000. Tabs and line breaks alone are whitespace-only. Only the ends are trimmed, so inner line breaks and markup are kept. A non-string body is rejected. | BR-47 measured after trimming; BR-49 plain text; api-spec §1.5 |
| CMN-01 | The 201 body is exactly the `CommentOrNote` shape, with `role` on the author, and `createdAt` within the request window. The stored row's author is the caller. | api-spec §1.6; BR-48 |
| CMN-02 | The Administrator and the Requester also read the comment. Comments list oldest first. | api-spec §6.1 access table; BR-51 |
| CMN-03 | Each 404 is byte-identical to `GET /tickets/{random uuid}`, and the ticket's own Requester gets 200 on the same list. A malformed id → 400. IT Staff on an unknown ticket get the staff-detail 404 body. | AC-22: "identical to a ticket that does not exist", which the app's unknown-path 404 is not (AUZ-04 note); api-spec §1.5 |
| CMN-04 | The Administrator also posts, and a body `authorId` or `createdAt` is ignored. Notes and comments are stored in their own tables, and neither list shows the other. An unknown ticket → 404; a malformed id → 400. | BR-48; BR-50; api-spec §6.3 |
| CMN-05 | A malformed id also gets the identical 403, and no note is created | api-spec §1.1: step 5 runs before path validation in step 6 |
| CMN-06 | Each Requester response is checked as a real 200 containing the ticket or comment, and no key anywhere in the body matches `note` | Proves the absence is not an error response, and covers a note count under any key name (BR-53) |
| CMN-07 | A missing body and a number body → 422. The `details.body` messages are exactly "Comment must be 1–2000 characters." and "Note must be 1–2000 characters." | api-spec §6.2, §6.4 |
| CMN-08 | The Requester and IT Staff are both refused on CLOSED. Existing comments and notes can still be listed on a CLOSED ticket. | BR-52 refuses posting only |
| CMN-09 | Accepted in each of OPEN, IN_PROGRESS, WAITING_FOR_REQUESTER, and REOPENED, with the status unchanged. The event has the Requester as actor and payload `{}`. The response is exactly `{ requesterIndicatedResolvedAt }`, equal to the stored value. | BR-43; BR-55; api-spec §6.5 |
| CMN-10 | A RESOLVED ticket that already has an indication → `TICKET_STATE_CONFLICT`. The foreign 404 equals `GET /tickets/{random uuid}`; a malformed id → 400. The Administrator → 403, and IT Staff on a random UUID get the same 403. Every refusal leaves the row and events unchanged. | api-spec §6.5 rule order; AC-22; BR-23 |
| CMN-11 | The same check for notes, and the stored row as well as the response | AC-49 applies to comments and notes |
| CMN-12 | An unassigned ticket returns `owner: null` and `requesterIndicatedResolvedAt: null`. **The `POST /tickets` 201 adds `itPriority` equal to `requestedPriority`, `owner: null`, and `requesterIndicatedResolvedAt: null`.** | api-spec §4. The create-response addition was found untested during #40. |

**CMN-09: where IT Staff see the indication.** CMN-09 checks it through
`GET /staff/tickets/{id}` (#40, api-spec §5.2), not the queue. The queue is #39
(`GET /staff/tickets`). The indication on the queue row, the queue part of
AC-26, is covered by QUE-01, UI-26, and E2E-03:
- **QUE-01** (#39): the queue item carries `requesterIndicatedResolvedAt`. **QUE-01's own fixtures all have it null**, so QUE-01 checks the key and the null value only. It never checks a non-null value in the queue.
- **UI-26** (#43): the queue row renders the indicator, with the API mocked.
- **E2E-03** (#46): staff see the indicator after the Requester indicates "appears resolved", with real data. **E2E-03 is the only test of a non-null value in the queue**, so #46 must assert the indicator on the queue row, not only on Staff Detail.

#42 added the assertions below inside its planned tests. All were committed
with their tests and were red first, except ADM-13 and one case of ADM-14, as
noted. #42 changed no existing test or fixture.

| Test | Added assertion | Reason |
|---|---|---|
| UT-12 | An inactive Administrator being demoted is not counted as one removed; self-deactivation is reported before own role when both are requested; restating one's own role and activation is allowed; self-protection is reported before open tickets; other role changes and name-only edits are allowed with open tickets | BR-63 order and scope: rule (3) applies only to deactivation and demotion to `REQUESTER` |
| ADM-01 | The list has no `meta` and no `$argon2` string | BR-66 (not paginated); BR-68 |
| ADM-03 | A padded, mixed-case email is stored trimmed and lowercased; the body has exactly the `AdminUser` fields | BR-06 on create; api-spec §7 `AdminUser` |
| ADM-04 | The refused create and edit change nothing | "Rejected" means nothing changes |
| ADM-05 | A refused create stores no user | As above |
| ADM-06 | Name and email are trimmed, the email lowercased; the password hash and `mustChangePassword` are unchanged | BR-06, BR-61; BR-62 (passwords never change through edit) |
| ADM-07 | An 11-code-point initial password → 422 `details.initialPassword`, and the stored hash is unchanged | api-spec §7.4 names the failure; no planned test covered it |
| ADM-09 | The exact `LAST_ADMINISTRATOR` message; the Administrator is unchanged | api-spec §7.3 check 5 |
| ADM-10 | The two Administrators who demote each other are both created by the test, with the seeded Administrator still active, and the race runs five rounds. The loser gets 403 at the actor re-check, or 401 when the winner's session revocation lands first. | The seeded Administrator is never altered (Section 1). With a third Administrator present, the rule that still decides the race is the locked re-check of the actor (BR-63). Removing `FOR UPDATE` makes this test fail with two 200s. |
| ADM-11 | The refused user is unchanged | As ADM-04 |
| ADM-12 | After a role change, the target has no live session row | BR-64 revokes every session, not only the one presented |
| ADM-13 | No user is created or changed by the refused calls. **Green before implementation:** the `/admin` family guard from #37 already refuses Requesters and IT Staff, so this test could not be red in #42. | AC-60 |
| ADM-14 | — **Green before implementation (unknown-UUID case only):** the `/api/v1` not-found fallback from #37 already answered 404 `NOT_FOUND`. The malformed-id case was red. | — |

#44 added the assertions below inside its planned tests. All were committed
with their tests and were red first: the Staff Detail route and the Lab 3
Requester Detail regions did not exist. UI-37's own absence checks would have
held against the Lab 2 screen; it was red on its status-text check and on the
missing Comments card it waits for.

| Test | Added assertion | Reason |
|---|---|---|
| UI-27 | The IT Priority select shows the current value; Save is disabled until it changes and sends `{ itPriority }`; CLOSED and CANCELLED show the IT Priority badge read-only | ui-spec 6.5 operations card, IT Priority group |
| UI-28 | The owner's name or "Unassigned" is shown; Assign is hidden in RESOLVED, CLOSED, and CANCELLED; assign sends `{ ownerId }` | ui-spec 6.5 Ticket Owner group; specification.md 5.6 assignable statuses |
| UI-29 | IN_PROGRESS is "Start work" from OPEN and REOPENED and "Resume work" from WAITING_FOR_REQUESTER; Cancel ticket is destructive and the rest secondary; a transition without a dialog is sent directly and re-fetches | ui-spec 6.5 label table; BR-37 (no other transition is confirmed) |
| UI-30 | The dialog has `role="dialog"` and `aria-modal`; the Cancel ticket dialog's cancel button reads "Keep ticket" and its confirm is destructive; a padded 4-character reason is refused; the reason is sent trimmed; Escape also closes and restores focus | ui-spec 5.2 and 10; BR-37 counts after trimming |
| UI-31 | A 409 from a confirmed transition is handled the same way and closes the dialog; a 404 shows `state-not-found`; an unexpected response shows the error callout with Retry; none shows a status code, error code, or server path | AC-68 covers not-found and unexpected responses as well as conflicts; ui-spec 6.5 States |
| UI-32 | Tab labels carry the counts; posting a note or a comment goes to its own endpoint and appends the server's copy; an empty body is blocked with "Write something before posting." and no request; both composers are replaced on CLOSED; empty lists read "No comments yet." / "No internal notes yet." | ui-spec 6.5 and 8; BR-50, BR-52 |
| UI-35 | Items are oldest first with the author's name and `title` holding the ISO time; the card sits between ticket information and attachments; the counter reads `{n}/2000`; Post comment is secondary; an empty comment is blocked; no request is made to `/notes`; CLOSED replaces the composer with "Comments are closed for this ticket." | ui-spec 6.3 and 8; BR-53 (not even a request) |
| UI-36 | The dialog's text and confirm label; focus returns to the button after cancel; an already-indicated ticket shows the indicator and no button | ui-spec 5.2 and 7.4 |
| UI-37 | Each status renders its ui-spec 7.1 display text in the badge; "Assigned to" shows the owner or "Not yet assigned" | ui-spec 6.3 additions; it also proves each case rendered the status it names |
| UI-38 | On an open ticket Add Attachment and Remove remain | The lock applies only to CLOSED and CANCELLED |
| STY-04 | The label is `--zg-warning` at weight 600 and sits above the author line; comment items carry 1px `--zg-border` and `--zg-radius-lg` | ui-spec 8 treatment table |

**UI-27 interpretation.** "Editable fields exist only inside `operations-card`"
is read as ui-spec 6.5 words it: the operations card is "the only region with
editable *operational* fields". Every `input` and `select` on Staff Detail must
be inside it. A `textarea` outside it is allowed only when it is the active
composer (`field-comment-body` or `field-note-body`), which writes a new
message rather than editing the ticket.

**Fixture and test changes made in #44.** No planned assertion was weakened.

| File | Change | Why |
|---|---|---|
| `client/tests/lab-03/ticket-fixtures.ts` (new) | `fakeApi()` fakes `fetch()` for `/api/v1`, keyed by method and path, from api-spec sections 4 to 6 | The comments and notes API (#41) was not on the branch. Faking at `fetch()` holds the screens to the api-spec URLs, bodies, and shapes rather than to a client function name. |
| `StaffTicketDetail.test.tsx` (UI-28, UI-31) | The owner-name checks read the new `ticket-owner` hook instead of the whole operations card. Changed in the implementation commit. | The Assign to `<option>` text contains every assignee's name, so the card-wide check could pass without the owner being shown. Tightened, not loosened. |
| `client/tests/lab-02/RequesterTicketDetail.test.tsx` | L2 UI-28 removed (Section 4.1) | Superseded by UI-35 and UI-37 |

**Components delivered for #43.** `StatusBadge`, `ItPriorityBadge`, and the
ui-spec 7.1 status CSS are in `client/src/lab-03/components/Badges.tsx` and
`zen-green.css`, because Staff Detail and Requester Detail are the first screens
to need all eight statuses. STY-01 and STY-02, which test them, stay with #43.

#43 added the assertions below inside its planned tests. All were committed
with their tests and were red first, except the one case the next table names.
Every queue test was red because `/staff/queue` rendered nothing. The My Tickets
case of STY-01 was red because the status badge was hard-coded to "New".

| Test | Added assertion | Reason |
|---|---|---|
| UI-21 | An Administrator sees the same queue; the title "Ticket Queue" and the "{totalItems} tickets" line; the Ticket Number links to `/staff/tickets/{id}` | AC-28 names IT Staff or an Administrator; ui-spec 6.4 title and Ticket Number column |
| UI-22 | Each filter and the sort offer exactly the ui-spec 6.4 options, in order; the search placeholder; the search is sent trimmed; Clear Filters is secondary and hidden until something is applied; choosing "Priority: Urgent first" again returns to the default request | ui-spec 6.4 control bar |
| UI-23 | Exactly one state shows at a time; the failure shows "Something went wrong. Try again." and never the server message, a status code, or an error code; the controls stay enabled; Retry reloads the queue; the forbidden state has no Retry; the empty state has no action | ui-spec 6.4 States and 5.1; AC-68 |
| UI-24 | The card is an `<a>` to `/staff/tickets/{id}` that carries the number, summary, Requester, owner, and both badges | ui-spec 6.4: "the whole card a link" |
| UI-25 | Next and Previous move between pages, and Previous is disabled on page 1 | L2 ui-spec 5.4 pagination, which 6.4 adopts |
| UI-26 | The indicator text is exactly "✓ Requester: appears resolved", and it is shown on the mobile card too | ui-spec 7.4 compact form |
| STY-01 | My Tickets renders each of the eight statuses with its display text (no fixed "New"); each badge carries `data-status` and its status class; a status with no border in 7.1 has none in the stylesheet | ui-spec 7.1 "replaces the single NEW row in L2 §6" |
| STY-02 | Each badge carries its `zg-badge--priority-*` class; the glyph is one of `○ ◔ ◑ ●`; the four glyphs differ | ui-spec 7.2: the same colours and glyphs as the Lab 2 priority badge |

**Green before the #43 implementation.**

| Test | Why it was already green |
|---|---|
| STY-01, "colours each status with the ui-spec 7.1 tokens" | #44 delivered the status CSS (see above). The case reads the stylesheet, so it could not be red in #43. |

**Interpretations recorded for #43.**

- **Sort mapping.** ui-spec 6.4 gives the labels, not the parameters. "Priority: Urgent first" sends no `sortBy` or `sortOrder`, which api-spec 5.1 defines as IT Priority descending and then oldest first. That is the same order as `itPriority desc`. The other labels send these:
  - "Oldest first": `createdAt asc`;
  - "Newest first": `createdAt desc`;
  - "Recently updated": `updatedAt desc`;
  - "Ticket Number A–Z": `ticketNumber asc`;
  - "Status": `status asc`, the lifecycle order.
- **Default request.** With nothing applied, the queue sends only `page=1&pageSize=20`. Clear Filters returns to exactly that request.
- **Test hooks.** ui-spec 11 lists no queue hooks for search, pagination, Clear Filters, or the list states, so the queue reuses the My Tickets hooks:
  - `field-search`, `field-page-size`, `btn-prev-page`, `btn-next-page`;
  - `btn-clear-filters` and `btn-clear-filters-no-results`, `btn-retry`;
  - `state-loading`, `state-empty`, `state-no-results`, `state-list-failed`.

  The desktop table is `queue-table`.

**Fixture and test changes made in #43.** No planned assertion was weakened.

| File | Change | Why |
|---|---|---|
| `client/tests/lab-03/ticket-fixtures.ts` | `fakeApi()` falls back from `METHOD /path?query` to `METHOD /path` and accepts async handlers; adds `queueItem()`, `queuePage()`, and `queueRoutes()` | The queue request carries a query string, and the loading case holds a request open. The #44 suites send no query string and are unaffected. Committed with the tests. |
| `StaffTicketQueue.test.tsx` (UI-25, "moves between pages") | The page-2 reply is set before Next is clicked, and the test waits for Previous to be enabled. Changed in the implementation commit. | As committed, the page-2 reply was set after Next, so the screen received `meta.page: 1` and correctly kept Previous disabled. That was a fault in the test's ordering. The fix adds a check and removes none. |
| `client/tests/lab-02/theme.style.test.tsx` | L2 STY-09 removed (Section 4.1) | Superseded by STY-01 |

#45 added the assertions below inside its planned tests. All were committed
with their tests and were red first: `/admin/users` rendered nothing, so every
case failed waiting for `user-management-screen`.

| Test | Added assertion | Reason |
|---|---|---|
| UI-39 | The title "User Management"; the five column headers in order; Edit is tertiary with `aria-label="Edit {fullName}"`; the server's order is kept; with nothing applied the request carries no parameters; the search placeholder, and the search is sent trimmed; the role filter offers exactly "All roles", Requester, IT Staff, Administrator, and combines with `q`; Create user is primary | ui-spec 6.6 toolbar and table; BR-66 (the server sorts); ui-spec 2 primary buttons |
| UI-40 | The dialog has `role="dialog"` and `aria-modal`; Active is checked by default and the initial-password helper is shown; an empty submit marks each field `aria-invalid`, links its message through `aria-describedby`, and moves focus to Full name; an 11-code-point password (ten letters and an emoji) is refused; 422 `details` render below their fields; the success body is the api-spec 7.2 shape with the name trimmed and the password untrimmed; Save is primary and shows "Saving…" while in flight | ui-spec 6.6 and 10; BR-11 (code points, never trimmed); api-spec 7.2 |
| UI-41 | An inactive user's Active is unchecked; Set new initial password is secondary; changing role and Active sends exactly those two fields; on another user's row Role and Active stay enabled with no explanation; Email stays editable on the own row; Cancel and Escape close with no request and return focus to Edit | ui-spec 6.6 field table, 5.2 and 10 focus rules |
| UI-42 | The dialog's title and text; the field is `type="password"`; the confirm reads "Set password" and is primary; an empty password is refused too; the password is sent untrimmed; a 422 `details.initialPassword` renders below the field; Cancel sends nothing, keeps the user dialog, and returns focus to Set new initial password | ui-spec 5.2 table; api-spec 7.4; BR-11 |
| UI-43 | Neither conflict shows a status code or error code; no Success callout appears; an unexpected failure inside the dialog shows the safe error callout, never the server message or a path, with input kept | AC-68 |
| UI-44 | Loading disappears once the list arrives; no-results hides the table, and Clear is secondary, empties the search and the role filter, and returns to the parameterless request; the failure state shows no server text and Retry reloads; the forbidden state has no Retry and no Create user; the own card is marked "(you)"; at desktop there are no cards | ui-spec 6.6 States and 5.1; AC-68 |

**Interpretations recorded for #45.**

- **Test hooks.** ui-spec 11 lists no User Management hooks for search, the list states, or Retry, so the screen reuses the queue's (#43):
  - `field-search`, `btn-retry`, `btn-clear-filters-no-results` (labelled "Clear");
  - `state-loading`, `state-no-results`, `state-list-failed`.

  The desktop table is `users-table`. Field errors use `error-{field}` (`error-full-name`, `error-user-email`, `error-role`, `error-initial-password`), as Login and Change Password do. An unexpected failure inside the dialog uses `callout-error`.
- **Initial-password field in the confirmation dialog.** It reuses `field-initial-password`. The edit dialog never shows the create field, so the hook stays unique on the page.
- **Conflict text.** ui-spec 6.6 puts the server's `message` in the Conflict callout. The "The ticket has been reloaded." suffix in 5.1 belongs to ticket screens and is not added.
- **Edit with nothing changed.** api-spec 7.3 requires at least one field, so Save with no change closes the dialog and sends nothing.
- **Dialog stacking.** Set new initial password opens its confirmation over the user dialog. Success closes both, refreshes the list, and shows "Initial password set."; a failure other than 422 closes the confirmation and shows the safe error in the user dialog.
- **Busy text.** Save and Set password both read "Saving…" in flight (ui-spec 2 Busy text).

**Components delivered for #45.** `ConfirmDialog` gains an optional password field validated against BR-11, with its own busy label; existing callers are unchanged. `Callout` gains the ui-spec 5.1 Success variant. `AccountStatusBadge` (ui-spec 7.5) is added to `Badges.tsx`. Their CSS is in `zen-green.css`. No fixture file changed: the suite uses `fakeApi()`, `ok()`, `created()`, and `failure()` from `ticket-fixtures.ts`.

**#46 — Lab 3 E2E.** E2E-01 to E2E-09 are in `e2e/lab-03/authentication.spec.ts`, `staff-ticket-flow.spec.ts`, and `user-administration.spec.ts`, with shared setup in `e2e/lab-03/helpers.ts`. No new test IDs.

*Red first.* The screens (#38, #43–#45) and the APIs (#36–#42) existed before these specs, so the specs were not red against missing code. Before the specs were written, the deferred real-browser check ran against the real API, signed in as each role:
- Login;
- Change Password;
- Staff Ticket Queue;
- Staff Ticket Detail (operations, comments, notes, Download);
- Requester Ticket Detail (comments, appears resolved, Download);
- User Management.

It found no disagreement between the UI and the API, so #46 has no fix commit. The one apparent mismatch, a notes count of 0 after posting, came from the check itself: `getByText` matched the composer's textarea before the post completed. The specs therefore assert on `comment-item-*` and `note-item-*`.

| Test | Added assertion or approach | Reason |
|---|---|---|
| E2E-01 | The wrong password is cleared; after logout, `GET /tickets` through the page's session is 401 | BR-07; AC-08 at the API as well as the route |
| E2E-02 | In `finally`, the Administrator API sets the must-change fixture's password back to `SEED_PASSWORD` (`POST /admin/users/{id}/initial-password`), which also sets `mustChangePassword` again | The fixture returns to its seeded state, so the test repeats without a reseed |
| E2E-03 | The ticket is created by the test through the Requester API. The queue row's status stays IN_PROGRESS beside the indicator. Closed shows the closed text in the conversation. | No dependence on a seeded NEW ticket; BR-43 (the indication changes no status); BR-52 |
| E2E-04 | A real Internal Note is posted on the Requester's own ticket first, so "no note text" is checked against text that exists | AC-04 |
| E2E-05 | The file is uploaded through the UI. Download is clicked on each screen in a separate browser context, and the download has no failure. | D-25: the click, not a request built from `href` |
| E2E-06, E2E-07 | Emails `e2e-staff-…` and `e2e-target-…` are unique to the run; each user is deactivated in `finally` | Section 1, *Users created by E2E tests* |
| E2E-08 | Steps (a)–(c) as in Section 1. **Deviation, agreed during #46:** ui-spec 6.6 and UI-41 disable Role and Active on one's own row, so the UI cannot attempt self-deactivation. With one active Administrator, `LAST_ADMINISTRATOR` cannot arise any other way. The test asserts the disabled fields and their explanation in the UI. It then sends the attempt as `PATCH /admin/users/{self}` through the Administrator's own browser session and CSRF token, and asserts 409 with the exact api-spec 7.3 messages: `LAST_ADMINISTRATOR`, then `CANNOT_DEACTIVATE_SELF`. | Contradiction between the E2E-08 row ("sees the message") and ui-spec 6.6 |
| E2E-09 | The status is read from `data-status` and from the visible label | ui-spec 7.1 |

*Suite changes for #46.*
- **Root script.** `test:e2e` runs `playwright test e2e` (Section 7).
- **Desktop only.** `playwright.config.ts` keeps the three Lab 3 journey specs out of the tablet and mobile projects with `testIgnore`, so they run at desktop and none is reported as skipped. The Lab 2 specs keep their existing run-time skips.
- **E2E-05 teardown.** Lab 2 E2E-05 restarts the API detached. `startApi()` now records its PID in `test-results/.restarted-api.pid`, and `e2e/global-teardown.ts` stops that process tree when the run ends, so no detached API outlives the run. The test's assertions are unchanged.

*Repeatability.* After one reseed, the whole `e2e/` folder passed. The Lab 3 specs then passed twice more back to back, with no reseed between runs.

**#47 — Visual inspection and responsive screenshots.** STY-05 to STY-09 are in `client/tests/lab-03/theme.style.test.tsx`. RSP-01 to RSP-06 are in `e2e/lab-03/responsive.spec.ts`, which writes every `ui-spec.md` §12 path. `e2e/lab-03/evidence.spec.ts` writes the extra desktop evidence and `artifacts/lab-03/api-authorization.txt`. `e2e/lab-03/capture.ts` holds the shared viewports, the layout check, and the API setup. No new test IDs.

*Red first.*
- STY-05 to STY-09 passed on arrival: the behaviour shipped with #38 and #43 to #45, and no test covered it. As a check that they are not vacuous, an `outline: none` rule and a named colour added to the stylesheet turned STY-06 and STY-07 red.
- RSP-05 was red. These mobile touch targets were under 44×44px: the brand (93×29.7), the navigation links (358×43), Download (82.8×29.6), Edit (42.4×29.6), the file chooser (239×24.8), and the Active checkbox label (310×19.6). The same test then found the Active checkbox touching its text at every width (gap 0px): `.zg-dialog .zg-label { display: block }` outranked `.zg-checkbox`.
- RSP-03 was red: at 390px the attachment filename's text (x 54–148) painted over the file size (x 66–86).
- The fix commit changes only `zen-green.css`. It reuses the existing 44px value and the existing tokens. RSP-01, RSP-02, RSP-04, and RSP-06 passed on arrival.

| Test | Added assertion | Reason |
|---|---|---|
| RSP-01 | The desktop queue table has 7 column headers | ui-spec 6.4 |
| RSP-02 | The tablet queue table has no Requester header, and Owner is shown | ui-spec 6.4 |
| RSP-03 | At 390px the attachment filename and the file size do not intersect | Overlap seen in the mobile capture, which the generic check did not catch |
| RSP-01–03 | Clipping and overlap are checked in the browser (`layoutProblems` in `capture.ts`): elements past the viewport edge, text or controls cut off by their own box (except the documented ellipsis with `title`), and controls or badges sharing area | AC-64 |
| RSP-05 | At desktop and tablet each dialog is at most 560px wide; at every width the Active checkbox keeps an 8px gap from its text | ui-spec 9; `.zg-checkbox` |
| RSP-06 | The path list is read from ui-spec §12 itself (46 files), so a path added to the specification and not captured fails | ui-spec 12 |

**Interpretations recorded for #47.**
- **Desktop project only.** `responsive.spec.ts` and `evidence.spec.ts` are listed in `playwright.config.ts` beside the journeys. Each opens its own browser context at 1440×900, 834×1112, and 390×844, so all three widths are covered in one ordered pass and nothing is reported as skipped.
- **Data.** The published captures were taken against a separately seeded schema, `lab3_screenshots`, in the same local PostgreSQL. They show the seed plus tickets that the specs file, claim, and work through the API as the seeded users, not leftovers from earlier E2E runs. `ensureRealisticQueue()` tops the queue up to 25 tickets so a second page exists, and does nothing on a database that already has 25.
- **Intercepted states.** A healthy server cannot produce these, so the browser's request is intercepted:
  - login busy (the real response is held until the frame is taken);
  - login network failure;
  - queue empty and queue failure;
  - Staff Detail load failure;
  - User Management load failure.

  Every other state, including the claim 409 and `USER_HAS_OPEN_TICKETS`, comes from the real server.
- **`LAST_ADMINISTRATOR`.** The UI disables Role and Active on one's own row (the E2E-08 deviation). For `desktop-last-administrator.png`, the PATCH that the own-row dialog sends is therefore rewritten in flight to `{ "isActive": false }`, and it reaches the real server. The 409 and its message are the server's.
- **STY-08.** jsdom has no layout, so "visual order" is checked as document order with no positive `tabindex`. Two places where layout and document order differ are **known deviations, not changed** (decided during #47; Section 9):
  - **Staff Detail at desktop.** The operations card is first in the DOM, because ui-spec 6.5 puts it directly after the header on tablet and mobile. At desktop, grid areas place it in the right column, so Tab reaches Operations before Ticket information.
  - **Dialog actions below 768px.** `.zg-actions` uses `column-reverse` (Lab 2), so the confirm button sits above Cancel while Tab reaches Cancel first.
- **STY-09.** ui-spec 5.1 gives the forbidden and not-found states the same tokens. The test asserts that both, and the conflict callout, differ from the error callout in background and border.
- **Known deviation: tablet queue width.** At 834px the queue table, without its Requester column, is wider than its 800px container. It scrolls inside that container, which L2 ui-spec 7 allows, so the page does not scroll. As a result, Owner and Last Updated sit to the right of the visible area in `tablet-populated.png`. ui-spec 6.4 drops the Requester column at tablet so that the table fits, and ui-spec 9 forbids clipping.

  One time-boxed fix was tried. A test asserting that the table fits its container was red (867px in 800px). Tightening the tablet cell padding to `--zg-space-2` turned it green on that data, but on a freshly seeded queue the table was still 847px in 800px. The fit depends on the data, so the change and its test were reverted, and this is recorded in Section 9.

*Evidence map (desktop unless stated).* The ui-spec §12 files are not repeated.
- **Login.**
  - `authentication/`: `desktop-login-valid`, `-login-invalid`, `-login-inactive`, `-login-busy`, `-login-failure`, `-change-password-forced` (all widths), `-change-password-success`, `-shell-{requester,it-staff,administrator}`, `-logout`, `-logout-direct-access`.
  - `user-management/`: `desktop-created-user-first-login`.
- **Queue** (`staff-queue/`):
  - `{desktop,tablet,mobile}-populated`;
  - `-search`, `-filter-status`, `-filter-it-priority`, `-filter-category`, `-filter-owner-{me,unassigned,person}`;
  - `-sort-{oldest,newest,recently-updated,ticket-number,status}`, `-pagination-page-2`, `-pagination-page-size-10`;
  - `-filtered`, `-empty`, `-no-results`, `-failure`.

  Owners and badges are visible in `-populated` and `-sort-status`.
- **Staff Ticket Detail** (`staff-ticket-detail/`):
  - `-claim-before`, `-claimed`, `-reassigned`, `-it-priority-changed`;
  - `-status-dialog-resolve`, `-status-resolved`, `-cancel-dialog`, `-cancel-reason-validation`;
  - `-comment-posted`, `-note-posted`, `-notes-tab`, `-comment-validation`;
  - `-attachment-download`, `-appears-resolved-indicator`, `-conflict`, `-failure`, `-requester-refused`, `-closed`.
- **Requester Ticket Detail** (`staff-ticket-detail/`): `{desktop,tablet,mobile}-requester-detail-comments`, `-requester-no-internal-notes`, `-requester-appears-resolved-dialog`, `-requester-appears-resolved`.
- **User Management** (`user-management/`):
  - `{desktop,tablet,mobile}-list`, `-search`, `-role-filter`;
  - `-create-dialog`, `-create-invalid`, `-duplicate-email`, `-user-created`;
  - `-edit-dialog`, `-user-saved`, `-edit-dialog-self`;
  - `-initial-password-dialog`, `-initial-password-set`, `-forced-change-next-login`;
  - `-last-administrator`, `-open-tickets-conflict`, `-it-staff-forbidden`, `-failure`.
- **API.** `artifacts/lab-03/api-authorization.txt` records the status and JSON body for: a Requester calling `GET /staff/tickets`, IT Staff calling `GET /admin/users`, and a Requester calling `GET /tickets/{id}/notes` on their own ticket, which has a real note. All three return 403, and the note text appears in none of them.

*Not captured.*
- **Download.** The browser download is asserted by its suggested filename and the absence of a failure. A PNG can only show the control.
- **Widths.** The extra evidence states are desktop only, as requested.
- **Throttled login (429).** Not requested, and not captured.
- **Ticket numbers.** `mobile-view.png` and `mobile-requester-detail-comments.png` were recaptured after the attachment fix, so they show a different ticket number from the other widths' captures of the same screen.

*Suite runs for #47.* Client: 16 files, 287 tests, all passing. The `e2e/` folder ran against the screenshots schema with 0 failures. The 16 skips are the existing Lab 2 run-time skips; no Lab 3 test is skipped.

---

## 3. Scope per Issue

Each Issue delivers the tests listed and, through them, its share of the ACs.
"ACs" lists every criterion the Issue contributes a test to. An AC is complete
only when every Issue listed for it in Section 5 has merged.

**Bases.** The stacked chain #35 → #36 → #37 targets the previous feature
branch, and each PR is retargeted to `lab3-staging` after the one below it
merges (CLAUDE.md). Every other Issue targets `lab3-staging`.

| Issue | Title | Base | Depends on | ACs | Tests |
|---|---|---|---|---|---|
| #35 | User model, migration, sessions, and seed | `lab3-staging` | #34 | AC-09, AC-11, AC-13, AC-61, AC-62, AC-63 | UT-01, UT-02, UT-03, MIG-01–04, SEED-01–04, SES-01, SES-02 (13) |
| #36 | Auth API: login, logout, current user, change password | #35 branch | #35 | AC-01, AC-02, AC-05, AC-06, AC-07, AC-08, AC-09, AC-10, AC-11, AC-13 | UT-04, UT-05, UT-06, API-01–13 (16) |
| #37 | Authorization middleware and Requester API migration | #36 branch | #36 | AC-02, AC-03, AC-12, AC-15, AC-16, AC-17, AC-20, AC-21, AC-22, AC-24, AC-34, AC-59 | AUZ-01–15, REG-01 (16) |
| #38 | Auth UI and role-based app shell | `lab3-staging` | #37 | AC-01, AC-02, AC-05, AC-06, AC-07, AC-08, AC-10, AC-12, AC-14, AC-15, AC-18, AC-19, AC-21, AC-60, AC-65 | UI-01–20, STY-03, REG-02, REG-03, REG-04 (24) |
| #39 | IT Staff Ticket Queue API | `lab3-staging` | #37 | AC-16, AC-28, AC-29, AC-30, AC-31, AC-32 | UT-07, UT-08, QUE-01–11 (13) |
| #40 | Ticket operations API: ownership, IT Priority, status | `lab3-staging` | #37 | AC-27, AC-34, AC-35, AC-36, AC-37, AC-38, AC-39, AC-40, AC-41, AC-42, AC-43, AC-44, AC-45 | UT-09, UT-10, OPS-01–18 (20) |
| #41 | Public Comments, Internal Notes, and Appears Resolved API | `lab3-staging` | #40 | AC-04, AC-22, AC-25, AC-26, AC-43, AC-45, AC-46, AC-47, AC-48, AC-49 | UT-11, CMN-01–12 (13) |
| #42 | Administrator Users API | `lab3-staging` | #37 | AC-51, AC-52, AC-53, AC-54, AC-55, AC-56, AC-57, AC-58, AC-59, AC-60 | UT-12, ADM-01–14 (15) |
| #43 | IT Staff Ticket Queue UI | `lab3-staging` | #38, #39 | AC-26, AC-28, AC-29, AC-30, AC-31, AC-32, AC-33, AC-65, AC-68 | UI-21–26, STY-01, STY-02 (8) |
| #44 | IT Staff Ticket Detail UI and Requester comments | `lab3-staging` | #38, #40, #41 | AC-24, AC-25, AC-26, AC-27, AC-34, AC-35, AC-36, AC-37, AC-39, AC-41, AC-49, AC-50, AC-68 | UI-27–38, STY-04 (13) |
| #45 | User Management UI | `lab3-staging` | #38, #42 | AC-51, AC-52, AC-53, AC-54, AC-55, AC-56, AC-57, AC-58, AC-60, AC-68 | UI-39–44 (6) |
| #46 | Lab 3 E2E tests | `lab3-staging` | #43, #44, #45 | AC-01, AC-02, AC-04, AC-05, AC-06, AC-08, AC-16, AC-19, AC-23, AC-26, AC-35, AC-38, AC-39, AC-41, AC-46, AC-47, AC-52, AC-54, AC-55, AC-56, AC-57, AC-59, AC-60 | E2E-01–09 (9) |
| #47 | Visual inspection and responsive screenshots | `lab3-staging` | #43, #44, #45 | AC-64, AC-66, AC-67, AC-68 | STY-05–09, RSP-01–06 (11) |

#34 (this contract) and #48 (release) own no tests. #48 runs every suite from
`main` and records Section 8.

**Notes on boundaries**

- **#36** builds `requireSession`, including the password-change gate, and proves it by unit test (UT-06). **#37** mounts it on every route family and proves that across endpoints (AUZ-12).
- **#35** renames the model to `User`, and its seed adds IT Staff and Administrators. The Lab 2 `GET /api/v1/dev-requesters` route and the `requireRequester` middleware would otherwise treat those accounts as Requesters until #37 removes both. #35 therefore makes both Lab 2 paths filter on `role = REQUESTER`, and L2 API-40's expected count uses the same filter (Section 4.2).
- **#36** issues CSRF tokens. **#37** enforces them (AUZ-10). The stacked PRs merge into `lab3-staging` bottom-up, so after #36 merges and until #37 merges, `lab3-staging` accepts state changes without the header. This is acceptable because `lab3-staging` is never released in that state: the release PR (#48) is opened only after #37 and every later Issue have merged.
- **#37** moves the Lab 2 server suite to `loginAs()` (REG-01) in the same Issue that removes the header, so that suite never goes red on `lab3-staging`.
- **#38** delivers A7 as one unit: the Vite proxy, relative client URLs, and removal of `cors()`. It also rewrites L2 E2E-01 to E2E-03 to sign in (REG-03), so the Lab 2 E2E suite is green again as soon as the Login UI exists.
- **#35** sets `itPriority` equal to `requestedPriority` in the Lab 2 ticket-creation route, because its migration makes the column NOT NULL and creation would otherwise fail. **#40** owns OPS-07, the test that observes it through the API.
- **#46** adds the three new Lab 3 specs and the real Download click (E2E-05). It updates the root `test:e2e` script to run `e2e/` (Section 7).

---

## 4. Lab 2 test continuity

BR-70: every Lab 2 test keeps passing or is superseded here. Nothing is deleted
without a row in this section.

### 4.1 Superseded Lab 2 tests

| Lab 2 test | What it asserted | Why it cannot survive | Replaced by | Removed in |
|---|---|---|---|---|
| L2 API-08 | Missing `X-Dev-Requester-Id` → 428 | The header and 428 are retired | AUZ-01 (no session → 401) | #37 |
| L2 API-09 | Header naming an inactive Requester → 403 `REQUESTER_INACTIVE` | No header; inactivity is checked through the session and at login | AUZ-14, API-03 | #37 |
| L2 API-40 | `GET /dev-requesters` omits the inactive Requester | The endpoint is removed | AUZ-04 | #37 |
| L2 UI-01 – UI-05 | Selector contents, loading, empty, failure, Continue gating | The selection screen is removed | UI-01 – UI-07 (Login) | #38 |
| L2 UI-06 | Shell shows the selected Requester and Change Requester | Identity now comes from the session | UI-12 | #38 |
| L2 UI-07 | The guard renders the Selection screen | The guard now redirects to Login | UI-16 | #38 |
| L2 UI-08 | The "not a login" notice is present | The notice is removed by design | UI-14 (asserts it is absent) | #38 |
| L2 UI-09 | Switching Requester clears cached data | There is no switching; logout and sign-in replace it | UI-15 | #38 |
| L2 UI-29 | The route guard shows Selection; `/` redirects; `/lab-01` is outside the shell | The guard target changes and `/` now redirects by role | UI-16, UI-18 | #38 |
| L2 UI-28 | Requester Detail has no comment box or status control | Lab 3 adds Comments and Problem Appears Resolved there | UI-35, UI-37 (still no status control) | #44 |
| L2 STY-09 | The status badge renders "New" | It covered one status | STY-01 (all eight) | #43 |
| L2 RSP-07, case "requester selection states" | The Selection screen is captured at desktop | The selection screen is removed. Added to this table in #38, which found the case. | UI-14 (selector absent); the Lab 3 login screenshots in RSP-06 | #38 |

**Removed in #37.** The implementation commit deleted these from
`server/tests/lab-02/`, after the replacing tests were committed red:
- **L2 API-08** (`create-ticket.api.test.ts`), both cases: no header → 428, and a header naming an unknown Requester → 428. Replaced by AUZ-01.
- **L2 API-09** (`create-ticket.api.test.ts`), both cases: an inactive Requester's header → 403 `REQUESTER_INACTIVE`, and nothing created. Replaced by AUZ-14 and API-03.
- **L2 API-40** (`reference-data.api.test.ts`), all three cases of the `GET /dev-requesters` block. Replaced by AUZ-04.

The header-only `post()` helper and the inactive-Requester fixture in
`create-ticket.api.test.ts` went with them. No other Lab 2 test was removed.

**Removed in #38.** The implementation commit deleted these, after the
replacing tests were committed red:
- **L2 UI-01 to UI-05:** all of `client/tests/lab-02/RequesterSelection.test.tsx` (7 cases). Replaced by UI-01 to UI-07.
- **L2 UI-06 to UI-09:** all of `client/tests/lab-02/AppShell.test.tsx` (7 cases). UI-06 is replaced by UI-12, UI-07 by UI-16, UI-08 by UI-14, and UI-09 by UI-15.
- **L2 UI-29:** all of `client/tests/lab-02/routing.test.tsx` (5 cases). Replaced by UI-16 and UI-18.
- **L2 RSP-07:** only the "requester selection states" case of `e2e/lab-02/responsive.spec.ts`. Replaced by UI-14 and RSP-06.

The code those tests covered went with them:
- `RequesterSelection.tsx`, the Lab 2 `AppShell.tsx`, `AppRoutes.tsx`, and `RequesterContext.tsx`;
- `fetchDevRequesters`;
- the development-notice and selection-screen CSS.

No other Lab 2 test was removed. L2 STY-04 kept its assertions. Its final
`release(...)` now runs inside `act()`, which removed the three act() warnings:
the screen's post-submit state updates had landed after the test ended.

**Removed in #44.** The implementation commit deleted the L2 UI-28
`describe` block (1 case) from `client/tests/lab-02/RequesterTicketDetail.test.tsx`,
after UI-35 and UI-37 were committed red. UI-35 replaces its comment and note
exclusions (comments now exist; notes still never appear), and UI-37 its
status-control and IT Priority exclusions, in all eight statuses. L2 UI-27 in
the same file is kept unchanged.

**Removed in #43.** The implementation commit deleted the L2 STY-09 case
("renders the status as the word New", 1 case) from
`client/tests/lab-02/theme.style.test.tsx`, after STY-01 was committed red.
STY-01 asserts the display text for all eight statuses, NEW included, in both
the queue and My Tickets. L2 STY-08 in the same `describe` is kept unchanged.

L2 E2E-01, E2E-02, and E2E-03 are **rewritten in place**, not superseded. They
keep their ids and files in `e2e/lab-02/requester-ticket-flow.spec.ts`:
- **E2E-01:** signs in instead of selecting a Requester.
- **E2E-02:** "Requester switch" becomes logging out as A and signing in as B.
- **E2E-03:** opens A's ticket URL while signed in as B.

Covered by REG-03 in #38.

When the superseding Issue merges, `RequesterSelection.test.tsx` and the
superseded test bodies are deleted in that Issue's implementation commit. The
replacing tests have already been committed red in the same Issue. The deleted
files are named in the PR description.

### 4.2 Kept Lab 2 tests

Every other Lab 2 test keeps its id and assertions. Only its fixture changes,
from the header to a session:
- **Server:** `loginAs()` in #37 (REG-01).
- **Client:** the auth provider wrapper in #38 (REG-02).
- **E2E:** the login helper in #38 (REG-03).

L2 API-06 (body `requesterId` ignored) stays and is joined by AUZ-08.

L2 API-40 changes once before it is superseded. In #35, its expected count of
active Requesters filters on `role = REQUESTER` as well as `isActive`, matching
the filter #35 adds to `GET /dev-requesters` (Section 3 notes). Its assertions
are otherwise unchanged. #37 then supersedes it with AUZ-04 (Section 4.1).

**Other Lab 2 fixture changes made in #35.** No assertion changed, and every
test keeps its id. Each change follows from the #35 schema:

| Lab 2 file | Change | Why |
|---|---|---|
| `my-tickets`, `ticket-detail`, `attachments`, `create-ticket`, `reference-data` (`*.api.test.ts`) | `prisma.requesterUser` → `prisma.user` | The model is renamed `User` (DEC-02) |
| `my-tickets`, `ticket-detail`, `attachments` | Tickets created directly through Prisma also set `itPriority` equal to `requestedPriority` | The column is NOT NULL (§7.3 step 4) |
| `create-ticket` (L2 API-01 to API-09 fixtures) | The active and inactive Requester lookups filter on `role = REQUESTER` | Sorted by name, the first active user is now IT Staff, which the header middleware rejects (§7.3 interim) |
| `reference-data` (L2 API-40) | The inactive-Requester lookup filters on `role = REQUESTER` too | The seed adds an inactive IT Staff account |

L2 AC-01 to AC-06 (the selector) are retired with the selector. L2 AC-07 to
AC-44 remain in force under AC-21.

---

## 5. Acceptance-criterion traceability

Every criterion maps to at least one planned test. Issue numbers are in Section 2.

| AC | Covering tests |
|---|---|
| AC-01 | API-01, API-06, API-07, API-08, API-13, UI-07, E2E-01 |
| AC-02 | UT-06, API-10, AUZ-12, UI-07, UI-10, UI-11, E2E-02 |
| AC-03 | AUZ-08 |
| AC-04 | CMN-05, E2E-04 |
| AC-05 | API-02, UI-03, E2E-01 |
| AC-06 | API-03, UI-04, E2E-01 |
| AC-07 | UT-05, API-05, UI-05 |
| AC-08 | API-09, UI-15, UI-16, E2E-01 |
| AC-09 | UT-03, UT-06 |
| AC-10 | UT-04, API-10, API-11, UI-08, UI-09 |
| AC-11 | SES-02, API-12 |
| AC-12 | AUZ-10, AUZ-11, UI-20 |
| AC-13 | MIG-03, API-04 |
| AC-14 | UI-01, UI-02, UI-06 |
| AC-15 | AUZ-01, AUZ-02, AUZ-03, REG-04 |
| AC-16 | AUZ-05, QUE-02, E2E-04 |
| AC-17 | AUZ-06 |
| AC-18 | UI-12, UI-13, UI-18 |
| AC-19 | UI-17, E2E-04 |
| AC-20 | AUZ-07 |
| AC-21 | AUZ-04, UI-14, UI-19, REG-01, REG-02, REG-03 |
| AC-22 | AUZ-09, CMN-03 |
| AC-23 | E2E-05 |
| AC-24 | AUZ-13, UI-38 |
| AC-25 | CMN-02, UI-35 |
| AC-26 | CMN-09, CMN-10, CMN-12, UI-26, UI-36, E2E-03 |
| AC-27 | OPS-16, UI-37 |
| AC-28 | QUE-01, QUE-02, UI-21 |
| AC-29 | QUE-03, UI-22 |
| AC-30 | QUE-04, QUE-05, QUE-06, UI-22 |
| AC-31 | UT-08, QUE-07, QUE-08, UI-22 |
| AC-32 | UT-07, QUE-09, QUE-10, QUE-11, UI-25 |
| AC-33 | UI-23, UI-24 |
| AC-34 | AUZ-15, OPS-01, UI-27, UI-34 |
| AC-35 | OPS-02, UI-28, E2E-03 |
| AC-36 | OPS-03, OPS-04, UI-31 |
| AC-37 | OPS-05, OPS-06, OPS-18, UI-28 |
| AC-38 | OPS-07, OPS-08, E2E-03 |
| AC-39 | UT-09, OPS-09, OPS-10, UI-29, E2E-03 |
| AC-40 | UT-10, OPS-11 |
| AC-41 | OPS-12, UI-30, E2E-09 |
| AC-42 | OPS-13 |
| AC-43 | UT-10, OPS-14, CMN-08 |
| AC-44 | OPS-15 |
| AC-45 | OPS-02, OPS-06, OPS-08, OPS-09, OPS-17, CMN-09 |
| AC-46 | CMN-01, E2E-03 |
| AC-47 | CMN-04, CMN-06, E2E-03 |
| AC-48 | UT-11, CMN-07 |
| AC-49 | CMN-11, UI-33 |
| AC-50 | UI-32, STY-04 |
| AC-51 | ADM-01, ADM-02, UI-39, UI-44 |
| AC-52 | ADM-03, UI-40, E2E-06 |
| AC-53 | ADM-04, ADM-05, UI-40 |
| AC-54 | ADM-06, ADM-14, UI-41, E2E-07 |
| AC-55 | ADM-07, UI-42, E2E-07 |
| AC-56 | UT-12, ADM-08, UI-41, E2E-08 |
| AC-57 | UT-12, ADM-09, ADM-10, UI-43, E2E-08 |
| AC-58 | ADM-11, UI-43 |
| AC-59 | AUZ-14, ADM-12, E2E-07 |
| AC-60 | ADM-13, UI-17, UI-44, E2E-08 |
| AC-61 | MIG-01, MIG-02, MIG-03, MIG-04 |
| AC-62 | SEED-01, SEED-02 |
| AC-63 | SEED-03, SEED-04 |
| AC-64 | RSP-01, RSP-02, RSP-03, RSP-04, RSP-05 |
| AC-65 | STY-01, STY-02, STY-03 |
| AC-66 | STY-06 |
| AC-67 | STY-07, STY-08 |
| AC-68 | UI-23, UI-31, UI-43, UI-44, STY-09 |

**Coverage summary:** 68 of 68 acceptance criteria are mapped.

| Group | Tests |
|---|---|
| Unit | 12 |
| Migration, seed, session store | 10 |
| API | 83 |
| Regression | 4 |
| UI component | 44 |
| UI style | 9 |
| Responsive | 6 |
| E2E | 9 |
| **Total planned** | **177** |

Every planned test has exactly one Issue, and every Issue from #35 to #47 owns
at least one test.

---

## 6. Responsive and visual checklist

To be completed by #47 against `artifacts/lab-03/screenshots/`, at desktop
1440×900, tablet 834×1112, and mobile 390×844. The rows are L2 §4 rows 1–21
plus `ui-spec.md` §13 rows 23–31. L2 row 22 (the development notice) is
retired by UI-14.

The format follows L2 §4:
- a tick means checked and passed;
- **auto** names the test that enforces the row;
- n/a gives a reason.

Completed 4 October 2026 by #47, against the captures in `artifacts/lab-03/screenshots/`.

| # | Check | Desktop | Tablet | Mobile | Enforced by |
|---|---|---|---|---|---|
| 1 | Every colour used appears in the `ui-spec.md` token table | auto | auto | auto | STY-06 |
| 2 | Header, primary buttons and strong emphasis use the primary green | yes | yes | yes | — |
| 3 | Editable and read-only fields are distinguishable at a glance | auto | yes | yes | UI-27 |
| 4 | Read-only fields remain readable, not greyed into illegibility | yes | yes | yes | — |
| 5 | Disabled controls are distinct from read-only fields | yes | yes | yes | — |
| 6 | Every required field shows a red asterisk | yes | yes | yes | — |
| 7 | Every validation message sits directly below its own field | yes | n/a — desktop capture | n/a — desktop capture | UI-01, UI-08, UI-40 |
| 8 | At most one primary button per screen (ui-spec 2) | auto | auto | auto | STY-05 |
| 9 | Submit shows a busy state and is disabled while submitting | auto | n/a — desktop capture | n/a — desktop capture | UI-02 |
| 10 | Every button has visible text | yes | yes | yes | — |
| 11 | Keyboard focus is visible on every interactive element | auto | auto | n/a — touch | STY-07 |
| 12 | No label, message or button is clipped | auto | auto, except the queue table (known deviation, note 2) | auto | RSP-01, RSP-02, RSP-03 |
| 13 | No overlapping text or controls | auto | auto | auto, fixed in #47 | RSP-01 to RSP-03 |
| 14 | No horizontal page scrolling | auto | auto | auto | RSP-01 to RSP-03 |
| 15 | Attachment filenames are readable and not clipped at the edge | yes | yes | auto, fixed in #47 | RSP-03 |
| 16 | Priority and status badges convey value by text, not colour alone | auto | auto | auto | STY-01, STY-02 |
| 17 | Removed attachments show no download control | auto | n/a — none captured | n/a — none captured | UI-34 |
| 18 | Empty and no-results states differ in wording and action | auto | n/a — desktop capture | n/a — desktop capture | UI-23 |
| 19 | Mobile lists render as cards, not a squeezed table | n/a — table is correct | n/a — table is correct | auto | RSP-04 |
| 20 | Search, filters, sort and pagination usable at 390px | n/a | n/a | yes | — |
| 21 | Touch targets at least 44x44px on mobile | n/a | n/a | auto, fixed in #47 | RSP-05 |
| 22 | Retired: the development notice is removed (UI-14) | n/a | n/a | n/a | UI-14 |
| 23 | The shell shows the user's name and role badge on every authenticated screen | auto | yes | yes, in the open menu (note 3) | UI-12 |
| 24 | The navigation shows only the destinations permitted for the role | auto | yes | yes | UI-13 |
| 25 | Status, IT Priority, role, and account badges show text, not colour alone | auto | auto | auto | STY-01 to STY-03, UI-39 |
| 26 | Internal Notes are distinguishable from Public Comments by label as well as colour | auto | yes | yes | STY-04, UI-32 |
| 27 | Only the operations card on Staff Detail contains editable ticket fields | auto | yes | yes | UI-27 |
| 28 | Every confirmation dialog is fully visible, with stacked actions at mobile width | auto | auto | auto | RSP-05 |
| 29 | The forbidden state, not-found state, and conflict callout are visually distinct from the error callout | auto | n/a — desktop capture | n/a — desktop capture | STY-09 |
| 30 | Forced Change Password mode shows no navigation | auto | auto | auto | UI-11, RSP-01 to RSP-03 |
| 31 | No horizontal page scrolling on the Queue or User Management at 390px | n/a | n/a | auto | RSP-03 |

**Notes.**
1. **Design consistency.** Every Lab 3 screen uses the Lab 2 card, field, button, and badge components. The captures show no new colour, radius, or type size.
2. **Tablet queue (row 12).** The page does not scroll. The queue table scrolls inside its own container (L2 ui-spec 7), so Owner and Last Updated are to the right of the visible area in `tablet-populated.png`. **Known deviation**, recorded in Section 9: one padding fix was tried in #47 and reverted, because it held only for some data.
3. **Mobile shell (row 23).** Below 768px the name and role badge sit in the collapsed panel (ui-spec 3), as `mobile-shell-menu-open.png` shows. In forced mode they stay visible beside Log out.
4. **Focus order: known deviations, not changed.** Both are recorded in Section 9.
   - On Staff Detail at desktop, Tab reaches the operations card (right column) before Ticket information (left column). The card is first in the DOM because ui-spec 6.5 places it directly after the header on tablet and mobile.
   - Below 768px, dialog actions stack with `column-reverse` (Lab 2 `.zg-actions`), so the confirm button sits above Cancel while Tab reaches Cancel first.

---

## 7. Test commands

Run from the repository root unless stated. These replace L2 §5 once #46 merges.

```bash
# One-time
npm install && (cd server && npm install) && (cd client && npm install)
npm run test:e2e:install

# Environment: server/.env from server/.env.example, including SEED_PASSWORD
# (a local-only development value documented in the README)

# Database
cd server
npx prisma migrate deploy
npm run prisma:seed

# Unit, migration, seed, API, and Lab 1/2/3 server regression
cd server && npm test

# UI component and style, Lab 1/2/3
cd client && npm test

# Responsive and E2E: server on :3000 and client on :5173 running.
# #46 changes the script from `playwright test e2e/lab-02` to `playwright test e2e`.
npm run test:e2e
```

| Suite | Config | Collected from |
|---|---|---|
| Unit, migration, API | `server/vitest.config.ts` | `server/tests/**/*.test.ts` |
| UI component and style | `client/vite.config.ts` | `client/tests/**/*.test.{ts,tsx}` |
| Responsive and E2E | `playwright.config.ts` | `e2e/**` |

Screenshots are written to `artifacts/lab-03/screenshots/` by `e2e/lab-03/responsive.spec.ts`.

---

## 8. Final results

Run on 4 October 2026 at commit `5d0b1ec`, the tip of
`feature/lab3-14-screenshots` and the base of `feature/lab3-15-release-docs`.
That commit contains every Lab 3 Issue (#33 to #47). It is not yet on `main`,
because PRs #59 to #63 were still open. The database was migrated and seeded
from the Section 7 commands, with the API on :3000 and the client on :5173.

| Suite | Command | Tests | Passed | Failed | Skipped |
|---|---|---|---|---|---|
| Unit, migration, seed, API (Labs 1 to 3) | `cd server && npm test` | 445 | 445 | 0 | 0 |
| UI component and style (Labs 1 to 3) | `cd client && npm test` | 287 | 287 | 0 | 0 |
| Responsive and E2E (Labs 2 and 3) | `npm run test:e2e` | 65 | 49 | 0 | 16 |
| **Total** | | **797** | **781** | **0** | **16** |

By lab:

| Suite | Lab 1 | Lab 2 | Lab 3 |
|---|---|---|---|
| Server | 2 | 83 | 360 |
| Client | 3 | 52 | 232 |
| E2E | — | 23 passed, 16 skipped | 26 |

The complete output of each run is saved in `artifacts/lab-03/test-output/`
as `server.txt`, `client.txt`, and `e2e.txt`.

**All 16 skips are the Lab 2 viewport guards (L2 §6), not failures and not
disabled tests.** No Lab 3 test is skipped. The Lab 3 specs that run at one
width are excluded from the other projects in `playwright.config.ts`, so they
are not reported as skipped.

| Skipped | Why |
|---|---|
| L2 E2E-01 to E2E-05 at tablet and mobile (10) | The journeys run at one viewport (L2 §6). |
| L2 RSP-06 at desktop and tablet (2) | The 44px touch minimum is a mobile requirement. |
| L2 RSP-07, two specs, at tablet and mobile (4) | `ui-spec.md` §10 lists these screenshot paths at desktop only. |

Lab 2 recorded 18 skips. The difference is the RSP-07 "requester selection
states" case, superseded in Section 4.1 (#38), which was skipped at tablet and
mobile.

Verifiable: `grep -rn "test.skip\|\.only\|xit(\|xdescribe(" server/tests client/tests e2e`
returns only the four conditional viewport guards behind the skips above.

**Definition of Done gate:**
- every planned test above is implemented and passing;
- no test is skipped, disabled, commented out, `.only`-scoped, or flaky;
- a planned test that was not implemented is moved to Section 9 with a stated reason, and is never silently dropped from Section 2.

---

## 9. Known limitations and deferred tests

| Item | Reason | Where it goes |
|---|---|---|
| No stale-update test for reassignment or IT Priority | There is no version field (DEV-10). Concurrent writes are last write wins, and both are recorded by event, as asserted in OPS-06 and OPS-08. | Revisit with DEV-10 |
| Throttle state is per process and lost on restart | In-memory by design (DEC-06, A-02). UT-05 and API-05 prove behaviour within a process. | Revisit if more than one process serves the API |
| Idle expiry is accurate to about one minute | `lastSeenAt` writes are throttled (A-03). UT-03 tests the boundary on the stored value. | — |
| The migration upgrade test uses synthetic Lab 2 rows | MIG-02 seeds Lab 2–shaped data in an isolated schema rather than restoring a real Lab 2 dump | Acceptable. The rows cover every column and every attachment state. |
| Content-type sniffing still deferred | DEV-15. A forged MIME type on a permitted extension would pass. Stored files are never executed or served inline. | Later sprint |
| No full WCAG audit | STY-07, STY-08, and RSP-05 are targeted checks, as in Lab 2 | Later hardening sprint |
| Known deviation: the tablet queue table scrolls inside its container | At 834px the six-column table is wider than its container (847px in 800px on the seeded queue). It scrolls inside the container (L2 ui-spec 7), so Owner and Last Updated can be off to the right. This conflicts with ui-spec 6.4 and 9. A padding fix tried in #47 held only for some data and was reverted. | Revisit with a column-width or table-layout decision |
| Known deviation: Staff Detail Tab order at desktop | The operations card is first in the DOM (ui-spec 6.5, tablet and mobile), so at desktop Tab reaches the right-hand operations column before Ticket information | Revisit if the layout is redesigned |
| Known deviation: dialog action order below 768px | `.zg-actions` stacks with `column-reverse` (Lab 2), so confirm is shown above Cancel while Tab reaches Cancel first | Revisit with the Lab 2 action layout |
