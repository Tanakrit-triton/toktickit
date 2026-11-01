import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { REQUESTER, IT_STAFF } from "../lab-03/helpers.js";
import { asAuthor, entry, ok, requesterRoutes, staffRoutes } from "../lab-03/ticket-fixtures.js";
import { ACTIONS, HISTORY, historyBody, openRequesterDetail, openStaffDetail, staffTicket4 } from "./action-fixtures.js";

// UI-32 from docs/lab-04/tests.md section 2.7 (ui-spec.md sections 4.2 and 9):
// Ticket Date and Public Comment and Internal Note times use the same Bangkok
// format as action dates and History, "1 Sep 2026, 20:24", not the browser's
// locale format.
//
// The fixtures' instant is 2026-09-01T13:24:07.512Z, which is 20:24 in Bangkok
// (UTC+07:00). The expected text is written out by hand rather than computed
// with formatBangkok, so the test does not check the formatter against itself.

const T0 = "2026-09-01T13:24:07.512Z";
const T0_TEXT = "1 Sep 2026, 20:24";

const COMMENT_ID = "c0000000-0000-4000-8000-000000000001";
const NOTE_ID = "n0000000-0000-4000-8000-000000000001";

beforeEach(() => {
  vi.restoreAllMocks();
  window.sessionStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

function ticketDateValue(): HTMLElement {
  const info = screen.getByTestId("ticket-information");
  const label = within(info).getByText("Ticket Date");
  return label.parentElement!.querySelector<HTMLElement>(".zg-readonly-value")!;
}

function expectBangkokTime(item: HTMLElement) {
  const time = item.querySelector("time")!;
  expect(time).toHaveTextContent(new RegExp(`^${T0_TEXT}$`));
  // L3 ui-spec section 8: the full ISO value stays available.
  expect(time).toHaveAttribute("datetime", T0);
  expect(time).toHaveAttribute("title", T0);
}

describe("UI-32 (ui-spec 4.2, 9) - Bangkok times on the Lab 2 and Lab 3 detail screens", () => {
  it("shows the Requester Ticket Detail's Ticket Date in Bangkok time", async () => {
    await openRequesterDetail({ ...requesterRoutes(), [`GET ${ACTIONS}`]: ok([]) });

    expect(ticketDateValue()).toHaveTextContent(new RegExp(`^${T0_TEXT}$`));
  });

  it("shows the Staff Ticket Detail's Ticket Date in Bangkok time", async () => {
    await openStaffDetail({ ...staffRoutes(staffTicket4()), [`GET ${ACTIONS}`]: ok([]), [`GET ${HISTORY}`]: historyBody() });

    expect(ticketDateValue()).toHaveTextContent(new RegExp(`^${T0_TEXT}$`));
  });

  it("shows Public Comment and Internal Note times in Bangkok time on Staff Ticket Detail", async () => {
    const routes = staffRoutes(
      staffTicket4(),
      [entry(COMMENT_ID, "Please restart with the charger connected.", asAuthor(IT_STAFF), T0)],
      [entry(NOTE_ID, "Battery health 61%.", asAuthor(IT_STAFF), T0)],
    );
    await openStaffDetail({ ...routes, [`GET ${ACTIONS}`]: ok([]), [`GET ${HISTORY}`]: historyBody() });

    expectBangkokTime(await screen.findByTestId(`comment-item-${COMMENT_ID}`));
    await userEvent.click(screen.getByTestId("tab-notes"));
    expectBangkokTime(await screen.findByTestId(`note-item-${NOTE_ID}`));
  });

  it("shows Public Comment times in Bangkok time on Requester Ticket Detail", async () => {
    const routes = requesterRoutes(undefined, [entry(COMMENT_ID, "Thanks, it works now.", asAuthor(REQUESTER), T0)]);
    await openRequesterDetail({ ...routes, [`GET ${ACTIONS}`]: ok([]) });

    expectBangkokTime(await screen.findByTestId(`comment-item-${COMMENT_ID}`));
  });
});
