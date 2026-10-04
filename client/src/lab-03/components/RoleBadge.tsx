import type { Role } from "../auth-api.js";

// Role badge (docs/lab-03/ui-spec.md section 7.3). The value is carried by
// text; colour only reinforces it (AC-65).

const LABEL: Record<Role, string> = {
  REQUESTER: "Requester",
  IT_STAFF: "IT Staff",
  ADMINISTRATOR: "Administrator",
};

const SLUG: Record<Role, string> = {
  REQUESTER: "requester",
  IT_STAFF: "it-staff",
  ADMINISTRATOR: "administrator",
};

export function RoleBadge({ role }: { role: Role }) {
  return (
    <span className={`zg-badge zg-badge--role-${SLUG[role]}`} data-testid="badge-role" data-role={role}>
      {LABEL[role]}
    </span>
  );
}
