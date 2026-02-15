export interface Context {
  userId?: string;
  user?: {
    id: string;
    email: string;
    displayName: string;
    department?: string;
    systemRole?: string;
    permissions?: string[];
  };
  token?: string;
}

// Re-export other types
export * from './worker-reports';

