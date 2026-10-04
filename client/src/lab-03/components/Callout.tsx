import type { ReactNode } from "react";

// The shared callout (docs/lab-03/ui-spec.md section 5.1). Always an icon plus
// text, never colour alone, and never a status code or error code (AC-68).
//
// #38 uses the error and info variants. The forbidden state is its own
// component (Forbidden.tsx) because it carries a heading and a link.

export type CalloutVariant = "error" | "info";

const ICON: Record<CalloutVariant, string> = { error: "!", info: "i" };

export function Callout({
  variant,
  testId,
  children,
}: {
  variant: CalloutVariant;
  testId: string;
  children: ReactNode;
}) {
  return (
    <div
      className={`zg-callout zg-callout--${variant}`}
      data-testid={testId}
      // Errors interrupt; information is announced politely (ui-spec 10).
      role={variant === "error" ? "alert" : "status"}
    >
      <span className="zg-callout-icon" aria-hidden="true">
        {ICON[variant]}
      </span>
      <span>{children}</span>
    </div>
  );
}
