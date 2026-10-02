# Lab 3 UI Specification — Zen Green, Extended

**Project:** TokTickIT — Users, Roles, IT Staff Ticketing, and Admin Screens
**Companion documents:** `specification.md` (FR/BR/AC), `api-spec.md` (contract), `tests.md` (traceability), `docs/lab-02/ui-spec.md` (the base this document extends)
**Status:** Draft for approval — must be merged before implementation PRs begin

This document **extends** `docs/lab-02/ui-spec.md` and is binding in the same
way. Everything in the Lab 2 document stays in force unless this document
replaces it explicitly. That covers tokens, control states, required markers,
validation placement, button levels, responsive breakpoints, accessibility
rules, and test-hook conventions. **No colour, spacing value, font size, or
component state may appear in the implementation that is not listed in one of
the two documents** (AC-66).

Lab 2 sections are cited as `L2 §n`.

---

## 1. Design tokens

**No new tokens are introduced.** Every Lab 3 screen, badge, and region uses
the colour, typography, spacing, radius, and elevation tokens in L2 §1.1–1.4.
Section 7 assigns existing tokens to the new badges.

Two token roles are spelled out for Lab 3:

| Token | Lab 3 use | Why it is allowed |
|---|---|---|
| `--zg-warning`, `--zg-warning-bg` | The WAITING_FOR_REQUESTER status badge and the Internal Note region | L2 §1.1 reserves warning colours for warnings. A ticket blocked on the Requester, and text that must not be shown to the Requester, are both genuine cautions, not decoration. |
| `--zg-surface` (`#FFFFFF`) | Text on solid `--zg-primary` and `--zg-secondary` badges | The same pairing as the primary button, at 6.4:1 and 5.6:1 contrast. |

> **Deviation DEV-01, carried forward from L2-DEV-01.** The SDS D-09 KMUTT palette is
> still replaced by Zen Green, because the Lab 3 labsheet requires it. The D-09
> amendment that L2-DEV-01 said was needed has not been made, and remains outstanding.

---

## 2. Control states and buttons

Control states (L2 §2) and button levels (L2 §3) are unchanged.

### Primary buttons

**At most one primary button is visible on a screen at a time.** Lab 2 already
works this way: Ticket Detail shows no primary button once five attachments
exist. A modal dialog is its own surface and carries its own single primary or
destructive confirm button.

| Screen | Primary button |
|---|---|
| Login | Sign in |
| Change Password | Save password |
| Requester Ticket Detail | Add Attachment (Lab 2). Post comment is secondary. |
| Ticket Queue | none |
| Staff Ticket Detail | Post comment or Post internal note: whichever composer tab is active (Section 6.5) |
| User Management | Create user |

### Busy text

Busy text names the operation:
- "Signing in…", "Saving…", "Posting…", "Claiming…", "Assigning…", "Updating…".

---

## 3. Application shell

This replaces L2 §4. The shell appears on every authenticated screen.

| Element | Behaviour |
|---|---|
| Brand | "TokTickIT" in `--zg-surface` on the `--zg-primary` header. Links to the role's landing route. |
| Navigation | Requester: My Tickets, Create Ticket. IT Staff: Ticket Queue. Administrator: Ticket Queue, User Management. Unauthorized destinations are not rendered at all (FR-08). |
| Active indication | Unchanged from Lab 2: a 3px bottom border plus `aria-current="page"`. |
| User display | The user's full name followed by a role badge (Section 7.3), right-aligned on desktop. |
| Change password | Tertiary link to `/change-password`. |
| Log out | Tertiary button. It calls `POST /auth/logout`, clears all client state and cached data, and navigates to `/login`. |
| Mobile (< 768px) | The navigation collapses behind a toggle with `aria-expanded`. The user display, Change password, and Log out move into the expanded panel. |

**Removed from Lab 2:**
- the "Acting as" Requester display;
- the Change Requester action;
- the "Development mode … This is not a login" notice (L2 §4);
- the Development Requester Selection screen (L2 §5.1).

**Forced password-change mode.** While `mustChangePassword` is true, the shell
shows only the brand (not a link), the user display, and Log out. There is no
navigation and no Change password link. Every route renders the Change Password
screen.

---

## 4. Routing and session behaviour

