import Link from "next/link";
import { getCostAllocation, ALLOCATION_DIMENSIONS, type AllocationDimension } from "@/lib/cost-allocation";
import { requireOrganizationPermission } from "@/lib/auth-guards";

function money(value: number, currency: string) {
  try { return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 2 }).format(value); }
  catch { return currency + " " + value.toFixed(2); }
}

export default async function CostAllocationPage({ params, searchParams }: {
  params: Promise<{ organizationId: string }>;
  searchParams: Promise<{ dimension?: string }>;
}) {
  const { organizationId } = await params;
  const query = await searchParams;
  await requireOrganizationPermission(organizationId, "billing:read");
  const dimensions = Object.keys(ALLOCATION_DIMENSIONS) as AllocationDimension[];
  const dimension = dimensions.includes(query.dimension as AllocationDimension) ? query.dimension as AllocationDimension : "team";
  const data = await getCostAllocation(organizationId, dimension);
  return <main className="analytics-shell">
    <header className="analytics-topbar"><Link className="analytics-brand" href="/workspace">fin<span>sight</span></Link><Link className="analytics-back" href={"/workspace/" + organizationId}>Cost dashboard</Link></header>
    <div className="analytics-content">
      <div className="analytics-heading"><div><p className="analytics-eyebrow">FINOPS GOVERNANCE · SHOWBACK & ALLOCATION</p><h1>Cloud cost allocation</h1><p className="analytics-subtitle">Attribute cloud spend to the teams, departments and projects responsible for consumption · {data.startDate} to {data.endDate}</p></div></div>
      <p><Link className="analytics-back" href={"/workspace/" + organizationId + "/kubernetes-costs"}>Kubernetes cost allocation →</Link></p><nav className="analytics-ranges" aria-label="Allocation dimension">
        {dimensions.map((item) => <Link key={item} aria-current={dimension === item ? "page" : undefined} className={dimension === item ? "analytics-range active" : "analytics-range"} href={"/workspace/" + organizationId + "/allocation?dimension=" + item}>{ALLOCATION_DIMENSIONS[item].label}</Link>)}
      </nav>
      {!data.totalRecords ? <section className="analytics-empty"><h2>No billing data in this period</h2><p>Import provider billing exports containing resource tags to begin allocating cloud spend. FinSight does not generate sample allocation figures.</p></section> : <>
        <section className="analytics-section"><div className="analytics-section-title"><h2>Allocation quality</h2><span>Tag coverage is spend-weighted and calculated separately per currency</span></div>
          <div className="analytics-kpis">{data.byCurrency.map((item) => <article className="analytics-card" key={item.currency}><span>Allocated spend · {item.currency}</span><strong>{money(item.taggedSpend, item.currency)}</strong><small>{item.coveragePercent.toFixed(1)}% tagged coverage</small></article>)}{data.byCurrency.map((item) => <article className="analytics-card" key={"unallocated-" + item.currency}><span>Unallocated spend · {item.currency}</span><strong>{money(item.unallocatedSpend, item.currency)}</strong><small>{(100 - item.coveragePercent).toFixed(1)}% requires tag remediation</small></article>)}</div>
        </section>
        <section className="analytics-section"><div className="analytics-section-title"><h2>Spend by {data.dimensionLabel.toLowerCase()}</h2><span>{data.totalRecords.toLocaleString()} cost records · last 30 calendar days</span></div>
          {data.byCurrency.map((currency) => <article className="analytics-panel" key={currency.currency}><div className="analytics-panel-heading"><div><h2>{currency.currency}</h2><p>Total spend {money(currency.totalSpend, currency.currency)} · {currency.coveragePercent.toFixed(1)}% allocated</p></div></div>
            {data.groups.filter((item) => item.currency === currency.currency).map((item) => <div className="analytics-breakdown" key={item.allocation}><div><span>{item.allocation}</span><strong>{money(item.spend, item.currency)} · {currency.totalSpend > 0 ? (item.spend / currency.totalSpend * 100).toFixed(1) : "0.0"}%</strong></div><div className="analytics-bar-track"><i style={{ width: (currency.totalSpend > 0 ? item.spend / currency.totalSpend * 100 : 0).toFixed(2) + "%" }} /></div></div>)}
          </article>)}
        </section>
      </>}
      <section className="analytics-panel"><div className="analytics-panel-heading"><div><h2>Enterprise allocation guidance</h2><p>Improve billing tag hygiene to increase showback accuracy</p></div></div><p className="analytics-muted">Recommended tag standards: team, department, project, environment and costCenter. Apply consistent values across AWS resource tags, Azure resource tags and GCP labels. Missing, blank or whitespace-only values are grouped as Unallocated. Tag matching is case-tolerant for common key conventions; values remain case-sensitive.</p><p className="analytics-muted">This view is a showback allocation based on provider-reported tags, not an invoice or chargeback ledger. Shared infrastructure, credits, taxes and amortized commitments may require explicit allocation policies before financial chargeback.</p></section>
      <footer className="analytics-footer"><span>FinSight · Currency-safe cloud cost allocation</span><span>Tenant-scoped · No cross-currency totals</span></footer>
    </div>
  </main>;
}
