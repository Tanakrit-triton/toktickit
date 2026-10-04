import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import * as authApi from "../auth-api.js";
import { PasswordChangeError } from "../auth-api.js";
import { useAuth } from "../AuthContext.js";
import { Callout } from "../components/Callout.js";
import { landingFor } from "../routes.js";

// Change Password (docs/lab-03/ui-spec.md section 6.2). Forced mode while
// mustChangePassword is true, voluntary otherwise. The client checks mirror
// BR-11 so obvious mistakes cost no request; the server stays authoritative.

type Field = "currentPassword" | "newPassword" | "confirmPassword";

const FIELDS: { key: Field; id: string; label: string }[] = [
  { key: "currentPassword", id: "current-password", label: "Current password" },
  { key: "newPassword", id: "new-password", label: "New password" },
  { key: "confirmPassword", id: "confirm-password", label: "Confirm new password" },
];

const MIN = 12;
const MAX = 128;

/** Code points, not UTF-16 units, so an emoji counts once (BR-11). */
const codePoints = (value: string) => [...value].length;

function validate(values: Record<Field, string>): Partial<Record<Field, string>> {
  const errors: Partial<Record<Field, string>> = {};
  if (values.currentPassword === "") errors.currentPassword = "Enter your current password.";

  const length = codePoints(values.newPassword);
  if (values.newPassword === "") errors.newPassword = "Enter a new password.";
  else if (length < MIN || length > MAX) errors.newPassword = "Password must be 12–128 characters.";
  else if (values.newPassword === values.currentPassword)
    errors.newPassword = "New password must be different from the current password.";

  if (values.confirmPassword === "") errors.confirmPassword = "Confirm the new password.";
  else if (values.confirmPassword !== values.newPassword) errors.confirmPassword = "Passwords do not match.";
  return errors;
}

export function ChangePassword() {
  const { user, passwordChanged } = useAuth();
  const navigate = useNavigate();
  const forced = user!.mustChangePassword;

  const [values, setValues] = useState<Record<Field, string>>({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [failed, setFailed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  function focusFirst(found: Partial<Record<Field, string>>) {
    const first = FIELDS.find((f) => found[f.key]);
    if (first) document.getElementById(`field-${first.id}`)?.focus();
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;

    const found = validate(values);
    setErrors(found);
    setFailed(false);
    if (Object.keys(found).length > 0) {
      focusFirst(found);
      return;
    }

    setSubmitting(true);
    try {
      const session = await authApi.changePassword(values);
      const landing = landingFor(session.user.role);
      passwordChanged(session, landing);
      navigate(landing, { replace: true });
    } catch (error) {
      if (error instanceof PasswordChangeError) {
        const serverErrors = error.details as Partial<Record<Field, string>>;
        setErrors(serverErrors);
        setSubmitting(false);
        focusFirst(serverErrors);
        return;
      }
      setFailed(true);
      setSubmitting(false);
    }
  }

  return (
    <div className="zg-auth-screen" data-testid="change-password-screen">
      <div className="zg-card zg-auth-card">
        <h1 className="zg-title">{forced ? "Choose a new password" : "Change password"}</h1>
        {forced && (
          <p className="zg-auth-explanation">
            Your password was set by an administrator. Choose a new one to continue.
          </p>
        )}

        {failed && (
          <Callout variant="error" testId="callout-error">
            Could not change the password. Try again.
          </Callout>
        )}

        <form noValidate onSubmit={handleSubmit}>
          {FIELDS.map(({ key, id, label }) => {
            const describedBy = [
              id === "new-password" ? "helper-new-password" : null,
              errors[key] ? `error-${id}` : null,
            ]
              .filter(Boolean)
              .join(" ");
            return (
              <div key={key} className="zg-auth-field">
                <label className="zg-label" htmlFor={`field-${id}`}>
                  {label}
                  <span className="zg-required-marker" aria-hidden="true">*</span>
                </label>
                <input
                  id={`field-${id}`}
                  data-testid={`field-${id}`}
                  className="zg-field"
                  type="password"
                  autoComplete={key === "currentPassword" ? "current-password" : "new-password"}
                  required
                  disabled={submitting}
                  value={values[key]}
                  aria-invalid={errors[key] ? "true" : undefined}
                  aria-describedby={describedBy === "" ? undefined : describedBy}
                  onChange={(e) => {
                    const value = e.target.value;
                    setValues((prev) => ({ ...prev, [key]: value }));
                    setErrors((prev) => ({ ...prev, [key]: undefined }));
                  }}
                />
                {id === "new-password" && (
                  <span className="zg-helper" id="helper-new-password">
                    12–128 characters. Must differ from your current password.
                  </span>
                )}
                {errors[key] && (
                  <span className="zg-message-error" id={`error-${id}`} data-testid={`error-${id}`}>
                    {errors[key]}
                  </span>
                )}
              </div>
            );
          })}

          <div className="zg-actions">
            {!forced && (
              <button
                type="button"
                className="zg-btn zg-btn--secondary"
                data-testid="btn-cancel-password"
                disabled={submitting}
                onClick={() => navigate(-1)}
              >
                Cancel
              </button>
            )}
            <button
              type="submit"
              className="zg-btn zg-btn--primary"
              data-testid="btn-save-password"
              disabled={submitting}
              aria-busy={submitting ? "true" : undefined}
            >
              {submitting ? "Saving…" : "Save password"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
