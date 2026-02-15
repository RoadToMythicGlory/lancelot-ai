================================================================================
LANCELOT PLATFORM - DEVELOPER PROJECT SUMMARY
================================================================================
Document Created: January 15, 2026
Last Updated: February 9, 2026
Status: Feature Complete (Core Platform + MCR + Vizrt + AI Agent + Excel Import)
Repository: Turbo Monorepo
================================================================================

TABLE OF CONTENTS
-----------------
1. OVERVIEW & IDENTITY
2. BUSINESS GOALS & QUALITY REQUIREMENTS
3. PLATFORM ARCHITECTURE
4. SERVICES & RESPONSIBILITIES
5. TECHNICAL STACK
6. RUNTIME TOPOLOGY (SERVICES + PORTS)
7. CORE WORKFLOWS (DATA FLOW)
8. DATA STORES & COLLECTIONS
9. SECURITY & AUTHENTICATION
10. AI ASSISTANT (LLM CHAT AGENT)
11. UI MODULES
12. DEVELOPMENT & LOCAL RUNBOOK
13. CONFIGURATION & ENVIRONMENT
14. TESTING & QUALITY
15. KNOWN CAVEATS / OPERATIONAL NOTES
16. ROADMAP
17. KEY FILES & ENTRY POINTS
18. CHANGE FREEZE / FLOW DECLARATION RULE
19. DOCUMENT METADATA

================================================================================
1. OVERVIEW & IDENTITY
================================================================================

Lancelot is an enterprise-grade broadcast operations ERP for managing
broadcast planning, MCR workflows, shift scheduling, equipment/warehouse
operations, and graphics/Vizrt control. It is designed for real-time,
departmental coordination with deterministic scheduling and auditability.

CORE IDENTITY:
- Product: Lancelot Platform (broadcast operations ERP)
- Primary UI: Next.js web application
- API: GraphQL + subscriptions (graphql-ws)
- Realtime Chat: Socket.IO (private conversations)
- AI: On-prem, offline-first LLM agent (no cloud LLM APIs)

REPOSITORY STRUCTURE (TOP LEVEL):
- apps/web                    # Next.js frontend
- services/api-gateway        # GraphQL + Socket.IO backend
- services/excel-parser       # Excel import microservice
- services/ai-agent           # Local AI agent service
- docs/                       # Architecture, data flow, ops guides
- docker-compose.yml          # Local stack

================================================================================
2. BUSINESS GOALS & QUALITY REQUIREMENTS
================================================================================

PRIMARY OBJECTIVES:
- Centralize broadcast planning and reduce manual scheduling overhead
- Provide MCR/NOC operators with accurate, real-time schedules
- Support rapid Excel schedule imports with conflict detection
- Enable graphics/Vizrt workflows via backend only
- Provide realtime communication via integrated chat
- Add an on-prem AI assistant for operational support

TARGET USERS:
- MCR operators, broadcast planners, operations managers
- Broadcast engineers (configuration and troubleshooting)

QUALITY REQUIREMENTS:
- Deterministic scheduling and explainable decisions
- Realtime updates for critical workflows
- Offline-first AI inference (no external LLM APIs)
- Production-safe integrations (no client access to Vizrt systems)

NON-GOALS (EXPLICIT):
- No cloud LLM dependency
- No direct client-side control of Vizrt

================================================================================
3. PLATFORM ARCHITECTURE
================================================================================

HIGH-LEVEL FLOW:

  Web UI (Next.js)
       |
       +--> GraphQL API (api-gateway) ---> MongoDB
       |
       +--> Socket.IO Chat (api-gateway) ---> MongoDB (chatMessages)
                                 |
                                 +--> AI Agent Service (ai-agent)
                                          |
                                          +--> Ollama (local inference)
                                          +--> MongoDB (AI memory + caches)

  Excel Parser (excel-parser) ---> GraphQL API (api-gateway)

DESIGN PRINCIPLES:
- Backend owns business rules and integrations
- Clients are presentation + orchestration only
- AI agent is a first-class internal user, not a separate UI

================================================================================
4. SERVICES & RESPONSIBILITIES
================================================================================

