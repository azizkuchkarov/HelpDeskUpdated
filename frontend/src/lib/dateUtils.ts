/** Format UTC ISO string for display in UTC+5 (Asia/Tashkent) */
const TZ = "Asia/Tashkent";

export function formatDateUTC5(isoString: string | null | undefined): string {
  if (!isoString) return "—";
  const s = isoString.trim();
  const normalized = /Z$|[+-]\d{2}:?\d{2}$/.test(s) ? s : s + "Z";
  const d = new Date(normalized);
  if (isNaN(d.getTime())) return isoString.slice(0, 16).replace("T", " ");
  return d
    .toLocaleString("sv-SE", { timeZone: TZ, hour12: false })
    .slice(0, 16)
    .replace("T", " ");
}
