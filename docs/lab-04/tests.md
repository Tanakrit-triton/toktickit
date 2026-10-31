# Lab 4 Test Plan and Traceability

**Project:** TokTickIT — Actions Taken, Dashboards, and Final Regression
**Companion documents:** `specification.md` (AC-01 … AC-40), `api-spec.md`, `ui-spec.md`, `docs/lab-03/tests.md`
**Status:** Planned — written before implementation (Test DD). The Final column is filled from `main` in #75.

**This document is the scope of record for Issues #70 to #75.** Section 3
lists, for each Issue, the tests it delivers.

---

## 1. Test Strategy

The Lab 2 and Lab 3 strategy carries over unchanged (L3 tests §1):
- tests are planned from the ACs, one behaviour per test;
- `data-testid` hooks only, never CSS classes;
- real sessions through `loginAs()` in API tests;
- table-driven authorization;
- Ticket Events verified in the database;
- every screen is opened in a real browser before its Issue is reported complete.

### Lab 4 rules

- **TDD order visible in history.** For each Issue, the failing tests are committed alone first, observed to fail for the expected reason, and the implementation follows in a later commit.
- **The server is the authority.** The resolution gate, the version check, and every action rule are proved by API tests that call the endpoints directly, bypassing the UI (handout §4.5).
- **Exhaustive matrices.** The action transition table (4×4 pairs) and the ticket matrix (8×8 pairs) are each proved for every pair by unit test. API tests then prove the wiring with representative pairs.
- **Dashboard values are proved against independent queries.** The test computes each metric with the api-spec §5.3 Prisma query and compares. It never compares the endpoint with itself.
- **Time is controlled.** Window tests fix the clock with `vi.setSystemTime` (unit), or write `updatedAt` / `resolvedAt` directly through Prisma (API), so the boundary is exact.
- **Concurrency is real.** Race tests fire both requests with `Promise.all` against the real database, and repeat 20 times, so a passing result is not luck.

### Levels

| Level | Tool | Lab 4 scope |
|---|---|---|
| Unit | Vitest | Action transitions, action validation, edit policy, gate counting, final ticket matrix, dashboard window, filter parsing |
| Migration / seed | Vitest + Prisma CLI | Migration SQL content, upgrade from a populated Lab 3 database, `resolvedAt` backfill, drift, rollback, seed idempotency and fixtures |
| API | Vitest + Supertest | Every Lab 4 endpoint and change in `api-spec.md`, with real sessions |
| Authorization | Vitest + Supertest | api-spec §8, table-driven |
| Performance smoke | Vitest + Supertest | Dashboard endpoints at 1,000 extra tickets |
| Regression | Existing suites | Lab 1, 2, and 3 server, client, and E2E suites |
| UI component | Vitest + Testing Library | Dashboards, Actions Taken, workflow feedback, navigation, filter chip, with the API mocked |
| UI style | Vitest + Testing Library | Badges, tokens, metric-card focus, leftover-code scan |
| Responsive | Playwright | Lab 4 screens at 1440, 834, and 390 px, with screenshots |
| E2E | Playwright | Full stack through a real browser and database |

### Test data

The Lab 3 test-database setup is unchanged (L3 tests §1): `TEST_DATABASE_URL`,
plus migrate and seed in `global-setup.ts`. The Lab 4 seed (spec §7.5) supplies:

