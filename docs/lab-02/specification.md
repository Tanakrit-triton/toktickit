# Lab 2 Sprint Engineering Specification

**Project:** TokTickIT — Requester Ticketing MVP with UI Foundation
**Sprint:** Lab 2 (Sprint 2)
**Author:** Tanakrit (67070503464)
**Status:** Draft for approval — must be merged before implementation PRs begin
**Inherits:** TokTickIT System-Level SDS v1.0 (Decision Register D-01 … D-12)

---

## 1. Sprint Goal

Deliver the Requester-facing slice of TokTickIT so that a person with an IT problem can describe it, classify it, attach supporting evidence, submit it, and afterwards find and inspect their own ticket. The sprint also establishes the reusable UI foundation — form, list, badge, validation, loading, empty, error, and responsive conventions — that later sprints extend rather than reinvent. Because authentication arrives in Lab 3, a temporary Development Requester selector supplies the current identity so that multi-user ownership behaviour can be built and tested now.

---

## 2. Stakeholder Request Interpretation

The IT department wants to stop collecting support requests informally and start receiving them through the product. The essential value is not the form itself but the guarantee that follows submission: the system, not the user, issues the official Ticket Number; the data is stored durably; and one Requester can never see another Requester's ticket.

Three things in the request need engineering interpretation:

**"Provide a temporary Development Requester Selection screen as user login screen."** This is a test fixture, not a security control. It establishes which Requester the session is acting as so that ownership rules are exercised. It must be visibly labelled as such in the UI, and no part of the implementation may treat it as proof of identity. Lab 3 replaces it with real sessions per D-04.

**"Manage permitted attachments."** "Permitted" carries two meanings that must both be enforced: permitted by file policy (type, size, count) and permitted by ownership (a Requester may only touch attachments on their own tickets). Removal is soft — the record of the file having existed is part of the ticket's history and must survive.

**"Establish a consistent Zen Green Theme."** The theme is a deliverable of this sprint, not decoration. It is documented in `ui-spec.md` and verified by automated style assertions and screenshots, because later sprints are required to reuse it.

---

## 3. Scope

### Included

- Development Requester selection screen, selected-Requester context, and Change Requester action
- Reference data retrieval: active Categories, active Related Systems, active Development Requesters
- Create Ticket screen: full form, client and server validation, submission, success and failure states
- Backend-generated official Ticket Number
- Attachment upload during ticket creation and on an existing owned ticket
- My Tickets screen: Requester-scoped list with search, filtering, sorting, and pagination
- Requester Ticket Detail screen: read-only ticket information and attachment section
- Attachment download and soft removal with reason
- Ownership enforcement on every Requester-scoped API and screen
- Zen Green theme tokens and reusable components, documented in `ui-spec.md`
- Responsive layouts at desktop, tablet, and mobile breakpoints
- Loading, empty, no-results, validation, and failure states across all screens
- Automated tests at unit, API, UI component, UI style, responsive, and E2E levels

### Excluded

Explicitly out of scope for Lab 2. Any of these appearing in the implementation is a defect.

- **Authentication and security:** login, logout, passwords, hashing, sessions, tokens, real role-based authorization. The Development Requester selector is not authentication.
- **IT Staff workflow:** staff dashboard or queue, claiming, reassigning, setting IT Priority, any ticket-owner function.
- **Ticket collaboration:** Public Comments, Internal Notes, Actions Taken.
- **Ticket lifecycle beyond creation:** any status change after the initial `New` status — resolution confirmation, resolving, closing, reopening, cancelling.
- **Administration:** management of users, Requesters, roles, or reference data.
- **Attachment preview/thumbnail rendering:** download only in Lab 2.

---

## 4. Functional Requirements

### Development Requester context

| ID | Requirement |
|---|---|
| FR-01 | The system shall retrieve the list of active Development Requesters from the database and present them for selection. |
| FR-02 | The system shall allow the user to select one Development Requester and enter the application with that Requester as the current context. |
| FR-03 | The system shall display the currently selected Requester's name in the application shell on every screen. |
| FR-04 | The system shall provide a Change Requester action that returns the user to the selection screen and reloads all Requester-specific data. |
| FR-05 | The system shall redirect any attempt to reach a Requester-scoped screen without a selected Requester to the Development Requester Selection screen. |

### Reference data