apps/web (Next.js):
- Broadcast planning, MCR boards, shifts, warehouse, chat, graphics UI
- Apollo Client for GraphQL + graphql-ws subscriptions
- Socket.IO client for chat
- Feature-flagged E2EE support in chat

services/api-gateway (Node + Express):
- GraphQL API (Apollo Server)
- Subscriptions via graphql-ws
- Socket.IO chat server
- Auth, permissions, domain logic
- AI message routing to ai-agent

services/excel-parser:
- Excel parsing and schedule normalization
- Returns parsed JSON to UI for preview

services/ai-agent:
- LLM orchestration + tool execution (news, lineup, CG, shifts, rights)
- Local inference (Ollama default, llama.cpp optional)
- Structured Zod schema outputs

================================================================================
5. TECHNICAL STACK
================================================================================

FRONTEND:
- Next.js 15, React 18, TypeScript
- Apollo Client, graphql-ws
- Socket.IO Client
- Ant Design + Tailwind-based styling

BACKEND:
- Node.js + Express
- Apollo Server (GraphQL)
- graphql-ws (subscriptions)
- Socket.IO (chat)

DATA:
- MongoDB (primary persistence for all collections)
- PostgreSQL is NOT used at runtime; `pg` is a legacy dependency in api-gateway package.json but no source code imports it

AI/LLM:
- Ollama local inference (default; GGUF models)
- Optional llama.cpp provider via env
- Zod schemas for structured outputs

INFRA/OPS:
- Docker + Docker Compose
- Redis optional for production rate limiting
- Turbo repo task orchestration

================================================================================
6. RUNTIME TOPOLOGY (SERVICES + PORTS)
================================================================================

DEFAULT DOCKER COMPOSE PORTS:
- Web UI:        3000
- API Gateway:   4000 (GraphQL + Socket.IO)
- Excel Parser:  3002
- AI Agent:      4001
- MongoDB:       27017

DEPENDENCIES:
- Ollama expected on host at http://localhost:11434

NETWORK:
- docker-compose defines a single bridge network for services

================================================================================
7. CORE WORKFLOWS (DATA FLOW)
================================================================================

AUTHENTICATION FLOW:
1. User logs in via GraphQL mutation
2. API validates user + bcrypt compare
3. JWT issued and stored in localStorage
4. Subsequent GraphQL requests include Bearer JWT

GRAPHQL REQUEST FLOW:
1. Web UI -> Apollo Client -> HTTP /graphql
2. API Gateway builds context from JWT
3. Resolvers read/write MongoDB and publish subscriptions

SUBSCRIPTIONS FLOW:
1. Web UI -> graphql-ws -> API Gateway
2. Mutations publish events via pubsub
3. Web UI receives realtime updates

CHAT FLOW (SOCKET.IO):
1. Client connects with JWT
2. Socket server validates JWT
3. Messages stored in MongoDB
4. Emits delivered messages to participants
5. If recipient is AI agent -> forward to AI service

AI CHAT FLOW:
1. API Gateway detects AI recipient
2. POST /ai/chat to ai-agent (HTTP)
3. AI agent processes message via orchestrator
4. AI agent returns structured response
5. API Gateway emits response back to chat room

EXCEL IMPORT FLOW:
1. Web UI uploads .xlsx to excel-parser
2. Parser returns parsed JSON (preview)
3. UI submits GraphQL mutation for import
4. API Gateway checks overlaps and writes to DB
5. Subscriptions notify UI

================================================================================
8. DATA STORES & COLLECTIONS
================================================================================

PRIMARY DATABASE: MongoDB

CORE COLLECTIONS:
- users
- broadcastEvents
- privateConversations
- chatMessages
- shifts
- shift_templates
- shift_swap_requests
- vacation_requests
- availability_constraints
- employee_settings
- specialDays
- mcrEvents
- bulletinPosts
- activityRows
- equipment
- equipment_assignments
- equipment_history
- vendors
- vizrtTemplates
- vizrtConfigurations
- aiConversationMemory

