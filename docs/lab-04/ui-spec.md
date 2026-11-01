# Lab 4 UI Specification

**Project:** TokTickIT — Actions Taken, Dashboards, and Final Regression
**Companion documents:** `specification.md`, `api-spec.md`, `tests.md`, `docs/lab-02/ui-spec.md` (tokens and base components), `docs/lab-03/ui-spec.md` (shell, badges, dialogs, callouts)
**Status:** Draft for approval — must be merged before implementation PRs begin

Everything in L2 ui-spec and L3 ui-spec still applies, unless this document
replaces it. Lab 4 adds two dashboards and the Actions Taken area. It also
finishes the product as one coherent Zen Green application.

---

## 1. Design tokens

**No new tokens.** Every Lab 4 element uses the L2 §1.1–1.4 colour,
typography, spacing, radius, and elevation tokens. The table below assigns
tokens to the new roles.

| New role | Tokens | Why |
|---|---|---|
| Metric card | `--zg-surface` background, `--zg-border` 1px, `--zg-radius-md`, `--zg-shadow-card`; value in `--zg-font-h1` `--zg-primary`; label in `--zg-font-label` `--zg-text-muted` | Same card language as L2 §5.5 |
| Metric card hover and focus | Border `--zg-primary` 2px | Same as the L2 focus ring colour, so the card reads as interactive |
| Resolution-blocked notice | `--zg-warning-bg`, `--zg-warning` text | A genuine caution (L3 ui-spec §1) |
| Follow-up indicator | `--zg-warning-bg`, `--zg-warning` text | Same reason: work is still owed |
| Inactive performer suffix | `--zg-text-muted` | Secondary information |

> **Deviation L3-DEV-01 carried forward:** Zen Green replaces the D-09 palette, because the handout requires it.

---

## 2. Navigation and shell

| Role | Navigation, in order |
|---|---|
| Requester | **Dashboard** (`/dashboard`), My Tickets, Create Ticket |
| IT Staff | **Dashboard** (`/staff/dashboard`), Ticket Queue |
| Administrator | **Dashboard** (`/staff/dashboard`), Ticket Queue, User Management |

- The active item keeps the L3 active indication: `aria-current="page"`, plus the existing underline and weight. It is not shown by colour alone.
- `/` keeps the Lab 3 landing (DEC-11).
- Opening a dashboard route with the wrong role shows the shared forbidden state (L3 ui-spec §5.1).

Test hooks: `nav-dashboard`.

---

## 3. Dashboards

### 3.1 Shared layout

- **Order:** page title, the window line, then the metric cards, then the lists.
- **Window line:** "Recent = since {d MMM yyyy}, Bangkok time", in `--zg-font-small` `--zg-text-muted` (BR-36).
- **Metric grid:** 4 cards per row on desktop, 2 on tablet, 1 on mobile. Gap `--zg-space-4`.
- **Metric card:**
  - The whole card is one `<a>` to its `link`, with a visible label, a large value, and "View list →" in `--zg-font-small`.
  - Accessible name: "{Label}: {value}. View list".
  - A card whose `link` is `null` is a `<section>` with no link and no arrow.
- **Lists:** each list is a card with an `<h2>` title and up to 5 rows. Each row is a link: Ticket Number, Summary (one line, ellipsis), and the status badge. Rows are at least 44px tall on mobile.
- **Empty card:** the value 0, plus the empty message under it (BR-38).
- **Empty list:** the list's empty message in `--zg-text-muted`. Never a blank card.
- **No primary button** on either dashboard. Dashboards navigate. They do not act.

### 3.2 Requester Dashboard (`/dashboard`)

| Element | Content | Empty message |
|---|---|---|
| Title | "Dashboard" | — |
| Card | Open tickets | "No open tickets." |
| Card | Waiting for you | "Nothing is waiting for you." |
| Card | Updated recently | "No updates this week." |
| Card | Resolved recently | "Nothing resolved this week." |
| List | Needs your attention | "No tickets need your attention." |
| List | Recently updated | "No recent updates." |
| List | Recently resolved | "No recently resolved tickets." |

