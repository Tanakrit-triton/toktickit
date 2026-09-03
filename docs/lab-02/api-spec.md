# Lab 2 API Specification

**Project:** TokTickIT — Requester Ticketing MVP
**Base path:** `/api/v1`
**Companion documents:** `specification.md` (FR/BR/AC), `tests.md` (test traceability)
**Status:** Draft for approval — must be merged before implementation PRs begin

---

## 1. Conventions

### 1.1 Requester context

Every Requester-scoped request carries the selected Development Requester in a request header:

```
X-Dev-Requester-Id: <uuid>
```

This header is a **Lab 2 test fixture, not a credential** (BR-03, BR-11). It is unsigned and trivially forgeable. It exists so that ownership rules can be built and tested before Lab 3 introduces the authenticated session defined in D-04. When Lab 3 lands, this header is removed and the identity source becomes the session cookie; no route signature changes (DEC-02).

Endpoints that require the header are marked **Scoped** below. A Scoped request without the header is rejected with `428`, and so is one whose header names a Requester that does not exist: both leave the request with no usable identity, and the client reaction is identical in each case — return to the Development Requester Selection screen. `404` is reserved for resource existence and ownership (DEC-01), so it is never used to report an unresolvable header.

### 1.2 Identifier types

| Model | Type | Rationale |
|---|---|---|
| `Category` | integer | Reference data, public, carries no ownership |
| `RelatedSystem` | integer | Reference data, public, carries no ownership |
| `RequesterUser` | UUID string | Ownership subject |
| `Ticket` | UUID string | Ownership-protected; a sequential id would let a Requester enumerate other Requesters' tickets by editing the URL |
| `Attachment` | UUID string | Ownership-protected, same reasoning |

### 1.3 Error shape

