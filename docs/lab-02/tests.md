# Lab 2 Test Plan and Results

**Project:** TokTickIT — Requester Ticketing MVP
**Companion documents:** `specification.md` (FR/BR/AC), `api-spec.md` (contract), `ui-spec.md` (UI)
**Status:** Draft for approval — written from the specification **before** implementation, not reconstructed from generated tests

---

## 1. Test Strategy

Tests are planned from the Acceptance Criteria in `specification.md`, not from the code. Each planned test names its Test ID, the criterion it proves, the expected result, and the file it will live in. Implementation follows TDD: the test is written and observed to fail for the expected reason, the smallest correct behaviour is implemented, then the code is refactored with the test staying green.

### Levels

| Level | Tool | Scope | Why this level |
|---|---|---|---|
| Unit | Vitest | Pure functions: ticket-number generation, validators, comparators, error builder | Fast, exhaustive on boundary values without database or HTTP cost |
| API | Vitest + Supertest | Express routes against a migrated, seeded test database | Proves the contract in `api-spec.md`, including ownership and status codes, which is where the security-relevant behaviour lives |
| UI component | Vitest + Testing Library | Individual React screens with the API module mocked | Proves state handling — loading, validation, busy, success, failure — without needing a running backend |
| UI style | Vitest + Testing Library | Computed styles, ARIA attributes, required markers, badge content | `ui-spec.md` is binding; without assertions it is only a suggestion |
| Responsive | Playwright | Three viewport widths with screenshot capture | Layout defects are invisible to DOM assertions |
| E2E | Playwright | Full stack through a real browser and real database | Proves the flows a Requester actually performs, end to end |

### Principles

- One behaviour per test. Arrange, Act, Assert.
- Test observable behaviour, never internal implementation.
- Every ownership-protected endpoint has a **negative** test proving cross-Requester access is refused. A passing happy path is not evidence of ownership enforcement.
- UI assertions target `data-testid`, never CSS class names, so styling can be refactored without breaking tests.
- No test is skipped, disabled, or commented out in the delivered branch.

### Test data

API and E2E tests run against a dedicated test database, migrated and seeded before each suite. The seed provides four active Development Requesters and one inactive Requester — the inactive record is the fixture for AC-01 and BR-13, and the second active Requester is the fixture for every cross-Requester negative test.

---

## 2. Planned Tests

`Final` is completed after implementation.

### 2.1 Unit — `server/tests/lab-02/*.unit.test.ts`

| Test ID | Type | Req / AC | What it tests | Expected result | Test file | Final |
|---|---|---|---|---|---|---|
| UT-01 | Unit | AC-09, BR-04 | Ticket number format | Matches `TKT-YYYY-NNNNN` for the current year | `ticket-number.unit.test.ts` | |
| UT-02 | API | AC-10 | Sequence increments | Two consecutive allocations differ by one | `ticket-number.api.test.ts` | |
| UT-03 | API | BR-04 | Annual reset | The first allocation of a year starts at 1, leaving the previous year untouched | `ticket-number.api.test.ts` | |
| UT-04 | Unit | AC-13, BR-19 | Summary lower bound | 9 characters after trimming is rejected; 10 is accepted | `validation.unit.test.ts` | |
| UT-05 | Unit | BR-19 | Summary upper bound | 150 accepted, 151 rejected | `validation.unit.test.ts` | |
| UT-06 | Unit | BR-20 | Description bounds | 19 rejected, 20 accepted, 5000 accepted, 5001 rejected | `validation.unit.test.ts` | |
| UT-07 | Unit | BR-23 | Priority enum | Only `LOW`, `MEDIUM`, `HIGH`, `URGENT` accepted | `validation.unit.test.ts` | |
| UT-08 | Unit | AC-34, BR-36 | Removal reason bounds | 4 rejected, 5 accepted, 200 accepted, 201 rejected | `validation.unit.test.ts` | |
| UT-09 | Unit | AC-31, BR-30 | Permitted file types | JPG, JPEG, PNG, WEBP, PDF accepted | `attachment-policy.unit.test.ts` | |
| UT-10 | Unit | AC-31, BR-30 | Type mismatch | Extension and declared MIME type disagreeing is rejected | `attachment-policy.unit.test.ts` | |
| UT-11 | Unit | AC-30, BR-31 | Size limit | 5 MB accepted, 5 MB + 1 byte rejected | `attachment-policy.unit.test.ts` | |
| UT-12 | Unit | BR-34 | Safe filename | Stored name is a UUID plus validated extension; a client name containing `../` never reaches the path | `attachment-policy.unit.test.ts` | |
| UT-13 | Unit | AC-21, BR-44 | Priority ordering | Comparator orders LOW < MEDIUM < HIGH < URGENT, not alphabetically | `sorting.unit.test.ts` | |
| UT-14 | Unit | BR-29 | Error shape | Builder emits `{ error: { code, message, details? } }` and nothing else | `error-shape.unit.test.ts` | |
| UT-15 | Unit | BR-47 | Unknown parameter | An unlisted query parameter is rejected, not ignored | `query-params.unit.test.ts` | |
| UT-16 | Unit | AC-23, BR-46 | Page size | Only 10, 20, 50 accepted; 25 rejected rather than defaulted | `query-params.unit.test.ts` | |

