import { getPrisma } from "../src/prisma.js";

// Lab 2 seed, per docs/lab-02/specification.md section 7.
//
// Every model is upserted on its natural unique key, so running the seed twice
// creates no duplicates and changes no ids. Ids must stay stable across runs
// because tests hold references to the seeded fixtures.

const CATEGORIES = [
  "Account and Access",
  "Hardware",
  "Software",
  "Network",
];

const RELATED_SYSTEMS = [
  "Campus Wi-Fi",
  "Corporate Laptop",
  "Email",
  "Grade Submission App",
  "LEB2 App",
  "Printer",
  "VPN",
];

// At least four active Requesters plus one inactive. The inactive record is
// the fixture for AC-01 and BR-13: it must never appear in the selector. The
// second active Requester is the fixture for every cross-Requester negative
// test (AC-27, AC-37).
const REQUESTERS = [
  { fullName: "Napat Chaiwong", email: "napat.cha@kmutt.ac.th", isActive: true },
  { fullName: "Siriporn Meesuk", email: "siriporn.mee@kmutt.ac.th", isActive: true },
  { fullName: "Thanawat Rattana", email: "thanawat.rat@kmutt.ac.th", isActive: true },
  { fullName: "Pimchanok Sonthi", email: "pimchanok.son@kmutt.ac.th", isActive: true },
  { fullName: "Kittipong Wong (inactive)", email: "kittipong.won@kmutt.ac.th", isActive: false },
];

async function main() {
  const prisma = getPrisma();

  for (const name of CATEGORIES) {
    await prisma.category.upsert({
      where: { name },
      update: { isActive: true },
      create: { name, isActive: true },
    });
  }

  for (const name of RELATED_SYSTEMS) {
    await prisma.relatedSystem.upsert({
      where: { name },
      update: { isActive: true },
      create: { name, isActive: true },
    });
  }

  for (const requester of REQUESTERS) {
    await prisma.requesterUser.upsert({
      where: { email: requester.email },
      update: { fullName: requester.fullName, isActive: requester.isActive },
      create: requester,
    });
  }

  const [categories, relatedSystems, active, inactive] = await Promise.all([
    prisma.category.count(),
    prisma.relatedSystem.count(),
    prisma.requesterUser.count({ where: { isActive: true } }),
    prisma.requesterUser.count({ where: { isActive: false } }),
  ]);

  console.log(
    `Seeded: ${categories} categories, ${relatedSystems} related systems, ` +
      `${active} active and ${inactive} inactive development requesters.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await getPrisma().$disconnect();
  });
