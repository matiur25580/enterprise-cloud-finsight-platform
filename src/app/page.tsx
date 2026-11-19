import {
  ArrowDownRight,
  ArrowUpRight,
  Bell,
  ChevronDown,
  CircleHelp,
  Cloud,
  Download,
  Gauge,
  LayoutDashboard,
  Lightbulb,
  Search,
  Settings2,
  ShieldCheck,
  Wallet
} from "lucide-react";

const spendByService = [
  { name: "Compute", amount: "$18,420", share: "42%", width: "42%", tone: "violet" },
  { name: "Database", amount: "$10,960", share: "25%", width: "25%", tone: "blue" },
  { name: "Storage", amount: "$7,450", share: "17%", width: "17%", tone: "teal" },
  { name: "Networking", amount: "$4,120", share: "9%", width: "9%", tone: "amber" },
  { name: "Other", amount: "$3,180", share: "7%", width: "7%", tone: "slate" }
];

const recommendations = [
  {
    title: "Right-size 8 underutilized instances",
    detail: "Production · Compute · AWS",
    saving: "$1,240/mo",
    confidence: "High",
    icon: Gauge
  },
  {
    title: "Move infrequent objects to archive tier",
    detail: "Data platform · Storage · AWS",
    saving: "$680/mo",
    confidence: "Medium",
    icon: Cloud
  },
  {
    title: "Review idle development resources",
    detail: "Engineering · Multi-cloud",
    saving: "$420/mo",
    confidence: "High",
    icon: Lightbulb
  }
];

function MetricCard({
  label,
  value,
  change,
  positive,
  note
}: {
  label: string;
  value: string;
  change: string;
  positive?: boolean;
  note: string;
}) {
  return (
    <article className="metric-card">
      <div className="metric-topline">
        <span>{label}</span>
        <span className="metric-icon"><Wallet size={16} /></span>
      </div>
      <div className="metric-value">{value}</div>
      <div className="metric-foot">
        <span className={positive ? "trend positive" : "trend negative"}>
          {positive ? <ArrowDownRight size={14} /> : <ArrowUpRight size={14} />}
          {change}
        </span>
        <span>{note}</span>
      </div>
    </article>
  );
}

