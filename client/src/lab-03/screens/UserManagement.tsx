import { useEffect, useState } from "react";
import { useAuth } from "../AuthContext.js";
import type { Role } from "../auth-api.js";
import { landingFor } from "../routes.js";
import { AccountStatusBadge } from "../components/Badges.js";
import { Callout } from "../components/Callout.js";
import { Forbidden } from "../components/Forbidden.js";
import { RoleBadge } from "../components/RoleBadge.js";
import { ROLE_OPTIONS, UserDialog } from "../components/UserDialog.js";
import { fetchUsers, UserRequestError } from "../users-api.js";
import type { AdminUser } from "../users-api.js";
import { MOBILE_QUERY, useMediaQuery } from "../../lab-02/useMediaQuery.js";

// User Management -- docs/lab-03/ui-spec.md section 6.6, against api-spec.md
// section 7. The list is not paginated (BR-66). States and test hooks follow
// the Ticket Queue (#43).

const SEARCH_DEBOUNCE_MS = 300;
const SKELETON_ROWS = 5;

type LoadState = "loading" | "ready" | "failed" | "forbidden";

/** null: closed. `user` undefined: create. */
type DialogState = { user?: AdminUser } | null;

export function UserManagement() {
  const { user: me } = useAuth();
  const isMobile = useMediaQuery(MOBILE_QUERY);
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [role, setRole] = useState<Role | "">("");
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [state, setState] = useState<LoadState>("loading");
  const [reloadToken, setReloadToken] = useState(0);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    const id = setTimeout(() => setDebouncedQ(q), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [q]);

  useEffect(() => {
    let cancelled = false;
    setState("loading");
    const search = debouncedQ.trim();
    fetchUsers({ ...(search === "" ? {} : { q: search }), ...(role === "" ? {} : { role }) })
      .then((data) => {
        if (cancelled) return;
        setUsers(data);
        setState("ready");
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        // Only the kind is kept; no status code or server text reaches the page (AC-68).
        setUsers([]);
        setState(error instanceof UserRequestError && error.kind === "FORBIDDEN" ? "forbidden" : "failed");
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedQ, role, reloadToken]);

  function clearSearch() {
    setQ("");
    setDebouncedQ("");
    setRole("");
  }

  function openDialog(next: DialogState) {
    setSuccess(null);
    setDialog(next);
  }

  function saved(message: string) {
    setDialog(null);
    setSuccess(message);
    setReloadToken((t) => t + 1);
  }

  if (state === "forbidden") {
    return (
      <section data-testid="user-management-screen">
        <Forbidden landingPath={landingFor(me!.role)} />
      </section>
    );
  }

  const nameOf = (u: AdminUser) => (u.id === me!.id ? `${u.fullName} (you)` : u.fullName);

  const editButton = (u: AdminUser) => (
    <button
      type="button"
      className="zg-btn zg-btn--tertiary"
      aria-label={`Edit ${u.fullName}`}
      onClick={() => openDialog({ user: u })}
    >
      Edit
    </button>
  );

  return (
    <section data-testid="user-management-screen">
      <div className="zg-list-header">
        <h1 className="zg-title">User Management</h1>
        <button
          type="button"
          className="zg-btn zg-btn--primary"
          data-testid="btn-create-user"
          onClick={() => openDialog({})}
        >
          Create user
        </button>
      </div>

      {success !== null && (
        <Callout variant="success" testId="callout-success">
          {success}
        </Callout>
      )}

      <div className="zg-control-bar" data-testid="control-bar">
        <label className="zg-label" htmlFor="users-search">
          Search
          <input
            id="users-search"
            type="search"
            className="zg-field"
            data-testid="field-search"
            placeholder="Search name or email"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </label>
        <label className="zg-label" htmlFor="filter-role">
          Role
          <select
            id="filter-role"
            className="zg-field"
            data-testid="filter-role"
            value={role}
            onChange={(e) => setRole(e.target.value as Role | "")}
          >
            <option value="">All roles</option>
            {ROLE_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {state === "loading" && (
        <div className="zg-skeleton-list" data-testid="state-loading" aria-busy="true">
          {Array.from({ length: SKELETON_ROWS }, (_, i) => (
            <span key={i} className="zg-skeleton-row" aria-hidden="true" />
          ))}
          <span className="zg-helper">Loading users…</span>
        </div>
      )}

      {state === "failed" && (
        <Callout variant="error" testId="state-list-failed">
          Something went wrong. Try again.{" "}
          <button
            type="button"
            className="zg-btn zg-btn--secondary"
            data-testid="btn-retry"
            onClick={() => setReloadToken((t) => t + 1)}
          >
            Retry
          </button>
        </Callout>
      )}

      {/* There is no empty state: the signed-in Administrator always exists (ui-spec 6.6). */}
      {state === "ready" && users.length === 0 && (
        <div className="zg-state" data-testid="state-no-results">
          <p>No users match your search.</p>
          <button
            type="button"
            className="zg-btn zg-btn--secondary"
            data-testid="btn-clear-filters-no-results"
            onClick={clearSearch}
          >
            Clear
          </button>
        </div>
      )}

      {state === "ready" && users.length > 0 &&
        (isMobile ? (
          <ul className="zg-card-list" data-testid="user-card-list">
            {users.map((u) => (
              <li key={u.id} className="zg-ticket-card" data-testid={`user-card-${u.email}`}>
                <p className="zg-card-summary">{nameOf(u)}</p>
                <p className="zg-helper">{u.email}</p>
                <div className="zg-card-bottom">
                  <span>
                    <RoleBadge role={u.role} /> <AccountStatusBadge isActive={u.isActive} />
                  </span>
                  {editButton(u)}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="zg-table-scroll">
            <table className="zg-table" data-testid="users-table">
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Email</th>
                  <th scope="col">Role</th>
                  <th scope="col">Status</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} data-testid={`user-row-${u.email}`}>
                    <td>{nameOf(u)}</td>
                    <td>{u.email}</td>
                    <td>
                      <RoleBadge role={u.role} />
                    </td>
                    <td>
                      <AccountStatusBadge isActive={u.isActive} />
                    </td>
                    <td>{editButton(u)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}

      {dialog !== null && (
        <UserDialog
          user={dialog.user}
          isSelf={dialog.user?.id === me!.id}
          onClose={() => setDialog(null)}
          onSaved={saved}
        />
      )}
    </section>
  );
}