AI AGENT COLLECTIONS:
- rssArticles
- newsCache
- trustedSources
- broadcastRights
- sportsFixtures
- leagueStandings

LEGACY/UNUSED:
- PostgreSQL: `pg` is listed in api-gateway/package.json but no source code imports it.
  Not in docker-compose. Not required for any runtime flow. Legacy dependency only.

================================================================================
9. SECURITY & AUTHENTICATION
================================================================================

AUTH:
- JWT-based auth (login mutation)
- Context builder in API Gateway validates token

SECURITY FEATURES:
- Rate limiting (production) with optional Redis backend
- CORS allowlist support
- Password hashing with bcrypt

E2EE CHAT:
- Enabled by default in non-prod (dev/staging)
- In production: opt-in via ENABLE_E2EE_CHAT=true (progressive rollout)
- Kill-switch: ENABLE_E2EE_CHAT=false disables in any environment
- Feature flags: ENABLE_E2EE_CHAT, E2EE_FALLBACK_WARNING
- Frontend flags: NEXT_PUBLIC_ENABLE_E2EE_CHAT, NEXT_PUBLIC_E2EE_FALLBACK_WARNING
- AI agent can participate in E2EE (crypto keys)
- Key storage: apps/web/src/utils/crypto/keyStore.ts

================================================================================
10. AI ASSISTANT (LLM CHAT AGENT)
================================================================================

OVERVIEW:
- Dedicated service: services/ai-agent
- Default provider: Ollama (local)
- Optional provider: llama.cpp (env)
- Operational tools: news, lineup, CG, shifts, rights
- Structured outputs validated with Zod

ENDPOINTS:
- POST /ai/chat
- GET /ai/status
- POST /ai/lineup
- POST /ai/cg/spec
- POST /ai/shifts/solve
- GET /ai/news/brief
- GET /ai/rights/board
- GET /health (canonical)
- GET /ai/health (deprecated alias, remove after 2026-06-30)
- GET /metrics

OBSERVABILITY:
- Structured logging with trace IDs
- Rate limiting for chat + health endpoints

DETAILS:
- Full AI agent documentation in ai.txt

================================================================================
11. UI MODULES
================================================================================

PRIMARY MODULES:
- Broadcast Planning (planning, import, flight boards, rundowns)
- MCR (calendar, bulletins, control widgets)
- Shifts (availability, swaps, vacations, admin)
- Warehouse (equipment lifecycle + vendors)
- Graphics/Vizrt (dashboard, templates, CG control panel)
- Chat (contacts, conversation overlays, AI chat)

================================================================================
12. DEVELOPMENT & LOCAL RUNBOOK
================================================================================

WINDOWS LOCAL DEV:
1. Root: npm run dev:windows (web + api-gateway)
2. Excel Parser: cd services/excel-parser && npm run dev
3. AI Agent: cd services/ai-agent && npm run dev
4. Seed AI user: cd services/ai-agent && npm run seed:ai-user
5. Ensure Ollama is running and models are pulled

DOCKER (FULL STACK):
- docker-compose up -d

================================================================================
13. CONFIGURATION & ENVIRONMENT
================================================================================

ENV FILES:
- apps/web/.env.local
- services/api-gateway/.env
- services/excel-parser/.env
- services/ai-agent/.env

KEY ENV VARS (API GATEWAY):
- PORT, MONGODB_URI/MONGODB_URL, JWT_SECRET
- CORS_ORIGIN, CORS_ALLOWED_ORIGINS
- ENABLE_E2EE_CHAT, E2EE_FALLBACK_WARNING
- EXCEL_PARSER_URL

KEY ENV VARS (AI AGENT):
- AI_AGENT_PORT, OLLAMA_BASE_URL
- LLM_PROVIDER, LLM_PRIMARY_MODEL, LLM_HEBREW_MODEL
- MONGODB_URL, MONGO_DATABASE

================================================================================
14. TESTING & QUALITY
================================================================================

FRONTEND:
- Jest, Playwright, Cypress

BACKEND:
- Jest (api-gateway, ai-agent)

AI AGENT:
- Tool and pipeline tests in services/ai-agent/tests

