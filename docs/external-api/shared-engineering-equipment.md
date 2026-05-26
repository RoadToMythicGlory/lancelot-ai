# Lancelot External API — Shared Engineering Equipment (reference)

Full payload reference for the read-only REST + webhook surface that
exposes Lancelot's "ציוד הנדסה שיתופי" (shared engineering equipment)
data to partner dashboards.

> **New here?** Start with [README.md](./README.md) — it has the operator
> setup checklist and a copy-paste partner quickstart. Come back here for
> the field-by-field reference.

- **Base URL** — `https://api.lanceloterp.io/api/v1/external`
- **OpenAPI spec** — `GET /api/v1/external/openapi.yaml` (no auth)
- **Liveness probe** — `GET /api/v1/external/healthz` (no auth)

## Authentication

Every request (except `/healthz` and `/openapi.yaml`) must include the
`X-API-Key` header:

```http
GET /api/v1/external/shared-engineering-equipment HTTP/1.1
Host: api.lanceloterp.io
X-API-Key: lnc_partner_xxxxxxxxxxxxxxxxxxxxxxxx
```

Keys are configured server-side via the `VALID_API_KEYS` environment
variable (comma-separated). The middleware performs a constant-time
compare so the response time can't be used as a guessing oracle.

Failures:

- `401 Unauthorized` — missing or invalid key
- `429 Too Many Requests` — quota exceeded (default 120 req/minute per key)
- `503 Service Unavailable` — `VALID_API_KEYS` is empty on the server

## Endpoints

### `GET /shared-engineering-equipment`

Paginated list of all flagged devices. Each row contains everything the
in-app "ציוד הנדסה שיתופי" tab shows, plus optional BLE live position.

**Query parameters**

| Name | Type | Description |
|------|------|-------------|
| `status` | enum | `available` \| `assigned` \| `maintenance` \| `broken` |
| `category` | string | Category slug (e.g. `cameras`) |
| `assignedTo` | enum | `event` \| `staff` \| `none` |
| `updatedSince` | ISO-8601 | Only return devices changed at or after this time |
| `cursor` | string | Pagination cursor — pass `meta.nextCursor` from the previous response |
| `limit` | integer | Default 100, max 500 |

**Response**

```json
{
  "data": [
    {
      "id": "65fa1b2c3d4e5f6789012345",
      "name": "Sony FX6",
      "barcode": "CAM-2026-0007",
      "category": "cameras",
      "categoryLabelHe": "מצלמות",
      "brand": "Sony",
      "equipmentModel": "FX6",
      "imageUrl": "https://…/fx6.jpg",
      "manualLink": null,
      "status": "assigned",
      "suspensionStatus": null,
      "condition": "good",
      "isDisabled": false,
      "disabledReason": null,
      "quantityTotal": 1,
      "quantityAvailable": 0,
      "quantityAssigned": 1,
      "isQuantityBased": false,
      "isSharedEngineeringEquipment": true,
      "location": {
        "kind": "event",
        "assignmentId": "…",
        "broadcastEventId": "…",
        "broadcastEventTitle": "Hapoel TLV vs Maccabi Haifa",
        "broadcastEventStart": "2026-06-12T17:00:00.000Z",
        "broadcastEventEnd": "2026-06-12T21:00:00.000Z",
        "broadcastEventVenue": "Bloomfield",
        "broadcastEventLocation": "Tel Aviv",
        "mcrEventId": "…",
        "assignedAt": "2026-06-12T13:30:00.000Z",
        "assignedByName": "Idan M."
      },
      "livePosition": {
        "kind": "outdoor",
        "siteId": null,
        "gatewayId": "…",
        "gatewayName": "Truck A",
        "zoneName": null,
        "x": null,
        "y": null,
        "lat": 32.0852,
        "lng": 34.7704,
        "rssi": -68,
        "batteryPct": 87,
        "confidence": 0.46,
        "computedAt": "2026-06-12T18:11:42.000Z"
      },
      "contact": {
        "primary": "Idan Mizrahi — [PHONE REDACTED]",
        "currentHolderName": "Idan M.",
        "currentHolderPhone": null
      },
      "warrantyExpiryDate": "2027-04-15T00:00:00.000Z",
      "purchaseDate": "2025-04-15T00:00:00.000Z",
      "priceIls": 18999,
      "assignmentHistoryCount": 1,
      "lastUsedAt": "2026-06-12T13:30:00.000Z",
      "createdAt": "2025-04-15T08:00:00.000Z",
      "updatedAt": "2026-06-12T13:30:00.000Z",
      "_links": {
        "self": "https://api.lanceloterp.io/api/v1/external/shared-engineering-equipment/65fa1b2c3d4e5f6789012345",
        "history": "https://api.lanceloterp.io/api/v1/external/shared-engineering-equipment/65fa1b2c3d4e5f6789012345/history",
        "assignments": "https://api.lanceloterp.io/api/v1/external/shared-engineering-equipment/65fa1b2c3d4e5f6789012345/assignments"
      }
    }
  ],
  "meta": {
    "nextCursor": "65fa1b2c3d4e5f6789012345",
    "total": 247,
    "generatedAt": "2026-06-12T18:30:00.000Z"
  }
}
```