| ID | Requirement |
|---|---|
| FR-06 | The system shall retrieve active Ticket Categories from the database for use in ticket classification. |
| FR-07 | The system shall retrieve active Related Systems from the database for use in ticket classification. |

### Ticket creation

| ID | Requirement |
|---|---|
| FR-08 | The system shall allow the selected Requester to create a Ticket capturing Category, Related System, Ticket Summary, Requested Priority, and Description. |
| FR-09 | The system shall generate the official Ticket Number on the backend and return it in the creation response. |
| FR-10 | The system shall validate ticket input on both the client and the server, and reject invalid input on the server regardless of client behaviour. |
| FR-11 | The system shall display field-level validation messages adjacent to the field that failed. |
| FR-12 | The system shall prevent duplicate submission of the same ticket caused by repeated activation of the submit control. |
| FR-13 | The system shall preserve all entered form values when submission fails, so that the Requester can correct and retry without re-entry. |
| FR-14 | The system shall allow the Requester to select attachments during ticket creation, subject to the attachment policy. |
| FR-15 | The system shall display the generated Ticket Number and a clear next action on successful creation. |

### My Tickets

| ID | Requirement |
|---|---|
| FR-16 | The system shall list only the Tickets owned by the currently selected Requester. |
| FR-17 | The system shall support keyword search across Ticket Number and Ticket Summary. |
| FR-18 | The system shall support filtering the ticket list by Category, Related System, and Requested Priority. |
| FR-19 | The system shall support sorting the ticket list by a documented set of sortable fields in ascending or descending order. |
| FR-20 | The system shall paginate the ticket list and return pagination metadata sufficient to render page controls. |
| FR-21 | The system shall provide a Clear Filters action that resets search, filters, and sorting to their defaults. |
| FR-22 | The system shall distinguish the empty state (the Requester owns no Tickets) from the no-results state (filters or search matched nothing). |
| FR-23 | The system shall provide a Create Ticket action from the My Tickets screen. |

### Ticket Detail and attachments

| ID | Requirement |
|---|---|
| FR-24 | The system shall display a single owned Ticket with all ticket information rendered read-only. |
| FR-25 | The system shall list the Ticket's attachments, showing active and removed attachments in visually distinct states. |
| FR-26 | The system shall allow the owning Requester to add an attachment to an existing Ticket, subject to the attachment policy. |
| FR-27 | The system shall allow the owning Requester to download an active attachment. |
| FR-28 | The system shall allow the owning Requester to soft-remove an active attachment after confirmation and entry of a removal reason. |
| FR-29 | The system shall retain the metadata of a removed attachment and display it as removed. |
| FR-30 | The system shall refuse download of a removed attachment. |

### Cross-cutting

| ID | Requirement |
|---|---|
| FR-31 | The system shall reject any request for a Ticket or Attachment that is not owned by the currently selected Requester, without disclosing whether the resource exists. |
| FR-32 | The system shall render every screen usably at desktop, tablet, and mobile viewport sizes without horizontal page scrolling. |
| FR-33 | The system shall present a distinct loading state for every asynchronous data operation. |
| FR-34 | The system shall present a safe failure state, with no stack traces or internal detail, whenever a backend call fails. |
| FR-35 | The system shall provide accessible labels for all controls, visible keyboard focus indicators, and non-colour indicators for status and priority. |

---

## 5. Business Rules

### Ticket defaults and system-generated values

| ID | Rule |
|---|---|
| BR-01 | The official Ticket Number is generated by the backend and must be unique. |
| BR-02 | A new Ticket begins with Current Status `New`. |
| BR-04 | The Ticket Number format is `TKT-YYYY-NNNNN`, where `YYYY` is the creation year and `NNNNN` is a zero-padded sequence that resets annually. Inherited from D-10. |
| BR-05 | The Ticket Number is allocated inside the same database transaction that inserts the Ticket, so that no gap or duplicate can result from concurrent creation. |
| BR-06 | Ticket Date is the system-recorded creation timestamp. It is not editable by the Requester. |
| BR-07 | Ticket Number, Ticket Date, Requester, and Current Status are read-only on every screen in Lab 2. |
| BR-08 | The Requester of a Ticket is taken from the selected Development Requester context on the server side. A `requesterId` supplied by the client is ignored for ownership purposes and used only for consistency checking. |
| BR-09 | All timestamps are stored in UTC. Inherited from the System-Level SDS data conventions. |

### Development Requester selection and switching