### 2.2 API — `server/tests/lab-02/`

| Test ID | Type | Req / AC | What it tests | Expected result | Test file | Final |
|---|---|---|---|---|---|---|
| API-01 | API | AC-07, AC-09 | Create valid ticket | 201; one saved Ticket; `ticketNumber` returned | `create-ticket.api.test.ts` | |
| API-02 | API | AC-08 | Ownership and default status | Saved `requesterId` matches header; `currentStatus` is `NEW` | `create-ticket.api.test.ts` | |
| API-03 | API | AC-10 | Ticket number uniqueness | Two creations produce different numbers | `create-ticket.api.test.ts` | |
| API-04 | API | AC-12, AC-13 | Missing / short summary | 422 with `details.summary` populated | `create-ticket.api.test.ts` | |
| API-05 | API | AC-14 | Multiple invalid fields | 422 reporting every failing field in one response | `create-ticket.api.test.ts` | |
| API-06 | API | BR-08 | Body `requesterId` ignored | Ticket is owned by the header Requester, not the body value | `create-ticket.api.test.ts` | |
| API-07 | API | BR-22 | Inactive reference data | Inactive `categoryId` is rejected with 422 | `create-ticket.api.test.ts` | |
| API-08 | API | BR-11 | Missing header | Scoped request without `X-Dev-Requester-Id` returns 428 | `create-ticket.api.test.ts` | |
| API-09 | API | BR-13 | Inactive Requester | Header naming an inactive Requester returns 403 | `create-ticket.api.test.ts` | |
| API-38 | API | AC-11 | Active Categories | Only active Categories returned; inactive absent | `reference-data.api.test.ts` | |
| API-39 | API | AC-11 | Active Related Systems | Only active Related Systems returned | `reference-data.api.test.ts` | |
| API-40 | API | AC-01, BR-10 | Active Requesters | Seeded inactive Requester is absent from the response | `reference-data.api.test.ts` | |
| API-41 | API | BR-05 | **Concurrent allocation** | Eight parallel creations all succeed, with distinct numbers forming an unbroken run and the sequence row ending at the highest | `create-ticket.api.test.ts` | |
| API-42 | API | FR-18 | Related System filter | Only Tickets on the filtered Related System are returned, and a system no Ticket uses returns none | `my-tickets.api.test.ts` | |
| API-10 | API | AC-18 | Requester scoping | Only the header Requester's Tickets are returned | `my-tickets.api.test.ts` | |
| API-11 | API | AC-19 | Search by summary | Only matching Tickets returned, case-insensitive | `my-tickets.api.test.ts` | |
| API-12 | API | BR-45 | Search by ticket number | Partial ticket-number match returns the Ticket | `my-tickets.api.test.ts` | |
| API-13 | API | AC-20 | Category filter | Only Tickets in the filtered Category returned | `my-tickets.api.test.ts` | |
| API-14 | API | AC-21 | Priority sort | URGENT precedes HIGH, MEDIUM, LOW on descending sort | `my-tickets.api.test.ts` | |
| API-15 | API | AC-22 | Pagination | Page 2 returns the next set; `meta` totals are correct | `my-tickets.api.test.ts` | |
| API-16 | API | AC-23 | Invalid page size | `pageSize=25` returns 400, not a defaulted page | `my-tickets.api.test.ts` | |
| API-17 | API | BR-47 | Unknown parameter | Unlisted query parameter returns 400 | `my-tickets.api.test.ts` | |
| API-18 | API | BR-48 | Page past the end | Empty `data` with correct `meta`, not an error | `my-tickets.api.test.ts` | |
| API-19 | API | BR-43 | Stable ordering | Default sort is creation time descending with a stable secondary key across pages | `my-tickets.api.test.ts` | |
| API-20 | API | AC-26 | Owned detail | 200 with the full Ticket payload and its attachments | `ticket-detail.api.test.ts` | |
| API-21 | API | AC-27 | **Cross-Requester detail** | Requester B requesting Requester A's Ticket receives 404 with a body identical to a genuine miss | `ticket-detail.api.test.ts` | |
| API-22 | API | AC-27 | Non-existent Ticket | 404 with the same body as API-21 | `ticket-detail.api.test.ts` | |
| API-23 | API | api-spec 3.3 | Malformed identifier | Malformed UUID returns 400, not 500 | `ticket-detail.api.test.ts` | |
| API-24 | API | AC-28 | Upload permitted file | 201; attachment appears as `ACTIVE` | `attachments.api.test.ts` | |
| API-25 | API | AC-29 | Attachment limit | Sixth active attachment returns 409 `ATTACHMENT_LIMIT_REACHED` | `attachments.api.test.ts` | |
| API-26 | API | AC-30 | Oversized upload | File above 5 MB returns 413 | `attachments.api.test.ts` | |
| API-27 | API | AC-31 | Unsupported type | `.exe` returns 415 | `attachments.api.test.ts` | |
| API-28 | API | AC-32 | Download active | 200 with the original filename in `Content-Disposition` | `attachments.api.test.ts` | |
| API-29 | API | AC-33 | Soft removal | 200; status becomes `REMOVED`; the row is retained with reason and timestamp | `attachments.api.test.ts` | |
| API-30 | API | AC-34 | Removal without reason | 422 | `attachments.api.test.ts` | |
| API-31 | API | AC-36 | Removed download blocked | Download of a removed attachment returns 410 | `attachments.api.test.ts` | |
| API-32 | API | AC-35 | Removed metadata retained | Removed attachment still listed with filename, size, reason, and timestamp | `attachments.api.test.ts` | |
| API-33 | API | AC-37 | **Cross-Requester download** | Requester B downloading Requester A's attachment receives 404 | `attachments.api.test.ts` | |
| API-34 | API | AC-37 | **Cross-Requester removal** | Requester B removing Requester A's attachment receives 404 and the attachment stays active | `attachments.api.test.ts` | |
| API-35 | API | api-spec 4.4 | Double removal | Removing an already-removed attachment returns 409 | `attachments.api.test.ts` | |
| API-36 | API | BR-32 | Removed frees a slot | After removing one of five, a new upload succeeds | `attachments.api.test.ts` | |
| API-37 | API | BR-28 | No internal leakage | `storedFilename` and file paths appear in no response body | `attachments.api.test.ts` | |

