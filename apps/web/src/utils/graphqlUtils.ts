/**
 * Utility functions for GraphQL operations
 */

/**
 * Recursively removes __typename fields from an object
 * This is necessary when sending data back to GraphQL mutations
 * as __typename is added by Apollo Client for caching but is not
 * accepted by GraphQL input types
 */
export function removeTypename<T>(obj: T): T {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => removeTypename(item)) as unknown as T;
  }

  if (typeof obj === 'object') {
    const newObj: any = {};
    for (const key in obj) {
      if (key !== '__typename' && obj.hasOwnProperty(key)) {
        newObj[key] = removeTypename((obj as any)[key]);
      }
    }
    return newObj;
  }

  return obj;
}

/**
 * Cleans an input object for GraphQL mutations by removing __typename
 * and other Apollo-specific fields
 */
export function cleanGraphQLInput<T>(input: T): T {
  return removeTypename(input);
}

