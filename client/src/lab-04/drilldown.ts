import { useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";

// Dashboard drill-down parameters read by My Tickets and the Ticket Queue
// (docs/lab-04/ui-spec.md section 3.5, api-spec.md section 4).
//
// The dashboards link to these screens with the filter in the URL. The
// screens read it on arrival and whenever it changes, and send `statusGroup`
// to the server. An unknown value is ignored rather than sent, so a mistyped
// link shows the unfiltered list instead of a 400.

export const STATUS_GROUPS = ["ACTIVE", "DONE"] as const;
export type StatusGroup = (typeof STATUS_GROUPS)[number];

export const TICKET_STATUSES = [
  "NEW",
  "OPEN",
  "IN_PROGRESS",
  "WAITING_FOR_REQUESTER",
  "RESOLVED",
  "CLOSED",
  "REOPENED",
  "CANCELLED",
] as const;

const GROUP_LABEL: Record<StatusGroup, string> = {
  ACTIVE: "Open tickets",
  DONE: "Resolved tickets",
};

export function parseStatusGroup(value: string | null): StatusGroup | "" {
  return value !== null && (STATUS_GROUPS as readonly string[]).includes(value) ? (value as StatusGroup) : "";
}

/** One of `allowed`, or "" when the parameter is absent or unknown. */
export function parseOneOf(value: string | null, allowed: readonly string[]): string {
  return value !== null && allowed.includes(value) ? value : "";
}

/**
 * `prev` with `patch` applied and paging back on page 1, or `prev` itself when
 * nothing would change, so a URL change the screen already applied (for
 * example a status choice that also dropped the group) does not refetch.
 */
export function withPatch<T extends { page: number }>(prev: T, patch: Partial<T>): T {
  const unchanged = prev.page === 1 && (Object.keys(patch) as (keyof T)[]).every((k) => prev[k] === patch[k]);
  return unchanged ? prev : { ...prev, ...patch, page: 1 };
}

/** The chip text after "Showing: ". */
export function groupLabel(group: StatusGroup): string {
  return GROUP_LABEL[group];
}

/**
 * Calls `onChange` with the names of the parameters in `keys` whose values
 * changed since the last render, for example after the chip removes one or a
 * navigation item opens the same screen without a filter. Parameters that did
 * not change are not reported, so a control the user set by hand is kept.
 * The first render reports nothing: screens read their initial state directly.
 */
export function useSearchParamChanges(keys: readonly string[], onChange: (changed: Set<string>, params: URLSearchParams) => void) {
  const [params] = useSearchParams();
  const previous = useRef(params);
  const callback = useRef(onChange);
  callback.current = onChange;

  useEffect(() => {
    const before = previous.current;
    previous.current = params;
    if (before === params) return;
    const changed = new Set(keys.filter((k) => before.get(k) !== params.get(k)));
    if (changed.size > 0) callback.current(changed, params);
    // `keys` is a module constant at every call site, so only `params` matters.
  }, [params]);
}
