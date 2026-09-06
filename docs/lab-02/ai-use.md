# Lab 2 AI Use

**Project:** TokTickIT — Requester Ticketing MVP with UI Foundation
**Sprint:** Lab 2
**Author:** Tanakrit (67070503464)

---

## 1. LLM used

**Claude Opus 5** (model id `claude-opus-5`), accessed through **Claude Code** in
the Claude desktop app. Claude Code was given tool access to the repository
working tree, a POSIX shell, and the `gh` CLI, so it could read files, run the
test suites against the live PostgreSQL instance, create commits and branches,
and open GitHub Issues and Pull Requests directly rather than emitting text for
me to paste.

That access is the reason the table below records *outcomes* rather than
*suggestions*: most prompts ended with a command actually run and its real
output, not with a proposed answer.

No other model or AI service was used in this sprint.

---

## 2. Key prompts

Fourteen prompts, quoted from the session. Long prompts are abridged with an
ellipsis; nothing is reworded or reconstructed.

| # | Prompt | What it was for | What came back |
|---|---|---|---|
| 1 | "Run these and show me the output: `gh issue list --state all` ... Then read `docs/lab-02/specification.md`, `api-spec.md`, `ui-spec.md`, and `tests.md`. Tell me what is blocking progress and what I should do next. Do not write any code yet." | Open the sprint by establishing real repository state instead of assumed state, and audit the four specification documents before any implementation begins. | Seven blockers. The important one was a **direct contradiction between two approved documents**: `specification.md` DEC-04 said "Primary keys use UUID for all Lab 2 models" while `api-spec.md` section 1.2 specified integer ids for `Category` and `RelatedSystem`, with every example body using `"id": 2`. Also found: `api-spec.md` section 9 was a stale merge gate already satisfied; BR-03 was out of sequence; `lab2-staging` was six commits behind `main`; Playwright, multipart handling, and the client vitest include were all absent despite `tests.md` planning 108 tests. |
| 2 | "On branch `docs/lab-02-spec`, fix the three documentation defects you found. 1. `specification.md` DEC-04 - replace the whole row with: ... 4. Reorder BR-03 ... Commit and push. Do not touch any other file." | Apply the audit's findings as one reviewable documentation commit. | Applied, but the first attempt **silently half-failed**: both spec files use CRLF endings, and the scripted line-move matched `BR-03` for insertion but not for deletion, leaving the row in the document twice. Caught by reading the diff before committing rather than trusting the script's exit code. Fixed CRLF-aware, then committed. |
| 3 | "Annotate the Data Changes table: `RequesterUser`, `Ticket`, and `Attachment` show `id` (UUID). Amend commit `e53eb18` and force-push, or add a follow-up commit - your call, PR #11 has no reviews yet so either is safe." | Finish DEC-04 so the table states both halves of the identifier decision, not only the integer half. | Amended and force-pushed with `--force-with-lease` pinned to the old SHA. Flagged that the commit message's own Data Changes bullet then described something narrower than the commit did, and updated it too. |
| 4 | "Two tasks. 1. Create all 8 Lab 2 Issues now with `gh issue create` ... 2. Then do the tooling prep on branch `feat/lab-02-data-model`: Playwright at repo root with config, plus `e2e/lab-02/`; `multer` in server dependencies; widen `client/vite.config.ts` include ..." | Decompose the sprint into tracked work, and close the gap between what `tests.md` plans and what the repository can actually run. | Eight Issues created with scope, AC references, branch names, and dependencies. Two corrections to the instruction as given: `multer` was installed at **2.3.0 rather than 1.4.5-lts.1**, because the 1.x line carries open advisories and `@types/multer` is published against 2.x; and the client include was verified by probe, which showed a test file at the planned `client/src/tests/lab-02/` path had been collecting as **zero tests** - passing by never running. |
| 5 | "Four corrections remain. ... 2. In #14, change 'Header naming an unknown Requester -> 404 NOT_FOUND' to '-> 428 REQUESTER_NOT_SELECTED'. `api-spec.md` Section 6 reserves 404 for resource existence and ownership per DEC-01 ..." | Correct a status code the model had chosen wrongly when drafting Issue #14. | The correction was right and the model's original was wrong: `404` for an unresolvable header conflates an identity failure with a resource failure. Applied to the issue and to `api-spec.md`, and extended to **section 1.1 as well as section 6** - section 1.1 introduces the header and stated the rule for a missing header only, so changing section 6 alone would have left the document contradicting itself. |
| 6 | "Add a `CLAUDE.md` at the repo root with the course workflow rules, so they apply to every future session. ... NEVER merge a pull request. The reviewer merges, not the author. ... TDD: write the failing test first, run it, confirm it fails for the expected reason, commit the tests alone, then implement in a separate commit." | Make the graded course constraints persistent context rather than something restated each session. | Written to `CLAUDE.md` and loaded automatically in every later session. Every subsequent PR was opened but never merged, and every implementation issue landed as a red test commit followed by a separate green implementation commit. |
| 7 | "On `feat/lab-02-data-model`, implement Issue #13 only. Review `server/prisma/schema.prisma` and `server/prisma/seed.ts` first - drafts already placed there against `specification.md` Section 7. Use them as the starting point, flag anything contradicting the spec." | Build the data model starting from drafts said to be waiting in the working tree. | **The drafts did not exist.** Both files were still the Lab 1 versions, and a search across every branch, the stash list, and the full history of both files found no reference to `RequesterUser`, `RelatedSystem`, `Ticket`, `Attachment`, or `TicketNumberSequence`. Reported the false premise, then wrote both from section 7 rather than blocking, since section 7 specifies the schema exhaustively. Separately caught a **migration that would have failed on every existing database** - see 3.2. |
| 8 | "Migration and seed are verified against the live database ... Push `feat/lab-02-data-model` and open a PR for #13 ... Then start Issue #14." | Ship the data model and begin the reference-data API. | PR opened. Two defects surfaced while building #14: a **test race against the Lab 1 suite** (see 3.3), and Issue #14 claiming two covering tests it structurally could not host - API-08 and API-09 test the Requester middleware, but every endpoint in #14's scope is unscoped, so there was no route to exercise the guard against. Both flagged rather than worked around silently. |
| 9 | "Start Issue #15 on `feat/lab-02-requester-context` ... Every colour must come from the `ui-spec.md` Section 1.1 table. No colour may appear in any stylesheet or component that is absent from it." | Build the Zen Green theme, the selector screen, and the app shell. | Work **stopped before writing anything** to report a blocking dependency: `tests.md` places the UI tests at `client/src/tests/lab-02/`, but the vitest include that collects that path lives on a branch outside this one's ancestry, so the nine tests would have collected as zero while appearing to pass. Asked rather than choosing. Colour conformance was then enforced by a script diffing every hex literal in the client against the section 1.1 table parsed out of the spec, rather than by inspection. |
| 10 | "Implement Issue #16 in full - API then UI. Read api-spec.md Section 3.1 and ui-spec.md Section 5.2 as your contract. List ambiguities before writing code. ... Watch for assertions deriving their expected value from the same source they test. Counts come from constants in the test file, not `prisma.ticket.count()`." | Build ticket creation, with the vacuous-pass problem named in advance. | Eight contract ambiguities listed before coding, two of them contradictions between documents. Found that `accept=".jpg,..."` on the file input made the "File type not permitted" state ui-spec 5.3 specifies **unreachable** through the picker. Also found two defects in my own tests: `userEvent`'s default keystroke delay made two cases pass or fail by machine load, and a regex built by string concatenation lost its escape and would have accepted a malformed ticket number. |
| 11 | "Show me the ticket number allocation code ... Is the sequence read and the ticket inserted inside a single `prisma.$transaction`, or are they separate queries? ... If it is not transactional, say so plainly." | Verify BR-05 rather than trust the comment claiming it. | It **was** transactional, and that was not enough. The successor was computed in JavaScript from a prior read, so two concurrent callers reach the same number; only the unique constraint stopped the duplicate, at the cost of a 500. Eight parallel creations failed six times. The rule itself was the defect, and BR-05 was rewritten to state the required property rather than name a mechanism (AMD-01). |
| 12 | "Implement Issue #17 in full - My Tickets API and UI. ... Invalid query parameters are rejected, never defaulted (BR-47). Requested Priority sorts by severity, not alphabetically (BR-44). ... Pimchanok Sonthi is the empty-list fixture - use her to prove the empty state, never create a ticket for her." | Build the list, with the fixture discipline stated up front. | Delivered. The severity sort turned out to be load-bearing on the Postgres enum's declaration order, which is recorded in the route because reordering the enum would silently change the sort with no schema test failing. A later instruction to add the mobile card layout found that the control bar reserved 180px of vertical space per control on a 390px viewport, pushing the first ticket to y=774 - every DOM assertion passed while the visible screen showed only filters. |
| 13 | "Implement Issue #18 in full - Ticket Detail and the attachment lifecycle. ... Every ownership-protected endpoint needs a negative test proving Requester B cannot reach Requester A's resource. A 404 for a non-existent ticket and a 404 for another Requester's ticket must be byte-identical." | Build the attachment lifecycle with ownership proved, not assumed. | Delivered. Three tests **passed before the feature existed**: two asserted only absence, and one compared two empty bodies. Each was strengthened to pin the response to our own handler before asserting anything about it. Separately, ui-spec 5.5 specified an attachment state the data model cannot support, and the specification was corrected rather than the implementation stretched. |
| 14 | "Implement Issue #19 in full - E2E, responsive, screenshots, and delivery evidence. ... E2E-05 must verify port 3000 is actually closed before asserting the failure state - killing the npm wrapper leaves `tsx watch` listening." | Close the sprint with end-to-end proof and the submission evidence. | Delivered. The instruction was itself a correction of a defect found earlier in the session, and it was right: without the check, E2E-05 would submit against a healthy API and record a false pass. RSP-06 then failed for a good reason - Change Requester has no bounding box on mobile because the navigation collapses exactly as ui-spec 4 specifies - so the test was wrong, not the product. |

