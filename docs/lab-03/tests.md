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
| UT-07 | Unit | AC-32 | Queue query parser | Page size only 10/20/50, default 20. An unknown parameter, a bad `owner`, a bad `status`, and `q` over 150 characters are each rejected. | `queue-query.unit.test.ts` | #39 | Planned |
| UT-08 | Unit | AC-31 | Queue comparators | IT Priority orders LOW < MEDIUM < HIGH < URGENT. Status orders in lifecycle order. The default key is `itPriority desc, createdAt asc, id asc`. | `queue-query.unit.test.ts` | #39 | Planned |
| UT-09 | Unit | AC-39, BR-35 | Transition matrix, exhaustive | All 64 (from, to) pairs: exactly the 18 matrix rows are permitted, every other pair is refused, and none is permitted for the Requester role | `transitions.unit.test.ts` | #40 | Planned |
| UT-10 | Unit | AC-40, AC-43, BR-36 | Status guards | The owner requirement per target status. The claimable, assignable, and IT-Priority-editable status sets match `specification.md` §5.6. | `transitions.unit.test.ts` | #40 | Planned |
| UT-11 | Unit | AC-48, BR-47 | Comment and note body | Empty and whitespace-only rejected; 1 accepted; 2000 accepted; 2001 rejected; length measured after trimming | `comment-body.unit.test.ts` | #41 | Planned |
| UT-12 | Unit | AC-56, AC-57, BR-63 | Admin guard order | Given counts and actor: the sole Administrator deactivating self → `LAST_ADMINISTRATOR`; with two Administrators → `CANNOT_DEACTIVATE_SELF`; self role change → `CANNOT_CHANGE_OWN_ROLE`; open tickets → `USER_HAS_OPEN_TICKETS` | `admin-guards.unit.test.ts` | #42 | Planned |

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
| QUE-01 | API | AC-28 | Queue contents | IT Staff and Administrator see tickets from every Requester. Items carry the `api-spec.md` §5.1 fields and no `description`. | `staff-queue.api.test.ts` | #39 | Planned |
| QUE-02 | API | AC-16, AC-28 | Requester refused | A Requester gets 403 on `GET /staff/tickets` with any parameters | `staff-queue.api.test.ts` | #39 | Planned |
| QUE-03 | API | AC-29 | Search | `q` matches a partial Ticket Number, a summary word, and a Requester name, case-insensitively, and nothing else | `staff-queue.api.test.ts` | #39 | Planned |
| QUE-04 | API | AC-30 | Status filter | Only tickets in the given status | `staff-queue.api.test.ts` | #39 | Planned |
| QUE-05 | API | AC-30 | IT Priority and category filters | Only tickets matching each filter, and both together | `staff-queue.api.test.ts` | #39 | Planned |
| QUE-06 | API | AC-30 | Owner filter | `me` returns the caller's tickets, `unassigned` returns those with a null owner, `{uuid}` returns that user's tickets. A Requester's UUID → 400. | `staff-queue.api.test.ts` | #39 | Planned |
| QUE-07 | API | AC-31 | Default order | Without `sortBy`: URGENT before HIGH, and within a priority the oldest first | `staff-queue.api.test.ts` | #39 | Planned |
| QUE-08 | API | AC-31 | Explicit sorts | `itPriority` asc and desc by severity, `status` in lifecycle order, `updatedAt` desc, `ticketNumber` asc | `staff-queue.api.test.ts` | #39 | Planned |
| QUE-09 | API | AC-32 | Pagination | Default page size 20. Page 2 returns the next set with correct `meta`. | `staff-queue.api.test.ts` | #39 | Planned |
| QUE-10 | API | AC-32 | Invalid parameters | `pageSize=25`, `foo=1`, `owner=someone`, and `status=ASSIGNED` each → 400 | `staff-queue.api.test.ts` | #39 | Planned |
| QUE-11 | API | AC-32 | Page past the end | Empty `data` with correct `meta` | `staff-queue.api.test.ts` | #39 | Planned |

### 2.6 API — Ticket operations — `server/tests/lab-03/staff-ticket-detail.api.test.ts`

