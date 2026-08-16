# TokTickIT

TokTickIT is a full-stack internal IT service desk application. This Lab 1 slice
proves the whole stack works end-to-end: React frontend → Express API →
Prisma ORM → PostgreSQL database.

## Tech Stack

- **Frontend:** React, TypeScript, Vite, Bootstrap, Vitest
- **Backend:** Node.js, Express, TypeScript, Prisma ORM, Vitest, Supertest
- **Database:** PostgreSQL (via Docker)

## Prerequisites

- Node.js v18 or higher
- Docker Desktop (running locally)
- npm

## Getting Started

### 1. Database Setup (Docker)

Run PostgreSQL in a Docker container on port 5432:

```
docker run --name toktickit-db -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=toktickit -p 5432:5432 -d postgres:16-alpine
```

### 2. Backend Setup

```
cd server
npm install
copy .env.example .env
```

Edit `server/.env` and set:

```
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/toktickit"
```

Then run the migration and seed the database:

```
npx prisma migrate dev --name init
npx prisma db seed
```

Start the backend:

```
npm run dev
```

The API runs at http://localhost:3000

### 3. Frontend Setup

In a new terminal:

```
cd client
npm install
copy .env.example .env
npm run dev
```

The frontend runs at http://localhost:5173

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|--------------|
| GET | /api/health | Returns server health status |
| GET | /api/categories | Returns the list of IT request categories |

## Running Tests

Backend tests:

```
cd server
npm test
```

Frontend tests:

```
cd client
npm test
```