export type AnalyticsRange = "7d" | "30d" | "90d" | "month";

const DAY_MS = 24 * 60 * 60 * 1000;

export function getAnalyticsWindow(now: Date, range: AnalyticsRange) {
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  let start: Date;
  if (range === "month") {
    start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1));
  } else {
    const days = range === "7d" ? 7 : range === "90d" ? 90 : 30;
    start = new Date(end.getTime() - (days - 1) * DAY_MS);
  }
  const durationDays = Math.round((end.getTime() - start.getTime()) / DAY_MS) + 1;
  const previousEnd = new Date(start.getTime() - DAY_MS);
  const previousStart = new Date(previousEnd.getTime() - (durationDays - 1) * DAY_MS);
  return { start, end, previousStart, previousEnd, durationDays };
}

export function projectMonthEnd(monthToDateSpend: number, elapsedDays: number, daysInMonth: number) {
  if (elapsedDays <= 0 || daysInMonth <= 0) return 0;
  return (monthToDateSpend / elapsedDays) * daysInMonth;
}
