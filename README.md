# TokTickIT

TokTickIT is an internal IT service desk application, built over three labs:

- **Lab 1** proved the stack end to end: a health check and the seeded IT
  request categories.
- **Lab 2** delivered the Requester slice: ticket creation, a searchable and
  filterable My Tickets list, ticket detail, and the attachment lifecycle, on
  the Zen Green UI foundation.
- **Lab 3** adds real sign-in and three roles. IT Staff work a Ticket Queue,
  take ownership, set IT Priority and status, and write public comments and
  internal notes. Administrators manage user accounts. Requesters can comment on
  their own tickets.

## Tech Stack

- **Frontend:** React, TypeScript, Vite, React Router, Bootstrap, Vitest, Testing Library
- **Backend:** Node.js, Express, TypeScript, Prisma ORM, multer, Argon2, Vitest, Supertest
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
docker run --name toktickit-db -e POSTGRES_USER=toktickit -e POSTGRES_PASSWORD=toktickit -e POSTGRES_DB=toktickit -p 5432:5432 -d postgres:16-alpine
```

These credentials match `server/.env.example` and are for a local container
only.

### 2. Install dependencies

Three package trees: the repository root holds Playwright, and the application
lives in `server/` and `client/`.

```
npm install
cd server && npm install
cd ../client && npm install
```

### 3. Environment files

Create both `.env` files from their examples:

```
copy server\.env.example server\.env
copy client\.env.example client\.env
```

(`cp` instead of `copy` on macOS or Linux.)

`server/.env` sets:

- `DATABASE_URL`: the development database.
- `TEST_DATABASE_URL`: where `npm test` runs. It must differ from
  `DATABASE_URL`, because the tests reseed it and alter seeded accounts. A
  separate schema in the same database is enough; the tests migrate and seed it
  themselves.
- `SEED_PASSWORD`: the password the seed gives every seeded account. Without it
  the seed stops. The value in `.env.example` is a placeholder for **local
  development only**. It is published in this repository, so never use it
  anywhere real. The E2E suite reads it from `server/.env` to sign in.

`client/.env` needs no changes. Leave `VITE_API_URL` unset: the Vite dev server
proxies `/api` to the API on port 3000.

### 4. Migrate and seed

```
cd server
npx prisma migrate deploy
npm run prisma:seed
```

The seed is idempotent: running it twice creates no duplicates. It provides
four categories, seven related systems, the eleven accounts below, tickets
covering all eight statuses, and example comments, notes, and ticket events.
Every run resets each seeded account's password, role, activation, and
must-change flag, and ends its sessions, so it also restores the fixtures after
a test has changed them.

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

All of them sign in with `SEED_PASSWORD`. Lab 2 Requesters migrated from an
existing database have no password until the seed or an Administrator sets one.

The inactive accounts, the Requester with no tickets, and the account that must
change its password are test fixtures. Changing them breaks tests.

---

## Running

Two terminals.

```
cd server && npm run dev      # API on http://localhost:3000
cd client && npm run dev      # UI  on http://localhost:5173
```

Open http://localhost:5173 and sign in as one of the seeded accounts.

### The three roles

| Role | Lands on after sign-in | Can reach |
|---|---|---|
| Requester | `/tickets` (My Tickets) | My Tickets, Create Ticket, their own Ticket Detail with public comments |
| IT Staff | `/staff/queue` (Ticket Queue) | Ticket Queue, Staff Ticket Detail: ownership, IT Priority, status, public comments, internal notes |
| Administrator | `/staff/queue` (Ticket Queue) | everything IT Staff can reach, plus User Management at `/admin/users` |

An account flagged to change its password is sent to `/change-password` first.
A signed-in user who opens a route their role cannot use sees a forbidden page
with a link to their own landing route.

### Routes

| Path | Screen | Role |
|---|---|---|
| `/login` | Sign in | public |
| `/` | redirects to the role's landing route | any signed-in user |
| `/change-password` | Change Password | any signed-in user |
| `/tickets` | My Tickets | Requester |
| `/tickets/new` | Create Ticket | Requester |
| `/tickets/{id}` | Ticket Detail | Requester |
| `/staff/queue` | Ticket Queue | IT Staff, Administrator |
| `/staff/tickets/{id}` | Staff Ticket Detail | IT Staff, Administrator |
| `/admin/users` | User Management | Administrator |
| `/lab-01` | the Lab 1 page, retained unchanged | public |

---

## Tests

```
cd server && npm test         # unit, migration, seed, API; Labs 1 to 3
cd client && npm test         # UI component and style; Labs 1 to 3
```

End to end and responsive (Labs 2 and 3) need the browser downloaded once, a
migrated and seeded development database, and both servers running:

```
npm run test:e2e:install      # from the repository root, once
npm run test:e2e              # from the repository root
```

If the UI is on a port other than 5173, point the suite at it:

```
E2E_BASE_URL=http://localhost:5174 npm run test:e2e
```

Lab 2 E2E-05 stops the API to prove the failure state, then restarts it. The
run stops the restarted API when it finishes. If a run is interrupted partway
through that test, start the backend again by hand before rerunning.

Screenshots are written to `artifacts/lab-02/screenshots/` and
`artifacts/lab-03/screenshots/`. The latest totals are in
`docs/lab-03/tests.md` Section 8.

---

## Repository layout

| Path | Contents |
|---|---|
| `server/src/` | Express API |
| `server/prisma/` | schema, migrations, seed |
| `server/tests/lab-01/`, `lab-02/`, `lab-03/` | server unit, migration, and API tests |
| `client/src/` | React UI. `lab-03/` holds the auth, routing, and staff and admin screens. |
| `client/tests/lab-01/`, `lab-02/`, `lab-03/` | UI component and style tests |
| `e2e/lab-02/`, `e2e/lab-03/` | Playwright end-to-end and responsive suites |
| `artifacts/` | screenshots, API evidence, and saved test output per lab |
| `docs/lab-01/`, `lab-02/`, `lab-03/` | specification, test plan, review record, and AI use per lab |

---

## Documentation (Lab 3)

| File | Contents |
|---|---|
| [`docs/lab-03/specification.md`](docs/lab-03/specification.md) | scope, FR and BR, data model, acceptance criteria, decisions |
| [`docs/lab-03/api-spec.md`](docs/lab-03/api-spec.md) | endpoint contract, error shape, status codes |
| [`docs/lab-03/ui-spec.md`](docs/lab-03/ui-spec.md) | screens, role shell, responsive rules |
| [`docs/lab-03/tests.md`](docs/lab-03/tests.md) | test plan, traceability, final results |
| [`docs/lab-03/reviewer.md`](docs/lab-03/reviewer.md) | peer review record |
| [`docs/lab-03/ai-use.md`](docs/lab-03/ai-use.md) | LLM use and reflection |

Labs 1 and 2 keep their documents in `docs/lab-01/` and `docs/lab-02/`.

---

## Known constraints

- Seeded credentials are for local development only. Self-registration, email
  delivery, password-reset email, MFA, and SSO are out of scope for Lab 3.
- Attachment binaries are stored on the local filesystem under
  `server/storage/`, which stands in for SeaweedFS behind one storage interface.
  The directory is gitignored.
- Attachment type validation uses the extension and the declared MIME type, not
  content sniffing.
- Sign-in throttling is held in memory, per process.