| Situation | Behaviour |
|---|---|
| Not authenticated, protected route | Redirect to `/login?next={path}`. |
| Authenticated, `/login` | Redirect to the role's landing route. |
| `/` | Requester → `/tickets`. IT Staff and Administrator → `/staff/queue`. |
| `mustChangePassword` | Every route renders Change Password in forced mode (Section 3). |
| Role not permitted for the route | The shell renders with the forbidden state (Section 5.1) in place of the screen. No protected data request is made. |
| Any API call returns `401` (except login) | Clear the auth state and cached data, and navigate to `/login?next={path}`. Show the session-ended callout. |
| Any API call returns `403 PASSWORD_CHANGE_REQUIRED` | Reload `GET /auth/me` and enter forced mode. |
| Any API call returns `403 CSRF_INVALID` | Refresh the token from `GET /auth/me`, then show the safe failure callout. The request is not retried automatically. |
| App start | Remove the legacy `toktickit.selectedRequester` sessionStorage key once. Then call `GET /auth/me` to restore the session. A full-screen loading state shows until it resolves. |

**`next` safety.** `next` is honoured only if it starts with a single `/`, does
not start with `//`, and contains no scheme. Otherwise it is ignored, which
prevents an open redirect.

**Lab 1 page.** `/lab-01` stays public and outside the shell, unchanged (L2-A-05).

---

## 5. Shared feedback components

### 5.1 Callout

One component with these variants. It always has an icon plus text, never colour alone.

| Variant | Background / text / left border | Example text | Used for |
|---|---|---|---|
| Error | `--zg-error-bg` / `--zg-text` / 3px `--zg-error` | "Something went wrong. Try again." | Unexpected failures, `500`, network errors |
| Forbidden | `--zg-readonly-bg` / `--zg-text` / 3px `--zg-text-muted` | "You do not have access to this page." plus a link to the landing route | `403 FORBIDDEN`, and a route the role is not permitted (`data-testid="state-forbidden"`) |
| Not found | `--zg-readonly-bg` / `--zg-text` / 3px `--zg-text-muted` | "This ticket could not be found." plus a link back | `404` on a detail screen (`data-testid="state-not-found"`) |
| Conflict | `--zg-warning-bg` / `--zg-text` / 3px `--zg-warning` | The server's `message`, then "The ticket has been reloaded." | Any `409` (`data-testid="callout-conflict"`) |
| Info | `--zg-pale` / `--zg-text` / 3px `--zg-secondary` | "Your session has ended. Please sign in again." | Session ended, password changed |
| Success | `--zg-pale` / `--zg-success` / 3px `--zg-primary` | "User saved." | Successful saves |

No callout ever shows an HTTP status code, an error code, a stack trace, or an
internal identifier (AC-68).

### 5.2 Confirmation dialog

This generalises the Lab 2 removal modal (L2 §5.5). Its structure:
- a title naming the action and the Ticket Number;
- optionally a required reason textarea, validated with its message below the field;
- Cancel (secondary);
- a confirm button: primary, or destructive for Cancel ticket.

It traps focus, closes on Escape, and returns focus to the button that opened it.
No request is sent before confirm. While in flight, the confirm button is busy
and the dialog cannot be dismissed.

| Action | Title | Reason | Confirm button |
|---|---|---|---|
| Resolve | "Mark {ticketNumber} as resolved?" | — | Resolve (primary) |
| Close | "Close {ticketNumber}? Closed tickets are locked." | — | Close ticket (primary) |
| Cancel ticket | "Cancel {ticketNumber}?" | Required, 5–500 | Cancel ticket (destructive) |
| Reopen | "Reopen {ticketNumber}?" | Required, 5–500 | Reopen (primary) |
| Problem appears resolved | "Tell IT the problem appears resolved?" plus the text "IT will review and formally resolve the ticket." | — | Yes, it appears resolved (primary) |
| Set new initial password | "Set a new initial password for {fullName}?" plus the text "They will be signed out and must change it at next login." | Password field, BR-11 | Set password (primary) |

The dialog's Cancel button reads "Keep ticket" in the Cancel ticket dialog, so
that two different "Cancel" labels never appear together.

---

## 6. Screen specifications

### 6.1 Login (`/login`)

A centred card, maximum width 480px, on `--zg-bg`. It has no shell.