### 2.3 UI component — `client/tests/lab-02/`

| Test ID | Type | Req / AC | What it tests | Expected result | Test file | Final |
|---|---|---|---|---|---|---|
| UI-01 | UI | AC-01 | Selector contents | Active Requesters listed; inactive one absent | `RequesterSelection.test.tsx` | |
| UI-02 | UI | FR-33 | Selector loading | Loading state shown; Continue disabled | `RequesterSelection.test.tsx` | |
| UI-03 | UI | AC-06 | No active Requesters | Empty state shown; Continue not offered | `RequesterSelection.test.tsx` | |
| UI-04 | UI | AC-05 | Selector API failure | Safe message plus Retry; no stack trace or status code rendered | `RequesterSelection.test.tsx` | |
| UI-05 | UI | FR-02 | Continue gating | Continue disabled until a Requester is chosen | `RequesterSelection.test.tsx` | |
| UI-06 | UI | AC-03 | Shell identity | Selected Requester name and Change Requester action are shown | `AppShell.test.tsx` | |
| UI-07 | UI | AC-02 | Guard | Opening My Tickets with no selection renders the Selection screen | `AppShell.test.tsx` | |
| UI-08 | UI | BR-03 | Development notice | The "this is not a login" notice is present | `AppShell.test.tsx` | |
| UI-09 | UI | AC-04 | Requester switch | Changing Requester clears cached data and refetches | `AppShell.test.tsx` | |
| UI-10 | UI | AC-11 | Reference data source | Category and Related System options come from the API; no hard-coded array exists in the component | `CreateTicket.test.tsx` | |
| UI-11 | UI | AC-12 | Client validation | Empty Summary shows a message beside the field and sends no create request | `CreateTicket.test.tsx` | |
| UI-12 | UI | AC-14 | Message placement | Each failing field renders its own message adjacent to it | `CreateTicket.test.tsx` | |
| UI-13 | UI | AC-15 | Duplicate submission | Submit disables during flight; a second activation issues no second request | `CreateTicket.test.tsx` | |
| UI-14 | UI | AC-16 | Failure retains input | After a failed submission every entered value is still present | `CreateTicket.test.tsx` | |
| UI-15 | UI | AC-07 | Success panel | Ticket Number and a next action are displayed | `CreateTicket.test.tsx` | |
| UI-16 | UI | AC-38 | Partial success | Ticket retained; failed attachments named; retry direction shown | `CreateTicket.test.tsx` | |
| UI-17 | UI | AC-28 | Upload after creation | A permitted file uploaded from Ticket Detail appears as active | `AttachmentSection.test.tsx` | |
| UI-18 | UI | AC-29 | Limit in UI | At five active attachments the drop zone is disabled with a message | `AttachmentSection.test.tsx` | |
| UI-19 | UI | AC-35 | Removed presentation | Removed attachment shows metadata and reason, with no Download control | `AttachmentSection.test.tsx` | |
| UI-20 | UI | BR-37 | Removal confirmation | Remove opens a modal; no request is sent before confirmation | `AttachmentSection.test.tsx` | |
| UI-21 | UI | AC-34 | Reason required | Confirming with an empty reason is blocked with a field message | `AttachmentSection.test.tsx` | |
| UI-22 | UI | AC-24 | Empty state | "not created any tickets yet" plus a Create Ticket action | `MyTickets.test.tsx` | |
| UI-23 | UI | AC-25 | No-results state | "No tickets match" plus a Clear Filters action | `MyTickets.test.tsx` | |
| UI-24 | UI | AC-25 | States are distinct | Empty and no-results differ in both wording and offered action, asserted by comparing the two rendered states | `MyTickets.test.tsx` | |
| UI-25 | UI | FR-21 | Clear Filters | Resets search, filters, and sort to defaults and refetches | `MyTickets.test.tsx` | |
| UI-26 | UI | FR-33 | List loading | Loading state rendered while the request is in flight | `MyTickets.test.tsx` | |
| UI-27 | UI | AC-26 | Read-only detail | No input, textarea, or edit control is present in the ticket region | `RequesterTicketDetail.test.tsx` | |
| UI-28 | UI | Scope §3 | Exclusion guard | No comment box, internal note, Actions Taken, or status control is rendered | `RequesterTicketDetail.test.tsx` | |
| UI-29 | UI | AC-02 | **Route guard is installed** | Opening `/tickets` or `/tickets/new` with no selection renders the Selection screen; `/` redirects to `/tickets`; `/lab-01` renders outside the shell | `routing.test.tsx` | |
| UI-30 | UI | AC-17 | **Selection validation** | A permitted file is accepted; an impermissible type and an oversized file are each rejected with a reason, and stay visible | `CreateTicket.test.tsx` | |
| UI-31 | UI | A-06 | ~~Attachment constraint~~ | **Retired with A-06 by #18.** Create Ticket offers selection again, so the constraint this asserted no longer exists. | removed | n/a |
| UI-32 | UI | AC-40 | **Mobile card layout** | Below 768px the screen renders cards and no table; at desktop width the table and no cards | `MyTickets.test.tsx` | |
| UI-33 | UI | FR-20 | Page size selector | Choosing a page size requests it and returns to page 1; exactly 10, 20 and 50 are offered | `MyTickets.test.tsx` | |

