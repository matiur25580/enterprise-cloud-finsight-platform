# Public registration request protection

The public `POST /api/register` endpoint applies two independent controls before account creation:

- **Address quota:** at most 5 registration attempts per client address in a fixed 60-minute window. The persistent PostgreSQL bucket key is an HMAC-SHA256 digest; raw addresses are not stored in the rate-limit key.
- **Bounded JSON input:** request bodies are read incrementally and capped at 8 KiB. This applies even when a client omits `Content-Length` and streams the body in chunks.

Responses:

| Condition | HTTP status |
|---|---:|
| Invalid JSON or invalid UTF-8 | 400 |
| Body exceeds 8 KiB | 413 |
| Registration quota exceeded | 429 with `Retry-After` |
| Rate-limit storage/address protection unavailable | 503 |

The endpoint fails closed if it cannot enforce the rate limit. Production deployments must configure a strong `AUTH_SECRET` (at least 32 characters) and ensure the reverse proxy overwrites forwarded client-address headers; otherwise clients could spoof the address used for the quota. The same persistent rate-limit table is shared with existing authentication controls.

The request-size cap is intentionally larger than the maximum accepted registration fields while keeping untrusted payload buffering bounded.


## Login abuse protection

Credential sign-in requests are limited to 10 attempts per 15-minute window independently by client network address and by the normalized account identifier supplied with the request. Account identifiers are trimmed and lowercased before deriving a keyed HMAC bucket identifier; raw email addresses are not written to the rate-limit table. Both quotas use the shared database-backed fixed-window counter and fail closed if the rate-limit store is unavailable. The account quota complements, rather than replaces, network-based throttling.
