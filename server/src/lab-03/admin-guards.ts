import type { ErrorCode } from "../lab-02/errors.js";
import type { Role } from "./require-session.js";

// The BR-63 safety rules for PATCH /api/v1/admin/users/{userId}
// (api-spec.md section 7.3, checks 5 to 8, DEC-10).
//
// Pure, so UT-12 can drive the order with plain counts. The route reads the
// counts inside one transaction that has locked the active Administrator rows,
// so they cannot change between this check and the update.
//
// Last Administrator is checked first: a serial request can only empty the
// Administrator set when the sole Administrator targets their own account,
// and LAST_ADMINISTRATOR is the more informative refusal for that case.

export type UserChangeInput = {
  actorId: string;
  target: { id: string; role: Role; isActive: boolean };
  /** Only the fields the request changes. Name and email never affect these rules. */
  change: { role?: Role; isActive?: boolean };
  /** Active Administrators before the change, the target included if they are one. */
  activeAdministrators: number;
  /** Tickets the target owns in NEW, OPEN, IN_PROGRESS, WAITING_FOR_REQUESTER, or REOPENED. */
  openTickets: number;
};

export type UserChangeRefusal = { code: ErrorCode; message: string };

export function checkUserChange(input: UserChangeInput): UserChangeRefusal | null {
  const { actorId, target, change } = input;
  const nextRole = change.role ?? target.role;
  const nextActive = change.isActive ?? target.isActive;

  const isActiveAdmin = (role: Role, active: boolean) => active && role === "ADMINISTRATOR";
  const remaining =
    input.activeAdministrators -
    (isActiveAdmin(target.role, target.isActive) ? 1 : 0) +
    (isActiveAdmin(nextRole, nextActive) ? 1 : 0);
  if (remaining < 1) {
    return { code: "LAST_ADMINISTRATOR", message: "At least one active Administrator must remain." };
  }

  const deactivating = target.isActive && !nextActive;
  const self = target.id === actorId;
  if (self && deactivating) {
    return { code: "CANNOT_DEACTIVATE_SELF", message: "You cannot deactivate your own account." };
  }
  if (self && nextRole !== target.role) {
    return { code: "CANNOT_CHANGE_OWN_ROLE", message: "You cannot change your own role." };
  }

  const demotingToRequester = target.role !== "REQUESTER" && nextRole === "REQUESTER";
  if ((deactivating || demotingToRequester) && input.openTickets > 0) {
    return {
      code: "USER_HAS_OPEN_TICKETS",
      message: `This user owns ${input.openTickets} open tickets. Reassign them first.`,
    };
  }

  return null;
}