| Test ID | Type | Req / AC | What it tests | Expected result | Test file | Issue | Final |
|---|---|---|---|---|---|---|---|
| OPS-01 | API | AC-34 | Staff detail | 200 with Requester, owner, `itPriority`, `requesterIndicatedResolvedAt`, `availableTransitions`, and attachments. An unknown id → 404; a malformed id → 400. | `staff-ticket-detail.api.test.ts` | #40 | Planned |
| OPS-02 | API | AC-35, AC-45 | Claim a NEW ticket | 200. The owner is the caller and the status is OPEN. One `OWNER_CHANGED` (cause `CLAIM`) and one `STATUS_CHANGED` NEW → OPEN event, with the caller as actor. | `staff-ticket-detail.api.test.ts` | #40 | Planned |
| OPS-03 | API | AC-36, BR-29 | Concurrent claims | Two IT Staff claim the same ticket in parallel: one 200, one 409 `TICKET_ALREADY_CLAIMED`. Exactly one `OWNER_CHANGED` event exists. | `staff-ticket-detail.api.test.ts` | #40 | Planned |
| OPS-04 | API | AC-36 | Claim refusals | Claiming an owned ticket → 409 `TICKET_ALREADY_CLAIMED`. Claiming a CLOSED ticket → 409 `TICKET_STATE_CONFLICT`. | `staff-ticket-detail.api.test.ts` | #40 | Planned |
| OPS-05 | API | AC-37, BR-28 | Assign eligibility | Assigning to an active IT Staff or Administrator → 200. To a Requester, the inactive IT Staff, or an unknown UUID → 422 `details.ownerId`. | `staff-ticket-detail.api.test.ts` | #40 | Planned |
| OPS-06 | API | AC-37, AC-45, BR-30 | Reassign and no-op | Reassigning records `OWNER_CHANGED` with from and to. Assigning the current owner → 200 with no event. | `staff-ticket-detail.api.test.ts` | #40 | Planned |
| OPS-07 | API | AC-38, BR-33 | IT Priority on create | A ticket created by a Requester has `itPriority` equal to `requestedPriority` | `staff-ticket-detail.api.test.ts` | #40 | Planned |
| OPS-08 | API | AC-38, AC-45 | Change IT Priority | 200. `IT_PRIORITY_CHANGED` with from and to. `requestedPriority` unchanged. Setting the same value adds no event. CLOSED and CANCELLED → 409. | `staff-ticket-detail.api.test.ts` | #40 | Planned |
| OPS-09 | API | AC-39, AC-45 | Permitted transitions | Table-driven over the 17 status-endpoint rows of the matrix: each → 200 with one `STATUS_CHANGED` event carrying from, to, and any reason | `staff-ticket-detail.api.test.ts` | #40 | Planned |
| OPS-10 | API | AC-39, BR-38 | Refused transitions | NEW → OPEN through the status endpoint, NEW → RESOLVED, RESOLVED → CANCELLED, CLOSED → CANCELLED, OPEN → NEW, and OPEN → OPEN each → 409 `INVALID_STATUS_TRANSITION`, with no change and no event | `staff-ticket-detail.api.test.ts` | #40 | Planned |
| OPS-11 | API | AC-40, BR-36 | Owner required | REOPENED with no owner → IN_PROGRESS gives 409 `TICKET_OWNER_REQUIRED`. After a claim, the same transition succeeds. | `staff-ticket-detail.api.test.ts` | #40 | Planned |
| OPS-12 | API | AC-41, BR-37 | Reason rules | Cancel and reopen with no reason, or a 4-character reason → 422 `details.reason`. Five characters → 200, with the reason in the event payload. | `staff-ticket-detail.api.test.ts` | #40 | Planned |
| OPS-13 | API | AC-42, BR-40 | Reopen side effects | Reopening a RESOLVED ticket that has a resolution indication and whose owner is now inactive clears both. `OWNER_CHANGED` has cause `OWNER_INELIGIBLE_ON_REOPEN` and a null actor. With an eligible owner, the owner is kept. | `staff-ticket-detail.api.test.ts` | #40 | Planned |
| OPS-14 | API | AC-43, BR-39 | CLOSED lock for operations | On a CLOSED ticket, claim, assign, and IT Priority each → 409 `TICKET_STATE_CONFLICT`. Reopen → 200. | `staff-ticket-detail.api.test.ts` | #40 | Planned |
| OPS-15 | API | AC-44, BR-26 | Administrator parity | The Administrator claims, assigns, changes IT Priority, and changes status with the same outcomes and events as IT Staff | `staff-ticket-detail.api.test.ts` | #40 | Planned |
| OPS-16 | API | AC-27 | Requester refused | A Requester calling claim, owner, it-priority, and status (cancel and reopen included) on their own ticket and on a random UUID gets identical 403 bodies | `staff-ticket-detail.api.test.ts` | #40 | Planned |
| OPS-17 | API | AC-45, BR-56 | Event payload safety | Across every operation above, no event payload contains a password, hash, session token, or CSRF token. Every event has `ticketId`, `eventType`, and `createdAt`. | `staff-ticket-detail.api.test.ts` | #40 | Planned |
| OPS-18 | API | AC-37 | Assignee list | `GET /staff/assignees` returns exactly the active IT Staff and Administrators, sorted by name. A Requester → 403. | `staff-ticket-detail.api.test.ts` | #40 | Planned |

