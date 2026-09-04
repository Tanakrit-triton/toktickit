import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";

// API-24 .. API-37 from docs/lab-02/tests.md section 2.2.
//
// Every ownership-protected route gets a negative case: a passing happy path
// is not evidence of ownership enforcement.

const prisma = getPrisma();

const OWNER_EMAIL = "zz.att.owner@kmutt.ac.th";
const OTHER_EMAIL = "zz.att.other@kmutt.ac.th";

const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex");
const MAX_BYTES = 5 * 1024 * 1024;
const ACTIVE_LIMIT = 5;

let ownerId = "";
let otherId = "";
let ticketId = "";
let foreignTicketId = "";

const upload = (
  id: string,
  header: string,
  filename: string,
  mime: string,
  body: Buffer = PNG,
) =>
  request(app)
    .post(`/api/v1/tickets/${id}/attachments`)
    .set("X-Dev-Requester-Id", header)
    .attach("file", body, { filename, contentType: mime });

async function addOne(filename = "evidence.png") {
  const response = await upload(ticketId, ownerId, filename, "image/png");
  expect(response.status, `fixture upload of ${filename} failed`).toBe(201);
  return response.body.data.id as string;
}

beforeAll(async () => {
  const owner = await prisma.requesterUser.upsert({
    where: { email: OWNER_EMAIL },
    update: { isActive: true },
    create: { fullName: "ZZ Attachment Owner", email: OWNER_EMAIL, isActive: true },
  });
  const other = await prisma.requesterUser.upsert({
    where: { email: OTHER_EMAIL },
    update: { isActive: true },
    create: { fullName: "ZZ Attachment Other", email: OTHER_EMAIL, isActive: true },
  });
  ownerId = owner.id;
  otherId = other.id;

  const category = await prisma.category.findFirst({ where: { isActive: true } });
  const system = await prisma.relatedSystem.findFirst({ where: { isActive: true } });

  await prisma.attachment.deleteMany({
    where: { ticket: { requesterId: { in: [ownerId, otherId] } } },
  });
  await prisma.ticket.deleteMany({ where: { requesterId: { in: [ownerId, otherId] } } });

  const base = {
    categoryId: category!.id,
    relatedSystemId: system!.id,
    description: "A description long enough to satisfy the twenty character minimum.",
    requestedPriority: "HIGH" as const,
  };
  const owned = await prisma.ticket.create({
    data: { ...base, ticketNumber: "TKT-2026-96001", requesterId: ownerId, summary: "Attachment fixture ticket" },
  });
  const foreign = await prisma.ticket.create({
    data: { ...base, ticketNumber: "TKT-2026-96002", requesterId: otherId, summary: "Foreign attachment ticket" },
  });
  ticketId = owned.id;
  foreignTicketId = foreign.id;
});

beforeEach(async () => {
  // Each test starts from a ticket with no attachments, so the five-file limit
  // cannot leak between cases.
  await prisma.attachment.deleteMany({ where: { ticketId: { in: [ticketId, foreignTicketId] } } });
});

afterAll(async () => {
  await prisma.attachment.deleteMany({
    where: { ticket: { requesterId: { in: [ownerId, otherId] } } },
  });
  await prisma.ticket.deleteMany({ where: { requesterId: { in: [ownerId, otherId] } } });
  await prisma.requesterUser.deleteMany({ where: { email: { in: [OWNER_EMAIL, OTHER_EMAIL] } } });
  await prisma.$disconnect();
});

describe("POST attachments (API-24 - AC-28)", () => {
  it("stores a permitted file and returns it as ACTIVE", async () => {
    const response = await upload(ticketId, ownerId, "evidence.png", "image/png");

    expect(response.status).toBe(201);
    const attachment = response.body.data;
    expect(attachment.originalFilename).toBe("evidence.png");
    expect(attachment.mimeType).toBe("image/png");
    expect(attachment.sizeBytes).toBe(PNG.length);
    expect(attachment.status).toBe("ACTIVE");
    expect(attachment.removedAt).toBeNull();
    expect(attachment.removedReason).toBeNull();
    expect(attachment.uploadedBy.id).toBe(ownerId);
  });

  it("refuses an upload to another Requester's Ticket", async () => {
    const response = await upload(foreignTicketId, ownerId, "evidence.png", "image/png");

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("NOT_FOUND");

    const stored = await prisma.attachment.count({ where: { ticketId: foreignTicketId } });
    expect(stored).toBe(0);
  });
});

