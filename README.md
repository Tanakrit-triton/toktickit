# TokTickIT

TokTickIT is an internal IT service desk application. Lab 1 proved the stack
end to end; **Lab 2** delivers the Requester-facing slice: a Development
Requester selector, ticket creation, a searchable and filterable ticket list,
ticket detail, and the attachment lifecycle, on the Zen Green UI foundation.

## Tech Stack

- **Frontend:** React, TypeScript, Vite, React Router, Bootstrap, Vitest, Testing Library
- **Backend:** Node.js, Express, TypeScript, Prisma ORM, multer, Vitest, Supertest
- **Database:** PostgreSQL (via Docker)
- **End to end:** Playwright

## Prerequisites

- Node.js v18 or higher
- Docker Desktop (running)
- npm

---

## Setup from a clean checkout

### 1. Database

```
docker run --name toktickit-db -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=toktickit -p 5432:5432 -d postgres:16-alpine
```

### 2. Install dependencies

Three package trees: the repository root holds Playwright, and the application
lives in `server/` and `client/`.

```
npm install
cd server && npm install
cd ../client && npm install
```

### 3. Configure the backend

```
cd server
copy .env.example .env
```

Set `DATABASE_URL` in `server/.env`:

```
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/toktickit"
```

### 4. Migrate and seed

```
cd server
npx prisma migrate deploy
npm run prisma:seed
```

The seed is idempotent: running it twice creates no duplicates. It provides
four categories, seven related systems, and five Development Requesters — four
active and one inactive.

**The inactive Requester is a fixture, not an accident.** It proves that
inactive Requesters never reach the selector (AC-01, BR-10). Likewise
**Pimchanok Sonthi owns no tickets** and is the fixture for the empty-list
state (AC-24); creating a ticket for her breaks that test.

---

## Running

Two terminals.

```
cd server && npm run dev      # API on http://localhost:3000
cd client && npm run dev      # UI  on http://localhost:5173
```

Open the UI, choose a Development Requester, and you are in. There is no login:
the selector is a Lab 2 test fixture and says so on screen. Authentication
arrives in Lab 3.

### Routes

| Path | Screen |
|---|---|
| `/` | redirects to `/tickets` |
| `/tickets` | My Tickets |
| `/tickets/new` | Create Ticket |
| `/tickets/{id}` | Ticket Detail |
| `/lab-01` | the Lab 1 page, retained unchanged (A-04, A-05) |

---

## Tests

```
cd server && npm test         # unit + API      (92 tests)
cd client && npm test         # UI + UI style   (76 tests)
```

End to end and responsive need the browser downloaded once, and both servers
running:

```
npm run test:e2e:install      # from the repository root, once
npm run test:e2e              # from the repository root
```

If the UI is on a port other than 5173, point the suite at it:

```
E2E_BASE_URL=http://localhost:5174 npx playwright test e2e/lab-02
```

Screenshots are written to `artifacts/lab-02/screenshots/`.

**E2E-05 stops the API to prove the failure state, then restarts it.** If a run
is interrupted partway through that test, start the backend again by hand
before rerunning.

---

## Documentation

| File | Contents |
|---|---|
| `docs/lab-02/specification.md` | scope, FR/BR, data model, acceptance criteria, decisions |
| `docs/lab-02/api-spec.md` | endpoint contract, error shape, status codes |
| `docs/lab-02/ui-spec.md` | Zen Green tokens, screens, responsive rules |
| `docs/lab-02/tests.md` | test plan, traceability, results |
| `docs/lab-02/reviewer.md` | peer review record |
| `docs/lab-02/ai-use.md` | LLM use and reflection |

---

## Known constraints

- The Development Requester selector is **not authentication**. It is unsigned,
  trivially forgeable, and exists so ownership rules can be built and tested
  before Lab 3 (BR-03, BR-11).
- Attachment binaries are stored on the local filesystem under
  `server/storage/`, which stands in for SeaweedFS behind one storage interface
  (DEV-02). The directory is gitignored.
- Attachment type validation uses the extension and the declared MIME type, not
  content sniffing (A-02).
