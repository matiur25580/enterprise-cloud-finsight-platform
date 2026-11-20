import Link from "next/link";
import { getCostAllocation } from "@/lib/cost-allocation";
import { requireOrganizationPermission } from "@/lib/auth-guards";

const dimensions = [
  { key: "team", label: "Team", standard: "team" },
  { key: "department", label: "Department", standard: "department" },
  { key: "project", label: "Project", standard: "project" },
  { key: "environment", label: "Environment", standard: "environment" },
  { key: "costCenter", label: "Cost center", standard: "costCenter or cost_center" }
] as const;

function money(value: number, currency: string) {
  try { return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 2 }).format(value); }
  catch { return currency + " " + value.toFixed(2); }
}

export default async function TagGovernancePage({ params }: { params: Promise<{ organizationId: string }> }) {
  const { organizationId } = await params;
  await requireOrganizationPermission(organizationId, "billing:read");
  const reports = await Promise.all(dimensions.map(async (dimension) => ({
    ...dimension,
    data: await getCostAllocation(organizationId, dimension.key)
  })));
  const hasRecords = reports.some((report) => report.data.totalRecords > 0);
  const currencies = [...new Set(reports.flatMap((report) => report.data.byCurrency.map((item) => item.currency)))].sort();

  return <main className="analytics-shell">
    <header className="analytics-topbar"><Link className="analytics-brand" href="/workspace">fin<span>sight</span></Link><Link className="analytics-back" href={"/workspace/" + organizationId}>Cost dashboard</Link></header>
    <div className="analytics-content">
      <div className="analytics-heading"><div><p className="analytics-eyebrow">FINOPS GOVERNANCE · TAG QUALITY</p><h1>Tag governance scorecard</h1><p className="analytics-subtitle">Spend-weighted allocation coverage across five business dimensions · 30 calendar days</p></div><Link className="analytics-back" href={"/workspace/" + organizationId + "/allocation"}>Explore cost allocation</Link></div>
      <p className="analytics-muted">Coverage is calculated independently for each currency and dimension from imported billing line items. A record is covered when its dimension tag has a non-empty value. This scorecard measures tag presence, not whether tag values are approved, correctly owned, or policy-compliant. No cross-currency totals or synthetic scores are produced.</p>
      {!hasRecords ? <section className="analytics-empty"><h2>No billing data to score</h2><p>Import billing records with resource tags to establish a governance baseline. FinSight will not generate sample coverage figures.</p><Link className="analytics-back" href={"/workspace/" + organizationId + "/billing"}>Import billing data</Link></section> : <>
        <section className="analytics-section"><div className="analytics-section-title"><h2>Governance coverage by dimension</h2><span>Coverage targets are operational guidance, not compliance certification</span></div>
          <div className="analytics-grid">
            {reports.map((report) => <article className="analytics-panel" key={report.key}>
              <div className="analytics-panel-heading"><div><h2>{report.label}</h2><p>Expected tag: {report.standard}</p></div></div>
              {report.data.byCurrency.length ? report.data.byCurrency.map((item) => <div className="analytics-breakdown" key={item.currency}>
                <div><span>{item.currency} · {item.coveragePercent.toFixed(1)}% covered</span><strong>{money(item.unallocatedSpend, item.currency)} unallocated</strong></div>
                <div className="analytics-bar-track"><i style={{ width: item.coveragePercent.toFixed(2) + "%" }} /></div>
                <p className="analytics-muted">{money(item.taggedSpend, item.currency)} tagged of {money(item.totalSpend, item.currency)} · {item.records.toLocaleString()} records</p>
              </div>) : <p className="analytics-muted">No spend records for this dimension in the reporting window.</p>}
              <Link className="analytics-back" href={"/workspace/" + organizationId + "/allocation?dimension=" + report.key}>Inspect {report.label.toLowerCase()} allocation</Link>
            </article>)}
          </div>
        </section>
        <section className="analytics-section"><div className="analytics-section-title"><h2>Remediation queue</h2><span>Largest unallocated exposure first · currency-isolated</span></div>
          {currencies.map((currency) => {
            const gaps = reports.map((report) => {
              const item = report.data.byCurrency.find((entry) => entry.currency === currency);
              return item ? { label: report.label, key: report.key, spend: item.unallocatedSpend, coverage: item.coveragePercent } : null;
            }).filter((item): item is { label: string; key: typeof dimensions[number]["key"]; spend: number; coverage: number } => item !== null && item.spend > 0).sort((a, b) => b.spend - a.spend);
            return gaps.length ? <article className="analytics-panel" key={currency}><div className="analytics-panel-heading"><div><h2>{currency}</h2><p>Tagging gaps ranked by unallocated spend</p></div></div>
              {gaps.map((gap) => <div className="analytics-list-row" key={gap.key}><div><strong>{gap.label}</strong><span>{gap.coverage.toFixed(1)}% coverage · add or normalize the {gap.label.toLowerCase()} tag</span></div><div><strong>{money(gap.spend, currency)}</strong><span><Link href={"/workspace/" + organizationId + "/allocation?dimension=" + gap.key}>Review</Link></span></div></div>)}
            </article> : null;
          })}
        </section>
      </>}
      <section className="analytics-panel"><div className="analytics-panel-heading"><div><h2>Recommended tagging standard</h2><p>Consistent keys across AWS tags, Azure resource tags and GCP labels</p></div></div>
        <div className="analytics-list-row"><strong>team</strong><span>Accountable engineering or platform team</span></div>
        <div className="analytics-list-row"><strong>department</strong><span>Finance or business ownership boundary</span></div>
        <div className="analytics-list-row"><strong>project</strong><span>Product, service or initiative identifier</span></div>
        <div className="analytics-list-row"><strong>environment</strong><span>Production, staging, development or sandbox</span></div>
        <div className="analytics-list-row"><strong>costCenter</strong><span>Finance-approved cost center identifier</span></div>
        <p className="analytics-muted">Apply allowed-value policies and enforcement in cloud provisioning pipelines. The current scorecard only evaluates whether supported tag keys are populated; it does not validate values against an external CMDB, finance system or policy registry.</p>
      </section>
      <footer className="analytics-footer"><span>FinSight · Tag governance</span><span>Tenant-scoped · Imported billing actuals · 30-day window</span></footer>
    </div>
  </main>;
}
