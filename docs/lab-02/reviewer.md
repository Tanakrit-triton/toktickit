# Lab 2 Peer Review Record

**Project:** TokTickIT — Requester Ticketing MVP with UI Foundation
**Sprint:** Lab 2
**Author:** Tanakrit (67070503464)

---

## 1. Reviewer

| | |
|---|---|
| **Reviewer** | Richyboy170 |
| **Pull requests reviewed** | 10 of 10 |
| **Reviews submitted** | **11** — #27 received two |
| **Approvals** | **11** |
| **Changes requested** | **0** |
| **Inline code comments** | **0** |
| **Replies from the author** | **7** of 10 |

Every review was an approval. None requested changes, and none left a comment
against a specific line — all eleven were summary reviews on the pull request as
a whole.

**No defect in this sprint was found by review.** Every one was found by
executing something: a test run, a migration, a concurrency check, a browser, or
a screenshot capture. That is not a complaint about the reviewer, and it is not
an argument that review was worthless — three of my replies exist only because
someone stated a claim clearly enough to be checked against reality. It is a
statement about what reading can and cannot establish, and it is set out in
Section 6.

---

## 2. How to verify this document

Every figure above and every quotation below comes from the repository.

```bash
gh pr view 22 --json reviews,comments
for n in 11 21 22 23 24 25 26 27 28 29; do gh pr view $n --json number,reviews --jq \
  '"PR#\(.number) reviews=\(.reviews|length) states=\([.reviews[].state]|join(","))"'; done
```

---

## 3. Pull requests and their reviews