export default function Home() {
  return (
    <main className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#" aria-label="FinSight home">
          <span className="brand-mark"><span /></span>
          <span>fin<span className="brand-light">sight</span></span>
        </a>

        <div className="workspace-switcher">
          <div className="workspace-avatar">AC</div>
          <div className="workspace-copy">
            <strong>Acme Corporation</strong>
            <span>Enterprise workspace</span>
          </div>
          <ChevronDown size={15} />
        </div>

        <div className="nav-label">WORKSPACE</div>
        <nav className="main-nav" aria-label="Main navigation">
          <a className="nav-item active" href="#overview"><LayoutDashboard size={17} />Overview</a>
          <a className="nav-item" href="#spend"><Wallet size={17} />Cost explorer</a>
          <a className="nav-item" href="#recommendations"><Lightbulb size={17} />Recommendations<span className="nav-count">3</span></a>
          <a className="nav-item" href="#budgets"><Gauge size={17} />Budgets</a>
        </nav>

        <div className="nav-label nav-label-spaced">MANAGE</div>
        <nav className="main-nav" aria-label="Management navigation">
          <a className="nav-item" href="#integrations"><Cloud size={17} />Integrations</a>
          <a className="nav-item" href="#governance"><ShieldCheck size={17} />Governance</a>
          <a className="nav-item" href="#settings"><Settings2 size={17} />Settings</a>
        </nav>

        <div className="sidebar-bottom">
          <div className="help-card">
            <div className="help-icon"><CircleHelp size={17} /></div>
            <strong>Need a hand?</strong>
            <p>Explore the FinSight guide to get more from your cloud data.</p>
            <a href="#help">Open help center <span>↗</span></a>
          </div>
          <div className="profile-row">
            <div className="profile-avatar">JD</div>
            <div className="profile-copy"><strong>Jordan Davis</strong><span>FinOps Admin</span></div>
            <ChevronDown size={15} />
          </div>
        </div>
      </aside>

      <section className="main-panel" id="overview">
        <header className="topbar">
          <div className="breadcrumbs">Workspace <span>/</span> <strong>Overview</strong></div>
          <div className="topbar-actions">
            <div className="period-select">Last 30 days <ChevronDown size={14} /></div>
            <button className="icon-button" aria-label="Search"><Search size={17} /></button>
            <button className="icon-button notification-button" aria-label="Notifications"><Bell size={17} /><i /></button>
            <div className="topbar-avatar">JD</div>
          </div>
        </header>

        <div className="content-wrap">
          <section className="welcome-row">
            <div>
              <div className="eyebrow">THURSDAY, NOVEMBER 20, 2026</div>
              <h1>Cloud spend overview</h1>
              <p className="welcome-subtitle">Here&apos;s how your infrastructure investment is performing.</p>
            </div>
            <button className="export-button"><Download size={15} />Export report</button>
          </section>

          <section className="metrics-grid" aria-label="Key financial metrics">
            <MetricCard label="Total cloud spend" value="$44,130" change="8.2%" positive note="vs. previous period" />
            <MetricCard label="Projected month-end" value="$58,420" change="4.6%" note="vs. monthly forecast" />
            <MetricCard label="Potential savings" value="$2,340" change="12.4%" positive note="across 3 opportunities" />
            <MetricCard label="Budget utilization" value="73.5%" change="On track" positive note="$15,870 remaining" />
          </section>

          <section className="dashboard-grid">
            <article className="panel spend-panel" id="spend">
              <div className="panel-heading">
                <div><h2>Spend over time</h2><p>Daily cloud costs across connected providers</p></div>
                <button className="subtle-select">Daily <ChevronDown size={13} /></button>
              </div>
              <div className="chart-legend">
                <span><i className="legend-dot violet-dot" />AWS</span>
                <span><i className="legend-dot blue-dot" />Azure</span>
                <span><i className="legend-dot teal-dot" />Google Cloud</span>
              </div>
              <div className="chart-area" role="img" aria-label="Illustrative cloud spend trend chart for the last 30 days">
                <div className="chart-y-labels"><span>$2.0k</span><span>$1.5k</span><span>$1.0k</span><span>$0.5k</span><span>$0</span></div>
                <div className="chart-plot">
                  <div className="grid-line line-1" /><div className="grid-line line-2" /><div className="grid-line line-3" /><div className="grid-line line-4" /><div className="grid-line line-5" />
                  <svg viewBox="0 0 720 220" preserveAspectRatio="none" aria-hidden="true">
                    <defs>
                      <linearGradient id="areaViolet" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#8b7cf6" stopOpacity=".22" /><stop offset="100%" stopColor="#8b7cf6" stopOpacity="0" /></linearGradient>
                    </defs>
                    <path d="M0 142 C35 130 45 145 72 126 S115 118 144 130 S188 100 216 111 S260 120 288 91 S332 110 360 86 S404 96 432 75 S476 95 504 67 S548 80 576 59 S620 74 648 49 S690 61 720 35 L720 220 L0 220 Z" fill="url(#areaViolet)" />
                    <path d="M0 142 C35 130 45 145 72 126 S115 118 144 130 S188 100 216 111 S260 120 288 91 S332 110 360 86 S404 96 432 75 S476 95 504 67 S548 80 576 59 S620 74 648 49 S690 61 720 35" fill="none" stroke="#8878ed" strokeWidth="3" vectorEffect="non-scaling-stroke" />
                    <path d="M0 174 C35 166 48 177 72 160 S115 166 144 157 S188 164 216 145 S260 156 288 139 S332 149 360 130 S404 139 432 124 S476 134 504 111 S548 122 576 104 S620 116 648 96 S690 104 720 88" fill="none" stroke="#5c9be8" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
                    <path d="M0 194 C35 189 48 196 72 187 S115 190 144 181 S188 190 216 175 S260 184 288 169 S332 176 360 164 S404 171 432 155 S476 164 504 148 S548 158 576 139 S620 149 648 133 S690 141 720 124" fill="none" stroke="#46b9a6" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
                  </svg>
                  <div className="chart-x-labels"><span>Oct 22</span><span>Oct 27</span><span>Nov 1</span><span>Nov 6</span><span>Nov 11</span><span>Nov 16</span><span>Nov 20</span></div>
                </div>
              </div>
              <div className="chart-note"><span className="note-dot" />Spend is 8.2% lower than the previous 30-day period.</div>
            </article>

            <article className="panel allocation-panel">
              <div className="panel-heading">
                <div><h2>Spend by service</h2><p>Where your cloud budget goes</p></div>
                <button className="more-button" aria-label="More spend options">•••</button>
              </div>
              <div className="allocation-total"><strong>$44,130</strong><span>Total spend</span></div>
              <div className="allocation-list">
                {spendByService.map((item) => (
                  <div className="allocation-item" key={item.name}>
                    <div className="allocation-meta"><span>{item.name}</span><strong>{item.amount}</strong></div>
                    <div className="allocation-track"><span className={item.tone} style={{ width: item.width }} /></div>
                  </div>
                ))}
              </div>
            </article>
          </section>

          <section className="panel recommendations-panel" id="recommendations">
            <div className="panel-heading recommendations-heading">
              <div><div className="heading-with-icon"><span className="sparkle-icon"><Lightbulb size={16} /></span><h2>Optimization opportunities</h2><span className="recommendation-count">3 new</span></div><p>Actionable ways to reduce your cloud bill</p></div>
              <a className="view-all" href="#all-recommendations">View all recommendations <span>→</span></a>
            </div>
            <div className="recommendation-list">
              {recommendations.map((item) => {
                const Icon = item.icon;
                return (
                  <div className="recommendation-row" key={item.title}>
                    <div className="recommendation-icon"><Icon size={17} /></div>
                    <div className="recommendation-copy"><strong>{item.title}</strong><span>{item.detail}</span></div>
                    <span className="confidence">{item.confidence} confidence</span>
                    <div className="saving-value"><strong>{item.saving}</strong><span>estimated savings</span></div>
                    <button className="review-button">Review <span>→</span></button>
                  </div>
                );
              })}
            </div>
          </section>

          <footer className="dashboard-footer">
            <span>FinSight preview · Sample workspace data</span>
            <span>Last updated just now <i /> All systems operational</span>
          </footer>
        </div>
      </section>
    </main>
  );
}
