/** Format UTC ISO string for display in UTC+5 (Asia/Tashkent) */
const TZ = "Asia/Tashkent";

/** YYYY-MM for grouping (Asia/Tashkent), from ticket created_at */
export function getYearMonthKeyUTC5(isoString: string | null | undefined): string {
  if (!isoString) return "";
  const s = isoString.trim();
  const normalized = /Z$|[+-]\d{2}:?\d{2}$/.test(s) ? s : s + "Z";
  const d = new Date(normalized);
  if (isNaN(d.getTime())) return "";
  const str = d.toLocaleString("sv-SE", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
  const datePart = str.replace(/\s.*/, "").slice(0, 10);
  return datePart.slice(0, 7);
}

/** Current calendar month key YYYY-MM in Asia/Tashkent */
export function getCurrentYearMonthKeyUTC5(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  if (!y || !m) return "";
  return `${y}-${m}`;
}

/** e.g. "April 2026" / "апрель 2026 г." for a YYYY-MM key */
export function formatMonthHeadingUTC5(yearMonth: string, locale: "en" | "ru"): string {
  const [y, mo] = yearMonth.split("-").map(Number);
  if (!y || !mo) return yearMonth;
  const d = new Date(Date.UTC(y, mo - 1, 15, 12, 0, 0));
  return d.toLocaleDateString(locale === "ru" ? "ru-RU" : "en-US", {
    month: "long",
    year: "numeric",
    timeZone: TZ,
  });
}

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
