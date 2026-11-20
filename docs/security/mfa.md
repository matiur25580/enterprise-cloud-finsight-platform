# Multi-factor authentication (MFA)

FinSight supports authenticator-app MFA for password-based accounts.

## Enable MFA

1. Sign in with a verified email address.
2. Open **Account security** from the workspace header, or visit `/account/security`.
3. Re-enter the current password to begin enrollment.
4. Add the displayed secret to an authenticator app that supports standard TOTP.
5. Enter the current six-digit code and confirm.
6. Save the ten recovery codes in a password manager or another secure location.

The TOTP setup secret is shown only during enrollment. Recovery codes are shown only once after enabling MFA or rotating them.

## Sign in and recover access

When MFA is enabled, password sign-in requires either:
- a valid six-digit authenticator code; or
- one unused recovery code.

Each recovery code is single-use. If codes are lost or exposed, sign in with an available factor and rotate them from Account security. Rotation invalidates every previous recovery code. Disabling MFA requires the current password and a valid authenticator or unused recovery code.

## Security implementation

- TOTP follows RFC 6238: SHA-1, six digits, 30-second period, and a one-step clock-skew tolerance.
- TOTP secrets are encrypted at rest with AES-256-GCM. The encryption key is derived from `AUTH_SECRET`; keep this secret stable across deployments and backups.
- Recovery codes contain 64 bits of random entropy. Only SHA-256 hashes are stored.
- TOTP time steps are stored per user and consumed with a conditional atomic database update. A six-digit code can be accepted only once, including under concurrent sign-in attempts.
- Recovery-code consumption is an atomic database update, preventing the same code from being used twice concurrently.
- MFA enrollment records the confirmation code's time step, preventing that same code from immediately being reused for sign-in.
- MFA disable uses a compare-and-set update against the exact encrypted secret and enabled timestamp that were verified. If the configuration changes concurrently, the stale disable request returns HTTP 409 and does not delete recovery codes.
- Enrollment, confirmation, rotation, and disable operations require password reauthentication.
- Existing accounts are not forced to enable MFA. Email verification remains a separate requirement for new registrations.

Apply the schema migration during deployment using `npx prisma migrate deploy`. Keep `AUTH_SECRET` configured on every web instance; changing it without a coordinated key migration will make existing encrypted MFA secrets unreadable.

The persisted TOTP time-step counter uses PostgreSQL `BIGINT` / Prisma `BigInt` to avoid 32-bit integer overflow over the lifetime of the service. The counter is converted to a JavaScript `bigint` only at the database boundary; it is not exposed in API responses.

MFA setup, confirmation, and disable endpoints also enforce an account-scoped 10-attempt/15-minute quota in addition to the client-network quota. The account bucket uses a keyed digest and does not persist the user identifier.

## MFA security audit trail

Account-level MFA events are stored in `user_security_events`, independently of workspace membership. The trail records setup initiation, successful MFA enable/disable, recovery-code rotation, and selected failed reauthentication or factor-verification attempts. Each record contains only the account ID, a fixed event type, success/failure outcome, an allow-listed reason code, and timestamp. Passwords, TOTP values, recovery codes, encrypted secrets, request bodies, and network addresses are never stored in these audit records. Audit writes are best-effort and do not change the result of an MFA operation.
