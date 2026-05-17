import { ApolloClient, InMemoryCache, createHttpLink, split } from '@apollo/client';
import { setContext } from '@apollo/client/link/context';
import { GraphQLWsLink } from '@apollo/client/link/subscriptions';
import { createClient } from 'graphql-ws';
import { getMainDefinition } from '@apollo/client/utilities';
import { onError } from '@apollo/client/link/error';
import toast from 'react-hot-toast';

// Error handling link
const errorLink = onError(({ graphQLErrors, networkError, operation, forward }) => {
  if (graphQLErrors) {
    graphQLErrors.forEach(({ message, locations, path }) => {
      // Handle specific error cases
      // Quietly ignore noisy expected errors
      if (message && message.includes('Shift not found')) {
        // Do not toast or redirect for benign missing-shift cases
        return;
      }
      
      // Quietly ignore unauthorized to view users in chat - expected for non-admin users.
      // The server's wording moved from "Unauthorized to view users" to the
      // generic "Missing permission: USERS_VIEW" — accept both so callers like
      // ChatManager / WorkerPicker stay silent for roles without USERS_VIEW.
      if (
        operation.operationName === 'GetUsers' &&
        (message.includes('Unauthorized to view users') ||
          message.includes('Missing permission: USERS_VIEW'))
      ) {
        return;
      }
      
      console.error(
        `[GraphQL error]: Message: ${message}, Location: ${locations}, Path: ${path}`
      );
      if (message.includes('Unauthorized') || message.includes('Authentication')) {
        // Save the error to sessionStorage for debugging
        if (typeof window !== 'undefined') {
          const errorInfo = {
            timestamp: new Date().toISOString(),
            message,
            operation: operation.operationName,
            variables: operation.variables,
            path: graphQLErrors[0]?.path,
            fullError: graphQLErrors[0],
            token: localStorage.getItem('auth-token')?.substring(0, 50) + '...'
          };
          
          const apolloErrors = JSON.parse(sessionStorage.getItem('apolloAuthErrors') || '[]');
          apolloErrors.push(errorInfo);
          sessionStorage.setItem('apolloAuthErrors', JSON.stringify(apolloErrors));
          
          console.error('🚨 AUTH ERROR DETECTED:', errorInfo);
          
          // Only clear token and redirect if we're not already on the login page
          // and if this is a real auth failure (not just a permission issue)
          const currentPath = window.location.pathname;
          if (currentPath !== '/login' && !currentPath.startsWith('/login')) {
            // Check if we actually have a token - if not, redirect to login
            const token = localStorage.getItem('auth-token');
            if (!token || message.includes('jwt expired') || message.includes('jwt malformed')) {
              console.error('🚨 Token is invalid or missing, redirecting to login');
              localStorage.removeItem('auth-token');
              window.location.href = '/login';
            } else {
              // We have a token but got unauthorized - might be a permission issue
              console.warn('⚠️ Unauthorized but token exists - might be a permission issue');
              toast.error('אין לך הרשאה לבצע פעולה זו');
            }
          }
        }
      } else {
        // Show error toast for other GraphQL errors
        if (typeof window !== 'undefined') {
          toast.error(`שגיאה: ${message}`);
        }
      }
    });
  }

  if (networkError) {
    console.error(`[Network error]: ${networkError}`);
    
    // Handle network errors
    if (typeof window !== 'undefined') {
      if (networkError.message.includes('Failed to fetch')) {
        toast.error('שגיאת חיבור לשרת. אנא בדוק את החיבור שלך.');
      } else {
        toast.error('שגיאת רשת. אנא נסה שוב.');
      }
    }
  }
});

// Create HTTP link for queries and mutations
const httpLink = createHttpLink({
  uri: process.env.NEXT_PUBLIC_GRAPHQL_URL || 'http://localhost:4000/graphql',
});

// Create WebSocket link for subscriptions - only on client side
let wsLink: GraphQLWsLink | null = null;

if (typeof window !== 'undefined') {
  try {
    const wsClient = createClient({
      url: process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:4000/graphql',
      connectionParams: () => {
        const token = localStorage.getItem('auth-token');
        return {
          authorization: token ? `Bearer ${token}` : "",
        };
      },
      shouldRetry: () => true,
      retryAttempts: 5,
      retryWait: async (retries) => {
        await new Promise(resolve => setTimeout(resolve, Math.min(1000 * Math.pow(2, retries), 30000)));
      },
      on: {
        error: (error) => {
          // Only log WebSocket errors in development, don't throw
          if (process.env.NODE_ENV === 'development') {
            console.log('WebSocket connection error (expected in dev):', error);
          }
        },
        connected: () => {
          console.log('WebSocket connected successfully');
        },
        connecting: () => {
          console.log('WebSocket connecting...');
        },
        closed: () => {
          console.log('WebSocket connection closed');
        },
      },
      lazy: true, // Don't connect until first subscription
    });
    
    wsLink = new GraphQLWsLink(wsClient);
  } catch (error) {
    console.log('WebSocket setup skipped (expected in dev):', error);
    wsLink = null;
  }
}