| ID | Rule |
|---|---|
| BR-03 | Lab 2 uses a Development Requester selector instead of login. The selected identity is for testing only and is not authentication. |
| BR-10 | Only Requesters marked active appear in the selector. An inactive Requester is never selectable. |
| BR-11 | The selected Requester is held in client-side session storage and sent to the API on every Requester-scoped request. It carries no cryptographic guarantee and must not be described as a credential. |
| BR-12 | Changing the selected Requester discards all cached Requester-specific data and reloads it for the new Requester. |
| BR-13 | If a Requester is selected and later becomes inactive, the next Requester-scoped request is rejected and the user is returned to the selection screen. |
| BR-14 | If no active Requester exists, the selection screen shows an empty state and offers no way to enter the application. |
| BR-15 | In Lab 3, the selector is removed and the identity source becomes the authenticated session defined in D-04. No Lab 2 code may assume the selector persists. |

### Ownership and access

| ID | Rule |
|---|---|
| BR-16 | A Ticket belongs to exactly one Requester and that ownership never changes in Lab 2. |
| BR-17 | Ownership is enforced on the server for every Requester-scoped resource. Client-side hiding is a convenience, never the control. |
| BR-18 | A request for a Ticket or Attachment owned by a different Requester is answered as if the resource does not exist, so that ownership failure does not disclose existence. |

### Validation

| ID | Rule |
|---|---|
| BR-19 | Ticket Summary is required. It is trimmed before validation and storage, and must be 10–150 characters after trimming. The lower bound rejects placeholder entries such as "help"; the upper bound keeps the value readable as a single-line list column. |
| BR-20 | Description is required. It is trimmed before validation and storage, and must be 20–5000 characters after trimming. The lower bound forces a usable problem statement; the upper bound is well above realistic use and bounds the request body. |
| BR-21 | Category, Related System, and Requested Priority are required. |
| BR-22 | The submitted Category and Related System must exist and be active. A reference to an inactive or unknown record is a validation failure. |
| BR-23 | Requested Priority must be one of `Low`, `Medium`, `High`, `Urgent`. Inherited from D-03. |
| BR-24 | Server-side validation is authoritative. Client-side validation exists to improve feedback speed and never to replace it. |
| BR-25 | The submit control is disabled and shows a busy state from the moment a submission starts until the response is handled, which prevents duplicate creation by repeated clicking. |
| BR-26 | Validation failure returns every failing field in one response, so the Requester can correct all problems in a single pass. |

### Failure behaviour

| ID | Rule |
|---|---|
| BR-27 | A failed submission never clears the form. All entered values, including the attachment selection list, are retained. |
| BR-28 | Error responses never expose stack traces, SQL, file paths, or internal identifiers. |
| BR-29 | All API errors use the shape `{ "error": { "code": string, "message": string, "details"?: object } }`. A bare string or a differently shaped body is a contract violation. |

### Attachments

| ID | Rule |
|---|---|
| BR-30 | Allowed attachment types are JPG/JPEG, PNG, WEBP, and PDF. Type is validated by extension and by declared MIME type; a mismatch is rejected. |
| BR-31 | Maximum attachment size is 5 MB per file. |
| BR-32 | A Ticket may have at most five active attachments. Removed attachments do not count toward this limit. |
| BR-33 | Stored attachment metadata comprises: original filename, stored filename, MIME type, byte size, uploader Requester, and upload timestamp. |
| BR-34 | The stored filename is a server-generated UUID plus the validated extension. The client-supplied filename is never used to build a storage path, which removes path traversal as a risk. |
| BR-35 | Attachment removal is soft. The attachment row is retained and marked with removal timestamp, removing Requester, and removal reason. |
| BR-36 | A removal reason is required, is trimmed, and must be 5–200 characters after trimming. |
| BR-37 | Removal requires explicit confirmation in the UI before the request is sent. |
| BR-38 | Only the owning Requester may add, download, or remove attachments on a Ticket. |
| BR-39 | A removed attachment is not downloadable. Its binary is deleted from storage at removal time while its metadata is retained, per D-11. Metadata therefore survives; the file does not. |
| BR-40 | A removed attachment remains visible in the attachment list in a removed state showing its filename, size, removal reason, and removal time, with no download control. |
| BR-41 | Ticket creation and attachment upload are separate operations. The Ticket is created and committed first; attachments are uploaded afterwards against the created Ticket. |
| BR-42 | If a Ticket is created successfully but one or more attachment uploads fail, the Ticket is retained and the UI reports partial success, naming the failed files and directing the Requester to retry from Ticket Detail. The Ticket is never rolled back because an attachment failed. |

