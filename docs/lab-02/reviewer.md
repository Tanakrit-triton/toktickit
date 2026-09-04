# Lab 2 Peer Review Record

**Project:** TokTickIT — Requester Ticketing MVP with UI Foundation
**Sprint:** Lab 2
**Author:** Tanakrit (67070503464)

---

## 1. Reviewer

| | |
|---|---|
| **Reviewer** | Richyboy170 |
| **Requested on** | every Pull Request in Section 3, at the time each was opened |
| **Reviews submitted** | **none yet** |
| **Approvals** | **none yet** |

**Nothing in this sprint has been reviewed at the time of writing.** Every
review column below is blank because there is nothing to record, not because
the record is incomplete. Filling them in advance would make this document
unverifiable, which is the one thing the Definition of Done says it must not
be: every statement here is checkable against repository history with `gh pr
view <n>`.

---

## 2. How to verify this document

Every claim below comes from the repository rather than from memory.

```bash
gh pr list --state all
gh pr view 25 --json reviews,reviewRequests,comments
git log --oneline lab2-staging..feat/lab-02-e2e-evidence
```

A reviewer checking this file should expect `reviews` to be an empty array on
every Pull Request until Richyboy170 submits one.

---

## 3. Pull requests

All eight target the branch below them rather than `lab2-staging` directly, so
each diff contains only its own issue. The chain is merged bottom-up.

| PR | Issue | Branch | Base | Reviewer requested | Review state |
|---|---|---|---|---|---|
| [#11](https://github.com/Tanakrit-triton/toktickit/pull/11) | #12 | `docs/lab-02-spec` | `lab2-staging` | Richyboy170 | — |
| [#21](https://github.com/Tanakrit-triton/toktickit/pull/21) | #20 | `chore/lab-02-test-tooling` | `docs/lab-02-spec` | Richyboy170 | — |
| [#22](https://github.com/Tanakrit-triton/toktickit/pull/22) | #13 | `feat/lab-02-data-model` | `chore/lab-02-test-tooling` | Richyboy170 | — |
| [#23](https://github.com/Tanakrit-triton/toktickit/pull/23) | #14 | `feat/lab-02-reference-api` | `feat/lab-02-data-model` | Richyboy170 | — |
| [#24](https://github.com/Tanakrit-triton/toktickit/pull/24) | #15 | `feat/lab-02-requester-context` | `feat/lab-02-reference-api` | Richyboy170 | — |
| [#25](https://github.com/Tanakrit-triton/toktickit/pull/25) | #16 | `feat/lab-02-create-ticket` | `feat/lab-02-requester-context` | Richyboy170 | — |
| [#26](https://github.com/Tanakrit-triton/toktickit/pull/26) | #17 | `feat/lab-02-my-tickets` | `feat/lab-02-create-ticket` | Richyboy170 | — |
| [#27](https://github.com/Tanakrit-triton/toktickit/pull/27) | #18 | `feat/lab-02-ticket-detail-attachments` | `feat/lab-02-my-tickets` | Richyboy170 | — |
| this one | #19 | `feat/lab-02-e2e-evidence` | `feat/lab-02-ticket-detail-attachments` | Richyboy170 | — |

---

## 4. Comments given

| PR | Comment | Response |
|---|---|---|
| — | none yet | — |

Reviewing another student's repository is the other half of this section and
has not happened yet.

---

## 5. Comments received

| PR | Comment | Response | Resolved by |
|---|---|---|---|
| — | none yet | — | — |

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
| Every feature branch reached `lab2-staging` through a reviewed PR | **Not yet.** Eight PRs are open and unreviewed. |
| A single release PR merged `lab2-staging` into `main` | **Not yet.** Blocked on the above. |
| No commit made directly to `main` or `lab2-staging` | Yes — verifiable with `git log --first-parent lab2-staging` |
| Every statement here verifiable against repository history | Yes — see Section 2 |
