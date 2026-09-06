# TokTickIT — Lab 2 Submission

**Project:** TokTickIT — Requester Ticketing MVP with UI Foundation
**Sprint:** Lab 2
**Author:** Tanakrit (67070503464)
**Reviewer:** Richyboy170
**Repository:** https://github.com/Tanakrit-triton/toktickit
**Released to `main`:** [#29](https://github.com/Tanakrit-triton/toktickit/pull/29), merged as `09ee647`

> **A note on Parts 2, 4, 5, 6 and 9.** The labsheet headings for these were not
> given to me verbatim, so their content is taken from the Definition of Done in
> `specification.md` section 10 and from what each part is evidently for. If a
> heading below asks for something other than the labsheet intends, the material
> is present in the repository and only its placement needs moving.

---

## Answer Part 1

**Repository:** https://github.com/Tanakrit-triton/toktickit

### Commit history on final `main`

Every feature branch merged into `lab2-staging` through a reviewed Pull
Request, and `lab2-staging` merged into `main` once, through the release Pull
Request. No commit was made directly to either branch.

| Merge | Branch | PR |
|---|---|---|
| `09ee647` | `lab2-staging` into `main` | [#29](https://github.com/Tanakrit-triton/toktickit/pull/29) |
| | `feat/lab-02-e2e-evidence` | [#28](https://github.com/Tanakrit-triton/toktickit/pull/28) |
| | `feat/lab-02-ticket-detail-attachments` | [#27](https://github.com/Tanakrit-triton/toktickit/pull/27) |
| | `feat/lab-02-my-tickets` | [#26](https://github.com/Tanakrit-triton/toktickit/pull/26) |
| | `feat/lab-02-create-ticket` | [#25](https://github.com/Tanakrit-triton/toktickit/pull/25) |
| | `feat/lab-02-requester-context` | [#24](https://github.com/Tanakrit-triton/toktickit/pull/24) |
| | `feat/lab-02-reference-api` | [#23](https://github.com/Tanakrit-triton/toktickit/pull/23) |
| | `feat/lab-02-data-model` | [#22](https://github.com/Tanakrit-triton/toktickit/pull/22) |
| | `chore/lab-02-test-tooling` | [#21](https://github.com/Tanakrit-triton/toktickit/pull/21) |
| | `docs/lab-02-spec` | [#11](https://github.com/Tanakrit-triton/toktickit/pull/11) |

Verify with `git log --first-parent main --oneline`.

### Issues and the Kanban board

Nine issues, one branch and one Pull Request each.

| Issue | Title |
|---|---|
| [#12](https://github.com/Tanakrit-triton/toktickit/issues/12) | Lab 2 sprint specification and test plan |
| [#20](https://github.com/Tanakrit-triton/toktickit/issues/20) | Test tooling: Playwright, multipart handling, vitest collection paths |
| [#13](https://github.com/Tanakrit-triton/toktickit/issues/13) | Data model, migration, and idempotent seed |
| [#14](https://github.com/Tanakrit-triton/toktickit/issues/14) | Reference-data APIs and the X-Dev-Requester-Id middleware |
| [#15](https://github.com/Tanakrit-triton/toktickit/issues/15) | Development Requester context, selector screen, Zen Green shell |
| [#16](https://github.com/Tanakrit-triton/toktickit/issues/16) | Create Ticket API and UI |
| [#17](https://github.com/Tanakrit-triton/toktickit/issues/17) | My Tickets list with search, filter, sort, pagination |
| [#18](https://github.com/Tanakrit-triton/toktickit/issues/18) | Requester Ticket Detail and attachment lifecycle |
| [#19](https://github.com/Tanakrit-triton/toktickit/issues/19) | E2E, responsive, screenshots, and delivery evidence |

**Board:** https://github.com/users/Tanakrit-triton/projects/2

> **Outstanding, and mine to finish.** Issues #16, #17, #18 and #19 are still
> open and need closing, and the board needs all nine moved to Done. A
> screenshot of the board belongs here once that is true. It is not claimed as
> done, because it is not.

### Peer review record

**Rendered:** [docs/lab-02/reviewer.md](https://github.com/Tanakrit-triton/toktickit/blob/main/docs/lab-02/reviewer.md)

Ten Pull Requests, ten approvals, no change requests, no inline comments. Three
of my replies corrected a factual error in the reviewer summary; those exchanges
are section 5 of that document and are the substantive part of the record.

### README and .gitignore

**Rendered:** [README.md](https://github.com/Tanakrit-triton/toktickit/blob/main/README.md) and [.gitignore](https://github.com/Tanakrit-triton/toktickit/blob/main/.gitignore)

The README setup, run, seed and test instructions were executed from a clean
checkout, not written from memory. `.gitignore` keeps attachment binaries and
generated Playwright output out of the repository while keeping the screenshots
under `artifacts/lab-02/screenshots/` tracked, because Part 1 of the Definition
of Done requires them as evidence.

---

## Answer Part 2

**Sprint specification.** [docs/lab-02/specification.md](https://github.com/Tanakrit-triton/toktickit/blob/main/docs/lab-02/specification.md)

35 functional requirements, 49 business rules, 44 acceptance criteria, the data
model, the Definition of Done, and the decision register. Written and merged
before any implementation Pull Request opened.

Supporting contracts:

- [docs/lab-02/api-spec.md](https://github.com/Tanakrit-triton/toktickit/blob/main/docs/lab-02/api-spec.md) — ten endpoints, error shape, status catalogue
- [docs/lab-02/ui-spec.md](https://github.com/Tanakrit-triton/toktickit/blob/main/docs/lab-02/ui-spec.md) — Zen Green tokens, screens, responsive rules
- [docs/lab-02/tests.md](https://github.com/Tanakrit-triton/toktickit/blob/main/docs/lab-02/tests.md) — test plan and traceability

### Deviations and amendments

| ID | What |
|---|---|
| **DEV-01** | Zen Green palette replaces the D-09 KMUTT palette. Confined to hue; the rule that status and priority are never conveyed by colour alone is preserved. **A D-09 amendment is required before the system-level baseline is reused.** |
| **DEV-02** | Attachment binaries on the local filesystem instead of SeaweedFS from D-06. The metadata boundary is preserved; only the storage adapter changes. |
| **AMD-01** | **BR-05 was amended mid-sprint.** It named a mechanism and assumed a guarantee that mechanism does not deliver. Implemented faithfully, duplicates were still reachable: eight parallel creations failed six times. Rewritten to state the required property. |

---

## Answer Part 3

**Test results**, run from the documented README commands on final `main`.

| Suite | Command | Tests | Passed | Failed |
|---|---|---|---|---|
| Unit + API | `cd server && npm test` | 92 | 92 | 0 |
| UI component + style | `cd client && npm test` | 76 | 76 | 0 |
| Responsive + E2E | `npm run test:e2e` | 24 | 24 | 0 |
| **Total** | | **192** | **192** | **0** |

**These figures match `tests.md` section 6 exactly.** Nothing was adjusted to
make them agree.

Captured output: [server-tests.txt](../../artifacts/lab-02/evidence/server-tests.txt), [client-tests.txt](../../artifacts/lab-02/evidence/client-tests.txt), [e2e-tests.txt](../../artifacts/lab-02/evidence/e2e-tests.txt)

**18 Playwright skips, none of them a disabled test.** Each is a spec declining
to run at a viewport where it does not apply: E2E journeys run at one width
(10), RSP-06 applies to mobile only (2), and `ui-spec.md` section 10 lists three
screenshot paths at desktop only (6).

---

## Answer Part 4

**Data model and migration.** [server/prisma/schema.prisma](https://github.com/Tanakrit-triton/toktickit/blob/main/server/prisma/schema.prisma)

Six models. `Category` and `RelatedSystem` keep integer keys; `RequesterUser`,
`Ticket` and `Attachment` use UUIDs (DEC-04), because a sequential `Ticket` id
would let one Requester reach another ticket by editing a URL, which is the
thing BR-18 exists to prevent.

Soft removal is a nullable `removedAt` rather than a boolean, so the fact and
the time of removal cannot disagree.

**Seed:** [server/prisma/seed.ts](https://github.com/Tanakrit-triton/toktickit/blob/main/server/prisma/seed.ts) upserts on each natural key, so ids stay stable and repeated runs create no duplicates. It provides two fixtures the tests depend on: an **inactive Requester**, which must never reach the selector (AC-01), and **Pimchanok Sonthi, who owns no tickets** and proves the empty state (AC-24).

---

## Answer Part 5

**API contract.** [docs/lab-02/api-spec.md](https://github.com/Tanakrit-triton/toktickit/blob/main/docs/lab-02/api-spec.md)

| Capability | Endpoint |
|---|---|
| Active Categories | `GET /api/v1/categories` |
| Active Related Systems | `GET /api/v1/related-systems` |
| Active Development Requesters | `GET /api/v1/dev-requesters` |
| Create a Ticket | `POST /api/v1/tickets` |
| List owned Tickets | `GET /api/v1/tickets` |
| One owned Ticket | `GET /api/v1/tickets/{id}` |
| Upload an Attachment | `POST /api/v1/tickets/{id}/attachments` |
| Attachment metadata | `GET /api/v1/tickets/{id}/attachments` |
| Download an Attachment | `GET /api/v1/attachments/{id}/download` |
| Soft-remove an Attachment | `DELETE /api/v1/attachments/{id}` |

Every error body is `{ error: { code, message, details? } }` from one builder,
so the shape cannot drift between routes. Ownership failure returns `404`, not
`403` (DEC-01), and a foreign resource and a missing one return **byte-identical
bodies**, proved by comparing them as strings in API-21 and API-33.

---

## Answer Part 6

**Requester context, ticket creation, and the ticket list.** All at 1440x900.

| Evidence | Screenshot |
|---|---|
| Requester selection, options visible | `artifacts/lab-02/screenshots/requester-selection/desktop-loaded.png` |
| Selector empty state | `artifacts/lab-02/screenshots/requester-selection/desktop-empty.png` |
| Selector failure, safe message and Retry | `artifacts/lab-02/screenshots/requester-selection/desktop-failure.png` |
| Application shell after selection | `artifacts/lab-02/screenshots/requester-selection/desktop-shell.png` |
| Create Ticket, initial | `artifacts/lab-02/screenshots/create-ticket/desktop-initial.png` |
| Validation failure, message beside each field | `artifacts/lab-02/screenshots/create-ticket/desktop-validation-failure.png` |
| Submitting, disabled and busy | `artifacts/lab-02/screenshots/create-ticket/desktop-submitting.png` |
| Success, Ticket Number legible | `artifacts/lab-02/screenshots/create-ticket/desktop-success.png` |
| Backend stopped, every value retained | `artifacts/lab-02/screenshots/create-ticket/desktop-api-failure.png` |
| Impermissible file rejected at selection | `artifacts/lab-02/screenshots/create-ticket/desktop-invalid-attachment.png` |
| My Tickets, populated | `artifacts/lab-02/screenshots/my-tickets/desktop-populated.png` |
| Filtered | `artifacts/lab-02/screenshots/my-tickets/desktop-filtered.png` |
| Empty state | `artifacts/lab-02/screenshots/my-tickets/desktop-empty.png` |
| No-results state | `artifacts/lab-02/screenshots/my-tickets/desktop-no-results.png` |

The empty and no-results captures each assert the **other** state is absent, so
neither can be mistaken for the other. That distinction is BR-49.

---

## Answer Part 7

**Requester-scoped ownership: one Requester cannot see another tickets.**

A pair, so the disappearance is visible rather than asserted. Both are the same
search for `TKT-2026-00290`; only the acting Requester differs.

| Evidence | Screenshot |
|---|---|
| **Requester A** (Siriporn Meesuk) sees the ticket | `artifacts/lab-02/screenshots/ownership/desktop-requester-a-sees-ticket.png` |
| **Requester B** (Napat Chaiwong), same search, finds nothing | `artifacts/lab-02/screenshots/ownership/desktop-requester-b-cannot-see-ticket.png` |
| Direct URL to another Requester ticket is refused | `artifacts/lab-02/screenshots/ownership/desktop-direct-url-refused.png` |

The refusal capture additionally asserts the ticket number does **not** appear
anywhere on the page, so the refusal cannot leak what it is refusing.

Tested by **E2E-02** (switching Requester replaces the visible list) and
**E2E-03** (typing a foreign ticket URL is refused), plus **API-10**, **API-21**
and **API-22**.

---

## Answer Part 8

**Attachment lifecycle, and unauthorized attachment access.**

| Evidence | Screenshot |
|---|---|
| Ticket Detail, read-only region with zero controls | `artifacts/lab-02/screenshots/ticket-detail/desktop-view.png` |
| Removed attachment: metadata and reason kept, no Download | `artifacts/lab-02/screenshots/ticket-detail/desktop-attachment-removed.png` |
| Removal modal with required reason | `artifacts/lab-02/screenshots/ticket-detail/desktop-removal-modal.png` |
| Attachment unreachable to a non-owner | `artifacts/lab-02/screenshots/ownership/desktop-attachment-unreachable.png` |

**The attachment refusal has no screen of its own**, and that is a property of
the design rather than a gap: the whole ticket is already unreachable, so the
attachment list is never rendered. The API evidence behind the screenshot is
captured as text in
[ownership-refusals.txt](../../artifacts/lab-02/evidence/ownership-refusals.txt):

```
owner downloads their own attachment            HTTP 200
another Requester downloads the same            HTTP 404
another Requester requests the ticket           HTTP 404
the same Requester requests a missing ticket    HTTP 404
```

The last two bodies are identical, which is the point of DEC-01.

Soft removal is proved end to end by **E2E-04**: the row is retained with its
reason and timestamp, the binary is deleted from disk, and a direct download of
a removed attachment returns `410`.

---

## Answer Part 9

**Responsive layouts, and AI use.**

25 screenshots cover every path in `ui-spec.md` section 10 at desktop 1440x900,
tablet 834x1112 and mobile 390x844.

| Width | Evidence |
|---|---|
| Tablet | `create-ticket/tablet-initial.png`, `my-tickets/tablet-populated.png`, `ticket-detail/tablet-view.png` |
| Mobile | `create-ticket/mobile-initial.png`, `my-tickets/mobile-cards.png`, `ticket-detail/mobile-view.png` |

**RSP-01 to RSP-06** assert no horizontal page scrolling at any width, cards
rather than a table below 768px, controls still operable at 390px, and touch
targets of at least 44px.

### AI use

**Rendered:** [docs/lab-02/ai-use.md](https://github.com/Tanakrit-triton/toktickit/blob/main/docs/lab-02/ai-use.md)

Claude Opus 5 via Claude Code, fourteen prompts tabulated, with the reflection.

Its section 4 records the most useful finding of the sprint: **three rules from
documents written, reviewed and approved before any code existed described
things the system could not do** — BR-05, DEC-04, and the Unavailable
attachment state in `ui-spec.md` section 5.5. Each was found by attempting the
implementation. None was found by reading, and none by peer review, which
returned ten approvals and no change requests.

The conclusion drawn there is narrow and worth repeating: a rule naming a
**mechanism** is weaker than one stating a **property**, because the mechanism
can be implemented faithfully while the property it was chosen for goes unmet,
and no amount of prose review will reveal the gap.
