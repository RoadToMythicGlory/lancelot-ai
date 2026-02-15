import { AuthenticationError } from 'apollo-server-express';

export const withAuth = (resolver: any) => {
  return async (parent: any, args: any, context: any, info: any) => {
    if (!context.user) {
      throw new AuthenticationError('You must be logged in to do this');
    }
    return resolver(parent, args, context, info);
  };
};

export const withRole = (role: string, resolver: any) => {
  return async (parent: any, args: any, context: any, info: any) => {
    if (!context.user) {
      throw new AuthenticationError('You must be logged in to do this');
    }
    
    if (context.user.systemRole !== role && !context.user.permissions?.includes(role)) {
      throw new AuthenticationError(`You must have ${role} permissions to do this`);
    }
    
    return resolver(parent, args, context, info);
  };
};

export const isMCRDepartmentAdmin = async (context: any) => {
  if (!context.user) return false;
  
  // Check if user is system admin
  if (context.user.systemRole === 'ADMIN') return true;
  
  // Check if user is MCR department admin
  const mcrDepartment = context.user.departments?.find((dept: any) => 
    dept.name === 'MCR' && dept.role === 'admin'
  );
  
  return !!mcrDepartment;
};





