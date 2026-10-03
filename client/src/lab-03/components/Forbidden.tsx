import { Link } from "react-router-dom";

// The forbidden state (docs/lab-03/ui-spec.md sections 5.1 and 10): shown in
// place of a screen the role may not open, before any protected request.

export function Forbidden({ landingPath }: { landingPath: string }) {
  return (
    <section className="zg-callout zg-callout--forbidden" data-testid="state-forbidden">
      <span className="zg-callout-icon" aria-hidden="true">
        ⊘
      </span>
      <div>
        <h1 className="zg-callout-title">Access denied</h1>
        <p className="zg-callout-text">You do not have access to this page.</p>
        <Link to={landingPath}>Go to your home page</Link>
      </div>
    </section>
  );
}
