import "@testing-library/jest-dom";

// jsdom implements no matchMedia. My Tickets uses it to choose between the
// desktop table and the mobile cards, so without a stub every suite that
// renders that screen would throw. The default reports "no match", which is
// the desktop layout; tests that need the mobile layout override it.
if (typeof window !== "undefined" && typeof window.matchMedia !== "function") {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}
