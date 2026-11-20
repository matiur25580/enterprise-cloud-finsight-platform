export type ImpactPeriodInput = {
  baselineStartsAt: string;
  baselineEndsAt: string;
  observedStartsAt: string;
  observedEndsAt: string;
};

function parseDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(value + "T00:00:00.000Z");
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? date : null;
}

/** Validate equal, non-overlapping, at-least-seven-day date-only billing windows. */
export function validateImpactPeriods(input: ImpactPeriodInput) {
  const baselineStart = parseDate(input.baselineStartsAt);
  const baselineEnd = parseDate(input.baselineEndsAt);
  const observedStart = parseDate(input.observedStartsAt);
  const observedEnd = parseDate(input.observedEndsAt);
  if (!baselineStart || !baselineEnd || !observedStart || !observedEnd) {
    return { valid: false as const, error: "All dates must be valid YYYY-MM-DD calendar dates." };
  }
  const day = 24 * 60 * 60 * 1000;
  const baselineDays = Math.round((baselineEnd.getTime() - baselineStart.getTime()) / day) + 1;
  const observedDays = Math.round((observedEnd.getTime() - observedStart.getTime()) / day) + 1;
  if (baselineDays < 7 || baselineDays > 90 || observedDays < 7 || observedDays > 90) {
    return { valid: false as const, error: "Each comparison period must be between 7 and 90 days." };
  }
  if (baselineDays !== observedDays) {
    return { valid: false as const, error: "Baseline and observed periods must contain the same number of days." };
  }
  if (baselineEnd.getTime() >= observedStart.getTime()) {
    return { valid: false as const, error: "The observed period must start after the baseline period ends." };
  }
  return { valid: true as const, baselineStart, baselineEnd, observedStart, observedEnd, periodDays: baselineDays };
}

export function calculateRealizedSavings(baselineSpend: number, observedSpend: number) {
  if (!Number.isFinite(baselineSpend) || !Number.isFinite(observedSpend) || baselineSpend < 0 || observedSpend < 0) {
    throw new Error("Spend values must be finite and non-negative.");
  }
  return baselineSpend - observedSpend;
}
