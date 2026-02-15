import { ObjectId } from 'mongodb';
import bcrypt from 'bcrypt';
import { connectMongoDB } from '../config/mongodb';
import { jwtService } from '../services/jwtService';
import { config } from '../config';

// Helper function to get current user from context
async function getCurrentUser(context: any) {
  if (!context.user || !context.user.userId) {
    throw new Error('Not authenticated');
  }
  const db = await connectMongoDB();
  const user = await db.collection('users').findOne({ _id: new ObjectId(context.user.userId) });
  if (!user) {
    throw new Error('User not found');
  }
  return user;
}

export const userResolvers = {
  Query: {
    // Get all users with optional filtering
    users: async (_: any, { filter }: { filter?: any }, context: any) => {
      const currentUser = await getCurrentUser(context);
      
      // Check if user has permission to view all users
      if (!['SYSTEM_ADMIN', 'IT_ADMIN'].includes(currentUser.systemRole)) {
        // Department admins can only see users in their departments
        if (currentUser.systemRole === 'DEPARTMENT_ADMIN') {
          const userDepartments = currentUser.departments.map((d: any) => d.departmentId);
                  // Expand MCR to include related departments
        const expandedDepartments = [...userDepartments];
        userDepartments.forEach((deptId: string) => {
          if (deptId === 'MCR' || deptId.startsWith('MCR')) {
            // Add base departments
            if (!expandedDepartments.includes('Playout')) expandedDepartments.push('Playout');
            if (!expandedDepartments.includes('Ingest')) expandedDepartments.push('Ingest');
            // Add MCR-prefixed departments
            if (!expandedDepartments.includes('MCR-Playout')) expandedDepartments.push('MCR-Playout');
            if (!expandedDepartments.includes('MCR-Ingest')) expandedDepartments.push('MCR-Ingest');
            if (!expandedDepartments.includes('MCR-General')) expandedDepartments.push('MCR-General');
          }
        });
          filter = { ...filter, departmentId: { $in: expandedDepartments } };
          console.log('Expanded departments for DEPARTMENT_ADMIN:', expandedDepartments);
        } else {
          throw new Error('Unauthorized to view users');
        }
      }
      
      console.log('Filter before query building:', JSON.stringify(filter, null, 2));
      
      const db = await connectMongoDB();
      const query: any = {};
      
      if (filter) {
        if (filter.isActive !== undefined) query.isActive = filter.isActive;
        if (filter.systemRole) query.systemRole = filter.systemRole;
        if (filter.departmentId) {
          // Handle both old and new department structures
          // Check if departmentId is already a MongoDB query object
          let deptIds: string[] = [];
          if (filter.departmentId.$in) {
            deptIds = filter.departmentId.$in;
          } else if (Array.isArray(filter.departmentId)) {
            deptIds = filter.departmentId;
          } else {
            deptIds = [filter.departmentId];
          }
          
          console.log('Department IDs to query:', deptIds);
          
          // Create query that handles both old and new structures
          query.$or = [
            { 'departments.departmentId': { $in: deptIds } },
            { 'departments.departmentName': { $in: deptIds } },
            { department: { $in: deptIds } }
          ];
        }
        if (filter.searchTerm) {
          if (query.$or) {
            // Combine with existing $or using $and
            query.$and = [
              { $or: query.$or },
              {
                $or: [
                  { firstName: { $regex: filter.searchTerm, $options: 'i' } },
                  { lastName: { $regex: filter.searchTerm, $options: 'i' } },
                  { email: { $regex: filter.searchTerm, $options: 'i' } }
                ]
              }
            ];
            delete query.$or;
          } else {
            query.$or = [
              { firstName: { $regex: filter.searchTerm, $options: 'i' } },
              { lastName: { $regex: filter.searchTerm, $options: 'i' } },
              { email: { $regex: filter.searchTerm, $options: 'i' } }
            ];
          }
        }
      }
      
      console.log('Users query:', JSON.stringify(query, null, 2));
      console.log('Current user systemRole:', currentUser.systemRole);
      const users = await db.collection('users').find(query).toArray();
      console.log(`Found ${users.length} users in users query`);
      return users.map(user => ({
        ...user,
        id: user._id.toString(),
        displayName: `${user.firstName} ${user.lastName}`
      }));
    },
    
    // Get single user by ID
    user: async (_: any, { id }: { id: string }, context: any) => {
      await getCurrentUser(context);
      
      const db = await connectMongoDB();
      const user = await db.collection('users').findOne({ _id: new ObjectId(id) });
      
      if (!user) {
        throw new Error('User not found');
      }
      
      return {
        ...user,
        id: user._id.toString(),
        displayName: `${user.firstName} ${user.lastName}`
      };
    },
    
    // Get current user
    me: async (_: any, __: any, context: any) => {
      const currentUser = await getCurrentUser(context);
      return {
        ...currentUser,
        id: currentUser._id.toString(),
        displayName: `${currentUser.firstName} ${currentUser.lastName}`
      };
    },
    
    // Get users by department
    usersByDepartment: async (_: any, { departmentId }: { departmentId: string }, context: any) => {
      await getCurrentUser(context);
      
      const db = await connectMongoDB();
      const users = await db.collection('users').find({
        'departments.departmentId': departmentId,
        isActive: true
      }).toArray();
      
      return users.map(user => ({
        ...user,
        id: user._id.toString(),
        displayName: `${user.firstName} ${user.lastName}`
      }));
    },
    
    // Get users by system role
    usersBySystemRole: async (_: any, { systemRole }: { systemRole: string }, context: any) => {
      const currentUser = await getCurrentUser(context);
      
      // Only admins can query by system role
      if (!['SYSTEM_ADMIN', 'IT_ADMIN'].includes(currentUser.systemRole)) {
        throw new Error('Unauthorized');
      }
      
      const db = await connectMongoDB();
      const users = await db.collection('users').find({
        systemRole,
        isActive: true
      }).toArray();
      
      return users.map(user => ({
        ...user,
        id: user._id.toString(),
        displayName: `${user.firstName} ${user.lastName}`
      }));
    }
  },
  
  Mutation: {
    // Create new user
    createUser: async (_: any, { input }: { input: any }, context: any) => {
      const currentUser = await getCurrentUser(context);
      
      // Check permissions
      if (!['SYSTEM_ADMIN', 'IT_ADMIN', 'DEPARTMENT_ADMIN'].includes(currentUser.systemRole)) {
        throw new Error('Unauthorized to create users');
      }
      
      // Validate hierarchical permissions
      if (currentUser.systemRole === 'IT_ADMIN' && input.systemRole === 'SYSTEM_ADMIN') {
        throw new Error('IT Admin cannot create System Admin users');
      }
      
      if (currentUser.systemRole === 'DEPARTMENT_ADMIN') {
        // Department admins can only create department users in their departments
        if (input.systemRole !== 'DEPARTMENT_USER') {
          throw new Error('Department Admin can only create Department Users');
        }
        
        const userDepartments = currentUser.departments.map((d: any) => d.departmentId);
        
        // Expand MCR to include related departments
        const expandedDepartments = [...userDepartments];
        userDepartments.forEach((deptId: string) => {
          if (deptId === 'MCR' || deptId.startsWith('MCR')) {
            // Add base departments
            if (!expandedDepartments.includes('Playout')) expandedDepartments.push('Playout');
            if (!expandedDepartments.includes('Ingest')) expandedDepartments.push('Ingest');
            // Add MCR-prefixed departments
            if (!expandedDepartments.includes('MCR-Playout')) expandedDepartments.push('MCR-Playout');
            if (!expandedDepartments.includes('MCR-Ingest')) expandedDepartments.push('MCR-Ingest');
            if (!expandedDepartments.includes('MCR-General')) expandedDepartments.push('MCR-General');
          }
        });
        
        const newUserDepartments = input.departments.map((d: any) => d.departmentId);
        
        if (!newUserDepartments.every((deptId: string) => expandedDepartments.includes(deptId))) {
          throw new Error('Cannot create users for departments you do not manage');
        }
      }
      
      const db = await connectMongoDB();
      
      // Check if email already exists
      const existingUser = await db.collection('users').findOne({ email: input.email });
      if (existingUser) {
        throw new Error('Email already exists');
      }
      
      // Hash password
      const hashedPassword = await bcrypt.hash(input.password, config.BCRYPT_ROUNDS);
      
      // Create user
      const newUser = {
        ...input,
        password: hashedPassword,
        isActive: input.isActive !== false,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: currentUser._id.toString(),
        updatedBy: currentUser._id.toString()
      };
      
      const result = await db.collection('users').insertOne(newUser);
      
      return {
        ...newUser,
        id: result.insertedId.toString(),
        displayName: `${newUser.firstName} ${newUser.lastName}`
      };
    },
    
    // Update user
    updateUser: async (_: any, { id, input }: { id: string, input: any }, context: any) => {
      const currentUser = await getCurrentUser(context);
      
      // Check permissions
      if (!['SYSTEM_ADMIN', 'IT_ADMIN', 'DEPARTMENT_ADMIN'].includes(currentUser.systemRole)) {
        throw new Error('Unauthorized to update users');
      }
      
      const db = await connectMongoDB();
      const targetUser = await db.collection('users').findOne({ _id: new ObjectId(id) });
      
      if (!targetUser) {
        throw new Error('User not found');
      }
      
      // Validate hierarchical permissions
      if (currentUser.systemRole === 'DEPARTMENT_ADMIN') {
        // Department admins can only update users in their departments
        const userDepartments = currentUser.departments.map((d: any) => d.departmentId);
        
        // Expand MCR to include related departments
        const expandedDepartments = [...userDepartments];
        userDepartments.forEach((deptId: string) => {
          if (deptId === 'MCR' || deptId.startsWith('MCR')) {
            // Add base departments
            if (!expandedDepartments.includes('Playout')) expandedDepartments.push('Playout');
            if (!expandedDepartments.includes('Ingest')) expandedDepartments.push('Ingest');
            // Add MCR-prefixed departments
            if (!expandedDepartments.includes('MCR-Playout')) expandedDepartments.push('MCR-Playout');
            if (!expandedDepartments.includes('MCR-Ingest')) expandedDepartments.push('MCR-Ingest');
            if (!expandedDepartments.includes('MCR-General')) expandedDepartments.push('MCR-General');
          }
        });
        
        console.log('🔐 Department Admin Update Check:');
        console.log('  Admin departments:', userDepartments);
        console.log('  Expanded departments:', expandedDepartments);
        console.log('  Target user:', targetUser.email);
        console.log('  Target current departments:', targetUser.departments);
        
        // Get target user's current and new departments
        const targetCurrentDepartments = targetUser.departments.map((d: any) => d.departmentId);
        const targetNewDepartments = input.departments ? input.departments.map((d: any) => d.departmentId) : targetCurrentDepartments;
        
        console.log('  Target current department IDs:', targetCurrentDepartments);
        console.log('  Target new department IDs:', targetNewDepartments);
        console.log('  Input:', JSON.stringify(input, null, 2));
        
        // Check if user has permission for both current and new departments
        const hasPermissionForCurrent = targetCurrentDepartments.some((deptId: string) => expandedDepartments.includes(deptId));
        const hasPermissionForNew = targetNewDepartments.every((deptId: string) => expandedDepartments.includes(deptId));
        
        console.log('  Has permission for current:', hasPermissionForCurrent);
        console.log('  Has permission for new:', hasPermissionForNew);
        
        if (!hasPermissionForCurrent) {
          throw new Error('Cannot update users outside your departments');
        }
        
        if (!hasPermissionForNew) {
          throw new Error('Cannot assign users to departments you do not manage');
        }
        
        // Cannot change system roles (except for role assignments within allowed roles)
        if (input.systemRole && input.systemRole !== targetUser.systemRole && input.systemRole !== 'DEPARTMENT_USER') {
          throw new Error('Department Admin cannot change system roles to admin levels');
        }
      }
      
      // Prepare update
      const updateData: any = {
        ...input,
        updatedAt: new Date(),
        updatedBy: currentUser._id.toString()
      };
      
      // Hash password if provided
      if (input.password) {
        updateData.password = await bcrypt.hash(input.password, config.BCRYPT_ROUNDS);
      }
      
      delete updateData.id;
      
      await db.collection('users').updateOne(
        { _id: new ObjectId(id) },
        { $set: updateData }
      );
      
      const updatedUser = await db.collection('users').findOne({ _id: new ObjectId(id) });
      
      if (!updatedUser) {
        throw new Error('User not found after update');
      }
      
      return {
        ...updatedUser,
        id: updatedUser._id.toString(),
        displayName: `${updatedUser.firstName} ${updatedUser.lastName}`
      };
    },
    
    // Delete user
    deleteUser: async (_: any, { id }: { id: string }, context: any) => {
      const currentUser = await getCurrentUser(context);
      
      // Only system and IT admins can delete users
      if (!['SYSTEM_ADMIN', 'IT_ADMIN'].includes(currentUser.systemRole)) {
        throw new Error('Unauthorized to delete users');
      }
      
      const db = await connectMongoDB();
      
      // Soft delete by setting isActive to false
      await db.collection('users').updateOne(
        { _id: new ObjectId(id) },
        { 
          $set: { 
            isActive: false,
            updatedAt: new Date(),
            updatedBy: currentUser._id.toString()
          }
        }
      );
      
      return true;
    },
    
    // Update own profile
    updateMyProfile: async (_: any, { input }: { input: any }, context: any) => {
      const currentUser = await getCurrentUser(context);
      
      const db = await connectMongoDB();
      
      // Users can only update certain fields of their own profile
      const allowedFields = ['firstName', 'lastName', 'phone', 'mobile'];
      const updateData: any = {};
      
      for (const field of allowedFields) {
        if (input[field] !== undefined) {
          updateData[field] = input[field];
        }
      }
      
      updateData.updatedAt = new Date();
      updateData.updatedBy = currentUser._id.toString();
      
      await db.collection('users').updateOne(
        { _id: new ObjectId(currentUser._id) },
        { $set: updateData }
      );
      
      const updatedUser = await db.collection('users').findOne({ _id: new ObjectId(currentUser._id) });
      
      if (!updatedUser) {
        throw new Error('User not found after update');
      }
      
      return {
        ...updatedUser,
        id: updatedUser._id.toString(),
        displayName: `${updatedUser.firstName} ${updatedUser.lastName}`
      };
    },
    
    // Change password
    changePassword: async (_: any, { oldPassword, newPassword }: { oldPassword: string, newPassword: string }, context: any) => {
      const currentUser = await getCurrentUser(context);
      
      // Verify old password
      const isValidPassword = await bcrypt.compare(oldPassword, currentUser.password);
      if (!isValidPassword) {
        throw new Error('Invalid current password');
      }
      
      const db = await connectMongoDB();
      
      // Hash new password
      const hashedPassword = await bcrypt.hash(newPassword, config.BCRYPT_ROUNDS);
      
      await db.collection('users').updateOne(
        { _id: new ObjectId(currentUser._id) },
        { 
          $set: { 
            password: hashedPassword,
            updatedAt: new Date(),
            updatedBy: currentUser._id.toString()
          }
        }
      );
      
      return true;
    }
  },
  
  // Field resolvers
  User: {
    id: (parent: any) => {
      if (parent._id) {
        return parent._id.toString ? parent._id.toString() : parent._id;
      }
      return parent.id;
    },
    
    displayName: (parent: any) => {
      return parent.displayName || `${parent.firstName || ''} ${parent.lastName || ''}`.trim() || parent.email || 'Unknown User';
    },
    
    department: (parent: any) => {
      // Map departments array to single department for backward compatibility
      if (parent.departments && Array.isArray(parent.departments) && parent.departments.length > 0) {
        return parent.departments[0].departmentName || parent.departments[0].departmentId;
      }
      return parent.department || null;
    },
    
    createdBy: async (parent: any) => {
      if (!parent.createdBy) return null;
      
      const db = await connectMongoDB();
      const user = await db.collection('users').findOne({ _id: new ObjectId(parent.createdBy) });
      
      if (!user) return null;
      
      return {
        ...user,
        id: user._id.toString(),
        displayName: `${user.firstName} ${user.lastName}`
      };
    },
    
    updatedBy: async (parent: any) => {
      if (!parent.updatedBy) return null;
      
      const db = await connectMongoDB();
      const user = await db.collection('users').findOne({ _id: new ObjectId(parent.updatedBy) });
      
      if (!user) return null;
      
      return {
        ...user,
        id: user._id.toString(),
        displayName: `${user.firstName} ${user.lastName}`
      };
    }
  }
}; 