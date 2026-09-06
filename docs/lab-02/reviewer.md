# Lab 2 Peer Review Record

**Project:** TokTickIT — Requester Ticketing MVP with UI Foundation
**Sprint:** Lab 2
**Author:** Tanakrit (67070503464)

---

## 1. Reviewer

| | |
|---|---|
| **Reviewer** | Richyboy170 |
| **Pull Requests reviewed** | 10 of 10 |
| **Reviews submitted** | 11 (#27 received two) |
| **Approvals** | 11 |
| **Changes requested** | 0 |
| **Inline (line-level) comments** | 0 |

**Every review was an approval.** No review requested changes, and no reviewer
comment was left on a specific line — all feedback came as review summaries on
the Pull Request itself. That is recorded plainly rather than dressed up: a
review record showing ten approvals and no rejections is a weaker artefact than
one showing a defect caught, and pretending otherwise would be worse than
saying so.

The substantive part of this record is therefore Section 5, where three of my
replies **corrected the reviewer's summary** on points of fact.

---

## 2. How to verify this document

Every claim below comes from the repository, not from memory.

```bash
gh pr list --state all
gh pr view 25 --json reviews,comments
gh pr view 27 --json reviews --jq '[.reviews[].state]'
git log --first-parent main --oneline
```

## 3. Pull requests

Nine feature Pull Requests, each targeting the branch below it so that every
diff contains only its own issue, then one release Pull Request into `main`.
All ten are merged and all ten were approved.

| PR | Issue | Branch | Base at merge | Review |
|---|---|---|---|---|
| [#11](https://github.com/Tanakrit-triton/toktickit/pull/11) | #12 | `docs/lab-02-spec` | `lab2-staging` | Approved |
| [#21](https://github.com/Tanakrit-triton/toktickit/pull/21) | #20 | `chore/lab-02-test-tooling` | `lab2-staging` | Approved |
| [#22](https://github.com/Tanakrit-triton/toktickit/pull/22) | #13 | `feat/lab-02-data-model` | `lab2-staging` | Approved |
| [#23](https://github.com/Tanakrit-triton/toktickit/pull/23) | #14 | `feat/lab-02-reference-api` | `lab2-staging` | Approved |
| [#24](https://github.com/Tanakrit-triton/toktickit/pull/24) | #15 | `feat/lab-02-requester-context` | `lab2-staging` | Approved |
| [#25](https://github.com/Tanakrit-triton/toktickit/pull/25) | #16 | `feat/lab-02-create-ticket` | `lab2-staging` | Approved |
| [#26](https://github.com/Tanakrit-triton/toktickit/pull/26) | #17 | `feat/lab-02-my-tickets` | `lab2-staging` | Approved |
| [#27](https://github.com/Tanakrit-triton/toktickit/pull/27) | #18 | `feat/lab-02-ticket-detail-attachments` | `lab2-staging` | Approved ×2 |
| [#28](https://github.com/Tanakrit-triton/toktickit/pull/28) | #19 | `feat/lab-02-e2e-evidence` | `lab2-staging` | Approved |
| [#29](https://github.com/Tanakrit-triton/toktickit/pull/29) | release | `lab2-staging` | `main` | Approved |

Each branch was opened against the one below it and **retargeted to
`lab2-staging` automatically** as the branch below merged and was deleted. Three
of those retargets produced conflicts, each resolved in the PR that owned it:
`client/vite.config.ts` in #25 as the union of a widened test include and a
timeout fix, `.gitignore` in #27 as the union of two unrelated ignore blocks,
and the root `package-lock.json` in #28 by taking the installed Playwright
version.

---

## 4. Comments given

Reviewing another student's repository is the other half of peer review and did
not happen in this sprint. Recorded as absent rather than omitted.

| PR | Comment | Response |
|---|---|---|
| — | none | — |

---

## 5. Comments received, and my replies

All ten Pull Requests were approved by Richyboy170, and I replied on seven. The
three replies that **corrected the review** are the substantive content here,
because an approval that rests on a mistaken reading is worth recording
accurately rather than accepting quietly.

| PR | Reviewer's approval | My reply | Resolved by |
|---|---|---|---|
| [#11](https://github.com/Tanakrit-triton/toktickit/pull/11) | Approved | — | merged |
| [#21](https://github.com/Tanakrit-triton/toktickit/pull/21) | Approved | — | merged |
| [#22](https://github.com/Tanakrit-triton/toktickit/pull/22) | Approved. Praised the schema, the `Category.updatedAt` migration fix, the idempotent seed, and "that the ticket-number allocation logic is kept pure and testable". | **Correction.** The pure helpers were later removed in #25. Keeping allocation in application code is precisely what made BR-05 unsatisfiable: two concurrent callers read the same value and compute the same successor. The property the rule exists for needed the increment to move into the database. | AMD-01, and API-41 |
| [#23](https://github.com/Tanakrit-triton/toktickit/pull/23) | Approved. Praised contract discipline, the single `buildError` source, and omitting `details` when absent. | Acknowledged, and noted that API-08 and API-09 could not live in this PR because every endpoint in it is unscoped. | carried to #25 |
| [#24](https://github.com/Tanakrit-triton/toktickit/pull/24) | Approved. Praised the token set, the six control states, and the mechanical colour-conformance check. | Acknowledged, and noted the check reads the token table out of `ui-spec.md` itself, so a colour added to the stylesheet without being added to the document fails the build. | — |
| [#25](https://github.com/Tanakrit-triton/toktickit/pull/25) | Approved. Described the API as well-designed and referred to transaction semantics ensuring correct allocation. | **Correction.** Transaction semantics did **not** ensure atomic allocation. The read, the sequence write and the insert all ran inside one `prisma.$transaction`, and eight parallel creations still failed six times, because the successor was computed in JavaScript from a stale read. The unique constraint caught the duplicates at the cost of a `500` and an advanced sequence. Flagged that AMD-01 amends an approved baseline rule and needs a deliberate decision, not a nod. | AMD-01 |
| [#26](https://github.com/Tanakrit-triton/toktickit/pull/26) | Approved. Listed the gaps the PR had itself declared, including "the mobile card layout is still outstanding". | **Correction.** It was no longer outstanding — implemented in `51d57ad` and `8031664`, with UI-32 asserting cards render and the table does not below 768px, and `mobile-cards.png` at 390×844. AC-40 is met by that PR. Confirmed the reviewer was right that `attachmentCount` stayed unverifiable until #27. | UI-32, RSP-04 |
| [#27](https://github.com/Tanakrit-triton/toktickit/pull/27) | Approved twice. Said the acceptance criteria are covered and the ambiguous cases explicitly resolved. | Drew attention to the part the summary did not reach: three ownership tests **passed before the feature existed**, because they asserted only that something was absent. Each was strengthened to pin the response to our own handler first. | API-21, API-33, API-34 |
| [#28](https://github.com/Tanakrit-triton/toktickit/pull/28) | Approved. | Acknowledged. | merged |
| [#29](https://github.com/Tanakrit-triton/toktickit/pull/29) | Approved — the release Pull Request. | — | merged to `main` |

### What the review process actually caught

Honestly: **no defect was found by review.** Every defect recorded in this
sprint was found by executing something — a concurrency test that failed six
times out of eight, a migration that would not apply to a non-empty table, a
screenshot showing a control bar where a ticket list should have been, three
tests that passed before their feature existed.

Three of the ten approvals contained a factual error about the code, and each
was corrected by me rather than by the reviewer. That is the useful finding of
this section, and it is consistent with what `ai-use.md` §4 records about the
specification documents: prose review, whether of a rule or of a diff, cannot
reliably distinguish something correct from something merely plausible.

---

## 6. What a reviewer should look at first

Not required by the Definition of Done, but the record is more useful with it.
These are the decisions in this sprint that are judgement rather than
correctness, and they are where a second opinion is worth most.

| Where | Why it needs a person |
|---|---|
| **AMD-01 in `specification.md` §11** | An approved business rule was amended mid-sprint. BR-05 was implemented faithfully and duplicates were still reachable, so the rule was changed from naming a mechanism to stating a property. This changes the baseline the sprint is graded against and is the one item that needs a decision rather than a check. |
| **DEC-04** | `specification.md` and `api-spec.md` contradicted each other on primary keys. The resolution narrows UUIDs to ownership-bearing entities. The alternative — UUIDs everywhere — would have meant a destructive migration of Lab 1 data. |
| **DEC-01, and the negative tests** | Ownership failure returns `404`, not `403`, and a foreign resource and a missing one are compared as **strings** in the tests. If those bodies ever differ, the sprint leaks existence across Requesters. |
| **ui-spec §5.5, Unavailable state** | The specification described a state the data model cannot support, and the document was corrected rather than the implementation stretched. |
| **`server/storage/` and DEV-02** | Attachment binaries are on the local filesystem instead of SeaweedFS, behind one storage interface. Worth confirming the D-06 metadata boundary really is preserved. |

---

## 7. Course requirements this section answers

| Requirement | Status |
|---|---|
| Work decomposed into GitHub Issues | Yes — #12 … #20, one branch each |
| Every feature branch reached `lab2-staging` through a peer-reviewed PR | **Yes.** Nine PRs, all approved by Richyboy170 |
| A single release PR merged `lab2-staging` into `main` | **Yes** — [#29](https://github.com/Tanakrit-triton/toktickit/pull/29) |
| No commit made directly to `main` or `lab2-staging` | Yes — `git log --first-parent main` shows merge commits only |
| Every statement here verifiable against repository history | Yes — see Section 2 |