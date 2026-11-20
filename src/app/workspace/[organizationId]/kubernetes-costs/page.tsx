import Link from "next/link";
import { getCostAllocation } from "@/lib/cost-allocation";
import { requireOrganizationPermission } from "@/lib/auth-guards";

function money(value: number, currency: string) {
  try { return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 2 }).format(value); }
  catch { return currency + " " + value.toFixed(2); }
}

export default async function KubernetesCostPage({ params, searchParams }: {
  params: Promise<{ organizationId: string }>;
  searchParams: Promise<{ dimension?: string }>;
}) {
  const { organizationId } = await params;
  const query = await searchParams;
  await requireOrganizationPermission(organizationId, "billing:read");
  const dimensions = ["cluster", "namespace", "workload"] as const;
  const dimension = dimensions.includes(query.dimension as typeof dimensions[number]) ? query.dimension as typeof dimensions[number] : "cluster";
  const data = await getCostAllocation(organizationId, dimension);
  return <main className="analytics-shell">
    <header className="analytics-topbar"><Link className="analytics-brand" href="/workspace">fin<span>sight</span></Link><Link className="analytics-back" href={"/workspace/" + organizationId + "/allocation"}>All cost allocation</Link></header>
    <div className="analytics-content">
      <div className="analytics-heading"><div><p className="analytics-eyebrow">CLOUD NATIVE FINOPS · KUBERNETES</p><h1>Kubernetes cost allocation</h1><p className="analytics-subtitle">Showback by cluster, namespace and workload using Kubernetes billing tags and labels · {data.startDate} to {data.endDate}</p></div></div>
      <nav className="analytics-ranges" aria-label="Kubernetes allocation dimension">
        {dimensions.map((item) => <Link key={item} aria-current={dimension === item ? "page" : undefined} className={dimension === item ? "analytics-range active" : "analytics-range"} href={"/workspace/" + organizationId + "/kubernetes-costs?dimension=" + item}>{item[0].toUpperCase() + item.slice(1)}</Link>)}
      </nav>
      {!data.totalRecords ? <section className="analytics-empty"><h2>No Kubernetes billing records found</h2><p>Import billing exports with cluster, namespace or workload tags. Supported common keys include cluster, k8s_cluster, kubernetes.io/cluster, namespace, kubernetes.io/metadata.name, workload and app.kubernetes.io/name. No demo data is generated.</p></section> : <>
        <section className="analytics-section"><div className="analytics-section-title"><h2>Kubernetes allocation coverage</h2><span>Spend-weighted coverage, isolated by currency</span></div>
          <div className="analytics-kpis">{data.byCurrency.map((item) => <article className="analytics-card" key={item.currency}><span>Tagged spend · {item.currency}</span><strong>{money(item.taggedSpend, item.currency)}</strong><small>{item.coveragePercent.toFixed(1)}% coverage</small></article>)}{data.byCurrency.map((item) => <article className="analytics-card" key={"unallocated-" + item.currency}><span>Unallocated · {item.currency}</span><strong>{money(item.unallocatedSpend, item.currency)}</strong><small>{(100-item.coveragePercent).toFixed(1)}% needs label remediation</small></article>)}</div>
        </section>
        <section className="analytics-section"><div className="analytics-section-title"><h2>Spend by {data.dimensionLabel.toLowerCase()}</h2><span>{data.totalRecords.toLocaleString()} billing records</span></div>
          {data.byCurrency.map((currency) => <article className="analytics-panel" key={currency.currency}><div className="analytics-panel-heading"><div><h2>{currency.currency}</h2><p>Total {money(currency.totalSpend, currency.currency)} · {currency.coveragePercent.toFixed(1)}% tagged</p></div></div>
            {data.groups.filter((item) => item.currency === currency.currency).map((item) => <div className="analytics-breakdown" key={item.allocation}><div><span>{item.allocation}</span><strong>{money(item.spend, item.currency)} · {(currency.totalSpend > 0 ? item.spend/currency.totalSpend*100 : 0).toFixed(1)}%</strong></div><div className="analytics-bar-track"><i style={{width:(currency.totalSpend > 0 ? item.spend/currency.totalSpend*100 : 0).toFixed(2)+"%"}} /></div></div>)}
          </article>)}
        </section>
      </>}
      <section className="analytics-panel"><div className="analytics-panel-heading"><div><h2>Allocation methodology & limitations</h2><p>Transparent, tag-driven Kubernetes showback</p></div></div><p className="analytics-muted">FinSight attributes the imported line-item cost to the first matching supported label key for the selected dimension. It does not yet ingest live Kubernetes metrics, calculate CPU or memory requests, or split shared node costs across pods. Provider billing exports can aggregate several workloads into a single line item; such rows remain unallocated unless the export includes a matching label.</p><p className="analytics-muted">For production-grade chargeback, combine this showback with a cluster cost source such as OpenCost or Kubecost and define an explicit shared-cost policy. Currency totals are never combined.</p></section>
      <footer className="analytics-footer"><span>FinSight · Kubernetes cost showback</span><span>Tenant-scoped · Imported billing data only</span></footer>
    </div>
  </main>;
}
