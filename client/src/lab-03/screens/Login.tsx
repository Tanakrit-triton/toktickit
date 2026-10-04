import { useEffect, useRef, useState, type FormEvent } from "react";
import * as authApi from "../auth-api.js";
import { LoginError } from "../auth-api.js";
import { useAuth } from "../AuthContext.js";
import { Callout } from "../components/Callout.js";

// Login (docs/lab-03/ui-spec.md section 6.1). No shell.
//
// On success it only records the session: LoginRoute (AppRoutes.tsx) then
// leaves /login for next or the landing route, so there is one redirect path.

type Field = "email" | "password";

/** Fixed wording for each refusal; the server's own text is never shown (AC-68). */
const FAILURE_MESSAGE: Record<LoginError["reason"], string> = {
  INVALID_CREDENTIALS: "The email or password is incorrect.",
  ACCOUNT_INACTIVE: "This account is inactive. Contact your administrator.",
  TOO_MANY_ATTEMPTS: "Too many sign-in attempts. Try again in a few minutes.",
  FAILED: "Could not sign in. Try again.",
};

export function Login() {
  const { signIn, endReason } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [focusTarget, setFocusTarget] = useState<Field | null>(null);

  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  // Focus moves only once the fields are enabled again, so a disabled field
  // never swallows it.
  useEffect(() => {
    if (focusTarget === null || submitting) return;
    (focusTarget === "email" ? emailRef : passwordRef).current?.focus();
    setFocusTarget(null);
  }, [focusTarget, submitting]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;

    const found: Partial<Record<Field, string>> = {};
    if (email.trim() === "") found.email = "Enter your email.";
    if (password === "") found.password = "Enter your password.";
    setErrors(found);
    setFailure(null);
    if (Object.keys(found).length > 0) {
      setFocusTarget(found.email ? "email" : "password");
      return;
    }

    setSubmitting(true);
    try {
      const session = await authApi.login(email, password);
      signIn(session);
    } catch (error) {
      const reason = error instanceof LoginError ? error.reason : "FAILED";
      setFailure(FAILURE_MESSAGE[reason]);
      if (reason === "INVALID_CREDENTIALS") {
        // Keep the email, clear the password, and blame neither field (BR-07).
        setPassword("");
        setFocusTarget("password");
      }
      setSubmitting(false);
    }
  }

  const fieldProps = (field: Field) => ({
    id: `field-${field}`,
    "data-testid": `field-${field}`,
    className: "zg-field",
    disabled: submitting,
    required: true,
    "aria-invalid": errors[field] ? ("true" as const) : undefined,
    "aria-describedby": errors[field] ? `error-${field}` : undefined,
  });

  const message = (field: Field) =>
    errors[field] ? (
      <span className="zg-message-error" id={`error-${field}`} data-testid={`error-${field}`}>
        {errors[field]}
      </span>
    ) : null;

  return (
    <main className="zg-auth-screen" data-testid="login-screen">
      <div className="zg-card zg-auth-card">
        <h1 className="zg-title">Sign in to TokTickIT</h1>

        {endReason === "session-ended" && failure === null && (
          <Callout variant="info" testId="callout-info">
            Your session has ended. Please sign in again.
          </Callout>
        )}
        {failure !== null && (
          <Callout variant="error" testId="callout-error">
            {failure}
          </Callout>
        )}

        <form noValidate onSubmit={handleSubmit}>
          <label className="zg-label" htmlFor="field-email">
            Email
          </label>
          <input
            {...fieldProps("email")}
            ref={emailRef}
            // Focused during commit, not in an effect, so it is never late (ui-spec 6.1).
            autoFocus
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setErrors((prev) => ({ ...prev, email: undefined }));
            }}
          />
          {message("email")}

          <label className="zg-label" htmlFor="field-password">
            Password
          </label>
          <input
            {...fieldProps("password")}
            ref={passwordRef}
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setErrors((prev) => ({ ...prev, password: undefined }));
            }}
          />
          {message("password")}

          <button
            type="submit"
            className="zg-btn zg-btn--primary zg-auth-submit"
            data-testid="btn-sign-in"
            disabled={submitting}
            aria-busy={submitting ? "true" : undefined}
          >
            {submitting ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p className="zg-helper zg-auth-helper">Accounts are created by your administrator.</p>
      </div>
    </main>
  );
}
