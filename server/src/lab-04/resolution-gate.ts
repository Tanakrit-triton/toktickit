import { isOpenActionStatus, type ActionStatus } from "./action-rules.js";

// The resolution gate (docs/lab-04/specification.md section 5.3, BR-20 to
// BR-23). The status route counts blockers inside the same transaction as the
// conditional status update (api-spec.md section 3.3); staff detail reports
// the same counts as resolutionBlockers (section 3.1).

export interface ResolutionBlockers {
  openActions: number;
  outstandingFollowUps: number;
}

export function countResolutionBlockers(
  actions: readonly { status: ActionStatus; followUpRequired: boolean }[],
): ResolutionBlockers {
  let openActions = 0;
  let outstandingFollowUps = 0;
  for (const action of actions) {
    if (isOpenActionStatus(action.status)) openActions += 1;
    if (action.followUpRequired && action.status !== "CANCELLED") outstandingFollowUps += 1;
  }
  return { openActions, outstandingFollowUps };
}

export function isResolutionBlocked(blockers: ResolutionBlockers): boolean {
  return blockers.openActions > 0 || blockers.outstandingFollowUps > 0;
}

/** The RESOLUTION_BLOCKED message. Both counts are always stated. */
export function resolutionBlockedMessage(blockers: ResolutionBlockers): string {
  return (
    `This ticket cannot be resolved yet: ${blockers.openActions} action(s) still open ` +
    `and ${blockers.outstandingFollowUps} follow-up(s) outstanding.`
  );
}
