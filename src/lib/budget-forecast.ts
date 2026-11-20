export type BudgetForecastInput = {
  budgetAmount: number;
  actualSpend: number;
  elapsedDays: number;
  totalDays: number;
  currency: string;
};

export type BudgetForecast = {
  plannedSpendToDate: number;
  actualSpend: number;
  varianceToPlan: number;
  forecastAtPeriodEnd: number;
  forecastVariance: number;
  forecastUtilizationPercent: number;
  remainingBudget: number;
  daysElapsed: number;
  daysRemaining: number;
  totalDays: number;
  currency: string;
  pace: "UNDER_PLAN" | "OVER_PLAN" | "ON_PLAN";
};

/** Straight-line run-rate forecast. It is an estimate, not a seasonality-aware prediction. */
export function calculateBudgetForecast(input: BudgetForecastInput): BudgetForecast {
  const safeAmount = Number.isFinite(input.budgetAmount) && input.budgetAmount > 0 ? input.budgetAmount : 0;
  const safeSpend = Number.isFinite(input.actualSpend) ? input.actualSpend : 0;
  const totalDays = Math.max(1, Math.floor(input.totalDays));
  const daysElapsed = Math.min(totalDays, Math.max(0, Math.floor(input.elapsedDays)));
  const daysRemaining = totalDays - daysElapsed;
  const plannedSpendToDate = safeAmount * daysElapsed / totalDays;
  const forecastAtPeriodEnd = daysElapsed > 0 ? safeSpend / daysElapsed * totalDays : 0;
  const varianceToPlan = safeSpend - plannedSpendToDate;
  const forecastVariance = forecastAtPeriodEnd - safeAmount;
  const forecastUtilizationPercent = safeAmount > 0 ? forecastAtPeriodEnd / safeAmount * 100 : 0;
  const tolerance = Math.max(0.01, plannedSpendToDate * 0.01);
  return {
    plannedSpendToDate, actualSpend: safeSpend, varianceToPlan, forecastAtPeriodEnd,
    forecastVariance, forecastUtilizationPercent, remainingBudget: safeAmount - safeSpend,
    daysElapsed, daysRemaining, totalDays, currency: input.currency,
    pace: varianceToPlan > tolerance ? "OVER_PLAN" : varianceToPlan < -tolerance ? "UNDER_PLAN" : "ON_PLAN"
  };
}
