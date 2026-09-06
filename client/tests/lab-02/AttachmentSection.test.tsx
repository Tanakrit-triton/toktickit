import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AttachmentSection } from "../../src/lab-02/components/AttachmentSection.js";
import type { Attachment } from "../../src/lab-02/api.js";
import * as api from "../../src/lab-02/api.js";

// UI-17 .. UI-21 from docs/lab-02/tests.md section 2.3.

const REQUESTER_ID = "aaaaaaaa-0000-0000-0000-000000000001";
const TICKET_ID = "tttttttt-0000-0000-0000-000000000001";

const active = (id: string, name: string): Attachment => ({
  id,
  ticketId: TICKET_ID,
  originalFilename: name,
  mimeType: "image/png",
  sizeBytes: 91204,
  uploadedAt: "2026-09-01T13:26:44.108Z",
  status: "ACTIVE",
  removedAt: null,
  removedReason: null,
});

const REMOVED: Attachment = {
  ...active("removed-1", "wrong-screenshot.png"),
  status: "REMOVED",
  removedAt: "2026-09-01T13:31:15.004Z",
  removedReason: "Uploaded the wrong screenshot by mistake",
};

function renderSection(attachments: Attachment[], onChanged = vi.fn()) {
  return render(
    <AttachmentSection
      ticketId={TICKET_ID}
      requesterId={REQUESTER_ID}
      attachments={attachments}
      onChanged={onChanged}
    />,
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("AttachmentSection (UI-17 - AC-28)", () => {
  it("uploads a permitted file and reports the new attachment", async () => {
    const uploaded = active("new-1", "evidence.png");
    const uploadAttachment = vi.spyOn(api, "uploadAttachment").mockResolvedValue(uploaded);
    const onChanged = vi.fn();
    const user = userEvent.setup({ delay: null });

    renderSection([], onChanged);

    const file = new File(["png"], "evidence.png", { type: "image/png" });
    await user.upload(screen.getByTestId("field-attachments"), file);

    await waitFor(() => expect(uploadAttachment).toHaveBeenCalledTimes(1));
    expect(uploadAttachment.mock.calls[0][0]).toBe(REQUESTER_ID);
    expect(uploadAttachment.mock.calls[0][1]).toBe(TICKET_ID);
    // The parent owns the list, so a successful upload has to report upward or
    // the new attachment would never appear.
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it("rejects an impermissible file without calling the API", async () => {
    const uploadAttachment = vi.spyOn(api, "uploadAttachment");
    const user = userEvent.setup({ delay: null });

    renderSection([]);

    const file = new File(["exe"], "payload.exe", { type: "application/x-msdownload" });
    await user.upload(screen.getByTestId("field-attachments"), file);

    expect(await screen.findByTestId("attachment-error")).toHaveTextContent(/type not permitted/i);
    expect(uploadAttachment).not.toHaveBeenCalled();
  });
});

describe("AttachmentSection (UI-18 - AC-29)", () => {
  it("disables selection at five active attachments and states the limit", async () => {
    const five = [0, 1, 2, 3, 4].map((i) => active(`a${i}`, `evidence-${i}.png`));

    renderSection(five);

    expect(await screen.findByTestId("attachment-limit-reached")).toHaveTextContent(
      /maximum of 5 attachments/i,
    );
    expect(screen.queryByTestId("field-attachments")).not.toBeInTheDocument();
  });

  it("counts only active attachments toward the limit", async () => {
    // Four active plus one removed is four, not five (BR-32).
    const rows = [0, 1, 2, 3].map((i) => active(`a${i}`, `evidence-${i}.png`)).concat(REMOVED);

    renderSection(rows);

    expect(await screen.findByTestId("field-attachments")).toBeInTheDocument();
    expect(screen.queryByTestId("attachment-limit-reached")).not.toBeInTheDocument();
  });
});

describe("AttachmentSection (UI-19 - AC-35)", () => {
  it("shows a removed attachment with its metadata and no download control", async () => {
    renderSection([active("a1", "kept.png"), REMOVED]);

    const removed = await screen.findByTestId(`attachment-row-${REMOVED.id}`);
    expect(removed).toHaveTextContent("wrong-screenshot.png");
    expect(removed).toHaveTextContent("Uploaded the wrong screenshot by mistake");
    expect(removed).toHaveTextContent(/removed/i);

    // The whole point: a removed attachment offers no way to fetch it.
    expect(removed.querySelector('[data-testid="btn-download"]')).toBeNull();
    expect(removed.querySelector('[data-testid="btn-remove"]')).toBeNull();

    // The active one still does, so the absence above is specific.
    const kept = screen.getByTestId("attachment-row-a1");
    expect(kept.querySelector('[data-testid="btn-download"]')).not.toBeNull();
  });
});

describe("AttachmentSection (UI-20 - BR-37)", () => {
  it("opens a modal and sends nothing until removal is confirmed", async () => {
    const removeAttachment = vi.spyOn(api, "removeAttachment");
    const user = userEvent.setup({ delay: null });

    renderSection([active("a1", "kept.png")]);

    await user.click(screen.getByTestId("btn-remove"));

    expect(await screen.findByTestId("removal-modal")).toBeInTheDocument();
    // Opening the dialogue is not consent. Nothing has been sent.
    expect(removeAttachment).not.toHaveBeenCalled();
    expect(screen.getByTestId("removal-modal")).toHaveTextContent("kept.png");

    await user.click(screen.getByTestId("btn-cancel-removal"));

    await waitFor(() => expect(screen.queryByTestId("removal-modal")).not.toBeInTheDocument());
    expect(removeAttachment).not.toHaveBeenCalled();
  });

  it("removes only after a reason is given and confirmed", async () => {
    const removeAttachment = vi
      .spyOn(api, "removeAttachment")
      .mockResolvedValue({ ...active("a1", "kept.png"), status: "REMOVED" });
    const onChanged = vi.fn();
    const user = userEvent.setup({ delay: null });

    renderSection([active("a1", "kept.png")], onChanged);

    await user.click(screen.getByTestId("btn-remove"));
    await user.type(screen.getByTestId("field-removal-reason"), "Uploaded the wrong screenshot");
    await user.click(screen.getByTestId("btn-confirm-removal"));

    await waitFor(() => expect(removeAttachment).toHaveBeenCalledTimes(1));
    expect(removeAttachment.mock.calls[0][2]).toBe("Uploaded the wrong screenshot");
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });
});

describe("AttachmentSection (UI-21 - AC-34)", () => {
  it("blocks confirmation with an empty reason and says why", async () => {
    const removeAttachment = vi.spyOn(api, "removeAttachment");
    const user = userEvent.setup({ delay: null });

    renderSection([active("a1", "kept.png")]);

    await user.click(screen.getByTestId("btn-remove"));
    await user.click(screen.getByTestId("btn-confirm-removal"));

    expect(await screen.findByTestId("error-removal-reason")).toBeInTheDocument();
    expect(removeAttachment).not.toHaveBeenCalled();
    // The modal stays open so the Requester can supply the reason.
    expect(screen.getByTestId("removal-modal")).toBeInTheDocument();
  });

  it("blocks a reason shorter than five characters", async () => {
    const removeAttachment = vi.spyOn(api, "removeAttachment");
    const user = userEvent.setup({ delay: null });

    renderSection([active("a1", "kept.png")]);

    await user.click(screen.getByTestId("btn-remove"));
    await user.type(screen.getByTestId("field-removal-reason"), "oops");
    await user.click(screen.getByTestId("btn-confirm-removal"));

    expect(await screen.findByTestId("error-removal-reason")).toBeInTheDocument();
    expect(removeAttachment).not.toHaveBeenCalled();
  });
});