describe("POST attachments (API-25 - AC-29)", () => {
  it("rejects the sixth active attachment and names the limit", async () => {
    for (let i = 0; i < ACTIVE_LIMIT; i += 1) {
      await addOne(`evidence-${i}.png`);
    }

    const sixth = await upload(ticketId, ownerId, "evidence-6.png", "image/png");

    expect(sixth.status).toBe(409);
    expect(sixth.body.error.code).toBe("ATTACHMENT_LIMIT_REACHED");
    expect(sixth.body.error.message).toContain(String(ACTIVE_LIMIT));

    const active = await prisma.attachment.count({ where: { ticketId, removedAt: null } });
    expect(active).toBe(ACTIVE_LIMIT);
  });
});

describe("POST attachments (API-26 - AC-30)", () => {
  it("rejects a file over 5 MB", async () => {
    const oversized = Buffer.alloc(MAX_BYTES + 1, 0);

    const response = await upload(ticketId, ownerId, "huge.pdf", "application/pdf", oversized);

    expect(response.status).toBe(413);
    expect(response.body.error.code).toBe("FILE_TOO_LARGE");
    expect(await prisma.attachment.count({ where: { ticketId } })).toBe(0);
  });
});

describe("POST attachments (API-27 - AC-31)", () => {
  it("rejects an impermissible type", async () => {
    const response = await upload(ticketId, ownerId, "payload.exe", "application/x-msdownload");

    expect(response.status).toBe(415);
    expect(response.body.error.code).toBe("UNSUPPORTED_FILE_TYPE");
    expect(await prisma.attachment.count({ where: { ticketId } })).toBe(0);
  });

  it("rejects a permitted extension whose declared type disagrees", async () => {
    const response = await upload(ticketId, ownerId, "report.pdf", "image/png");

    expect(response.status).toBe(415);
    expect(await prisma.attachment.count({ where: { ticketId } })).toBe(0);
  });
});

describe("GET download (API-28 - AC-32)", () => {
  it("streams the file under its original filename", async () => {
    const id = await addOne("battery-report.png");

    const response = await request(app)
      .get(`/api/v1/attachments/${id}/download`)
      .set("X-Dev-Requester-Id", ownerId);

    expect(response.status).toBe(200);
    expect(response.headers["content-disposition"]).toContain('filename="battery-report.png"');
    expect(response.headers["content-type"]).toContain("image/png");
    expect(Buffer.from(response.body)).toEqual(PNG);
  });
});

describe("DELETE attachment (API-29 - AC-33)", () => {
  it("marks the attachment removed and keeps the row", async () => {
    const id = await addOne();
    const reason = "Uploaded the wrong screenshot by mistake";

    const response = await request(app)
      .delete(`/api/v1/attachments/${id}`)
      .set("X-Dev-Requester-Id", ownerId)
      .send({ removalReason: reason });

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe("REMOVED");
    expect(response.body.data.removedReason).toBe(reason);

    // Soft: the row survives with its removal metadata (BR-35).
    const row = await prisma.attachment.findUnique({ where: { id } });
    expect(row).not.toBeNull();
    expect(row!.removedAt).not.toBeNull();
    expect(row!.removedById).toBe(ownerId);
    expect(row!.removedReason).toBe(reason);
  });

  it("deletes the binary while keeping the metadata (BR-39, DEC-05)", async () => {
    const id = await addOne();
    const before = await prisma.attachment.findUnique({ where: { id } });
    const { existsSync } = await import("node:fs");
    const { join } = await import("node:path");
    const path = join("storage", "attachments", before!.storedFilename);
    expect(existsSync(path), "the binary should exist before removal").toBe(true);

    await request(app)
      .delete(`/api/v1/attachments/${id}`)
      .set("X-Dev-Requester-Id", ownerId)
      .send({ removalReason: "No longer relevant" });

    expect(existsSync(path), "the binary should be gone after removal").toBe(false);
    expect(await prisma.attachment.findUnique({ where: { id } })).not.toBeNull();
  });
});

