// Bangkok time for Lab 4 screens (docs/lab-04/ui-spec.md sections 4.2 and 6).
// The API speaks ISO 8601 UTC; people read and enter Bangkok time.
// Bangkok is UTC+7 all year, with no daylight saving, so the offset is fixed.

const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;

// Numeric parts only: month names come from the table below, because en-GB
// abbreviations differ between ICU versions (current ones write "Sept").
const PARTS = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "numeric",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: "Asia/Bangkok",
});

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "29 Oct 2026, 10:15". */
export function formatBangkok(iso: string): string {
  const part = Object.fromEntries(PARTS.formatToParts(new Date(iso)).map((p) => [p.type, p.value]));
  // Number() drops the leading zero en-GB gives the day when a time is included,
  // so the date reads "1 Sep 2026" like the dashboards' window line (ui-spec 3.1).
  return `${Number(part.day)} ${MONTHS[Number(part.month) - 1]} ${part.year}, ${part.hour}:${part.minute}`;
}

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
