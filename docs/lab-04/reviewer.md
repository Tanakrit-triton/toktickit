# Lab 4 Peer Review Record

**Project:** TokTickIT — Actions Taken, dashboards, and final regression
**Sprint:** Lab 4
**Author:** Tanakrit (GitHub `Tanakrit-triton`)

---

## 1. Reviewer

| | |
|---|---|
| **Reviewer** | Patiharn Liangkobkit (GitHub `Richyboy170`) |
| **Lab 4 pull requests** | 8: #76 to #81, this PR (#75's docs), and the release PR |
| **Authored by me** | All 8 |
| **Reviewed** | 6 (#76 to #81) |
| **Reviews submitted** | 6, one per PR |
| **Approvals** | 6 |
| **Changes requested** | 0 |
| **Inline review comments on any Lab 4 PR** | 0 |
| **Conversation comments on #76 to #81** | 6, all mine: one reply to each review |
| **Merged by** | `Richyboy170`, all 6 merged PRs (#76 to #81) |
| **Open** | this PR and the release PR |

Every review was an approval submitted as a review body. No review left a
comment on a line of code. I replied to each review with a conversation
comment that quotes it. Each reply was posted on 1 November 2026, after the
PR had merged.

---

## 2. How to verify this document

Every figure, quotation, and timestamp below comes from these commands, run on
1 November 2026. Times are UTC, as GitHub returns them.

```bash
for n in $(seq 76 81); do
  gh pr view $n --json number,title,url,author,reviews,comments,mergedBy,mergedAt,mergeCommit,closingIssuesReferences
  gh api repos/Tanakrit-triton/toktickit/pulls/$n/comments   # inline review comments
  gh api repos/Tanakrit-triton/toktickit/pulls/$n            # created_at, merged_at
done
gh api repos/Tanakrit-triton/toktickit/issues/81/timeline
git log -1 --format='%h %an <%ae> | committer %cn | %ad | %s' <merge commit>
```

---

## 3. Pull requests and their reviews

| PR | Issue | Review | Reviewer's comment, as written | My reply, as written | Merged by, at | Merge commit, author |
|---|---|---|---|---|---|---|
| [#76](https://github.com/Tanakrit-triton/toktickit/pull/76) Sprint 4 engineering contract (#69) | #69 | Approved 2026-10-31 03:48:20 | "Looks good" | "> Looks good<br><br>Thank" (2026-11-01 09:57:22) | `Richyboy170`, 2026-10-31 03:48:29 | `6c3604c`, Patiharn Liangkobkit |
| [#77](https://github.com/Tanakrit-triton/toktickit/pull/77) Actions Taken and workflow foundation (#70) | #70 | Approved 2026-10-31 15:06:37 | "Looks good" | "> Looks good<br><br>Thanks!" (2026-11-01 09:57:44) | `Richyboy170`, 2026-10-31 15:06:47 | `2e25fa8`, Patiharn Liangkobkit |
| [#78](https://github.com/Tanakrit-triton/toktickit/pull/78) Dashboard API (#71) | #71 | Approved 2026-11-01 04:09:55 | "Approve" | "> Approve<br><br>Thank you!" (2026-11-01 09:58:04) | `Richyboy170`, 2026-11-01 04:10:05 | `92b304d`, Patiharn Liangkobkit |
| [#79](https://github.com/Tanakrit-triton/toktickit/pull/79) Lab 4 #72: Actions Taken and workflow UI | #72 | Approved 2026-11-01 04:10:49 | "Approve" | "> Approve<br><br>Thanks!" (2026-11-01 09:58:29) | `Richyboy170`, 2026-11-01 04:11:00 | `82170fe`, Patiharn Liangkobkit |
| [#80](https://github.com/Tanakrit-triton/toktickit/pull/80) Dashboards UI, navigation, and drill-down filters (#73) | #73 | Approved 2026-11-01 04:11:52 | "Approve" | "> Approve<br><br>Thanks!" (2026-11-01 09:58:41) | `Richyboy170`, 2026-11-01 04:12:27 | `239d679`, Patiharn Liangkobkit |
| [#81](https://github.com/Tanakrit-triton/toktickit/pull/81) Lab 4 #74: final hardening - E2E, responsive, style, polish | #74 | Approved 2026-11-01 09:25:31 | "Approve" | "> Approve<br><br>Thanks!" (2026-11-01 10:51:49) | `Richyboy170`, 2026-11-01 09:25:40 | `78e6ac4`, Patiharn Liangkobkit |
| This PR: Lab 4 release documentation, `feature/lab4-75-release-docs` | #75 | No review yet | No comment yet | — | Not merged (open) | — |
| Release PR: `lab4-staging` into `main` | — | No review yet | No comment yet | — | Not merged (open) | — |

The Issue column is the Issue linked through the Development sidebar, as
`closingIssuesReferences` reports it. Each merge commit is GitHub's
"Merge pull request #N from Tanakrit-triton/…" commit. Its author is
Patiharn Liangkobkit (`136677715+Richyboy170@users.noreply.github.com`), and
its committer is GitHub.

The reply on #76 reads "Thank", as posted.

---

## 4. #81's recorded times

GitHub records #81 as created at 2026-11-01 09:53:10, which is after its
merge at 09:25:40. The Issue timeline returns these events in this order:

| Time (UTC) | Event, from `gh api …/issues/81/timeline` |
|---|---|
| 09:25:31 | `Richyboy170` approves |
| 09:25:40 | `Richyboy170` merges |
| 09:25:44 | `Richyboy170` deletes the head branch |
| 09:53:11 | `Tanakrit-triton` requests review |
| 09:55:24 | `Tanakrit-triton` links the Issue (`connected`) |
| 10:51:49 | `Tanakrit-triton` replies to the review |

This record reports GitHub's times as returned and does not explain them.
