# FinSight

**Enterprise Cloud FinOps & Cost Intelligence Platform**

FinSight is a cloud financial operations (FinOps) platform designed to help engineering, finance, and platform teams understand, allocate, forecast, and optimize cloud infrastructure spending.

> **Project status:** Active development. The Next.js application foundation and initial PostgreSQL/Prisma data model are committed. Cloud billing ingestion, authentication, and production integrations are not yet implemented; dashboard figures are illustrative sample data.

## Implemented foundation

- Next.js App Router, React, TypeScript, Tailwind CSS, and ESLint scaffold.
- Responsive dashboard shell with explicitly illustrative sample values.
- PostgreSQL schema for organizations, users, memberships, cloud accounts, cost records, budgets, audit logs, and recommendations.
- Organization-scoped PostgreSQL Row-Level Security policies and a transaction helper for tenant context.
- GitHub Actions workflow for linting, TypeScript checks, and builds.

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
| Governance | Authentication, organizations, RBAC, audit events, and approvals |
| Reporting | Exportable reports and documented APIs |

## Technology

- **Application:** Next.js App Router, React, TypeScript
- **UI:** Tailwind CSS and Lucide icons
- **Data:** PostgreSQL and Prisma ORM
- **Security:** Organization-scoped database policies; application authorization remains to be implemented
- **Quality:** ESLint, TypeScript checks, GitHub Actions
- **Future:** Auth.js, background jobs, provider billing ingestion, analytics, Vitest, Playwright, Docker, and deployment automation

## Database model

- `Organization`, `User`, and `Membership` support organization membership and role assignments.
- `CloudAccount` stores AWS, Azure, and Google Cloud account metadata.
- `CostRecord` stores normalized daily charges with decimal precision, currency, tags, and deduplication keys.
- `Budget` stores date-bounded budgets and alert thresholds.
- `AuditLog` stores attributable, organization-scoped events.
- `Recommendation` stores evidence-backed optimization opportunities and review status.

Tenant-owned tables use PostgreSQL Row-Level Security. Server code must obtain the organization ID from a verified membership and execute tenant queries through `withOrganization` in `src/lib/tenant-context.ts`. The runtime database role must not be a superuser or have `BYPASSRLS`; production should use a separate migration owner and restricted runtime role.

## Local development

Requirements: Node.js 20.9+ and PostgreSQL.

1. Run `npm install`.
2. Copy `.env.example` to `.env` and set `DATABASE_URL` to your local PostgreSQL database.
3. Run `npm run db:generate`.
4. Apply migrations locally with `npm run db:migrate`.
5. Start the app with `npm run dev`.

For an already provisioned database, use `npm run db:deploy`. Never commit `.env`, credentials, or real customer billing exports.

## Architecture principles

1. **Tenant isolation first:** every tenant-owned record must be scoped and authorized server-side.
2. **Traceable data:** imports should retain source, batch, currency, and billing-period metadata.
3. **Idempotent ingestion:** retrying an import must not silently duplicate charges.
4. **Explainable intelligence:** results must show the data and rules behind them.
5. **Safe integrations:** provider credentials must be encrypted, scoped, and never exposed to browsers or logs.
6. **Honest forecasting:** forecasts communicate assumptions and uncertainty.
7. **Testable business logic:** financial calculations use explicit currency and precision rules.

## Roadmap

- [x] Phase 1 — Application foundation and CI workflow.
- [x] Phase 2 foundation — Initial database schema, migration, and tenant-scoped access helper.
- [ ] Phase 3 — Validated CSV ingestion, import history, deduplication, and source traceability.
- [ ] Phase 4 — Cost aggregation, allocation, dashboard queries, and reporting.
- [ ] Phase 5 — Anomaly detection, forecasting, and evidence-backed recommendations.
- [ ] Phase 6 — Secure cloud provider integrations.
- [ ] Phase 7 — Authentication completion, tests, observability, Docker, CI/CD, and production hardening.

## Security

Please do not report vulnerabilities in public issues with exploitable details. Use GitHub's private vulnerability reporting if enabled, or contact the maintainers privately.

## Contributing

Contributions should include a clear description, relevant tests, and documentation updates. Financial logic changes must include examples covering currency, rounding, billing periods, and edge cases.

## License

No license has been selected yet. Until a license is added, all rights are reserved by the copyright holder; do not assume the code is open for reuse.