### List behaviour

| ID | Rule |
|---|---|
| BR-43 | The default sort is creation time descending, with Ticket identifier ascending as a secondary key so that ordering is stable across pages. |
| BR-44 | Sortable fields are Ticket Number, creation time, last update time, and Requested Priority. Requested Priority sorts by severity order, not alphabetically. |
| BR-45 | Search matches Ticket Number and Ticket Summary, case-insensitively, as a substring. Search terms are trimmed; an empty search is treated as no search. |
| BR-46 | Permitted page sizes are 10, 20, and 50. The default is 10. |
| BR-47 | An invalid, unknown, or out-of-range query parameter is a validation failure and is rejected. Silently substituting a default would hide client defects. |
| BR-48 | Requesting a page beyond the last page returns an empty result set with correct pagination metadata, not an error. |
| BR-49 | The empty state (the Requester owns no Tickets) and the no-results state (search or filters matched nothing) are distinct and are presented differently. The no-results state offers Clear Filters. |

---

## 6. UI Specification Summary

The complete specification is in `docs/lab-02/ui-spec.md`. This section records the binding decisions.

### Screens

| Screen | Purpose |
|---|---|
| Development Requester Selection | Choose the testing identity. Title, explanatory text stating this is not a login screen, Requester dropdown, Continue button, plus loading, empty, and failure states. |
| Application shell | TokTickIT identity, My Tickets and Create Ticket navigation with active-page indication, selected Requester display, Change Requester action, responsive mobile navigation. |
| Create Ticket | Read-only system fields grouped at the top, classification fields grouped together, Summary and Description given full width, attachment selection below the main fields, primary and secondary actions at the bottom. |
| My Tickets | Search, filters, sort control, Clear Filters, results region, pagination, Create Ticket action. Desktop renders a table; mobile renders cards. |
| Requester Ticket Detail | Read-only ticket information visually separated from the attachment section, which carries the only interactive controls on the screen. |

### Zen Green tokens

| Token | Value | Use |
|---|---|---|
| Primary green | `#006B3C` | App header, primary actions, strong emphasis |
| Secondary green | `#0B7A46` | Active tabs, focus accents, links, hover |
| Pale green | `#EAF6EF` | Selected, success, subtle section emphasis |
| Page background | `#F5F7F6` | Application background |
| Surface | `#FFFFFF` | Cards and panels, subtle border, restrained shadow |
| Text | Dark charcoal-green, not pure black | Body copy |
| Editable field | White background, neutral border | Inputs the Requester can change |
| Read-only field | Soft gray-green shading | System-generated and non-editable values |
| Error | Dark red text and border | Message rendered immediately below the field |
| Warning | Amber callout or badge | Never used as ordinary decoration |
| Success | Green with readable text | Never relies on colour alone |

Exact hex values for text, borders, error, warning, and success are fixed in `ui-spec.md`. No colour may appear in the implementation that is not listed there.

### Component rules

- Labels sit above controls with consistent weight and spacing.
- Required fields show a red asterisk. The asterisk never substitutes for a validation message.
- Inputs share one height; Description is taller and resizes only within layout bounds.
- Buttons carry visible text. Icons support text; they never replace it. Every icon-only control has an accessible label and tooltip.
- Disabled controls are visually distinct and cannot be activated.
- Focus indicators remain visible for keyboard users.
- The submit button shows a busy state and is disabled while a request is in flight.
- Validation messages appear beside the field that failed, not solely as a summary at the top.
- Status and Requested Priority are shown as badges combining colour with text.

### Responsive rules

| Viewport | Behaviour |
|---|---|
| Desktop ≥ 992 px | Multi-column layout, content centred with a maximum width. Ticket list renders as a table. |
| Tablet 768–991 px | Two columns where practical. Summary and Description keep sufficient width. |
| Mobile < 768 px | Fields stack vertically. Touch-friendly targets. Ticket list renders as cards. No horizontal page scrolling. |
| All sizes | No clipped labels, overlapping messages, hidden buttons, or unreadable attachment filenames. |

---

## 7. Data Changes

### Models

