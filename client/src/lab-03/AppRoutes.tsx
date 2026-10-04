import { Navigate, Outlet, Route, Routes, useLocation, useSearchParams } from "react-router-dom";
import { useAuth } from "./AuthContext.js";
import type { Role } from "./auth-api.js";
import { AppShell } from "./AppShell.js";
import { Forbidden } from "./components/Forbidden.js";
import { landingFor, safeNext } from "./routes.js";
import { ChangePassword } from "./screens/ChangePassword.js";
import { Login } from "./screens/Login.js";
import { MyTickets } from "../lab-02/screens/MyTickets.js";
import { CreateTicket } from "../lab-02/screens/CreateTicket.js";
import { RequesterTicketDetail } from "../lab-02/screens/RequesterTicketDetail.js";
import LegacyLab01App from "../App.js";

// Route tree (docs/lab-03/specification.md section 6, ui-spec.md section 4).
// Exported without a Router so main.tsx supplies BrowserRouter and the tests
// supply MemoryRouter.

/** Anonymous users go to Login: with next after a lost session, without it after logout. */
function RequireAuth() {
  const { status, endReason, generation } = useAuth();
  const location = useLocation();

  if (status !== "authenticated") {
    if (endReason === "logout") return <Navigate to="/login" replace />;
    const next = encodeURIComponent(`${location.pathname}${location.search}`);
    return <Navigate to={`/login?next=${next}`} replace />;
  }

  // Keyed on the signed-in user, so one user's fetched data can never be
  // reused for the next (UI-15).
  return (
    <AppShell key={generation}>
      <Outlet />
    </AppShell>
  );
}

/** The role check runs before the screen mounts, so a refused screen makes no request. */
function RequireRole({ roles }: { roles: Role[] }) {
  const { user } = useAuth();
  if (!roles.includes(user!.role)) return <Forbidden landingPath={landingFor(user!.role)} />;
  return <Outlet />;
}

/**
 * The one place that leaves /login once signed in, whether the session was
 * restored at startup or just created by the form: a must-change user goes to
 * Change Password, anyone else to a safe `next` or their landing route.
 */
function LoginRoute() {
  const { status, user } = useAuth();
  const [params] = useSearchParams();
  if (status === "authenticated") {
    const target = user!.mustChangePassword
      ? "/change-password"
      : (safeNext(params.get("next")) ?? landingFor(user!.role));
    return <Navigate to={target} replace />;
  }
  return <Login />;
}

function Landing() {
  const { user } = useAuth();
  return <Navigate to={landingFor(user!.role)} replace />;
}

export function AppRoutes() {
  return (
    <Routes>
      {/* Public and outside the shell, unchanged (L2-A-05, A-04). */}
      <Route path="/lab-01" element={<LegacyLab01App />} />
      <Route path="/login" element={<LoginRoute />} />

      <Route element={<RequireAuth />}>
        <Route path="/" element={<Landing />} />
        <Route path="/change-password" element={<ChangePassword />} />

        <Route element={<RequireRole roles={["REQUESTER"]} />}>
          <Route path="/tickets" element={<MyTickets />} />
          <Route path="/tickets/new" element={<CreateTicket />} />
          <Route path="/tickets/:ticketId" element={<RequesterTicketDetail />} />
        </Route>

        {/* The Ticket Queue (#43) and User Management (#45) screens arrive
            later. Until then a permitted role gets the shell with an empty
            main area, and every other role the forbidden state. */}
        <Route element={<RequireRole roles={["IT_STAFF", "ADMINISTRATOR"]} />}>
          <Route path="/staff/queue" element={null} />
        </Route>
        <Route element={<RequireRole roles={["ADMINISTRATOR"]} />}>
          <Route path="/admin/users" element={null} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
