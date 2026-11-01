// Bangkok time for Lab 4 screens (docs/lab-04/ui-spec.md sections 4.2 and 6).
// The API speaks ISO 8601 UTC; people read and enter Bangkok time.
// Bangkok is UTC+7 all year, with no daylight saving, so the offset is fixed.

const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;

const DISPLAY = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: "Asia/Bangkok",
});

/** "29 Oct 2026, 10:15". */
export const formatBangkok = (iso: string) => DISPLAY.format(new Date(iso));

/** A `datetime-local` value ("2026-10-29T10:15") for an instant. */
export function toBangkokInput(instant: string | Date): string {
  return new Date(new Date(instant).getTime() + BANGKOK_OFFSET_MS).toISOString().slice(0, 16);
}

/**
 * The ISO instant for a `datetime-local` value, or the value unchanged when it
 * is not a complete date and time, so the server reports it under actionAt.
 */
export function fromBangkokInput(local: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)) return local;
  return new Date(`${local}:00+07:00`).toISOString();
}
