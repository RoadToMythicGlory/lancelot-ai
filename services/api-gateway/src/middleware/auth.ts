import * as jwt from 'jsonwebtoken';
import { config } from '../config';

export interface AuthContext {
  user?: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    systemRole: string;
    departments: any[];
  };
  token?: string;
}

export function authenticateUser(context: any) {
  if (!context.user) {
    throw new Error('Unauthorized: Please login to access this resource');
  }
  return context.user;
}

export function verifyToken(token: string) {
  try {
    const decoded = jwt.verify(token, config.JWT_SECRET) as any;
    return decoded;
  } catch (error) {
    throw new Error('Invalid or expired token');
  }
}

export function generateToken(user: any) {
  return jwt.sign(
    {
      id: user.id || user._id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      systemRole: user.systemRole,
      departments: user.departments || []
    },
    config.JWT_SECRET,
    { expiresIn: '24h' }
  );
}
