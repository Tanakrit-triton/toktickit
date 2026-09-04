import { useCallback, useEffect, useState } from "react";
import * as api from "../api.js";
import type { DevRequester } from "../api.js";

// Development Requester Selection screen -- ui-spec.md section 5.1.
//
// This is NOT a login screen. It establishes which Requester the session is
// acting as so that ownership rules can be exercised before Lab 3 introduces
// real sessions (BR-03, D-04). The screen says so in its own copy, and nothing
// here treats the selection as proof of identity.
//
// api is imported as a namespace so the component reads the live binding,
// which is what lets UI-01..UI-05 replace fetchDevRequesters with a spy.

type LoadState = "loading" | "loaded" | "empty" | "failure";

export interface RequesterSelectionProps {
  onSelected: (requester: DevRequester) => void;
}

export function RequesterSelection({ onSelected }: RequesterSelectionProps) {
  const [state, setState] = useState<LoadState>("loading");
  const [requesters, setRequesters] = useState<DevRequester[]>([]);
  const [selectedId, setSelectedId] = useState("");

  const load = useCallback(async () => {
    setState("loading");
    setSelectedId("");
    try {
      const data = await api.fetchDevRequesters();
      setRequesters(data);
      setState(data.length === 0 ? "empty" : "loaded");
    } catch {
      // The thrown error is deliberately discarded. Rendering it would leak a
      // status code or stack trace into the UI (BR-28, AC-05).
      setRequesters([]);
      setState("failure");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function handleContinue() {
    const chosen = requesters.find((r) => r.id === selectedId);
    if (chosen) {
      onSelected(chosen);
    }
  }

  return (
    <main className="zg-selection-screen" data-testid="requester-selection-screen">
      <div className="zg-card zg-selection-card" aria-busy={state === "loading"}>
        <h1 className="zg-title">TokTickIT</h1>

        <p className="zg-helper">
          Select a Development Requester to test requester-specific ticket behaviour.
          This is not a login screen. Authentication and role-based access will be
          introduced in Lab 3.
        </p>

        {state === "loading" && (
          <div data-testid="state-loading">
            <span className="zg-skeleton" aria-hidden="true" />
            <span className="zg-helper">Loading Development Requesters...</span>
          </div>
        )}

        {state === "empty" && (
          <p className="zg-helper" data-testid="state-empty">
            No active Development Requesters exist. Seed the database before continuing.
          </p>
        )}

        {state === "failure" && (
          <div className="zg-callout-error" data-testid="state-failure" role="alert">
            <p>Could not load Development Requesters.</p>
            <button
              type="button"
              className="zg-btn zg-btn--secondary"
              data-testid="btn-retry"
              onClick={() => void load()}
            >
              Retry
            </button>
          </div>
        )}

        {state === "loaded" && (
          <>
            <label className="zg-label" htmlFor="dev-requester">
              Development Requester
            </label>
            <select
              id="dev-requester"
              className="zg-field"
              data-testid="field-dev-requester"
              value={selectedId}
              onChange={(event) => setSelectedId(event.target.value)}
            >
              <option value="">Choose a Development Requester</option>
              {requesters.map((requester) => (
                <option key={requester.id} value={requester.id}>
                  {requester.fullName} ({requester.email})
                </option>
              ))}
            </select>
          </>
        )}

        {state !== "empty" && state !== "failure" && (
          <button
            type="button"
            className="zg-btn zg-btn--primary zg-selection-continue"
            data-testid="btn-continue"
            disabled={selectedId === ""}
            onClick={handleContinue}
          >
            Continue
          </button>
        )}
      </div>
    </main>
  );
}