| Element | Detail |
|---|---|
| Title | "Sign in to TokTickIT" at `--zg-font-h1` |
| Email | Label "Email", `type="email"`, `autocomplete="username"`, required |
| Password | Label "Password", `type="password"`, `autocomplete="current-password"`, required |
| Sign in | Primary button, full width |
| Helper | "Accounts are created by your administrator." at `--zg-font-small`, `--zg-text-muted`. There is no registration or reset link (both are excluded). |

**States**

| State | Presentation |
|---|---|
| Initial | Empty fields. Focus on Email. |
| Validation | An empty field shows "Enter your email." or "Enter your password." below it. No request is sent. |
| Busy | Sign in shows "Signing in…", busy and disabled. Fields are disabled. |
| Invalid credentials (`401`) | Error callout: "The email or password is incorrect." The password is cleared, the email kept, and focus moves to Password. No field is marked as the wrong one. |
| Inactive (`403 ACCOUNT_INACTIVE`) | Error callout: "This account is inactive. Contact your administrator." |
| Throttled (`429`) | Error callout: "Too many sign-in attempts. Try again in a few minutes." |
| Failure | Error callout: "Could not sign in. Try again." Fields kept. |
| Session ended | Info callout above the form when arriving from a `401` redirect. |

### 6.2 Change Password (`/change-password`)

A card, maximum width 480px.
- **Forced mode:** inside the forced shell (Section 3).
- **Voluntary mode:** inside the normal shell.

| Element | Detail |
|---|---|
| Title | Forced: "Choose a new password". Voluntary: "Change password". |
| Explanation (forced) | "Your password was set by an administrator. Choose a new one to continue." |
| Current password | Required |
| New password | Required. Helper: "12–128 characters. Must differ from your current password." |
| Confirm new password | Required |
| Save password | Primary button |
| Cancel | Secondary, voluntary mode only. Returns to the previous screen. |

**Client-side checks** (each message below its field):
- length 12–128 code points, counted with `[...value].length`;
- confirmation matches;
- new password differs from current.

The server is authoritative. A `422` places each `details` message below its field.

**Outcome.** On success, the client stores the returned `csrfToken`, leaves
forced mode, navigates to the role's landing route, and shows the Info callout
"Password changed."

### 6.3 Requester Ticket Detail (`/tickets/{ticketId}`) — Lab 3 additions

The Lab 2 layout (L2 §5.5) is kept. Additions:

| Region | Addition |
|---|---|
| Ticket information | Adds "Assigned to": the owner's name, or "Not yet assigned" in `--zg-text-muted`. Status badges now cover all eight statuses (Section 7.1). |
| Resolution panel | Shown in OPEN, IN_PROGRESS, WAITING_FOR_REQUESTER, and REOPENED. Before indicating: the text "Has the problem gone away?" and a secondary "Problem appears resolved" button that opens the confirmation dialog. After: the appears-resolved indicator (Section 7.4) with its date. Hidden in other statuses. |
| Comments | A new card headed "Comments", between ticket information and attachments. The list is oldest first (Section 8). The composer is a textarea labelled "Add a comment", 4 rows, with a live counter "{n}/2000" and a secondary "Post comment" button. Hidden on CLOSED tickets, replaced by "Comments are closed for this ticket." |
| Attachments | On CLOSED and CANCELLED tickets: no Add Attachment button, no Remove buttons, and the helper text "Attachments cannot be changed on a closed or cancelled ticket." Download stays. |

The Requester sees **no** status, cancel, reopen, claim, assign, or IT Priority
control, and no Internal Notes (AC-27, BR-53). UI-27 from Lab 2 still holds:
the ticket-information region has no interactive control.

### 6.4 IT Staff Ticket Queue (`/staff/queue`)

**Title** "Ticket Queue", with a count line below it: "{totalItems} tickets".

**Control bar.** One row on desktop, stacked on mobile.

| Control | Detail |
|---|---|
| Search | Placeholder "Search number, summary, or requester". Debounced 300ms. |
| Status | "All statuses" plus the eight statuses by display name |
| IT Priority | "All priorities", Low, Medium, High, Urgent |
| Category | "All categories" plus active categories from the API |
| Owner | "Anyone", "Assigned to me", "Unassigned", then each assignee from `GET /staff/assignees` |
| Sort | "Priority: Urgent first" (default), "Oldest first", "Newest first", "Recently updated", "Ticket Number A–Z", "Status" |
| Clear Filters | Secondary. Visible only when a search, a filter, or a non-default sort is applied. |