### 2.7 API — comments, notes, resolution indication — `server/tests/lab-03/comments-notes.api.test.ts`

| Test ID | Type | Req / AC | What it tests | Expected result | Test file | Issue | Final |
|---|---|---|---|---|---|---|---|
| CMN-01 | API | AC-46, BR-48 | Staff comment visible to Requester | IT Staff posts → 201. The Requester's list contains it with the staff member's name and role and a server `createdAt`. A body `authorId` or `createdAt` is ignored. | `comments-notes.api.test.ts` | #41 | Planned |
| CMN-02 | API | AC-25 | Requester comment | The Requester posts on their own ticket → 201. IT Staff can read it. | `comments-notes.api.test.ts` | #41 | Planned |
| CMN-03 | API | AC-22 | Cross-Requester comments | Requester B listing or posting on A's ticket, and on a random UUID, gets identical 404 bodies | `comments-notes.api.test.ts` | #41 | Planned |
| CMN-04 | API | AC-47 | Notes for staff | IT Staff posts a note → 201. Both IT Staff and the Administrator list it, oldest first. | `comments-notes.api.test.ts` | #41 | Planned |
| CMN-05 | API | AC-04, BR-23 | Notes refused to Requester | A Requester's GET and POST on notes, for their own ticket, another's, and a random UUID, get identical 403 bodies with no note content | `comments-notes.api.test.ts` | #41 | Planned |
| CMN-06 | API | AC-47, BR-53 | No note leakage | After notes exist, no Requester-facing response contains the note body, a note id, or a note count. This covers ticket detail, comments, and My Tickets. | `comments-notes.api.test.ts` | #41 | Planned |
| CMN-07 | API | AC-48 | Body bounds over HTTP | Empty, whitespace-only, and 2001 characters → 422 `details.body`. 1 and 2000 → 201. Checked for comments and notes. | `comments-notes.api.test.ts` | #41 | Planned |
| CMN-08 | API | AC-43, BR-52 | CLOSED refuses, CANCELLED allows | Comment and note on CLOSED → 409 `TICKET_STATE_CONFLICT`. On CANCELLED → 201. | `comments-notes.api.test.ts` | #41 | Planned |
| CMN-09 | API | AC-26, AC-45, BR-43 | Appears resolved | The Requester on their own OPEN ticket → 200. `requesterIndicatedResolvedAt` is set, one `RESOLUTION_INDICATED` event exists, and the status is still OPEN. The queue item shows the indication. | `comments-notes.api.test.ts` | #41 | Planned |
| CMN-10 | API | AC-26, BR-44 | Appears-resolved refusals | In NEW, RESOLVED, CLOSED, and CANCELLED → 409 `TICKET_STATE_CONFLICT`. A second time → 409 `RESOLUTION_ALREADY_INDICATED`. On another's ticket → 404. As IT Staff → 403. | `comments-notes.api.test.ts` | #41 | Planned |
| CMN-11 | API | AC-49, BR-49 | Body stored verbatim | `<script>alert(1)</script>\nline two` is stored and returned exactly, trimmed only, without escaping or stripping | `comments-notes.api.test.ts` | #41 | Planned |
| CMN-12 | API | AC-26 | Requester detail additions | `GET /tickets/{id}` includes `owner` and `requesterIndicatedResolvedAt`, and does not include `itPriority` | `comments-notes.api.test.ts` | #41 | Planned |

### 2.8 API — user administration — `server/tests/lab-03/users-admin.api.test.ts`