UI-07 and UI-29 are deliberately not redundant. UI-07 renders `AppShell`
directly and proves the guard **mechanism**: the shell replaces its children
with the Selection screen when no Requester is selected. UI-29 renders the real
route tree and proves the guard is **installed**. UI-07 passed for an entire
issue while `AppShell` was never mounted by the application at all, so the
mechanism was correct and unreachable at the same time.

### 2.4 UI style — `client/tests/lab-02/theme.style.test.tsx`

| Test ID | Type | Req / AC | What it tests | Expected result | Test file | Final |
|---|---|---|---|---|---|---|
| STY-01 | UI style | AC-41 | Required marker | Every required field's label carries a red asterisk | `theme.style.test.tsx` | |
| STY-02 | UI style | AC-41 | Message position | Validation message is the next sibling of its field, not only a top summary | `theme.style.test.tsx` | |
| STY-03 | UI style | ui-spec §2 | Editable vs read-only | Read-only fields use the read-only background and differ from editable fields | `theme.style.test.tsx` | |
| STY-04 | UI style | ui-spec §2 | Disabled vs read-only | Disabled controls are visually distinct from read-only fields and cannot be focused | `theme.style.test.tsx` | |
| STY-05 | UI style | AC-15 | Busy state | Submit carries `aria-busy="true"` and `disabled` while in flight | `theme.style.test.tsx` | |
| STY-06 | UI style | ui-spec §3 | Button hierarchy | Exactly one primary button per screen | `theme.style.test.tsx` | |
| STY-07 | UI style | ui-spec §3 | Visible text | No button relies on an icon alone; icon-only controls carry `aria-label` | `theme.style.test.tsx` | |
| STY-08 | UI style | AC-43 | Priority badge | Renders the priority as text plus glyph, not colour alone | `theme.style.test.tsx` | |
| STY-09 | UI style | AC-43 | Status badge | Renders "New" as text | `theme.style.test.tsx` | |
| STY-10 | UI style | AC-42 | Focus visible | Focused controls expose a visible focus indicator | `theme.style.test.tsx` | |
| STY-11 | UI style | AC-44 | Token conformance | Every computed colour on the rendered screens appears in the `ui-spec.md` token table | `theme.style.test.tsx` | |
| STY-12 | UI style | AC-42 | Keyboard reach | Tab order reaches every interactive control in visual order | `theme.style.test.tsx` | |


