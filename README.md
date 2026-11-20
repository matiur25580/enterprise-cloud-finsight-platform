# FinSight

**Enterprise Cloud FinOps & Cost Intelligence Platform**

FinSight is a cloud financial operations (FinOps) platform designed to help engineering, finance, and platform teams understand, allocate, forecast, and optimize cloud infrastructure spending.

> **Project status:** Active development. The Next.js application foundation and initial PostgreSQL/Prisma data model are committed. The CSV parser/import service and credentials authentication/RBAC foundation are committed. The authenticated cost dashboard now queries tenant-scoped billing data, provider accounts, service allocation, budgets, and forecasts. Browser CSV upload, email verification, MFA, and production cloud integrations remain outstanding.

## Implemented foundation

- Next.js App Router, React, TypeScript, Tailwind CSS, and ESLint scaffold.
- Responsive organization dashboard with live tenant-scoped cost queries and explicit empty states (no fabricated spend values).
- PostgreSQL schema for organizations, users, memberships, cloud accounts, cost records, budgets, audit logs, and recommendations.
- Organization-scoped PostgreSQL Row-Level Security policies and a transaction helper for tenant context.
- CSV billing parser with strict validation, row-level error capture, stable fingerprints, duplicate-safe inserts, and import audit history.
- Auth.js credentials authentication, bcrypt password hashing, organization bootstrap, JWT sessions, and server-side RBAC guards.
- Live cost analytics: 7/30/90-day and month-to-date windows, prior-period comparison, daily and six-month monthly trends, provider/account and service breakdowns, month-end run-rate estimates, and active budget utilization. Currency totals are never combined across currencies.
- GitHub Actions workflow for linting, TypeScript checks, and builds.

## Planned capabilities

| Area | Planned capability |
|---|---|
| Cost intelligence | Tenant-scoped spend trends, service breakdowns, period comparisons, provider allocation, and budget utilization |
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
- **Security:** Auth.js JWT sessions, password hashing, server-side organization RBAC, and PostgreSQL Row-Level Security
- **Quality:** ESLint, TypeScript checks, GitHub Actions
- **Future:** background jobs, provider billing ingestion, allocation dimensions, anomaly detection, Vitest, Playwright, Docker, and deployment automation

## Database model

- `Organization`, `User`, and `Membership` support organization membership and role assignments.
- `CloudAccount` stores AWS, Azure, and Google Cloud account metadata.
- `CostRecord` stores normalized daily charges with decimal precision, currency, tags, and deduplication keys.
- `Budget` stores date-bounded budgets and alert thresholds.
- `AuditLog` stores attributable, organization-scoped events.
- `Recommendation` stores evidence-backed optimization opportunities and review status.
- `ImportBatch` and `ImportIssue` track source files, row outcomes, and validation errors.

Tenant-owned tables use PostgreSQL Row-Level Security. Server code must obtain the organization ID from a verified membership and execute tenant queries through `withOrganization` in `src/lib/tenant-context.ts`. Membership discovery uses a transaction-scoped authenticated user context; organization data uses a transaction-scoped organization context. The runtime database role must not be a superuser or have `BYPASSRLS`; production should use a separate migration owner and restricted runtime role.

## CSV billing import format

The ingestion parser accepts UTF-8 CSV files up to 5 MB and 20,000 data rows. Required headers are `service`, `amount`, `currency`, and `usageDate` (ISO date: `YYYY-MM-DD`). Optional headers include `externalId`, `region`, `usageType`, `resourceId`, and custom tag columns such as `tag:team` or `tag:environment`. Amounts support up to 8 decimal places and currencies must be 3-letter codes.

Example:

```csv
service,amount,currency,usageDate,region,externalId,tag:team
Compute,12.34000000,USD,2026-11-01,ap-south-1,aws-line-001,platform
Object Storage,4.25000000,USD,2026-11-01,ap-south-1,aws-line-002,data
```

The import service is a server-only domain operation. An authenticated upload route/UI is still pending; do not accept organization or actor IDs directly from browser input.

## Local development

Requirements: Node.js 20.9+ and PostgreSQL.

1. Run `npm install`.
2. Copy `.env.example` to `.env`, set `DATABASE_URL`, and generate `AUTH_SECRET` with `npx auth secret`.
3. Run `npm run db:generate`.
4. Apply migrations locally with `npm run db:migrate`.
5. Start the app with `npm run dev`.
6. Create an account at `/register`; your first organization is created with the OWNER role.

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
- [x] Phase 3 foundation — CSV parsing/validation, import history, row issues, idempotent fingerprints, and audit events. Authenticated upload UI/API remains outstanding until authentication is implemented.
- [x] Phase 4 foundation — Tenant-scoped cost aggregation, daily/monthly trends, provider/service breakdowns, period comparisons, budget utilization, and month-end run-rate forecast. CSV upload UI and exports remain outstanding.
- [ ] Phase 5 — Anomaly detection, forecasting, and evidence-backed recommendations.
- [ ] Phase 6 — Secure cloud provider integrations.
- [x] Phase 7 foundation — Credentials authentication, organization bootstrap, JWT sessions, and server-side RBAC guards. Email verification, MFA, rate limiting, and production hardening remain outstanding.

## Security

Please do not report vulnerabilities in public issues with exploitable details. Use GitHub's private vulnerability reporting if enabled, or contact the maintainers privately.

## Contributing

Contributions should include a clear description, relevant tests, and documentation updates. Financial logic changes must include examples covering currency, rounding, billing periods, and edge cases.

## License

No license has been selected yet. Until a license is added, all rights are reserved by the copyright holder; do not assume the code is open for reuse.
