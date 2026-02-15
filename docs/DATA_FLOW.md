# Lancelot Platform — End-to-End Data Flow

> **Last updated:** February 9, 2026

---

## Full System Data Flow

```mermaid
flowchart TB
    UserBrowser[User Browser]

    UserBrowser --> NextJS[Next.js Web UI :3000]

    NextJS --> ApolloClient[Apollo Client]
    NextJS --> SocketIOClient[Socket.IO Client]
    NextJS --> ExcelUploadUI[Excel Upload]

    ApolloClient -- "HTTP /graphql + JWT" --> ApolloServer[Apollo Server :4000]
    ApolloClient -- "WS /graphql" --> GraphQLWS[graphql-ws Subscriptions]
    SocketIOClient -- "WS /socket.io/" --> SocketIOServer[Socket.IO Server :4000]

    ApolloServer --> JWTVerify[JWT Verify + Build Context]
    JWTVerify --> Resolvers[GraphQL Resolvers]

    Resolvers --> MongoDB[(MongoDB :27017)]
    Resolvers -- "publish" --> PubSub[In-Memory PubSub]
    PubSub --> GraphQLWS
    GraphQLWS -- "real-time push" --> ApolloClient

    SocketIOServer -- "store + deliver" --> MongoDB
    SocketIOServer --> AICheck{Recipient is AI?}
    AICheck -- "no" --> DeliverToUser[Deliver to User]
    AICheck -- "yes" --> AIAgent[AI Agent :4001]

    AIAgent --> Orchestrator[Orchestrator]
    Orchestrator --> Ollama[Ollama LLM :11434]
    Orchestrator --> ToolRegistry[Tool Registry]
    ToolRegistry --> MongoDB

    ExcelUploadUI -- "POST file" --> ExcelParser[Excel Parser :3002]
    ExcelParser -- "parsed JSON" --> ExcelUploadUI
    ExcelUploadUI -- "GraphQL mutation" --> ApolloClient
```

---

## Authentication Flow

```mermaid
flowchart TB
    User[User enters email + password]
    User --> LoginMutation[GraphQL mutation: login]
    LoginMutation --> FindUser[MongoDB: users.findOne]
    FindUser --> ComparePassword[bcrypt.compare]
    ComparePassword --> SignJWT[jwtService.sign]
    SignJWT --> ReturnToken[Return JWT + user data]
    ReturnToken --> StoreToken[localStorage: auth-token]

    StoreToken --> SubsequentRequest[Subsequent API request]
    SubsequentRequest --> VerifyJWT[jwtService.verify]
    VerifyJWT --> BuildContext[buildGraphQLContext]
    BuildContext --> ResolverExec[Resolver executes with user context]
```

---

## GraphQL Request Flow

```mermaid
flowchart TB
    WebUI[Web UI]
    WebUI --> ApolloClient[Apollo Client]
    ApolloClient -- "HTTP POST + Bearer JWT" --> ApolloServer[Apollo Server :4000]
    ApolloServer --> ContextBuilder[buildGraphQLContext]
    ContextBuilder --> Resolver[Resolver]

    Resolver --> BroadcastEvents[(broadcastEvents)]
    Resolver --> Shifts[(shifts / swaps / vacations)]
    Resolver --> MCR[(mcrEvents / bulletins)]
    Resolver --> Users[(users)]
    Resolver --> Vizrt[(vizrtTemplates)]
    Resolver --> Equipment[(equipment)]
    Resolver --> Vendors[(vendors)]
    Resolver --> Chat[(chatMessages)]
```

---

## GraphQL Subscriptions Flow

```mermaid
flowchart TB
    Client[Web UI]
    Client -- "WS connect" --> GraphQLWS[graphql-ws :4000]
    GraphQLWS --> Subscribe[Subscribe to topic]

    MutationResolver[Mutation Resolver] --> WriteDB[Write to MongoDB]
    MutationResolver --> Publish[pubsub.publish]
    Publish --> PubSub[In-Memory PubSub]
    PubSub --> GraphQLWS
    GraphQLWS -- "push event" --> Client
```

---

## Socket.IO Chat Flow

```mermaid
flowchart TB
    UserA[User A]
    UserA -- "connect + JWT" --> SIOServer[Socket.IO Server]
    SIOServer --> JWTAuth[JWT Auth Middleware]
    JWTAuth --> JoinRoom[Join conversation room]

    UserA -- "send-private-message" --> SIOServer
    SIOServer --> StoreMsg[chatMessages.insertOne]
    SIOServer --> EmitMsg[emit: new-private-message]
    EmitMsg --> UserB[User B]
```

---

## AI Agent Chat Flow