**Ownership.** This file has no single owner, because the behaviour it asserts
is delivered by three different issues. Recorded here so no id is orphaned:

| Ids | Delivered by | Notes |
|---|---|---|
| STY-01, STY-02, STY-05 | #16 Create Ticket | Present in `theme.style.test.tsx` on the #16 branch. They passed on arrival: the behaviour shipped with the screen and no test covered it, so they close a gap rather than drive the code. |
| STY-03, STY-04, STY-06, STY-07, STY-10 | #15 shell and theme | Control states, button hierarchy, visible text, and focus visibility are all delivered by the Zen Green foundation. Not yet written. |
| STY-08, STY-09, STY-11, STY-12 | #19 evidence | Badges need My Tickets and Ticket Detail to exist; token conformance and keyboard reach are whole-application assertions. Not yet written. |

The badge assertions STY-08 and STY-09 cannot run until #17 and #18 render a
badge, which is why they sit with #19 rather than with the theme work.

### 2.5 Responsive — `e2e/lab-02/responsive.spec.ts`

| Test ID | Type | Req / AC | What it tests | Expected result | Test file | Final |
|---|---|---|---|---|---|---|
| RSP-01 | Responsive | AC-39 | Desktop 1440×900 | No horizontal page scroll; no clipped or overlapping element on all three screens | `responsive.spec.ts` | |
| RSP-02 | Responsive | AC-39 | Tablet 834×1112 | Same assertions at tablet width | `responsive.spec.ts` | |
| RSP-03 | Responsive | AC-39 | Mobile 390×844 | Same assertions at mobile width | `responsive.spec.ts` | |
| RSP-04 | Responsive | AC-40 | Mobile list form | My Tickets renders cards, not a table, below 768px | `responsive.spec.ts` | |
| RSP-05 | Responsive | AC-40 | Mobile controls | Search, filters, sort, and pagination remain reachable and operable at 390px | `responsive.spec.ts` | |
| RSP-06 | Responsive | ui-spec §7 | Touch targets | Interactive elements are at least 44×44px on mobile | `responsive.spec.ts` | |
| RSP-07 | Responsive | Part 9 | Screenshot capture | Every path listed in `ui-spec.md` §10 is produced | `responsive.spec.ts` | |

