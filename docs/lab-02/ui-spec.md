# Lab 2 UI Specification — Zen Green Theme

**Project:** TokTickIT — Requester Ticketing MVP
**Companion documents:** `specification.md` (FR/BR/AC), `api-spec.md` (contract), `tests.md` (traceability)
**Status:** Draft for approval — must be merged before implementation PRs begin

This document is binding. **No colour, spacing value, font size, or component state may appear in the implementation that is not listed here** (AC-44). Later sprints reuse this system rather than inventing a new one.

---

## 1. Design tokens

### 1.1 Colour

The four values marked *fixed* are mandated by the Lab 2 handout. The remainder are derived and chosen to meet WCAG 2.1 AA contrast against their stated background.

| Token | Hex | Use | Contrast |
|---|---|---|---|
| `--zg-primary` | `#006B3C` *fixed* | App header, primary buttons, strong emphasis | 6.4:1 on white — AA |
| `--zg-secondary` | `#0B7A46` *fixed* | Active tab, focus ring, links, hover | 5.6:1 on white — AA |
| `--zg-pale` | `#EAF6EF` *fixed* | Selected rows, success background, subtle section emphasis | background only |
| `--zg-bg` | `#F5F7F6` *fixed* | Page background | background only |
| `--zg-surface` | `#FFFFFF` | Cards, panels, table surface | background only |
| `--zg-border` | `#C9D4CD` | Default control and card border | — |
| `--zg-border-strong` | `#0B7A46` | Focused control border | — |
| `--zg-text` | `#1B2A22` | Body and heading text — dark charcoal-green, never pure black | 14.8:1 on `--zg-bg` — AAA |
| `--zg-text-muted` | `#4A5C52` | Helper text, metadata, table secondary text | 7.9:1 on white — AAA |
| `--zg-readonly-bg` | `#EDF1EE` | Read-only and system-generated field background | background only |
| `--zg-disabled-bg` | `#F0F2F1` | Disabled control background | background only |
| `--zg-disabled-text` | `#8A968F` | Disabled control text | 3.1:1 — disabled controls are exempt from AA |
| `--zg-error` | `#B3261E` | Validation message text, invalid field border, destructive button | 6.4:1 on white — AA |
| `--zg-error-bg` | `#FDECEA` | Invalid field background tint, error callout | background only |
| `--zg-warning` | `#8A5A00` | Warning callout text | 5.9:1 on `--zg-warning-bg` — AA |
| `--zg-warning-bg` | `#FFF4E5` | Warning callout and HIGH priority badge background | background only |
| `--zg-success` | `#006B3C` | Success confirmation text | 6.4:1 on `--zg-pale` — AA |

**Rules**

- Warning colour is reserved for warnings. It is never used as ordinary decoration.
- No state is communicated by colour alone. Every badge, validation message, and confirmation carries text (AC-43).
- Any colour appearing in a stylesheet or component that is absent from this table is a defect.

> **Deviation DEV-01 from System-Level SDS D-09.** The approved system-level baseline specifies the KMUTT palette (Orange `#FA4616`, Yellow `#FFC72C`, Blue Grey `#7B8189`). Lab 2 uses Zen Green because the handout fixes these tokens and grades against them. The deviation is confined to hue; the D-09 accessibility rule that status and priority are never conveyed by colour alone is preserved unchanged. A D-09 amendment is required before this baseline is reused in a later sprint.

### 1.2 Typography

Bootstrap's system font stack is retained. No web font is loaded.

| Token | Size / weight / line-height | Use |
|---|---|---|
| `--zg-font-h1` | 28px / 600 / 1.3 | Screen title |
| `--zg-font-h2` | 22px / 600 / 1.35 | Section heading, card title |
| `--zg-font-h3` | 18px / 600 / 1.4 | Sub-section, field group heading |
| `--zg-font-body` | 16px / 400 / 1.5 | Body text, input values |
| `--zg-font-label` | 14px / 600 / 1.4 | Field labels, table headers |
| `--zg-font-small` | 13px / 400 / 1.45 | Helper text, validation messages, metadata |

Body text is never below 13px. Labels use one consistent weight across every screen.

### 1.3 Spacing

A 4px base scale. No arbitrary pixel values.

| Token | Value | Use |
|---|---|---|
| `--zg-space-1` | 4px | Icon-to-text gap |
| `--zg-space-2` | 8px | Label-to-control, message-to-control |
| `--zg-space-3` | 12px | Inside compact controls |
| `--zg-space-4` | 16px | Between form fields, card padding |
| `--zg-space-5` | 24px | Between field groups |
| `--zg-space-6` | 32px | Between page sections |
| `--zg-space-7` | 48px | Page top and bottom margin |