| PR | Issue | Branch | Reviews | State | Author replied |
|---|---|---|---|---|---|
| [#11](https://github.com/Tanakrit-triton/toktickit/pull/11) | #12 | `docs/lab-02-spec` | 1 | Approved | — |
| [#21](https://github.com/Tanakrit-triton/toktickit/pull/21) | #20 | `chore/lab-02-test-tooling` | 1 | Approved | — |
| [#22](https://github.com/Tanakrit-triton/toktickit/pull/22) | #13 | `feat/lab-02-data-model` | 1 | Approved | yes |
| [#23](https://github.com/Tanakrit-triton/toktickit/pull/23) | #14 | `feat/lab-02-reference-api` | 1 | Approved | yes |
| [#24](https://github.com/Tanakrit-triton/toktickit/pull/24) | #15 | `feat/lab-02-requester-context` | 1 | Approved | yes |
| [#25](https://github.com/Tanakrit-triton/toktickit/pull/25) | #16 | `feat/lab-02-create-ticket` | 1 | Approved | yes |
| [#26](https://github.com/Tanakrit-triton/toktickit/pull/26) | #17 | `feat/lab-02-my-tickets` | 1 | Approved | yes |
| [#27](https://github.com/Tanakrit-triton/toktickit/pull/27) | #18 | `feat/lab-02-ticket-detail-attachments` | **2** | Approved | yes |
| [#28](https://github.com/Tanakrit-triton/toktickit/pull/28) | #19 | `feat/lab-02-e2e-evidence` | 1 | Approved | yes |
| [#29](https://github.com/Tanakrit-triton/toktickit/pull/29) | release | `lab2-staging` → `main` | 1 | Approved | — |

Every feature branch reached `lab2-staging` through a reviewed pull request, and
a single release pull request merged `lab2-staging` into `main`. No commit was
made directly to either.

---

## 4. Comments given

I reviewed no other student's repository this sprint, so this section is empty.
It is the half of peer review I did not do, and recording it as empty is more
useful than leaving the heading out.

| PR | Comment | Response |
|---|---|---|
| — | none | — |

---

## 5. Comments received, and my replies

All eleven reviews were approvals with no requested changes and no inline
comments. Seven drew a reply. **Three of those replies corrected the review**,
and those three are the substantive part of this record: in each case the
reviewer restated something the pull request had claimed, and the claim had
since been proved wrong by running the code.

### #22 — the purity claim

**Reviewer:** *"I also like that the ticket-number allocation logic is kept pure
and testable."*

**My reply:** the pure helpers were later removed in #25. Keeping the allocation
in application code is exactly what made BR-05 unsatisfiable: two concurrent
callers read the same value and compute the same successor. It is now a single
atomic database increment, and BR-05 was amended as AMD-01. **Purity was the
wrong property to optimise for here** — the value has to be produced by the
database, not by a function that can be tested in isolation.

### #25 — the transaction claim

**Reviewer:** *"transaction semantics ensure atomic sequence allocation."*

**My reply:** they did not. The read, the sequence write and the insert all ran
inside one `prisma.$transaction`, and **eight parallel creations still failed six
times**, because the successor was computed in JavaScript from a stale read. The
unique constraint caught the duplicates, at the cost of a `500` and an advanced
sequence. This is what AMD-01 addresses. I also flagged that AMD-01 amends an
approved baseline rule and therefore needs a deliberate decision rather than an
approval, and that reverting it would not touch the implementation, which
satisfies both wordings.

### #26 — the mobile-cards claim

**Reviewer:** *"the mobile card layout is still outstanding"* — listed among the
gaps the pull request had itself disclosed.

**My reply:** no longer outstanding. Implemented in `51d57ad` and `8031664`, with
UI-32 asserting cards render and the table does not below 768px, and
`mobile-cards.png` captured at 390x844. **AC-40 is met by that PR.** The
screenshot also caught a layout defect no test had: the control bar reserved
180px of vertical space per control, pushing the first ticket to y=774 on an
844px viewport.

### The remaining four replies

| PR | What the reply added |
|---|---|
| #23 | API-40's three assertions passed **vacuously** — with zero active Requesters, `toHaveLength(0)`, the exclusion check and the field-shape loop all succeeded against an empty array. Fixed in `071e918`. API-38 and API-39 were protected only incidentally. |
| #24 | The component tests passed while **nothing was mounted in `App.tsx`**, so AC-02 and AC-03 were only met once routing was added. Component-level tests cannot prove a component is reachable. |
| #27 | Three tests passed before the feature existed: two asserted only absence, one compared two empty bodies, one asserted a bare `404` — which is what Express returns for an unknown route. All now pin the response by error code first. |
| #28 | Acknowledgement only; the review was a one-word approval. |

---

## 6. What review did and did not catch

Eleven approvals, no requested changes, no inline comments — and **not one
defect in this sprint was found by reading the code**. Every defect was found by
executing something:

| Defect | Found by |
|---|---|
| BR-05 satisfiable but wrong (AMD-01) | running eight parallel creations — six failed |
| `Category.updatedAt` migration would fail on any non-empty table | generating the SQL offline and reading it, because Docker was down |
| API-40 passing vacuously | noticing the selector was empty in a browser |
| Component tests green while nothing was mounted | opening `localhost` and seeing the Lab 1 page |
| The `accept` filter making a specified state unreachable | writing the test for AC-17 |
| Control bar reserving 180px per control on mobile | looking at the screenshot |
| Three tests in #18 passing before the feature existed | running them against a route that did not exist |
| `helpers.ts` defaulting to the wrong port | running the documented command on a clean checkout |

This is not an argument that review was worthless. Three of my replies exist
only because the reviewer restated a claim clearly enough for it to be checked,
and two of those restatements were of things the pull request itself had
asserted — so review surfaced my own wrong claims back to me in a form I could
test. That is a real contribution.

But the pattern is consistent and worth stating plainly: **reading prose or code
establishes that something is plausible, not that it is true.** BR-05 read as
correct. The transaction claim read as correct. Both were approved. Both were
wrong, and both took a running program to disprove.

## 7. Where a second opinion is worth most

| Where | Why it needs a person |
|---|---|
| **AMD-01**, `specification.md` §11 | An approved business rule was amended mid-sprint. This changes the baseline the sprint is graded against and is the one item needing a decision rather than a check. I flagged it in my #25 reply and it was approved without comment. |
| **DEC-01, and the negative tests** | Ownership failure returns `404`, and the foreign-resource and missing-resource bodies are compared as **strings**. If they ever differ, the sprint leaks existence across Requesters. |
| **`ai-use.md` §4** | Three approved rules proved unsatisfiable as written. |
| **`server/storage/` and DEV-02** | Attachment binaries on the local filesystem instead of SeaweedFS, behind one interface. Worth confirming the D-06 metadata boundary really is preserved. |

---

## 8. Course requirements this record answers

| Requirement | Status |
|---|---|
| Work decomposed into GitHub Issues | Yes — #12 … #20, one branch each, all closed |
| Every feature branch reached `lab2-staging` through a reviewed PR | Yes — nine PRs, all approved |
| A single release PR merged `lab2-staging` into `main` | Yes — [#29](https://github.com/Tanakrit-triton/toktickit/pull/29), approved and merged |
| No commit made directly to `main` or `lab2-staging` | Yes — verifiable with `git log --first-parent` |
| Every review comment replied to before merge | Yes where a reply was warranted — 7 of 10; the three without were bare approvals with nothing to answer |
| Every statement here verifiable against repository history | Yes — see Section 2 |