A Requester with no tickets also sees a secondary "Create a ticket" link under
the title. It is a link, not a primary button. The api-spec §5.1 response has
no total ticket count, so "no tickets" is read as every count 0 and every list
empty. A Requester whose only tickets are old and Done also sees the link,
which is harmless because it is secondary (decided in #73).

Updated recently and Resolved recently have no drill-down (Amendment 7). They
render as `<section>` cards with no link and no "View list" (§3.1).

### 3.3 IT Staff Dashboard (`/staff/dashboard`)

| Element | Content | Empty message |
|---|---|---|
| Title | "Dashboard" | — |
| Cards | Unassigned · Owned by me · My open actions | "None." |
| Tickets by status | Compact table: Status badge, then count. Each row is a link to the queue filter. All 8 rows always shown. | — (zeros shown as 0) |
| Active by IT Priority | Same compact table: priority badge, then count. All 4 rows. | — |
| List | My open actions: Ticket Number, action description (120 chars), action status badge, date | "You have no open actions." |
| List | Urgent and active: Ticket Number, Summary, Owner or "Unassigned" | "No urgent tickets." |
| List | Recently updated | "No recent updates." |
| Administrator only | "User accounts" card: Requesters, IT Staff, Administrators (active), and Inactive. No link (DEC-10). | — |

**Responsive.**
- Desktop: cards row; then two columns, with the status and priority tables on the left (4/12) and the lists on the right (8/12).
- Tablet and mobile: one column, in the order cards, my open actions, urgent, status table, priority table, recently updated.

### 3.4 States

Both dashboards have exactly these states:

| State | Presentation |
|---|---|
| Loading | Skeleton cards at final size, so nothing shifts. `aria-busy="true"` on the main region. |
| Populated | As above |
| Forbidden | Shared forbidden state (L3 ui-spec §5.1) |
| Failure | Error callout "We couldn't load the dashboard. Please try again." plus a **Retry** button (secondary). No status code is shown. |

### 3.5 Drill-down targets

My Tickets and the Ticket Queue read `status` and `statusGroup` from the URL
(api-spec §4).
- When a dashboard filter is active, a filter chip shows above the list: "Showing: Open tickets ×" (`statusGroup=ACTIVE`), "Showing: Resolved tickets ×" (`statusGroup=DONE`), or "Showing: Waiting for Requester ×". The × is a button with the accessible name "Clear filter".
- On the Ticket Queue, the status filter select reflects `status`, so `?status` gets no chip. A `statusGroup` is shown only by the chip, because the select holds single statuses. Choosing a status in the select removes `statusGroup`, because api-spec §4.2 refuses both together (decided in #73).
- My Tickets has no status select, so its `?status` is shown by the chip (decided in #73).

Test hooks: `requester-dashboard-screen`, `staff-dashboard-screen`,
`metric-{key}`, `metric-value-{key}`, `list-{key}`, `list-item-{key}-{id}`,
`status-count-{STATUS}`, `priority-count-{PRIORITY}`, `card-users`,
`filter-chip`, `btn-clear-filter`, `dashboard-window`.

---

## 4. Actions Taken

### 4.1 Placement

- **IT Staff Ticket Detail:** a new "Actions Taken" card with `id="actions"`, so `#actions` scrolls to it. It sits in the content column, after the ticket information card and before the Conversation card. On tablet and mobile it follows the operations card.
- **Requester Ticket Detail:** the same card, read-only, after the ticket information and before Public Comments.

### 4.2 List

| Width | Presentation |
|---|---|
| Desktop and tablet | Table: Date/Time · Description · Performed by · Status · Follow-up · Edit |
| Mobile | One card per action, with fields stacked as label and value pairs |

- **Date/Time** is shown in Bangkok time: "29 Oct 2026, 10:15". The `<time datetime>` attribute holds the ISO value. Month names are fixed three-letter forms ("Sep", not "Sept"), and the day has no leading zero ("1 Sep 2026"), as in the dashboards' `d MMM yyyy` (§3.1). Current ICU writes "Sept" in en-GB, so the client formats months itself in `client/src/lab-04/bangkok-time.ts` (decided in #72).
- **Description** shows the first 2 lines. **Result** and **Attachment Notes** show in an expandable row opened by a "Details" disclosure button (`aria-expanded`). On mobile, the card shows everything.
- **Performed by:** the full name. If the user is inactive, add " (inactive)" in `--zg-text-muted`. If the performer is not the creator, add "Recorded by {creator}" in `--zg-font-small`.
- **Follow-up:** the follow-up indicator "⚑ Follow-up required" with the note under it, or "—".
- **Edit** (secondary, small) appears only for IT Staff and Administrators, and only when the ticket allows action edits (BR-17) and the action is not CANCELLED (BR-16).
- **Header line:** "{total} actions · {open} open · {followUps} follow-ups outstanding", from `actionSummary`. The Requester detail has no `actionSummary`, so the Requester view counts the action list itself, with spec §5.2's meanings of "open" and "outstanding" (decided in #72).
- **Empty:** "No actions have been recorded yet." For staff, a **Record action** button (secondary) follows.
- **Ticket state does not allow actions** (staff view): the button is replaced by the text "Actions can be recorded once the ticket is claimed." (NEW), or "This ticket is {status}. Reopen it to record more work." (RESOLVED, CLOSED, CANCELLED).
- **Requester view:** no buttons. The title "Work done on your ticket" replaces "Actions Taken".

### 4.3 Action status badges

| Status | Display text | Background | Text | Border |
|---|---|---|---|---|
| PLANNED | ◌ Planned | `--zg-surface` | `--zg-secondary` | 1px `--zg-secondary` |
| IN_PROGRESS | ◐ In Progress | `--zg-secondary` | `--zg-surface` | — |
| COMPLETED | ✓ Completed | `--zg-pale` | `--zg-success` | — |
| CANCELLED | ✕ Cancelled | `--zg-disabled-bg` | `--zg-text-muted` | 1px `--zg-border` |

`data-testid="badge-action-status"`, `data-status="{STATUS}"`. The glyph and
the text carry the meaning, not the colour (AC-38). The IT Staff Dashboard's
"My open actions" list uses the same badge component as Actions Taken. #73
shipped a dashboard-only copy so that it shared no file with #72; #74 replaced
it with the Actions Taken badge.

### 4.4 Create Action and Edit Action dialogs

One dialog component in two modes. It follows L3 ui-spec §5.2: `role="dialog"`,
focus trap, return focus to the opener, 560px wide, full width on mobile with
stacked actions.

| Field | Control | Create | Edit |
|---|---|---|---|
| Action date and time | `datetime-local` input, Bangkok time, default now | required | editable except on CANCELLED |
| Description | textarea, counter /2000 | required | editable |
| Status | select | PLANNED, IN_PROGRESS, COMPLETED; default PLANNED | only the current status plus its BR-15 targets. Read-only text on COMPLETED. |
| Result | textarea, counter /2000 | label shows "(required to complete)" when status is COMPLETED | label shows "(required)" when target is COMPLETED or CANCELLED. When the target is CANCELLED, the label reads "Reason for cancelling". |
| Performed by | select of active staff, from `GET /staff/assignees`, default the current user | editable | editable on PLANNED or IN_PROGRESS; read-only on COMPLETED |
| Follow-up required? | checkbox | — | — |
| Follow-up note | textarea, counter /1000 | shown and required only while the checkbox is ticked | same |
| Attachment notes | text input, counter /500, hint "Which attachment to look at, e.g. error-screenshot.png" | optional | optional |

**Buttons:**
- Create: **Save action** (primary) and Cancel.
- Edit: **Save changes** (primary) and Cancel.
- A status change to CANCELLED from the select adds the confirmation line "Cancelled actions cannot be edited again." above the buttons. Save becomes the destructive style.

**Behaviour.**
- The dialog generates `clientRequestId` (UUID) once when it opens in create mode, and reuses it for every retry from the same dialog (BR-31).
- While saving, the primary button reads "Saving…" and is disabled. Every field is read-only (L3 §2).
- **Validation (422):** messages appear under each field, focus moves to the first failing field, and the input is kept.
- **Conflict (`STALE_UPDATE`, `ACTION_STATE_CONFLICT`, `INVALID_ACTION_TRANSITION`, `TICKET_STATE_CONFLICT`):** the Conflict callout appears inside the dialog with the server message and a **Reload ticket** button. Input is kept until the user closes the dialog (AC-21). Reload re-fetches the ticket and actions; in edit mode it also reloads the action into the form, after the confirmation "Discard your changes and load the latest version?". That confirmation is an inline step inside the dialog (`btn-confirm-reload`), not `window.confirm` (decided in #72).
- **Safe failure (5xx, network):** an error callout in the dialog, "We couldn't save the action. Your input is kept; please try again." Retrying create reuses the same `clientRequestId`.
- **Success:** the dialog closes, the Success callout "Action saved." shows on the card, and the ticket detail, actions, and history are re-fetched. Focus returns to the opener, or to the card heading if the opener is gone.

Test hooks: `actions-card`, `actions-summary`, `action-row-{id}`,
`action-card-{id}`, `btn-record-action`, `btn-edit-action-{id}`,
`btn-action-details-{id}`, `action-dialog`, `field-action-at`,
`field-action-description`, `field-action-status`, `field-action-result`,
`field-action-performer`, `field-follow-up-required`, `field-follow-up-note`,
`field-attachment-notes`, `btn-save-action`, `indicator-follow-up`,
`actions-empty`, `actions-locked-message`.

---

## 5. Ticket workflow feedback

Extends L3 ui-spec §6.5.

- **Status buttons** still come only from `availableTransitions`.
- **Resolve blocked:** when `resolutionBlockers` is not null, Resolve renders disabled, with `aria-describedby` pointing at a notice directly under it:
  - "Can't resolve yet: {n} action(s) open, {m} follow-up(s) outstanding." The notice uses the resolution-blocked tokens (§1).
  - It also offers a link "Go to Actions Taken" to `#actions`.
- **Server-side refusal** (`RESOLUTION_BLOCKED` from a stale screen): the Conflict callout shows the server message, and the detail is re-fetched.
- **`STALE_UPDATE` on owner, IT Priority, or status:** the Conflict callout shows "This ticket was changed by someone else." and the **Reload ticket** button. A reason typed into a Cancel or Reopen dialog is kept until the dialog is closed.
  - The detail is not re-fetched until the user activates Reload ticket, so the screen does not change under the user (E2E-04). Other 409 responses keep the Lab 3 re-fetch, and `RESOLUTION_BLOCKED` re-fetches as stated above (decided in #72).
  - In a Cancel or Reopen dialog, the stale message shows in the dialog's text line, because the shared confirmation dialog has no callout slot (decided in #72).
- **After any success**, the header status badge, `resolvedAt` ("Resolved on {date}" under the badge when set), and the history all refresh.

Test hooks: `notice-resolution-blocked`, `btn-reload-ticket`, `resolved-at`.

---

## 6. Ticket History (staff only)

- The Conversation card gains a third tab: Public Comments · Internal Notes · **History ({n})**. It uses the WAI-ARIA tabs pattern (L3 ui-spec §10).
- Each entry is one line: time (Bangkok), actor name (or "System" for a null actor), and a sentence. Examples:
  - "Wichai Prasert claimed the ticket."
  - "Arisa Kongkaew changed status from In Progress to Resolved."
  - "Arisa Kongkaew completed an action." (ACTION_UPDATED with a status change)
  - "Arisa Kongkaew edited an action (result, follow-up)." (text changes only)
- Sentences for the other events (decided in #72):
  - Owner change: "{actor} assigned the ticket to {name}."
  - IT Priority change: "{actor} changed IT Priority from High to Urgent."
  - Action create: "{actor} recorded an action.", or "{actor} recorded an action performed by {name}." when the performer is someone else.
  - Action status change to In Progress or Cancelled: "{actor} started an action." / "{actor} cancelled an action."
  - Resolution indication: "{actor} said the problem appears resolved."
  - Owner cleared when the ticket is reopened: "System removed {name} as Ticket Owner."
  - In "edited an action (…)", the field names are date, description, result, performer, follow-up, and attachment notes. `followUpRequired` and `followUpNote` both count as "follow-up".
- Entries are oldest first. There are no edit or delete controls.
- History is read-only, so the tab has no composer and no primary button.
- Empty: "No history yet."

Test hooks: `tab-history`, `history-item-{id}`.

---

## 7. Responsive rules

L2 §7 and L3 ui-spec §9 apply. Additions:

| Screen or element | Desktop ≥ 992px | Tablet 768–991px | Mobile < 768px |
|---|---|---|---|
| Dashboards | 4-card row; 4/8 columns below | 2-card rows; one column below | 1 card per row; one column |
| Actions Taken list | Table, 6 columns | Table without Follow-up column; follow-up shown inside Details | Cards |
| Action dialog | 560px | 560px | Full width minus `--zg-space-4` per side; actions stacked |
| Filter chip | Inline above the list | Same | Full width, wraps |

No horizontal page scrolling, clipping, or overlap at any width (AC-37). Long
words in descriptions and notes wrap (`overflow-wrap: anywhere`).

---

## 8. Accessibility

L2 §8 and L3 ui-spec §10 apply. Additions:

- Metric cards are single links with a full accessible name (§3.1). The value is not read twice.
- The status and priority count tables are real `<table>`s with `<th scope="col">`.
- The "Details" disclosure uses `aria-expanded` and `aria-controls`.
- The disabled Resolve button's reason is reachable through `aria-describedby`, and is also visible as text.
- The follow-up note field is announced as required while it is shown (`aria-required="true"`). Toggling the checkbox does not move focus.
- A conflict callout inside a dialog uses `role="alert"`. The Success callout uses `role="status"`.
- Every new interactive element is reachable with Tab, and has the L2 focus ring.

---

## 9. Feedback consistency (product-wide)

Lab 4 checks every screen from Labs 2 to 4 against one rule set. Any screen that
differs is fixed in the hardening Issue (#74).

| Condition | Component | Text rule |
|---|---|---|
| Loading | Skeleton or busy button text | Busy text names the operation (L3 §2) |
| Validation | Field messages under fields; focus to first error | Says how to fix it |
| Success | Success callout, `role="status"` | Past tense: "Action saved." |
| Empty / no results | Muted text inside the region | Distinguishes empty from no results (L2) |
| Forbidden | Shared forbidden state | "Access denied" `<h1>` |
| Not found | Shared not-found state | — |
| Conflict | Conflict callout, with Reload where relevant | Server message |
| Safe failure | Error callout, with Retry where relevant | No status code, stack, or internal detail |

---

## 10. Final polish removals

Removed in #74, and checked by STY-04 and E2E-08:
- any placeholder or lorem text, "TODO", or "coming soon" text;
- any `console.log` left in client code, and every console error or warning on normal use;
- duplicate or obsolete navigation items, buttons, or routes from earlier labs;
- any link that leads to a 404 screen from normal navigation;
- inline colour values that are not tokens.

---

## 11. Screenshot paths

Captured by Playwright at the Lab 2 viewports: desktop 1440×900, tablet
834×1112, mobile 390×844. The first three folders are those required by the
handout's repository increment.

```
artifacts/lab-04/screenshots/
├── staff-dashboard/
│   ├── {desktop,tablet,mobile}-it-staff.png
│   ├── desktop-administrator.png
│   ├── desktop-zero-open-actions.png
│   ├── desktop-loading.png
│   ├── desktop-failure.png
│   ├── desktop-forbidden-requester.png
│   └── desktop-drilldown-owned-by-me.png
├── requester-dashboard/
│   ├── {desktop,tablet,mobile}-populated.png
│   ├── desktop-empty.png
│   ├── desktop-forbidden-it-staff.png
│   └── desktop-drilldown-waiting.png
├── actions-taken/
│   ├── {desktop,tablet,mobile}-list.png
│   ├── desktop-create-dialog.png
│   ├── desktop-validation.png
│   ├── desktop-inactive-performer.png
│   ├── desktop-edit-complete.png
│   ├── desktop-cancel-action.png
│   ├── desktop-stale-conflict.png
│   ├── desktop-requester-readonly.png
│   └── mobile-dialog.png
├── workflow/
│   ├── desktop-resolve-blocked.png
│   ├── desktop-resolved.png
│   └── desktop-history.png
└── regression/
    └── desktop-{login,my-tickets,requester-detail,queue,staff-detail,user-management}.png
```

---

## 12. Visual and accessibility checklist

Completed against the §11 screenshots and recorded in `tests.md` §6. Every row
is checked at all three widths. L2 rows 1–21 and L3 rows 23–31 still apply.

| # | Check |
|---|---|
| 32 | Dashboard navigation item is present for each role and marked active on the dashboard |
| 33 | Every metric card shows a label, a value, and a "View list" cue when it has a link |
| 34 | Zero metrics show 0 and an empty message; no blank card |
| 35 | Action status and follow-up badges show glyph and text, not colour alone |
| 36 | Read-only fields (Requester actions, COMPLETED action status, ticket information) look read-only and have no input chrome |
| 37 | Validation messages sit directly under their field inside the action dialog |
| 38 | Disabled Resolve shows its reason in text next to it |
| 39 | Keyboard focus is visible on metric cards, list rows, Details toggles, and every dialog control |
| 40 | No clipping or overlap in the actions table at tablet width, or in action cards at mobile width |
| 41 | No horizontal page scrolling on either dashboard or on Ticket Detail at 390px |
| 42 | Private content (Internal Notes, History) never appears on any Requester screen |
| 43 | No placeholder text, console errors, or obsolete controls remain (§10) |
