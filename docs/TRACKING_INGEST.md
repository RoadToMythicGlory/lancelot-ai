# BLE Equipment Tracking — Ingest Protocol

This document describes how BLE gateways push tag readings to the Lancelot platform.

## Overview

Equipment items are tagged with **Minew E8** BLE beacons (or any compatible BLE advertising device). BLE gateways listen for advertising packets and forward them to the platform via **MQTT** (primary) or **HTTPS** (fallback).

The API gateway subscribes to the MQTT broker, persists readings, computes positions, and pushes live updates to the web UI via GraphQL subscriptions.

## Architecture

```
BLE Tag  --(BLE adv)-->  BLE Gateway  --(MQTT / HTTPS)-->  api-gateway  -->  MongoDB + GraphQL WS --> UI
```

## MQTT topic structure

Prefix: configured via `MQTT_TOPIC_PREFIX` env var (default: `lancelot/tracking`).

| Topic | Direction | Description |
|---|---|---|
| `lancelot/tracking/<gatewayKey>/readings` | GW -> Broker | Batch of tag readings |
| `lancelot/tracking/<gatewayKey>/heartbeat` | GW -> Broker | Gateway heartbeat (empty payload OK) |

`<gatewayKey>` is the unique identifier assigned to each gateway when it is registered in the admin panel. It serves as both the MQTT topic segment and the HTTP Bearer token.

## Payload format (readings)

```json
{
  "ts": "2026-05-13T14:01:23Z",
  "readings": [
    {
      "mac": "AC:23:3F:AA:BB:01",
      "rssi": -62,
      "battery": 87,
      "temperature": 24.1
    },
    {
      "mac": "AC:23:3F:AA:BB:02",
      "rssi": -78,
      "battery": 45
    }
  ],
  "gatewayLocation": {
    "lat": 32.0853,
    "lng": 34.7818,
    "accuracyMeters": 8.0
  }
}
```

### Field reference

| Field | Required | Type | Description |
|---|---|---|---|
| `ts` | Yes | ISO 8601 string | Timestamp of the reading batch |
| `readings` | Yes | Array | One entry per tag heard in this scan cycle |
| `readings[].mac` | Yes | String | BLE MAC address (colon-separated, case-insensitive) |
| `readings[].rssi` | Yes | Number | Received signal strength (dBm, typically -30 to -100) |
| `readings[].battery` | No | Number | Battery percentage (0–100) |
| `readings[].temperature` | No | Number | Ambient temperature (Celsius) |
| `gatewayLocation` | No | Object | Only sent by **mobile** gateways (vehicles, phones) |
| `gatewayLocation.lat` | Yes* | Number | Latitude |
| `gatewayLocation.lng` | Yes* | Number | Longitude |
| `gatewayLocation.accuracyMeters` | No | Number | GPS accuracy estimate |

\* Required within `gatewayLocation` if the object is present.

## HTTPS fallback endpoint

For gateways or phone scanner apps that cannot use MQTT:

```
POST /api/tracking/ingest
Authorization: Bearer <gatewayKey>
Content-Type: application/json

(same JSON body as the MQTT payload)
```

Response:

```json
{
  "success": true,
  "processed": 2,
  "skipped": 0
}
```

## Gateway provisioning

1. Open the Warehouse page -> "מעקב חי" tab -> "ניהול" sub-tab.
2. Create a **Site** (warehouse / studio) with floor dimensions and optionally a floor-plan image URL.
3. Create a **Gateway** under that site:
   - **gatewayKey**: a unique string (e.g., `gw-warehouse-01`). This is used as the MQTT topic segment and HTTP Bearer token.
   - **kind**: `fixed` (stationary in the warehouse) or `mobile` (vehicle / phone).
   - **position (x, y)**: for fixed gateways, the position in meters on the floor plan.
   - **zoneName**: human-readable zone label (e.g., "Entrance", "Rack A").
4. Configure the physical gateway to publish to `lancelot/tracking/<gatewayKey>/readings`.

## Tag registration

1. Open any equipment item's details modal.
2. Click "קשר תגית" (Bind Tag) in the BLE Live Location section.
3. Enter the Minew E8's BLE MAC address (printed on the tag label, format: `AC:23:3F:AA:BB:01`).
4. The tag is now bound to the equipment item and will appear on the live tracking map.

## Position computation

### Indoor (fixed gateways)

The system uses a **zone-based "loudest RSSI wins"** strategy:

- When multiple fixed gateways hear the same tag within a 10-second window, the reading with the strongest RSSI determines the tag's position.
- The tag is placed at the gateway's configured `(x, y)` position on the floor plan.
- The `zoneName` of the winning gateway is displayed as the tag's location.

Trilateration using 3+ gateways with calibrated RSSI-to-distance models is planned for a future phase.

### Outdoor (mobile gateways)

- The tag's position is the GPS coordinates (`lat`, `lng`) reported by the mobile gateway in `gatewayLocation`.
- No signal-based positioning is done — the tag is simply "near this vehicle/phone".

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `MQTT_BROKER_URL` | `mqtt://localhost:1883` | MQTT broker connection URL |
| `MQTT_USERNAME` | (empty) | MQTT broker username |
| `MQTT_PASSWORD` | (empty) | MQTT broker password |
| `MQTT_TOPIC_PREFIX` | `lancelot/tracking` | Prefix for all tracking MQTT topics |
| `TRACKING_RETENTION_DAYS` | `30` | How long to retain raw readings (TTL index) |
| `TRACKING_STALE_THRESHOLD_SECONDS` | `300` | Seconds after which a tag is considered "stale" |
| `ENABLE_TRACKING` | `true` | Set to `false` to disable MQTT connection |

## Local development with Mosquitto

A Docker Compose file is provided for running a local MQTT broker:

```bash
docker-compose -f docker-compose.tracking.yml up -d
```

This starts a Mosquitto broker on port 1883. No authentication is required in local dev mode.

### Simulating gateway readings

You can publish test readings using any MQTT client:

```bash
# Using mosquitto_pub (install: brew install mosquitto or apt install mosquitto-clients)
mosquitto_pub -h localhost -t "lancelot/tracking/gw-test-01/readings" -m '{
  "ts": "2026-05-13T14:01:23Z",
  "readings": [
    { "mac": "AC:23:3F:AA:BB:01", "rssi": -55, "battery": 92, "temperature": 23.5 }
  ]
}'

# Or using curl via the HTTPS fallback:
curl -X POST http://localhost:4000/api/tracking/ingest \
  -H "Authorization: Bearer gw-test-01" \
  -H "Content-Type: application/json" \
  -d '{"ts":"2026-05-13T14:01:23Z","readings":[{"mac":"AC:23:3F:AA:BB:01","rssi":-55,"battery":92}]}'
```

## MongoDB collections

| Collection | Purpose | TTL |
|---|---|---|
| `tracker_tags` | Registered BLE tags, bound to equipment | — |
| `tracker_sites` | Warehouse/studio definitions + floor plans | — |
| `tracker_gateways` | BLE gateway registrations | — |
| `tracker_readings` | Raw reading stream | 30 days (configurable) |
| `tracker_latest_positions` | Denormalized "where is each tag now?" | — |
