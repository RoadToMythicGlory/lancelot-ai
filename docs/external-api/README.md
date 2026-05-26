# Lancelot External API — How To Use

A read-only REST + webhook surface that lets a partner dashboard (hosted
outside Lancelot) consume the "ציוד הנדסה שיתופי" (shared engineering
equipment) data and react in near real-time to changes.

Two transports, one data source:

```
                                                ┌─────────────────────────┐
GET /api/v1/external/...  ─── X-API-Key ───────►│                         │
                                                │  Lancelot API Gateway   │
POST {webhook url}  ───── X-Lancelot-Sig ◄──────│                         │
                                                └─────────────────────────┘
```

- The same aggregator drives both surfaces, so the JSON shape is identical
  whether the partner pulls via REST or receives a webhook push.
- The in-app "ציוד הנדסה שיתופי" tab uses the same aggregator under the
  hood, so the partner dashboard and Lancelot can never drift.

## Architecture — where things live

Lancelot's production setup splits the UI from the API onto different
subdomains. **Partners always talk to the API subdomain, not the UI one.**

| Domain | What it is | Used by partners? |
|--------|------------|-------------------|
| **`api.lanceloterp.io`** | API gateway (GraphQL + REST, including `/api/v1/external/*`) and the MongoDB source of truth. This is what the new external API is mounted on. | **Yes — this is the base URL** |
| `app.lanceloterp.io` | Lancelot tenant's Next.js web app (the UI internal staff browse to). Proxies its own API calls to `api.lanceloterp.io`. | No |
| `lanceloterp.io` / `www.lanceloterp.io` | Separate landing/marketing site. | No |

The data lives in the API gateway's Mongo and is served by `api.lanceloterp.io`.
`app.lanceloterp.io` is just the UI Lancelot staff use; under the hood
their browser calls `api.lanceloterp.io` too (see [apps/web/server.js](../../apps/web/server.js) `proxyToApi`).

So when you give a partner the base URL, it's always:

```
https://api.lanceloterp.io/api/v1/external
```

never `Lancelot.…` and never the bare `lanceloterp.io`.

## Document index

| File | Audience | Purpose |
|------|----------|---------|
| **README.md** (this file) | Operators + partner devs | Setup, quickstart, troubleshooting |
| [shared-engineering-equipment.md](./shared-engineering-equipment.md) | Partner devs | Full payload reference, HMAC verification examples |
| [`services/api-gateway/openapi/external.yaml`](../../services/api-gateway/openapi/external.yaml) | Tooling | Machine-readable OpenAPI 3.1 spec (also served at `GET /api/v1/external/openapi.yaml`) |

---

## Part 1 — Operator setup (Lancelot side)

Do this once before handing the API off to a partner.

### 1. Generate an API key

```bash
openssl rand -hex 32
# → 7c1d…e9a (64 hex chars)
```

Pick a memorable label for the partner and consider prefixing the key so
logs are readable:

```
lnc_rge_7c1d…e9a
```

You can issue multiple keys (one per partner) — they go in a single
comma-separated env var.

### 2. (Optional) Generate a webhook secret

Only needed if you also want to push change events.

```bash
openssl rand -hex 32
```

### 3. Set env vars on the API-Gateway host

Append to `.env.production` (or your secret manager):

```env
# REST API
VALID_API_KEYS=lnc_rge_7c1d…e9a,lnc_otherpartner_abcd…1234
EXTERNAL_API_RATE_LIMIT_PER_MIN=120
EXTERNAL_API_BASE_URL=https://api.lanceloterp.io

# Webhooks (optional)
EXTERNAL_WEBHOOK_ENABLED=true
EXTERNAL_WEBHOOK_URL=https://dashboard.partner.com/lancelot/webhook
EXTERNAL_WEBHOOK_SECRET=<the openssl rand output from step 2>
```