```mermaid
flowchart TB
    User[User sends message to AI]
    User --> SIOServer[Socket.IO Server]
    SIOServer --> StoreUserMsg[Store user message in MongoDB]
    SIOServer --> DetectAI{Recipient is AI agent?}

    DetectAI -- "no" --> DeliverNormal[Deliver to other user]
    DetectAI -- "yes" --> TypingIndicator[Show AI typing]
    TypingIndicator --> PostToAI["HTTP POST /ai/chat"]
    PostToAI --> ChatHandler[chat-handler.ts]
    ChatHandler --> Orchestrator[processMessage]
    Orchestrator --> LLMResponse[AI generates response]
    LLMResponse --> ReturnJSON[Return JSON to Socket.IO]
    ReturnJSON --> StopTyping[Stop typing indicator]
    StopTyping --> StoreAIMsg[Store AI message in MongoDB]
    StoreAIMsg --> DeliverAI[Deliver AI response to user]
```

---

## AI Agent Internal Pipeline

```mermaid
flowchart TB
    IncomingMessage[Incoming Message]

    IncomingMessage --> GreetingCheck{Greeting?}
    GreetingCheck -- "yes" --> HardcodedResponse[Hardcoded greeting]

    GreetingCheck -- "no" --> ClassifyIntent[classifyIntent via LLM]
    ClassifyIntent --> OperationalCheck{Operational intent?}

    OperationalCheck -- "general chat" --> LLMGenerate[LLM generate response]
    LLMGenerate --> TextResponse[Return text response]

    OperationalCheck -- "cg / lineup / shifts / news / rights" --> EntityCheck{Entities complete?}
    EntityCheck -- "missing" --> Clarification[Ask clarification questions]
    EntityCheck -- "yes" --> LookupTool[Look up tool in registry]
    LookupTool --> ValidateInput[Validate with Zod schema]
    ValidateInput --> ExecuteTool[Execute tool with timeout]
    ExecuteTool --> ToolSuccess{Success?}
    ToolSuccess -- "no" --> FailureMsg[Return failure message]
    ToolSuccess -- "yes" --> StructuredResponse[Build structured response]
    StructuredResponse --> ToolResponse[Return to API Gateway]

    HardcodedResponse --> ToolResponse
    TextResponse --> ToolResponse
    Clarification --> ToolResponse
```

---

## AI Tool: News Fetcher

```mermaid
flowchart TB
    NewsRequest[News request]
    NewsRequest --> GetFeeds[Get active RSS feeds]
    GetFeeds --> FetchFeeds[Fetch feeds concurrently]
    FetchFeeds --> ParseXML[Parse RSS/Atom XML]
    ParseXML --> Dedup[Deduplicate articles]
    Dedup --> StoreArticles[Store in rssArticles collection]
    StoreArticles --> RetrievePool[Retrieve pool by time window]
    RetrievePool --> RankArticles[Rank by category relevance]
    RankArticles --> SelectArticles[Select top articles]
    SelectArticles --> GenerateBriefs[Generate LLM briefs]
    GenerateBriefs --> NewsResponse[Return news with citations]
```

---

## AI Tool: Lineup Builder

```mermaid
flowchart TB
    LineupRequest[Lineup request]
    LineupRequest --> DetectType{Detect lineup type}

    DetectType -- "items" --> ExtractCounts[Extract item + category counts]
    ExtractCounts --> FetchRSS[Fetch RSS articles]
    FetchRSS --> ScoreArticles[Score articles per category]
    ScoreArticles --> AssignArticles[Assign to categories]
    AssignArticles --> FillPlaceholders[Fill gaps with placeholders]
    FillPlaceholders --> ItemsLineup[Return items lineup]

    DetectType -- "structure" --> ParseRequest[Parse lineup request via LLM]
    ParseRequest --> BuildSegments[Build segment flow]
    BuildSegments --> AllocateTime[Allocate time per segment]
    AllocateTime --> StructureLineup[Return structure lineup]
```

---

## AI Tool: CG Spec Generator

```mermaid
flowchart TB
    CGRequest[CG request]
    CGRequest --> ModeCheck{LIVE CG mode?}

    ModeCheck -- "yes" --> DeterministicParse[Deterministic regex parsing]
    DeterministicParse --> ValidateFields[Validate against Viz constraints]
    ValidateFields --> RTLNormalize[RTL normalization]
    RTLNormalize --> LiveOutput["JSON output + requiresApproval flag"]

    ModeCheck -- "no" --> LLMExtract[LLM-based field extraction]
    LLMExtract --> ZodValidate[Validate with Zod schema]
    ZodValidate --> RepairLoop{Valid?}
    RepairLoop -- "no" --> Repair[Repair once, re-validate]
    RepairLoop -- "yes" --> CGOutput[Return CG spec]
    Repair --> CGOutput
```

---

## AI Tool: Shift Scheduler

