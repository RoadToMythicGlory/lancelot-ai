# Lancelot AI Agent — local-LLM assistant
# Build from the repository root (imports services/shared/crypto):
#   docker build -f services/ai-agent/Dockerfile .
FROM node:20-alpine AS build
WORKDIR /repo
COPY services/shared ./services/shared
COPY services/ai-agent/package*.json ./services/ai-agent/
RUN cd services/ai-agent && npm ci
COPY services/ai-agent ./services/ai-agent
RUN cd services/ai-agent && npm run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY services/ai-agent/package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /repo/services/ai-agent/dist ./dist
EXPOSE 4001
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:4001/health || exit 1
CMD ["npm", "start"]