describe("DELETE attachment (API-30 - AC-34)", () => {
  it("rejects removal with no reason, and with too short a reason", async () => {
    const id = await addOne();

    for (const body of [{}, { removalReason: "" }, { removalReason: "   " }, { removalReason: "abcd" }]) {
      const response = await request(app)
        .delete(`/api/v1/attachments/${id}`)
        .set("X-Dev-Requester-Id", ownerId)
        .send(body);

      expect(response.status, `${JSON.stringify(body)} should be rejected`).toBe(422);
      expect(response.body.error.details.removalReason).toEqual(expect.any(String));
    }

    // Still active: a rejected removal must not have removed anything.
    const row = await prisma.attachment.findUnique({ where: { id } });
    expect(row!.removedAt).toBeNull();
  });

  it("rejects a reason longer than 200 characters", async () => {
    const id = await addOne();

    const response = await request(app)
      .delete(`/api/v1/attachments/${id}`)
      .set("X-Dev-Requester-Id", ownerId)
      .send({ removalReason: "x".repeat(201) });

    expect(response.status).toBe(422);
  });
});

describe("GET download (API-31 - AC-36)", () => {
  it("refuses a removed attachment with 410", async () => {
    const id = await addOne();
    await request(app)
      .delete(`/api/v1/attachments/${id}`)
      .set("X-Dev-Requester-Id", ownerId)
      .send({ removalReason: "Uploaded the wrong file" });

    const response = await request(app)
      .get(`/api/v1/attachments/${id}/download`)
      .set("X-Dev-Requester-Id", ownerId);

    expect(response.status).toBe(410);
    expect(response.body.error.code).toBe("ATTACHMENT_REMOVED");
  });
});

describe("GET attachments (API-32 - AC-35)", () => {
  it("keeps a removed attachment in the list with its full metadata", async () => {
    const activeId = await addOne("kept.png");
    const removedId = await addOne("discarded.png");
    const reason = "Uploaded the wrong screenshot by mistake";
    await request(app)
      .delete(`/api/v1/attachments/${removedId}`)
      .set("X-Dev-Requester-Id", ownerId)
      .send({ removalReason: reason });

    const response = await request(app)
      .get(`/api/v1/tickets/${ticketId}/attachments`)
      .set("X-Dev-Requester-Id", ownerId);

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(2);

    const removed = response.body.data.find((a: { id: string }) => a.id === removedId);
    expect(removed.status).toBe("REMOVED");
    expect(removed.originalFilename).toBe("discarded.png");
    expect(removed.sizeBytes).toBe(PNG.length);
    expect(removed.removedReason).toBe(reason);
    expect(removed.removedAt).toEqual(expect.any(String));

    const active = response.body.data.find((a: { id: string }) => a.id === activeId);
    expect(active.status).toBe("ACTIVE");
  });
});

