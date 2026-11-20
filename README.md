# FinSight

**Enterprise Cloud FinOps & Cost Intelligence Platform**

FinSight is a cloud financial operations (FinOps) platform designed to help engineering, finance, and platform teams understand, allocate, forecast, and optimize cloud infrastructure spending.

> **Project status:** Active development. The Next.js application foundation and initial PostgreSQL/Prisma data model are committed. The CSV parser/import service and credentials authentication/RBAC foundation are committed. The authenticated cost dashboard now queries tenant-scoped billing data, provider accounts, service allocation, budgets, and forecasts. Organization members with billing-import permission can upload CSV files through a protected workspace route; each import is validated, deduplicated, audited, and recorded in import history. The cost-intelligence workspace adds historical service-spike detection, budget threshold signals, and transparent optimization scenarios. Email verification, MFA, provider credential rotation/verification, and production hardening remain outstanding. Read-only AWS Cost Explorer, Azure Cost Management, and GCP BigQuery billing adapters are implemented behind an external secret-resolver contract. A durable PostgreSQL-backed sync queue, scheduled account polling, retry handling, and a graceful-shutdown worker are implemented. Provider-native AWS CUR, Azure Cost Management, and GCP detailed billing CSV exports can now be normalized and imported through the workspace. The cloud account workspace now manages AWS/Azure/GCP account metadata, lifecycle status, external secret-manager references, manual sync queueing, and sync schedules without accepting raw credentials. The sync worker resolves per-account credentials from HashiCorp Vault KV v2 directly or from a custom external secret resolver, fetches the previous 30 complete UTC days, and sends normalized costs through the shared idempotent import pipeline. Jobs remain BLOCKED until the selected secret backend and account-specific secret reference are configured.

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
- `AuditLog` stores attributable, organization-scoped events, including cloud sync queue/retry actions and background-worker start, success, failure, and blocked lifecycle events. The organization audit timeline displays the latest 100 cloud governance events without exposing provider error payloads or secrets.
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

Set `SYNC_WORKER_DATABASE_URL` on the worker service only, run `npm run sync:worker`, and keep the normal web-service `DATABASE_URL` on the restricted tenant-scoped runtime role. Do not use a superuser for either runtime. The worker drains a PostgreSQL queue with row locks, recovers stale leases, resolves secrets, calls read-only provider billing APIs, and imports normalized results. Keep SYNC_WORKER_DATABASE_URL and all Vault/custom-resolver credentials only in the worker environment. Do not set the worker database URL or secret-manager tokens on the public web service.


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


### Built-in HashiCorp Vault KV v2 integration

The sync worker can read provider credentials directly from HashiCorp Vault KV v2; a separate custom resolver is optional. Set these variables on the isolated worker only:

- `SECRET_MANAGER_BACKEND=vault`
- `VAULT_ADDR=https://vault.example.com`
- `VAULT_TOKEN`: a narrowly scoped Vault token with read access only to the required KV v2 secret paths.
- `VAULT_NAMESPACE`: optional Vault Enterprise namespace.

Store each account's provider secret in KV v2 and set its FinSight credential reference to `vault://<mount>/<path>`, for example `vault://kv/finops/org-123/aws-prod`. The secret's KV v2 `data.data` object must contain the provider payload documented above. Vault references are resolved only by the background worker; the token is never sent to the browser or stored in PostgreSQL. The resolver rejects path traversal, non-HTTPS Vault endpoints (except local development), redirects, malformed KV v2 responses, and oversized responses. Vault 5xx/429/network errors are retryable; missing or denied secrets block the job until configuration is corrected.

Use a dedicated Vault policy scoped to exact secret paths, short-lived tokens or workload identity where available, TLS, rotation, and Vault audit devices. Never grant the worker broad list/write/delete access. If you prefer an independently hosted resolver, leave `SECRET_MANAGER_BACKEND` unset and configure `SECRET_RESOLVER_URL` plus `SECRET_RESOLVER_TOKEN`; the existing organization/account-aware resolver contract remains supported.


### Cloud sync alerts

The background worker can send terminal sync failures/blocked-credential alerts and recovery notices to Slack and/or email. Configure on the worker only:

- `SLACK_SYNC_ALERT_WEBHOOK_URL`: Slack incoming webhook URL (HTTPS Slack webhook hosts only).
- `RESEND_API_KEY`: Resend API key for email delivery.
- `SYNC_ALERT_EMAIL_FROM`: verified sender address in Resend.
- `SYNC_ALERT_EMAIL_TO`: comma-separated recipient addresses.

