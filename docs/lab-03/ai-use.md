# Lab 3 AI Use

**Project:** TokTickIT — Authentication, IT Staff ticket operations, and user administration
**Sprint:** Lab 3
**Author:** Tanakrit (GitHub `Tanakrit-triton`)

---

## 1. LLMs used

| Tool | Role in this sprint |
|---|---|
| **Claude Opus 5.5, in the Claude app** | Specification, planning, and review agent. It produced the decision brief, drafted `specification.md`, `api-spec.md`, `ui-spec.md`, and `tests.md`, and reviewed them before any code was written. |
| **Claude Code**, running **Claude Opus 5.5** (model id `claude-opus-5-5`) | Coding agent. It had access to the working tree, a shell, and the `gh` CLI. It wrote tests and code, ran the suites against the local PostgreSQL instance, resolved merge conflicts, and opened pull requests. It never merged one. |

No other model or AI service was used in this sprint.

---

## 2. Key prompts

Eight prompts, quoted in excerpt. Where two prompts served one purpose they
share a row.

| Stage | Prompt (excerpt) | Purpose | Result |
|---|---|---|---|
| Contract | "Produce a decision brief first. List every decision the labsheet leaves open, with options and your recommendation. Write no specification until I answer." | Make me decide the open questions before any specification or code existed. | Decisions DEC-01 to DEC-20, settled before any code. |
| Spec review | "The BR numbering collides (BR-58a/b vs BR-58). Renumber BR-01 to BR-70 and re-run the cross-check." and "E2E-08 is not repeatable. Add preconditions, unique emails and cleanup." | Fix defects in the contract while they were still cheap to fix. | Contract fixed before implementation. |
| Per-Issue TDD | "Scope is only the ACs and test IDs assigned to this Issue in tests.md Section 3. 1. Write failing tests, show red, commit tests only. 2. Implement, run full suites. 3. Summary, then on approval commit, push, open PR. Do not merge." | Keep each Issue to its own scope and make the test-first order visible in `git log`. | A test commit followed by a feat commit on every Issue. |
| Migration | "Generate with prisma migrate dev --create-only, hand-edit the SQL, never drop or recreate RequesterUser, Ticket or Attachment, then confirm a second migrate dev reports in sync." | Protect existing Lab 2 data during the Lab 3 schema change. | Enum values renamed in place, existing rows kept. |
| Merge conflicts | "Run git merge origin/lab3-staging (a merge, not a rebase). Keep every block from both sides. Where both sides changed different rows of the same table, take each row from the side that changed it. Run the full suites, show me the diff, wait for approval. Do not force-push." | Merge parallel branches without losing work or rewriting reviewed history. | Five parallel API branches merged, with test counts verified after each (445 server tests). |
| UI against a faked API | "The comments and notes API is not on this branch. Client tests mock the API, so build against api-spec.md." | Build the UI without waiting for the API to merge. | Three screens built before the API merged. The later check in a real browser found no mismatch. |
| E2E | "This is the first time the UI meets the real API. E2E-03 must assert the appears-resolved indicator on the queue row. The attachment step must click the real Download control. Run the Lab 3 E2E twice to prove it is repeatable." | Prove the full stack end to end, and prove the suite is repeatable. | The agent found that E2E-08 contradicted ui-spec 6.6 and asked me before choosing. |
| Time-boxing the agent | "Stop the generic painted-text overlap work. Write one targeted test that the two overlapping elements do not intersect, confirm red, fix the CSS." | Pull the agent off a broad, slow investigation and onto the actual defect. | Mobile attachment overlap fixed in ten minutes. |

---

## 3. My Reflection

The decision brief made me decide things before any code existed. I overruled
the specification agent on Requester cancel and reopen, because the
labsheet limits those actions to IT Staff and Administrators (DEV-05). Reviewing
the specification caught a numbering collision and a non-repeatable E2E test
before implementation began. The coding agent was fast and kept the test-first
order. The UI it wrote against a faked fetch matched the real API, because
`api-spec.md` was precise. Running five API Issues in parallel caused the same
`tests.md` and `app.ts` conflicts again and again, so I switched to branches
built one on another. The agent sometimes goes deep on the wrong problem, and I
had to time-box it. I still check the migration SQL, every diff before a
commit, and the test totals after each merge, and I never let the agent merge.
Next time I would give each Issue its own section in `tests.md` and arrange
reviewer time earlier.
