import { useState, type ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { useRequester } from "./RequesterContext.js";
import { RequesterSelection } from "./screens/RequesterSelection.js";

// Application shell -- ui-spec.md section 4.
//
// The shell is also the guard. Any Requester-scoped screen rendered as a child
// is replaced wholesale by the Selection screen when no Requester is selected
// (FR-05, AC-02), so a screen can never render against a missing identity.

export function AppShell({ children }: { children: ReactNode }) {
  const { requester, generation, select, clear } = useRequester();
  const [navOpen, setNavOpen] = useState(false);

  // Required on every screen by BR-03, including the selection screen itself.
  const developmentNotice = (
    <p className="zg-dev-notice" data-testid="dev-mode-notice" role="note">
      Development mode - Requester identity is simulated for Lab 2 testing. This is
      not a login.
    </p>
  );

  if (requester === null) {
    return (
      <>
        {developmentNotice}
        <RequesterSelection onSelected={select} />
      </>
    );
  }

  return (
    <>
      <header className="zg-header">
        <span className="zg-brand">TokTickIT</span>

        {/* Below 768px the navigation collapses behind this toggle and the
            identity block moves inside the expanded panel (ui-spec section 4).
            The control is hidden by CSS at wider widths; the DOM stays the
            same at every width so nothing is unreachable to assistive tech. */}
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

        <div
          id="shell-nav-panel"
          className={navOpen ? "zg-nav-panel zg-nav-panel--open" : "zg-nav-panel"}
        >
        <nav className="zg-nav" aria-label="Main">
          {/* NavLink sets aria-current="page" on the active route itself, so
              active indication follows the URL rather than a hardcoded prop.
              The 3px white underline comes from the [aria-current] rule in
              the stylesheet, so state is never signalled by colour alone. */}
          <NavLink className="zg-nav-link" to="/tickets" end>
            My Tickets
          </NavLink>
          <NavLink className="zg-nav-link" to="/tickets/new">
            Create Ticket
          </NavLink>
        </nav>

        <div className="zg-identity">
          <span data-testid="shell-requester-name">Acting as: {requester.fullName}</span>
          <button
            type="button"
            className="zg-btn zg-btn--tertiary zg-identity-action"
            data-testid="btn-change-requester"
            onClick={clear}
          >
            Change Requester
          </button>
        </div>
        </div>
      </header>

      {developmentNotice}

      {/*
        Keyed on the switch generation so that changing Requester tears the
        subtree down and mounts it fresh. Requester A's fetched data is
        discarded rather than reused for Requester B (BR-12, AC-04).
      */}
      <main key={generation} className="zg-main">
        {children}
      </main>
    </>
  );
}
