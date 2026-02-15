# System Impact Ledger

This document tracks every completed phase, its cross-service impact, and
verification status.  It is the single source of truth for validating system
integrity after changes.

> **Rule**: Every future change to this repository must declare which existing
> flows it affects before merging.  See the *Change Freeze / Flow Declaration
> Rule* section below and in `docs/PROJECT_SUMMARY_DEVELOPERS.md`.

Last updated: Feb 10, 2026 (verification run completed)

---

## Per-Phase Impact Template

Copy this block for each new phase entry:

```
### Phase: <name>

**Services touched**: ...
**Env vars added / changed**: ...
**Endpoints added / changed**: ...
**Shared contracts affected** (GraphQL, DTOs, schemas): ...

**Potential breakpoints**:
- Startup: ...
- Cross-service calls: ...
- Background jobs: ...
- Health checks / probes: ...

**Verification performed**:
- Build: PASS / FAIL
- Runtime: PASS / FAIL
- Cross-service flow: PASS / FAIL

**Result**: PASS / ISSUE (notes)
```

---

## Phase Entries

### Phase: Post-Caveats Validation (initial entry)

**Services touched**: ai-agent, api-gateway, web, excel-parser, or-tools-solver
**Env vars added / changed**:
- `SHIFT_SOLVER_ENGINE` (default `ortools`)
- `LEGACY_NEWS_CACHE_ENABLED` (break-glass only)
- `ENABLE_E2EE_CHAT` / `E2EE_FALLBACK_WARNING`
- `RSS_PIPELINE_ENABLED` (default `true`)
- `REDIS_URL` (optional, production multi-instance subscriptions)
- `AI_AGENT_JWT` (service-to-service auth)

**Endpoints added / changed**:
- `GET /health` canonical on ai-agent (port 4001)
- `GET /ai/health` deprecated alias (remove after 2026-06-30)
- `GET /metrics` on ai-agent
- `POST /ai/shifts/solve` (OR-Tools path default)

**Shared contracts affected**:
- GraphQL schema (`schema.graphql`): shift types, availability, employee settings
- Socket.IO chat payload: `encryption` object, `messageType: 'encrypted'`
- OR-Tools solver HTTP contract (`/solve` on port 5003)

**Potential breakpoints**:
- Startup: ai-agent depends on MongoDB + Ollama; api-gateway depends on MongoDB
- Cross-service calls: ai-agent -> api-gateway GraphQL (requires `AI_AGENT_JWT`); ai-agent -> or-tools-solver `/solve`
- Background jobs: RSS feed refresh (ai-agent)
- Health checks / probes: `GET /health` on api-gateway (:4000), ai-agent (:4001), or-tools-solver (:5003)

**Verification performed**:
- Build: PASS (all workspace build commands pass after minimal breakage fixes)
- Runtime: ISSUE (canonical docker-compose stack could not be started: Docker daemon unavailable)
- Cross-service flow: ISSUE (some flows pass, some fail/skip; see matrix)

**Result**: ISSUE (environment/runtime drift + Docker daemon unavailable)

---

## Dependency Sweep Results

Searches executed (repo-wide, excluding `node_modules`, `production-build`, `package-lock.json`):

### `/ai/health`

| Location | Expected | Notes |
|---|---|---|
| `services/ai-agent/src/index.ts:63` | Yes | Deprecated alias route registration |
| `services/ai-agent/src/index.ts:77` | Yes | Listed in root endpoint response |
| `services/ai-agent/README.md:71` | Yes | Deprecation note in docs |
| `docs/Caveats.md:20,22` | Yes | Documented as resolved caveat |
| `docs/PROJECT_SUMMARY_DEVELOPERS.md:302,392` | Yes | Developer summary |
| `ai.txt:1443,1524,1873` | Yes | Master AI doc |

**Verdict**: All hits are expected.  Deprecated alias is still registered with a
removal date of 2026-06-30.  No unexpected consumers.

### `4002` (Excel parser legacy port)

| Location | Expected | Notes |
|---|---|---|
| `services/excel-parser/src/main.ts:76` | Yes | Code default, overridden by `PORT` env |
| `docs/EXCEL_IMPORT_GUIDE.md:11,135` | Yes | Documents both contexts |
| `restart-dev.ps1:36` | Yes | Dev script info line |

**Verdict**: All hits are expected.  `PORT` env override is used in Docker (3002).

### `postgres` (legacy dependency)

