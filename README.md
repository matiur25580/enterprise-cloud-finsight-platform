# FinSight

**Enterprise Cloud FinOps & Cost Intelligence Platform**

FinSight is a cloud financial operations (FinOps) platform designed to help engineering, finance, and platform teams understand, allocate, forecast, and optimize cloud infrastructure spending.

> **Project status:** Active development. The Next.js application foundation and initial PostgreSQL/Prisma data model are committed. The CSV parser/import service and credentials authentication/RBAC foundation are committed. The authenticated cost dashboard now queries tenant-scoped billing data, provider accounts, service allocation, budgets, and forecasts. Organization members with billing-import permission can upload CSV files through a protected workspace route; each import is validated, deduplicated, audited, and recorded in import history. The cost-intelligence workspace adds historical service-spike detection, budget threshold signals, and transparent optimization scenarios. Email verification, MFA, provider credential rotation/verification, and production hardening remain outstanding. Read-only AWS Cost Explorer, Azure Cost Management, and GCP BigQuery billing adapters are implemented behind an external secret-resolver contract. A durable PostgreSQL-backed sync queue, scheduled account polling, retry handling, and a graceful-shutdown worker are implemented. Provider-native AWS CUR, Azure Cost Management, and GCP detailed billing CSV exports can now be normalized and imported through the workspace. The cloud account workspace now manages AWS/Azure/GCP account metadata, lifecycle status, external secret-manager references, manual sync queueing, and sync schedules without accepting raw credentials. The sync worker resolves per-account credentials from an external secret resolver, fetches the previous 30 complete UTC days, and sends normalized costs through the shared idempotent import pipeline. Jobs remain BLOCKED until the worker's secret resolver and account-specific secret reference are configured.

## Implemented foundation

- Next.js App Router, React, TypeScript, Tailwind CSS, and ESLint scaffold.
- Responsive organization dashboard with live tenant-scoped cost queries and explicit empty states (no fabricated spend values).
- PostgreSQL schema for organizations, users, memberships, cloud accounts, cost records, budgets, audit logs, and recommendations.
- Organization-scoped PostgreSQL Row-Level Security policies and a transaction helper for tenant context.
- CSV billing parser with strict validation, row-level error capture, stable fingerprints, duplicate-safe inserts, and import audit history.
- Provider-native export adapters for AWS Cost and Usage Reports, Azure Cost Management exports, and GCP detailed billing exports; adapters normalize source columns before using the common validated import pipeline.
- Auth.js credentials authentication, bcrypt password hashing, organization bootstrap, JWT sessions, and server-side RBAC guards.
- Live cost analytics: 7/30/90-day and month-to-date windows, prior-period comparison, daily and six-month monthly trends, provider/account and service breakdowns, month-end run-rate estimates, and active budget utilization. Currency totals are never combined across currencies.
- Cost intelligence: 14-calendar-day service baselines with a minimum of 7 observations, 2x/3σ spike thresholds, configured budget threshold alerts, and ranked optimization scenarios using an explicitly disclosed illustrative 5% reduction assumption.
- GitHub Actions workflow for linting, TypeScript checks, unit tests, and builds.
- PostgreSQL-backed cloud sync queue with `FOR UPDATE SKIP LOCKED`, scheduled job creation, bounded retries, sync history, and a SIGTERM/SIGINT-aware worker (`npm run sync:worker`).

## Planned capabilities

| Area | Planned capability |
|---|---|
| Cost intelligence | Tenant-scoped spend trends, service breakdowns, period comparisons, provider allocation, and budget utilization |
| Data ingestion | Validated CSV imports, provider-native export normalization, and read-only AWS/Azure/GCP billing API adapters |
| Allocation | Team, project, environment, and tag-based cost allocation |
| Anomaly detection | 14-day service baseline, minimum sample guard, 2x/3σ spike rule, and explainable alerts |
| Forecasting | Historical trend forecasts with confidence ranges |
| Optimization | Ranked service review opportunities with transparent, illustrative savings scenarios; actual savings tracking remains planned |
| Budgets | Budget ownership, thresholds, and notifications |
| Governance | Authentication, organizations, RBAC, cloud account lifecycle, audit events, and approvals |
| Reporting | Exportable reports and documented APIs |

## Technology