### 2.6 End-to-end — `e2e/lab-02/requester-ticket-flow.spec.ts`

| Test ID | Type | Req / AC | What it tests | Expected result | Test file | Final |
|---|---|---|---|---|---|---|
| E2E-01 | E2E | AC-02, AC-07 | Full creation flow | Select Requester, create a Ticket, see the official number, find it in My Tickets | `requester-ticket-flow.spec.ts` | |
| E2E-02 | E2E | AC-04, AC-18 | Requester switch | Requester A's tickets disappear after switching to Requester B; B's own list loads | `requester-ticket-flow.spec.ts` | |
| E2E-03 | E2E | AC-27 | **Direct URL access** | Navigating to Requester A's Ticket URL while Requester B is selected is refused | `requester-ticket-flow.spec.ts` | |
| E2E-04 | E2E | AC-28, AC-32, AC-33, AC-36 | Attachment lifecycle | Add, download, soft-remove with reason, then confirm the removed file cannot be downloaded | `requester-ticket-flow.spec.ts` | |
| E2E-05 | E2E | AC-16 | Backend failure | With the API stopped, submission shows a safe error and preserves every form value | `requester-ticket-flow.spec.ts` | |

---


### Tests added after the plan was written

The ids below were not in the original plan. They are listed here rather than
folded silently into Section 2, so the difference between what was planned and
what was found later stays visible.

| Id | Added because | Was it red first? |
|---|---|---|
| UI-29 | UI-07 proved the route guard worked but not that it was installed, and the application had shipped with the shell unmounted | Yes |
| UI-30 | AC-17 was claimed by #16 while its only planned test, UI-17, sat in #18's file | Yes |
| UI-31 | A temporary constraint (A-06) needed asserting, not just documenting | Yes, and retired by #18 when the constraint was lifted |
| UI-32 | AC-40 had no component-level test, and the screen was rendering a horizontally scrolling table instead of the cards ui-spec 5.4 specifies | Yes |
| UI-33 | The page-size selector was implemented and untested | No — closes a coverage gap |
| API-41 | BR-05 was assumed correct by construction and was not | Yes |
| API-42 | The Related System filter was implemented and untested | No — closes a coverage gap |

Two of these pass on arrival. That is stated rather than hidden: a test written
after the behaviour it covers cannot drive the code, and recording it as though
it had would misrepresent the history.

---

## 3. Acceptance-Criterion Traceability

Every criterion maps to at least one planned test. No criterion is unmapped.

| AC | Covering tests |
|---|---|
| AC-01 | UI-01, API-40 |
| AC-02 | UI-07, UI-29, E2E-01 |
| AC-03 | UI-06 |
| AC-04 | UI-09, E2E-02 |
| AC-05 | UI-04 |
| AC-06 | UI-03 |
| AC-07 | API-01, UI-15, E2E-01 |
| AC-08 | API-02 |
| AC-09 | UT-01, API-01 |
| AC-10 | UT-02, API-03 |
| AC-11 | UI-10, API-38, API-39 |
| AC-12 | UI-11, API-04 |
| AC-13 | UT-04, API-04 |
| AC-14 | API-05, UI-12 |
| AC-15 | UI-13, STY-05 |
| AC-16 | UI-14, E2E-05 |
| AC-17 | UI-30 |
| AC-18 | API-10, E2E-02 |
| AC-19 | API-11 |
| AC-20 | API-13 |
| AC-21 | UT-13, API-14 |
| AC-22 | API-15 |
| AC-23 | UT-16, API-16 |
| AC-24 | UI-22 |
| AC-25 | UI-23, UI-24 |
| AC-26 | API-20, UI-27 |
| AC-27 | API-21, API-22, E2E-03 |
| AC-28 | API-24, E2E-04 |
| AC-29 | API-25, UI-18 |
| AC-30 | UT-11, API-26 |
| AC-31 | UT-09, UT-10, API-27 |
| AC-32 | API-28, E2E-04 |
| AC-33 | API-29, E2E-04 |
| AC-34 | UT-08, API-30, UI-21 |
| AC-35 | API-32, UI-19 |
| AC-36 | API-31, E2E-04 |
| AC-37 | API-33, API-34 |
| AC-38 | UI-16 |
| AC-39 | RSP-01, RSP-02, RSP-03 |
| AC-40 | UI-32, RSP-04, RSP-05 |
| AC-41 | STY-01, STY-02 |
| AC-42 | STY-10, STY-12 |
| AC-43 | STY-08, STY-09 |
| AC-44 | STY-11 |

