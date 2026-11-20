# Email verification setup

New registrations must verify ownership of their email address before password sign-in is allowed.

## Configure delivery

1. Create a Resend account and verify a sending domain.
2. Create an API key with permission to send email.
3. Set these environment variables on the **web application**:
   - `RESEND_API_KEY`: Resend API key.
   - `EMAIL_FROM`: sender identity on the verified domain, for example `FinSight <no-reply@example.com>`.
   - `APP_URL`: canonical public application origin. Use HTTPS in production.
4. Apply database migrations with `npx prisma migrate deploy`, then regenerate Prisma Client as part of the normal deployment build.

Registration intentionally returns HTTP 503 before creating an account if email delivery is not configured. If the provider is temporarily unavailable after an account is created, the account remains unverified and the user can request another message from `/verify-email`.

## Security behavior

- Verification tokens contain 256 bits of random entropy. Only their SHA-256 digests are stored.
- Tokens expire after 30 minutes and are consumed once in a database transaction.
- Issuing a replacement token invalidates previous tokens for that user.
- Resend requests are rate limited independently by client address and return a generic response to avoid disclosing whether an email is registered.
- The credentials provider refuses password sign-in until `email_verified` is set.
- Existing users are marked verified by the migration using their original account creation timestamp, preventing an unexpected lockout during rollout.
- Do not expose Resend credentials in client-side environment variables. Configure them only on the server-side web service.

The email sender must be an address/domain verified by Resend. Delivery depends on the deployment's Resend account, DNS, sender approval, and configured environment variables.
