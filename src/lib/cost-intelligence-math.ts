export type DailyServiceSpend = { date: string; service: string; currency: string; spend: number };

export type CostAnomaly = {
  date: string;
  service: string;
  currency: string;
  spend: number;
  baselineAverage: number;
  baselineStandardDeviation: number;
  increasePercent: number;
  severity: "HIGH" | "MEDIUM";
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** Detect a daily service spike against up to 14 preceding calendar days. */
export function detectCostAnomalies(rows: DailyServiceSpend[]): CostAnomaly[] {
  const groups = new Map<string, DailyServiceSpend[]>();
  for (const row of rows) {
    const key = row.service + "|" + row.currency;
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }

  const anomalies: CostAnomaly[] = [];
  for (const observations of groups.values()) {
    const byDate = new Map(observations.map((row) => [row.date, row.spend]));
    const dates = observations.map((row) => row.date).sort();
    for (const date of dates) {
      const current = byDate.get(date) ?? 0;
      if (current <= 0) continue;
      const target = new Date(date + "T00:00:00.000Z").getTime();
      const baseline: number[] = [];
      for (let offset = 1; offset <= 14; offset += 1) {
        const priorDate = new Date(target - offset * DAY_MS).toISOString().slice(0, 10);
        const value = byDate.get(priorDate);
        if (value !== undefined) baseline.push(value);
      }
      if (baseline.length < 7) continue;
      const average = baseline.reduce((sum, value) => sum + value, 0) / baseline.length;
      if (average <= 0) continue;
      const variance = baseline.reduce((sum, value) => sum + (value - average) ** 2, 0) / baseline.length;
      const standardDeviation = Math.sqrt(variance);
      const threshold = Math.max(average * 2, average + 3 * standardDeviation);
      if (current <= threshold) continue;
      const increasePercent = ((current - average) / average) * 100;
      const source = observations[0];
      anomalies.push({
        date, service: source.service, currency: source.currency, spend: current,
        baselineAverage: average, baselineStandardDeviation: standardDeviation,
        increasePercent, severity: current >= average * 3 ? "HIGH" : "MEDIUM"
      });
    }
  }
  return anomalies.sort((a, b) => b.increasePercent - a.increasePercent);
}

export function getBudgetThresholdAlerts(input: {
  name: string; currency: string; budget: number; spent: number; thresholds: number[];
}[]) {
  return input.flatMap((item) => {
    if (item.budget <= 0) return [];
    const utilization = (item.spent / item.budget) * 100;
    const crossed = [...new Set(item.thresholds)].filter((threshold) =>
      Number.isInteger(threshold) && threshold > 0 && threshold <= 100 && utilization >= threshold
    ).sort((a, b) => b - a);
    if (!crossed.length) return [];
    return [{
      name: item.name, currency: item.currency, budget: item.budget, spent: item.spent,
      utilization, highestThreshold: crossed[0], exceeded: utilization >= 100
    }];
  });
}

/** A transparent scenario estimate, not a guaranteed or realized saving. */
export function estimateOptimizationScenario(monthlySpend: number, reductionRate = 0.05) {
  if (!Number.isFinite(monthlySpend) || monthlySpend <= 0) return 0;
  return monthlySpend * reductionRate;
}