---

## 3. Where the review loop caught real defects

Three cases are worth recording in detail, because in each one the defect would
have reached the reviewer - or the grader - if the output had been accepted as
correct.

### 3.1 A contradiction between two approved specification documents

`specification.md` DEC-04 stated that primary keys use UUID for all Lab 2
models, and that the Lab 1 `Category` model is migrated from an autoincrement
integer to UUID in this sprint.

`api-spec.md` section 1.2 stated the opposite: `Category` and `RelatedSystem`
are integer, "reference data, public, carries no ownership", with every example
body and query parameter using integers.

Both documents were written in the same sprint and both sat on the same open
Pull Request. Neither flagged the conflict. It mattered because DEC-04 as
written mandated a destructive migration of live Lab 1 data and would have
broken the Lab 1 test suite, which the Definition of Done requires to keep
passing.

**What the loop caught:** the contradiction, and which side was better reasoned.
The `api-spec.md` position won - UUIDs exist to stop enumeration, which only
matters for resources an attacker could walk, and reference data is public.
DEC-04 was narrowed to ownership-bearing entities, and assumption A-04 was added
to record that the unversioned Lab 1 route is retained.

**What made it catchable:** reading all four documents against each other in one
pass before any code existed, rather than discovering it at migration time.

### 3.2 A migration that applies cleanly to an empty database and fails on every other one