**Desktop table (≥ 992px).** Seven columns. Description, Related System, and
Requested Priority are left to Detail to avoid a mega-grid.

| Column | Content |
|---|---|
| Ticket Number | Monospace link to `/staff/tickets/{id}` |
| Summary | One line with an ellipsis and the full text in `title`. When the Requester indicated resolution, the appears-resolved indicator (compact form) sits below it. |
| Requester | Full name |
| IT Priority | Badge (Section 7.2) |
| Status | Badge (Section 7.1) |
| Owner | Full name, or "Unassigned" in `--zg-text-muted` |
| Last Updated | Relative under 7 days, absolute beyond (L2 §5.4) |

**Tablet (768–991px):** the same table with the Requester column hidden.

**Mobile (< 768px):** cards, the whole card a link with a minimum height of 44px.

```
┌──────────────────────────────────────┐
│ TKT-2026-00042        [● URGENT]     │
│ Laptop battery drains within one hour│
│ Napat Chaiwong · Owner: Somchai I.   │
│ [In Progress]            2 days ago  │
└──────────────────────────────────────┘
```

**Pagination.** As L2 §5.4, with page sizes 10, 20, and 50, **default 20**.

**States**

| State | Presentation |
|---|---|
| Loading | Skeleton rows or cards matching the page size |
| Populated | Table or cards |
| Empty | "There are no tickets yet." Shown when `totalItems === 0` and nothing is applied. No action. |
| No results | "No tickets match your search or filters." plus Clear Filters |
| Failure | Error callout plus Retry. The control bar stays usable. |
| Forbidden | Section 5.1 |

### 6.5 IT Staff Ticket Detail (`/staff/tickets/{ticketId}`)

**Layout.** On desktop, two columns: content takes 8 of 12 columns and the
operations card 4. On tablet and mobile, one column, with the operations card
directly after the header.

**Header.** Ticket Number at `--zg-font-h1`, the status badge, the IT Priority
badge, and the appears-resolved indicator when set.

**Ticket information card.** Read-only, styled as L2 §5.5:
- Ticket Date, Requester (name and email), Category, Related System;
- Requested Priority (badge);
- Summary, Description.

**Operations card.** The only region with editable operational fields (AC-34).

| Group | Controls |
|---|---|
| Ticket Owner | The current owner's name, or "Unassigned". **Claim** (secondary) shows only when the ticket is unassigned and in a claimable status. An "Assign to" select of assignees plus **Assign** (secondary) shows in assignable statuses. |
| IT Priority | A select of the four priorities with the current value selected, plus **Save** (secondary, enabled only when changed). Hidden in CLOSED and CANCELLED, which show the badge read-only. |
| Status | The current status badge, then one button per entry in `availableTransitions` (`api-spec.md` §5.2), labelled by action (table below). No button is rendered for a transition the server did not list. |

| Target status | Button label | Level | Dialog |
|---|---|---|---|
| IN_PROGRESS (from OPEN or REOPENED) | Start work | Secondary | — |
| IN_PROGRESS (from WAITING_FOR_REQUESTER) | Resume work | Secondary | — |
| WAITING_FOR_REQUESTER | Wait for requester | Secondary | — |
| RESOLVED | Resolve | Secondary | Resolve |
| CLOSED | Close | Secondary | Close |
| REOPENED | Reopen | Secondary | Reopen (reason) |
| CANCELLED | Cancel ticket | Destructive | Cancel ticket (reason) |

After any operation succeeds, the detail is re-fetched. The screen shows server
state and never assumes the change took effect (SDS).

A `409` shows the Conflict callout with the server's message, then re-fetches.

**Conversation card.** Two tabs, "Public Comments ({n})" and "Internal Notes ({n})",
using `role="tablist"`. Only the active tab's list and composer are visible, so
only one composer exists on screen.

