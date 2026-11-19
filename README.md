# FinSight

**Enterprise Cloud FinOps & Cost Intelligence Platform**

FinSight is a cloud financial operations (FinOps) platform designed to help engineering, finance, and platform teams understand, allocate, forecast, and optimize cloud infrastructure spending.

> **Project status:** Foundation / early development. Features and integrations described below are planned unless explicitly marked as implemented. FinSight is not currently a production-ready cloud billing product.

## The problem

Cloud costs are distributed across services, projects, teams, and environments. Teams need a reliable way to understand where money is being spent, detect unexpected changes, forecast future expenditure, and turn billing data into actionable optimization work.

## Product goals

- Consolidate cloud cost and usage data with traceable source records.
- Attribute spending to organizations, teams, projects, and environments.
- Detect unusual spending using explainable, testable rules.
- Forecast expenditure from historical usage while communicating uncertainty.
- Recommend optimizations with supporting evidence and estimated impact.
- Support budgets, alerts, approvals, and auditable workflows.
- Protect customer data with strict tenant isolation and least-privilege access.

## Planned capabilities

| Area | Planned capability |
|---|---|
| Cost intelligence | Spend trends, service breakdowns, filters, and drill-downs |
| Data ingestion | Validated CSV imports and cloud billing integrations |
| Allocation | Team, project, environment, and tag-based cost allocation |
| Anomaly detection | Configurable baselines, thresholds, and explainable alerts |
| Forecasting | Historical trend forecasts with confidence ranges |
| Optimization | Evidence-backed recommendations and savings tracking |
| Budgets | Budget ownership, thresholds, and notifications |
| Governance | Organizations, RBAC, audit events, and approval workflows |
| Reporting | Exportable reports and documented APIs |

## Intended users

- FinOps practitioners and cloud cost managers
- Platform engineering and DevOps teams
- Cloud architects and engineering managers
- Finance teams and technology leaders

## Technology direction

The initial implementation is planned around:

- **Application:** Next.js App Router, React, TypeScript
- **UI:** Tailwind CSS and accessible component primitives
- **Data:** PostgreSQL and Prisma
- **Authentication:** Auth.js (subject to implementation review)
- **Async processing:** Redis-backed background jobs where justified
- **Analytics:** Reproducible cost calculations, anomaly rules, and forecast evaluation
- **Quality:** Vitest, Playwright, linting, type checks, and CI
- **Deployment:** Docker and a documented deployment workflow

Exact versions and final infrastructure choices will be pinned and documented as implementation begins.

## Architecture principles

1. **Tenant isolation first:** every tenant-owned record must be scoped and authorized server-side.
2. **Traceable data:** imported billing records retain source, import batch, currency, and relevant billing-period metadata.
3. **Idempotent ingestion:** retrying an import must not silently duplicate charges.
4. **Explainable intelligence:** anomaly and optimization results must show the data and rules behind them.
5. **Safe integrations:** provider credentials must be encrypted, scoped, and never exposed to the browser or logs.
6. **Honest forecasting:** forecasts communicate assumptions and uncertainty; they are not guarantees.
7. **Testable business logic:** financial calculations use explicit currency and precision rules and have automated tests.

## Development roadmap

- [ ] **Phase 1 — Foundation:** application scaffold, code quality, environment configuration, and CI.
- [ ] **Phase 2 — Identity and tenancy:** authentication, organizations, membership, roles, and tenant isolation.
- [ ] **Phase 3 — Cost data:** database model, validated CSV ingestion, import history, and deduplication.
- [ ] **Phase 4 — Analytics:** cost aggregation, allocation, dashboard queries, and reporting.
- [ ] **Phase 5 — Intelligence:** anomaly detection, forecasting, and evidence-backed recommendations.
- [ ] **Phase 6 — Cloud integrations:** provider integrations with secure credential handling and documented scopes.
- [ ] **Phase 7 — Production hardening:** security review, tests, observability, Docker, CI/CD, and deployment.

## Local development

Local setup instructions will be added with the application scaffold in Phase 1. Do not commit secrets or real customer billing exports. Use an environment example file for documented variable names and keep actual values in an untracked local environment file.

## Security

Please do not report vulnerabilities in public issues with exploitable details. Use GitHub's private vulnerability reporting if enabled, or contact the maintainers privately.

## Contributing

Contributions should include a clear description, relevant tests, and documentation updates. Financial logic changes must include examples covering currency, rounding, billing periods, and edge cases.

## License

No license has been selected yet. Until a license is added, all rights are reserved by the copyright holder; do not assume the code is open for reuse.