Full env-var reference: see [shared-engineering-equipment.md → Environment variables](./shared-engineering-equipment.md#environment-variables-server-side).

### 4. Restart the API gateway

```bash
# Docker compose
docker compose restart api-gateway

# Bare-metal / PowerShell
./restart-api-gateway.ps1
```

You should see this in the startup log:

```
🪝 External webhook delivery worker started
```

### 5. Smoke test

From the API-Gateway host:

```bash
curl -s http://localhost:4000/api/v1/external/healthz
# {"status":"ok","service":"lancelot-external-api","version":"v1",…}

curl -s -H "X-API-Key: lnc_rge_7c1d…e9a" \
  "http://localhost:4000/api/v1/external/shared-engineering-equipment?limit=1" \
  | jq '.data[0] | {id, name, status, location: .location.kind}'
```

If you get a valid row back: you're done.

### 6. (Only if the partner calls from a browser) Whitelist their origin

If the partner dashboard is a server-side process (Node, Python, etc.)
calling `api.lanceloterp.io` directly, **skip this step** — CORS doesn't
apply.

If they call it from browser JavaScript, add their origin to
`CORS_ALLOWED_ORIGINS` so the browser doesn't block the response:

```env
CORS_ALLOWED_ORIGINS=https://lanceloterp.io,https://app.lanceloterp.io,https://dashboard.partner.com
```

Restart the gateway after editing.

### 7. Hand off to the partner

Send the partner:

- The base URL (`https://api.lanceloterp.io/api/v1/external`) — emphasize
  the **`api.`** prefix; they may know Lancelot only by `app.lanceloterp.io`
- Their API key
- A link to [shared-engineering-equipment.md](./shared-engineering-equipment.md)
- (If webhooks are on) the HMAC secret, delivered through a different
  channel than the API key

### Rotating a key

1. Add the new key to `VALID_API_KEYS` (append, comma-separated)
2. Restart the gateway
3. Give the new key to the partner
4. Once the partner has switched, remove the old key
5. Restart again

The hardened `validateApiKey` middleware does a constant-time compare so
the rotation window can be as long as you want — no measurable difference
between 1 valid key and 10.

### Why is the gateway not on `app.lanceloterp.io`?

Two reasons:

1. **Separation of concerns** — the Lancelot UI is served from cPanel
   ([apps/web/server.js](../../apps/web/server.js), which proxies API
   calls to `api.lanceloterp.io`), while the API gateway runs on a
   different host fronted by [nginx-example.conf](../../nginx-example.conf).
   Mounting partner-facing routes on the gateway means we don't have to
   route partner traffic through cPanel's web tier.
2. **Tenant cleanliness** — if a second Lancelot tenant is added later
   (e.g. `<other>.lanceloterp.io`), the partner contract (`api.lanceloterp.io/api/v1/external/...`)
   stays the same; tenancy is resolved server-side from the API key.

---

## Part 2 — Partner quickstart (consumer side)

For developers building the external dashboard. **Five minutes to first
response.**

### Step 1 — Sanity check (no auth needed)

```bash
curl -s https://api.lanceloterp.io/api/v1/external/healthz
```

Expected:

```json
{ "status": "ok", "service": "lancelot-external-api", "version": "v1", "timestamp": "…" }
```

If you see anything else, the gateway is unreachable. Talk to your
Lancelot contact before going further.

### Step 2 — First authenticated call

```bash
export LANCELOT_API_KEY="lnc_rge_7c1d…e9a"
export LANCELOT_BASE="https://api.lanceloterp.io/api/v1/external"

curl -s -H "X-API-Key: $LANCELOT_API_KEY" \
  "$LANCELOT_BASE/shared-engineering-equipment?limit=3" | jq .
```

Expected: a `{ data: [...], meta: { nextCursor, total, generatedAt } }`
response. If you get `401`, double-check the header name and the key.

### Step 3 — Full initial load

```bash
curl -s -H "X-API-Key: $LANCELOT_API_KEY" \
  "$LANCELOT_BASE/shared-engineering-equipment/snapshot" \
  > snapshot.json

jq '.meta' snapshot.json
# { "total": 247, "generatedAt": "…" }
```

This is what your dashboard should call on first load. Each row in
`data[]` has everything the in-app MCR tab shows — see
[shared-engineering-equipment.md](./shared-engineering-equipment.md) for
the full field reference.

### Step 4 — Incremental sync

After the initial load, poll for changes since the last fetch:

```bash
curl -s -H "X-API-Key: $LANCELOT_API_KEY" \
  "$LANCELOT_BASE/shared-engineering-equipment?updatedSince=2026-06-12T18:00:00.000Z&limit=500" \
  | jq '.data | length'
```

Recommended cadence:

- **With webhooks on**: poll every 30 minutes as a safety net
- **Without webhooks**: poll every 1–2 minutes

### Step 5 — Inspect a single device

```bash
curl -s -H "X-API-Key: $LANCELOT_API_KEY" \
  "$LANCELOT_BASE/shared-engineering-equipment/65fa1b2c3d4e5f6789012345" \
  | jq '.data | {name, status, holder: .contact.currentHolderName, position: .livePosition}'
```

### Step 6 — Get the assignment history

```bash
curl -s -H "X-API-Key: $LANCELOT_API_KEY" \
  "$LANCELOT_BASE/shared-engineering-equipment/65fa1b2c3d4e5f6789012345/history?limit=20" \
  | jq '.data[] | { date, action, by: .performedByName, notes }'
```

### Step 7 — Receive a webhook (only if you opted in)

Expose an HTTPS endpoint on your dashboard server. Express example:

```js
import express from 'express';
import crypto from 'crypto';

const app = express();
const SECRET = process.env.LANCELOT_WEBHOOK_SECRET;

// Capture raw body so the HMAC compare uses identical bytes.
app.use(express.json({
  verify: (req, _res, buf) => { req.rawBody = buf.toString('utf8'); },
}));

app.post('/lancelot/webhook', (req, res) => {
  const sig = req.headers['x-lancelot-signature'] || '';
  const [scheme, theirs] = sig.split('=');
  const ours = crypto.createHmac('sha256', SECRET).update(req.rawBody).digest('hex');
  if (scheme !== 'sha256' ||
      !crypto.timingSafeEqual(Buffer.from(theirs), Buffer.from(ours))) {
    return res.status(401).send('bad signature');
  }
  const { event, data } = req.body;
  console.log(`[${event}] ${data?.name || data?.id}`);
  // Upsert into your local store using `data.id` as the key.
  res.sendStatus(204);
});

app.listen(8080);
```

Python (Flask) and the full payload reference live in
[shared-engineering-equipment.md](./shared-engineering-equipment.md#verifying-the-signature).

### Step 8 — Diagnose webhook problems

If your endpoint is up but you're not seeing pushes:

```bash
curl -s -H "X-API-Key: $LANCELOT_API_KEY" \
  "$LANCELOT_BASE/webhooks/deliveries?status=failed&limit=10" \
  | jq '.data[] | { event, status, attempts, error, responseStatus }'
```

Common cases:

- `responseStatus: 401` — signature mismatch on your side
- `responseStatus: null` + `error: "...timed out..."` — network unreachable
- `responseStatus: 5xx` — your handler is crashing

---

## Part 3 — Troubleshooting

### I get a 404 / a totally different site

You're probably hitting the wrong subdomain. The API lives on
**`api.lanceloterp.io`**, not `app.lanceloterp.io` (the UI) and not
`lanceloterp.io` (a different site entirely). Verify with:

```bash
curl -s https://api.lanceloterp.io/api/v1/external/healthz
```

### `503 Service Unavailable: "No API keys are configured on the server"`

`VALID_API_KEYS` is unset or empty on the gateway. Set it (Part 1, step 3)
and restart.

### `401 Unauthorized` on every call

- Wrong header name. It's `X-API-Key`, not `Authorization`, not `api-key`.
- Trailing whitespace or quote chars in your key.
- The key isn't in `VALID_API_KEYS` on the server (or the server hasn't
  been restarted since you added it).

### `429 Too Many Requests`

You've blown the per-key quota (default 120/min). Either back off and
honour `Retry-After`, or ask your Lancelot contact to raise
`EXTERNAL_API_RATE_LIMIT_PER_MIN`.

### Webhook attempts show in `/webhooks/deliveries` but my server never receives them

- Check the URL in `EXTERNAL_WEBHOOK_URL` — does it resolve from the
  gateway host? (try `curl -v <url>` from the gateway)
- Self-signed TLS cert? The HTTPS client uses Node's defaults; install
  the partner's CA on the gateway host or have them use a public CA.

### I get `equipment.location.changed` constantly when a tag is moving

Increase `EXTERNAL_WEBHOOK_LOCATION_DEBOUNCE_MS` (default 60000 = 1
minute). Webhooks for a single tag are coalesced to at most one push per
debounce window.

### Webhook signatures never match

Most common cause: middleware that re-serializes the body before your
verifier runs. The HMAC is computed over the **raw** bytes Lancelot sent;
if you use `express.json()` without the `verify:` raw-body capture, you
end up signing a re-encoded version that may differ (e.g. key order,
whitespace). See the Express snippet above.

### How do I temporarily turn webhooks off?

Set `EXTERNAL_WEBHOOK_ENABLED=false` and restart. The REST endpoints
keep working; `emitExternalEvent()` becomes a no-op until you flip it
back on.

---

## Part 4 — What's exposed (at a glance)

Per device:

- Identity — `id`, `name`, `barcode`, `category` (+ Hebrew label),
  `brand`, `equipmentModel`, `imageUrl`, `manualLink`
- State — `status`, `suspensionStatus`, `condition`, `isDisabled`,
  quantities (`total` / `available` / `assigned`)
- **Resolved location** (single object — pick one):
  - `kind: "warehouse"` — warehouseName, storagePlaceName + code
  - `kind: "event"` — broadcast event id, title, venue, times, linked MCR event
  - `kind: "staff"` — assignee name + phone
- **Live BLE position** (when a tracker is bound) — indoor x/y or
  outdoor lat/lng + battery + signal strength
- **Contact** — primary contact person + current holder
- Extras — warranty expiry, price, last-used timestamp, links to history
  and assignments

Webhook events:

| Event | Fired when |
|-------|------------|
| `equipment.created` | A new shared engineering item is added |
| `equipment.updated` | Any field changes (status, condition, disable, contact, …) |
| `equipment.deleted` | A shared engineering item is hard-deleted |
| `equipment.assigned` | Item checked out to event or staff (also for transfers) |
| `equipment.returned` | Item returned to warehouse |
| `equipment.location.changed` | BLE tracker emitted a new position (debounced) |