| Location | Expected | Notes |
|---|---|---|
| `services/api-gateway/package.json:46` | Known remaining | `pg` is a legacy dep; no source imports it |
| `package.json:31` | Known remaining | Root-level legacy dep |
| `package-lock.json` (multiple) | Known remaining | Lock-file entries for `pg` transitive deps |
| `docs/DOCKER_SECRETS_GUIDE.md` | Known remaining | Generic Docker secrets example |
| `docs/Caveats.md:13-17,25,31-32` | Yes | Documents the caveat as resolved |

**Verdict**: `pg` is a dead dependency.  No source code imports it.  Safe to
remove in a future cleanup, but not required for runtime correctness.

### `SHIFT_SOLVER_ENGINE`

| Location | Expected | Notes |
|---|---|---|
| `services/ai-agent/src/tools/shift-solver.ts:613,616` | Yes | Authoritative: engine selection |
| `docker-compose.yml:96` | Yes | Default `ortools` |
| `docs/Caveats.md:45-46` | Yes | Documented caveat |
| `docs/PROJECT_SUMMARY_DEVELOPERS.md:404` | Yes | Developer summary |

**Verdict**: All hits are expected.  Production default is `ortools`.

### `LEGACY_NEWS_CACHE_ENABLED`

| Location | Expected | Notes |
|---|---|---|
| `services/ai-agent/src/tools/lineup-builder.ts:800,803,808,816` | Yes | Authoritative: break-glass gate |
| `services/ai-agent/src/rss/rss-config.ts:7` | Yes | Comment reference |
| `docs/Caveats.md:35,39` | Yes | Documented caveat |

**Verdict**: All hits are expected.  Flag is break-glass only; RSS is canonical.

### `ENABLE_E2EE_CHAT`

| Location | Expected | Notes |
|---|---|---|
| `services/api-gateway/src/config/index.ts:134-136` | Yes | Authoritative: server-side gate |
| `services/api-gateway/src/socket/chat-socket.ts:284` | Yes | Encrypted message rejection when disabled |
| `services/ai-agent/src/config/index.ts:105` | Yes | AI agent feature config |
| `apps/web/src/components/chat/ChatManager.tsx:91` | Yes | Frontend flag |
| `apps/web/src/components/chat/ConversationOverlay.tsx:86` | Yes | UI indicator |
| `scripts/start-dev.ps1`, `restart-dev.ps1`, `start-dev-fixed.ps1` | Yes | Dev scripts set flag |
| `docs/Caveats.md:90-91` | Yes | Documented caveat |
| `docs/PROJECT_SUMMARY_DEVELOPERS.md:275-278,351,400` | Yes | Developer summary |
| `ai.txt` | Yes | Master AI doc |

**Verdict**: All hits are expected.  Kill-switch works in any environment.

---

## TypeScript Build Checklist

Tested commit hash: `1a01cab991de85279452a91a61084bad94055195`

| Workspace | Command | Result | Notes |
|---|---|---|---|
| `apps/web` | `npm --prefix apps/web run build` | PASS | Next.js production build completed successfully. |
| `services/api-gateway` | `npm --prefix services/api-gateway run build` | PASS | Initial FAIL: TS errors in `src/resolvers/graphics.ts` + missing `connectDB` export in `src/scripts/seed-vizrt-data.ts`; after minimal fixes, second run PASS. |
| `services/ai-agent` | `npm --prefix services/ai-agent run build` | PASS | Initial FAIL: TS6059 rootDir mismatch for `../shared/**/*`, then union type errors in `src/tools/index.ts`; after minimal fixes, second run PASS. |
| `services/excel-parser` | `npm --prefix services/excel-parser run build` | PASS | Initial FAIL: unresolved legacy file `src/hebrew-parser.service.ts`; excluded non-runtime file from build scope, second run PASS. |

Initial FAIL summaries (exact):
- `api-gateway`: `TS2345` (GraphicsProject type mismatch), `TS18046` (`error` unknown), `TS2305` (`connectDB` missing export), then Windows script error: `The syntax of the command is incorrect.` from `mkdir -p` / `cp`.
- `ai-agent`: `TS6059` files outside rootDir from `../shared/**/*`; then `TS2339` on `pipelineResult.schedule` / `pipelineResult.dataWarnings`.
- `excel-parser`: `TS2307` for `@nestjs/common` and `./database.service` in `src/hebrew-parser.service.ts`, plus `TS18046` unknown error typing.

---

## Docker Compose Runtime Checklist

### Compose commands used