| Test ID | Type | Req / AC | What it tests | Expected result | Test file | Issue | Final |
|---|---|---|---|---|---|---|---|
| ADM-01 | API | AC-51 | User list | Every user with the `AdminUser` fields, sorted by `fullName`. No `passwordHash`. | `users-admin.api.test.ts` | #42 | Planned |
| ADM-02 | API | AC-51, BR-66 | Search and role filter | `q` matches part of a name and part of an email, case-insensitively. `role=IT_STAFF` returns only IT Staff. Both combine. `role=AGENT` and an unknown parameter → 400. | `users-admin.api.test.ts` | #42 | Planned |
| ADM-03 | API | AC-52, BR-62 | Create user | 201 with `mustChangePassword` true. The new user can log in and is then gated by `PASSWORD_CHANGE_REQUIRED`. | `users-admin.api.test.ts` | #42 | Planned |
| ADM-04 | API | AC-53, BR-61 | Duplicate email | Creating with an existing email in different case, and editing a user to another's email → 409 `EMAIL_ALREADY_EXISTS` | `users-admin.api.test.ts` | #42 | Planned |
| ADM-05 | API | AC-53, BR-60 | Create validation | An invalid role, a missing name, a 1-character name, an invalid email, and an 11-code-point password → one 422 naming each field | `users-admin.api.test.ts` | #42 | Planned |
| ADM-06 | API | AC-54 | Edit user | Changing name, email, role, and `isActive` → 200 with each change persisted. A `password` field in the body is ignored. | `users-admin.api.test.ts` | #42 | Planned |
| ADM-07 | API | AC-55, BR-13 | New initial password | 200. `mustChangePassword` true, the target's existing session → 401, the new password logs in, and the old password fails. | `users-admin.api.test.ts` | #42 | Planned |
| ADM-08 | API | AC-56, BR-63 | Self-protection | With a second active Administrator present: self-deactivation → 409 `CANNOT_DEACTIVATE_SELF`; self role change → 409 `CANNOT_CHANGE_OWN_ROLE`; self name change → 200 | `users-admin.api.test.ts` | #42 | Planned |
| ADM-09 | API | AC-57 | Last Administrator, serial | The sole active Administrator deactivating self or changing own role → 409 `LAST_ADMINISTRATOR` | `users-admin.api.test.ts` | #42 | Planned |
| ADM-10 | API | AC-57, BR-63 | Last Administrator, concurrent | Two Administrators each demote the other in parallel: exactly one succeeds, and at least one active Administrator remains | `users-admin.api.test.ts` | #42 | Planned |
| ADM-11 | API | AC-58 | Open-ticket block | Deactivating, or demoting to Requester, an IT Staff member who owns two open tickets → 409 `USER_HAS_OPEN_TICKETS`, whose message contains "2". With only CLOSED tickets → 200. | `users-admin.api.test.ts` | #42 | Planned |
| ADM-12 | API | AC-59, BR-64 | Session revocation | Deactivating a signed-in user, and separately changing a role, makes the target's next request 401. A deactivated user's correct-password login → 403 `ACCOUNT_INACTIVE`. A name-only edit keeps the session. | `users-admin.api.test.ts` | #42 | Planned |
| ADM-13 | API | AC-60 | Non-Administrators refused | Requester and IT Staff on every `/admin/users` endpoint → 403 | `users-admin.api.test.ts` | #42 | Planned |
| ADM-14 | API | AC-54 | Unknown and malformed ids | PATCH or initial-password on an unknown UUID → 404; on a malformed id → 400 | `users-admin.api.test.ts` | #42 | Planned |

### 2.9 Regression — existing suites

| Test ID | Type | Req / AC | What it tests | Expected result | Test file | Issue | Final |
|---|---|---|---|---|---|---|---|
| REG-01 | Regression | AC-21, BR-70 | Lab 2 server suite under sessions | Every kept test in `server/tests/lab-02/` passes using `loginAs()` from `server/tests/helpers/session.ts` instead of the header. Superseded tests are handled per Section 4. | `server/tests/lab-02/*` | #37 | Pass |
| REG-02 | Regression | AC-21, BR-70 | Lab 2 client suite under auth context | Every kept test in `client/tests/lab-02/` passes with the auth provider in place of `RequesterProvider` | `client/tests/lab-02/*` | #38 | Planned |
| REG-03 | Regression | AC-21, BR-70 | Lab 2 E2E suite under login | `e2e/lab-02/` passes: L2 E2E-01 to E2E-03 are rewritten to sign in, and E2E-04, E2E-05, and the responsive specs use the login helper | `e2e/lab-02/*` | #38 | Planned |
| REG-04 | Regression | AC-15, A-04 | Lab 1 suites unchanged | `server/tests/lab-01/` and `client/tests/lab-01/` pass with no edits, through the Vite proxy for the client | `server/tests/lab-01/*`, `client/tests/lab-01/*` | #38 | Planned |