`prisma migrate diff` generated, correctly for a new column:

    ALTER TABLE "Category" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL;

`Category` is not a new table. It already held the four rows seeded in Lab 1,
and `ADD COLUMN ... NOT NULL` with no default fails on any non-empty table.

The Definition of Done says migrations must "apply cleanly to an empty
database", and this one does. It would have passed that check and then failed on
the dev database and on every teammate's checkout carrying Lab 1 data.

**What the loop caught:** that the DoD wording and the real failure mode are not
the same test. The migration now reads `NOT NULL DEFAULT CURRENT_TIMESTAMP`,
with a comment recording that Prisma emits no database-level default for
`@updatedAt` because it maintains the value client-side, so the default only has
to cover rows that already exist.

**What made it catchable:** Docker was not running at the time, so the migration
had to be generated offline and *read* rather than executed. Running it against
an empty test database would have shown green.

### 3.3 A passing test suite with a race in it

`reference-data.api.test.ts` has to prove that an inactive `Category` is
excluded from `GET /api/v1/categories` (API-38), so it creates one, asserts it
never surfaces, and removes it in `afterAll`. The Lab 1 suite asserts that the
unfiltered `GET /api/categories` returns exactly four rows.

vitest runs test files in parallel by default. Against one shared database those
two overlap: the Lab 1 test can observe five categories and fail.

The full suite passed on the first run. It passed because of timing.

**What the loop caught:** that a green run is not evidence of a deterministic
suite. `CLAUDE.md` forbids flaky tests, so the race was closed rather than left
to luck - `fileParallelism` is now off, with the reasoning recorded in the
config file, and three consecutive full runs are green.

**The rejected alternative matters too.** Filtering `isActive` in the Lab 1 route
would also have fixed the race and is arguably more correct. It was rejected
because assumption A-04 states the unversioned route is retained *unchanged*,
and silently altering behaviour the specification promises to preserve is worse
than serialising a five-file suite.

---

---

## 4. Three approved rules were unsatisfiable as written

The single most useful thing to come out of the sprint is not in the prompt
table. Three rules from documents I wrote, reviewed, and approved **before any
code existed** turned out to describe things the system could not do. Each was
found by attempting the implementation. None was found by reading.