================================================================================
15. KNOWN CAVEATS / OPERATIONAL NOTES
================================================================================

1. Excel Parser Port (RESOLVED)
   - Code default is 4002; docker-compose overrides to 3002 via PORT env
   - Code now reads process.env.PORT (additive fix)
   - docs/EXCEL_IMPORT_GUIDE.md documents both contexts

2. PostgreSQL Usage (RESOLVED)
   - `pg` is a legacy dependency in api-gateway/package.json; no source code imports it
   - Not in docker-compose, not required at runtime
   - README and docs updated to reflect MongoDB as sole datastore

3. Ollama Models Must Exist Locally
   - AI agent depends on local Ollama models being installed
   - Missing models cause 404 errors from Ollama API

4. AI Agent Health Endpoint (RESOLVED)
   - Canonical endpoint: GET /health
   - /ai/health is a deprecated alias (remove after 2026-06-30)
   - Dockerfile HEALTHCHECK, scripts, and docs updated to /health

================================================================================
16. ROADMAP
================================================================================

SECURITY:
- E2EE enabled by default in non-prod; progressive production rollout via ENABLE_E2EE_CHAT=true
- Monitor: handshake success rate, fallback rate, key-rotation errors

AI:
- OR-Tools solver integrated (SHIFT_SOLVER_ENGINE=ortools is production default; ts is emergency/dev opt-in)
- Add offline RAG/vector index integration

OPS:
- Expand monitoring (Prometheus/Grafana) + alerts
- Formalize backup/restore playbooks

================================================================================
17. KEY FILES & ENTRY POINTS
================================================================================

FRONTEND:
- apps/web/src/app/client-providers.tsx
- apps/web/src/lib/apollo-client.ts
- apps/web/src/contexts/WebSocketContext.tsx

API GATEWAY:
- services/api-gateway/src/index.ts
- services/api-gateway/src/schema/schema.graphql
- services/api-gateway/src/socket/chat-socket.ts
- services/api-gateway/src/middleware/context.ts

AI AGENT:
- services/ai-agent/src/index.ts
- services/ai-agent/src/api/chat-handler.ts
- services/ai-agent/src/agent/orchestrator.ts
- services/ai-agent/src/tools/index.ts

EXCEL PARSER:
- services/excel-parser/src/broadcast-schedule-parser.ts

================================================================================
18. CHANGE FREEZE / FLOW DECLARATION RULE
================================================================================

STATUS: ACTIVE (post-caveats validation in progress)

CHANGE FREEZE:
- No new features, refactors, renames, or "small cleanups" until the system
  impact ledger confirms all flows pass (see docs/SYSTEM_IMPACT_LEDGER.md).
- Only verification, stabilization, and fixes for discovered breakages are
  permitted during the freeze.

FLOW DECLARATION RULE (PERMANENT, ENFORCED AFTER FREEZE LIFTS):
- Every change to this repository MUST declare which existing flows it affects.
- If a change cannot name an affected flow, it is either unsafe or unnecessary.
- Every PR MUST include both:
  - "Affected flows: ..."
  - "Verification performed: ..."
- If a PR cannot name at least one affected flow, it does not merge.

Acceptable examples:
  "This change affects: system startup + AI -> API Gateway flow."
  "This change affects: E2EE chat behavior + health probes."
  "This change affects: shift solving (OR-Tools path) + news ingestion."

Not acceptable:
  "This only changes X."
  "Minor cleanup, no impact."

REFERENCE FLOWS (from docs/SYSTEM_IMPACT_LEDGER.md):
1. System startup (all services boot cleanly)
2. Health probes (readiness/liveness)
3. AI Agent -> API Gateway (GraphQL with service JWT)
4. Shift solving (OR-Tools path default)
5. News ingestion (RSS canonical; legacy break-glass only)
6. Subscriptions (Redis pubsub across instances)
7. E2EE behavior (enabled non-prod; gated in prod)

================================================================================
19. DOCUMENT METADATA
================================================================================

Document Version: 2.1
Last Updated: February 10, 2026
Maintained By: Development Team

================================================================================
END OF SUMMARY
================================================================================