| Model | Fields |
|---|---|
| `RequesterUser` | `id`, `fullName`, `email` (unique), `isActive`, `createdAt`, `updatedAt` |
| `Category` | `id`, `name` (unique), `isActive`, `createdAt`, `updatedAt` |
| `RelatedSystem` | `id`, `name` (unique), `isActive`, `createdAt`, `updatedAt` |
| `Ticket` | `id`, `ticketNumber` (unique), `requesterId`, `categoryId`, `relatedSystemId`, `summary`, `description`, `requestedPriority`, `currentStatus`, `createdAt`, `updatedAt` |
| `Attachment` | `id`, `ticketId`, `originalFilename`, `storedFilename`, `mimeType`, `sizeBytes`, `uploadedById`, `uploadedAt`, `removedAt`, `removedById`, `removedReason` |
| `TicketNumberSequence` | `year` (primary key), `lastValue` |

### Enums

- `RequestedPriority`: `LOW`, `MEDIUM`, `HIGH`, `URGENT` (D-03)
- `TicketStatus`: full vocabulary from D-02 is declared, but Lab 2 only ever writes `NEW`. Declaring the full enum now avoids a breaking migration in Lab 3.

### Relationships

- One `RequesterUser` owns many `Ticket`
- One `Ticket` belongs to one `RequesterUser`
- One `Ticket` has many `Attachment`
- One `Category` is used by many `Ticket`
- One `RelatedSystem` is used by many `Ticket`
- One `RequesterUser` uploads many `Attachment` and removes many `Attachment` (two separate optional relations)

### Constraints and indexes

| Item | Decision |
|---|---|
| Unique | `Ticket.ticketNumber`, `RequesterUser.email`, `Category.name`, `RelatedSystem.name` |
| Foreign keys | `Ticket.requesterId`, `Ticket.categoryId`, `Ticket.relatedSystemId`, `Attachment.ticketId`, `Attachment.uploadedById`, `Attachment.removedById` |
| Nullable | `Attachment.removedAt`, `Attachment.removedById`, `Attachment.removedReason` — all null exactly when the attachment is active |
| Index | `Ticket(requesterId, createdAt DESC)` — every My Tickets query filters on `requesterId` and sorts by `createdAt` by default, so this composite index serves the dominant access path directly |
| Index | `Attachment(ticketId)` — the attachment list is always fetched per ticket |
| Soft removal | Represented by `removedAt IS NOT NULL`. There is no boolean flag, because a nullable timestamp records both the fact and the time of removal without a second field that could disagree with it. |

### Justified design decision

`Ticket.currentStatus` is stored as an enum covering the complete D-02 vocabulary even though Lab 2 only ever writes `NEW`. The alternative — a two-value enum extended later — would require an enum migration in Lab 3 that must run against existing rows. Declaring the full vocabulary now costs nothing at runtime, keeps the schema aligned with the approved System-Level SDS, and confines the Lab 3 change to application logic rather than a data migration. The Lab 2 scope restriction is enforced in the service layer and asserted by test, not by narrowing the type.

### Seed data

The seed uses `upsert` keyed on the natural unique field of each model, so repeated runs never duplicate.

- **Categories (4, required):** Account and Access, Hardware, Software, Network
- **Related Systems (≥6):** Email, Campus Wi-Fi, VPN, LEB2 App, Grade Submission App, Printer, Corporate Laptop
- **Development Requesters:** at least four active, plus at least one inactive. The inactive Requester must not appear in the selector, and is the fixture for the BR-10 and BR-13 tests.

---

## 8. API Contract

Full request and response shapes, parameter names, and error cases are specified in `docs/lab-02/api-spec.md`. This section fixes the capability set and the conventions.

| Capability | Method and path | Success |
|---|---|---|
| Retrieve active Categories | `GET /api/v1/categories` | 200 |
| Retrieve active Related Systems | `GET /api/v1/related-systems` | 200 |
| Retrieve active Development Requesters | `GET /api/v1/dev-requesters` | 200 |
| Create a Ticket | `POST /api/v1/tickets` | 201 |
| Retrieve the selected Requester's Tickets | `GET /api/v1/tickets` | 200 |
| Retrieve one owned Ticket | `GET /api/v1/tickets/{ticketId}` | 200 |
| Upload an Attachment | `POST /api/v1/tickets/{ticketId}/attachments` | 201 |
| Retrieve Attachment metadata | `GET /api/v1/tickets/{ticketId}/attachments` | 200 |
| Download an active Attachment | `GET /api/v1/attachments/{attachmentId}/download` | 200 |
| Soft-remove an Attachment | `DELETE /api/v1/attachments/{attachmentId}` | 200 |

