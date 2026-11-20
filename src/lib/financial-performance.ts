export type FinancialPerformance = {
  revenue: number;
  cloudSpend: number;
  cloudContribution: number;
  cloudCostToRevenuePercent: number | null;
};

export function calculateFinancialPerformance(revenue: number, cloudSpend: number): FinancialPerformance {
  if (!Number.isFinite(revenue) || !Number.isFinite(cloudSpend) || revenue < 0 || cloudSpend < 0) {
    throw new Error("Revenue and cloud spend must be finite non-negative values.");
  }
  return {
    revenue,
    cloudSpend,
    cloudContribution: revenue - cloudSpend,
    cloudCostToRevenuePercent: revenue === 0 ? null : (cloudSpend / revenue) * 100
  };
}