**Coverage summary:** 44 of 44 Acceptance Criteria mapped. 16 unit, 40 API, 28 UI component, 12 UI style, 7 responsive, 5 E2E — 108 planned tests.

---

## 4. Responsive and Visual Checklist

Completed 5 September 2026 against the screenshots in
`artifacts/lab-02/screenshots/`, captured at desktop 1440x900, tablet 834x1112
and mobile 390x844.

**How to read this.** A tick means the check was made and passed. Rows marked
**auto** are additionally enforced by a test that fails the build, so they are
not left to a human eye; the test id is named. Rows marked n/a do not apply at
that width and say why rather than being ticked vacuously.

| # | Check | Desktop | Tablet | Mobile | Enforced by |
|---|---|---|---|---|---|
| 1 | Every colour used appears in the `ui-spec.md` token table | auto | auto | auto | STY-11 |
| 2 | Header, primary buttons and strong emphasis use the primary green | yes | yes | yes | — |
| 3 | Editable and read-only fields are distinguishable at a glance | auto | yes | yes | STY-03 |
| 4 | Read-only fields remain readable, not greyed into illegibility | yes | yes | yes | — |
| 5 | Disabled controls are distinct from read-only fields | auto | yes | yes | STY-04 |
| 6 | Every required field shows a red asterisk | auto | auto | auto | STY-01 |
| 7 | Every validation message sits directly below its own field | auto | auto | auto | STY-02 |
| 8 | Exactly one primary button per screen | auto | yes | yes | STY-06 |
| 9 | Submit shows a busy state and is disabled while submitting | auto | auto | auto | STY-05 |
| 10 | Every button has visible text | auto | auto | auto | STY-07 |
| 11 | Keyboard focus is visible on every interactive element | auto | yes | n/a — touch | STY-10 |
| 12 | No label, message or button is clipped | yes | yes | yes | — |
| 13 | No overlapping text or controls | yes | yes | yes | — |
| 14 | No horizontal page scrolling | auto | auto | auto | RSP-01..03 |
| 15 | Attachment filenames are readable and not clipped at the edge | yes | yes | yes | — |
| 16 | Priority and status badges convey value by text, not colour alone | auto | auto | auto | STY-08, STY-09 |
| 17 | Removed attachments show no download control | auto | yes | yes | UI-19, API-32 |
| 18 | Empty and no-results states differ in wording and action | auto | n/a — desktop capture | n/a — desktop capture | UI-24 |
| 19 | Mobile ticket list renders as cards, not a squeezed table | n/a — table is correct | n/a — table is correct | auto | UI-32, RSP-04 |
| 20 | Search, filters, sort and pagination usable at 390px | n/a | n/a | auto | RSP-05 |
| 21 | Touch targets at least 44x44px on mobile | n/a | n/a | auto | RSP-06 |
| 22 | The development "not a login" notice is present on every screen | yes | yes | yes | UI-08 |

**One deliberate exception to row 22.** `/lab-01` carries no development notice
and uses Bootstrap colours outside the token table. It is excluded from AC-44
and from this checklist by A-05: wrapping the Lab 1 page in the Zen Green shell
to satisfy either would change the Lab 1 slice, which is the thing A-04
preserves.

---

## 5. Test Commands

Run from the repository root. These are the commands referenced by the Definition of Done and reproduced in `README.md`.

```bash
# One-time - install dependencies at all three levels
npm install                 # repository root: Playwright
cd server && npm install
cd ../client && npm install

# One-time - download the Playwright browser
npm run test:e2e:install    # from the repository root

# Database - required before the API and E2E suites
cd server
npx prisma migrate deploy
npm run prisma:seed

# Unit and API (Vitest + Supertest)
cd server
npm test

# UI component and UI style (Vitest + Testing Library)
cd client
npm test

# Responsive and E2E (Playwright) - needs the server and client running
# Run from the repository root, not from client/ or server/.
npm run test:e2e            # equivalently: npx playwright test e2e/lab-02
```

