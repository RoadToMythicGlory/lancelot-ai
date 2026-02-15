# Lancelot AI Agent

Local LLM-powered AI assistant for the Lancelot ERP broadcast system.

## Overview

The AI Agent is a standalone service that provides:
- **Chat Interface**: Natural language conversation as a "digital employee"
- **Lineup Builder**: Generate program rundowns for sports, news, and entertainment shows
- **CG Assistant**: Create structured graphics specifications
- **Shift Scheduler**: Intelligent shift scheduling assistance (via OR-Tools)
- **News Fetcher**: RSS-based news aggregation from trusted sources
- **Rights Board**: Broadcast rights and sports intelligence tracking

## Requirements

- Node.js 18+
- MongoDB 6+
- Ollama (for local LLM inference)

## Installation

```bash
# Install dependencies
npm install

# Seed the AI user in MongoDB
npm run seed:ai-user

# Start in development mode
npm run dev
```

## Ollama Setup

The AI Agent requires Ollama running locally with a compatible model:

```bash
# Install Ollama
curl -fsSL https://ollama.com/install.sh | sh

# Pull the recommended model
ollama pull llama3.1:8b-instruct-q4_K_M

# For Hebrew support
ollama pull qwen2.5:7b

# Verify Ollama is running
curl http://localhost:11434/api/tags
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `AI_AGENT_PORT` | `4001` | Service port |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Ollama API URL |
| `LLM_PRIMARY_MODEL` | `llama3.1:8b-instruct-q4_K_M` | Primary LLM model |
| `LLM_HEBREW_MODEL` | `qwen2.5:7b` | Model for Hebrew content |
| `LLM_TIMEOUT` | `30000` | LLM request timeout (ms) |
| `LLM_TEMPERATURE` | `0.7` | Generation temperature |
| `MONGODB_URL` | - | MongoDB connection URL |
| `MONGO_DATABASE` | `broadcast` | Database name |

## API Endpoints

### Health Check
```
GET /health
```
> **Note**: `/ai/health` is a deprecated alias and will be removed after 2026-06-30. Use `/health`.

### Agent Status
```
GET /ai/status
```

### Chat
```
POST /ai/chat
Content-Type: application/json

{
  "conversationId": "uuid",
  "message": "Build me a sports rundown",
  "context": {
    "history": [
      { "role": "user", "content": "..." },
      { "role": "assistant", "content": "..." }
    ]
  }
}
```

### Lineup Builder
```
POST /ai/lineup
```
Generates program rundowns via the lineup builder tool. Requires auth.

### CG Spec Generator
```
POST /ai/cg/spec
```
Creates structured CG graphics specifications. Requires auth.

### Shift Solver
```
POST /ai/shifts/solve
```
Runs the shift scheduling solver pipeline. Requires auth.

### News Brief
```
GET /ai/news/brief
```
Returns a news brief from trusted RSS sources. Requires auth.

### Rights Board
```
GET /ai/rights/board
```
Returns broadcast rights and sports intelligence data. Requires auth.

## Architecture

```
ai-agent/
├── src/
│   ├── index.ts          # Service entry point
│   ├── config/           # Configuration
│   ├── llm/              # LLM provider abstraction
│   ├── agent/            # Controller (orchestrator) + response builder
│   ├── workers/          # Stateless AI Workers (see below)
│   ├── tools/            # Tool implementations (ERP domain logic)
│   ├── schemas/          # JSON output schemas (Zod)
│   ├── data/             # Data layer (MongoDB)
│   ├── api/              # Express routes
│   └── utils/            # Utilities
└── tests/                # Test files
```

### AI Workers vs Controller vs Tools

The AI layer is organized into three tiers with strict responsibility boundaries:

- **AI Workers** (`src/workers/`): Stateless, single-responsibility modules.
  Each Worker does exactly one thing (classify intent, detect greeting, etc.)
  and returns structured output. Workers are **FORBIDDEN** from executing tools,
  writing to databases, or making business decisions. All Worker output is
  treated as **UNTRUSTED** by the controller. See `src/workers/README.md`.

- **Controller** (`src/agent/orchestrator.ts`): A thin orchestration layer that
  calls Workers, validates their output, and dispatches to the appropriate tool
  handler. The controller contains **NO AI logic** — it is a deterministic
  dispatcher. It is the only code allowed to invoke registered tool handlers.

- **Tools / ERP** (`src/tools/`): Domain-specific handlers that perform actual
  business operations (lineup building, shift solving, CG generation, news
  fetching, rights lookup). Tools are the **ONLY** components allowed to make
  decisions, mutate state, or interact with the ERP system.

## Integration with API Gateway

The AI Agent is designed to be called by the api-gateway service. Messages to the AI user in the chat system are routed to this service.

## Development

```bash
# Run tests
npm test

# Run with watch mode
npm run dev:watch

# Build for production
npm run build
```

## Offline Mode

The AI Agent is designed to work offline. When external data sources are unavailable:
- Uses cached news articles
- Uses stored broadcast rights data
- Indicates data freshness in responses
- Never makes external LLM API calls

## Security

- No external LLM APIs (all inference is local)
- Trusted source allowlist for news fetching
- Auth passthrough from api-gateway
- All decisions are logged for audit