| Tab | List | Composer |
|---|---|---|
| Public Comments | Section 8 comment items | Textarea labelled "Reply to the requester (visible to the requester)", with a counter. **Post comment** is the screen's primary button. |
| Internal Notes | Section 8 note items | The composer sits inside the note treatment (Section 8). Textarea labelled "Internal note — not visible to Requester", with a counter. **Post internal note** is the screen's primary button. |

On CLOSED tickets, both composers are replaced by "This ticket is closed. Reopen
it to add comments or notes."

**Attachments card.** The Lab 2 attachment list, read-only: Download for active
attachments, and the removed state for removed ones. There is no Add Attachment
button and no Remove button (DEV-07).

**States.** Loading skeleton, populated, not found (Section 5.1), forbidden,
failure with Retry.

### 6.6 User Management (`/admin/users`)

**Title** "User Management".

**Toolbar.**
- Search: placeholder "Search name or email", debounced 300ms.
- Role filter: "All roles", Requester, IT Staff, Administrator.
- **Create user** (primary), right-aligned.

**Desktop table (≥ 768px).**

| Column | Content |
|---|---|
| Name | Full name. The signed-in Administrator's own row adds " (you)". |
| Email | — |
| Role | Role badge (Section 7.3) |
| Status | Account badge (Section 7.5) |
| Actions | **Edit** (tertiary), with `aria-label="Edit {fullName}"` |

**Mobile (< 768px):** one card per user, with name, email, both badges, and Edit.

**User dialog** (create and edit share the component):

| Field | Create | Edit |
|---|---|---|
| Full name | Required, 2–100 | Editable |
| Email | Required | Editable |
| Role | Required select of the three roles | Editable. Disabled on one's own row. |
| Active | Checkbox, default checked | Editable. Disabled on one's own row. |
| Initial password | Required, helper "12–128 characters. The user must change it at first sign-in." | Not shown |
| Set new initial password | — | Secondary button that opens its confirmation dialog (Section 5.2) |

On one's own row, the disabled Role and Active fields carry the helper text
"You cannot change your own role or deactivate your own account."

Save is primary, with busy text "Saving…".

**Field errors:** `422` details, and `409 EMAIL_ALREADY_EXISTS`, which appears below Email.

**Other `409`s** (`LAST_ADMINISTRATOR`, `CANNOT_*`, `USER_HAS_OPEN_TICKETS`) appear
as a Conflict callout inside the dialog, with the server's message. The dialog
stays open with the user's input kept.

**On success:** the dialog closes, the list refreshes, and the Success callout
"User saved." or "Initial password set." is shown.

**States**

| State | Presentation |
|---|---|
| Loading | Skeleton rows |
| Populated | Table or cards |
| No results | "No users match your search." plus Clear (secondary) |
| Failure | Error callout plus Retry |
| Forbidden | Section 5.1 |

There is no empty state: the signed-in Administrator always exists.

---

## 7. Badges

Badge geometry is unchanged from L2 §6. Every badge renders its value as text.

### 7.1 Status (replaces the single NEW row in L2 §6)

| Status | Display text | Background | Text | Border |
|---|---|---|---|---|
| NEW | New | `--zg-pale` | `--zg-secondary` | — |
| OPEN | Open | `--zg-surface` | `--zg-secondary` | 1px `--zg-secondary` |
| IN_PROGRESS | In Progress | `--zg-secondary` | `--zg-surface` | — |
| WAITING_FOR_REQUESTER | Waiting for Requester | `--zg-warning-bg` | `--zg-warning` | — |
| RESOLVED | Resolved | `--zg-primary` | `--zg-surface` | — |
| CLOSED | Closed | `--zg-disabled-bg` | `--zg-text-muted` | — |
| REOPENED | Reopened | `--zg-pale` | `--zg-primary` | 1px `--zg-primary` |
| CANCELLED | Cancelled | `--zg-disabled-bg` | `--zg-text-muted` | 1px `--zg-border` |

`data-testid="badge-status"`, with `data-status="{STATUS}"`.

### 7.2 IT Priority

The same colours and glyphs as the Lab 2 priority badge (L2 §6: `○ ◔ ◑ ●`).
Where both priorities appear together (Staff Detail), each badge is preceded by
its visible label, "IT Priority" or "Requested Priority".
`data-testid="badge-it-priority"`.

### 7.3 Role