The `location.kind` discriminator tells the dashboard whether the device
is currently in a warehouse (`warehouse`), checked out to an event
(`event`), or checked out to a staff member (`staff`).

The fourth value, `unknown`, is reserved for items that are intentionally
out of rotation — `status` of `maintenance`, `broken`, `lost`, `retired`,
or `damaged`. **A returned item never has `kind: 'unknown'`**: even when
its warehouse / storage place have never been pinned (so `warehouseId`,
`storagePlaceId`, `currentLocation` are all `null`), the discriminator
will still be `warehouse`. In other words, `kind === 'warehouse'` means
"presumed in our possession", not "we have a precise shelf for it".

The top-level `status` is likewise derived from the active assignment
state, not the denormalized `equipment.status` field — so a fully
returned item always reports `status: 'available'` even if a stale write
left the legacy field saying otherwise.

### `GET /shared-engineering-equipment/snapshot`

Uncapped full dump. Use this for the dashboard's initial load and the
nightly resync. Response shape is identical to the list endpoint but
without `meta.nextCursor`. The gateway gzip-encodes the body
automatically when the client sends `Accept-Encoding: gzip`.

### `GET /shared-engineering-equipment/:id`

Single device lookup. Returns `404 Not Found` if the id is unknown or
doesn't belong to a shared engineering item.

### `GET /shared-engineering-equipment/:id/history`

Returns the assignment + status audit trail for one device. Capped at
500 rows (most recent first); use `?limit=` to lower the page size.

### `GET /webhooks/deliveries`

Diagnostic endpoint — confirms whether outbound webhook events are
reaching the partner's URL. Query parameters:

| Name | Type | Description |
|------|------|-------------|
| `status` | enum | `pending` \| `retrying` \| `success` \| `failed` \| `all` |
| `since` | ISO-8601 | Only return deliveries created at or after this time |
| `limit` | integer | Default 100, max 500 |

## Webhooks (push notifications)

When `EXTERNAL_WEBHOOK_ENABLED=true` is set on the Lancelot server,
state-change events are pushed to `EXTERNAL_WEBHOOK_URL` over HTTPS POST.

### Event types

| Event | When it fires |
|-------|---------------|
| `equipment.created` | A new shared engineering item is added to the catalog |
| `equipment.updated` | Any field on a shared engineering item changes, including disable/enable, condition, contact, status |
| `equipment.deleted` | A shared engineering item is hard-deleted |
| `equipment.assigned` | The item is checked out to a broadcast event or a staff member (event/transfer triggers a fresh push) |
| `equipment.returned` | The item is returned to the warehouse |
| `equipment.location.changed` | A bound BLE tracker emitted a new position (debounced to ≤ 1 push/min per tag) |

### Payload

```json
{
  "event": "equipment.assigned",
  "deliveryId": "e2f1b8a4-…",
  "timestamp": "2026-06-12T13:30:00.123Z",
  "data": { "…": "same shape as the REST device row" }
}
```

The `data` field is **identical** to the row returned by
`GET /shared-engineering-equipment/:id`. This guarantees that the
dashboard never needs to special-case webhook payloads vs REST responses.

For `equipment.deleted`, `data` is a tombstone:

```json
{
  "id": "65fa1b2c3d4e5f6789012345",
  "barcode": "CAM-2026-0007",
  "name": "Sony FX6",
  "deletedAt": "2026-06-12T13:30:00.123Z"
}
```

### Headers