### Conventions

- The selected Requester is transmitted on every Requester-scoped request via the `X-Dev-Requester-Id` header. This header is a test fixture and is documented as such; Lab 3 replaces it with the session cookie from D-04.
- Error body shape is fixed by BR-29: `{ "error": { "code", "message", "details"? } }`.
- Validation failures return `details` as a field-to-message map so the UI can place messages beside fields per FR-11.
- List responses return `{ "data": [...], "meta": { "page", "pageSize", "totalItems", "totalPages" } }`.

### Status codes

| Status | Use |
|---|---|
| 200 | Successful retrieval, download, or soft removal |
| 201 | Ticket or Attachment created |
| 400 | Malformed request or invalid query parameter (BR-47) |
| 404 | Resource does not exist, or exists but is not owned by the selected Requester (BR-18) |
| 409 | Attachment limit reached, or attempt to remove an already-removed attachment |
| 413 | Uploaded file exceeds 5 MB (BR-31) |
| 415 | Unsupported attachment type (BR-30) |
| 422 | Request is well-formed but fails field validation |
| 428 | Requester-scoped request sent with no `X-Dev-Requester-Id` header |
| 500 | Unexpected server error, reported safely per BR-28 |

---

## 9. Acceptance Criteria

### Development Requester context

| ID | Criterion |
|---|---|
| AC-01 | Given active Requesters exist, when the selection screen loads, then only active Requesters appear in the dropdown and the inactive Requester does not. |
| AC-02 | Given no Development Requester is selected, when the user attempts to open My Tickets, then the Requester Selection screen is shown. |
| AC-03 | Given a Requester is selected, when any application screen renders, then the shell displays that Requester's name and a Change Requester action. |
| AC-04 | Given Requester A is selected and their tickets are displayed, when the user changes to Requester B, then Requester A's tickets are no longer displayed and Requester B's tickets are loaded. |
| AC-05 | Given the Requester API is unavailable, when the selection screen loads, then a safe failure state is shown with a retry action and no stack trace. |
| AC-06 | Given no active Requesters exist, when the selection screen loads, then an empty state is shown and the Continue action is unavailable. |

### Ticket creation

| ID | Criterion |
|---|---|
| AC-07 | Given valid Ticket data, when the Requester submits the form, then one Ticket is saved and the official Ticket Number is displayed. |
| AC-08 | Given a Ticket is created, when the saved record is inspected, then its `requesterId` matches the selected Development Requester and its status is `New`. |
| AC-09 | Given a Ticket is created, when its Ticket Number is inspected, then it matches `TKT-YYYY-NNNNN` for the current year. |
| AC-10 | Given two Tickets are created, when their Ticket Numbers are compared, then they are different. |
| AC-11 | Given the Create Ticket screen is opened, when reference data loads, then Category and Related System options come from the database and no options are hard-coded in the client. |
| AC-12 | Given the Summary field is empty, when the Requester submits, then a message appears beside the Summary field and no create request is sent. |
| AC-13 | Given Summary is 9 characters after trimming, when the Requester submits, then the server rejects it with a field-level validation error. |
| AC-14 | Given multiple fields are invalid, when the Requester submits, then all failing fields are reported in one response and each message is rendered beside its field. |
| AC-15 | Given a submission is in flight, when the Requester activates submit again, then the control is disabled and no second Ticket is created. |
| AC-16 | Given the backend is unavailable, when the Requester submits, then a safe error state is shown and every entered value is still present in the form. |
| AC-17 | Given a valid and an invalid file are selected, when the selection is validated, then the valid file is accepted and the invalid file is rejected with a message naming the reason. |

### My Tickets

| ID | Criterion |
|---|---|
| AC-18 | Given Requester A owns Tickets, when My Tickets loads, then only Tickets whose owner is Requester A are returned. |
| AC-19 | Given a search term matching a Ticket Summary, when search is applied, then only matching Tickets are listed. |
| AC-20 | Given a Category filter is applied, when the list reloads, then only Tickets in that Category are listed. |
| AC-21 | Given sorting by Requested Priority descending, when the list reloads, then Urgent Tickets precede High, Medium, then Low. |
| AC-22 | Given more Tickets exist than the page size, when page 2 is requested, then the next set is returned and pagination metadata reports the correct totals. |
| AC-23 | Given an unsupported page size is requested, when the request is sent, then the server rejects it rather than substituting a default. |
| AC-24 | Given the selected Requester owns no Tickets, when My Tickets loads, then the empty state is shown. |
| AC-25 | Given filters exclude every Ticket, when the list reloads, then the no-results state is shown with a Clear Filters action, distinct from the empty state. |