- **Application:** Next.js App Router, React, TypeScript
- **UI:** Tailwind CSS and Lucide icons
- **Data:** PostgreSQL and Prisma ORM
- **Security:** Auth.js JWT sessions, password hashing, server-side organization RBAC, and PostgreSQL Row-Level Security
- **Quality:** ESLint, TypeScript checks, GitHub Actions
- **Future:** provider credential rotation/verification, allocation dimensions, notification delivery, forecasting confidence ranges, Vitest, Playwright, Docker, and deployment automation

## Database model

- `Organization`, `User`, and `Membership` support organization membership and role assignments.
- `CloudAccount` stores AWS, Azure, and Google Cloud account metadata, lifecycle status, optional external secret-manager references, sync schedules, and sync timestamps.
- `CloudSyncJob` stores tenant-scoped manual/scheduled sync work, attempt counts, execution timestamps, and blocked/failure details.
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

The authenticated workspace provides normalized CSV upload and provider-native export import. Choose the provider-native option for AWS CUR, Azure Cost Management exports, or GCP detailed billing exports. Cloud account inventory is managed separately under each organization. Provider-native CSV ingestion remains available. Live API sync is also supported through AWS Cost Explorer, Azure Cost Management, and GCP BigQuery billing export. Credentials are never stored in FinSight; the worker resolves the account's credentialRef through the configured external secret resolver. Sync jobs query the previous 30 complete UTC days and import results through the same validated, deduplicating pipeline.

## Local development

Requirements: Node.js 20.9+ and PostgreSQL.

1. Run `npm install`.
2. Copy `.env.example` to `.env`, set `DATABASE_URL`, and generate `AUTH_SECRET` with `npx auth secret`.
3. Run `npm run db:generate`.
4. Apply migrations locally with `npm run db:migrate`.
5. Start the app with `npm run dev`.
6. Create an account at `/register`; your first organization is created with the OWNER role.

For an already provisioned database, use `npm run db:deploy`. Never commit `.env`, credentials, or real customer billing exports. Run `npm run sync:worker` as a separate background worker after applying migrations; configure one worker instance per environment unless you have verified the database connection budget.

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
- [x] Phase 3 foundation — CSV parsing/validation, import history, row issues, idempotent fingerprints, and audit events. Authenticated upload UI/API is implemented; advanced report exports remain planned.
- [x] Phase 4 foundation — Tenant-scoped cost aggregation, daily/monthly trends, provider/service breakdowns, period comparisons, budget utilization, and month-end run-rate forecast. CSV upload UI is implemented; advanced report exports remain planned.
- [x] Phase 5 foundation — Historical service-spend anomaly signals, budget threshold alerts, and explainable optimization scenarios. Persistent alert delivery, forecasting confidence ranges, and realized-savings tracking remain planned.
- [x] Phase 6 foundation — AWS/Azure/GCP account inventory, lifecycle management, audit events, and secret-manager reference metadata.
- [x] Phase 7 foundation — Credentials authentication, organization bootstrap, JWT sessions, and server-side RBAC guards. Email verification, MFA, rate limiting, and production hardening remain outstanding.
- [x] Phase 8 foundation — AWS CUR, Azure Cost Management, and GCP detailed billing CSV normalization adapters with a shared validated import path.
- [x] Phase 9 foundation — PostgreSQL-backed manual/scheduled sync queue, tenant-scoped job history, worker claim/retry logic, and graceful shutdown.
- [x] Phase 10 foundation — Read-only AWS Cost Explorer (STS AssumeRole), Azure Cost Management, and GCP BigQuery billing-export API adapters with external secret resolution and canonical idempotent ingestion. Production secret resolver deployment, provider IAM setup, credential rotation, and live end-to-end verification remain operator tasks.

## Security

Please do not report vulnerabilities in public issues with exploitable details. Use GitHub's private vulnerability reporting if enabled, or contact the maintainers privately.

## Contributing

Contributions should include a clear description, relevant tests, and documentation updates. Financial logic changes must include examples covering currency, rounding, billing periods, and edge cases.

## License

No license has been selected yet. Until a license is added, all rights are reserved by the copyright holder; do not assume the code is open for reuse.


### Authenticated CSV uploads

