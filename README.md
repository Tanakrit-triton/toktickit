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

Set these in `server/.env`:

```
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/toktickit"
TEST_DATABASE_URL="postgresql://postgres:postgres@localhost:5432/toktickit?schema=toktickit_test"
SEED_PASSWORD="toktickit-local-dev-only"
```

- `TEST_DATABASE_URL` is where `npm test` runs. It must differ from
  `DATABASE_URL`, because the tests reseed it and alter seeded accounts. A
  separate schema in the same database is enough; the tests migrate and seed it
  themselves.
- `SEED_PASSWORD` is the password the seed gives every seeded account. The
  value above is for **local development only**. It is published in this
  repository, so never use it anywhere real. Without it the seed stops.

### 4. Migrate and seed

```
cd server
npx prisma migrate deploy
npm run prisma:seed
```

The seed is idempotent: running it twice creates no duplicates. It provides
four categories, seven related systems, the eleven accounts below, nine
tickets covering all eight statuses, and example comments, notes, and ticket
events. Every run resets each seeded account's password, role, activation, and
must-change flag, and ends its sessions, so it also restores the fixtures
after a test has changed them.

| Account | Email | Role |
|---|---|---|
| Napat Chaiwong | napat.cha@kmutt.ac.th | Requester |
| Siriporn Meesuk | siriporn.mee@kmutt.ac.th | Requester |
| Thanawat Rattana | thanawat.rat@kmutt.ac.th | Requester |
| Pimchanok Sonthi | pimchanok.son@kmutt.ac.th | Requester (no tickets) |
| Kittipong Wong | kittipong.won@kmutt.ac.th | Requester, inactive |
| Chayanin Boonmee | chayanin.boo@kmutt.ac.th | Requester, must change password |
| Wichai Prasert | wichai.pra@kmutt.ac.th | IT Staff |
| Arisa Kongkaew | arisa.kon@kmutt.ac.th | IT Staff |
| Teerapat Boonsri | teerapat.boo@kmutt.ac.th | IT Staff |
| Nattapong Saelim | nattapong.sae@kmutt.ac.th | IT Staff, inactive |
| Sasithorn Pholchai | sasithorn.pho@kmutt.ac.th | Administrator |

All of them use `SEED_PASSWORD`. Lab 2 Requesters migrated from an existing
database have no password until the seed or an Administrator sets one.

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
cd server && npm test         # unit, migration, seed, API  (131 tests)
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