### 1.4 Radius, border, elevation

| Token | Value |
|---|---|
| `--zg-radius-sm` | 4px — badges, small controls |
| `--zg-radius-md` | 6px — inputs, buttons |
| `--zg-radius-lg` | 8px — cards, panels |
| `--zg-border-width` | 1px |
| `--zg-shadow-card` | `0 1px 3px rgba(27, 42, 34, 0.08)` — restrained, never a heavy drop shadow |

---

## 2. Control states

Every form control implements all six states. Each is verified by a UI style assertion in `tests.md`.

| State | Background | Border | Text | Additional |
|---|---|---|---|---|
| Editable | `--zg-surface` | 1px `--zg-border` | `--zg-text` | — |
| Focused | `--zg-surface` | 1px `--zg-border-strong` | `--zg-text` | 3px outer ring `--zg-secondary` at 35% opacity, always visible for keyboard users |
| Read-only | `--zg-readonly-bg` | 1px `--zg-border` | `--zg-text` | `readonly` attribute; not greyed to the point of being unreadable |
| Invalid | `--zg-error-bg` | 1px `--zg-error` | `--zg-text` | `aria-invalid="true"`, `aria-describedby` pointing at the message |
| Disabled | `--zg-disabled-bg` | 1px `--zg-border` | `--zg-disabled-text` | `disabled` attribute; cannot receive focus or be activated |
| Busy | as editable | as editable | as editable | `aria-busy="true"`; control is disabled for the duration |

Read-only and disabled are visually distinct from each other. Read-only means "you may read this value"; disabled means "this control is unavailable right now".

### 2.1 Required fields and validation placement

- A required field's label carries a red asterisk in `--zg-error`, with `aria-hidden="true"` on the asterisk and the required state conveyed to assistive technology by the `required` attribute.
- The asterisk never substitutes for a validation message (BR handout rule; AC-41).
- The validation message renders **immediately below its own field**, at `--zg-font-small` in `--zg-error`, separated by `--zg-space-2`.
- A summary at the top of the form is permitted **in addition to** field-level messages, never instead of them.
- Messages are sentence case, name the problem, and state the fix. "Ticket Summary must be at least 10 characters." Not "Invalid input."

---

## 3. Button hierarchy

| Level | Appearance | Use |
|---|---|---|
| Primary | Solid `--zg-primary`, white text, `--zg-radius-md` | The one main action per screen: Continue, Submit Ticket, Upload |
| Secondary | Transparent, 1px `--zg-primary` border, `--zg-primary` text | Cancel, Back, Clear Filters |
| Tertiary | No border, `--zg-secondary` text, underline on hover | Low-weight inline actions: Change Requester, Download |
| Destructive | Solid `--zg-error`, white text | Remove Attachment |
| Disabled | `--zg-disabled-bg`, `--zg-disabled-text`, no border | Any level when unavailable |
| Busy | Retains its level's colours, shows a spinner plus changed text, `disabled` and `aria-busy="true"` | Submit while a request is in flight |

**Rules**

- Exactly one primary button per screen.
- Every button has visible text. Icons may accompany text; they never replace it.
- Every icon-only control has an `aria-label` and a tooltip.
- Busy text names the operation: "Submitting…", "Uploading…", "Removing…".

---

## 4. Application shell

Present on every screen after a Requester is selected.

| Element | Behaviour |
|---|---|
| Brand | "TokTickIT" in white on a `--zg-primary` header bar, links to My Tickets |
| Navigation | My Tickets, Create Ticket |
| Active indication | Active item carries a 3px bottom border in white plus `aria-current="page"`. Never colour alone. |
| Requester display | "Acting as: {fullName}" in the header, right-aligned on desktop |
| Change Requester | Tertiary button beside the Requester display (FR-04) |
| Mobile | Below 768px the navigation collapses to a toggle button with `aria-expanded`; the Requester display moves inside the expanded panel |

A persistent notice below the header on every screen reads: *"Development mode — Requester identity is simulated for Lab 2 testing. This is not a login."* This is a specification requirement, not a stylistic choice (BR-03).

---

## 5. Screen specifications

### 5.1 Development Requester Selection

Centred card, maximum width 480px, on `--zg-bg`.