Every non-2xx response uses exactly this body (BR-29). A bare string, a plain `{ "message": ... }`, or any other shape is a contract violation.

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "One or more fields are invalid.",
    "details": {
      "summary": "Ticket Summary must be at least 10 characters.",
      "categoryId": "Category is required."
    }
  }
}
```

- `code` — stable machine-readable identifier from the catalogue in Section 6. Never localised, never reworded.
- `message` — one human-readable sentence, safe to display. Never contains a stack trace, SQL, file path, or internal identifier (BR-28).
- `details` — present only on validation failures. A flat map of field name to message, which lets the UI render each message beside its own field (FR-11).

### 1.4 List response shape

```json
{
  "data": [ ... ],
  "meta": { "page": 1, "pageSize": 10, "totalItems": 37, "totalPages": 4 }
}
```

### 1.5 General rules

- All request and response bodies are `application/json`, except attachment upload (`multipart/form-data`) and attachment download (the file's own content type).
- All timestamps are ISO 8601 in UTC with a `Z` suffix (BR-09).
- String fields are trimmed before validation and before storage.
- Unknown query parameters are rejected with `400`, never ignored (BR-47, DEC-03).
- Unknown body properties are ignored.

---

## 2. Reference data endpoints

### 2.1 `GET /api/v1/categories`

Not scoped. Returns active Categories for ticket classification (FR-06).

**Query parameters:** none.

**200**

```json
{
  "data": [
    { "id": 1, "name": "Account and Access" },
    { "id": 2, "name": "Hardware" },
    { "id": 3, "name": "Software" },
    { "id": 4, "name": "Network" }
  ]
}
```

Inactive Categories are never returned. Sorted by `name` ascending.

**Errors:** `500`

---

### 2.2 `GET /api/v1/related-systems`

Not scoped. Returns active Related Systems (FR-07).

**200**

```json
{
  "data": [
    { "id": 1, "name": "Campus Wi-Fi" },
    { "id": 2, "name": "Corporate Laptop" },
    { "id": 3, "name": "Email" }
  ]
}
```

Inactive Related Systems are never returned. Sorted by `name` ascending.

**Errors:** `500`

---

### 2.3 `GET /api/v1/dev-requesters`

Not scoped — this endpoint populates the selector before any Requester exists in context (FR-01).

**200**

```json
{
  "data": [
    { "id": "8f14e45f-...", "fullName": "Napat Chaiwong", "email": "napat.cha@kmutt.ac.th" },
    { "id": "c9f0f895-...", "fullName": "Siriporn Meesuk", "email": "siriporn.mee@kmutt.ac.th" }
  ]
}
```

Only Requesters with `isActive = true` are returned (BR-10). The seeded inactive Requester must never appear here; this is the fixture for AC-01. Sorted by `fullName` ascending.

**Errors:** `500`

---

## 3. Ticket endpoints

### 3.1 `POST /api/v1/tickets`

**Scoped.** Creates one Ticket owned by the selected Requester (FR-08).

**Request**

```json
{
  "categoryId": 2,
  "relatedSystemId": 7,
  "summary": "Laptop battery drains within one hour",
  "requestedPriority": "HIGH",
  "description": "Since the last Windows update the battery drops from 100% to 5% in about an hour, even with only a browser open."
}
```

**Validation**

| Field | Rule | Ref |
|---|---|---|
| `categoryId` | required, integer, must exist and be active | BR-21, BR-22 |
| `relatedSystemId` | required, integer, must exist and be active | BR-21, BR-22 |
| `summary` | required, trimmed, 10–150 characters | BR-19 |
| `requestedPriority` | required, one of `LOW`, `MEDIUM`, `HIGH`, `URGENT` | BR-23 |
| `description` | required, trimmed, 20–5000 characters | BR-20 |

`requesterId` is **not** accepted in the body. Ownership comes from the header only (BR-08). If a client sends one it is ignored.

All failing fields are returned together in a single response (BR-26).

**201**

```json
{
  "data": {
    "id": "3f2b9c10-...",
    "ticketNumber": "TKT-2026-00042",
    "ticketDate": "2026-09-01T13:24:07.512Z",
    "requester": { "id": "8f14e45f-...", "fullName": "Napat Chaiwong" },
    "category": { "id": 2, "name": "Hardware" },
    "relatedSystem": { "id": 7, "name": "Corporate Laptop" },
    "summary": "Laptop battery drains within one hour",
    "requestedPriority": "HIGH",
    "description": "Since the last Windows update ...",
    "currentStatus": "NEW",
    "createdAt": "2026-09-01T13:24:07.512Z",
    "updatedAt": "2026-09-01T13:24:07.512Z"
  }
}
```

The Ticket Number is allocated inside the same transaction as the insert (BR-05) and follows `TKT-YYYY-NNNNN` (BR-04). `currentStatus` is always `NEW` on creation (BR-02).

Attachments are **not** part of this request. They are uploaded separately against the created Ticket (BR-41).

**Errors:** `400`, `422`, `428`, `403`, `500`

---

### 3.2 `GET /api/v1/tickets`

**Scoped.** Returns a paginated list of Tickets owned by the selected Requester (FR-16 … FR-20).

**Query parameters**

| Name | Type | Default | Rules |
|---|---|---|---|
| `q` | string | — | Trimmed, max 150 chars. Case-insensitive substring match against `ticketNumber` and `summary` (BR-45). Empty after trimming is treated as absent. |
| `categoryId` | integer | — | Must exist |
| `relatedSystemId` | integer | — | Must exist |
| `requestedPriority` | enum | — | `LOW` \| `MEDIUM` \| `HIGH` \| `URGENT` |
| `sortBy` | enum | `createdAt` | `ticketNumber` \| `createdAt` \| `updatedAt` \| `requestedPriority` (BR-44) |
| `sortOrder` | enum | `desc` | `asc` \| `desc` |
| `page` | integer | `1` | ≥ 1 |
| `pageSize` | integer | `10` | One of `10`, `20`, `50` (BR-46) |

Any parameter outside these rules, and any parameter not listed here, is rejected with `400` (BR-47). Values are never silently defaulted.

`requestedPriority` sorts by severity order `LOW < MEDIUM < HIGH < URGENT`, not alphabetically (BR-44). Every sort applies `id` ascending as a secondary key so paging is stable (BR-43).

**200**

```json
{
  "data": [
    {
      "id": "3f2b9c10-...",
      "ticketNumber": "TKT-2026-00042",
      "summary": "Laptop battery drains within one hour",
      "category": { "id": 2, "name": "Hardware" },
      "relatedSystem": { "id": 7, "name": "Corporate Laptop" },
      "requestedPriority": "HIGH",
      "currentStatus": "NEW",
      "attachmentCount": 2,
      "createdAt": "2026-09-01T13:24:07.512Z",
      "updatedAt": "2026-09-01T13:24:07.512Z"
    }
  ],
  "meta": { "page": 1, "pageSize": 10, "totalItems": 37, "totalPages": 4 }
}
```

`description` is deliberately excluded from list items to keep the payload small; it is available from Ticket Detail.

`attachmentCount` counts **active** attachments only.

A page beyond the last page returns `data: []` with correct `meta`, not an error (BR-48).

The empty state and the no-results state are distinguished by the client: `totalItems === 0` with no `q` or filters applied is empty; with any applied is no-results (BR-49).

**Errors:** `400`, `428`, `403`, `500`

---

### 3.3 `GET /api/v1/tickets/{ticketId}`

**Scoped.** Returns one Ticket owned by the selected Requester (FR-24).

**200** — the full ticket object from Section 3.1, plus its attachment list as defined in Section 4.2.

**Ownership**

If the Ticket does not exist, or exists but belongs to a different Requester, the response is `404 NOT_FOUND` with an identical body in both cases (BR-18, DEC-01). Returning `403` would confirm the Ticket exists and let one Requester probe another's data.

**Errors:** `400` (malformed UUID), `404`, `428`, `403`, `500`

---

## 4. Attachment endpoints

### 4.1 `POST /api/v1/tickets/{ticketId}/attachments`

**Scoped.** Uploads one attachment to an owned Ticket (FR-14, FR-26).

**Request:** `multipart/form-data` with a single part named `file`.

**Validation**

| Rule | Status | Code | Ref |
|---|---|---|---|
| Extension and declared MIME type must both be permitted and must agree | `415` | `UNSUPPORTED_FILE_TYPE` | BR-30 |
| Size ≤ 5 MB | `413` | `FILE_TOO_LARGE` | BR-31 |
| Ticket has fewer than 5 active attachments | `409` | `ATTACHMENT_LIMIT_REACHED` | BR-32 |
| Ticket is owned by the selected Requester | `404` | `NOT_FOUND` | BR-38 |

Permitted types: `image/jpeg` (`.jpg`, `.jpeg`), `image/png` (`.png`), `image/webp` (`.webp`), `application/pdf` (`.pdf`).

The stored filename is a server-generated UUID plus the validated extension. The client filename is stored as metadata only and is never used to build a path (BR-34).

**201**

```json
{
  "data": {
    "id": "b1946ac9-...",
    "ticketId": "3f2b9c10-...",
    "originalFilename": "battery-report.pdf",
    "mimeType": "application/pdf",
    "sizeBytes": 284713,
    "uploadedBy": { "id": "8f14e45f-...", "fullName": "Napat Chaiwong" },
    "uploadedAt": "2026-09-01T13:26:44.108Z",
    "status": "ACTIVE",
    "removedAt": null,
    "removedReason": null
  }
}
```

`storedFilename` is never exposed in any response — it is an internal storage detail (BR-28).

**Errors:** `400`, `404`, `409`, `413`, `415`, `422`, `428`, `403`, `500`

---

### 4.2 `GET /api/v1/tickets/{ticketId}/attachments`

**Scoped.** Returns attachment metadata for an owned Ticket (FR-25).

**200**

```json
{
  "data": [
    {
      "id": "b1946ac9-...",
      "originalFilename": "battery-report.pdf",
      "mimeType": "application/pdf",
      "sizeBytes": 284713,
      "uploadedAt": "2026-09-01T13:26:44.108Z",
      "status": "ACTIVE",
      "removedAt": null,
      "removedReason": null
    },
    {
      "id": "d3d94468-...",
      "originalFilename": "wrong-screenshot.png",
      "mimeType": "image/png",
      "sizeBytes": 91204,
      "uploadedAt": "2026-09-01T13:28:02.771Z",
      "status": "REMOVED",
      "removedAt": "2026-09-01T13:31:15.004Z",
      "removedReason": "Uploaded the wrong screenshot by mistake"
    }
  ]
}
```

Removed attachments are returned with full metadata so the client can render them in a removed state (BR-40, FR-29). The client must not offer a download control for `status: "REMOVED"`.

**Errors:** `400`, `404`, `428`, `403`, `500`

---

### 4.3 `GET /api/v1/attachments/{attachmentId}/download`

**Scoped.** Streams an active attachment owned by the selected Requester (FR-27).

**200**

```
Content-Type: <stored mimeType>
Content-Disposition: attachment; filename="battery-report.pdf"
Content-Length: <sizeBytes>
```

Body is the raw file. `Content-Disposition` uses the original filename so the download is recognisable to the Requester (AC-32).

**Refusal cases**

| Case | Status | Code |
|---|---|---|
| Attachment does not exist | `404` | `NOT_FOUND` |
| Attachment belongs to another Requester's Ticket | `404` | `NOT_FOUND` |
| Attachment has been removed | `410` | `ATTACHMENT_REMOVED` |

A removed attachment is refused at the route guard, and its binary no longer exists on disk because it is deleted at removal time (BR-39, DEC-05). The download path therefore cannot leak a removed file even if the guard were defective.

**Errors:** `400`, `404`, `410`, `428`, `403`, `500`

---

### 4.4 `DELETE /api/v1/attachments/{attachmentId}`

**Scoped.** Soft-removes an active attachment owned by the selected Requester (FR-28).

**Request**

```json
{ "removalReason": "Uploaded the wrong screenshot by mistake" }
```

**Validation**

| Field | Rule | Ref |
|---|---|---|
| `removalReason` | required, trimmed, 5–200 characters | BR-36 |

Confirmation is a UI requirement (BR-37); the API has no separate confirm step.

**200**

```json
{
  "data": {
    "id": "d3d94468-...",
    "originalFilename": "wrong-screenshot.png",
    "sizeBytes": 91204,
    "status": "REMOVED",
    "removedAt": "2026-09-01T13:31:15.004Z",
    "removedReason": "Uploaded the wrong screenshot by mistake"
  }
}
```

The row is retained and marked; it is never deleted (BR-35). The binary is deleted from storage in the same operation (BR-39). Removed attachments stop counting toward the five-attachment limit (BR-32).

Removing an already-removed attachment returns `409 ATTACHMENT_ALREADY_REMOVED`. The operation is not idempotent by design, so that a double submission is visible rather than silently accepted.

**Errors:** `400`, `404`, `409`, `422`, `428`, `403`, `500`

---

## 5. Ownership enforcement

Ownership is checked on the server for every Scoped endpoint before any data is returned or modified (BR-17, FR-31). Client-side filtering is a convenience and never the control.

| Resource | Check |
|---|---|
| Ticket | `ticket.requesterId === header requester id` |
| Attachment | `attachment.ticket.requesterId === header requester id` |

Failure is always `404`, identical in body to a genuine non-existence (BR-18).

Every Scoped endpoint has a matching negative test asserting that Requester B cannot reach Requester A's resource. See `tests.md`.

---

## 6. Status codes and error catalogue

| Status | Code | When |
|---|---|---|
| `200` | — | Successful retrieval, download, or soft removal |
| `201` | — | Ticket or Attachment created |
| `400` | `BAD_REQUEST` | Malformed JSON, malformed UUID path parameter, unknown or invalid query parameter |
| `403` | `REQUESTER_INACTIVE` | The Requester in the header exists but is no longer active (BR-13) |
| `404` | `NOT_FOUND` | Resource does not exist, or is not owned by the selected Requester |
| `409` | `ATTACHMENT_LIMIT_REACHED` | Ticket already has five active attachments |
| `409` | `ATTACHMENT_ALREADY_REMOVED` | Attachment is already in removed state |
| `410` | `ATTACHMENT_REMOVED` | Download requested for a removed attachment |
| `413` | `FILE_TOO_LARGE` | Upload exceeds 5 MB |
| `415` | `UNSUPPORTED_FILE_TYPE` | Extension or MIME type not permitted, or the two disagree |
| `422` | `VALIDATION_ERROR` | Well-formed request that fails field validation; `details` is populated |
| `428` | `REQUESTER_NOT_SELECTED` | Scoped request sent without `X-Dev-Requester-Id`, or with a header naming a Requester that does not exist |
| `500` | `INTERNAL_ERROR` | Unexpected server error, reported safely with no internal detail |

### Distinction between 400 and 422

`400` means the server could not interpret the request — malformed JSON, an unparseable UUID, an unrecognised query parameter. `422` means the request was understood and its fields were checked and rejected. Only `422` carries `details`. Keeping these separate lets the UI decide whether to render field messages or a general failure state.

---

## 7. Partial-failure behaviour

Ticket creation and attachment upload are separate calls (BR-41). The client sequence on Create Ticket is:

1. `POST /api/v1/tickets` — on failure, nothing is created and the form retains all values (BR-27).
2. For each selected file, `POST /api/v1/tickets/{ticketId}/attachments`.

If step 1 succeeds and any call in step 2 fails, the Ticket is **retained**. The client presents partial success: the Ticket Number, the list of files that failed, the reason for each, and a direction to retry from Ticket Detail (BR-42, AC-38). The Ticket is never rolled back because an attachment failed — the Requester's problem report has value on its own, and discarding it to preserve attachment atomicity would lose more than it protects.

---

## 8. Deferred to Lab 3

Recorded so that no Lab 2 implementation anticipates them.

- Authentication, sessions, and cookies (D-04). The `X-Dev-Requester-Id` header is removed at that point.
- Role-based authorization and IT Staff endpoints.
- Ticket status transitions beyond `NEW`.
- Comments, internal notes, and actions taken.
- Attachment preview and thumbnail generation.
- Idempotency keys for retry-safe creation (DEC-07).