```bash
docker-compose up -d mongodb
docker-compose up -d api-gateway ai-agent or-tools-solver
docker-compose ps
```

### Compose result

- Result: **FAIL**
- Services requested: `mongodb`, `api-gateway`, `ai-agent`, `or-tools-solver`
- Services came up: **none via compose** (Docker daemon unavailable)
- Crash/restart loops: **N/A** (stack never started)
- Exact compose error:  
  `open //./pipe/dockerDesktopLinuxEngine: The system cannot find the file specified.`

### Service health probes (runtime evidence from current local processes)

| Service | Probe | Expected | Result | Notes |
|---|---|---|---|---|
| mongodb | `docker-compose exec mongodb mongosh --eval 'db.runCommand(\"ping\")'` | `{ ok: 1 }` | FAIL | Cannot run compose exec while Docker daemon unavailable. |
| api-gateway | `http://localhost:4000/health` | status ok | PASS | `200`, body contains `status`, `timestamp`, `environment`. |
| ai-agent canonical | `http://localhost:4001/health` | status healthy | PASS | `200`, body contains `status`, `service`, `timestamp`, `uptime`, `metrics`. |
| ai-agent deprecated alias | `http://localhost:4001/ai/health` | deprecated alias behavior per docs | FAIL | `404 Not Found` (docs currently state alias should still exist). |
| or-tools-solver | `http://localhost:5003/health` | healthy response | FAIL | Connection failed (`Unable to connect to the remote server`). |
| web | `http://localhost:3000` | `200` | PASS | `200`, HTML returned. |
| excel-parser | `http://localhost:3002` | `200` | FAIL | Not reachable in this runtime session (service not running). |

### Redis verification

| Check | Result | Notes |
|---|---|---|
| `REDIS_URL` is set | FAIL | `REDIS_URL_SET=<empty>` |
| PubSub type is `RedisPubSub` | SKIPPED | Redis not configured |
| Subscription delivery across instances | SKIPPED (Redis not enabled) | Policy applied |

---

## Flow Verification Matrix

| # | Flow | Status | Evidence |
|---|---|---|---|
| A | System startup (all services boot cleanly) | FAIL | Canonical compose startup failed due Docker daemon unavailable (`open //./pipe/dockerDesktopLinuxEngine ... file specified`). |
| B | Health probes (readiness/liveness + alias behavior) | FAIL | `4000/health` = 200, `4001/health` = 200, but `4001/ai/health` = 404 and `5003/health` unreachable. |
| C | AI Agent -> API Gateway (GraphQL with service JWT) | PASS | Token method used: `npm --prefix services/api-gateway run generate:service-jwt`. API acceptance: `POST /graphql` returned `200` with `{\"data\":{\"health\":{\"status\":\"OK\"...}}}` using Bearer token. AI-agent GraphQL provider call with that token succeeded: `FLOWC_PROVIDER_SOURCE=graphql`. No `[auth] TODO` errors observed. |
| D | Shift solving (OR-Tools default path) | FAIL | OR-Tools health endpoint unavailable (`localhost:5003` down), yet `POST /ai/shifts/solve` returned `solverStatus:\"optimal\"`; indicates non-canonical runtime likely executing non-OR-Tools path without explicit verified `SHIFT_SOLVER_ENGINE=ts`. |
| E | News ingestion (RSS canonical; legacy break-glass only) | PASS | Active feeds reported from config helper: `channel1_sports,one_sports,ynet_sports,espn_sports,bbc_sport` (`count=5`). `<TODO_VERIFY>` feeds (`skysports_football`,`ynet_news`,`mako_news`) remain inactive and excluded by `getActiveFeeds()`. |
| F | Subscriptions (Redis pubsub across instances) | SKIPPED (Redis not enabled) | `REDIS_URL` empty; policy requires skip. |
| G | E2EE behavior (non-prod default + prod gate + kill-switch) | PASS | Config checks: `E2EE_DEV_DEFAULT=true`, `E2EE_PROD_DEFAULT=false`, `E2EE_KILLSWITCH_FALSE=false`. |

---

## FAIL Handling (minimal flow-scoped fixes applied)

### Build failures fixed

1) **API Gateway build breakages**
- Broke in: `services/api-gateway/src/resolvers/graphics.ts`, `services/api-gateway/src/scripts/seed-vizrt-data.ts`, `services/api-gateway/package.json`
- Impacted flow: build integrity (`services/api-gateway` workspace)
- Fix: strict error typing fixes, corrected Mongo connect import, replaced Unix-only `mkdir -p`/`cp` in build script with cross-platform Node copy snippet
- Verification: re-ran `npm --prefix services/api-gateway run build` -> PASS

