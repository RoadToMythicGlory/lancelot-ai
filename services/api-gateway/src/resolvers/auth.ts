import bcrypt from 'bcrypt';
import { connectMongoDB } from '../config/mongodb';
import { jwtService } from '../services/jwtService';
import { createLogger } from '../utils/logger';

const logger = createLogger('auth');

export const authResolvers = {
  Mutation: {
    login: async (_: any, args: { email: string; password: string }, context: any) => {
      logger.info('Login attempt', { email: args.email, passwordLength: args.password.length });

      const db = await connectMongoDB();
      const usersCollection = db.collection('users');

      logger.debug('Database lookup', { database: db.databaseName });

      const user = await usersCollection.findOne({
        email: { $regex: new RegExp(`^${args.email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }
      });

      if (!user) {
        logger.warn('Login failed: user not found', { email: args.email });
        throw new Error('Invalid email or password');
      }

      if (user.isActive === false) {
        logger.warn('Login failed: user is deactivated', { email: args.email });
        throw new Error('Account is deactivated. Contact an administrator.');
      }

      logger.debug('User found', { email: user.email, id: user._id });

      let isValidPassword = false;

      // Dev shortcut — only when explicitly opted in
      if (process.env.ALLOW_DEV_PASSWORD === '1' && args.password === 'test123') {
        logger.debug('Using development password shortcut');
        isValidPassword = true;
      } else if (user.password && user.password.startsWith('$2')) {
        isValidPassword = await bcrypt.compare(args.password, user.password);
        logger.debug('Bcrypt comparison result', { valid: isValidPassword });
      } else {
        isValidPassword = user.password === args.password;
        logger.debug('Plain text comparison result', { valid: isValidPassword });
      }

      if (!isValidPassword) {
        logger.warn('Login failed: invalid password', { email: args.email });
        throw new Error('Invalid email or password');
      }

      await usersCollection.updateOne(
        { _id: user._id },
        { $set: { lastLogin: new Date() } }
      );

      // JWT carries identity + role tier — actual permissions are computed
      // server-side from the DB on each request (see context.ts).
      const token = jwtService.sign({
        userId: user._id.toString(),
        email: user.email,
        firstName: user.firstName || 'User',
        lastName: user.lastName || '',
        displayName: `${user.firstName || 'User'} ${user.lastName || ''}`.trim(),
        systemRole: user.systemRole || 'DEPARTMENT_USER',
        departments: user.departments || [],
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
          departments: user.departments || [],
        },
      };
    },
  },
};

export default authResolvers;