### 2.10 UI component — `client/tests/lab-03/`

| Test ID | Type | Req / AC | What it tests | Expected result | Test file | Issue | Final |
|---|---|---|---|---|---|---|---|
| UI-01 | UI | AC-14 | Login validation | Labelled fields. An empty submit shows a message below each empty field and sends no request. | `Login.test.tsx` | #38 | Planned |
| UI-02 | UI | AC-14 | Login busy | While in flight, Sign in is busy and disabled and the fields are disabled | `Login.test.tsx` | #38 | Planned |
| UI-03 | UI | AC-05 | Invalid credentials | Generic callout. The password is cleared, the email kept, focus moves to Password, and no field is marked invalid. | `Login.test.tsx` | #38 | Planned |
| UI-04 | UI | AC-06 | Inactive account | The inactive callout text is shown | `Login.test.tsx` | #38 | Planned |
| UI-05 | UI | AC-07 | Throttled | The try-later callout is shown | `Login.test.tsx` | #38 | Planned |
| UI-06 | UI | AC-14 | Login failure | On a network failure, a safe callout with no status code. Fields kept. | `Login.test.tsx` | #38 | Planned |
| UI-07 | UI | AC-01, AC-02 | Login outcome | Success navigates to the role's landing route. `mustChangePassword` navigates to Change Password in forced mode. | `Login.test.tsx` | #38 | Planned |
| UI-08 | UI | AC-10 | Client password rules | 11 code points, a mismatch, and equal to current are each blocked with a message below the field and no request | `ChangePassword.test.tsx` | #38 | Planned |
| UI-09 | UI | AC-10 | Server field errors | A 422 `details.currentPassword` renders below Current password | `ChangePassword.test.tsx` | #38 | Planned |
| UI-10 | UI | AC-02 | Change success | The new `csrfToken` is stored, forced mode ends, and the app navigates to landing with the "Password changed." callout | `ChangePassword.test.tsx` | #38 | Planned |
| UI-11 | UI | AC-02 | Forced mode | No navigation and no Change password link. Visiting `/tickets` renders Change Password. | `ChangePassword.test.tsx` | #38 | Planned |
| UI-12 | UI | AC-18 | Shell identity | The user's name, role badge, Change password link, and Log out are present | `AppShell.test.tsx` | #38 | Planned |
| UI-13 | UI | AC-18, FR-08 | Role navigation | Requester: My Tickets and Create Ticket only. IT Staff: Ticket Queue only. Administrator: Ticket Queue and User Management only. | `AppShell.test.tsx` | #38 | Planned |
| UI-14 | UI | AC-21 | Selector removed | No Development Requester selector, no Change Requester action, and no development notice anywhere in the shell | `AppShell.test.tsx` | #38 | Planned |
| UI-15 | UI | AC-08 | Logout | Log out calls the API, clears cached ticket data, and shows Login. Signing in as another user shows none of the previous user's data. | `AppShell.test.tsx` | #38 | Planned |
| UI-16 | UI | AC-08 | Unauthenticated redirect | A protected route redirects to `/login?next=…`. `next=//evil.example` and `next=https://evil.example` are ignored after login. | `routing.test.tsx` | #38 | Planned |
| UI-17 | UI | AC-19, AC-60 | Forbidden route | A Requester at `/staff/queue` and `/admin/users`, and IT Staff at `/admin/users`, see `state-forbidden`, and no protected API call is made | `routing.test.tsx` | #38 | Planned |
| UI-18 | UI | AC-18 | Landing redirect | `/` goes to `/tickets` for a Requester and to `/staff/queue` for IT Staff and Administrators. `/lab-01` renders outside the shell without a session. | `routing.test.tsx` | #38 | Planned |
| UI-19 | UI | AC-21 | Legacy state removed | A pre-existing `toktickit.selectedRequester` sessionStorage key is removed on startup | `routing.test.tsx` | #38 | Planned |
| UI-20 | UI | AC-12, DEC-04 | API client | Requests use relative `/api/v1/...` URLs. Non-GET requests carry `X-CSRF-Token`; GET requests do not. A 401 response triggers the session-ended redirect. | `api-client.test.ts` | #38 | Planned |
| UI-21 | UI | AC-28 | Queue rendering | The seven columns. An unassigned owner shows "Unassigned". Status and IT Priority badges are present. | `StaffTicketQueue.test.tsx` | #43 | Planned |
| UI-22 | UI | AC-29, AC-30, AC-31 | Queue controls | Search, each filter, and each sort option send the documented parameters and reset to page 1. Clear Filters restores the defaults. | `StaffTicketQueue.test.tsx` | #43 | Planned |
| UI-23 | UI | AC-33, AC-68 | Queue states | Loading, empty, no-results, failure with Retry, and forbidden are distinct in wording and action | `StaffTicketQueue.test.tsx` | #43 | Planned |
| UI-24 | UI | AC-33 | Queue mobile cards | Below 768px, cards and no table. At desktop, a table and no cards. | `StaffTicketQueue.test.tsx` | #43 | Planned |
| UI-25 | UI | AC-32 | Queue pagination | Exactly 10, 20, and 50 are offered, with 20 selected by default. Changing the size requests it and returns to page 1. | `StaffTicketQueue.test.tsx` | #43 | Planned |
| UI-26 | UI | AC-26 | Indication in queue | A row with `requesterIndicatedResolvedAt` shows the compact indicator | `StaffTicketQueue.test.tsx` | #43 | Planned |
| UI-27 | UI | AC-34 | Staff detail layout | Ticket information has no editable control. Editable fields exist only inside `operations-card`. | `StaffTicketDetail.test.tsx` | #44 | Planned |
| UI-28 | UI | AC-35, AC-37 | Owner controls | Claim is shown only when unassigned and claimable. The assignee select lists `/staff/assignees`. A successful claim or assign re-fetches the detail. | `StaffTicketDetail.test.tsx` | #44 | Planned |
| UI-29 | UI | AC-39 | Transition buttons | Exactly one button per `availableTransitions` entry, with the `ui-spec.md` §6.5 labels, and none for unlisted statuses | `StaffTicketDetail.test.tsx` | #44 | Planned |
| UI-30 | UI | AC-41 | Confirmation dialogs | Resolve and Close open a dialog. Cancel and Reopen require a reason, blocked under 5 characters. No request is sent before confirm, and focus returns to the trigger. | `StaffTicketDetail.test.tsx` | #44 | Planned |
| UI-31 | UI | AC-36, AC-68 | Conflict handling | A 409 shows `callout-conflict` with the server message and re-fetches the detail | `StaffTicketDetail.test.tsx` | #44 | Planned |
| UI-32 | UI | AC-50 | Comment and note regions | Separate tabs. Only the active tab's composer is rendered. The note composer and note items carry the "Internal note — not visible to Requester" label. | `StaffTicketDetail.test.tsx` | #44 | Planned |
| UI-33 | UI | AC-49 | Safe body rendering | A body containing `<script>` renders as literal text with no script element in the DOM, and its line breaks are preserved | `StaffTicketDetail.test.tsx` | #44 | Planned |
| UI-34 | UI | AC-34 | Staff attachments read-only | Download links are present. No Add Attachment control, drop zone, or Remove button. | `StaffTicketDetail.test.tsx` | #44 | Planned |
| UI-35 | UI | AC-25 | Requester comments | The Comments card lists comments, posting appends one, and no notes or note tab appear | `RequesterTicketDetail.test.tsx` | #44 | Planned |
| UI-36 | UI | AC-26 | Appears resolved | The button appears only in eligible statuses. Confirming shows the indicator and hides the button. Cancelling the dialog sends nothing. | `RequesterTicketDetail.test.tsx` | #44 | Planned |
| UI-37 | UI | AC-27 | No staff controls for Requester | No status, cancel, reopen, claim, assign, or IT Priority control in any ticket status | `RequesterTicketDetail.test.tsx` | #44 | Planned |
| UI-38 | UI | AC-24 | Attachment lock in UI | On CLOSED and CANCELLED: no Add Attachment and no Remove, and the helper text is shown. Download remains. | `RequesterTicketDetail.test.tsx` | #44 | Planned |
| UI-39 | UI | AC-51 | User list | Name, Email, Role badge, Status badge, and Edit per user. Search and role filter send `q` and `role`. The own row is marked "(you)". | `UserManagement.test.tsx` | #45 | Planned |
| UI-40 | UI | AC-52, AC-53 | Create dialog | Client validation below the fields. A server `EMAIL_ALREADY_EXISTS` renders below Email. Success closes the dialog, refreshes the list, and shows "User saved." | `UserManagement.test.tsx` | #45 | Planned |
| UI-41 | UI | AC-54, AC-56 | Edit dialog | Fields are prefilled and saving sends only the changed fields. On the own row, Role and Active are disabled with the explanation. | `UserManagement.test.tsx` | #45 | Planned |
| UI-42 | UI | AC-55 | Set new initial password | Opens a confirmation dialog with a password field validated against BR-11. Success shows "Initial password set." | `UserManagement.test.tsx` | #45 | Planned |
| UI-43 | UI | AC-57, AC-58, AC-68 | Safety conflicts | `LAST_ADMINISTRATOR` and `USER_HAS_OPEN_TICKETS` responses render as a conflict callout inside the dialog, with input kept | `UserManagement.test.tsx` | #45 | Planned |
| UI-44 | UI | AC-51, AC-60, AC-68 | User list states | Loading, no-results with Clear, failure with Retry, and forbidden. Cards below 768px. | `UserManagement.test.tsx` | #45 | Planned |

