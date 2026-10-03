import { getPrisma } from "../src/prisma.js";
import { seedDatabase } from "./seed-lib.js";

// Entry point for `npm run prisma:seed`. The seed itself lives in seed-lib.ts
// so the seed tests (SEED-01 .. SEED-04) can run it in-process.
//
// The password for every seeded account comes from SEED_PASSWORD in
// server/.env (docs/lab-03/specification.md section 7.5). It is a local
// development value only; no real password is in the repository.

async function main() {
  const prisma = getPrisma();
  const password = process.env.SEED_PASSWORD;
  if (!password) {
    console.error(
      "Seed stopped: SEED_PASSWORD is not set. Add the local development value from server/.env.example to server/.env.",
    );
    process.exitCode = 1;
    return;
  }

  await seedDatabase(prisma, { password });

  const [users, tickets, comments, notes, events] = await Promise.all([
    prisma.user.count(),
    prisma.ticket.count(),
    prisma.publicComment.count(),
    prisma.internalNote.count(),
    prisma.ticketEvent.count(),
  ]);
  console.log(
    `Seeded: ${users} users, ${tickets} tickets, ${comments} comments, ` +
      `${notes} notes, ${events} ticket events.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await getPrisma().$disconnect();
  });