| Element | Detail |
|---|---|
| Title | "TokTickIT" at `--zg-font-h1` |
| Explanatory text | "Select a Development Requester to test requester-specific ticket behaviour. This is not a login screen. Authentication and role-based access will be introduced in Lab 3." At `--zg-font-small`, `--zg-text-muted`. |
| Dropdown | Labelled "Development Requester", populated from `GET /api/v1/dev-requesters`, shows `fullName` with `email` as secondary text |
| Continue | Primary button, disabled until a selection is made |

**States**

| State | Presentation |
|---|---|
| Loading | Skeleton in place of the dropdown, Continue disabled, `aria-busy="true"` on the card |
| Loaded | Dropdown populated with active Requesters only |
| Empty | "No active Development Requesters exist. Seed the database before continuing." Dropdown and Continue both absent (AC-06). |
| Failure | "Could not load Development Requesters." plus a Retry secondary button. No status code, no stack trace (AC-05). |

### 5.2 Create Ticket

Single card, maximum width 880px on desktop.

**Field order and grouping**

1. **System-generated group** — Ticket Number ("Will be generated on submission"), Ticket Date (today), Requester (the selected Requester's name). All three render in the read-only state, visually distinct from editable fields.
2. **Classification group** — Category and Related System side by side on desktop and tablet, stacked on mobile. Requested Priority below them.
3. **Detail group** — Ticket Summary at full width, Description as a textarea at full width, minimum 6 rows, vertically resizable only within the card bounds.
4. **Attachments** — below the detail group.
5. **Actions** — bottom right on desktop, full-width stacked on mobile. Submit Ticket (primary), Cancel (secondary).

**States**

| State | Presentation |
|---|---|
| Initial | Empty editable fields, read-only system fields populated, Submit enabled |
| Loading reference data | Category and Related System show a loading placeholder and are disabled |
| Validation failure | Each failing field enters the invalid state with its message directly below; focus moves to the first failing field |
| Submitting | Submit shows busy state "Submitting…", all fields disabled, Cancel disabled |
| Success | Card is replaced by a success panel on `--zg-pale`: a checkmark icon, the text "Ticket created", the Ticket Number at `--zg-font-h2`, and two actions — View Ticket (primary) and Create Another (secondary) |
| Partial success | Success panel as above, plus a warning callout listing each attachment that failed and its reason, with the text "The ticket was saved. Retry these attachments from Ticket Detail." (AC-38) |
| API failure | Error callout above the actions, all entered values retained, Submit re-enabled (AC-16) |

### 5.3 Attachment selection

| State | Presentation |
|---|---|
| Empty | Dashed 1px `--zg-border` drop zone: "Attach evidence (optional)" plus permitted types and limits stated in text: "JPG, PNG, WEBP, or PDF. Maximum 5 MB each, up to 5 files." |
| Selected | One row per file: filename, human-readable size, remove-from-selection tertiary button |
| Uploading | Row shows a determinate progress bar and "Uploading…", the remove button is disabled |
| Invalid | Row enters the invalid state with the reason beside it: "File type not permitted" or "File exceeds 5 MB". The file is excluded from submission but stays visible so the Requester knows it was rejected. |
| Limit reached | Drop zone is disabled with "Maximum of 5 attachments reached." |

Filenames are truncated with an ellipsis in the middle, never clipped at the edge, and carry the full name in a `title` attribute.

### 5.4 My Tickets

**Control bar** — above the results, one row on desktop, stacked on mobile.

| Control | Detail |
|---|---|
| Search | Text input with a search icon, placeholder "Search ticket number or summary", debounced 300ms |
| Filters | Three dropdowns: Category, Related System, Requested Priority. Each includes an "All" option. |
| Sort | Dropdown combining field and direction: "Newest first" (default), "Oldest first", "Ticket Number A–Z", "Priority: Urgent first", "Recently updated" |
| Clear Filters | Secondary button, visible only when at least one filter, search term, or non-default sort is applied |

**Desktop table (≥ 992px)**

| Column | Notes |
|---|---|
| Ticket Number | Monospace, links to Ticket Detail |
| Summary | Truncated to one line with ellipsis, full text in `title` |
| Category | — |
| Related System | — |
| Priority | Badge |
| Status | Badge |
| Last Updated | Relative for under 7 days ("2 days ago"), absolute date beyond |

Header row on `--zg-pale`, rows on `--zg-surface`, 1px `--zg-border` row separator, hover tint `--zg-pale`.

**Tablet (768–991px)** — the same table with Related System hidden. All other columns retained.

**Mobile (< 768px)** — cards, one per Ticket:

```
┌──────────────────────────────────────┐
│ TKT-2026-00042          [HIGH]       │
│ Laptop battery drains within one hour│
│ Hardware · Corporate Laptop          │
│ [New]                  2 days ago    │
└──────────────────────────────────────┘
```

The whole card is the link target, minimum touch height 44px.

**Pagination** — below the results. Previous / Next, current page indicator, page size selector (10, 20, 50), and a count: "Showing 1–10 of 37". Disabled Previous on the first page and Next on the last. On mobile, only Previous, the indicator, and Next.

**States**

| State | Presentation |
|---|---|
| Loading | Skeleton rows or cards matching the current page size |
| Populated | Table or cards as above |
| Empty | "You have not created any tickets yet." plus a Create Ticket primary button. Shown when `totalItems === 0` and no search or filter is applied. |
| No results | "No tickets match your search or filters." plus a Clear Filters secondary button. Shown when `totalItems === 0` and any search or filter is applied. Distinct wording and distinct action from the empty state (AC-25). |
| Failure | Error callout plus Retry. Control bar remains usable so the Requester can adjust and try again. |

### 5.5 Requester Ticket Detail

Two clearly separated regions. The ticket region carries no interactive control; the attachment region carries all of them.

**Ticket information** — read-only. Two columns on desktop, one on mobile.

Ticket Number, Ticket Date, Requester, Current Status (badge), Category, Related System, Requested Priority (badge), Ticket Summary, Description. Description preserves line breaks and wraps; it is never truncated.

Every value renders in the read-only state. No input, no edit button, no status control anywhere on this screen.

**Attachments** — separate card headed "Attachments", with an Add Attachment primary button when fewer than five active attachments exist.

| Attachment state | Presentation |
|---|---|
| Active | Type icon, original filename, size, upload date, Download tertiary button, Remove destructive button |
| Uploading | Filename, determinate progress bar, "Uploading…", no action buttons |
| Invalid | Filename, `--zg-error` message naming the reason, Dismiss tertiary button. Never persisted. |
| Removed | Filename and size in `--zg-text-muted`, a "Removed" badge, the removal reason, the removal timestamp. **No Download button.** Left border 3px `--zg-border` to set it apart visually as well as by badge (AC-35). |
| Unavailable | Shown when an upload fails **during the current session**, on the screen where it was attempted. Filename, "Upload failed", and a Retry tertiary button. The row exists only in that session's state and is gone on reload. |

> **Correction to the Unavailable state.** This row originally read "Shown when
> an upload failed after the Ticket was created", which described a state the
> data model cannot support. A failed upload persists nothing: no row is
> written, no file is stored, and the ticket carries no record that the attempt
> happened. A Ticket Detail screen loaded afterwards therefore has nothing to
> render the state from, and no amount of implementation could make it appear.
>
> The state is real and useful within the session that attempted the upload,
> where the filename and the failure are still in memory, so it is narrowed to
> that rather than removed. Making it survive a reload would need a persisted
> record of failed attempts, which nothing in Lab 2 specifies and which would
> mean writing rows for files that were never stored.
>
> Corrected while implementing #18, which is where the gap surfaced.

**Removal flow** — Remove opens a modal: the filename, a required "Reason for removal" textarea (5–200 characters, validated), Cancel (secondary), and Remove (destructive). The modal traps focus, closes on Escape, and returns focus to the triggering button. Removal is never a single unconfirmed click (BR-37).

---

## 6. Badges

Badge = `--zg-radius-sm`, `--zg-font-small`, weight 600, padding `--zg-space-1` / `--zg-space-3`. Always renders the value as text.

| Value | Background | Text |
|---|---|---|
| Priority LOW | `--zg-readonly-bg` | `--zg-text-muted` |
| Priority MEDIUM | `--zg-pale` | `--zg-primary` |
| Priority HIGH | `--zg-warning-bg` | `--zg-warning` |
| Priority URGENT | `--zg-error-bg` | `--zg-error` |
| Status NEW | `--zg-pale` | `--zg-secondary` |
| Attachment REMOVED | `--zg-disabled-bg` | `--zg-text-muted` |

Priority badges additionally carry a leading glyph — `○ ◔ ◑ ●` for Low through Urgent — so severity survives greyscale printing and colour-vision deficiency.

Only `NEW` is reachable in Lab 2. The remaining D-02 statuses are deliberately unstyled; adding them would be Lab 3 scope leaking into this sprint.

---

## 7. Responsive rules

| Viewport | Rules |
|---|---|
| Desktop ≥ 992px | Multi-column layouts as specified. Content centred, maximum width 1200px. Ticket list as a table. |
| Tablet 768–991px | Two columns where practical. Summary and Description keep full width. Table drops Related System. |
| Mobile < 768px | Everything stacks. Touch targets minimum 44×44px. Ticket list as cards. Navigation collapses. Actions become full width. |
| All sizes | No horizontal page scrolling. No clipped label, overlapping message, hidden button, or unreadable attachment filename. |

Breakpoints align with Bootstrap `md` (768px) and `lg` (992px), so the grid utilities already in the project are reused rather than replaced.

---

## 8. Accessibility

- Every input has a programmatically associated `<label>`. Placeholder text is never the only label.
- Validation messages are linked by `aria-describedby`; invalid controls carry `aria-invalid="true"`.
- Focus is visible on every interactive element and is never removed by `outline: none` without a replacement.
- Tab order follows visual order. The modal traps focus and restores it on close.
- Status, priority, validity, and removal state are conveyed by text or glyph, never by colour alone.
- Icon-only controls carry `aria-label` and a tooltip.
- Live regions: submission results and list-loading completion announce via `aria-live="polite"`.
- Target contrast is WCAG 2.1 AA for all text except disabled controls.

---

## 9. Test hooks

UI style and component assertions target stable `data-testid` attributes, never CSS classes, so that styling can be refactored without breaking tests.

| Convention | Example |
|---|---|
| Screen root | `data-testid="create-ticket-screen"` |
| Field | `data-testid="field-summary"` |
| Validation message | `data-testid="error-summary"` |
| Button | `data-testid="btn-submit-ticket"` |
| State region | `data-testid="state-no-results"` |
| List row | `data-testid="ticket-row-{ticketNumber}"` |
| Attachment row | `data-testid="attachment-row-{id}"` |
| Badge | `data-testid="badge-priority"` |

---

## 10. Screenshot paths

Captured by Playwright at three viewport widths: desktop 1440×900, tablet 834×1112, mobile 390×844.

```
artifacts/lab-02/screenshots/
├── create-ticket/
│   ├── desktop-initial.png
│   ├── desktop-validation-failure.png
│   ├── desktop-submitting.png
│   ├── desktop-success.png
│   ├── desktop-api-failure.png
│   ├── desktop-invalid-attachment.png
│   ├── tablet-initial.png
│   └── mobile-initial.png
├── my-tickets/
│   ├── desktop-populated.png
│   ├── desktop-filtered.png
│   ├── desktop-empty.png
│   ├── desktop-no-results.png
│   ├── tablet-populated.png
│   └── mobile-cards.png
├── ticket-detail/
│   ├── desktop-view.png
│   ├── desktop-attachment-removed.png
│   ├── desktop-removal-modal.png
│   ├── tablet-view.png
│   └── mobile-view.png
└── requester-selection/
    ├── desktop-loaded.png
    ├── desktop-empty.png
    └── desktop-failure.png
```

---

## 11. Visual inspection checklist

Completed against the screenshots above and recorded in `tests.md`. Every row is checked at all three viewport widths.

| # | Check |
|---|---|
| 1 | Every colour used appears in the Section 1.1 token table |
| 2 | Header, primary buttons, and strong emphasis use `--zg-primary` |
| 3 | Editable and read-only fields are visually distinguishable at a glance |
| 4 | Read-only fields remain readable — not greyed into illegibility |
| 5 | Disabled controls are distinct from read-only fields |
| 6 | Every required field shows a red asterisk |
| 7 | Every validation message sits directly below its own field |
| 8 | Exactly one primary button per screen |
| 9 | The submit button shows a busy state and is disabled while submitting |
| 10 | Every button has visible text; no icon-only control lacks a label |
| 11 | Keyboard focus is visible on every interactive element |
| 12 | No label, message, or button is clipped |
| 13 | No overlapping text or controls |
| 14 | No horizontal page scrolling |
| 15 | Attachment filenames are readable and not clipped at the edge |
| 16 | Priority and status badges show text, not colour alone |
| 17 | Removed attachments show no download control |
| 18 | Empty state and no-results state are worded differently and offer different actions |
| 19 | Mobile ticket list renders as cards, not a squeezed table |
| 20 | Search, filters, sort, and pagination all remain usable at 390px |
| 21 | Touch targets are at least 44×44px on mobile |
| 22 | The "not a login" development notice is present on every screen |