| Fixture | Used by |
|---|---|
| Ticket with zero actions (seeded OPEN) | ACT-01, WF-03 |
| Ticket with several actions, resolution blocked (seeded IN_PROGRESS) | ACT-10, WF-01, E2E-03 |
| Ticket with an outstanding follow-up (seeded WAITING_FOR_REQUESTER) | WF-02 |
| Pimchanok Sonthi (no tickets) | DSR-03, UI-06, E2E-06 |
| Teerapat Boonsri (no open actions) | DSS-03 |
| Arisa Kongkaew (open actions, some on another owner's ticket) | DSS-01, E2E-07 |
| Inactive IT Staff Nattapong Saelim | ACT-03, E2E-02 |

Tests that change state create their own tickets through the API, so they do not
disturb shared fixtures. Exceptions are reset in `afterEach`.

---

## 2. Planned Tests

The Final column reads Planned until #75 records results from `main`.

### 2.1 Unit — `server/tests/lab-04/*.unit.test.ts`

| ID | AC | What it tests | Expected result | File | Final |
|---|---|---|---|---|---|
| UT-01 | AC-07 | Every (from, to) pair of the 4 action statuses against the BR-15 table, including same-status pairs | Exactly the 5 listed pairs are allowed | `action-transitions.unit.test.ts` | Planned |
| UT-02 | AC-05, AC-06 | Field validation boundaries: description 4/5/2000/2001; result required on COMPLETED and CANCELLED; follow-up note 4/5/1000/1001 when flagged and ignored when not; attachment notes 500/501; `actionAt` before ticket creation, now + 30 days ± 1 minute, completed now + 5 minutes ± 1 second | Each boundary accepted or refused as BR-05 to BR-10 state | `action-validation.unit.test.ts` | Planned |
| UT-03 | AC-08 | Edit policy for each action status and field, with and without a status change | PLANNED and IN_PROGRESS: all fields; COMPLETED: only the BR-16 list; CANCELLED: none; a status change from a terminal status is `INVALID_ACTION_TRANSITION`, checked before fields | `action-edit-policy.unit.test.ts` | Planned |
| UT-04 | AC-14, AC-15 | Gate counting over action lists: none, all done, one open, one follow-up on a cancelled action, one follow-up on a completed action | Blockers `{open, followUps}` correct; cancelled follow-ups not counted | `resolution-gate.unit.test.ts` | Planned |
| UT-05 | AC-16 | All 64 (from, to) ticket-status pairs against the spec §5.4 matrix, with the gate flag | Exactly the 18 listed pairs are allowed; the 4 into RESOLVED carry the gate | `ticket-transitions.unit.test.ts` | Planned |
| UT-06 | AC-26 | Window start for clock times 00:00:00, 06:59:59, 07:00:00, and 23:59:59 UTC on a fixed date, and across a month boundary | `from` = 00:00 +07:00 six days before the Bangkok date | `dashboard-window.unit.test.ts` | Planned |
| UT-07 | AC-28 | `status` and `statusGroup` parsing for My Tickets and the Queue: valid, invalid, both together, repeated | Valid accepted; others give a 400 message | `status-group-query.unit.test.ts` | Planned |

### 2.2 Migration and seed — `server/tests/lab-04/`

| ID | AC | What it tests | Expected result | File | Final |
|---|---|---|---|---|---|
| MIG-01 | AC-32 | Migration SQL text | No `DROP TABLE` and no `DROP TYPE`; enum change is `ADD VALUE`; check constraint present | `migration.api.test.ts` | Planned |
| MIG-02 | AC-32 | A Lab 3-populated database upgraded to Lab 4 | Row counts and ids of User, Ticket, Attachment, PublicComment, InternalNote, TicketEvent, and Session unchanged; every ticket has version 0 | `migration.api.test.ts` | Planned |
| MIG-03 | AC-32 | `resolvedAt` backfill: a RESOLVED ticket with a STATUS_CHANGED → RESOLVED event; a CLOSED ticket without one; an OPEN ticket | Event time; `updatedAt`; null | `migration.api.test.ts` | Planned |
| MIG-04 | AC-32 | `prisma migrate diff` from migrations to schema | Empty | `migration.api.test.ts` | Planned |
| MIG-05 | AC-33 | Migrate a scratch schema to Lab 4 and apply `rollback/lab_04_down.sql`; then `prisma migrate diff --from-url` that schema `--to-schema-datamodel` the Lab 3 `schema.prisma` (`git show 1fea5b2:server/prisma/schema.prisma`) | The diff concerns only the `TicketEventType` values `ACTION_CREATED` and `ACTION_UPDATED`; the `lab_04_actions_taken` row is gone from `_prisma_migrations`; `ActionTaken`, `ActionStatus`, `Ticket.version`, and `Ticket.resolvedAt` do not exist (Amendment 2) | `rollback.api.test.ts` | Planned |
| SEED-01 | AC-34 | Seed run twice after editing an action and a ticket version | No duplicates; fixture values restored | `seed.api.test.ts` | Planned |
| SEED-02 | AC-34 | Seed content | Every spec §7.5 fixture exists (zero, one, and several actions; a follow-up; zero-metric users; recent and old `resolvedAt`) | `seed.api.test.ts` | Planned |

### 2.3 API — Actions Taken — `server/tests/lab-04/actions-taken.api.test.ts`

| ID | AC | What it tests | Expected result | Final |
|---|---|---|---|---|
| ACT-01 | AC-01 | IT Staff create a valid action | 201; saved under the path ticket; `createdBy` = caller; `performedBy` = requested user | Planned |
| ACT-02 | AC-02 | Create without performer; create with another IT Staff performer | Performer = caller; then = the other user; ticket `ownerId` unchanged | Planned |
| ACT-03 | AC-03 | Performer inactive, Requester, unknown UUID, malformed — on create and on PATCH | 422 `details.performedById` (malformed: 422); nothing saved | Planned |
| ACT-04 | AC-04 | Body supplies `createdById`, `createdAt`, `id`, `version` | Ignored; server values stored | Planned |
| ACT-05 | AC-05 | Table-driven field boundaries through the API | 422 with the right `details` key; boundary values 201 | Planned |
| ACT-06 | AC-06 | Create COMPLETED without result; PATCH to CANCELLED without result; COMPLETED with `actionAt` now + 10 minutes | 422 `details.result` / `details.actionAt` | Planned |
| ACT-07 | AC-07 | Each of the 5 permitted transitions; COMPLETED → IN_PROGRESS; CANCELLED → PLANNED; create as CANCELLED | 200; 409 `INVALID_ACTION_TRANSITION`; 409 `INVALID_ACTION_TRANSITION`; 422 `details.status` | Planned |
| ACT-08 | AC-08 | On COMPLETED: change performer, edit result; on CANCELLED: edit description | 409 `ACTION_STATE_CONFLICT`; 200; 409 `ACTION_STATE_CONFLICT` | Planned |
| ACT-09 | AC-09 | Create and PATCH while the ticket is NEW, RESOLVED, CLOSED, CANCELLED | 409 `TICKET_STATE_CONFLICT`; nothing saved | Planned |
| ACT-10 | AC-10 | Three actions, two sharing `actionAt`, listed twice | Same order both times, per BR-19 | Planned |
| ACT-11 | AC-11 | Ticket's Requester lists; another Requester lists; Requester POST and PATCH | 200 full list; 404; 403; 403 | Planned |
| ACT-12 | AC-12 | Description `<script>alert(1)</script>\nline 2` | Stored and returned byte-for-byte | Planned |
| ACT-13 | AC-13 | Create, then edit status and result | One `ACTION_CREATED`, one `ACTION_UPDATED` whose `changes` has status from/to and `result: {changed: true}`; ticket version +1 each time; `updatedAt` advanced | Planned |
| ACT-14 | AC-20 | Same `clientRequestId` sent twice in sequence, twice concurrently, and once on another ticket | 201 then 200 with the same id; one row; one event; 422 | Planned |
| ACT-15 | AC-18 | Two PATCHes with the same action `version` | First 200; second 409 `STALE_UPDATE`; action holds the first change | Planned |
| ACT-16 | AC-13 | PATCH with values equal to stored ones, including `status` | 200; no event; versions unchanged | Planned |
| ACT-17 | AC-01 | Administrator creates and edits | Same results as IT Staff | Planned |

### 2.4 API — Ticket workflow — `server/tests/lab-04/ticket-workflow.api.test.ts`

| ID | AC | What it tests | Expected result | Final |
|---|---|---|---|---|
| WF-01 | AC-14 | Resolve a ticket with one IN_PROGRESS action, through the API with the current version | 409 `RESOLUTION_BLOCKED`; message "1 action(s) still open and 0 follow-up(s) outstanding"; status unchanged; no event | Planned |
| WF-02 | AC-14 | Resolve a ticket whose only action is COMPLETED with a follow-up | 409; message counts 0 and 1. After the follow-up is cleared: 200 | Planned |
| WF-03 | AC-15 | Resolve a ticket with no actions; resolve one with all actions done | 200; `resolvedAt` set within 2 s of now | Planned |
| WF-04 | AC-16 | Drive one ticket through every permitted pair, then try 6 refused pairs | Each permitted pair 200; refused 409 `INVALID_STATUS_TRANSITION` | Planned |
| WF-05 | AC-17 | RESOLVED → CLOSED, then CLOSED → REOPENED | `resolvedAt` kept, then null | Planned |
| WF-06 | AC-18 | Two status changes, two owner changes, and two IT Priority changes, each pair with the same version | Second of each pair: 409 `STALE_UPDATE`; nothing changed by it | Planned |
| WF-07 | AC-18 | Owner, IT Priority, and status bodies with no `version` | 422 `details.version` | Planned |
| WF-08 | AC-19 | Resolve and action create fired together, 20 rounds on fresh tickets | Never RESOLVED with an open action; the loser gets `STALE_UPDATE` or `TICKET_STATE_CONFLICT` | Planned |
| WF-09 | AC-22 | Requester indicates "appears resolved" on a blocked ticket; staff then resolve | Status unchanged; resolve still 409 `RESOLUTION_BLOCKED` | Planned |
| WF-10 | AC-23 | History after claim, action create, action complete, and status change; Requester calls history | Events oldest first with actor and payload, `users` map present; 403 | Planned |
| WF-11 | AC-13, AC-24 | Post a Public Comment, then an Internal Note | Ticket `updatedAt` advances after the comment, not after the note | Planned |
| WF-12 | AC-22 | Staff detail of blocked and unblocked tickets | `version`, `actionSummary`, `resolutionBlockers` (object, then null); `availableTransitions` includes RESOLVED in both | Planned |

### 2.5 API — Dashboards

`server/tests/lab-04/requester-dashboard.api.test.ts`

| ID | AC | What it tests | Expected result | Final |
|---|---|---|---|---|
| DSR-01 | AC-25 | Napat Chaiwong's dashboard compared with the api-spec §5.3 queries | Every metric equal | Planned |
| DSR-02 | AC-24 | Siriporn creates and updates a ticket; Napat's dashboard re-read | Napat's values unchanged; every list item has `requesterId` = Napat (checked in the database) | Planned |
| DSR-03 | AC-27 | Pimchanok Sonthi's dashboard | Every count 0; every list `[]` | Planned |
| DSR-04 | AC-26 | Tickets with `updatedAt` at 23:59:59 +07:00 seven days ago and 00:00:00 +07:00 six days ago | Only the second counts in `updatedRecently` | Planned |
| DSR-05 | AC-29 | No session; IT Staff; Administrator | 401; 403; 403 | Planned |
| DSR-06 | AC-28 | Follow `openTickets.link` and `waitingForMe.link` as API queries | `meta.totalItems` equals each card's count | Planned |

`server/tests/lab-04/staff-dashboard.api.test.ts`

| ID | AC | What it tests | Expected result | Final |
|---|---|---|---|---|
| DSS-01 | AC-25 | Arisa Kongkaew's dashboard compared with the §5.3 queries | Every metric equal | Planned |
| DSS-02 | AC-25 | `byStatus` and `activeByItPriority` | 8 and 4 entries in the stated order, zeros included, each equal to its query | Planned |
| DSS-03 | AC-27 | Teerapat Boonsri's dashboard | `myOpenActions` 0 and `[]` | Planned |
| DSS-04 | AC-25 | Open action on a ticket then cancelled | Not counted in `myOpenActions` | Planned |
| DSS-05 | AC-29 | Requester; IT Staff; Administrator | 403; `users` null; `users` equal to counts from the User table | Planned |
| DSS-06 | AC-28 | Follow `unassigned.link`, `ownedByMe.link`, one `byStatus` link | Queue `meta.totalItems` equals each count | Planned |
| DSS-07 | AC-26 | `recentlyUpdated` window boundary, as DSR-04 | Same result | Planned |
| PERF-01 | AC-31 | Seed 1,000 extra tickets with actions; 20 calls to each dashboard endpoint | p95 < 500 ms, logged with machine details | Planned (`dashboard.perf.test.ts`) |

### 2.6 API — Authorization and filters

| ID | AC | What it tests | Expected result | File | Final |
|---|---|---|---|---|---|
| AUZ-01 | AC-11, AC-23, AC-29 | Every api-spec §8 row with no session and with each role | Status exactly as the table states; refused calls change nothing | `authorization.api.test.ts` | Planned |
| AUZ-02 | AC-11 | Role check before lookup: Requester POSTs an action to a nonexistent and to an existing ticket | Identical 403 bodies | `authorization.api.test.ts` | Planned |
| FLT-01 | AC-28 | My Tickets with `status=WAITING_FOR_REQUESTER`, `statusGroup=ACTIVE`, `statusGroup=DONE` | Only matching statuses, only own tickets | `drilldown-filters.api.test.ts` | Planned |
| FLT-02 | AC-28 | Queue with `statusGroup=ACTIVE` combined with `owner=me` | Only Active tickets owned by the caller | `drilldown-filters.api.test.ts` | Planned |
| FLT-03 | AC-28 | `status` and `statusGroup` together; `statusGroup=OPEN` | 400 on both endpoints | `drilldown-filters.api.test.ts` | Planned |

### 2.7 UI component — `client/tests/lab-04/`

| ID | AC | What it tests | Expected result | File | Final |
|---|---|---|---|---|---|
| UI-01 | AC-28 | Staff dashboard renders cards, tables, and lists from a mocked response | Values shown; each card is a link to its `link`; list items link to Ticket Detail | `StaffDashboard.test.tsx` | Planned |
| UI-02 | AC-27 | All-zero response | 0 and empty messages; no blank region | `StaffDashboard.test.tsx` | Planned |
| UI-03 | AC-30 | Pending, 500, and 403 responses | Skeleton with `aria-busy`; error callout with Retry (Retry refetches); forbidden state | `StaffDashboard.test.tsx` | Planned |
| UI-04 | AC-29 | Administrator response with `users`; IT Staff with `users: null` | User accounts card only for the Administrator | `StaffDashboard.test.tsx` | Planned |
| UI-05 | AC-24, AC-28 | Requester dashboard populated | Four cards with accessible names "{Label}: {n}. View list"; three lists | `RequesterDashboard.test.tsx` | Planned |
| UI-06 | AC-27 | Requester all-zero | Empty messages and the "Create a ticket" link | `RequesterDashboard.test.tsx` | Planned |
| UI-07 | AC-30 | Requester pending, 500, 403 | As UI-03 | `RequesterDashboard.test.tsx` | Planned |
| UI-08 | AC-02, AC-10 | Actions list renders in the given order, with "(inactive)" and "Recorded by" | Row order matches; suffix and line shown | `ActionsTaken.test.tsx` | Planned |
| UI-09 | AC-01, AC-20 | Create dialog: default performer is the current user; a double click on Save | Exactly one POST; body has a UUID `clientRequestId`; a retry after failure reuses it | `ActionsTaken.test.tsx` | Planned |
| UI-10 | AC-05 | Ticking follow-up shows the required note field; a 422 response | Field appears with `aria-required`; messages under fields; focus on the first error; input kept | `ActionsTaken.test.tsx` | Planned |
| UI-11 | AC-07, AC-08 | Edit dialog for PLANNED, IN_PROGRESS, COMPLETED, CANCELLED | Status options limited to BR-15 targets; COMPLETED shows status and performer read-only; CANCELLED has no Edit button | `ActionsTaken.test.tsx` | Planned |
| UI-12 | AC-21 | Save returns 409 `STALE_UPDATE` | Conflict callout in the dialog; input kept; Reload ticket refetches | `ActionsTaken.test.tsx` | Planned |
| UI-13 | AC-11 | Requester detail with actions | Title "Work done on your ticket"; no Record or Edit buttons | `ActionsTaken.test.tsx` | Planned |
| UI-14 | AC-12 | Description and result with `<script>` and newlines | Literal text; line breaks preserved | `ActionsTaken.test.tsx` | Planned |
| UI-15 | AC-09 | Staff view for NEW and RESOLVED tickets | Record button replaced by the locked message | `ActionsTaken.test.tsx` | Planned |
| UI-16 | AC-22 | Detail with `resolutionBlockers` | Resolve disabled; reason text linked by `aria-describedby`; "Go to Actions Taken" link | `TicketWorkflow.test.tsx` | Planned |
| UI-17 | AC-14 | Resolve returns 409 `RESOLUTION_BLOCKED` | Conflict callout with the server message; detail refetched | `TicketWorkflow.test.tsx` | Planned |
| UI-18 | AC-18, AC-21 | Status, owner, and IT Priority requests; a reopen returning `STALE_UPDATE` | Each body carries the detail's `version`; Reload shown; reopen reason kept in the dialog | `TicketWorkflow.test.tsx` | Planned |
| UI-19 | AC-23 | History tab | Sentences oldest first; "System" for a null actor; arrow keys move between the three tabs | `TicketWorkflow.test.tsx` | Planned |
| UI-20 | AC-29 | Shell for each role | Dashboard nav first, with the right route; `aria-current` on the active item | `navigation.test.tsx` | Planned |
| UI-21 | AC-28 | My Tickets and Queue opened with `?statusGroup=ACTIVE` | Chip "Showing: Open tickets"; Clear removes the parameter and refetches | `DrilldownFilter.test.tsx` | Planned |

### 2.8 UI style — `client/tests/lab-04/theme.style.test.tsx`

| ID | AC | What it tests | Expected result | Final |
|---|---|---|---|---|
| STY-01 | AC-38 | Action status badges and follow-up indicator | Glyph and text present; computed colours equal ui-spec §4.3 tokens | Planned |
| STY-02 | AC-38, AC-39 | Metric card idle and focused | Token colours; focus border `--zg-primary` 2px | Planned |
| STY-03 | AC-38 | Every computed colour on the Lab 4 screens | All in the token table | Planned |
| STY-04 | AC-40 | Static scan of `client/src` | No `console.log`, "TODO", "lorem", or "coming soon"; no hex colour outside the token file | Planned |

### 2.9 Responsive and accessibility — `e2e/lab-04/responsive.spec.ts`

| ID | AC | What it tests | Expected result | Final |
|---|---|---|---|---|
| RSP-01 | AC-37 | Both dashboards at 1440, 834, and 390 px | `scrollWidth <= clientWidth`; no overlapping metric cards; screenshots saved | Planned |
| RSP-02 | AC-37 | Staff Ticket Detail with 4 actions at three widths | Table at desktop and tablet, cards at mobile; no overflow | Planned |
| RSP-03 | AC-37 | Requester Ticket Detail with actions at three widths | No overflow; read-only | Planned |
| RSP-04 | AC-37 | Action dialog at 390 px | Fully visible; actions stacked | Planned |
| RSP-05 | AC-39 | Keyboard-only: Tab through both dashboards and the action dialog | Every control reached; visible focus ring; dialog traps focus and returns it to the opener | Planned |

### 2.10 End-to-end — `e2e/lab-04/`

| ID | AC | What it tests | Expected result | File | Final |
|---|---|---|---|---|---|
| E2E-01 | AC-01, AC-02, AC-11 | Wichai records an action performed by Arisa, Arisa completes it with a result, Wichai edits attachment notes; the Requester signs in | Action shows the right people and status; Requester sees it read-only | `actions-taken-flow.spec.ts` | Planned |
| E2E-02 | AC-03 | The dialog is opened with a performer selected; that performer is deactivated through the API; Save is pressed | Message under Performed by; nothing saved | `actions-taken-flow.spec.ts` | Planned |
| E2E-03 | AC-14, AC-15, AC-22 | Blocked ticket: Resolve disabled with reason; complete the open actions, clear the follow-up; resolve; close | Resolve enables only when clear; "Resolved on" shown; Close works | `ticket-resolution.spec.ts` | Planned |
| E2E-04 | AC-18, AC-21 | Two browser contexts open one ticket; A changes IT Priority; B resolves | B sees the conflict with Reload; after reload B's screen shows A's change | `ticket-resolution.spec.ts` | Planned |
| E2E-05 | AC-23 | History tab after E2E-03; Requester view of the same ticket | Entries oldest first; no History tab or Internal Notes for the Requester | `ticket-resolution.spec.ts` | Planned |
| E2E-06 | AC-24, AC-28 | Napat opens the dashboard and clicks "Waiting for you"; Pimchanok opens hers | Filtered My Tickets with the chip, row count equal to the card; all zeros for Pimchanok | `dashboards.spec.ts` | Planned |
| E2E-07 | AC-28 | Arisa opens the dashboard, follows "Owned by me", then an item in "My open actions" | Queue filtered with the matching count; Ticket Detail opens scrolled to `#actions` | `dashboards.spec.ts` | Planned |
| E2E-08 | AC-40 | For each role, visit every navigation item and dashboard link | No console error or warning; no not-found screen | `dashboards.spec.ts` | Planned |
| E2E-09 | AC-36 | Representative regression per role: Requester creates a ticket, uploads, downloads, comments; IT Staff claims, assigns, adds a note, transitions; Administrator creates and deactivates a user | Each step succeeds | `regression.spec.ts` | Planned |

### 2.11 Regression — existing suites

| ID | AC | What it runs | Expected result | Final |
|---|---|---|---|---|
| REG-01 | AC-35 | `server/tests/lab-01`, `lab-02`, `lab-03` | All pass, with the Section 4 updates | Planned |
| REG-02 | AC-35 | `client/tests/lab-01`, `lab-02`, `lab-03` | All pass, with the Section 4 updates | Planned |
| REG-03 | AC-35, AC-36 | `e2e/lab-02`, `e2e/lab-03` | All pass | Planned |

---

## 3. Scope per Issue

All Issues branch from and target `lab4-staging`. There is no stacked chain in
Lab 4: each Issue starts after the one it depends on has merged, so no PR is
retargeted and no conflict is resolved repeatedly.

| Issue | Title | Depends on | ACs | Tests |
|---|---|---|---|---|
| #69 | Sprint 4 engineering contract | — | — | — (this document) |
| #70 | Actions Taken and workflow foundation: migration, seed, actions API, version, gate, history, filters | #69 | AC-01–AC-20, AC-22 (API), AC-23 (API), AC-28 (filters), AC-32–AC-34 | UT-01–05, UT-07, MIG-01–05, SEED-01–02, ACT-01–17, WF-01–12, AUZ-01–02, FLT-01–03 (46) |
| #71 | Dashboard API | #70 | AC-24–AC-29, AC-31 | UT-06, DSR-01–06, DSS-01–07, PERF-01 (15) |
| #72 | Actions Taken and workflow UI | #70 | AC-01, AC-02, AC-05, AC-07–AC-12, AC-14, AC-18, AC-20–AC-23, AC-38 | UI-08–19, STY-01 (13) |
| #73 | Dashboards UI, navigation, and drill-down filters | #71 | AC-24, AC-27–AC-30, AC-38, AC-39 | UI-01–07, UI-20, UI-21, STY-02 (10) |
| #74 | Final hardening: E2E, responsive, accessibility, regression, polish | #72, #73 | AC-03, AC-11, AC-14, AC-15, AC-18, AC-21–AC-24, AC-28, AC-35–AC-40 | STY-03, STY-04, RSP-01–05, E2E-01–09, REG-01–03 (19) |
| #75 | Release: reviewer.md, ai-use.md, final results, `lab4-staging` → `main` | #74 | — | Runs every suite on `main` and fills Section 8 |

**Boundaries.**
- **#70** owns every file that later Issues would otherwise both touch: `schema.prisma`, the migration, `seed-lib.ts`, `server/src/app.ts` route registration (dashboard routes registered as `501` stubs), and the Lab 3 test updates in Section 4. This is what removes repeated merge conflicts.
- **#72** adds `version` to the client's owner, IT Priority, and status calls in the same PR that adds the workflow UI, so Staff Detail is never broken on `lab4-staging`. Between #70 and #72 merging, those three UI controls return 422 on `lab4-staging`. That is acceptable because `lab4-staging` is not released until #75.
- **#73** owns `AppRoutes.tsx` and the navigation. #72 does not touch them.

---

## 4. Lab 3 test continuity

No Lab 1–3 test is deleted. Lab 4 changes the request contract of three Lab 3
endpoints (api-spec §3.2), so the tests that call them are **updated**, not
superseded. Their assertions about behaviour stay the same.

| Lab 3 test location | Change in #70 or #72 | Behaviour asserted |
|---|---|---|
| `server/tests/lab-03/staff-ticket-detail.api.test.ts` (OPS tests calling `/owner`, `/it-priority`, `/status`) | Each call first reads `version` from the detail, or uses a helper `withVersion(agent, ticketId, body)` | Unchanged |
| `client/tests/lab-03/StaffTicketDetail.test.tsx` (assertions on request bodies) | #70 (Amendment 4): expected bodies include `version` | Unchanged |
| `e2e/lab-03/capture.ts`, `e2e/lab-03/responsive.spec.ts` (direct API setup calls) | #70 (Amendment 4): setup calls send `version` | Unchanged |
| `server/tests/lab-03/seed.api.test.ts` | Checked in #70. Lab 3 fixtures are unchanged, so no edit is expected. Any edit is recorded here. | Unchanged |
| `server/tests/lab-03/migration.api.test.ts` | `lab3Migration()` filter bounded by `LAB3_LAST`, so the Lab 4 migration is not counted as a Lab 3 one. Edited: MIG-01 to MIG-04 (via the helper). Its drift check now runs against the Lab 4 schema. | Unchanged |

#70 records the final list of edited test names in this table before it merges.

---

## 5. Acceptance-criterion traceability

Every AC maps to at least one test. Status is filled in #75.

| AC | Tests | Status |
|---|---|---|
| AC-01 | ACT-01, ACT-17, UI-09, E2E-01 | Planned |
| AC-02 | ACT-02, UI-08, E2E-01 | Planned |
| AC-03 | ACT-03, E2E-02 | Planned |
| AC-04 | ACT-04 | Planned |
| AC-05 | UT-02, ACT-05, UI-10 | Planned |
| AC-06 | UT-02, ACT-06 | Planned |
| AC-07 | UT-01, ACT-07, UI-11 | Planned |
| AC-08 | UT-03, ACT-08, UI-11 | Planned |
| AC-09 | ACT-09, UI-15 | Planned |
| AC-10 | ACT-10, UI-08 | Planned |
| AC-11 | ACT-11, AUZ-01, AUZ-02, UI-13, E2E-01 | Planned |
| AC-12 | ACT-12, UI-14 | Planned |
| AC-13 | ACT-13, ACT-16, WF-11 | Planned |
| AC-14 | UT-04, WF-01, WF-02, UI-17, E2E-03 | Planned |
| AC-15 | UT-04, WF-03, E2E-03 | Planned |
| AC-16 | UT-05, WF-04 | Planned |
| AC-17 | WF-05 | Planned |
| AC-18 | ACT-15, WF-06, WF-07, UI-18, E2E-04 | Planned |
| AC-19 | WF-08 | Planned |
| AC-20 | ACT-14, UI-09 | Planned |
| AC-21 | UI-12, UI-18, E2E-04 | Planned |
| AC-22 | WF-09, WF-12, UI-16, E2E-03 | Planned |
| AC-23 | WF-10, AUZ-01, UI-19, E2E-05 | Planned |
| AC-24 | DSR-02, WF-11, UI-05, E2E-06 | Planned |
| AC-25 | DSR-01, DSS-01, DSS-02, DSS-04 | Planned |
| AC-26 | UT-06, DSR-04, DSS-07 | Planned |
| AC-27 | DSR-03, DSS-03, UI-02, UI-06 | Planned |
| AC-28 | UT-07, DSR-06, DSS-06, FLT-01–03, UI-01, UI-05, UI-21, E2E-06, E2E-07 | Planned |
| AC-29 | DSR-05, DSS-05, AUZ-01, UI-04, UI-20 | Planned |
| AC-30 | UI-03, UI-07 | Planned |
| AC-31 | PERF-01 | Planned |
| AC-32 | MIG-01–04 | Planned |
| AC-33 | MIG-05 | Planned |
| AC-34 | SEED-01, SEED-02 | Planned |
| AC-35 | REG-01, REG-02, REG-03 | Planned |
| AC-36 | E2E-09, REG-03 | Planned |
| AC-37 | RSP-01–04 | Planned |
| AC-38 | STY-01, STY-02, STY-03 | Planned |
| AC-39 | STY-02, RSP-05 | Planned |
| AC-40 | STY-04, E2E-08 | Planned |

---

## 6. Visual and accessibility checklist

Filled in #74 from the `ui-spec.md` §11 screenshots. ✓ = verified at that width.
L2 rows 1–21 and L3 rows 23–31 are re-checked on the regression screenshots.

| # | Check (ui-spec §12) | Desktop | Tablet | Mobile | Evidence |
|---|---|---|---|---|---|
| 32 | Dashboard nav present and active | | | | |
| 33 | Metric cards: label, value, "View list" | | | | |
| 34 | Zero metrics show 0 and a message | | | | |
| 35 | Action and follow-up badges: glyph and text | | | | |
| 36 | Read-only fields look read-only | | | | |
| 37 | Validation under fields in the action dialog | | | | |
| 38 | Disabled Resolve shows its reason | | | | |
| 39 | Visible focus on cards, rows, toggles, dialogs | | | | |
| 40 | No clipping or overlap in actions table and cards | | | | |
| 41 | No horizontal scrolling at 390 px | | | | |
| 42 | No private content on Requester screens | | | | |
| 43 | No placeholder text, console errors, obsolete controls | | | | |

---

## 7. Test commands

Run from the repository root unless stated.

```bash
# One-time
npm install && (cd server && npm install) && (cd client && npm install)
npm run test:e2e:install

# Back up before migrating a database with data you care about (DEC-08)
pg_dump -Fc "$DATABASE_URL" > backup-before-lab4.dump

# Database
cd server
npx prisma migrate deploy
npm run prisma:seed

# Unit, migration, API, performance smoke, and Lab 1–3 server regression
cd server && npm test

# UI component and style, Lab 1–4
cd client && npm test

# Responsive and E2E (server on :3000, client on :5173)
npm run test:e2e

# Rollback rehearsal on a scratch database only
psql "$SCRATCH_DATABASE_URL" -f server/prisma/rollback/lab_04_down.sql
```

| Suite | Config | Collected from |
|---|---|---|
| Unit, migration, API, perf | `server/vitest.config.ts` | `server/tests/**/*.test.ts` |
| UI component and style | `client/vite.config.ts` | `client/tests/**/*.test.{ts,tsx}` |
| Responsive and E2E | `playwright.config.ts` | `e2e/**` |

Screenshots are written to `artifacts/lab-04/screenshots/` by
`e2e/lab-04/responsive.spec.ts`.

---

## 8. Final results

Filled in #75 from a clean checkout of `main`.

| Suite | Files | Tests | Passed | Failed | Skipped | Commit |
|---|---|---|---|---|---|---|
| Server (unit, migration, API, perf) | | | | | | |
| Client (component, style) | | | | | | |
| E2E and responsive | | | | | | |
| PERF-01 p95 (ms), machine | | | | | | |

---

## 9. Known limitations and deferred tests

- **Ticket creation is not idempotent across a network retry** (L3-DEC-17 still holds). The busy state prevents double clicks. A retry after a lost response could create a duplicate ticket. This is not tested, because no protection exists to test.
- **PERF-01 is a smoke test on one development machine**, not a load test. It catches an accidental N+1 query, not production capacity.
- **Two new `TicketEventType` values survive rollback** (spec §7.4). MIG-05 proves they are the only difference between a rolled-back database and the Lab 3 schema. It compares schemas rather than running the Lab 3 suite, because that would need a second install of the Lab 3 dependencies (Amendment 2).
