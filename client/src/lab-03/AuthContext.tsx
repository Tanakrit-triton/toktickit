import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import * as authApi from "./auth-api.js";
import type { CurrentUser, Session } from "./auth-api.js";
import { setCsrfToken, setSessionHandlers } from "./api-client.js";

// Authenticated identity (docs/lab-03/ui-spec.md sections 3 and 4).
//
// Replaces the Lab 2 RequesterProvider. Identity comes from the server session
// (GET /auth/me at startup, POST /auth/login after sign-in), never from
// storage. The provider uses no router, so it sits above BrowserRouter as the
// Lab 2 provider did; the route guards turn its state into redirects.

/** The Lab 2 selector's storage key, removed once at startup (ui-spec 4, UI-19). */
export const LEGACY_REQUESTER_KEY = "toktickit.selectedRequester";

export type AuthStatus = "loading" | "anonymous" | "authenticated";

/** Why the user is anonymous: chosen to log out, or the server ended the session. */
export type EndReason = "logout" | "session-ended" | null;

/** An Info callout shown once, on the screen it was raised for (ui-spec 6.2). */
export type Notice = { text: string; path: string };

interface AuthValue {
  status: AuthStatus;
  user: CurrentUser | null;
  endReason: EndReason;
  /** Changes whenever the signed-in user changes, so the shell can remount and drop cached data. */
  generation: number;
  notice: Notice | null;
  signIn: (session: Session) => void;
  signOut: () => Promise<void>;
  passwordChanged: (session: Session, landingPath: string) => void;
  clearNotice: () => void;
}

const AuthContext = createContext<AuthValue | null>(null);

type State = { status: AuthStatus; user: CurrentUser | null; endReason: EndReason };

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>({ status: "loading", user: null, endReason: null });
  const [generation, setGeneration] = useState(0);
  const [notice, setNotice] = useState<Notice | null>(null);

  // Read by the API handlers, which are installed once.
  const statusRef = useRef(state.status);
  statusRef.current = state.status;

  const end = useCallback((endReason: Exclude<EndReason, null>) => {
    setCsrfToken(null);
    setState({ status: "anonymous", user: null, endReason });
    setNotice(null);
    setGeneration((g) => g + 1);
  }, []);

  const adopt = useCallback((session: Session) => {
    setCsrfToken(session.csrfToken);
    setState({ status: "authenticated", user: session.user, endReason: null });
  }, []);

  /** Re-reads the session: after PASSWORD_CHANGE_REQUIRED or CSRF_INVALID. */
  const refresh = useCallback(async () => {
    try {
      const session = await authApi.fetchCurrentSession();
      if (session === null) end("session-ended");
      else adopt(session);
    } catch {
      // A failed refresh leaves the current state alone; the screen that
      // triggered it has already shown its safe failure.
    }
  }, [adopt, end]);

  // App start: drop the Lab 2 selection, then restore any existing session.
  useEffect(() => {
    try {
      window.sessionStorage.removeItem(LEGACY_REQUESTER_KEY);
    } catch {
      // Storage can be unavailable; there is then nothing to remove.
    }

    let cancelled = false;
    authApi
      .fetchCurrentSession()
      .then((session) => {
        if (cancelled) return;
        if (session === null) setState({ status: "anonymous", user: null, endReason: null });
        else adopt(session);
      })
      .catch(() => {
        if (!cancelled) setState({ status: "anonymous", user: null, endReason: null });
      });
    return () => {
      cancelled = true;
    };
  }, [adopt]);

  useEffect(
    () =>
      setSessionHandlers({
        // Only a session that existed can end; a 401 while signed out is not news.
        onUnauthenticated: () => {
          if (statusRef.current === "authenticated") end("session-ended");
        },
        onPasswordChangeRequired: () => void refresh(),
        onCsrfInvalid: () => void refresh(),
      }),
    [end, refresh],
  );

  const signIn = useCallback(
    (session: Session) => {
      adopt(session);
      setNotice(null);
      setGeneration((g) => g + 1);
    },
    [adopt],
  );

  const signOut = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      // The client forgets the session either way; a server that cannot be
      // reached will expire it (BR-16).
    }
    end("logout");
  }, [end]);

  const passwordChanged = useCallback(
    (session: Session, landingPath: string) => {
      adopt(session);
      setNotice({ text: "Password changed.", path: landingPath });
    },
    [adopt],
  );

  const clearNotice = useCallback(() => setNotice(null), []);

  const value = useMemo<AuthValue>(
    () => ({ ...state, generation, notice, signIn, signOut, passwordChanged, clearNotice }),
    [state, generation, notice, signIn, signOut, passwordChanged, clearNotice],
  );

  // Nothing renders until the session is known (ui-spec 4: full-screen
  // loading at app start), so no screen ever mounts against an unknown user.
  if (state.status === "loading") {
    return (
      <div className="zg-loading-screen" role="status" data-testid="app-loading">
        Loading…
      </div>
    );
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (value === null) {
    throw new Error("useAuth must be used inside an AuthProvider");
  }
  return value;
}