```mermaid
flowchart TB
    ShiftRequest[Shift scheduling request]
    ShiftRequest --> ExtractConstraints[LLM extracts constraints]
    ExtractConstraints --> ConstraintCheck{All constraints present?}

    ConstraintCheck -- "missing" --> AskClarification[Ask clarification questions]

    ConstraintCheck -- "yes" --> FetchFacts[Fetch facts from MongoDB]
    FetchFacts --> DeterministicSolver[Deterministic solver]
    DeterministicSolver --> ComputeFairness[Compute fairness scores]
    ComputeFairness --> BuildOutput[Build structured output]
    BuildOutput --> ShiftResponse[Return schedule response]
```

---

## Excel Import Flow

```mermaid
flowchart TB
    User[User selects .xlsx file]
    User --> Upload["POST /parse-broadcast-schedule"]
    Upload --> ExcelParser[BroadcastScheduleParser]
    ExcelParser --> ParseRows[Parse rows + normalize Hebrew]
    ParseRows --> ExtractMeta[Extract sport / league / teams / departments]
    ExtractMeta --> ReturnJSON[Return parsed events JSON]

    ReturnJSON --> PreviewUI[User reviews in preview UI]
    PreviewUI --> GraphQLMutation[mutation: createBroadcastEventsFromExcel]
    GraphQLMutation --> OverlapDetect[Overlap detection per event]
    OverlapDetect --> SaveToDB[Save to broadcastEvents collection]
    SaveToDB --> PublishEvent["pubsub.publish(BROADCAST_EVENT_UPDATED)"]
    PublishEvent --> ConfirmUI[Success / error feedback]
```

---

## Data Stores

### MongoDB Collections

| Collection | Owner | Purpose |
|------------|-------|---------|
| `users` | API Gateway | User accounts, auth, departments, AI agent user |
| `broadcastEvents` | API Gateway | Broadcast event records |
| `privateConversations` | API Gateway | Chat conversation metadata |
| `chatMessages` | API Gateway | Chat message history |
| `shifts` | API Gateway | Shift assignments |
| `shift_templates` | API Gateway | Shift template definitions |
| `shift_swap_requests` | API Gateway | Shift swap requests |
| `vacation_requests` | API Gateway | Vacation requests |
| `availability_constraints` | API Gateway | Employee availability constraints |
| `employee_settings` | API Gateway | Per-employee settings |
| `specialDays` | API Gateway | Special day definitions |
| `mcrEvents` | API Gateway | MCR event records |
| `bulletinPosts` | API Gateway | MCR bulletin posts |
| `activityRows` | API Gateway | MCR activity rows |
| `equipment` | API Gateway | Warehouse equipment items |
| `equipment_assignments` | API Gateway | Equipment assignment records |
| `equipment_history` | API Gateway | Equipment transaction history |
| `vendors` | API Gateway | Vendor records |
| `vizrtTemplates` | API Gateway | Vizrt graphics templates |
| `vizrtConfigurations` | API Gateway | Vizrt system configurations |
| `aiConversationMemory` | API Gateway | AI conversation memory |
| `rssArticles` | AI Agent | Cached RSS articles (TTL-indexed) |
| `newsCache` | AI Agent | News query cache |
| `trustedSources` | AI Agent | Trusted RSS source definitions |
| `broadcastRights` | AI Agent | Broadcast rights data |
| `sportsFixtures` | AI Agent | Sports fixture data |
| `leagueStandings` | AI Agent | League standings data |

---

## Key Files

| Area | File |
|------|------|
| Frontend providers | `apps/web/src/app/client-providers.tsx` |
| Apollo Client | `apps/web/src/lib/apollo-client.ts` |
| Socket.IO Client | `apps/web/src/contexts/WebSocketContext.tsx` |
| Gateway entry | `services/api-gateway/src/index.ts` |
| MongoDB config | `services/api-gateway/src/config/mongodb.ts` |
| GraphQL schema | `services/api-gateway/src/schema/schema.graphql` |
| Chat socket | `services/api-gateway/src/socket/chat-socket.ts` |
| Auth resolver | `services/api-gateway/src/resolvers/auth.ts` |
| Context builder | `services/api-gateway/src/middleware/context.ts` |
| PubSub | `services/api-gateway/src/utils/pubsub.ts` |
| AI resolvers | `services/api-gateway/src/resolvers/ai.ts` |
| Excel parser | `services/excel-parser/src/broadcast-schedule-parser.ts` |
| AI chat handler | `services/ai-agent/src/api/chat-handler.ts` |
| AI orchestrator | `services/ai-agent/src/agent/orchestrator.ts` |
| Intent classifier | `services/ai-agent/src/agent/intent-classifier.ts` |
| Tool registry | `services/ai-agent/src/tools/index.ts` |
| RSS pipeline | `services/ai-agent/src/rss/` |
| AI data layer | `services/ai-agent/src/data/index.ts` |