| Rule | What it said | Why it could not hold |
|---|---|---|
| **BR-05** | "The Ticket Number is allocated inside the same database transaction that inserts the Ticket, so that no gap or duplicate can result from concurrent creation." | Implemented exactly, and duplicates were still reachable. The successor was computed in application code from a prior read, so at READ COMMITTED two callers reach the same number. Eight parallel creations failed six times. The rule named a mechanism and assumed a guarantee that mechanism does not deliver. Amended as AMD-01 to state the property, with the mechanism demoted to how the property is met. |
| **DEC-04** | "Primary keys use UUID for all Lab 2 models", while `api-spec.md` 1.2 specified integer ids for `Category` and `RelatedSystem` in the same sprint. | Two approved documents contradicting each other, both on the same open Pull Request, neither flagging it. Following DEC-04 meant a destructive migration of live Lab 1 data and a broken Lab 1 suite. Narrowed to ownership-bearing entities. |
| **ui-spec 5.5** | An "Unavailable" attachment state "shown when an upload failed after the Ticket was created". | A failed upload persists nothing: no row, no file, no record on the ticket that the attempt happened. A Ticket Detail screen loaded afterwards has nothing to render it from. Satisfying the wording would have required inventing rows describing files that were never stored. Narrowed to the session that attempted the upload. |

### What this says about the specification-first approach

The sprint's premise is that writing the specification first prevents defects,
and it did: the four documents caught a great deal before any code existed. But
all three failures above survived that process, and the pattern is consistent.
Each one **reads as correct**. BR-05 names a real mechanism that really is
necessary. DEC-04 states a real security principle. The Unavailable state
describes something a user would genuinely want. Reviewing prose against prose
cannot distinguish a rule that is correct from one that is merely plausible,
because both are grammatical, both cite the right identifiers, and both sound
like what an experienced engineer would write.

What separated them was execution. The concurrency test failed six times out of
eight. The migration would not apply. The state had no data to render from.
None of that is visible on the page.

The lesson I take is narrower than "specifications do not work". It is that a
rule naming a **mechanism** is weaker than one stating a **property**, because
a mechanism can be implemented faithfully while the property it was chosen for
goes unmet -- and nothing in a document review will reveal the gap. BR-05 now
states the property and names the test that proves it. That is the form the
rest should have taken.

### What the model contributed, and where it was wrong

It found all three, and it found them by building rather than by reviewing. It
also produced defects of exactly the same kind in its own work: three tests in
#18 passed before the feature existed, because they asserted only that
something was absent, and an empty response satisfies that. Two tests in #16
passed or failed by machine load. A regex built by string concatenation lost
its escape and would have accepted a malformed ticket number.

The through-line is that an assertion which cannot fail is worthless whoever
writes it, and the only reliable way to tell is to run it against a state where
it should fail. The habit that caught every one of these -- committing tests
red, in their own commit, and reading the failure message rather than the exit
code -- is worth more than any of the individual fixes.

## 5. Reflection

The most useful thing the model did this sprint was not writing code. It was
reading four documents against each other and finding that two of them disagreed
about primary keys - a conflict that had survived being written, committed, and
pushed to an open Pull Request. That defect cost nothing to fix on a
documentation branch. Found three days later at migration time, it would have
meant a destructive migration of live data and a broken Lab 1 suite.

The pattern that produced that result held for the rest of the sprint. The model
was most valuable when asked to *check* something against a written contract,
and least trustworthy when asked to *assert* that something worked. Each of the
three defects above was found by comparison - spec against spec, generated SQL
against the real state of the table, a green test run against what parallel
execution actually does. None was found by the model reviewing its own output in
the abstract.

It also got things wrong, in ways worth recording. It chose `404` for an
unresolvable Requester header, which conflates an identity failure with a
resource failure; I corrected it. It wrote a CRLF-naive script that inserted a
business rule without deleting the original, leaving BR-03 in the document
twice - caught only because the diff was read before committing, not because the
script reported failure. And when told that schema drafts were waiting in the
working tree, it checked instead of assuming, and reported that they were not
there. That last behaviour is the one worth keeping: the useful response to a
false premise is to say so, not to hallucinate agreement with it.

Two process choices did most of the work. Writing `CLAUDE.md` early turned the
graded constraints - author never merges, TDD order visible in `git log`, one
Issue per branch per PR - into standing context rather than something restated
every session, and the commit history shows the order held. And insisting that
tests be committed red, in their own commit, before any implementation meant
every claim of "this works" had a prior commit showing it failing for a named
reason. That is a far stronger record than a green suite at the end, which
proves only that the tests and the code agree - not that the tests were ever
capable of failing.

What I would do differently: verify the environment before planning against it.
Roughly a third of the planned tests had no scaffolding at all. Playwright was
absent, multipart handling was absent, and the client vitest include was
silently collecting zero tests from the very path `tests.md` named. All three
were written into the test plan as though they already existed. Ten minutes
spent checking what the repository could actually run, before `tests.md` was
authored, would have caught all three and saved an entire remediation Issue.