| Header | Value |
|--------|-------|
| `Content-Type` | `application/json` |
| `X-Lancelot-Event` | The event type (see table above) |
| `X-Lancelot-Delivery` | UUID for this delivery; reuse it on retries |
| `X-Lancelot-Signature` | `sha256=<hex>` — HMAC-SHA256 of the raw body with `EXTERNAL_WEBHOOK_SECRET` |
| `X-Lancelot-Timestamp` | ISO-8601 timestamp the payload was signed |
| `User-Agent` | `Lancelot-Webhook/1.0` |

### Retry policy

- 3 attempts total per delivery
- Exponential backoff: immediate, +5s, +30s, +5m
- `2xx` → success
- `5xx` and `429` → retried until attempt budget is exhausted
- Other `4xx` → permanent failure, never retried

Every attempt is persisted in the `WebhookDelivery` collection so the
operator (and the partner via `GET /webhooks/deliveries`) can see the
delivery history.

### Verifying the signature

**Node.js**

```js
import crypto from 'crypto';

function verifyLancelotSignature(req, secret) {
  const header = req.headers['x-lancelot-signature'] || '';
  const [scheme, theirs] = header.split('=');
  if (scheme !== 'sha256' || !theirs) return false;
  const ours = crypto.createHmac('sha256', secret).update(req.rawBody).digest('hex');
  // Constant-time compare to avoid timing side-channels
  return crypto.timingSafeEqual(Buffer.from(theirs), Buffer.from(ours));
}
```

Make sure your Express app captures the raw body so the HMAC is computed
over the same bytes Lancelot signed:

```js
app.use(express.json({
  verify: (req, _res, buf) => { req.rawBody = buf.toString('utf8'); },
}));
```

**Python**

```python
import hmac, hashlib

def verify_lancelot_signature(headers, raw_body: bytes, secret: str) -> bool:
    header = headers.get('X-Lancelot-Signature', '')
    if not header.startswith('sha256='):
        return False
    theirs = header.split('=', 1)[1]
    ours = hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(theirs, ours)
```

## Rate limiting

Each API key has its own bucket. Default: **120 requests / minute**.
Tune via `EXTERNAL_API_RATE_LIMIT_PER_MIN` on the server.

The standard rate-limit headers are returned on every response:

- `RateLimit-Limit`
- `RateLimit-Remaining`
- `RateLimit-Reset`

When a key exceeds its quota, `429 Too Many Requests` is returned with
`Retry-After` (seconds).

## Environment variables (server-side)

| Variable | Default | Description |
|----------|---------|-------------|
| `VALID_API_KEYS` | _(empty)_ | Comma-separated list of valid API keys. The endpoint returns 503 if empty. |
| `EXTERNAL_API_RATE_LIMIT_PER_MIN` | `120` | Per-key request budget |
| `EXTERNAL_API_BASE_URL` | _(empty)_ | Used to build absolute `_links` in webhook payloads when the request context isn't available. Example: `https://api.lanceloterp.io` |
| `EXTERNAL_WEBHOOK_ENABLED` | `false` | Master switch for outbound webhooks |
| `EXTERNAL_WEBHOOK_URL` | _(empty)_ | Where to POST events |
| `EXTERNAL_WEBHOOK_SECRET` | _(empty)_ | HMAC secret used to sign payloads |
| `EXTERNAL_WEBHOOK_TIMEOUT_MS` | `15000` | Per-attempt HTTP timeout |
| `EXTERNAL_WEBHOOK_RETRY_INTERVAL_MS` | `15000` | How often the retry worker sweeps |
| `EXTERNAL_WEBHOOK_LOCATION_DEBOUNCE_MS` | `60000` | Minimum time between two `equipment.location.changed` pushes for the same tracker |

## Recipes

### Initial load + live updates

1. `GET /shared-engineering-equipment/snapshot` once on startup
2. Configure your `EXTERNAL_WEBHOOK_URL` to receive change events
3. Apply incoming webhook payloads (use `data.id` as the upsert key)
4. Periodically (e.g. every 30 minutes) call `GET /shared-engineering-equipment?updatedSince=<lastSync>` to catch anything you missed

### Filtering by current holder

```http
GET /shared-engineering-equipment?assignedTo=event&limit=500
```

Returns only the devices currently checked out to a broadcast event.

### Checking webhook delivery health

```http
GET /webhooks/deliveries?status=failed
```

Returns recent failures with the last error message and HTTP status — handy
when debugging "why didn't I get the event?".
