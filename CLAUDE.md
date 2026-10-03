# TokTickIT — working rules

CPE 334 coursework. These rules apply from Lab 2 onwards and are graded, so
they override convenience and they override a request made in the moment. If an
instruction in a session conflicts with a rule below, say so and stop rather
than complying.

## Pull request rules (CPE 334 course requirement, Lab 2 onwards)

- **NEVER merge a pull request.** The reviewer merges, not the author. Do not
  run `gh pr merge` under any circumstance, even when the PR shows
  `MERGEABLE`/`CLEAN` and even if asked.
- **NEVER push directly to `main` or `lab3-staging`.** All work reaches them
  through a peer-reviewed PR from a feature branch.
- Every PR targets **`lab3-staging`** as base, not `main`. There are two
  exceptions:
  - The stacked chain (user migration -> auth API -> authorization): each PR
    targets the previous feature branch in the chain, and is retargeted to
    `lab3-staging` after the lower PR merges.
  - The single release PR at the end of the sprint.
- Every PR must be linked to its Issue through the **Development sidebar**.
  Keywords like "Closes #13" in the PR body do not link when the base is not the
  default branch.
- **One Issue, one branch, one PR.** Do not combine scope from two Issues.
- Reply to every review comment before the PR is merged. Say what was fixed, or
  why you disagree.
- **NEVER run `git commit` or `git push` without first showing the diff and
  receiving explicit approval in the conversation.**

## Implementation rules

- **TDD.** Write the failing test first, run it, confirm it fails for the
  expected reason, commit the tests alone, then implement in a separate commit.
  The order must be visible in `git log`.
- No test may be skipped, disabled, commented out, or left flaky.
- Lab 2 tests must keep passing, or be superseded with a mapping recorded in
  `docs/lab-03/tests.md`. Never delete a Lab 2 test silently.
- **Never report an Issue complete** until each of its acceptance criteria maps
  to a passing test and the Definition of Done is satisfied.
- **Never widen scope beyond the Issue being worked.** Out of scope for Lab 3:
  Actions Taken, email delivery, password-reset email, MFA, SSO,
  self-registration, multiple roles per user, user deletion, bulk user
  operations, SLA, notifications, and dashboards.
- `docs/lab-03/specification.md`, `api-spec.md`, `ui-spec.md`, and `tests.md`
  are the contract. Flag contradictions rather than silently choosing.

## Database rules

- **Never accept a Prisma-generated migration that drops or recreates
  `RequesterUser`, `Ticket`, or `Attachment`.** Generate with
  `prisma migrate dev --create-only`, hand-edit the SQL, apply it, then confirm
  a second `prisma migrate dev` reports the schema is in sync.
- No real passwords in the repo. Seeded credentials are for local development
  only.
