# Contributing to Lancelot

Thanks for taking the time. Lancelot was built in a working control room and is now
maintained in the open — bug reports from real stations, translations, and new
integrations are all equally welcome.

## Ground rules

- Be kind. See [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
- **Never commit credentials, real schedules, or real people.** Seeds and fixtures use
  `@example.com` addresses and `CHANGE_ME` passwords. CI will reject anything that looks
  like a secret.
- Business rules live in the API gateway. The web app is presentation + orchestration only.
- No cloud LLM calls. The AI agent talks to a local model (Ollama / llama.cpp) only.

## Development loop

```bash
npm run install:all
cp .env.example .env            # fill MONGO_PASSWORD + JWT_SECRET
docker compose up -d mongodb    # or use your own MongoDB
npm run dev                     # web :3000 + api :4000
```

Type-check before pushing:

```bash
(cd services/api-gateway && npx tsc --noEmit)
(cd apps/web && npx tsc --noEmit)
(cd services/api-gateway && npm test)
```

## Project layout

| Path | What lives there |
|---|---|
| `apps/web/src/app/<module>` | One folder per UI module (MCR, shifts, warehouse, …) |
| `services/api-gateway/src/schema/*.graphql` | GraphQL schema, split by domain |
| `services/api-gateway/src/resolvers/` | Resolvers — one file per domain |
| `services/api-gateway/src/services/` | Domain services (auth, RBAC, parsers, integrations) |
| `services/api-gateway/src/scripts/` | Seeds and one-off maintenance scripts |
| `services/ai-agent/src/tools/` | One file per AI tool; register it in `registry.ts` |
| `docs/user-manual/` | Hebrew user manual — also seeded into the in-app help center |

## Making a change

1. Fork and branch from `main`: `feat/<short-name>`, `fix/<short-name>`, `docs/<short-name>`.
2. Keep PRs focused. A schema change + resolver + UI for one feature is one PR; two features are two PRs.
3. If you touch the GraphQL schema, update the matching `apps/web/src/graphql/*.ts` operations.
4. If you add a permission, add it to the RBAC matrix and to `docs/user-manual/20-glossary-permissions.md`.
5. Hebrew-facing UI strings must be RTL-safe; test in both locales.

### Commit messages

Conventional-commit style, scope optional:

```
feat(warehouse): volume capacity tracking
fix(api): derive external device status from active assignment
docs(readme): add Kubernetes notes
```

### Pull request checklist

- [ ] Type-checks pass for every package you touched
- [ ] No new secrets, real emails, real names, or customer data
- [ ] Schema and front-end operations are in sync
- [ ] User-facing behaviour is documented (user manual or `docs/`)
- [ ] Screenshots/GIF for UI changes

## Reporting bugs

Use the **Bug report** issue template. Include the module, what you expected, what
happened, browser/Node versions, and — if it's a schedule-import problem — a
*synthetic* spreadsheet that reproduces it (never a real one).

## Security

Please do **not** open public issues for vulnerabilities. See [SECURITY.md](SECURITY.md).