### Ticket Detail and attachments

| ID | Criterion |
|---|---|
| AC-26 | Given a Ticket owned by the selected Requester, when Ticket Detail opens, then all ticket information is rendered read-only with no editable control. |
| AC-27 | Given Requester B is selected, when a Ticket belonging to Requester A is requested, then the Ticket data is not returned and the response does not reveal that the Ticket exists. |
| AC-28 | Given an owned Ticket with fewer than five active attachments, when a permitted file is uploaded, then it appears in the attachment list as active. |
| AC-29 | Given a Ticket already has five active attachments, when a sixth is uploaded, then the request is rejected and the limit is stated in the message. |
| AC-30 | Given a file larger than 5 MB, when it is uploaded, then the request is rejected with a size error. |
| AC-31 | Given a file whose type is not permitted, when it is uploaded, then the request is rejected with a type error. |
| AC-32 | Given an active attachment, when the Requester downloads it, then the file content is returned with its original filename. |
| AC-33 | Given an active attachment, when the Requester removes it with a reason, then removal is confirmed first and the attachment becomes removed. |
| AC-34 | Given a removal is attempted with no reason, when the request is sent, then it is rejected. |
| AC-35 | Given a removed attachment, when Ticket Detail renders, then its filename, size, removal reason, and removal time are shown and no download control is offered. |
| AC-36 | Given a removed attachment, when its download endpoint is called directly, then the request is refused. |
| AC-37 | Given Requester B is selected, when an Attachment belonging to Requester A's Ticket is requested or removed, then the request is refused. |
| AC-38 | Given a Ticket is created but an attachment upload fails, when the result is presented, then the Ticket is retained, the failure names the affected file, and the Requester is directed to retry from Ticket Detail. |

### Presentation and accessibility

| ID | Criterion |
|---|---|
| AC-39 | Given each of the three viewport widths, when Create Ticket, My Tickets, and Ticket Detail render, then no horizontal page scrolling occurs and no label, message, or button is clipped or overlapping. |
| AC-40 | Given a mobile viewport, when My Tickets renders, then Tickets are presented as cards rather than a table, and search, filters, and pagination remain usable. |
| AC-41 | Given a required field, when the form renders, then a red asterisk is present and a validation message is still produced on failure. |
| AC-42 | Given keyboard-only navigation, when focus moves through the form, then every interactive control is reachable and shows a visible focus indicator. |
| AC-43 | Given a Requested Priority or Status badge, when it renders, then the value is conveyed by text as well as colour. |
| AC-44 | Given any rendered screen, when its computed colours are inspected, then every colour used is present in the `ui-spec.md` token table. |

---

## 10. Definition of Done

### Part 1 — Product completion

The coding agent may report completion only when all of the following hold.

- Every FR in Section 4 is implemented and every AC in Section 9 is satisfied.
- Every AC maps to at least one passing automated test, recorded in `tests.md` with its actual test-file path.
- All tests pass from the documented commands on the final `main` branch. No test is skipped, disabled, commented out, or flaky.
- The Prisma schema matches Section 7, migrations apply cleanly to an empty database, and the seed is idempotent across repeated runs.
- Every endpoint in Section 8 conforms to `api-spec.md`, including the error shape in BR-29 and the status codes listed.
- Ownership is enforced server-side on every Requester-scoped endpoint and proven by a negative test for each.
- Every colour, spacing value, and component state used in the implementation appears in `ui-spec.md`.
- Loading, empty, no-results, validation, submitting, success, and failure states exist on every screen where the specification requires them.
- The attachment policy in BR-30 to BR-42 is enforced on the server, not only in the browser.
- Screenshots exist at desktop, tablet, and mobile widths for Create Ticket, My Tickets, and Ticket Detail under `artifacts/lab-02/screenshots/`, and the visual checklist in `tests.md` is complete.
- Nothing from the Section 3 exclusion list is present in the implementation.
- `README.md` setup, run, seed, and test instructions are current and were executed successfully from a clean checkout.

