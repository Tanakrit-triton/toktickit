import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { DevRequester } from "./api.js";

// Selected Development Requester context (BR-11, BR-12, A-01).
//
// The selection lives in sessionStorage and is lost when the tab closes, which
// is acceptable for a test fixture and is what AC-02 relies on. It carries no
// cryptographic guarantee and must never be described as a credential: Lab 3
// replaces it with the authenticated session in D-04.

export const SELECTED_REQUESTER_KEY = "toktickit.selectedRequester";

interface RequesterContextValue {
  requester: DevRequester | null;
  /** Monotonic; changes on every switch so consumers can key a remount off it. */
  generation: number;
  select: (requester: DevRequester) => void;
  clear: () => void;
}

const RequesterContext = createContext<RequesterContextValue | null>(null);

function readStoredRequester(): DevRequester | null {
  try {
    const raw = window.sessionStorage.getItem(SELECTED_REQUESTER_KEY);
    return raw === null ? null : (JSON.parse(raw) as DevRequester);
  } catch {
    // Unparseable storage is treated as no selection rather than crashing the
    // app; the guard then sends the user to the selection screen.
    return null;
  }
}

export function RequesterProvider({ children }: { children: ReactNode }) {
  const [requester, setRequester] = useState<DevRequester | null>(readStoredRequester);
  const [generation, setGeneration] = useState(0);

  const select = useCallback((next: DevRequester) => {
    window.sessionStorage.setItem(SELECTED_REQUESTER_KEY, JSON.stringify(next));
    setRequester(next);
    setGeneration((g) => g + 1);
  }, []);

  const clear = useCallback(() => {
    window.sessionStorage.removeItem(SELECTED_REQUESTER_KEY);
    setRequester(null);
    setGeneration((g) => g + 1);
  }, []);

  const value = useMemo(
    () => ({ requester, generation, select, clear }),
    [requester, generation, select, clear],
  );

  return <RequesterContext.Provider value={value}>{children}</RequesterContext.Provider>;
}

export function useRequester(): RequesterContextValue {
  const value = useContext(RequesterContext);
  if (value === null) {
    throw new Error("useRequester must be used inside a RequesterProvider");
  }
  return value;
}
