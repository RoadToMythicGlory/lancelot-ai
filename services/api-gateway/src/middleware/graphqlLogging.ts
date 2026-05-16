import { ApolloServerPlugin, GraphQLRequestListener } from '@apollo/server';
import { createLogger } from '../utils/logger';
import { metrics } from '../services/metrics';

const logger = createLogger('graphql');

/**
 * Apollo Server plugin that emits structured request/mutation/error logs and
 * coarse latency metrics for every GraphQL operation.
 *
 * - INFO log on every operation (operation name, type, duration, user)
 * - WARN log when an operation fails authorization
 * - ERROR log when an operation throws an unexpected error
 * - Metric counter incremented per operation, partitioned by op type and result
 *
 * Designed to be cheap (no per-field instrumentation) so it is safe to leave
 * enabled in production. The logger respects LOG_LEVEL.
 */
export function createGraphqlLoggingPlugin(): ApolloServerPlugin {
  return {
    async requestDidStart(reqCtx): Promise<GraphQLRequestListener<any>> {
      const startedAt = Date.now();
      const operationName = reqCtx.request.operationName || 'anonymous';
      const traceId = (reqCtx.contextValue as any)?.traceId;
      const user = (reqCtx.contextValue as any)?.user;

      return {
        async didResolveOperation(ctx) {
          const opType = ctx.operation?.operation || 'unknown';
          // Only log mutations on entry — queries are noisy and we still log
          // them on completion below.
          if (opType === 'mutation') {
            logger.info('GraphQL mutation start', {
              operationName,
              userId: user?.userId,
              userEmail: user?.email,
            }, traceId);
          }
        },

        async didEncounterErrors(ctx) {
          const opType = ctx.operation?.operation || 'unknown';
          const errors = ctx.errors || [];
          for (const err of errors) {
            const code = (err.extensions?.code as string) || 'UNKNOWN';
            // Auth/perm errors get a WARN; everything else is an ERROR so they
            // can be alerted on.
            const isAuthErr = code === 'UNAUTHENTICATED' || code === 'UNAUTHORIZED';
            const meta = {
              operationName,
              opType,
              userId: user?.userId,
              code,
              message: err.message,
              path: err.path,
            };
            if (isAuthErr) {
              logger.warn('GraphQL auth failure', meta, traceId);
            } else {
              logger.error('GraphQL error', meta, traceId);
            }
            try {
              (metrics as any).incCounter?.('graphql_errors_total', { code: code.toLowerCase() });
            } catch {
              // metrics module is best-effort
            }
          }
        },

        async willSendResponse(ctx) {
          const durationMs = Date.now() - startedAt;
          const opType = ctx.operation?.operation || 'unknown';
          const hadErrors = !!(ctx.errors && ctx.errors.length > 0);
          const result = hadErrors ? 'error' : 'ok';

          // Slow-query warning: anything over 1s is worth investigating.
          if (durationMs > 1000) {
            logger.warn('Slow GraphQL operation', {
              operationName,
              opType,
              durationMs,
              userId: user?.userId,
            }, traceId);
          } else if (opType === 'mutation') {
            logger.info('GraphQL mutation complete', {
              operationName,
              durationMs,
              result,
              userId: user?.userId,
            }, traceId);
          } else {
            logger.debug('GraphQL operation complete', {
              operationName,
              opType,
              durationMs,
              result,
              userId: user?.userId,
            }, traceId);
          }

          try {
            (metrics as any).observeHistogram?.('graphql_request_duration_ms', durationMs);
            (metrics as any).incCounter?.('graphql_requests_total', { op: opType, result });
          } catch {
            // metrics module is best-effort
          }
        },
      };
    },
  };
}
