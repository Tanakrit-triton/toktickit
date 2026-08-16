# Lab 1 — AI Use and Reflection

**LLM/agent used:** Claude (Anthropic), used via the Claude chat interface for planning, code implementation, and Git/GitHub workflow guidance.

## Selected key prompts (6–10)

| # | Prompt (summarised) | What I did with the result |
|---|---|---|
| 1 | Asked for overall project planning and structure. | Reviewed the 4-issue sequence to understand the scope of the full-stack lab and used it as my execution checklist. |
| 2 | Requested a detailed, step-by-step breakdown for each of the 4 issues. | Used the detailed steps to guide my implementation for the backend routes, database, and frontend UI. |
| 3 | Asked for a step-by-step guide to start Issue 1 (Health Check). | Added the GET /api/health route handler code to server/src/app.ts. |
| 4 | Asked whether to install PostgreSQL natively or use Docker. | Chose Docker Desktop and used the provided `docker run` command to start a PostgreSQL container instead of a native install. |
| 5 | Asked for the Prisma Category model and a seed script that would not create duplicates if run twice. | Added the Category model, ran `prisma migrate dev`, and implemented the seed with `prisma.category.upsert()` so re-running it is safe. |
| 6 | Shared the categories.test.ts TODO stub and asked for the missing Supertest assertion, following health.test.ts as the pattern. | Wrote the test asserting GET /api/categories returns 200 and the four categories in id order. |
| 7 | Shared the App.tsx TODO stub and asked for the full loading/success/error state logic after calling checkSystem(). | Implemented conditional rendering for the Online (with category list) and Offline (with error message) states. |
| 8 | Shared the App.test.tsx TODO stubs and asked how to mock the API layer to test both outcomes. | Wrote two Vitest tests using `vi.spyOn(api, "checkSystem")` to mock success and failure, then asserted the UI output. |
| 9 | Asked why `npm run dev` failed in PowerShell with a script execution policy error. | Switched to Command Prompt instead of changing the system's PowerShell execution policy, which resolved it immediately. |

## Reflection

I mainly used Claude throughout this lab. I started by asking it to plan out
the whole project before touching any code, which helped me understand how
the four issues connected before I got lost in the details. When I got stuck,
I found it worked best to just paste the exact TODO comment or error message
straight from my file instead of trying to describe the problem in my own
words — I got way more accurate answers that way. One place I had to slow
down and double check rather than just accept was around the Git workflow,
especially deciding when it was okay to merge my own PRs versus when I
actually needed my partner to review first. I also ran into a random
PowerShell permission error that had nothing to do with my code, and just
switching to Command Prompt fixed it right away.
acceptable to merge my own PRs versus when peer review needed to happen
first, and I am responsible for following up with my reviewer for the
approval evidence required by the submission.
