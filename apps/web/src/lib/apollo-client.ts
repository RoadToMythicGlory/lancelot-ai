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
      
      // Quietly ignore unauthorized to view users in chat - expected for non-admin users
      if (message.includes('Unauthorized to view users') && operation.operationName === 'GetUsers') {
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
  
  console.log('[Apollo Client] Setting auth header for', operation.operationName, ':', {
    hasToken: !!token,
    tokenLength: token?.length,
    tokenPreview: token ? token.substring(0, 20) + '...' : 'NO TOKEN',
    headers: headers
  });
  
  // Log to sessionStorage for debugging
  if (typeof window !== 'undefined' && operation.operationName) {
    const logs = JSON.parse(sessionStorage.getItem('apolloRequestLogs') || '[]');
    logs.push({
      timestamp: new Date().toISOString(),
      operation: operation.operationName,
      hasToken: !!token,
      tokenPreview: token ? token.substring(0, 50) + '...' : null
    });
    // Keep only last 20 logs
    if (logs.length > 20) logs.shift();
    sessionStorage.setItem('apolloRequestLogs', JSON.stringify(logs));
  }
  
  // Do NOT fall back to user.id – that is not a valid JWT and
  // causes "jwt malformed" errors on the server. We only send the
  // header if we really have a JWT in localStorage.
  
  // Return the headers to the context so httpLink can read them
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
          myShifts: {
            merge(existing = [], incoming) {
              return incoming;
            }
          },
          myTickets: {
            merge(existing = [], incoming) {
              return incoming;
            }
          },
          bulletinPosts: {
            merge(existing = [], incoming) {
              return incoming;
            }
          },
          broadcastEvents: {
            merge(existing = [], incoming) {
              return incoming;
            }
          }
        }
      }
    }
  }),
  defaultOptions: {
    watchQuery: {
      fetchPolicy: 'cache-and-network',
      errorPolicy: 'all',
    },
    query: {
      fetchPolicy: 'network-only',
      errorPolicy: 'all',
    },
    mutate: {
      errorPolicy: 'all',
    },
  },
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