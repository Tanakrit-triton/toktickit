import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { useAuth } from "./AuthContext.js";
import type { Role } from "./auth-api.js";
import { Callout } from "./components/Callout.js";
import { RoleBadge } from "./components/RoleBadge.js";
import { landingFor } from "./routes.js";
import { ChangePassword } from "./screens/ChangePassword.js";

// Application shell (docs/lab-03/ui-spec.md section 3). Replaces the Lab 2
// shell: identity comes from the session, so the "Acting as" display, the
// Change Requester action, and the development notice are gone.
//
// Forced password-change mode: only the brand (not a link), the user display,
// and Log out, and every route renders Change Password.

type Destination = { to: string; label: string; testId: string; end?: boolean };

const NAV: Record<Role, Destination[]> = {
  REQUESTER: [
    { to: "/tickets", label: "My Tickets", testId: "nav-my-tickets", end: true },
    { to: "/tickets/new", label: "Create Ticket", testId: "nav-create-ticket" },
  ],
  IT_STAFF: [{ to: "/staff/queue", label: "Ticket Queue", testId: "nav-ticket-queue" }],
  ADMINISTRATOR: [
    { to: "/staff/queue", label: "Ticket Queue", testId: "nav-ticket-queue" },
    { to: "/admin/users", label: "User Management", testId: "nav-user-management" },
  ],
};

export function AppShell({ children }: { children: ReactNode }) {
  const { user, signOut, notice, clearNotice } = useAuth();
  const { pathname } = useLocation();
  const [navOpen, setNavOpen] = useState(false);
  const forced = user!.mustChangePassword;
  const landing = landingFor(user!.role);

  // A notice belongs to the screen it was raised for, and is dropped as soon
  // as the user navigates elsewhere.
  const previousPath = useRef(pathname);
  useEffect(() => {
    if (previousPath.current === pathname) return;
    previousPath.current = pathname;
    setNavOpen(false);
    if (notice !== null && notice.path !== pathname) clearNotice();
  }, [pathname, notice, clearNotice]);

  return (
    <div data-testid="app-shell">
      <header className="zg-header">
        {forced ? (
          <span className="zg-brand">TokTickIT</span>
        ) : (
          <Link className="zg-brand" to={landing}>
            TokTickIT
          </Link>
        )}

        {/* Below 768px the navigation and the identity block collapse behind
            this toggle. In forced mode there is nothing to collapse, so the
            panel stays open and Log out is always reachable. */}
        {!forced && (
          <button
            type="button"
            className="zg-nav-toggle"
            data-testid="btn-nav-toggle"
            aria-expanded={navOpen}
            aria-controls="shell-nav-panel"
            onClick={() => setNavOpen((open) => !open)}
          >
            Menu
          </button>
        )}

        <div
          id="shell-nav-panel"
          className={navOpen || forced ? "zg-nav-panel zg-nav-panel--open" : "zg-nav-panel"}
        >
          {!forced && (
            <nav className="zg-nav" aria-label="Main">
              {/* Destinations the role may not open are not rendered at all (FR-08). */}
              {NAV[user!.role].map((d) => (
                <NavLink key={d.to} className="zg-nav-link" to={d.to} end={d.end} data-testid={d.testId}>
                  {d.label}
                </NavLink>
              ))}
            </nav>
          )}

          <div className="zg-identity">
            <span className="zg-identity-name" data-testid="shell-user-name">
              {user!.fullName}
            </span>
            <RoleBadge role={user!.role} />
            {!forced && (
              <Link
                className="zg-btn zg-btn--tertiary zg-identity-action"
                to="/change-password"
                data-testid="link-change-password"
              >
                Change password
              </Link>
            )}
            <button
              type="button"
              className="zg-btn zg-btn--tertiary zg-identity-action"
              data-testid="btn-logout"
              onClick={() => void signOut()}
            >
              Log out
            </button>
          </div>
        </div>
      </header>

      <main className="zg-main">
        {notice !== null && notice.path === pathname && (
          <Callout variant="info" testId="callout-info">
            {notice.text}
          </Callout>
        )}
        {forced ? <ChangePassword /> : children}
      </main>
    </div>
  );
}
