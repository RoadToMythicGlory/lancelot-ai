import bcrypt from 'bcrypt';
import { connectMongoDB } from '../config/mongodb';
import { jwtService } from '../services/jwtService';
import { createLogger } from '../utils/logger';

const logger = createLogger('auth');

export const authResolvers = {
  Mutation: {
    // Authentication mutation - MongoDB only
    login: async (_: any, args: { email: string; password: string }, context: any) => {
      logger.info('Login attempt', { email: args.email, passwordLength: args.password.length });
      
      // Use MongoDB
      const db = await connectMongoDB();
      const usersCollection = db.collection('users');
      
      logger.debug('Database lookup', { database: db.databaseName });
      
      // Find user by email (case-insensitive)
      const user = await usersCollection.findOne({ 
        email: { $regex: new RegExp(`^${args.email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } 
      });
      
      if (!user) {
        logger.warn('Login failed: user not found', { email: args.email });
        throw new Error('Invalid email or password');
      }
      
      logger.debug('User found', { email: user.email, id: user._id });
      
      // For development, accept simple password
      let isValidPassword = false;
      
      if (process.env.NODE_ENV === 'development' && args.password === 'test123') {
        logger.debug('Using development password');
        isValidPassword = true;
      } else if (user.password && user.password.startsWith('$2')) {
        isValidPassword = await bcrypt.compare(args.password, user.password);
        logger.debug('Bcrypt comparison result', { valid: isValidPassword });
      } else {
        // Plain text comparison for development
        isValidPassword = user.password === args.password;
        logger.debug('Plain text comparison result', { valid: isValidPassword });
      }
      
      if (!isValidPassword) {
        logger.warn('Login failed: invalid password', { email: args.email });
        throw new Error('Invalid email or password');
      }
      
      // Update last login
      await usersCollection.updateOne(
        { _id: user._id },
        { $set: { lastLogin: new Date() } }
      );
      
      // Generate JWT token with user data
      const token = jwtService.sign({
        userId: user._id.toString(),
        email: user.email,
        firstName: user.firstName || 'User',
        lastName: user.lastName || '',
        displayName: `${user.firstName || 'User'} ${user.lastName || ''}`.trim(),
        role: user.role || 'user',
        systemRole: user.systemRole || 'DEPARTMENT_USER',
        departments: user.departments || []
      });

      logger.info('Login successful', { email: user.email, userId: user._id.toString() });
      
      return {
        token,
        user: {
          id: user._id.toString(),
          firstName: user.firstName || 'User',
          lastName: user.lastName || '',
          displayName: `${user.firstName || 'User'} ${user.lastName || ''}`.trim(),
          email: user.email,
          systemRole: user.systemRole || 'DEPARTMENT_USER',
          departments: user.departments || []
        }
      };
    }
  }
};

export default authResolvers;