Open an organization workspace and select **Import billing CSV**. Uploads require the `billing:import` permission and an active cloud account in that organization. Files are limited to 5 MB and 20,000 rows. The API derives the actor from the Auth.js session, validates organization membership server-side, records rejected rows and duplicates, and writes an audit event. A downloadable template is available at `/billing-import-template.csv`.

### Cloud sync worker

The application and worker use separate database credentials. Keep `SYNC_WORKER_DATABASE_URL` only in the background worker environment; never expose it to the Next.js web service. A database administrator must provision a dedicated, non-superuser worker role with RLS bypass and narrowly scoped table grants (managed PostgreSQL providers may restrict this operation):

```sql
CREATE ROLE finsight_sync_worker LOGIN BYPASSRLS PASSWORD '<managed-out-of-band-secret>';
GRANT CONNECT ON DATABASE <database_name> TO finsight_sync_worker;
GRANT USAGE ON SCHEMA public TO finsight_sync_worker;
GRANT SELECT, UPDATE ON TABLE cloud_accounts TO finsight_sync_worker;
GRANT SELECT, INSERT, UPDATE ON TABLE cloud_sync_jobs TO finsight_sync_worker;
GRANT SELECT, INSERT, UPDATE ON TABLE import_batches TO finsight_sync_worker;
GRANT SELECT, INSERT ON TABLE cost_records TO finsight_sync_worker;
GRANT INSERT ON TABLE import_issues TO finsight_sync_worker;
GRANT INSERT ON TABLE audit_logs TO finsight_sync_worker;
```

Set `SYNC_WORKER_DATABASE_URL` on the worker service only, run `npm run sync:worker`, and keep the normal web-service `DATABASE_URL` on the restricted tenant-scoped runtime role. Do not use a superuser for either runtime. The worker drains a PostgreSQL queue with row locks, recovers stale leases, resolves secrets, calls read-only provider billing APIs, and imports normalized results. Keep SYNC_WORKER_DATABASE_URL, SECRET_RESOLVER_URL, and SECRET_RESOLVER_TOKEN only in the worker environment. Do not set the worker database URL or secret-resolver token on the public web service.


### Live cloud billing API connectors

The worker supports AWS Cost Explorer, Azure Cost Management, and GCP BigQuery billing exports. It reads the previous 30 complete UTC days and imports daily service-level charges through the canonical CSV validator and deduplication pipeline. The worker uses the account's credentialRef as an opaque pointer; secret material is returned only in memory and is never written to application tables or logs.

Configure these variables on the background worker only:

- SYNC_WORKER_DATABASE_URL: dedicated non-superuser sync-worker database role, with the queue/account permissions documented above.
- SECRET_RESOLVER_URL: HTTPS endpoint accepting the resolver contract below.
- SECRET_RESOLVER_TOKEN: bearer token for the resolver. Do not expose it to the web service or browser.

The worker sends POST SECRET_RESOLVER_URL with Authorization: Bearer <token> and JSON:

```json
{ "reference": "vault://finops/organization/cloud-account", "provider": "AWS", "organizationId": "org-id", "cloudAccountId": "account-id" }
```

The resolver must enforce that the reference belongs to the supplied organization and account, and return { secret: { ... } }. Use a dedicated service identity, strict reference allow-lists, audit access, TLS, and short-lived tokens. The endpoint must not log request secrets or response bodies.

Provider secret payloads:

- AWS: { roleArn: arn:aws:iam::123456789012:role/FinSightCostReader, externalId: ... }. The role must belong to the registered 12-digit account, trust the worker's AWS identity, and grant only ce:GetCostAndUsage for Cost Explorer. The worker assumes this role with a temporary session.
- Azure: { tenantId, clientId, clientSecret }. Grant the service principal Cost Management Reader at the registered subscription scope.
- GCP: { serviceAccountJson: { type: external_account, ... }, billingExportTable: project-id.dataset.gcp_billing_export_v1_... }. Use service-account or Workload Identity Federation credentials, grant BigQuery Job User on the query project and BigQuery Data Viewer on the billing export dataset, and ensure the table project matches the registered cloud account project ID.

New imports are system-originated and deliberately have no fabricated human uploader; the audit event records the provider sync with a null human actor. AWS/Azure/GCP permissions should be read-only. Validate the resolver and provider roles in a non-production organization before enabling schedules.