### 2.11 UI style — `client/tests/lab-03/theme.style.test.tsx`

| Test ID | Type | Req / AC | What it tests | Expected result | Test file | Issue | Final |
|---|---|---|---|---|---|---|---|
| STY-01 | UI style | AC-65 | Status badges | All eight statuses render their display text, with the background and text tokens from `ui-spec.md` §7.1 | `theme.style.test.tsx` | #43 | Planned |
| STY-02 | UI style | AC-65 | IT Priority badge | Text plus glyph for all four values | `theme.style.test.tsx` | #43 | Planned |
| STY-03 | UI style | AC-65 | Role badge | Text for all three roles. The Administrator badge in the header has its 1px border. | `theme.style.test.tsx` | #38 | Planned |
| STY-04 | UI style | AC-50 | Note vs comment | Note items use `--zg-warning-bg` with a 3px `--zg-warning` left border and the text label. Comment items use `--zg-surface`. The two differ in computed background. | `theme.style.test.tsx` | #44 | Planned |
| STY-05 | UI style | ui-spec §2 | Primary button count | At most one visible primary button on each Lab 3 screen, and on Staff Detail in each composer tab | `theme.style.test.tsx` | #47 | Planned |
| STY-06 | UI style | AC-66 | Token conformance | Every computed colour on the six Lab 3 screens appears in the L2 §1.1 token table | `theme.style.test.tsx` | #47 | Planned |
| STY-07 | UI style | AC-67 | Focus and dialogs | Focused controls show the focus ring. Every dialog traps Tab and restores focus on close. | `theme.style.test.tsx` | #47 | Planned |
| STY-08 | UI style | AC-67 | Keyboard reach | Tab order reaches every control in visual order on each Lab 3 screen. Staff Detail tabs respond to arrow keys. | `theme.style.test.tsx` | #47 | Planned |
| STY-09 | UI style | AC-68 | Callout variants | Forbidden, not-found, conflict, and error callouts differ in computed background and border, each has text and an icon, and none renders a digit-only status code | `theme.style.test.tsx` | #47 | Planned |

