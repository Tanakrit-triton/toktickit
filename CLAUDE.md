# TokTickIT — working rules

CPE 334 coursework. These rules apply from Lab 2 onwards and are graded, so
they override convenience and they override a request made in the moment. If an
instruction in a session conflicts with a rule below, say so and stop rather
than complying.

## Pull request rules (CPE 334 course requirement, Lab 2 onwards)

- **NEVER merge a pull request.** The reviewer merges, not the author. Do not
  run `gh pr merge` under any circumstance, even when the PR shows
  `MERGEABLE`/`CLEAN` and even if asked.
- **NEVER push directly to `main` or `lab2-staging`.** All work reaches them
  through a peer-reviewed PR from a feature branch.
- Every PR targets **`lab2-staging`** as base, not `main`. The only exception is
  the single release PR at the end of the sprint.
- Every PR must be linked to its Issue through the **Development sidebar**.
  Keywords like "Closes #13" in the PR body do not link when the base is not the
  default branch.
- **One Issue, one branch, one PR.** Do not combine scope from two Issues.
- Reply to every review comment before the PR is merged. Say what was fixed, or
  why you disagree.

## Implementation rules

- **TDD.** Write the failing test first, run it, confirm it fails for the
  expected reason, commit the tests alone, then implement in a separate commit.
  The order must be visible in `git log`.
- No test may be skipped, disabled, commented out, or left flaky.
- **Never widen scope beyond the Issue being worked.** No authentication,
  sessions, roles, comments, or any post-`NEW` status transition — those are
  Lab 3.
- `docs/lab-02/specification.md`, `api-spec.md`, `ui-spec.md`, and `tests.md`
  are the contract. Flag contradictions rather than silently choosing.