### Where the configuration lives

| Suite | Config | Collected from |
|---|---|---|
| Unit, API | `server/vitest.config.ts` | `server/tests/**/*.test.ts` |
| UI component, UI style | `client/vite.config.ts` | `client/tests/**/*.test.{ts,tsx}` and `client/src/tests/**/*.test.{ts,tsx}` |
| Responsive, E2E | `playwright.config.ts` (repository root) | `e2e/**` |

The Playwright config declares the three viewport projects fixed by `ui-spec.md` section 10 - desktop 1440x900, tablet 834x1112, mobile 390x844 - so a spec written once runs at all three widths, and the project name prefixes each captured screenshot.

Screenshots are written to `artifacts/lab-02/screenshots/` by the responsive suite.

---

## 6. Final Results

Run on 5 September 2026 against a migrated and seeded PostgreSQL instance, from
the commands in Section 5.

| Suite | Command | Tests | Passed | Failed | Skipped |
|---|---|---|---|---|---|
| Unit + API | `cd server && npm test` | 92 | 92 | 0 | 0 |
| UI component + style | `cd client && npm test` | 76 | 76 | 0 | 0 |
| Responsive + E2E | `npx playwright test e2e/lab-02` | 24 | 24 | 0 | 18 |
| **Total** | | **192** | **192** | **0** | **18** |

**The 18 skips are declared, not failures, and none is a disabled test.** They
are the same specs declining to run at a viewport where they do not apply:

| Skipped | Why |
|---|---|
| E2E-01 … E2E-05 at tablet and mobile (10) | Journeys run at one viewport. The desktop list is a table and the mobile list is cards, so a journey written against one cannot address the other; duplicating it per width would test presentation twice while proving the flow once. Presentation at every width is RSP-01 … RSP-06. |
| RSP-06 at desktop and tablet (2) | The 44px touch minimum is a mobile requirement. |
| RSP-07 at tablet and mobile (6) | `ui-spec.md` §10 lists these three screenshot paths at desktop only. |

No test is skipped because it fails, and no test is disabled, commented out, or
`.only`-scoped. Verifiable: `grep -rn "\.skip\|\.only\|xit(\|xdescribe(" server/tests client/tests e2e` returns only the conditional viewport guards above.

**Definition of Done gate:** every planned test above is implemented and passing, and no test is skipped, disabled, commented out, or flaky. A planned test that was not implemented must be moved to Section 7 with a stated reason — it must not be silently dropped from Section 2.

---

## 7. Known Limitations and Deferred Tests

### 7.1 Verification policy

**Component-level tests render components directly and therefore cannot prove a
component is reachable in the running application. Every issue delivering a
screen must be verified in a browser before it is reported complete.**

This was written after Issue #15 was reported complete on a green suite while
`localhost:5173` still served the Lab 1 page: every Lab 2 component existed,
passed its tests, and was imported by nothing but those tests. UI-29 now guards
the specific case, but the general lesson is the one above, and no test replaces
opening the application.


### 7.2 Deferred tests and known limitations

| Item | Reason | Where it goes |
|---|---|---|
| Attachment type validation uses extension plus declared MIME type, not content sniffing | A forged MIME type on a permitted extension would pass. Content-based detection is disproportionate at lab scale, and the stored file is never executed or rendered inline. | Lab 3, alongside real authentication |
| Ticket-number allocation is proved under concurrency, but not at load | API-41 fires eight parallel creations and asserts distinct, contiguous numbers. That is enough to catch the read-then-write race it was written to expose, and it did: the previous implementation failed six of eight. It is not a load test, and it does not exercise the row-lock behaviour under sustained contention. | Revisit only if load testing is introduced |
| No visual regression baselines | Screenshots are captured and inspected against the Section 4 checklist by a human. Pixel-diff baselines would fail on every intentional style change during the sprint. | Considered once the theme stabilises |
| Only `NEW` status is exercised | Every other D-02 status is out of Lab 2 scope. UI-28 asserts that no status control exists, which guards the exclusion. | Lab 3 |
| Accessibility checks are targeted, not a full audit | STY-07, STY-10, and STY-12 cover labels, focus, and keyboard reach. A complete WCAG audit is beyond a single sprint. | Later hardening sprint |
