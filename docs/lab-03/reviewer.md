# Lab 3 Peer Review Record

**Project:** TokTickIT — Authentication, IT Staff ticket operations, and user administration
**Sprint:** Lab 3
**Author:** Tanakrit (GitHub `Tanakrit-triton`)

---

## 1. Reviewer

| | |
|---|---|
| **Reviewer** | Patiharn Liangkobkit (GitHub `Richyboy170`) |
| **Lab 3 pull requests** | 15 (#49 to #63) |
| **Reviewed** | 10 (#49 to #58) |
| **Not yet reviewed** | 5 (#59 to #63), open at the time of writing |
| **Reviews submitted** | 11 (#55 received two) |
| **Approvals** | 11 |
| **Changes requested** | 0 |
| **Conversation comments on any Lab 3 PR** | 0 |
| **Inline review comments on any Lab 3 PR** | 0 |
| **Merged by** | `Richyboy170`, all 10 merged PRs |

Every review was an approval submitted as a review body. No review left a
comment on a line of code, and no one, including me, posted a conversation
comment on any Lab 3 pull request.

Two reviews asked for something: #56 and #57 were approved with "approve, but
there is a merge conflict, could you resolve that?". In both cases I resolved
the conflict by pushing a merge commit from `origin/lab3-staging`, and the
reviewer merged afterwards. **I did not reply in writing on either PR.** The
only record of the response is the merge commit, listed in Section 3.

---

## 2. How to verify this document

Every figure, quotation, and timestamp below comes from these commands, run on
4 October 2026. Times are UTC, as GitHub returns them.

```bash
for n in $(seq 49 63); do
  gh pr view $n --json number,title,url,author,reviews,comments,mergedBy,mergedAt,closingIssuesReferences
  gh api repos/Tanakrit-triton/toktickit/pulls/$n/comments   # inline review comments
done
gh pr view 56 --json commits   # the conflict-resolution merge commits, also 55 and 57
gh search prs --author Richyboy170 --reviewed-by Tanakrit-triton
```

---

## 3. Pull requests and their reviews

| PR | Issue | Review | Reviewer's comment, as written | My response | Merged by, at |
|---|---|---|---|---|---|
| [#49](https://github.com/Tanakrit-triton/toktickit/pull/49) Chore: approve npm install scripts for prisma and esbuild | #33 | Approved 2026-10-03 07:29:39 | "approve, look good" | None | `Richyboy170`, 2026-10-03 07:29:48 |
| [#50](https://github.com/Tanakrit-triton/toktickit/pull/50) Sprint 3 engineering contract | #34 | Approved 2026-10-03 07:30:23 | "approve, look good" | None | `Richyboy170`, 2026-10-03 07:30:38 |
| [#51](https://github.com/Tanakrit-triton/toktickit/pull/51) User model, migration, sessions, and seed | #35 | Approved 2026-10-03 12:44:30 | "good, approve" | None | `Richyboy170`, 2026-10-03 12:44:37 |
| [#52](https://github.com/Tanakrit-triton/toktickit/pull/52) Auth API: login, logout, current user, change password | #36 | Approved 2026-10-03 12:45:06 | "good" | None | `Richyboy170`, 2026-10-03 12:45:13 |
| [#53](https://github.com/Tanakrit-triton/toktickit/pull/53) Authorization middleware and Requester API migration | #37 | Approved 2026-10-03 12:45:42 | "look good" | None | `Richyboy170`, 2026-10-03 12:45:49 |
| [#54](https://github.com/Tanakrit-triton/toktickit/pull/54) Auth UI and role-based app shell | #38 | Approved 2026-10-04 04:22:19 | "approve" | None | `Richyboy170`, 2026-10-04 04:22:29 |
| [#55](https://github.com/Tanakrit-triton/toktickit/pull/55) IT Staff Ticket Queue API | #39 | Approved 2026-10-04 04:22:51, approved again 04:42:47 | "approve" (both reviews) | No written reply. Between the two approvals I pushed merge commit `7e463be` (04:35:41) bringing in `origin/lab3-staging`. | `Richyboy170`, 2026-10-04 04:42:55 |
| [#56](https://github.com/Tanakrit-triton/toktickit/pull/56) Ticket operations API: ownership, IT Priority, status | #40 | Approved 2026-10-04 04:43:51 | "approve, but there is a merge conflict, could you resolve that?" | No written reply. Resolved by merge commit `57fe639` "Merge origin/lab3-staging into feature/lab3-07-ticket-ops-api" (04:58:06). | `Richyboy170`, 2026-10-04 05:01:59 |
| [#57](https://github.com/Tanakrit-triton/toktickit/pull/57) Administrator Users API | #42 | Approved 2026-10-04 05:02:37 | "approve, but there is a merge conflict, could you resolve that?" | No written reply. Resolved by merge commit `5367d32` "Merge origin/lab3-staging into feature/lab3-09-users-api" (05:10:43). | `Richyboy170`, 2026-10-04 05:11:47 |
| [#58](https://github.com/Tanakrit-triton/toktickit/pull/58) Comments and internal notes API | #41 | Approved 2026-10-04 07:59:33 | "good" | None | `Richyboy170`, 2026-10-04 07:59:40 |
| [#59](https://github.com/Tanakrit-triton/toktickit/pull/59) Staff Ticket Detail UI and Requester comments | #44 | No review | No comment | — | Not merged (open) |
| [#60](https://github.com/Tanakrit-triton/toktickit/pull/60) Staff Ticket Queue UI | #43 | No review | No comment | — | Not merged (open) |
| [#61](https://github.com/Tanakrit-triton/toktickit/pull/61) User Management UI | #45 | No review | No comment | — | Not merged (open) |
| [#62](https://github.com/Tanakrit-triton/toktickit/pull/62) Lab 3 E2E tests | #46 | No review | No comment | — | Not merged (open) |
| [#63](https://github.com/Tanakrit-triton/toktickit/pull/63) Lab 3 visual inspection and responsive screenshots | #47 | No review | No comment | — | Not merged (open) |

"None" in the response column means the review raised nothing that needed an
answer and I posted nothing. The Issue column is the Issue linked through the
Development sidebar, as `closingIssuesReferences` reports it.

---

## 4. Reviews I gave

`gh` shows reviews by me on the reviewer's repository
(`Richyboy170/toktickit`). These two fall in this sprint (3 to 4 October 2026).
Earlier ones belong to Labs 1 and 2.

| PR | Review | My comment, as written | Merged by, at |
|---|---|---|---|
| [Richyboy170/toktickit#45](https://github.com/Richyboy170/toktickit/pull/45) docs: define Lab 4 engineering contract | Approved 2026-10-04 04:32:48 | "Look good, Approve" | `Tanakrit-triton`, 2026-10-04 04:26:14 |
| [Richyboy170/toktickit#46](https://github.com/Richyboy170/toktickit/pull/46) Feature/lab4 action model | Approved 2026-10-04 09:16:13, approved again 09:16:43 | "Approve" (both reviews) | `Tanakrit-triton`, 2026-10-04 09:17:07 |

On #45, GitHub records the merge at 04:26:14 and my approval at 04:32:48, so the
approval was submitted after the merge. I left no inline comments on either PR.