const authLink = setContext((operation, { headers }) => {
  // Get the authentication token from local storage if it exists
  const token = typeof window !== 'undefined' ? localStorage.getItem('auth-token') : null;

  // Verbose per-request logging is helpful in dev but expensive in
  // production (and hits sessionStorage on every operation). Gate it.
  if (process.env.NODE_ENV !== 'production') {
    if (typeof window !== 'undefined' && operation.operationName) {
      const logs = JSON.parse(sessionStorage.getItem('apolloRequestLogs') || '[]');
      logs.push({
        timestamp: new Date().toISOString(),
        operation: operation.operationName,
        hasToken: !!token,
      });
      if (logs.length > 20) logs.shift();
      sessionStorage.setItem('apolloRequestLogs', JSON.stringify(logs));
    }
  }

  // Do NOT fall back to user.id – that is not a valid JWT and causes
  // "jwt malformed" errors on the server. Only send the header if we
  // really have a JWT in localStorage.
  return {
    headers: {
      ...headers,
      authorization: token ? `Bearer ${token}` : "",
    }
  }
});

// Create the combined link
const httpLinkWithAuth = errorLink.concat(authLink.concat(httpLink));

// Use split to route requests to the correct link
const splitLink = typeof window !== 'undefined' && wsLink
  ? split(
      ({ query }) => {
        const definition = getMainDefinition(query);
        return (
          definition.kind === 'OperationDefinition' &&
          definition.operation === 'subscription'
        );
      },
      wsLink,
      httpLinkWithAuth
    )
  : httpLinkWithAuth;

const client = new ApolloClient({
  link: splitLink,
  cache: new InMemoryCache({
    addTypename: true,
    // Identify a few entities by composite keys so list queries can dedupe
    // their items into the cache without colliding when the backend uses
    // string ids.
    typePolicies: {
      User: {
        fields: {
          avatarUrl: {
            merge: true,
          }
        }
      },
      BroadcastEvent: {
        fields: {
          metadata: {
            merge(_existing: any, incoming: any) {
              // Always prefer incoming metadata - don't deep-merge,
              // as it can corrupt nested departments/broadcastArray structure
              return incoming;
            },
          }
        }
      },
      Query: {
        fields: {
          // List fields with paginated args use the args as cache keys so we
          // don't collapse different filters into the same cache slot. The
          // merge function still prefers incoming so refresh wins.
          myShifts: {
            merge(_existing = [], incoming) { return incoming; },
          },
          myTickets: {
            merge(_existing = [], incoming) { return incoming; },
          },
          bulletinPosts: {
            keyArgs: ['departmentId'],
            merge(_existing = [], incoming) { return incoming; },
          },
          broadcastEvents: {
            keyArgs: ['startDate', 'endDate', 'filter'],
            merge(_existing = [], incoming) { return incoming; },
          },
          warehouseEquipment: {
            keyArgs: ['filter'],
            merge(_existing = [], incoming) { return incoming; },
          },
          equipmentSets: {
            keyArgs: false,
            merge(_existing = [], incoming) { return incoming; },
          },
        }
      }
    }
  }),
  defaultOptions: {
    // `cache-first` for watch queries: the client will read from cache when
    // available and skip the network. Queries that need freshness can opt in
    // to `cache-and-network` per-call. This prevents the previous behavior
    // where every page navigation triggered a full network refetch.
    watchQuery: {
      fetchPolicy: 'cache-first',
      nextFetchPolicy: 'cache-first',
      errorPolicy: 'all',
    },
    // One-off queries default to cache-first too — opt in to network-only
    // explicitly when the answer must be fresh (e.g. polling).
    query: {
      fetchPolicy: 'cache-first',
      errorPolicy: 'all',
    },
    mutate: {
      errorPolicy: 'all',
    },
  },
  // Enable query deduplication so two components requesting the same query
  // simultaneously share a single in-flight network request. This is the
  // default (`true`), but we set it explicitly so future Apollo upgrades
  // can't silently change the behavior.
  queryDeduplication: true,
  connectToDevTools: process.env.NODE_ENV === 'development',
});

// Utility function to clear Apollo cache
export const clearApolloCache = () => {
  if (typeof window !== 'undefined') {
    client.cache.reset();
    console.log('Apollo cache cleared');
  }
};

export default client;
export const apolloClient = client; 