2) **AI Agent build breakages**
- Broke in: `services/ai-agent/tsconfig.json`, `services/ai-agent/src/tools/index.ts`
- Impacted flow: build integrity (`services/ai-agent` workspace)
- Fix: adjusted `rootDir` to include shared sources; explicit typed narrowing for solver pipeline result
- Verification: re-ran `npm --prefix services/ai-agent run build` -> PASS

3) **Excel Parser build breakages**
- Broke in: `services/excel-parser/tsconfig.json` (legacy non-runtime NestJS file in include path)
- Impacted flow: build integrity (`services/excel-parser` workspace)
- Fix: excluded `src/hebrew-parser.service.ts` from TypeScript build scope
- Verification: re-ran `npm --prefix services/excel-parser run build` -> PASS

### Runtime failures requiring environment action (no code refactor)

1) **Docker daemon unavailable**
- Broke in: local runtime environment (not code)
- Impacted flow: A (system startup), plus compose-based runtime checks
- Verification for resolution needed: start Docker Desktop and rerun compose checklist

2) **OR-Tools service unavailable / non-canonical solver behavior**
- Broke in: runtime stack state (or-tools not running in tested environment)
- Impacted flow: D (shift solving default path)
- Verification for resolution needed: bring up OR-Tools service and confirm ai-agent logs show `engine: ortools` during solve requests

3) **Deprecated ai-agent alias mismatch**
- Broke in: runtime behavior at `http://localhost:4001/ai/health` (404)
- Impacted flow: B (health probes)
- Verification for resolution needed: run ai-agent from current source build and re-test alias endpoint

---

## Runtime Tripwire Observability

### AI agent tripwires

- `tsSolverUsedInProd`
  - Increments in: `services/ai-agent/src/tools/shift-solver.ts` via `recordTripwireTsSolverInProd()`
  - Surfaced in: `services/ai-agent/src/middleware/monitoring.ts` health response `tripwires.tsSolverUsedInProd` (when > 0)
  - Production detection: alert on `/health` payload containing `tripwires.tsSolverUsedInProd > 0` and matching warning log `TRIPWIRE: TS solver used in production`

- `legacyNewsCacheUsed`
  - Increments in: `services/ai-agent/src/tools/lineup-builder.ts` via `recordTripwireLegacyNewsCacheUsed()`
  - Surfaced in: `services/ai-agent/src/middleware/monitoring.ts` health response `tripwires.legacyNewsCacheUsed` (when > 0)
  - Production detection: alert on `/health` payload containing `tripwires.legacyNewsCacheUsed > 0` and warning log `TRIPWIRE: Legacy news cache used`

### API gateway tripwire

- `tripwires.e2eeFallbackCount`
  - Increments in: `services/api-gateway/src/socket/chat-socket.ts` when plaintext send includes `encryption.fallbackReason`
  - Surfaced in: `services/api-gateway/src/index.ts` `/health` response as `tripwires.e2eeFallbackCount` (when > 0)
  - Current runtime evidence: `/health` currently omits `tripwires` (count remains 0 in tested session)
  - Production detection: alert if `/health.tripwires.e2eeFallbackCount` appears/increases and grep logs for `TRIPWIRE: E2EE fallback to plaintext`

### Web fallbackReason values

Defined in `apps/web/src/components/chat/ChatManager.tsx`:
- `key_fingerprint_mismatch`
- `encryption_error`
- `recipient_no_public_key`

Sent in plaintext fallback payload:
- `encryption: { enabled: false, version: 0, fallbackReason: <value> }`

Production detection:
- Correlate client-emitted fallbackReason values with server tripwire log entries in api-gateway.

---

## Overall Validation Result

- Date: Feb 10, 2026
- Tested commit hash: `1a01cab991de85279452a91a61084bad94055195`
- Summary:
  - PASS: C, E, G
  - FAIL: A, B, D
  - SKIPPED: F (Redis not enabled)
  - Known issues: Docker daemon unavailable; OR-Tools service unavailable in tested runtime; ai-agent deprecated alias behavior mismatch in current running instance.

---

## Validation Tag (created)

- Tag: `post-caveats-validation`
- Commit: `1a01cab991de85279452a91a61084bad94055195`
- Command used: `git tag -a post-caveats-validation -m "System validation snapshot (doc-only verification run)." 1a01cab991de85279452a91a61084bad94055195`