| Role | Display text | Background | Text |
|---|---|---|---|
| REQUESTER | Requester | `--zg-readonly-bg` | `--zg-text-muted` |
| IT_STAFF | IT Staff | `--zg-pale` | `--zg-primary` |
| ADMINISTRATOR | Administrator | `--zg-primary` | `--zg-surface` |

`data-testid="badge-role"`. In the header, the Administrator badge carries a
1px `--zg-surface` border so it stays visible on the `--zg-primary` bar.

### 7.4 Appears-resolved indicator

- **Background and text:** `--zg-pale` background, `--zg-primary` text, `--zg-radius-sm`.
- **Full form:** "✓ Requester says the problem appears resolved · {date}".
- **Compact form** (queue): "✓ Requester: appears resolved".

`data-testid="indicator-appears-resolved"`.

### 7.5 Account status

| Value | Display text | Background | Text |
|---|---|---|---|
| Active | Active | `--zg-pale` | `--zg-success` |
| Inactive | Inactive | `--zg-disabled-bg` | `--zg-text-muted` |

`data-testid="badge-account-status"`.

---

## 8. Public Comments and Internal Notes

Each item shows:
- the author's full name at `--zg-font-label`, with their role badge;
- the server time at `--zg-font-small`, `--zg-text-muted`, absolute, with `title` holding the full ISO timestamp;
- the body at `--zg-font-body` with `white-space: pre-wrap`, rendered as a React text node only.

`dangerouslySetInnerHTML`, Markdown, and auto-linking are prohibited (BR-49, AC-49).

| Type | Treatment |
|---|---|
| Public Comment | `--zg-surface`, 1px `--zg-border`, `--zg-radius-lg`. `data-testid="comment-item-{id}"`. |
| Internal Note | `--zg-warning-bg` background, 3px left border `--zg-warning`. A label "Internal note — not visible to Requester" in `--zg-warning` at `--zg-font-small`, weight 600, above the author line. `data-testid="note-item-{id}"`. |

The difference is carried by background, border, **and** the text label, never
colour alone (AC-50).

**Empty lists**
- "No comments yet."
- "No internal notes yet."

**Validation.** Body length is checked on the client against the 2000-character
limit, with the counter turning `--zg-error` and a message below the field.
Empty or whitespace-only content is blocked with "Write something before posting."

---

## 9. Responsive rules

L2 §7 applies unchanged to every Lab 3 screen. Screen-specific rules:

| Screen | Desktop ≥ 992px | Tablet 768–991px | Mobile < 768px |
|---|---|---|---|
| Login, Change Password | Centred 480px card | Same | Full-width card with side padding `--zg-space-4` |
| Ticket Queue | 7-column table | Table without Requester | Cards |
| Staff Ticket Detail | 8/4 columns | Single column, operations after header | Single column. Operation buttons full width, stacked. |
| User Management | Table | Table | Cards |
| Dialogs | Width 560px | Width 560px | Full width minus `--zg-space-4` per side. Actions stacked. |

No horizontal page scrolling, clipping, or overlap at any width (AC-64).

---

## 10. Accessibility

Everything in L2 §8 still applies. Additions:

- The Login and Change Password error callouts use `role="alert"`. The session-ended Info callout uses `role="status"`.
- On submit with errors, focus moves to the first failing field. After a login failure, focus moves to Password.
- Tabs on Staff Detail follow the WAI-ARIA tabs pattern: arrow keys move between tabs, and each panel uses `aria-labelledby`.
- Every dialog has `role="dialog"`, `aria-modal="true"`, and `aria-labelledby` pointing at its title. Dialogs follow L2 §5.5 focus rules.
- The forbidden state renders an `<h1>` "Access denied", so screen-reader users get the same information as sighted users.
- Disabled controls on one's own User Management row carry the explanation through `aria-describedby`.
- Badges use text, so no ARIA label is needed beyond the visible text.

---

## 11. Test hooks

Same conventions as L2 §9. New hooks:

| Area | Hooks |
|---|---|
| Login | `login-screen`, `field-email`, `field-password`, `btn-sign-in`, `callout-error`, `callout-info` |
| Change Password | `change-password-screen`, `field-current-password`, `field-new-password`, `field-confirm-password`, `btn-save-password` |
| Shell | `app-shell`, `shell-user-name`, `badge-role`, `link-change-password`, `btn-logout`, `nav-my-tickets`, `nav-create-ticket`, `nav-ticket-queue`, `nav-user-management` |
| Shared | `state-forbidden`, `state-not-found`, `callout-conflict`, `callout-success`, `confirm-dialog`, `btn-confirm`, `btn-dialog-cancel`, `field-dialog-reason` |
| Requester Detail | `resolution-panel`, `btn-appears-resolved`, `indicator-appears-resolved`, `comments-card`, `field-comment-body`, `btn-post-comment` |
| Queue | `staff-queue-screen`, `queue-row-{ticketNumber}`, `queue-card-{ticketNumber}`, `filter-status`, `filter-it-priority`, `filter-category`, `filter-owner`, `sort-select`, `badge-status`, `badge-it-priority` |
| Staff Detail | `staff-ticket-detail-screen`, `operations-card`, `btn-claim`, `field-assignee`, `btn-assign`, `field-it-priority`, `btn-save-it-priority`, `btn-transition-{STATUS}`, `tab-comments`, `tab-notes`, `field-note-body`, `btn-post-note`, `comment-item-{id}`, `note-item-{id}` |
| User Management | `user-management-screen`, `user-row-{email}`, `user-card-{email}`, `filter-role`, `btn-create-user`, `user-dialog`, `field-full-name`, `field-user-email`, `field-role`, `field-active`, `field-initial-password`, `btn-save-user`, `btn-set-initial-password`, `badge-account-status` |

---

## 12. Screenshot paths

Captured by Playwright at the Lab 2 viewports: desktop 1440×900, tablet 834×1112,
mobile 390×844. The four folders follow the labsheet's repository increment.

```
artifacts/lab-03/screenshots/
├── authentication/
│   ├── {desktop,tablet,mobile}-login.png
│   ├── desktop-login-validation.png
│   ├── desktop-login-busy.png
│   ├── desktop-login-invalid.png
│   ├── desktop-login-inactive.png
│   ├── {desktop,tablet,mobile}-change-password-forced.png
│   ├── desktop-change-password-validation.png
│   ├── desktop-shell-requester.png
│   ├── desktop-shell-it-staff.png
│   ├── desktop-shell-administrator.png
│   ├── mobile-shell-menu-open.png
│   └── desktop-forbidden.png
├── staff-queue/
│   ├── {desktop,tablet,mobile}-populated.png
│   ├── desktop-filtered.png
│   ├── desktop-no-results.png
│   └── desktop-failure.png
├── staff-ticket-detail/
│   ├── {desktop,tablet,mobile}-view.png
│   ├── desktop-notes-tab.png
│   ├── desktop-cancel-dialog.png
│   ├── desktop-conflict.png
│   ├── desktop-closed.png
│   ├── {desktop,tablet,mobile}-requester-detail-comments.png
│   └── desktop-requester-appears-resolved.png
└── user-management/
    ├── {desktop,tablet,mobile}-list.png
    ├── desktop-create-dialog.png
    ├── desktop-edit-dialog-self.png
    ├── desktop-duplicate-email.png
    ├── desktop-last-administrator.png
    └── desktop-open-tickets-conflict.png
```

`{desktop,tablet,mobile}-x.png` means three files, one per viewport.

---

## 13. Visual inspection checklist

Completed against the Section 12 screenshots and recorded in `tests.md`
Section 6. Every row is checked at all three widths.

Rows 1–21 of L2 §11 apply to the Lab 3 screens unchanged. L2 row 22, the
development notice, is retired: the notice is removed (UI-14).

| # | Check |
|---|---|
| 23 | The shell shows the user's name and role badge on every authenticated screen |
| 24 | The navigation shows only the destinations permitted for the role |
| 25 | Status, IT Priority, role, and account badges show text, not colour alone |
| 26 | Internal Notes are distinguishable from Public Comments by label as well as colour |
| 27 | Only the operations card on Staff Detail contains editable ticket fields |
| 28 | Every confirmation dialog is fully visible, with stacked actions at mobile width |
| 29 | The forbidden state, not-found state, and conflict callout are visually distinct from the error callout |
| 30 | Forced Change Password mode shows no navigation |
| 31 | No horizontal page scrolling on the Queue or User Management at 390px |
