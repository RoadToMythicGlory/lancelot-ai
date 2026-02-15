# Project Caveats ("Missed Spots")

This file consolidates all known caveats, gaps, mismatches, and placeholders
documented across the repository. Last updated: Feb 10, 2026.

## Validation Summary

- **Validation date**: Feb 10, 2026
- **Commit hash**: `1a01cab991de85279452a91a61084bad94055195`
- **Release tag**: `post-caveats-validation`
- All resolved caveats below have been verified via the System Impact Ledger.
- Flow verification matrix: see docs/SYSTEM_IMPACT_LEDGER.md, section "Flow Verification Matrix"
- Change rule: all future changes must declare affected flows.
  See docs/PROJECT_SUMMARY_DEVELOPERS.md section 18.

## Documentation and Configuration Mismatches

- **RESOLVED** Excel parser port: code defaults to `4002`, docker-compose
  overrides to `3002` via `PORT` env. Code now reads `process.env.PORT`.
  Docs document both contexts. Verification: `PORT=3002 npm start` binds to 3002.
  Test: smoke -- `services/excel-parser/src/main.ts` reads PORT env.

- **RESOLVED** PostgreSQL: `pg` is a legacy dependency in api-gateway
  `package.json` -- no source code imports it. Not in docker-compose. README and
  docs updated to state MongoDB is the sole datastore.
  Verification: `grep -r "from 'pg'" services/api-gateway/src` returns nothing.
  Test: smoke -- no Postgres connection attempted at startup.

- **RESOLVED** AI agent health endpoint: canonical path is `GET /health`.
  `/ai/health` is a deprecated alias (remove after 2026-06-30). Dockerfile
  HEALTHCHECK, scripts, and docs updated. Verification: both endpoints return 200.
  Test: smoke -- `curl localhost:4001/health` and `curl localhost:4001/ai/health`.

- **RESOLVED** `docs/EXCEL_IMPORT_GUIDE.md` no longer suggests
  `docker-compose up postgres mongodb`; updated to `docker-compose up mongodb`.
  Verification: visual review of doc.
  Test: smoke -- doc content matches runtime requirements.

## Optional / Legacy Components

- **RESOLVED** PostgreSQL is NOT used at runtime. `pg` is a legacy package.json
  dependency only. MongoDB is the sole primary datastore.

- **RESOLVED** Legacy news cache is now break-glass only
  (`LEGACY_NEWS_CACHE_ENABLED=true` required). RSS pipeline is the canonical
  news ingestion path (enabled by default). On RSS failure without legacy flag,
  a hard error is returned -- no silent fallback.
  Verification: start with `RSS_PIPELINE_ENABLED=true` (default) and no
  `LEGACY_NEWS_CACHE_ENABLED`; confirm RSS is used and legacy path is not.
  Test: integration -- lineup builder uses RSS pipeline exclusively.

## AI Agent: Known Limitations and Placeholders

- **RESOLVED** Shift solver: OR-Tools solver microservice added
  (`services/or-tools-solver/`). Production default: `SHIFT_SOLVER_ENGINE=ortools`.
  TS solver is emergency/dev only via `SHIFT_SOLVER_ENGINE=ts`. On OR-Tools
  failure: hard error with logs, no silent fallback.
  Verification: `curl localhost:5003/health` returns healthy.
  Test: integration -- solver pipeline calls OR-Tools service.

- **RESOLVED** Service-to-service GraphQL auth: `signServiceToken` added to
  `jwtService.ts`. Generate via `npm run generate:service-jwt` in api-gateway.
  Set `AI_AGENT_JWT` env. All TODO error messages replaced with actionable
  instructions. Rotation procedure documented in `docs/DOCKER_SECRETS_GUIDE.md`.
  Verification: AI agent GraphQL calls succeed with service JWT set.
  Test: integration -- graphql-shift-facts-provider fetches without errors.

- **RESOLVED** RSS pipeline enabled by default (`RSS_PIPELINE_ENABLED !== 'false'`).
  5 feeds now active (one_sports, ynet_sports, espn_sports, channel1_sports,
  bbc_sport) -- exceeds N >= 3 threshold. TODO_VERIFY feeds remain excluded
  until verified via `npm run rss:verify`.
  Verification: `getActiveFeeds()` returns >= 5 feeds.
  Test: smoke -- rss-config.ts active feed count.

- Feeds with URL TODO_VERIFY (skysports_football, ynet_news, mako_news)
  remain inactive. Verify and activate via `npm run rss:verify`.

- Placeholder items in lineups still occur when articles are insufficient.
  Placeholders are clearly labeled (`isPlaceholder: true`).

## AI Agent: "Coming Soon" / Not Fully Wired

- **RESOLVED** All "Coming Soon" labels removed from `services/ai-agent/README.md`.
  All endpoints are documented with actual behavior and auth requirements.
  Verification: visual review of README.md vs routes.ts.
  Test: smoke -- README contains no "Coming Soon" text.

## Realtime / Subscriptions

- **RESOLVED** PubSub upgraded to Redis-backed via `graphql-redis-subscriptions`
  + `ioredis`. When `REDIS_URL` is set, subscriptions work across instances.
  In-memory fallback only in dev when Redis is not configured. In production
  without Redis, a warning is logged.
  Verification: set REDIS_URL, confirm subscriptions work across instances.
  Test: integration -- pubsub.ts creates RedisPubSub when REDIS_URL is set.

## Feature Flags / Partial Rollouts

- **RESOLVED** E2EE chat: enabled by default in non-prod (dev/staging). In
  production: opt-in via `ENABLE_E2EE_CHAT=true` (progressive rollout).
  Kill-switch: `ENABLE_E2EE_CHAT=false` disables in any environment. Fallback
  warnings via `E2EE_FALLBACK_WARNING`. Monitor: handshake success rate,
  fallback rate, key-rotation errors.
  Verification: start in dev mode, confirm E2EE is on. Start with
  NODE_ENV=production + no flag, confirm E2EE is off.
  Test: smoke -- config.ts E2EE default matches environment.

## AI Lineup Data Gaps (Operational Behavior)

- Items-mode lineup generation can fall back to placeholder skeletons when data
  is missing; placeholders are clearly labeled and require manual fill
  (`ai.txt`, `docs/DATA_FLOW.md`).

## Source Pointers

Primary sources consolidated here:
- `docs/PROJECT_SUMMARY_DEVELOPERS.md`
- `docs/SYSTEM_IMPACT_LEDGER.md`
- `docs/EXCEL_IMPORT_GUIDE.md`
- `docs/DATA_FLOW.md`
- `docs/DOCKER_SECRETS_GUIDE.md`
- `README.md`
- `services/ai-agent/README.md`
- `ai.txt`
- `services/api-gateway/src/config/index.ts`
- `services/api-gateway/src/resolvers/shifts.ts`
- `services/api-gateway/src/utils/pubsub.ts`
- `services/ai-agent/src/data/providers/graphql-shift-facts-provider.ts`
- `services/ai-agent/src/rss/rss-config.ts`
- `services/ai-agent/src/tools/shift-solver.ts`
- `services/ai-agent/src/tools/lineup-builder.ts`
