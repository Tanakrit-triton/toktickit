import { useEffect, useState } from "react";

/**
 * Subscribes to a media query from JavaScript.
 *
 * My Tickets renders a table on desktop and cards on mobile (ui-spec 5.4).
 * That is a difference in DOM, not only in styling: AC-40 requires cards
 * "rather than a table", and a table hidden by CSS is still a table in the
 * accessibility tree. Driving the switch from JS also makes it assertable in
 * jsdom, which applies no media queries at all.
 *
 * Falls back to false where matchMedia is unavailable, so a missing
 * implementation renders the desktop layout rather than crashing.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const list = window.matchMedia(query);
    const onChange = (event: MediaQueryListEvent) => setMatches(event.matches);
    setMatches(list.matches);
    list.addEventListener("change", onChange);
    return () => list.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}

/** Bootstrap's md breakpoint, reused rather than replaced (ui-spec 7). */
export const MOBILE_QUERY = "(max-width: 767.98px)";
