# Password reset and account recovery

FinSight provides email-based password reset for password accounts.

## User flow

1. From the sign-in page, choose **Forgot your password?**.
2. Submit the account email address at `/forgot-password`.
3. If a password-based account exists, the application sends a one-time link.
4. Open the link at `/reset-password` and choose a password of at least 12 characters.
5. Sign in with the new password and the existing MFA factor, if enabled.

## Security properties

- Reset tokens contain 256 bits of random entropy and only their SHA-256 digests are stored.
- Tokens expire after 30 minutes and are consumed atomically exactly once.
- Request responses do not disclose whether an email address belongs to an account.
- Forgot-password and reset-password requests have independent persistent IP-based rate-limit buckets.
- New reset requests invalidate earlier outstanding reset links for that account.
- Password reset does not disable MFA or regenerate recovery codes. Email access alone cannot bypass a configured second factor.
- Existing signed-in sessions are not forcibly revoked by this flow; Auth.js JWT sessions expire within the configured eight-hour maximum age. Users should sign out of other devices after a suspected compromise.

## Required environment

Configure the same verified Resend sender used for email verification:

- `RESEND_API_KEY`
- `EMAIL_FROM`
- `APP_URL` (or `NEXT_PUBLIC_APP_URL`)

Production `APP_URL` must use HTTPS. Never place provider API keys in browser-visible variables.

No database migration is needed for this feature beyond the committed `password_reset_tokens` migration. Apply it with `npm run db:deploy` before deploying.