### 2.12 Responsive — `e2e/lab-03/responsive.spec.ts`

| Test ID | Type | Req / AC | What it tests | Expected result | Test file | Issue | Final |
|---|---|---|---|---|---|---|---|
| RSP-01 | Responsive | AC-64 | Desktop 1440×900 | Login, Change Password, Queue, Staff Detail, Requester Detail with comments, and User Management: no horizontal scroll, no clipped or overlapping element | `responsive.spec.ts` | #47 | Planned |
| RSP-02 | Responsive | AC-64 | Tablet 834×1112 | The same assertions. The Queue hides the Requester column. | `responsive.spec.ts` | #47 | Planned |
| RSP-03 | Responsive | AC-64 | Mobile 390×844 | The same assertions | `responsive.spec.ts` | #47 | Planned |
| RSP-04 | Responsive | AC-64 | Mobile list forms | The Queue and User Management render cards, not tables, below 768px | `responsive.spec.ts` | #47 | Planned |
| RSP-05 | Responsive | AC-64 | Mobile dialogs and touch targets | Dialogs fit the viewport with stacked actions. Interactive elements are at least 44×44px. | `responsive.spec.ts` | #47 | Planned |
| RSP-06 | Responsive | ui-spec §12 | Screenshot capture | Every path in `ui-spec.md` §12 is produced | `responsive.spec.ts` | #47 | Planned |

