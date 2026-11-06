# Lancelot Web — Next.js 15 (standalone output)
# Build from the repository root (the app imports services/shared/crypto):
#   docker build -f apps/web/Dockerfile .
FROM node:20-alpine AS build
WORKDIR /repo
COPY services/shared ./services/shared
COPY apps/web/package*.json ./apps/web/
RUN cd apps/web && npm ci
COPY apps/web ./apps/web
ARG NEXT_PUBLIC_GRAPHQL_URL=http://localhost:4000/graphql
ARG NEXT_PUBLIC_WS_URL=ws://localhost:4000/graphql
ENV NEXT_PUBLIC_GRAPHQL_URL=$NEXT_PUBLIC_GRAPHQL_URL NEXT_PUBLIC_WS_URL=$NEXT_PUBLIC_WS_URL NEXT_TELEMETRY_DISABLED=1
RUN cd apps/web && npm run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
# standalone output keeps the monorepo layout: /app/apps/web/server.js
COPY --from=build /repo/apps/web/.next/standalone ./
COPY --from=build /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /repo/apps/web/public ./apps/web/public
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
