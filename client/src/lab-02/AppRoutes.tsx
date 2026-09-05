import { Navigate, Outlet, Route, Routes } from "react-router-dom";
import { AppShell } from "./AppShell.js";
import { MyTickets } from "./screens/MyTickets.js";
import { RequesterTicketDetail } from "./screens/RequesterTicketDetail.js";
import { CreateTicket } from "./screens/CreateTicket.js";
import LegacyLab01App from "../App.js";

// Route tree. Exported without a Router so main.tsx can supply BrowserRouter
// and UI-29 can supply MemoryRouter.
//
// No path here is specified by the contract: specification.md section 6 and
// ui-spec.md section 4 name screens and navigation labels, never URLs. These
// paths are chosen in this issue and recorded in specification.md section 11 so
// that #16, #17, #18, and E2E-03 have one vocabulary to build on rather than
// each inventing their own.

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/tickets" replace />} />

      {/*
        The Lab 1 page sits OUTSIDE AppShell on purpose. Wrapping it in the Zen
        Green header and the BR-03 development notice would change the Lab 1
        slice, and A-04 keeps it as it was. The cost is recorded as a known
        deviation: ui-spec.md section 4 asks for the notice on every screen, and
        this one screen does not carry it.
      */}
      <Route path="/lab-01" element={<LegacyLab01App />} />

      {/* Lab 2 screens. AppShell is both the chrome and the guard: with no
          Requester selected it renders the Selection screen in place of the
          outlet, so no scoped screen can render without an identity (FR-05,
          AC-02). */}
      <Route
        element={
          <AppShell>
            <Outlet />
          </AppShell>
        }
      >
        <Route path="/tickets" element={<MyTickets />} />
        <Route path="/tickets/new" element={<CreateTicket />} />
        <Route path="/tickets/:ticketId" element={<RequesterTicketDetail />} />
      </Route>

      {/* Any unknown path behaves as the application root. */}
      <Route path="*" element={<Navigate to="/tickets" replace />} />
    </Routes>
  );
}
