/**
 * Shift facts provider selection.
 */

import { createLogger } from '../../utils/logger';
import { ShiftFactsProvider } from '../shift-facts-provider';
import { createMongoShiftFactsProvider } from './mongo-shift-facts-provider';
import { createGraphqlShiftFactsProvider } from './graphql-shift-facts-provider';

const logger = createLogger('shift-facts-provider');

export type ShiftFactsProviderName = 'graphql' | 'mongo';

export function getShiftFactsProvider(): ShiftFactsProvider {
  const requested = (process.env.SHIFT_FACTS_PROVIDER || 'graphql').toLowerCase();
  const provider: ShiftFactsProviderName = requested === 'mongo' ? 'mongo' : 'graphql';

  if (provider === 'mongo') {
    if (process.env.NODE_ENV === 'production' && process.env.ALLOW_MONGO_SHIFT_FACTS !== 'true') {
      throw new Error(
        '[config] Mongo shift facts provider is disabled in production. ' +
        'Set SHIFT_FACTS_PROVIDER=graphql or explicitly allow with ALLOW_MONGO_SHIFT_FACTS=true.',
      );
    }

    logger.warn('Using Mongo shift facts provider (dev fallback)', {
      requested,
      environment: process.env.NODE_ENV,
    });
    return createMongoShiftFactsProvider();
  }

  logger.info('Using GraphQL shift facts provider', { requested });
  return createGraphqlShiftFactsProvider();
}

export { createMongoShiftFactsProvider } from './mongo-shift-facts-provider';
export { createGraphqlShiftFactsProvider } from './graphql-shift-facts-provider';
