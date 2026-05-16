# Broadcast Planning System

A modern broadcast planning and scheduling system for managing TV broadcast events.

## One-Pager

Open **[ONE_PAGER.html](docs/root-guides/ONE_PAGER.html)** in a browser for a visual, single-page overview of the platform (architecture, modules, security, deployment, and developer quickstart).

## Features

- **Broadcast Event Management**: Create, update, and manage broadcast events
- **Excel Import**: Import broadcast schedules from Excel files
- **Channel Overlap Detection**: Automatically detect scheduling conflicts
- **Department-Specific Data**: Store custom data for different departments
- **Real-time Updates**: WebSocket subscriptions for live updates
- **MongoDB Integration**: Store templates and configurations

## Tech Stack

- **Frontend**: Next.js 14, React, TypeScript, Apollo Client
- **Backend**: GraphQL, Node.js, Express
- **Database**: MongoDB (primary datastore for all collections; `pg` is a legacy dependency — not used in runtime code)
- **Services**: Excel Parser for schedule imports

## Quick Start

### Prerequisites

- Docker & Docker Compose
- Node.js 18+ (for local development)

### Running with Docker

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f
```

Services will be available at:
- Web UI: http://localhost:3000
- GraphQL API: http://localhost:4000/graphql
- Excel Parser: http://localhost:3002

### Local Development

```bash
# Install dependencies
npm install

# Start API Gateway
cd services/api-gateway
npm run dev

# Start Web Frontend (in another terminal)
cd apps/web
npm run dev

# Start Excel Parser (in another terminal)
cd services/excel-parser
npm run dev
```

## Environment Variables

Create `.env` files in each service directory. **Never commit real credentials**
— copy the canonical templates and fill them in locally.

### API Gateway (`services/api-gateway/.env`)

Use [`services/api-gateway/.env.example`](services/api-gateway/.env.example) as
the canonical template. At minimum you must set:

```env
NODE_ENV=development
PORT=4000

# Either supply MONGODB_URI directly...
MONGODB_URI=mongodb://USER:PASSWORD@localhost:27017/lancelot?authSource=admin

# ...or supply the parts (preferred — `.env` is the only place credentials live).
MONGO_USERNAME=
MONGO_PASSWORD=

# Generate with `openssl rand -base64 64` (min 64 chars in production).
JWT_SECRET=
```

### Web Frontend (`apps/web/.env.local`)
```env
NEXT_PUBLIC_GRAPHQL_URL=http://localhost:4000/graphql
NEXT_PUBLIC_WS_URL=ws://localhost:4000/graphql
```

### Excel Parser (`services/excel-parser/.env`)
```env
PORT=3002
GRAPHQL_URL=http://localhost:4000/graphql
```

## API Documentation

### GraphQL Schema

The main types for broadcast events:

```graphql
type BroadcastEvent {
  id: ID!
  title: String!
  hebrewTitle: String
  startTime: DateTime!
  endTime: DateTime!
  type: BroadcastEventType!
  status: BroadcastEventStatus!
  channel: Int!
  description: String
  departmentData: JSON
  overlappingEvents: [BroadcastEvent!]
}

enum BroadcastEventType {
  live
  recorded
  remote
  studio
}

enum BroadcastEventStatus {
  planned
  confirmed
  in_progress
  completed
  cancelled
}
```

### Key Queries

```graphql
# Get broadcast events
query GetBroadcastEvents($startDate: DateTime, $endDate: DateTime) {
  broadcastEvents(startDate: $startDate, endDate: $endDate) {
    id
    title
    startTime
    endTime
    channel
    type
    status
  }
}
```

### Key Mutations

```graphql
# Create broadcast event with overlap check
mutation CreateBroadcastEvent($input: CreateBroadcastEventInput!) {
  createBroadcastEventWithOverlapCheck(input: $input) {
    event {
      id
      title
    }
    overlappingEvents {
      id
      title
      channel
    }
    created
  }
}

# Import from Excel
mutation ImportFromExcel($events: [ExcelBroadcastEventInput!]!) {
  createBroadcastEventsFromExcelWithOverlapCheck(events: $events) {
    created
    failed
    errors {
      index
      message
    }
  }
}
```

## System Validation Status

> **Validation run recorded on Feb 10, 2026** at commit
> `1a01cab991de85279452a91a61084bad94055195` (tag: `post-caveats-validation`).
> Current flow status includes PASS/SKIPPED/FAIL outcomes; see
> `docs/SYSTEM_IMPACT_LEDGER.md` for the source-of-truth matrix and evidence.
> Further changes require impact analysis and flow declaration.

## License

Proprietary 