### 2.13 End-to-end — `e2e/lab-03/`

| Test ID | Type | Req / AC | What it tests | Expected result | Test file | Issue | Final |
|---|---|---|---|---|---|---|---|
| E2E-01 | E2E | AC-01, AC-05, AC-06, AC-08 | Sign-in journey | An invalid login shows the generic message. The inactive account shows the inactive message. A valid login shows the shell with name and role. Logout, then visiting `/tickets` directly, shows Login. | `authentication.spec.ts` | #46 | Planned |
| E2E-02 | E2E | AC-02 | First-login change | The must-change fixture signs in, is held on Change Password, sets a new password, and lands on My Tickets | `authentication.spec.ts` | #46 | Planned |
| E2E-03 | E2E | AC-26, AC-35, AC-38, AC-39, AC-46, AC-47 | Staff ticket flow | Staff claim a NEW ticket, raise IT Priority, Start work, post a comment, and post a note. The Requester sees the comment but not the note, and indicates appears resolved. Staff see the indicator, Resolve, then Close. | `staff-ticket-flow.spec.ts` | #46 | Planned |
| E2E-04 | E2E | AC-04, AC-16, AC-19 | Requester boundaries | A Requester opening `/staff/queue` sees the forbidden state. Their `page.request` to `/staff/tickets` and to `/tickets/{id}/notes` → 403 with no note text. | `staff-ticket-flow.spec.ts` | #46 | Planned |
| E2E-05 | E2E | AC-23 | Real Download click | Clicking Download on Requester Detail, and on Staff Detail, triggers a browser download whose suggested filename is the original filename (D-25) | `staff-ticket-flow.spec.ts` | #46 | Planned |
| E2E-06 | E2E | AC-52 | Create user and first login | Through the UI, the Administrator creates an IT Staff user with an email unique to the run, `e2e-staff-{timestamp}-{random}@example.test`. That user signs in, must change the password, and then sees the Ticket Queue. In `finally`, the user is deactivated through the API. | `user-administration.spec.ts` | #46 | Planned |
| E2E-07 | E2E | AC-54, AC-55, AC-59 | Edit, deactivate, new password | **Setup:** through the API, the test creates its own target user with an email unique to the run, `e2e-target-{timestamp}-{random}@example.test`, then signs in as that user and changes the password, so `mustChangePassword` is false. **Flow, through the UI:** the Administrator edits the target's name. The Administrator deactivates the target, who then cannot sign in (inactive message). The Administrator reactivates the target and sets a new initial password; the target's next sign-in requires a change. In `finally`, the target is deactivated through the API. | `user-administration.spec.ts` | #46 | Planned |
| E2E-08 | E2E | AC-56, AC-57, AC-60 | Safety and access | Precondition steps (a)–(c) in Section 1, *E2E-08 precondition*, run as part of the test. After step (a), the seeded Administrator, as sole active Administrator, tries to deactivate their own account and sees the last-Administrator message. After step (b) creates a second Administrator, the same attempt shows the self-deactivation message. IT Staff opening `/admin/users` sees the forbidden state. Step (c) then runs. | `user-administration.spec.ts` | #46 | Planned |
| E2E-09 | E2E | AC-41 | Cancel and reopen | Staff cancel a ticket with a reason through the dialog, then reopen it with a reason. The status badge shows Cancelled, then Reopened. | `staff-ticket-flow.spec.ts` | #46 | Planned |

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

**Removed in #37.** The implementation commit deleted these from
`server/tests/lab-02/`, after the replacing tests were committed red:
- **L2 API-08** (`create-ticket.api.test.ts`), both cases: no header → 428, and a header naming an unknown Requester → 428. Replaced by AUZ-01.
- **L2 API-09** (`create-ticket.api.test.ts`), both cases: an inactive Requester's header → 403 `REQUESTER_INACTIVE`, and nothing created. Replaced by AUZ-14 and API-03.
- **L2 API-40** (`reference-data.api.test.ts`), all three cases of the `GET /dev-requesters` block. Replaced by AUZ-04.

The header-only `post()` helper and the inactive-Requester fixture in
`create-ticket.api.test.ts` went with them. No other Lab 2 test was removed.

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

To be completed by #48 from `main`, in the L2 §6 format: suite, command, tests,
passed, failed, and skipped, with every skip declared and justified.

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
