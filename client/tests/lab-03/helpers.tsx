import { vi } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { AuthProvider } from "../../src/lab-03/AuthContext.js";
import { AppRoutes } from "../../src/lab-03/AppRoutes.js";
import * as authApi from "../../src/lab-03/auth-api.js";
import type { CurrentUser, Session } from "../../src/lab-03/auth-api.js";
import * as api from "../../src/lab-02/api.js";

// Shared fixtures for the Lab 3 UI component suites (docs/lab-03/tests.md
// section 2.10). The API modules are mocked (tests.md section 1, Levels); the
// real AuthProvider and route tree run on top of them.

export const REQUESTER: CurrentUser = {
  id: "aaaaaaaa-0000-0000-0000-000000000001",
  fullName: "Napat Chaiwong",
  email: "napat.cha@kmutt.ac.th",
  role: "REQUESTER",
  mustChangePassword: false,
};

export const OTHER_REQUESTER: CurrentUser = {
  id: "bbbbbbbb-0000-0000-0000-000000000002",
  fullName: "Siriporn Meesuk",
  email: "siriporn.mee@kmutt.ac.th",
  role: "REQUESTER",
  mustChangePassword: false,
};

export const IT_STAFF: CurrentUser = {
  id: "cccccccc-0000-0000-0000-000000000003",
  fullName: "Wichai Prasert",
  email: "wichai.pra@kmutt.ac.th",
  role: "IT_STAFF",
  mustChangePassword: false,
};

export const ADMINISTRATOR: CurrentUser = {
  id: "dddddddd-0000-0000-0000-000000000004",
  fullName: "Sasithorn Pholchai",
  email: "sasithorn.pho@kmutt.ac.th",
  role: "ADMINISTRATOR",
  mustChangePassword: false,
};

export const MUST_CHANGE: CurrentUser = {
  id: "eeeeeeee-0000-0000-0000-000000000005",
  fullName: "Chayanin Boonmee",
  email: "chayanin.boo@kmutt.ac.th",
  role: "REQUESTER",
  mustChangePassword: true,
};

export const session = (user: CurrentUser, csrfToken = "csrf-token-1"): Session => ({ user, csrfToken });

/** The session GET /auth/me restores at startup, or null for none. */
export function mockStartupSession(user: CurrentUser | null) {
  return vi.spyOn(authApi, "fetchCurrentSession").mockResolvedValue(user === null ? null : session(user));
}

export const CATEGORIES = [
  { id: 1, name: "Account and Access" },
  { id: 2, name: "Hardware" },
];
export const SYSTEMS = [{ id: 5, name: "Corporate Laptop" }];

export const ticketRow = (ticketNumber: string, summary: string) => ({
  id: `t-${ticketNumber}`,
  ticketNumber,
  summary,
  category: CATEGORIES[1],
  relatedSystem: SYSTEMS[0],
  requestedPriority: "HIGH",
  currentStatus: "NEW",
  attachmentCount: 0,
  createdAt: "2026-09-01T10:00:00.000Z",
  updatedAt: "2026-09-01T10:00:00.000Z",
});

/** Lets the Requester's Lab 2 screens load without a network. */
export function mockRequesterScreens(rows = [ticketRow("TKT-2026-00042", "Laptop battery drains within one hour")]) {
  vi.spyOn(api, "fetchCategories").mockResolvedValue(CATEGORIES);
  vi.spyOn(api, "fetchRelatedSystems").mockResolvedValue(SYSTEMS);
  return vi.spyOn(api, "fetchTickets").mockResolvedValue({
    data: rows,
    meta: { page: 1, pageSize: 10, totalItems: rows.length, totalPages: rows.length === 0 ? 0 : 1 },
  });
}

/** Renders the current location so redirects can be asserted. */
function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{`${location.pathname}${location.search}`}</output>;
}

/** The real provider and route tree at `path`, as main.tsx mounts them. */
export function renderApp(path: string) {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={[path]}>
        <AppRoutes />
        <LocationProbe />
      </MemoryRouter>
    </AuthProvider>,
  );
}
