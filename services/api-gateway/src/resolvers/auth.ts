import bcrypt from 'bcrypt';
import { connectMongoDB } from '../config/mongodb';
import { jwtService } from '../services/jwtService';
import { createLogger } from '../utils/logger';
import { computePermissions } from '../rbac';

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

      // Dev shortcut — explicitly opted in AND not in production. Hard-blocked outside development
      // to remove any possibility of "test123" working against a production database.
      const devPasswordAllowed =
        process.env.NODE_ENV !== 'production' &&
        process.env.ALLOW_DEV_PASSWORD === '1';

      if (devPasswordAllowed && args.password === 'test123') {
        logger.warn('Using development password shortcut (NOT for production)');
        isValidPassword = true;
      } else if (user.password && user.password.startsWith('$2')) {
        isValidPassword = await bcrypt.compare(args.password, user.password);
        logger.debug('Bcrypt comparison result', { valid: isValidPassword });
      } else if (process.env.NODE_ENV !== 'production') {
        // Plain-text fallback only allowed in non-production for legacy seed accounts.
        isValidPassword = user.password === args.password;
        logger.debug('Plain text comparison result (dev only)', { valid: isValidPassword });
      } else {
        // Production: any user record without a bcrypt hash is treated as invalid.
        logger.error('Login blocked: user record has no bcrypt hash in production', { email: args.email });
        isValidPassword = false;
      }

      if (!isValidPassword) {
        logger.warn('Login failed: invalid password', { email: args.email });
        throw new Error('Invalid email or password');
      }

      await usersCollection.updateOne(
        { _id: user._id },
        { $set: { lastLogin: new Date() } }
      );

      const computed = computePermissions({
        systemRole: user.systemRole,
        departments: user.departments,
        permissions: user.permissions,
      });
      const effectivePermissions = Array.from(
        (() => {
          const set = new Set(computed.global);
          computed.byDept.forEach((deptPerms) => {
            deptPerms.forEach((perm) => set.add(perm));
          });
          return set;
        })(),
      );

      // JWT carries identity plus effective permissions for client-side UI gates.
      // Server-side authorization still recomputes permissions from the DB on
      // each request (see context.ts), so stale tokens cannot grant API access.
      const token = jwtService.sign({
        userId: user._id.toString(),
        email: user.email,
        firstName: user.firstName || 'User',
        lastName: user.lastName || '',
        displayName: `${user.firstName || 'User'} ${user.lastName || ''}`.trim(),
        systemRole: user.systemRole || 'DEPARTMENT_USER',
        departments: user.departments || [],
        permissions: effectivePermissions,
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
          permissions: effectivePermissions,
        },
      };
    },
  },
};

export default authResolvers;