describe("attachments ownership (API-33, API-34 - AC-37)", () => {
  it("refuses a download of another Requester's attachment", async () => {
    const id = await addOne();

    const response = await request(app)
      .get(`/api/v1/attachments/${id}/download`)
      .set("X-Dev-Requester-Id", otherId);

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("NOT_FOUND");
  });

  it("answers a foreign attachment and a missing one identically", async () => {
    const id = await addOne();
    const missing = "3f8b0c22-0000-4000-8000-000000000000";

    const foreign = await request(app)
      .get(`/api/v1/attachments/${id}/download`)
      .set("X-Dev-Requester-Id", otherId);
    const absent = await request(app)
      .get(`/api/v1/attachments/${missing}/download`)
      .set("X-Dev-Requester-Id", otherId);

    // Guarded: comparing two empty bodies is equality without meaning, and
    // would pass against a route that does not exist at all. Pin both to our
    // refusal first, then compare them.
    expect(foreign.status).toBe(404);
    expect(absent.status).toBe(404);
    expect(foreign.body.error.code).toBe("NOT_FOUND");

    expect(JSON.stringify(foreign.body)).toBe(JSON.stringify(absent.body));
  });

  it("refuses removal of another Requester's attachment and leaves it active", async () => {
    const id = await addOne();

    const response = await request(app)
      .delete(`/api/v1/attachments/${id}`)
      .set("X-Dev-Requester-Id", otherId)
      .send({ removalReason: "Not mine to remove" });

    expect(response.status).toBe(404);

    const row = await prisma.attachment.findUnique({ where: { id } });
    expect(row!.removedAt, "the attachment must still be active").toBeNull();
  });

  it("refuses to list another Requester's attachments", async () => {
    const response = await request(app)
      .get(`/api/v1/tickets/${foreignTicketId}/attachments`)
      .set("X-Dev-Requester-Id", ownerId);

    expect(response.status).toBe(404);
    // A bare 404 is also what Express returns for a route that does not exist,
    // so the code pins this to our own refusal.
    expect(response.body.error.code).toBe("NOT_FOUND");
  });
});

describe("DELETE attachment (API-35 - api-spec 4.4)", () => {
  it("rejects removing an already-removed attachment", async () => {
    const id = await addOne();
    const remove = () =>
      request(app)
        .delete(`/api/v1/attachments/${id}`)
        .set("X-Dev-Requester-Id", ownerId)
        .send({ removalReason: "Uploaded the wrong file" });

    expect((await remove()).status).toBe(200);

    const second = await remove();
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe("ATTACHMENT_ALREADY_REMOVED");
  });
});

describe("POST attachments (API-36 - BR-32)", () => {
  it("frees a slot when an attachment is removed", async () => {
    const ids: string[] = [];
    for (let i = 0; i < ACTIVE_LIMIT; i += 1) ids.push(await addOne(`evidence-${i}.png`));

    expect((await upload(ticketId, ownerId, "sixth.png", "image/png")).status).toBe(409);

    await request(app)
      .delete(`/api/v1/attachments/${ids[0]}`)
      .set("X-Dev-Requester-Id", ownerId)
      .send({ removalReason: "Making room for a better screenshot" });

    // Removed attachments stop counting toward the limit (BR-32).
    expect((await upload(ticketId, ownerId, "sixth.png", "image/png")).status).toBe(201);
    expect(await prisma.attachment.count({ where: { ticketId } })).toBe(ACTIVE_LIMIT + 1);
    expect(await prisma.attachment.count({ where: { ticketId, removedAt: null } })).toBe(ACTIVE_LIMIT);
  });
});

describe("attachments (API-37 - BR-28)", () => {
  it("never exposes the stored filename or a filesystem path", async () => {
    const id = await addOne("evidence.png");
    const row = await prisma.attachment.findUnique({ where: { id } });
    expect(row!.storedFilename, "the fixture must have a stored name to leak").toBeTruthy();

    const responses = [
      await request(app).get(`/api/v1/tickets/${ticketId}`).set("X-Dev-Requester-Id", ownerId),
      await request(app).get(`/api/v1/tickets/${ticketId}/attachments`).set("X-Dev-Requester-Id", ownerId),
      await request(app)
        .delete(`/api/v1/attachments/${id}`)
        .set("X-Dev-Requester-Id", ownerId)
        .send({ removalReason: "Checking the response shape" }),
    ];

    for (const response of responses) {
      // Backslashes are normalised first so a Windows path cannot slip past
      // a check written with forward slashes.
      const body = JSON.stringify(response.body).split(String.fromCharCode(92)).join("/");
      expect(body).not.toContain(row!.storedFilename);
      expect(body).not.toContain("storedFilename");
      expect(body).not.toContain("storage/attachments");
      expect(body).not.toMatch(new RegExp("[A-Za-z]:/"));
      expect(body).not.toContain("/home/");
      expect(body).not.toContain("/usr/");
    }
  });
});
