# Lab 1 — Test Plan and Evidence  (fill this in)

All test files live under server/tests/lab-01/ and client/tests/lab-01/.

| # | Tool | Test | Result |
|---|------|------|--------|
| 1 | Supertest | GET /api/health returns 200, status=ok | Pass |
| 2 | Supertest | GET /api/categories returns 4 seeded categories in id order | Pass |
| 3 | Vitest | Heading renders | Pass |
| 4 | Vitest | Success state shows Online + category list | Pass |
| 5 | Vitest | Error state shows Offline + message | Pass |

C:\Users\Win 10 Home\Desktop\toktickit\server>npm test
> toktickit-server@1.0.0 test
> vitest run
 RUN  v2.1.9 C:/Users/Win 10 Home/Desktop/toktickit/server
 ✓ tests/lab-01/categories.test.ts (1)
 ✓ tests/lab-01/health.test.ts (1)
 Test Files  2 passed (2)
      Tests  2 passed (2)
   Start at  07:52:24
   Duration  2.29s (transform 197ms, setup 0ms, collect 1.64s, tests 225ms, environment 1ms, prepare 999ms)

RUN  v2.1.9 C:/Users/Win 10 Home/Desktop/toktickit/client
 ✓ tests/lab-01/App.test.tsx (3)
   ✓ App (3)
     ✓ renders the TokTickIT heading
     ✓ shows Online and the seeded categories on success
     ✓ shows an Offline error message when the API is unavailable
 Test Files  1 passed (1)
      Tests  3 passed (3)
   Start at  08:04:29
   Duration  45.65s (transform 257ms, setup 6.68s, collect 3.75s, tests 234ms, environment 32.49s, prepare 1.49s)
