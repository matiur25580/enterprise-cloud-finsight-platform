# Production deployment runbook

This guide separates the public Next.js web application from the cloud-sync worker. Do not run the worker with the web application's database credentials.

## 1. Deployment shape

Build the repository with the included `Dockerfile`.

- **Web service:** use the image's default command, `npm start`, listening on port 3000. Configure the platform health check to call `/api/health`.
- **Cloud sync worker:** deploy the same image as a background worker and override its start command to `npm run sync:worker`. It polls PostgreSQL for due jobs and exits cleanly on SIGTERM/SIGINT.
- **PostgreSQL:** use a managed PostgreSQL instance with TLS and automated backups. Keep web, migration, and worker database roles separate.

The repository does not commit a hosting-specific Blueprint because service plans, regions, database topology, and existing account resources must be selected in the target hosting account. Never paste production credentials into GitHub source files or this runbook.

## 2. Web service environment

Set these values in the hosting provider's secret/environment settings:

| Variable | Requirement |
|---|---|
| `DATABASE_URL` | Required. Web application's PostgreSQL connection string; use the least-privilege runtime role with RLS enforced. |
| `AUTH_SECRET` | Required. Strong random secret, at least 32 characters. Keep stable across instances and deployments. |
| `APP_URL` | Required for email links. Public HTTPS origin, e.g. `https://finsight.example.com`. |
| `NEXT_PUBLIC_APP_URL` | Set to the same public HTTPS origin. |
| `AUTH_URL` | Set to the same public HTTPS origin when required by the hosting/Auth.js configuration. |
| `RESEND_API_KEY` | Required to deliver verification and password-reset emails. |
| `EMAIL_FROM` | Required. Sender address on a domain verified with Resend. |
| `NODE_ENV` | `production`. |

Do not expose `AUTH_SECRET`, `RESEND_API_KEY`, database URLs, Vault tokens, or provider credentials through `NEXT_PUBLIC_*` variables. Terminate HTTPS at the hosting platform and ensure forwarded client-IP headers are overwritten by the trusted proxy; public registration, login, email verification and recovery rate limits rely on a trustworthy client address.

## 3. Database roles and migrations

Use three distinct database identities:

1. **Migration role:** schema owner or a role with the DDL privileges needed by Prisma migrations. Use it only in a one-off release/migration job.
2. **Web runtime role:** non-superuser, not `BYPASSRLS`, with only the table/sequence privileges the application needs. Tenant isolation depends on PostgreSQL RLS and transaction-scoped tenant context.
3. **Worker role:** dedicated non-superuser `BYPASSRLS` role, as required by the isolated background worker. Do not use the database superuser and never assign this role to the public web service.

Before deploying a release, run migrations from a one-off job using the migration role:

```bash
npm run db:deploy
npm run db:generate
```

Then configure the web service's `DATABASE_URL` with the web runtime role and the worker's `SYNC_WORKER_DATABASE_URL` with the dedicated worker role. The worker replaces `DATABASE_URL` with `SYNC_WORKER_DATABASE_URL` before loading Prisma. Do not set `SYNC_WORKER_DATABASE_URL` on the public web service.

Apply migrations before routing traffic to code that expects the new schema. Back up PostgreSQL before production migrations and rehearse restore procedures in a separate environment.

## 4. Worker-only secret management

The worker must receive:

- `SYNC_WORKER_DATABASE_URL`: dedicated non-superuser `BYPASSRLS` connection string.
- `SECRET_MANAGER_BACKEND=vault` for HashiCorp Vault KV v2, or configure the supported custom resolver.
- `VAULT_ADDR`: HTTPS Vault origin.
- `VAULT_TOKEN`: short-lived or narrowly scoped token with read-only access to the required KV v2 paths.
- `VAULT_NAMESPACE`: only when using Vault Enterprise namespaces.
- For a custom resolver, configure `SECRET_RESOLVER_URL` and `SECRET_RESOLVER_TOKEN` instead of the Vault backend.

Cloud account credential references use the form `vault://<mount>/<path>`. The worker reads KV v2 values from `/<mount>/data/<path>`. Keep provider secrets out of PostgreSQL, browser responses, application logs, and Git history. Restrict the Vault policy to only the paths needed by this worker.

Do not start the worker until the dedicated database role, Vault policy, and secret paths have been provisioned and verified. A worker that cannot resolve credentials should fail the sync job safely rather than fall back to raw credentials.

## 5. Cloud provider credentials

Connect AWS, Azure, and Google Cloud using dedicated read-only billing identities with only the permissions required by the selected provider adapter and billing export source. Prefer workload identity/federation over long-lived static keys where the provider and hosting platform support it. Validate each provider account with a small, known billing period before enabling scheduled sync.

Provider API credentials are external operator configuration; CI cannot verify real provider access without those credentials and live accounts.

## 6. Email delivery

Verify the sending domain in Resend, configure SPF/DKIM as directed by Resend, and set `RESEND_API_KEY` and `EMAIL_FROM`. Both registration verification and password reset use `APP_URL` to build links. Confirm that links resolve to the public HTTPS domain and that delivery succeeds for a test mailbox.

Password-reset tokens are hashed in the database, expire after 30 minutes, and are consumed once. MFA remains enabled after a password reset.

## 7. Health checks, release checks, and operations

- Configure platform health checks to use `GET /api/health`. It returns HTTP 200 only when the application can reach PostgreSQL and HTTP 503 otherwise; it does not expose database details.
- Require the CI workflow to pass for the exact commit being deployed. Review CodeQL and dependency-review findings before release.
- Apply database migrations before the web/worker rollout.
- Verify registration, email verification, password reset, MFA enrollment/sign-in/recovery, tenant isolation, CSV import, provider sync, and worker graceful shutdown in staging.
- Monitor worker logs, failed sync jobs, provider throttling, email delivery, PostgreSQL capacity, and rate-limit events. Never log bearer tokens, passwords, reset links, or cloud credentials.
- Enable automated database backups and periodically test point-in-time restore. Define retention and incident-response ownership before onboarding customer billing data.

## 8. Go-live acceptance checklist

- [ ] Production domain uses HTTPS and correct `APP_URL`, `AUTH_URL`, and `NEXT_PUBLIC_APP_URL`.
- [ ] Stable production `AUTH_SECRET` is configured on every web instance.
- [ ] Resend domain and sender are verified; test verification and reset emails are delivered.
- [ ] All committed Prisma migrations are applied by the migration role.
- [ ] Web database role is least privilege and does not bypass RLS.
- [ ] Worker uses a separate non-superuser `BYPASSRLS` role and is not exposed publicly.
- [ ] Vault/custom resolver is reachable only from the worker and scoped to required secret paths.
- [ ] AWS/Azure/GCP read-only credentials are tested against live billing data.
- [ ] CI and CodeQL pass for the exact deployed commit.
- [ ] Health checks, backups, restore test, logs, alerts, and incident contacts are configured.