### Part 2 — Course delivery

- Work was decomposed into GitHub Issues, each implemented on its own feature branch.
- Every feature branch reached `lab2-staging` through a peer-reviewed Pull Request; a single release Pull Request merged `lab2-staging` into `main`.
- No commit was made directly to `main` or `lab2-staging`.
- `reviewer.md` records reviewer identity, PR links, comments given and received, responses, and approvals, and every statement in it is factually verifiable against the repository history.
- `ai-use.md` names the LLM used, tabulates 6–10 key prompts, and includes the reflection.
- All Issues are in Done on the GitHub Project board.
- One PDF is submitted using the headings Answer Part 1 through Answer Part 9 in order, with working links and legible screenshots.

---

## 11. Assumptions and Decisions

### Deviations from the approved System-Level SDS

The SDS conflict rule requires that a feature specification may extend the SDS but not silently contradict it. The following deviations are recorded here for approval.

| ID | SDS baseline | Lab 2 deviation | Rationale |
|---|---|---|---|
| DEV-01 | **D-09** — KMUTT palette: Orange `#FA4616`, Yellow `#FFC72C`, Blue Grey `#7B8189` | Lab 2 uses the Zen Green palette mandated by the Lab 2 handout: `#006B3C`, `#0B7A46`, `#EAF6EF`, `#F5F7F6` | The handout fixes these tokens and grades against them. The conflict is confined to colour values; the accessibility rule that status and priority are never conveyed by colour alone is preserved unchanged. Requires a D-09 amendment before the system-level baseline is used for a later sprint. |
| DEV-02 | **D-06** — Attachment storage on SeaweedFS via an S3-compatible adapter, PostgreSQL holding metadata only | Lab 2 stores attachment binaries on the local filesystem under `server/storage/attachments/`, with PostgreSQL holding metadata only | The metadata boundary from D-06 is preserved, so only the storage adapter changes. Standing up SeaweedFS is disproportionate to a single-sprint Requester slice. The upload and download paths are written behind one storage interface so that the S3 adapter can be substituted without touching route or service code. |

### Decisions taken within this sprint

| ID | Decision | Rationale |
|---|---|---|
| DEC-01 | Ownership failure returns 404, not 403 | Returning 403 confirms that a Ticket with that identifier exists, which leaks information across Requesters. 404 keeps ownership failure and non-existence indistinguishable. |
| DEC-02 | The selected Requester travels in the `X-Dev-Requester-Id` header, not in the URL or body | Keeping identity out of the resource path means the Lab 3 migration replaces one header with a session cookie and leaves every route signature unchanged. |
| DEC-03 | Invalid query parameters are rejected rather than defaulted | Silent defaulting hides client defects and makes list behaviour untestable. |
| DEC-04 | Primary keys use UUID for all Lab 2 models | The System-Level SDS specifies UUID identifiers for primary entities. The Lab 1 `Category` model uses an autoincrement integer and is migrated to UUID in this sprint, which changes the `id` type in the existing `/api/categories` response. Lab 1 evidence already submitted is unaffected because it is preserved in the `main` branch history. |
| DEC-05 | Attachment binary is deleted at removal while metadata is retained | This satisfies both the handout's soft-removal requirement and D-11, and makes a removed file unrecoverable through any download path even if a guard were defective. |
| DEC-06 | The full D-02 status enum is declared although only `New` is written | Avoids an enum migration against populated tables in Lab 3. Scope restriction is enforced in the service layer and asserted by test. |
| DEC-07 | Duplicate submission is prevented by the busy state alone, without an idempotency key | The failure mode in scope is repeated clicking, which the disabled busy control eliminates. Network-retry idempotency is a Lab 3 concern once real sessions exist. |

### Open assumptions

| ID | Assumption | Confirmation path |
|---|---|---|
| A-01 | Development Requester selection persists in browser session storage and is lost when the tab closes | Acceptable for a test fixture; confirmed by AC-02, which requires redirect to the selection screen when no selection exists. |
| A-02 | Attachment type validation by extension plus declared MIME type is sufficient in Lab 2 | Content-based sniffing is deferred; recorded as a known limitation in `tests.md`. |
| A-03 | Concurrent ticket creation is low enough that a transactional sequence table will not become a contention point | Acceptable for lab scale; revisit if load testing is introduced. |