At least one delivery channel must be configured. Alerts include the cloud account label, provider, status, stable error code, attempt count, and row counts; raw provider error messages and credential material are not sent. Transient job retries do not page; alerts are sent when a job becomes BLOCKED or reaches terminal FAILED, and a later successful sync after a prior failed/blocked job emits a recovery notice. Delivery is best-effort: provider/network failures do not change billing job state, and delivery is not a durable outbox. Monitor the worker logs/health dashboard and configure provider-side delivery monitoring for production.

### Cloud sync health dashboard

Organization members with `cloud:read` permission can open `/workspace/<organizationId>/cloud-accounts/health` to inspect tenant-scoped sync job totals (queued, running, succeeded, failed, blocked), account schedule and secret-reference readiness, and the latest 50 sync outcomes. The page intentionally displays stable error codes rather than raw provider error messages, which may contain sensitive response details. Counts are derived from persisted job records and do not imply that an external provider or worker is currently reachable.


## Operational audit timeline

Organization members with the `audit:read` permission can open `/workspace/{organizationId}/audit` to review the latest 100 cloud-account and sync events. The worker records system-attributed sync start, success, terminal failure, and blocked events; manual queue and retry actions retain the initiating user. Retry actions preserve the existing job record and add a separate audit event. The timeline intentionally omits raw provider error messages and secret material. This is a bounded recent-activity view, not an immutable compliance archive or exportable report.


### Audit CSV export

Users with `audit:read` can export organization-scoped cloud account and sync events from `/api/organizations/{organizationId}/audit/export`. Optional `from` and `to` ISO date-time parameters constrain the range (maximum 366 days); optional `action` performs a case-insensitive action substring filter. Exports are capped at 5,000 rows, marked private/no-store, and CSV cells are escaped against spreadsheet formula injection. This endpoint is an operational export, not a tamper-evident or immutable compliance archive.


### Organization members and invitations

Organization owners and administrators with `members:manage` can open `/workspace/{organizationId}/members` to review members, invite teammates by email, change permitted roles, and remove non-owner members. Invitations are single-use, expire after seven days, and are bound to the invited email address; invitees must sign in with that email before accepting. The invite API stores only a SHA-256 token hash, sends the raw token only through the configured Resend email provider, and records invitation, acceptance, role-change, and removal events in the organization audit log. Configure `RESEND_API_KEY`, `SYNC_ALERT_EMAIL_FROM`, and `NEXT_PUBLIC_APP_URL` on the web application to enable invitation delivery. Owners can invite administrators; administrators can invite analysts and viewers but cannot manage owner or peer-administrator accounts. Owner memberships are protected from role changes and removal. Apply the new `20261120190000_organization_invitations` migration before using this feature.


### Organization workspace settings

Organization owners with `organization:manage` can open `/workspace/{organizationId}/settings` to update the workspace display name. The API validates a 2–80 character name, derives a normalized URL slug, rejects slug collisions, and records previous/new names and slugs in the organization audit log. Organization IDs remain stable, so existing tenant-scoped billing data, cloud accounts, budgets, invitations, and member relationships are not moved or recreated. The workspace settings page is owner-only; administrators and other members retain read access to the cost dashboard but cannot rename the organization. Workspace profile changes are included in the audit timeline and CSV export.


### Workspace budget management

Organization members can open `/workspace/{organizationId}/budgets` to review budget limits and actual spend. Owners, administrators, and FinOps analysts with `budgets:manage` can create, edit, pause/reactivate, and delete budgets. Each budget stores a name, positive amount, ISO currency, monthly/quarterly/annual classification, inclusive date range, and configurable 1–100% alert thresholds. Spend is aggregated only for the same currency and within the configured date range; currencies are never converted or combined. Budget changes are recorded as `BUDGET_CREATED`, `BUDGET_UPDATED`, and `BUDGET_DELETED` audit events and appear in the timeline and CSV export. No database migration is required because the Budget model and table were created in the initial schema.


### Automated budget threshold notifications

After each accepted CSV billing import (manual upload or cloud sync), FinSight evaluates active budgets whose configured date window includes the current UTC date. Spend is summed only in the budget's currency from its start date through the current date. Every newly crossed configured threshold is recorded as a `BUDGET_THRESHOLD_ALERT_SENT` audit event and sent best-effort to Slack and/or email. A PostgreSQL transaction advisory lock plus the audit event ledger prevents duplicate threshold notifications for the same budget window, including concurrent imports. Notifications reuse the worker-side settings: `SLACK_SYNC_ALERT_WEBHOOK_URL`, or `RESEND_API_KEY`, `SYNC_ALERT_EMAIL_FROM`, and `SYNC_ALERT_EMAIL_TO`. Configure at least one channel on the application process that handles imports and the background worker process for cloud sync. Delivery is not a durable outbox; provider credentials, verified Resend sender identity, and actual delivery should be configured and tested in each environment. Alert evaluation and delivery are best-effort and never roll back an accepted billing import.
