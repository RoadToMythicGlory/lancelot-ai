import { ObjectId } from 'mongodb';
import { connectMongoDB } from '../config/mongodb';
import { expandMCRDepartments } from '../utils/departments';

// Department roles configuration - defines number of roles per department
const DEPARTMENT_ROLES: { [key: string]: number } = {
  // IT
  'IT': 1, // Only IT role (Admins not counted for shifts)
  'IT-MEDIA': 2, // Media Systems Engineer, Broadcast IT Specialist
  // MCR
  'MCR-Playout': 2, // Playout Operator, Senior Playout Operator
  'MCR-Ingest': 2, // Ingest Operator, Senior Ingest Operator
  'MCR-General': 2, // MCR Operator, MCR Supervisor
  // Warehouse
  'Warehouse': 2, // Warehouse Manager, Equipment Handler
  // Visuals
  'Visuals-VideoEditors': 2, // Video Editor, Senior Video Editor
  // New Media
  'NewMedia-Producers': 2, // Producer, Senior Producer
  'NewMedia-Editors': 2, // Editor, Senior Editor
  'NewMedia-Analysts': 2, // Analyst, Senior Analyst
  // News
  'News-Producers': 2, // News Producer, Senior News Producer
  'News-Desk': 2, // Desk Editor, Senior Desk Editor
  'News-Editors': 2, // News Editor, Senior News Editor
  'News-ProductionAssistants': 2, // Production Assistant, Senior Production Assistant
  'News-Researchers': 2, // Researcher, Senior Researcher
  // Production
  'Production-VTR': 2, // VTR Operator, Senior VTR Operator
  'Production-Directors': 2, // Director, Senior Director
  'Production-CG': 2, // CG Operator, Senior CG Operator
  'Production-Commentators': 2, // Commentator, Senior Commentator
  'Production-Soundmen': 2, // Sound Engineer, Senior Sound Engineer
  'Production-Technicians': 2, // Technician, Senior Technician
  'Production-ExternalTechnicians': 1 // External Technician
};

// Default number of roles if department not found
const DEFAULT_ROLES_PER_DEPARTMENT = 2;

// Constants for shift calculation
const DAYS_PER_WEEK = 7;
const SHIFTS_PER_DAY = 3;

// Helper function to get MongoDB connection
async function getDB() {
  try {
    const db = await connectMongoDB();
    return db;
  } catch (error) {
    console.error('❌ Failed to get MongoDB connection:', error);
    throw new Error('Failed to connect to MongoDB');
  }
}

// Helper function to check if user is admin
function checkAdminPermission(context: any) {
  if (!context.user) {
    throw new Error('Not authenticated');
  }
  
  // Check if user has admin permissions or is a department/system admin
  const hasAdminPermission = 
    context.user.permissions?.includes('admin') ||
    context.user.permissions?.includes('shift_admin') ||
    context.user.systemRole === 'SYSTEM_ADMIN' ||
    context.user.systemRole === 'IT_ADMIN' ||
    context.user.systemRole === 'DEPARTMENT_ADMIN';
    
  if (!hasAdminPermission) {
    throw new Error('Admin permission required');
  }
}

// Helper function to verify authenticated user from JWT
function checkAuthentication(context: any) {
  console.log('🔍 Shifts resolver - checking auth context:', {
    hasUser: !!context.user,
    userId: context.user?.userId,
    email: context.user?.email,
    role: context.user?.role,
    systemRole: context.user?.systemRole
  });
  
  if (!context.user || !context.user.userId || !context.user.email) {
    console.error('❌ Authentication failed in shifts resolver');
    throw new Error('Not authenticated - valid JWT token required');
  }
}

// Helper function to get the start of the week (Sunday)
function getWeekStartDate(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day;
  return new Date(d.setDate(diff));
}

export const shiftsResolvers = {
  Query: {
    // All shifts (admin only)
    shifts: async (_: any, args: any, context: any) => {
      checkAuthentication(context);
      
      const db = await getDB();
      const query: any = {
        date: {
          $gte: new Date(args.startDate),
          $lte: new Date(args.endDate)
        }
      };
      
      if (args.department) query.department = args.department;
      if (args.userId) query['assignedWorkers.userId'] = args.userId;
      
      return await db.collection('shifts').find(query).toArray();
    },

    shift: async (_: any, args: any, context: any) => {
      checkAuthentication(context);
      
      const db = await getDB();
      return await db.collection('shifts').findOne({ _id: new ObjectId(args.id) });
    },

    myUpcomingShifts: async (_: any, args: any, context: any) => {
      checkAuthentication(context);
      
      const db = await getDB();
      const limit = args.limit || 100;
      
      console.log('🔍 myUpcomingShifts - Debug Info:', {
        contextUserId: context.user.userId,
        contextEmail: context.user.email
      });
      
      // Get current date and time to filter out past shifts
      const now = new Date();
      // Get start of today for date comparison
      const todayStart = new Date(now);
      todayStart.setHours(0, 0, 0, 0);
      
      // First, let's check a sample shift to see how userIds are stored
      const sampleShift = await db.collection('shifts')
        .findOne({ assignedWorkers: { $exists: true, $ne: [] } });
      
      if (sampleShift && sampleShift.assignedWorkers?.length > 0) {
        console.log('📊 Sample shift assignedWorkers:', {
          shiftId: sampleShift._id.toString(),
          firstWorker: {
            userId: sampleShift.assignedWorkers[0].userId,
            userIdType: typeof sampleShift.assignedWorkers[0].userId,
            userIdLength: sampleShift.assignedWorkers[0].userId?.length
          }
        });
      }
      
      // Get the user from DB to ensure we have the correct ID format
      const userFromDb = await db.collection('users').findOne({ email: context.user.email });
      
      if (!userFromDb) {
        console.error('❌ User not found in database by email:', context.user.email);
        return [];
      }
      
      const dbUserId = userFromDb._id.toString();
      console.log('🔍 User lookup result:', {
        dbUserId: dbUserId,
        contextUserId: context.user.userId,
        match: dbUserId === context.user.userId
      });
      
      // Try multiple query approaches
      const queries = [
        { 'assignedWorkers.userId': dbUserId },
        { 'assignedWorkers.userId': context.user.userId },
        { 'assignedWorkers.user.id': dbUserId },
        { 'assignedWorkers.user.id': context.user.userId }
      ];
      
      let shifts: any[] = [];
      for (const query of queries) {
        // Create a query that filters out past shifts
        // Simply filter for dates greater than or equal to today's start
        const testQuery = {
          ...query,
          date: { $gte: todayStart }
        };
        
        const result = await db.collection('shifts')
          .find(testQuery)
          .limit(1)
          .toArray();
          
        if (result.length > 0) {
          console.log('✅ Found shifts with query:', query);
          shifts = await db.collection('shifts')
            .find(testQuery)
            .sort({ date: 1, startTime: 1 })
            .limit(limit)
            .toArray();
          break;
        }
      }
      
      if (shifts.length === 0) {
        console.log('❌ No shifts found with any query approach');
        
        // Debug: Check all shifts for this user without date filter
        const allShiftsNoDate = await db.collection('shifts')
          .find({ 'assignedWorkers.userId': dbUserId })
          .limit(5)
          .toArray();
        console.log('📊 Shifts without date filter:', allShiftsNoDate.length);
        
        if (allShiftsNoDate.length > 0) {
          console.log('📅 First shift date:', allShiftsNoDate[0].date);
          console.log('📅 Current time filter:', now);
        }
        
        // Also try with context.user.userId with date filter
        if (shifts.length === 0) {
          const contextUserShifts = await db.collection('shifts')
            .find({ 
              'assignedWorkers.userId': context.user.userId,
              date: { $gte: todayStart }
            })
            .sort({ date: 1, startTime: 1 })
            .limit(limit)
            .toArray();
          console.log('📊 Shifts with context.userId (with date filter):', contextUserShifts.length);
          
          if (contextUserShifts.length > 0) {
            console.log('✅ Found upcoming shifts with context userId');
            shifts = contextUserShifts;
          }
        }
      }
      
      // Filter out today's shifts that have already ended
      const filteredShifts = shifts.filter((shift: any) => {
        const shiftDate = new Date(shift.date);
        
        // If it's a future date, include it
        if (shiftDate > now) {
          return true;
        }
        
        // If it's today, check if the shift has ended
        if (shiftDate.toDateString() === now.toDateString()) {
          // If no end time, assume the shift is still valid
          if (!shift.endTime) {
            return true;
          }
          
          // Parse the end time and compare with current time
          const [endHour, endMinute] = shift.endTime.split(':').map(Number);
          const shiftEndTime = new Date(shiftDate);
          shiftEndTime.setHours(endHour, endMinute, 0, 0);
          
          // Include shift if it hasn't ended yet
          return shiftEndTime > now;
        }
        
        // Past date - exclude
        return false;
      });
      
      console.log(`📊 Filtered ${shifts.length} shifts to ${filteredShifts.length} upcoming shifts`);
      
      return filteredShifts;
    },

    // Shift Templates queries
    shiftTemplates: async (_: any, args: any, context: any) => {
      checkAuthentication(context);
      checkAdminPermission(context);
      
      const db = await getDB();
      const query: any = {};
      
      if (args.department) query.department = args.department;
      if (args.active !== undefined) query.active = args.active;
      
      return await db.collection('shift_templates').find(query).toArray();
    },

    shiftTemplate: async (_: any, args: any, context: any) => {
      checkAuthentication(context);
      checkAdminPermission(context);
      
      const db = await getDB();
      return await db.collection('shift_templates').findOne({ _id: new ObjectId(args.id) });
    },

    // Shift Swap Requests queries
    shiftSwapRequests: async (_: any, args: any, context: any) => {
      checkAuthentication(context);
      checkAdminPermission(context);
      
      const db = await getDB();
      const query: any = {};
      
      if (args.status) query.status = args.status;
      if (args.userId) {
        query.$or = [
          { requestingUserId: args.userId },
          { targetUserId: args.userId }
        ];
      }
      
      return await db.collection('shift_swap_requests').find(query).toArray();
    },

    myShiftSwapRequests: async (_: any, args: any, context: any) => {
      if (!context.user) throw new Error('Not authenticated');
      
      const db = await getDB();
      return await db.collection('shift_swap_requests')
        .find({
          $or: [
            { requestingUserId: context.user.userId },
            { targetUserId: context.user.userId }
          ]
        })
        .toArray();
    },

    incomingShiftSwapRequests: async (_: any, args: any, context: any) => {
      if (!context.user) throw new Error('Not authenticated');
      
      const db = await getDB();
      const query: any = {
        targetUserId: context.user.userId
      };
      
      if (args.status) {
        query.status = args.status;
      }
      
      console.log('🔍 Incoming swap requests query:', query);
      console.log('🔍 Current user ID:', context.user.userId);
      
      const requests = await db.collection('shift_swap_requests').find(query).toArray();
      console.log(`📊 Found ${requests.length} incoming swap requests`);
      
      if (requests.length > 0) {
        console.log('📊 Sample request:', JSON.stringify(requests[0], null, 2));
      }
      
      return requests;
    },

    // Vacation Requests queries
    vacationRequests: async (_: any, args: any, context: any) => {
      if (!context.user) throw new Error('Not authenticated');
      checkAdminPermission(context);
      
      const db = await getDB();
      const query: any = {};
      
      if (args.status) query.status = args.status;
      if (args.userId) query.userId = args.userId;
      
      // Always ensure userId exists
      if (!query.userId) {
        query.userId = { $exists: true, $ne: null };
      }
      
      const requests = await db.collection('vacation_requests').find(query).toArray();
      
      console.log(`📊 Vacation requests query:`, query);
      console.log(`📊 Found ${requests.length} vacation requests`);
      
      // Log details of each request
      requests.forEach((req, index) => {
        console.log(`  Request ${index + 1}:`, {
          _id: req._id,
          userId: req.userId,
          userIdType: typeof req.userId,
          status: req.status,
          startDate: req.startDate
        });
      });
      
      // Return all requests - the VacationRequest resolver will handle user lookup
      return requests;
    },

    myVacationRequests: async (_: any, args: any, context: any) => {
      if (!context.user) throw new Error('Not authenticated');
      
      const db = await getDB();
      return await db.collection('vacation_requests')
        .find({ userId: context.user.userId })
        .toArray();
    },

    // Availability Constraints queries
    availabilityConstraints: async (_: any, args: any, context: any) => {
      if (!context.user) throw new Error('Not authenticated');
      
      const db = await getDB();
      const weekStart = getWeekStartDate(new Date(args.weekStartDate));
      const query: any = { weekStartDate: weekStart };
      
      if (args.userId) {
        checkAdminPermission(context);
        query.userId = args.userId;
      }
      
      return await db.collection('availability_constraints').find(query).toArray();
    },

    myAvailabilityConstraints: async (_: any, args: any, context: any) => {
      if (!context.user) throw new Error('Not authenticated');
      
      const db = await getDB();
      const weekStart = getWeekStartDate(new Date(args.weekStartDate));
      
      const constraint = await db.collection('availability_constraints').findOne({
        userId: context.user.userId,
        weekStartDate: weekStart
      });
      
      if (!constraint) return null;
      
      // Ensure id field is returned for GraphQL
      return {
        ...constraint,
        id: constraint._id?.toString() || constraint.id
      };
    },

    // Employee Settings queries
    employeeSettings: async (_: any, args: any, context: any) => {
      if (!context.user) throw new Error('Not authenticated');
      
      const db = await getDB();
      
      // Users can view their own settings, admins can view anyone's
      if (args.userId !== context.user.userId) {
        checkAdminPermission(context);
      }
      
      return await db.collection('employee_settings').findOne({ userId: args.userId });
    },

    myEmployeeSettings: async (_: any, args: any, context: any) => {
      if (!context.user) throw new Error('Not authenticated');
      
      const db = await getDB();
      return await db.collection('employee_settings').findOne({ userId: context.user.userId });
    },

    allEmployeeSettings: async (_: any, args: any, context: any) => {
      if (!context.user) throw new Error('Not authenticated');
      checkAdminPermission(context);
      
      const db = await getDB();
      return await db.collection('employee_settings').find({}).toArray();
    },

    // Statistics queries
    shiftAssignmentStats: async (_: any, args: any, context: any) => {
      if (!context.user) throw new Error('Not authenticated');
      checkAdminPermission(context);
      
      const db = await getDB();
      const weekStart = getWeekStartDate(new Date(args.weekStartDate));
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 7);
      
      const shifts = await db.collection('shifts')
        .find({
          date: {
            $gte: weekStart,
            $lt: weekEnd
          }
        })
        .toArray();
      
      // Calculate statistics
      const stats = {
        weekStartDate: weekStart.toISOString(),
        totalShifts: shifts.length,
        assignedShifts: 0,
        unassignedShifts: 0,
        assignmentPercentage: 0,
        departmentStats: [] as any[]
      };
      
      const departmentMap = new Map();
      
      // Initialize total actual assignments counter
      let totalActualAssignments = 0;
      let totalShiftsWithAssignments = 0;
      
      shifts.forEach((shift: any) => {
        const assigned = shift.assignedWorkers ? shift.assignedWorkers.length : 0;
        const required = shift.requiredWorkers || 0;
        const fullyAssigned = assigned >= required;
        
        // Count actual assignments (number of workers assigned)
        totalActualAssignments += assigned;
        
        // Count shifts that have at least one assignment
        if (assigned > 0) {
          totalShiftsWithAssignments++;
        }
        
        if (fullyAssigned) {
          stats.assignedShifts++;
        } else {
          stats.unassignedShifts++;
        }
        
        // Department stats
        if (!departmentMap.has(shift.department)) {
          departmentMap.set(shift.department, {
            department: shift.department,
            totalShifts: 0,
            assignedShifts: 0,
            unassignedShifts: 0,
            assignmentPercentage: 0,
            actualAssignments: 0, // Track actual number of assignments
            shiftsWithAssignments: 0 // Track shifts with at least one assignment
          });
        }
        
        const deptStats = departmentMap.get(shift.department);
        deptStats.totalShifts++;
        deptStats.actualAssignments += assigned; // Add actual assignments
        if (assigned > 0) {
          deptStats.shiftsWithAssignments++; // Count this shift as having assignments
        }
        if (fullyAssigned) {
          deptStats.assignedShifts++;
        } else {
          deptStats.unassignedShifts++;
        }
      });
      
      // Calculate percentages based on shifts with assignments vs possible shifts
      // For overall stats, calculate total possible shifts across all departments
      let totalPossibleAssignments = 0;
      departmentMap.forEach((deptStats: any, deptName: string) => {
        const rolesInDepartment = DEPARTMENT_ROLES[deptName] || DEFAULT_ROLES_PER_DEPARTMENT;
        totalPossibleAssignments += DAYS_PER_WEEK * SHIFTS_PER_DAY * rolesInDepartment;
      });
      
      stats.assignmentPercentage = totalPossibleAssignments > 0 
        ? Math.round((totalShiftsWithAssignments / totalPossibleAssignments) * 100 * 10) / 10
        : 0;
      
      departmentMap.forEach((deptStats: any, deptName: string) => {
        const rolesInDepartment = DEPARTMENT_ROLES[deptName] || DEFAULT_ROLES_PER_DEPARTMENT;
        const possibleAssignments = DAYS_PER_WEEK * SHIFTS_PER_DAY * rolesInDepartment;
        deptStats.assignmentPercentage = Math.round((deptStats.shiftsWithAssignments / possibleAssignments) * 100 * 10) / 10;
        stats.departmentStats.push(deptStats);
      });
      
      return stats;
    },

    // Admin queries
    getShiftsByWeek: async (_: any, args: any, context: any) => {
      checkAuthentication(context);
      
      const db = await getDB();
      const weekOffset = args.weekOffset || 0;
      const currentDate = new Date();
      const weekStart = new Date(currentDate);
      weekStart.setDate(currentDate.getDate() - currentDate.getDay() + (weekOffset * 7));
      weekStart.setHours(0, 0, 0, 0);
      
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);
      weekEnd.setHours(23, 59, 59, 999);
      
      console.log('getShiftsByWeek date range:', {
        weekStart: weekStart.toISOString(),
        weekEnd: weekEnd.toISOString(),
        weekOffset
      });
      
      const shifts = await db.collection('shifts').find({
        date: { $gte: weekStart, $lte: weekEnd }
      }).toArray();
      
      console.log(`Found ${shifts.length} shifts in date range`);
      
      // Log any shifts with custom times
      const shiftsWithCustomTimes = shifts.filter(s => s.startTime || s.endTime);
      if (shiftsWithCustomTimes.length > 0) {
        console.log('Shifts with custom times:', shiftsWithCustomTimes.map(s => ({
          id: s._id.toString(),
          date: s.date,
          startTime: s.startTime,
          endTime: s.endTime,
          shiftType: s.shiftType,
          department: s.department
        })));
      }
      
      // Collect all unique user IDs from assigned workers
      const userIds = new Set<string>();
      shifts.forEach((shift: any) => {
        if (shift.assignedWorkers) {
          shift.assignedWorkers.forEach((worker: any) => {
            if (worker.userId) {
              userIds.add(worker.userId);
            }
          });
        }
      });
      
      // Fetch all users from database
      const userMap = new Map();
      if (userIds.size > 0) {
        const users = await db.collection('users').find({
          _id: { $in: Array.from(userIds).map((id: string) => new ObjectId(id)) }
        }).toArray();
        
        users.forEach((user: any) => {
          userMap.set(user._id.toString(), {
            id: user._id.toString(),
            displayName: user.displayName || `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'Unknown User',
            firstName: user.firstName || '',
            lastName: user.lastName || '',
            email: user.email || '',
                            department: user.departments && user.departments.length > 0 ? user.departments[0].departmentName : ''
          });
        });
      }
      
      const stats = {
        total: shifts.length,
        assigned: 0,
        unassigned: 0,
        actualAssignments: 0,  // Add counter for actual assignments
        shiftsWithAssignments: 0  // Count shifts that have at least one person
      };
      
      // Count departments in this week's shifts
      const departmentsInWeek = new Set<string>();
      
      shifts.forEach((shift: any) => {
        if (shift.department) {
          departmentsInWeek.add(shift.department);
        }
        
        const assignedWorkers = shift.assignedWorkers ? shift.assignedWorkers.length : 0;
        stats.actualAssignments += assignedWorkers;
        
        if (assignedWorkers > 0) {
          stats.assigned++;
          stats.shiftsWithAssignments++;  // Count this as one assigned shift
        } else {
          stats.unassigned++;
        }
      });
      
      // Calculate completion percentage based on actual department configuration
      let totalPossibleAssignments = 0;
      
      // Get department configurations for accurate calculation
      const departmentConfigs = await db.collection('departmentShiftConfigs').find({
        departmentId: { $in: Array.from(departmentsInWeek) }
      }).toArray();
      
      // Create a map of department configs for easy lookup
      const deptConfigMap = new Map();
      departmentConfigs.forEach(config => {
        deptConfigMap.set(config.departmentId, config);
      });
      
      // Calculate total possible assignments based on actual configuration
      for (const dept of departmentsInWeek) {
        const deptConfig = deptConfigMap.get(dept);
        
        if (deptConfig) {
          // Count enabled shift types
          const enabledShiftTypes = (deptConfig.shiftTypes || []).filter((st: any) => st.enabled);
          const shiftTypesPerDay = enabledShiftTypes.length;
          
          // Count department roles
          const rolesCount = (deptConfig.departmentRoles || []).length;
          
          // For each day, each shift type needs the required staff (from shift type config)
          let departmentPossibleAssignments = 0;
          for (const shiftType of enabledShiftTypes) {
            const requiredStaff = shiftType.requiredStaff || 1;
            departmentPossibleAssignments += DAYS_PER_WEEK * requiredStaff;
          }
          
          totalPossibleAssignments += departmentPossibleAssignments;
        } else {
          // Fallback to default calculation if no config found
          const rolesInDepartment = DEPARTMENT_ROLES[dept] || DEFAULT_ROLES_PER_DEPARTMENT;
          totalPossibleAssignments += DAYS_PER_WEEK * SHIFTS_PER_DAY * rolesInDepartment;
        }
      }
      
      // Calculate percentage based on actual assignments vs total possible assignments
      const rawPercentage = totalPossibleAssignments > 0 
        ? (stats.actualAssignments / totalPossibleAssignments) * 100 
        : 0;
      
      // Round to 1 decimal place
      const completionPercentage = Math.round(rawPercentage * 10) / 10;
      
      // Debug logging
      console.log('Shift Stats Debug:', {
        departmentsInWeek: Array.from(departmentsInWeek),
        totalShifts: shifts.length,
        shiftsWithAssignments: stats.shiftsWithAssignments,
        actualAssignments: stats.actualAssignments,
        totalPossibleAssignments,
        rawPercentage,
        completionPercentage,
        calculation: `${stats.actualAssignments} actual assignments / ${totalPossibleAssignments} possible assignments * 100 = ${rawPercentage} (rounded to ${completionPercentage})`
      });
      
      // Map shifts to include user field (first assigned worker)
      const mappedShifts = shifts.map((shift: any) => ({
        ...shift,
        id: shift._id.toString(),
        user: shift.assignedWorkers && shift.assignedWorkers.length > 0 && shift.assignedWorkers[0].userId
          ? userMap.get(shift.assignedWorkers[0].userId) || null
          : null
      }));
      
      return {
        weekStart: weekStart.toISOString(),
        weekEnd: weekEnd.toISOString(),
        completionPercentage,
        shifts: mappedShifts,
        stats
      };
    },

    getShiftTemplates: async (_: any, args: any, context: any) => {
      checkAuthentication(context);
      
      const db = await getDB();
      const templates = await db.collection('shiftTemplates').find({}).toArray();
      
      // Transform for compatibility with frontend
      return templates.map((template: any) => ({
        ...template,
        id: template._id,
        departments: template.departments || [template.department],
        daysOfWeek: template.daysOfWeek || [template.dayOfWeek],
        isActive: template.active || false
      }));
    },

    // Shift Role Templates queries
    shiftRoleTemplates: async (_: any, { departmentId }: { departmentId: string }, context: any) => {
      checkAuthentication(context);
      
      const db = await getDB();
      const templates = await db.collection('shiftRoleTemplates').find({ 
        departmentId,
        isActive: true 
      }).toArray();
      
      return templates.map((template: any) => ({
        ...template,
        id: template._id.toString()
      }));
    },

    shiftRoleTemplate: async (_: any, { id }: { id: string }, context: any) => {
      checkAuthentication(context);
      
      const db = await getDB();
      const template = await db.collection('shiftRoleTemplates').findOne({ 
        _id: new ObjectId(id) 
      });
      
      if (!template) return null;
      
      return {
        ...template,
        id: template._id.toString()
      };
    },

    getSpecialRequests: async (_: any, args: any, context: any) => {
      checkAuthentication(context);
      
      const db = await getDB();
      const currentUser = context.user;
      
      // Check if user is a department admin
      if (currentUser.systemRole !== 'DEPARTMENT_ADMIN' && 
          currentUser.systemRole !== 'SYSTEM_ADMIN' && 
          currentUser.systemRole !== 'IT_ADMIN') {
        return [];
      }
      
      // Get admin's departments with MCR expansion
      let adminDepartments: string[] = [];
      if (currentUser.systemRole === 'DEPARTMENT_ADMIN') {
        adminDepartments = currentUser.departments?.map((d: any) => d.departmentId) || [];
        console.log('Admin departments before expansion:', adminDepartments);
        
        adminDepartments = expandMCRDepartments(adminDepartments, { includeBaseMCR: false });
        console.log('Admin departments after expansion:', adminDepartments);
      }
      
      const query: any = {};
      if (args.status) {
        query.status = args.status;
      }
      
      // Get vacation requests
      const vacationRequests = await db.collection('vacation_requests').find(query).toArray();
      console.log('Vacation requests found:', vacationRequests.length);
      console.log('Query used:', query);
      if (vacationRequests.length > 0) {
        console.log('Sample vacation request:', JSON.stringify(vacationRequests[0], null, 2));
      }
      
      // Get shift swap requests
      const shiftSwapRequests = await db.collection('shift_swap_requests').find(query).toArray();
      console.log('Shift swap requests found:', shiftSwapRequests.length);
      
      // Get other special requests if they exist
      let specialRequests: any[] = [];
      try {
        specialRequests = await db.collection('specialRequests').find(query).toArray();
      } catch (error) {
        // Collection might not exist
      }
      
      // Combine all requests
      const allRequests = [
        ...vacationRequests.map((req: any) => ({
          ...req,
          type: 'vacation',
          date: req.startDate,
          reason: `${req.vacationType} - ${req.reason || 'חופשה'} (${new Date(req.startDate).toLocaleDateString('he-IL')} - ${new Date(req.endDate).toLocaleDateString('he-IL')})`
        })),
        ...shiftSwapRequests.map((req: any) => ({
          ...req,
          userId: req.requestingUserId, // Map requestingUserId to userId for consistent handling
          type: 'shiftSwap',
          date: req.createdAt,
          reason: `החלפת משמרת - ${req.reason || 'ללא סיבה'}`
        })),
        ...specialRequests
      ];
      
      // Get all user IDs
      const userIds = [...new Set(allRequests.map((r: any) => r.userId))];
      console.log('User IDs from requests:', userIds);
      if (userIds.length === 0) return [];
      
      // Try to handle both string and ObjectId formats
      const objectIds = userIds.map((id: string) => {
        try {
          return new ObjectId(id);
        } catch (e) {
          console.log(`Failed to convert userId to ObjectId: ${id}`);
          return null;
        }
      }).filter(id => id !== null);
      
      const users = await db.collection('users').find({
        _id: { $in: objectIds }
      }).toArray();
      
      console.log('Found users:', users.length);
      const userMap = new Map(users.map((u: any) => [u._id.toString(), u]));
      console.log('UserMap keys:', Array.from(userMap.keys()));
      
      // Filter requests based on user's department
      const filteredRequests = allRequests.filter((request: any) => {
        const user = userMap.get(request.userId);
        console.log(`Looking for user with ID ${request.userId}, found:`, !!user);
        if (!user) return false;
        
        // System/IT admins can see all requests
        if (currentUser.systemRole === 'SYSTEM_ADMIN' || currentUser.systemRole === 'IT_ADMIN') {
          return true;
        }
        
        // Department admins can only see requests from their departments
        const userDepartments = user.departments?.map((d: any) => d.departmentId) || [];
        return userDepartments.some((deptId: string) => adminDepartments.includes(deptId));
      });
      
      const result = filteredRequests.map((request: any) => {
        const user = userMap.get(request.userId);
        console.log(`Mapping request ${request._id}, userId: ${request.userId}, found user:`, !!user);
        if (!user) {
          console.log('User not found in userMap for userId:', request.userId);
          console.log('Available userMap keys:', Array.from(userMap.keys()));
        }
        return {
          ...request,
          id: request._id.toString(),
          user: user ? {
            id: user._id.toString(),
            firstName: user.firstName,
            lastName: user.lastName,
            displayName: user.displayName,
            email: user.email,
            department: user.department || user.departments?.[0]?.departmentId
          } : {
            id: request.userId,
            displayName: 'Unknown User',
            department: null,
            firstName: 'Unknown',
            lastName: 'User',
            email: 'unknown@user.com'
          }
        };
      });
      
      console.log('Total special requests (including vacation):', result.length);
      if (result.length > 0) {
        console.log('Sample result being returned:', JSON.stringify(result[0], null, 2));
      }
      return result;
    },

    getAllShifts: async (_: any, args: any, context: any) => {
      checkAuthentication(context);
      
      const db = await getDB();
      const query: any = {};
      
      if (args.startDate && args.endDate) {
        query.date = {
          $gte: new Date(args.startDate),
          $lte: new Date(args.endDate)
        };
      }
      
      const shifts = await db.collection('shifts').find(query).toArray();
      
      // Populate user data for assigned workers
      const userIds = new Set<string>();
      shifts.forEach((shift: any) => {
        if (shift.assignedWorkers) {
          shift.assignedWorkers.forEach((worker: any) => {
            userIds.add(worker.userId);
          });
        }
      });
      
      const users = await db.collection('users').find({
        _id: { $in: Array.from(userIds).map((id: string) => new ObjectId(id)) }
      }).toArray();
      
      const userMap = new Map(users.map((u: any) => [u._id.toString(), u]));
      
      return shifts.map((shift: any) => ({
        ...shift,
        id: shift._id,
        user: shift.assignedWorkers?.[0] ? userMap.get(shift.assignedWorkers[0].userId) : null
      }));
    },

    getVacationRequests: async (_: any, args: any, context: any) => {
      checkAuthentication(context);
      
      const db = await getDB();
      const requests = await db.collection('vacation_requests').find({}).toArray();
      
      // Populate user data
      const userIds = [...new Set(requests.map((r: any) => r.userId))];
      const users = await db.collection('users').find({
        _id: { $in: userIds.map((id: string) => new ObjectId(id)) }
      }).toArray();
      
      const userMap = new Map(users.map((u: any) => [u._id.toString(), u]));
      
      return requests.map((request: any) => ({
        ...request,
        id: request._id,
        user: userMap.get(request.userId) || { id: request.userId, displayName: 'Unknown User' }
      }));
    },

    // User queries
    users: async (_: any, args: any, context: any) => {
      checkAuthentication(context);
      
      const db = await getDB();
      const users = await db.collection('users').find({}).toArray();
      
      return users.map((user: any) => ({
        ...user,
        id: user._id,
        displayName: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email
      }));
    },

    // Department Shift Configuration
    departmentShiftConfig: async (_: any, { departmentId }: { departmentId: string }, context: any) => {
      try {
        const db = await connectMongoDB();
        const config = await db.collection('department_shift_configs').findOne({ departmentId });
        
        if (!config) {
          // Return default configuration if none exists
          return {
            id: new ObjectId().toString(),
            departmentId,
            departmentName: 'Default',
            departmentRoles: [],
            shiftTypes: [
              {
                type: 'morning',
                label: 'בוקר',
                color: '#ffd93d',
                defaultStartTime: '07:00',
                defaultEndTime: '15:00',
                enabled: true,
                requiredStaff: 1
              },
              {
                type: 'afternoon',
                label: 'צהריים',
                color: '#ff9800',
                defaultStartTime: '15:00',
                defaultEndTime: '23:00',
                enabled: true,
                requiredStaff: 1
              },
              {
                type: 'night',
                label: 'לילה',
                color: '#f44336',
                defaultStartTime: '23:00',
                defaultEndTime: '07:00',
                enabled: true,
                requiredStaff: 1
              }
            ],
            weeklyPatterns: [],
            constraints: {
              minRestBetweenShifts: 11,
              maxConsecutiveDays: 6,
              maxShiftsPerWeek: 5,
              maxNightShiftsPerWeek: 2,
              requireApprovalForSwaps: true,
              autoAssignEnabled: false,
              allowOvertime: true,
              overtimeThresholdHours: 40
            },
            notifications: {
              sendShiftReminders: true,
              reminderHoursBefore: 24,
              sendSwapRequests: true,
              sendScheduleUpdates: true
            },
            metadata: {
              createdBy: context.user?.userId || 'system',
              createdAt: new Date(),
              updatedAt: new Date(),
              lastModifiedBy: context.user?.userId || 'system'
            },
            useTemplateSystem: false
          };
        }
        
        // Ensure all required fields have values
        return {
          id: config._id.toString(),
          departmentId: config.departmentId,
          departmentName: config.departmentName || 'Default',
          shiftTypes: config.shiftTypes || [
            {
              type: 'morning',
              label: 'בוקר',
              color: '#ffd93d',
              defaultStartTime: '07:00',
              defaultEndTime: '15:00',
              enabled: true,
              requiredStaff: 1
            },
            {
              type: 'afternoon',
              label: 'צהריים',
              color: '#ff9800',
              defaultStartTime: '15:00',
              defaultEndTime: '23:00',
              enabled: true,
              requiredStaff: 1
            },
            {
              type: 'night',
              label: 'לילה',
              color: '#f44336',
              defaultStartTime: '23:00',
              defaultEndTime: '07:00',
              enabled: true,
              requiredStaff: 1
            }
          ],
          departmentRoles: config.departmentRoles || [],
          weeklyPatterns: config.weeklyPatterns || [],
          constraints: {
            minRestBetweenShifts: config.constraints?.minRestBetweenShifts ?? 11,
            maxConsecutiveDays: config.constraints?.maxConsecutiveDays ?? 6,
            maxShiftsPerWeek: config.constraints?.maxShiftsPerWeek ?? 5,
            maxNightShiftsPerWeek: config.constraints?.maxNightShiftsPerWeek ?? 2,
            requireApprovalForSwaps: config.constraints?.requireApprovalForSwaps ?? false,
            autoAssignEnabled: config.constraints?.autoAssignEnabled ?? false,
            allowOvertime: config.constraints?.allowOvertime ?? false,
            overtimeThresholdHours: config.constraints?.overtimeThresholdHours ?? 40
          },
          notifications: config.notifications || {
            sendShiftReminders: true,
            reminderHoursBefore: 24,
            sendSwapRequests: true,
            sendScheduleUpdates: true
          },
          metadata: {
            createdBy: config.metadata?.createdBy || context.user?.userId || 'system',
            createdAt: config.metadata?.createdAt || new Date(),
            updatedAt: config.metadata?.updatedAt || new Date(),
            lastModifiedBy: config.metadata?.lastModifiedBy || context.user?.userId || 'system'
          },
          useTemplateSystem: config.useTemplateSystem || false
        };
      } catch (error) {
        console.error('Error fetching department shift config:', error);
        throw new Error('Failed to fetch department shift configuration');
      }
    },

    myDepartmentShiftConfig: async (_: any, __: any, context: any) => {
      console.log('🔍 Shifts resolver - checking auth context:', {
        hasUser: !!context.user,
        userId: context.user?.userId,
        email: context.user?.email,
        role: context.user?.role,
        systemRole: context.user?.systemRole
      });
      
      if (!context.user || !context.user.userId) throw new Error('Not authenticated');
      
      // Since we're using MongoDB for users, let's get the user from there
      const db = await connectMongoDB();
      const user = await db.collection('users').findOne({ _id: new ObjectId(context.user.userId) });
      
      if (!user || !user.departments || user.departments.length === 0) {
        throw new Error('User has no department assigned');
      }
      
      // Get the first department from the departments array
      const userDepartment = user.departments[0].departmentId;
      
      return shiftsResolvers.Query.departmentShiftConfig(_, { departmentId: userDepartment }, context);
    },

    allDepartmentShiftConfigs: async (_: any, __: any, context: any) => {
      try {
        const db = await connectMongoDB();
        const configs = await db.collection('department_shift_configs').find({}).toArray();
        
        return configs.map((config: any) => ({ 
          ...config, 
          id: config._id.toString(),
          useTemplateSystem: config.useTemplateSystem || false 
        }));
      } catch (error) {
        console.error('Error fetching all department configs:', error);
        throw new Error('Failed to fetch department configurations');
      }
    },
    
    // Employee queries
    employees: async (_: any, args: any, context: any) => {
      try {
        checkAuthentication(context);
        // Remove admin check - allow all authenticated users to see employees
        
        const db = await connectMongoDB();  // Use connectMongoDB directly
        const query: any = { isActive: true }; // Only show active users
        
        const expandDepartments = (deptNames: string[]): string[] => {
          return expandMCRDepartments(deptNames, { includeBaseMCR: true });
        };
        
        if (args.department) {
          const depts = expandDepartments([args.department]);
          // Support both old and new department structures
          query.$or = [
            { department: { $in: depts } },
            { 'departments.departmentName': { $in: depts } },
            { 'departments.departmentId': { $in: depts } }
          ];
        }
        
        // For department admins, only show employees from their department
        if (context.user.systemRole === 'DEPARTMENT_ADMIN') {
          const adminUser = await db.collection('users').findOne({ _id: new ObjectId(context.user.userId) });
          if (adminUser?.departments && adminUser.departments.length > 0) {
            const deptNames = adminUser.departments.map((d: any) => d.departmentName || d.departmentId);
            const expandedDepts = expandDepartments(deptNames);
            // Override query to filter by department
            delete query.$or;
            query.$or = [
              { department: { $in: expandedDepts } },
              { 'departments.departmentName': { $in: expandedDepts } },
              { 'departments.departmentId': { $in: expandedDepts } }
            ];
          }
        } else if (!['SYSTEM_ADMIN', 'IT_ADMIN'].includes(context.user.systemRole)) {
          // Regular users can only see users in their own department
          const currentUser = await db.collection('users').findOne({ _id: new ObjectId(context.user.userId) });
          if (currentUser?.departments && currentUser.departments.length > 0) {
            const deptNames = currentUser.departments.map((d: any) => d.departmentName || d.departmentId);
            const expandedDepts = expandDepartments(deptNames);
            // Override query to filter by department
            delete query.$or;
            query.$or = [
              { department: { $in: expandedDepts } },
              { 'departments.departmentName': { $in: expandedDepts } },
              { 'departments.departmentId': { $in: expandedDepts } }
            ];
          }
        }
        
        console.log('Employees query:', JSON.stringify(query, null, 2));
        const users = await db.collection('users').find(query).toArray();
        console.log(`Found ${users.length} users for employees query`);
        if (users.length > 0) {
          console.log('Sample user:', JSON.stringify(users[0], null, 2));
        }
        
        return users.map((user: any) => ({
          ...user,
          id: user._id.toString(),
          displayName: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email,
          department: user.departments && Array.isArray(user.departments) && user.departments.length > 0
            ? (user.departments[0].departmentName || user.departments[0].departmentId)
            : user.department,
          isActive: user.isActive !== false,
          createdAt: user.createdAt || new Date(),
          updatedAt: user.updatedAt || new Date()
        }));
      } catch (error) {
        console.error('Error in employees resolver:', error);
        throw error;
      }
    },
    
    employee: async (_: any, args: any, context: any) => {
      checkAuthentication(context);
      
      // Users can view their own profile, admins can view anyone's
      if (args.id !== context.user.userId) {
        checkAdminPermission(context);
      }
      
      const db = await getDB();
      const user = await db.collection('users').findOne({ _id: new ObjectId(args.id) });
      
      if (!user) return null;
      
      return {
        ...user,
        id: user._id.toString(),
        displayName: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email,
        isActive: user.isActive !== false,
        createdAt: user.createdAt || new Date(),
        updatedAt: user.updatedAt || new Date()
      };
    },
    
    specialDays: async (_: any, args: any, context: any) => {
      try {
        checkAuthentication(context);
        
        const db = await getDB();
        const specialDays = await db.collection('specialDays').find({}).toArray();
        
        return specialDays.map((day: any) => ({
          ...day,
          id: day._id.toString()
        }));
      } catch (error) {
        console.error('Error in specialDays resolver:', error);
        throw error;
      }
    }
  },

  Mutation: {
    // Shifts mutations
    createShift: async (_: any, args: any, context: any) => {
      if (!context.user) throw new Error('Not authenticated');
      checkAdminPermission(context);
      
      console.log('🔍 createShift called with:', args.input);
      
      const db = await getDB();
      const shift = {
        ...args.input,
        date: new Date(args.input.date),
        assignedWorkers: [],
        status: 'active',
        user: null, // Will be populated when someone is assigned
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      const result = await db.collection('shifts').insertOne(shift);
      const createdShift = { ...shift, _id: result.insertedId, id: result.insertedId.toString() };
      
      console.log('✅ Shift created with ID:', createdShift.id);
      
      return createdShift;
    },

    updateShift: async (_: any, args: any, context: any) => {
      try {
        if (!context.user) throw new Error('Not authenticated');
        checkAdminPermission(context);
        
        console.log('updateShift mutation called with:', {
          id: args.id,
          input: args.input
        });
        
        const db = await getDB();
        
        // First, let's check if the shift exists
        const existingShift = await db.collection('shifts').findOne({ _id: new ObjectId(args.id) });
        console.log('Existing shift before update:', existingShift);
        
        if (!existingShift) {
          throw new Error('Shift not found');
        }
        
        // Prepare the update data, preserving important fields
        const updateData: any = {};
        
        // Only update fields that are provided in input
        if (args.input.date) updateData.date = new Date(args.input.date);
        if (args.input.shiftType) updateData.shiftType = args.input.shiftType;
        if (args.input.department) updateData.department = args.input.department;
        if (args.input.requiredWorkers !== undefined) updateData.requiredWorkers = args.input.requiredWorkers;
        if (args.input.notes !== undefined) updateData.notes = args.input.notes;
        if (args.input.startTime !== undefined) updateData.startTime = args.input.startTime;
        if (args.input.endTime !== undefined) updateData.endTime = args.input.endTime;
        
        // Always update the updatedAt timestamp
        updateData.updatedAt = new Date();
        
        console.log('Update data being set:', updateData);
        console.log('Updating shift with _id:', args.id);
        
        const result = await db.collection('shifts').findOneAndUpdate(
          { _id: new ObjectId(args.id) },
          { 
            $set: updateData,
            $inc: { version: 1 }
          },
          { returnDocument: 'after' }
        );
        
        console.log('MongoDB update result:', { 
          ok: result?.ok, 
          value: result?.value ? 'Found' : 'Not found',
          lastErrorObject: result?.lastErrorObject 
        });
        
        if (!result || !result.value) {
          console.error('Shift update failed - no document returned');
          throw new Error('Shift update failed');
        }
        
        console.log('Updated shift:', JSON.stringify(result.value, null, 2));
        
        // Verify the shift exists in the database after update
        const verifyShift = await db.collection('shifts').findOne({ _id: new ObjectId(args.id) });
        console.log('Verification - shift exists after update:', verifyShift ? 'YES' : 'NO');
        if (verifyShift) {
          console.log('Verified shift data:', {
            id: verifyShift._id.toString(),
            date: verifyShift.date,
            dateType: typeof verifyShift.date,
            startTime: verifyShift.startTime,
            endTime: verifyShift.endTime,
            shiftType: verifyShift.shiftType,
            department: verifyShift.department
          });
        }
        
        return result.value;
      } catch (error) {
        console.error('Error in updateShift mutation:', error);
        throw error;
      }
    },

    deleteShift: async (_: any, args: any, context: any) => {
      if (!context.user) throw new Error('Not authenticated');
      checkAdminPermission(context);
      
      const db = await getDB();
      const result = await db.collection('shifts').deleteOne({ _id: new ObjectId(args.id) });
      return result.deletedCount > 0;
    },

    assignUserToShift: async (_: any, args: any, context: any) => {
      if (!context.user) throw new Error('Not authenticated');
      checkAdminPermission(context);
      
      console.log('🔍 assignUserToShift called with:', {
        shiftId: args.input.shiftId,
        userId: args.input.userId,
        role: args.input.role
      });
      
      const db = await getDB();
      // Get user data for the assignment
      const assignedUser = await db.collection('users').findOne({ _id: new ObjectId(args.input.userId) });
      
      const assignment = {
        userId: args.input.userId,
        user: assignedUser ? {
          id: assignedUser._id.toString(),
          displayName: assignedUser.displayName || `${assignedUser.firstName} ${assignedUser.lastName}`,
          department: assignedUser.department
        } : null,
        role: args.input.role,
        assignedAt: new Date(),
        assignedBy: context.user.userId
      };
      
      // First, let's check if the shift exists
      let shiftId;
      try {
        shiftId = new ObjectId(args.input.shiftId);
      } catch (error) {
        console.log('⚠️ Invalid ObjectId format, trying as string:', args.input.shiftId);
        throw new Error('Invalid shift ID format');
      }
      
      const existingShift = await db.collection('shifts').findOne({ _id: shiftId });
      console.log('🔍 Existing shift:', existingShift ? 'Found' : 'Not found', 'ID:', shiftId.toString());
      
      if (!existingShift) {
        // Let's also check if there's a shift with this ID as a string
        const shiftCount = await db.collection('shifts').countDocuments({});
        console.log('📊 Total shifts in database:', shiftCount);
      }
      
      const result = await db.collection('shifts').findOneAndUpdate(
        { _id: shiftId },
        { 
          $push: { assignedWorkers: assignment } as any,
          $set: { updatedAt: new Date() }
        },
        { returnDocument: 'after' }
      );
      
      if (!result || !result.value) throw new Error('Shift not found');
      
      console.log('✅ Shift assignment completed:', {
        shiftId: shiftId.toString(),
        assignedUserId: assignment.userId,
        assignedUserIdType: typeof assignment.userId,
        totalAssignedWorkers: result.value.assignedWorkers?.length || 0,
        allAssignedUserIds: result.value.assignedWorkers?.map((w: any) => ({ userId: w.userId, type: typeof w.userId }))
      });
      
      // Map the result to include user field
      const shift = result.value;
      return { 
        ...shift, 
        id: shift._id.toString(),
        user: shift.assignedWorkers && shift.assignedWorkers.length > 0 
          ? shift.assignedWorkers[0].user || { id: shift.assignedWorkers[0].userId }
          : null
      };
    },

    removeUserFromShift: async (_: any, args: any, context: any) => {
      if (!context.user) throw new Error('Not authenticated');
      checkAdminPermission(context);
      
      const db = await getDB();
      const result = await db.collection('shifts').findOneAndUpdate(
        { _id: new ObjectId(args.shiftId) },
        { 
          $pull: { assignedWorkers: { userId: args.userId } } as any,
          $set: { updatedAt: new Date() }
        },
        { returnDocument: 'after' }
      );
      
      if (!result || !result.value) throw new Error('Shift not found');
      
      // Map the result to include user field
      const shift = result.value;
      return { 
        ...shift, 
        id: shift._id.toString(),
        user: shift.assignedWorkers && shift.assignedWorkers.length > 0 
          ? shift.assignedWorkers[0].user || { id: shift.assignedWorkers[0].userId }
          : null
      };
    },

    // Shift Templates mutations
    createShiftTemplate: async (_: any, args: any, context: any) => {
      if (!context.user) throw new Error('Not authenticated');
      checkAdminPermission(context);
      
      const db = await getDB();
      const template = {
        ...args.input,
        active: args.input.active !== false,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      const result = await db.collection('shift_templates').insertOne(template);
      return { ...template, id: result.insertedId };
    },

    updateShiftTemplate: async (_: any, args: any, context: any) => {
      if (!context.user) throw new Error('Not authenticated');
      checkAdminPermission(context);
      
      const db = await getDB();
      const result = await db.collection('shift_templates').findOneAndUpdate(
        { _id: new ObjectId(args.input.id) },
        { 
          $set: { ...args.input, updatedAt: new Date() }
        },
        { returnDocument: 'after' }
      );
      
      if (!result || !result.value) throw new Error('Template not found');
      return result.value;
    },

    deleteShiftTemplate: async (_: any, args: any, context: any) => {
      if (!context.user) throw new Error('Not authenticated');
      checkAdminPermission(context);
      
      const db = await getDB();
      const result = await db.collection('shift_templates').deleteOne({ _id: new ObjectId(args.id) });
      return result.deletedCount > 0;
    },

    generateShiftsFromTemplate: async (_: any, args: any, context: any) => {
      if (!context.user) throw new Error('Not authenticated');
      checkAdminPermission(context);
      
      const db = await getDB();
      const template = await db.collection('shift_templates').findOne({ _id: new ObjectId(args.templateId) });
      
      if (!template) throw new Error('Template not found');
      if (!template.active) throw new Error('Template is not active');
      
      const shifts = [];
      const startDate = new Date(args.startDate);
      const endDate = new Date(args.endDate);
      
      // Generate shifts for each week
      const current = new Date(startDate);
      while (current <= endDate) {
        if (current.getDay() === template.dayOfWeek) {
          const shift = {
            date: new Date(current),
            shiftType: template.shiftType,
            department: template.department,
            requiredWorkers: template.requiredWorkers,
            assignedWorkers: [],
            templateId: template._id.toString(),
            createdAt: new Date(),
            updatedAt: new Date()
          };
          
          shifts.push(shift);
        }
        current.setDate(current.getDate() + 1);
      }
      
      if (shifts.length > 0) {
        const result = await db.collection('shifts').insertMany(shifts);
        return shifts.map((shift, index) => ({
          ...shift,
          id: result.insertedIds[index]
        }));
      }
      
      return [];
    },

    // Shift Role Template mutations
    createShiftRoleTemplate: async (_: any, { input }: { input: any }, context: any) => {
      if (!context.user) throw new Error('Not authenticated');
      checkAdminPermission(context);
      
      const db = await getDB();
      
      // Validate that all roles exist in the department
      const departmentConfig = await db.collection('department_shift_configs').findOne({ 
        departmentId: input.departmentId 
      });
      
      if (!departmentConfig) {
        throw new Error('Department configuration not found');
      }
      
      const validRoleIds = departmentConfig.departmentRoles?.map((r: any) => r.id) || [];
      const invalidRoles = input.roleAssignments.filter((ra: any) => 
        !validRoleIds.includes(ra.roleId)
      );
      
      if (invalidRoles.length > 0) {
        throw new Error(`Invalid role IDs: ${invalidRoles.map((r: any) => r.roleId).join(', ')}`);
      }
      
      const template = {
        ...input,
        createdBy: context.user.userId,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      const result = await db.collection('shiftRoleTemplates').insertOne(template);
      
      return {
        ...template,
        id: result.insertedId.toString()
      };
    },

    updateShiftRoleTemplate: async (_: any, { id, input }: { id: string, input: any }, context: any) => {
      if (!context.user) throw new Error('Not authenticated');
      checkAdminPermission(context);
      
      const db = await getDB();
      
      // Validate that all roles exist in the department
      const departmentConfig = await db.collection('department_shift_configs').findOne({ 
        departmentId: input.departmentId 
      });
      
      if (!departmentConfig) {
        throw new Error('Department configuration not found');
      }
      
      const validRoleIds = departmentConfig.departmentRoles?.map((r: any) => r.id) || [];
      const invalidRoles = input.roleAssignments.filter((ra: any) => 
        !validRoleIds.includes(ra.roleId)
      );
      
      if (invalidRoles.length > 0) {
        throw new Error(`Invalid role IDs: ${invalidRoles.map((r: any) => r.roleId).join(', ')}`);
      }
      
      const result = await db.collection('shiftRoleTemplates').findOneAndUpdate(
        { _id: new ObjectId(id) },
        { 
          $set: {
            ...input,
            updatedAt: new Date()
          }
        },
        { returnDocument: 'after' }
      );
      
      if (!result || !result.value) throw new Error('Template not found');
      
      return {
        ...result.value,
        id: result.value._id.toString()
      };
    },

    deleteShiftRoleTemplate: async (_: any, { id }: { id: string }, context: any) => {
      if (!context.user) throw new Error('Not authenticated');
      checkAdminPermission(context);
      
      const db = await getDB();
      const result = await db.collection('shiftRoleTemplates').deleteOne({ 
        _id: new ObjectId(id) 
      });
      
      return result.deletedCount > 0;
    },

    applyShiftRoleTemplate: async (_: any, { templateId, weekStartDate }: { templateId: string, weekStartDate: string }, context: any) => {
      if (!context.user) throw new Error('Not authenticated');
      checkAdminPermission(context);
      
      const db = await getDB();
      
      // Get the template
      const template = await db.collection('shiftRoleTemplates').findOne({ 
        _id: new ObjectId(templateId) 
      });
      
      if (!template) throw new Error('Template not found');
      if (!template.isActive) throw new Error('Template is not active');
      
      // Get department configuration for shift types
      const departmentConfig = await db.collection('department_shift_configs').findOne({ 
        departmentId: template.departmentId 
      });
      
      if (!departmentConfig) {
        throw new Error('Department configuration not found');
      }
      
      const shiftTypeConfig = departmentConfig.shiftTypes?.find((st: any) => 
        st.type === template.shiftType
      );
      
      if (!shiftTypeConfig || !shiftTypeConfig.enabled) {
        throw new Error('Shift type is not enabled for this department');
      }
      
      // Calculate the date for this template (based on day of week)
      const startDate = new Date(weekStartDate);
      const targetDate = new Date(startDate);
      targetDate.setDate(startDate.getDate() + template.dayOfWeek);
      
      // Check if a shift already exists for this date/type/department
      let shift = await db.collection('shifts').findOne({
        date: targetDate,
        shiftType: template.shiftType,
        department: template.departmentId
      });
      
      let shiftsCreated = 0;
      let shiftsUpdated = 0;
      
      if (!shift) {
        // Create new shift
        const newShift = {
          date: targetDate,
          shiftType: template.shiftType,
          department: template.departmentId,
          requiredWorkers: template.roleAssignments.reduce((sum: number, ra: any) => sum + ra.count, 0),
          assignedWorkers: [],
          roleRequirements: template.roleAssignments.map((ra: any) => ({
            roleId: ra.roleId,
            roleName: ra.roleName,
            required: ra.count,
            assigned: 0
          })),
          templateId: template._id.toString(),
          startTime: shiftTypeConfig.defaultStartTime,
          endTime: shiftTypeConfig.defaultEndTime,
          createdAt: new Date(),
          updatedAt: new Date(),
          createdBy: context.user.userId
        };
        
        const result = await db.collection('shifts').insertOne(newShift);
        shift = { ...newShift, _id: result.insertedId };
        shiftsCreated = 1;
      } else {
        // Update existing shift with role requirements
        await db.collection('shifts').updateOne(
          { _id: shift._id },
          {
            $set: {
              roleRequirements: template.roleAssignments.map((ra: any) => ({
                roleId: ra.roleId,
                roleName: ra.roleName,
                required: ra.count,
                assigned: shift?.assignedWorkers?.filter((w: any) => w.role === ra.roleId).length || 0
              })),
              requiredWorkers: template.roleAssignments.reduce((sum: number, ra: any) => sum + ra.count, 0),
              templateId: template._id.toString(),
              updatedAt: new Date()
            }
          }
        );
        shiftsUpdated = 1;
      }
      
      return {
        success: true,
        message: `Template applied successfully. ${shiftsCreated} shifts created, ${shiftsUpdated} shifts updated.`,
        shiftsCreated,
        shiftsUpdated
      };
    },

    // Shift Swap Requests mutations
    createShiftSwapRequest: async (_: any, args: any, context: any) => {
      if (!context.user) throw new Error('Not authenticated');
      
      const db = await getDB();
      
      // Verify the shift exists and user is assigned to it
      const shift = await db.collection('shifts').findOne({ _id: new ObjectId(args.input.shiftId) });
      if (!shift) throw new Error('Shift not found');
      
      const isAssigned = shift.assignedWorkers.some((w: any) => w.userId === context.user.userId);
      if (!isAssigned) throw new Error('You are not assigned to this shift');
      
      const swapRequest = {
        requestingUserId: context.user.userId,
        shiftId: args.input.shiftId,
        targetUserId: args.input.targetUserId,
        reason: args.input.reason,
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      const result = await db.collection('shift_swap_requests').insertOne(swapRequest);
      return { ...swapRequest, id: result.insertedId };
    },

    cancelShiftSwapRequest: async (_: any, args: any, context: any) => {
      if (!context.user) throw new Error('Not authenticated');
      
      const db = await getDB();
      const request = await db.collection('shift_swap_requests').findOne({ _id: new ObjectId(args.id) });
      
      if (!request) throw new Error('Request not found');
      if (request.requestingUserId !== context.user.userId && !context.user.permissions?.includes('admin')) {
        throw new Error('You can only cancel your own requests');
      }
      if (request.status !== 'pending') {
        throw new Error('Only pending requests can be cancelled');
      }
      
      const result = await db.collection('shift_swap_requests').findOneAndUpdate(
        { _id: new ObjectId(args.id) },
        { 
          $set: { 
            status: 'cancelled',
            updatedAt: new Date()
          }
        },
        { returnDocument: 'after' }
      );
      
      if (!result || !result.value) throw new Error('Update failed');
      return result.value;
    },

    respondToShiftSwapRequest: async (_: any, args: any, context: any) => {
      if (!context.user) throw new Error('Not authenticated');
      
      const db = await getDB();
      const request = await db.collection('shift_swap_requests').findOne({ _id: new ObjectId(args.id) });
      
      if (!request) throw new Error('Request not found');
      if (request.targetUserId !== context.user.userId) {
        throw new Error('You are not the target user for this swap request');
      }
      if (request.status !== 'pending') {
        throw new Error('Only pending requests can be responded to');
      }
      if (request.targetUserResponse) {
        throw new Error('You have already responded to this request');
      }
      
      const updateData: any = {
        targetUserResponse: args.accepted ? 'accepted' : 'rejected',
        targetUserResponseAt: new Date(),
        updatedAt: new Date()
      };
      
      if (args.reason) {
        updateData.targetUserResponseReason = args.reason;
      }
      
      // If rejected by target user, close the request
      if (!args.accepted) {
        updateData.status = 'rejected';
      }
      
      const result = await db.collection('shift_swap_requests').findOneAndUpdate(
        { _id: new ObjectId(args.id) },
        { $set: updateData },
        { returnDocument: 'after' }
      );
      
      if (!result || !result.value) throw new Error('Failed to update request');
      return result.value;
    },

    approveShiftSwapRequest: async (_: any, args: any, context: any) => {
      if (!context.user) throw new Error('Not authenticated');
      checkAdminPermission(context);
      
      const db = await getDB();
      const request = await db.collection('shift_swap_requests').findOne({ _id: new ObjectId(args.input.requestId) });
      
      if (!request) throw new Error('Request not found');
      if (request.status !== 'pending') {
        throw new Error('Only pending requests can be approved/rejected');
      }
      
      // Check if target user has accepted the request
      if (!request.targetUserResponse || request.targetUserResponse !== 'accepted') {
        throw new Error('The target user must accept the swap request before admin approval');
      }
      
      const status = args.input.approved ? 'approved' : 'rejected';
      
      // If approved, perform the swap
      if (args.input.approved) {
        const shift = await db.collection('shifts').findOne({ _id: new ObjectId(request.shiftId) });
        if (!shift) throw new Error('Shift not found');
        
        // Remove requesting user and add target user
        await db.collection('shifts').updateOne(
          { _id: new ObjectId(request.shiftId) },
          {
            $pull: { assignedWorkers: { userId: request.requestingUserId } } as any
          }
        );
        
        await db.collection('shifts').updateOne(
          { _id: new ObjectId(request.shiftId) },
          {
            $push: { 
              assignedWorkers: {
                userId: request.targetUserId,
                role: shift.assignedWorkers.find((w: any) => w.userId === request.requestingUserId)?.role || 'worker',
                assignedAt: new Date(),
                assignedBy: context.user.userId
              }
            } as any,
            $set: { updatedAt: new Date() }
          }
        );
      }
      
      const result = await db.collection('shift_swap_requests').findOneAndUpdate(
        { _id: new ObjectId(args.input.requestId) },
        { 
          $set: { 
            status,
            adminNotes: args.input.adminNotes,
            approvedBy: context.user.userId,
            approvedAt: new Date(),
            updatedAt: new Date()
          }
        },
        { returnDocument: 'after' }
      );
      
      // If result or result.value is null, fetch the updated document manually
      if (!result || !result.value) {
        const updatedRequest = await db.collection('shift_swap_requests').findOne({ _id: new ObjectId(args.input.requestId) });
        if (!updatedRequest) throw new Error('Failed to update request');
        return updatedRequest;
      }
      
      return result.value;
    },

    // Vacation Requests
    createVacationRequest: async (_: any, args: any, context: any) => {
      if (!context.user) throw new Error('Not authenticated');
      
      console.log('🔍 CreateVacationRequest called with:', {
        contextUser: context.user.userId,
        contextUserEmail: context.user.email,
        inputUserId: args.input.userId,
        input: args.input
      });
      
      const db = await getDB();
      
      // Determine the target userId
      let targetUserId = context.user.userId;
      
      // If admin is creating request for another user
      if (args.input.userId) {
        checkAdminPermission(context);
        targetUserId = args.input.userId;
        
        // Verify the target user exists
        const targetUser = await db.collection('users').findOne({ _id: new ObjectId(targetUserId) });
        if (!targetUser) {
          console.error('❌ Target user not found:', targetUserId);
          throw new Error('Target user not found');
        }
        console.log('✅ Found target user:', targetUser.displayName, targetUser.email);
      }
      
      // Check for overlapping vacation requests
      const existingRequest = await db.collection('vacation_requests').findOne({
        userId: targetUserId,
        status: { $in: ['pending', 'approved'] },
        $or: [
          { startDate: { $lte: new Date(args.input.endDate), $gte: new Date(args.input.startDate) } },
          { endDate: { $lte: new Date(args.input.endDate), $gte: new Date(args.input.startDate) } }
        ]
      });
      
      if (existingRequest) {
        throw new Error('This user already has a vacation request for this period');
      }
      
      const vacationRequest = {
        ...args.input,
        userId: targetUserId,
        startDate: new Date(args.input.startDate),
        endDate: new Date(args.input.endDate),
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      // Remove the userId from the saved object if it was in input
      delete vacationRequest.userId;
      vacationRequest.userId = targetUserId;
      
      console.log('📝 Creating vacation request with data:', {
        userId: vacationRequest.userId,
        userIdType: typeof vacationRequest.userId,
        startDate: vacationRequest.startDate,
        endDate: vacationRequest.endDate,
        status: vacationRequest.status
      });
      
      const result = await db.collection('vacation_requests').insertOne(vacationRequest);
      console.log('✅ Vacation request created:', result.insertedId);
      
      // Verify what was saved
      const savedRequest = await db.collection('vacation_requests').findOne({ _id: result.insertedId });
      console.log('🔍 Saved request userId:', savedRequest?.userId, 'type:', typeof savedRequest?.userId);
      
      return { ...vacationRequest, _id: result.insertedId };
    },

    updateVacationRequest: async (_: any, args: any, context: any) => {
      if (!context.user) throw new Error('Not authenticated');
      
      const db = await getDB();
      
      // Check if user owns the request or is admin
      const existingRequest = await db.collection('vacation_requests').findOne({ 
        _id: new ObjectId(args.id) 
      });
      
      if (!existingRequest) {
        throw new Error('Vacation request not found');
      }
      
      if (existingRequest.userId !== context.user.userId && !context.user.permissions?.includes('admin')) {
        throw new Error('Not authorized to update this request');
      }
      
      const updatedRequest = await db.collection('vacation_requests').findOneAndUpdate(
        { _id: new ObjectId(args.id) },
        { 
          $set: { 
            ...args.input,
            startDate: args.input.startDate ? new Date(args.input.startDate) : existingRequest.startDate,
            endDate: args.input.endDate ? new Date(args.input.endDate) : existingRequest.endDate,
            updatedAt: new Date() 
          } 
        },
        { returnDocument: 'after' }
      );
      
      if (!updatedRequest || !updatedRequest.value) {
        throw new Error('Failed to update vacation request');
      }
      
      return updatedRequest.value;
    },

    deleteVacationRequest: async (_: any, args: any, context: any) => {
      if (!context.user) throw new Error('Not authenticated');
      
      const db = await getDB();
      
      // Check if user owns the request or is admin
      const existingRequest = await db.collection('vacation_requests').findOne({ 
        _id: new ObjectId(args.id) 
      });
      
      if (!existingRequest) {
        throw new Error('Vacation request not found');
      }
      
      if (existingRequest.userId !== context.user.userId && !context.user.permissions?.includes('admin')) {
        throw new Error('Not authorized to delete this request');
      }
      
      // Allow deletion of approved vacations for admins
      const isAdmin = 
        context.user.permissions?.includes('admin') ||
        context.user.permissions?.includes('shift_admin') ||
        context.user.systemRole === 'SYSTEM_ADMIN' ||
        context.user.systemRole === 'IT_ADMIN' ||
        context.user.systemRole === 'DEPARTMENT_ADMIN';

      if (existingRequest.status === 'approved' && !isAdmin) {
        throw new Error('Cannot delete approved vacation request');
      }
      
      await db.collection('vacation_requests').deleteOne({ _id: new ObjectId(args.id) });
      return true;
    },

    cancelVacationRequest: async (_: any, args: any, context: any) => {
      if (!context.user) throw new Error('Not authenticated');
      
      const db = await getDB();
      const request = await db.collection('vacation_requests').findOne({ _id: new ObjectId(args.id) });
      
      if (!request) throw new Error('Request not found');
      if (request.userId !== context.user.userId && !context.user.permissions?.includes('admin')) {
        throw new Error('You can only cancel your own requests');
      }
      if (request.status !== 'pending') {
        throw new Error('Only pending requests can be cancelled');
      }
      
      const result = await db.collection('vacation_requests').findOneAndUpdate(
        { _id: new ObjectId(args.id) },
        { 
          $set: { 
            status: 'cancelled',
            updatedAt: new Date()
          }
        },
        { returnDocument: 'after' }
      );
      
      if (!result || !result.value) throw new Error('Update failed');
      return result.value;
    },
    
    approveVacationRequest: async (_: any, args: any, context: any) => {
      if (!context.user) throw new Error('Not authenticated');
      checkAdminPermission(context);
      
      const db = await getDB();
      const request = await db.collection('vacation_requests').findOne({ _id: new ObjectId(args.input.requestId) });
      
      if (!request) throw new Error('Request not found');
      if (request.status !== 'pending') {
        throw new Error('Only pending requests can be approved/rejected');
      }
      
      const status = args.input.approved ? 'approved' : 'rejected';
      
      const result = await db.collection('vacation_requests').findOneAndUpdate(
        { _id: new ObjectId(args.input.requestId) },
        { 
          $set: { 
            status,
            adminNotes: args.input.adminNotes,
            approvedBy: context.user.userId,
            approvedAt: new Date(),
            updatedAt: new Date()
          }
        },
        { returnDocument: 'after' }
      );
      
      // If result or result.value is null, fetch the updated document manually
      let updatedDoc = result?.value;
      if (!updatedDoc) {
        updatedDoc = await db.collection('vacation_requests').findOne({ _id: new ObjectId(args.input.requestId) });
        if (!updatedDoc) throw new Error('Failed to update request');
      }
      
      // Return the updated vacation request with proper formatting
      return {
        ...updatedDoc,
        id: updatedDoc._id.toString(),
        _id: updatedDoc._id
      };
    },

    // Availability Constraints
    submitAvailabilityConstraints: async (_: any, args: any, context: any) => {
      if (!context.user) throw new Error('Not authenticated');
      
      try {
        const db = await getDB();
        const weekStart = getWeekStartDate(new Date(args.input.weekStartDate));
        
        // Don't include _id in the replacement document
        const constraint = {
          ...args.input,
          userId: context.user.userId,
          weekStartDate: weekStart,
          submittedAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date()
        };
        
        // Upsert - update if exists, create if not
        const result = await db.collection('availability_constraints').findOneAndReplace(
          {
            userId: context.user.userId,
            weekStartDate: weekStart
          },
          constraint,
          {
            upsert: true,
            returnDocument: 'after'
          }
        );
        
        // MongoDB returns the document in result object
        const savedDoc = result?.value || result;
        
        if (!savedDoc) {
          throw new Error('Failed to submit constraints - no document returned');
        }
        
        // Ensure id field is returned for GraphQL
        return {
          ...savedDoc,
          id: savedDoc._id?.toString() || savedDoc.id || new ObjectId().toString()
        };
      } catch (error) {
        console.error('Error submitting availability constraints:', error);
        throw error;
      }
    },

    // Employee Settings
    updateEmployeeSettings: async (_: any, args: any, context: any) => {
      if (!context.user) throw new Error('Not authenticated');
      
      const db = await getDB();
      
      // Check if user is updating their own settings or is an admin
      if (args.input.userId !== context.user.userId) {
        checkAdminPermission(context);
      }
      
      const settings = {
        ...args.input,
        updatedAt: new Date()
      };
      
      // If creating new settings, add createdAt
      const existingSettings = await db.collection('employee_settings').findOne({ userId: args.input.userId });
      if (!existingSettings) {
        settings.createdAt = new Date();
      }
      
      const result = await db.collection('employee_settings').findOneAndUpdate(
        { userId: args.input.userId },
        { $set: settings },
        { 
          upsert: true,
          returnDocument: 'after'
        }
      );
      
      if (!result || !result.value) throw new Error('Failed to update settings');
      return result.value;
    },

    // Department Shift Configuration
    createDepartmentShiftConfig: async (_: any, { input }: { input: any }, context: any) => {
      if (!context.user) throw new Error('Not authenticated');
      
      // Check if user is department admin
      const user = await context.db.query(
        'SELECT system_role, department FROM users WHERE id = $1',
        [context.user.userId]
      );
      
      if (!['DEPARTMENT_ADMIN', 'SYSTEM_ADMIN', 'IT_ADMIN'].includes(user.rows[0]?.system_role)) {
        throw new Error('Unauthorized: Only department admins can create configurations');
      }
      
             try {
         const db = await connectMongoDB();
         
         // Check if config already exists
         const existing = await db.collection('department_shift_configs').findOne({ 
           departmentId: input.departmentId 
         });
        
        if (existing) {
          throw new Error('Configuration already exists for this department');
        }
        
        const config = {
          ...input,
          metadata: {
            createdBy: context.user?.userId || 'system',
            createdAt: new Date(),
            updatedAt: new Date(),
            lastModifiedBy: context.user?.userId || 'system'
          }
        };
        
                 const result = await db.collection('department_shift_configs').insertOne(config);
        
        return {
          ...config,
          id: result.insertedId.toString()
        };
      } catch (error) {
        console.error('Error creating department config:', error);
        throw error;
      }
    },

    updateDepartmentShiftConfig: async (_: any, { departmentId, input }: { departmentId: string, input: any }, context: any) => {
      console.log('\n🚀 ====== updateDepartmentShiftConfig MUTATION CALLED ======');
      console.log('📦 Department ID:', departmentId);
      console.log('📦 Input:', JSON.stringify(input, null, 2));
      console.log('🔍 Context user:', context.user ? {
        userId: context.user.userId,
        email: context.user.email,
        role: context.user.role,
        systemRole: context.user.systemRole,
        permissions: context.user.permissions
      } : 'NO USER IN CONTEXT');
      
      if (!context.user) {
        console.error('❌ No user in context - throwing Not authenticated');
        throw new Error('Not authenticated');
      }
      
      // Use systemRole from JWT context first
      const userRole = context.user.systemRole;
      console.log('👤 User systemRole from JWT:', userRole);
      
      // Allow system/IT admins immediately
      if (['SYSTEM_ADMIN', 'IT_ADMIN'].includes(userRole)) {
        console.log('✅ User is SYSTEM_ADMIN or IT_ADMIN - allowing access');
        // System/IT admins can update any department
      } else if (userRole === 'DEPARTMENT_ADMIN') {
        console.log('🔍 User is DEPARTMENT_ADMIN - checking department match');
        // For department admins, check if they're updating their own department
        const db = await connectMongoDB();
        const user = await db.collection('users').findOne({ _id: new ObjectId(context.user.userId) });
        console.log('📦 User from DB:', user ? {
          id: user._id,
          email: user.email,
          systemRole: user.systemRole,
          departments: user.departments
        } : 'USER NOT FOUND IN DB');
        
        const userDept = user?.departments && user.departments.length > 0 ? user.departments[0].departmentId : null;
        console.log('🏢 User department:', userDept, 'Target department:', departmentId);
        
        if (userDept !== departmentId) {
          console.error('❌ Department mismatch - throwing Unauthorized');
          throw new Error('Unauthorized: You can only update your own department configuration');
        }
        console.log('✅ Department match confirmed - allowing access');
      } else {
        console.error('❌ User role not authorized:', userRole);
        throw new Error('Unauthorized: Only admins can update department configurations');
      }
      
      try {
        const db = await connectMongoDB();
        console.log('📝 Updating config for department:', departmentId);
        console.log('📝 Update data:', JSON.stringify(input, null, 2));
        
        // Ensure all required fields have defaults
        const updateData = {
          departmentId: input.departmentId,
          departmentName: input.departmentName,
          shiftTypes: input.shiftTypes || [],
          weeklyPatterns: input.weeklyPatterns || [],
          constraints: input.constraints || {
            minRestBetweenShifts: 8,
            maxConsecutiveDays: 5,
            maxShiftsPerWeek: 5,
            maxNightShiftsPerWeek: 2,
            requireApprovalForSwaps: true,
            autoAssignEnabled: false,
            allowOvertime: false,
            overtimeThresholdHours: 40
          },
          notifications: input.notifications || {
            sendShiftReminders: true,
            reminderHoursBefore: 24,
            sendSwapRequests: true,
            sendScheduleUpdates: true
          },
          departmentRoles: input.departmentRoles || [],
          useTemplateSystem: input.useTemplateSystem !== undefined ? input.useTemplateSystem : false,
          'metadata.updatedAt': new Date(),
          'metadata.lastModifiedBy': context.user?.userId || 'system'
        };
        
        const result = await db.collection('department_shift_configs').findOneAndUpdate(
          { departmentId },
          { $set: updateData },
          { returnDocument: 'after', upsert: true }
        );
        
        console.log('📝 MongoDB result:', result);
        
        if (!result) {
          throw new Error('Failed to update configuration - no result from MongoDB');
        }
        
        // MongoDB 4.x returns the document directly, not in result.value
        const document = result.value || result;
        
        if (!document) {
          throw new Error('Failed to update configuration - no document returned');
        }
        
        console.log('✅ Config updated successfully');
        
        return {
          ...document,
          id: document._id?.toString() || document.id,
          useTemplateSystem: document.useTemplateSystem || false
        };
      } catch (error: any) {
        console.error('❌ Error updating department config:', error.message || error);
        console.error('Stack:', error.stack);
        throw error;
      }
    },

    deleteDepartmentShiftConfig: async (_: any, { departmentId }: { departmentId: string }, context: any) => {
      if (!context.user) throw new Error('Not authenticated');
      
      // Only system/IT admins can delete configurations
      const user = await context.db.query(
        'SELECT system_role FROM users WHERE id = $1',
        [context.user.userId]
      );
      
      if (!['SYSTEM_ADMIN', 'IT_ADMIN'].includes(user.rows[0]?.system_role)) {
        throw new Error('Unauthorized: Only system administrators can delete configurations');
      }
      
      try {
        const db = await connectMongoDB();
        
        const result = await db.collection('department_shift_configs').deleteOne({ departmentId });
        
        return result.deletedCount > 0;
      } catch (error) {
        console.error('Error deleting department config:', error);
        throw error;
      }
    },
    
    // Add new mutations for missing functionality
    
    // Create Special Request
    createSpecialRequest: async (_: any, args: any, context: any) => {
      if (!context.user) throw new Error('Not authenticated');
      
      const db = await getDB();
      const specialRequest = {
        userId: context.user.userId,
        type: args.input.type,
        date: new Date(args.input.date),
        shiftType: args.input.shiftType,
        reason: args.input.reason,
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      const result = await db.collection('specialRequests').insertOne(specialRequest);
      return { ...specialRequest, _id: result.insertedId, id: result.insertedId.toString() };
    },
    
    // Approve/Reject Special Request
    handleSpecialRequest: async (_: any, args: any, context: any) => {
      if (!context.user) throw new Error('Not authenticated');
      checkAdminPermission(context);
      
      const db = await getDB();
      const status = args.approved ? 'approved' : 'rejected';
      
      const result = await db.collection('specialRequests').findOneAndUpdate(
        { _id: new ObjectId(args.requestId) },
        {
          $set: {
            status,
            adminNotes: args.adminNotes,
            approvedBy: context.user.userId,
            approvedAt: new Date(),
            updatedAt: new Date()
          }
        },
        { returnDocument: 'after' }
      );
      
      if (!result || !result.value) throw new Error('Request not found');
      
      // Populate user data
      const user = await db.collection('users').findOne({ _id: new ObjectId(result.value.userId) });
      
      return {
        ...result.value,
        id: result.value._id.toString(),
        user: user || { id: result.value.userId, displayName: 'Unknown User' }
      };
    },
    
    // Send notification
    sendNotification: async (_: any, args: any, context: any) => {
      if (!context.user) throw new Error('Not authenticated');
      checkAdminPermission(context);
      
      const db = await getDB();
      const notification = {
        title: args.input.title,
        message: args.input.message,
        type: args.input.type || 'general',
        recipients: args.input.recipients || [], // array of user IDs
        department: args.input.department, // optional department filter
        sentBy: context.user.userId,
        sentAt: new Date(),
        createdAt: new Date()
      };
      
      const result = await db.collection('notifications').insertOne(notification);
      
      // TODO: Implement actual notification sending logic (push notifications, email, etc.)
      
      return {
        success: true,
        message: 'הודעה נשלחה בהצלחה',
        notificationId: result.insertedId.toString()
      };
    },
    
    // Generate report
    generateShiftReport: async (_: any, args: any, context: any) => {
      if (!context.user) throw new Error('Not authenticated');
      checkAdminPermission(context);
      
      const db = await getDB();
      const { reportType, startDate, endDate, department } = args.input;
      
      // Base query for shifts
      const query: any = {};
      if (startDate && endDate) {
        query.date = {
          $gte: new Date(startDate),
          $lte: new Date(endDate)
        };
      }
      if (department) {
        query.department = department;
      }
      
      switch (reportType) {
        case 'attendance':
          // Monthly attendance report
          const shifts = await db.collection('shifts').find(query).toArray();
          const userAttendance = new Map();
          
          shifts.forEach((shift: any) => {
            shift.assignedWorkers?.forEach((worker: any) => {
              if (!userAttendance.has(worker.userId)) {
                userAttendance.set(worker.userId, {
                  userId: worker.userId,
                  shiftsCount: 0,
                  totalHours: 0,
                  shiftTypes: { morning: 0, afternoon: 0, night: 0 }
                });
              }
              
              const userData = userAttendance.get(worker.userId);
              userData.shiftsCount++;
              if (shift.shiftType === 'morning' || shift.shiftType === 'afternoon' || shift.shiftType === 'night') {
                userData.shiftTypes[shift.shiftType]++;
              }
              // Calculate hours (simplified - would need actual time parsing)
              userData.totalHours += 8; // Assuming 8 hour shifts
            });
          });
          
          return {
            reportType: 'attendance',
            data: Array.from(userAttendance.values()),
            generatedAt: new Date()
          };
          
        case 'shifts':
          // Shift assignment report
          const allShifts = await db.collection('shifts').find(query).toArray();
          const stats = {
            total: allShifts.length,
            assigned: 0,
            unassigned: 0,
            byDepartment: new Map(),
            byShiftType: { morning: 0, afternoon: 0, night: 0 }
          };
          
          allShifts.forEach((shift: any) => {
            if (shift.assignedWorkers?.length >= shift.requiredWorkers) {
              stats.assigned++;
            } else {
              stats.unassigned++;
            }
            
            const shiftType = shift.shiftType as 'morning' | 'afternoon' | 'night';
            if (shiftType === 'morning' || shiftType === 'afternoon' || shiftType === 'night') {
              stats.byShiftType[shiftType]++;
            }
            
            if (!stats.byDepartment.has(shift.department)) {
              stats.byDepartment.set(shift.department, { total: 0, assigned: 0 });
            }
            const deptStats = stats.byDepartment.get(shift.department);
            deptStats.total++;
            if (shift.assignedWorkers?.length >= shift.requiredWorkers) {
              deptStats.assigned++;
            }
          });
          
          return {
            reportType: 'shifts',
            data: {
              ...stats,
              byDepartment: Object.fromEntries(stats.byDepartment)
            },
            generatedAt: new Date()
          };
          
        case 'overtime':
          // Overtime report
          // This would require actual time tracking integration
          return {
            reportType: 'overtime',
            data: [],
            message: 'דוח שעות נוספות דורש אינטגרציה עם מערכת שעון נוכחות',
            generatedAt: new Date()
          };
          
        case 'vacation':
          // Vacation and sick leave report
          const vacationRequests = await db.collection('vacation_requests').find({
            status: 'approved',
            startDate: query.date?.$gte,
            endDate: query.date?.$lte
          }).toArray();
          
          const vacationStats = {
            total: vacationRequests.length,
            byType: {} as Record<string, number>,
            byUser: new Map()
          };
          
          vacationRequests.forEach((request: any) => {
            if (!vacationStats.byType[request.vacationType]) {
              vacationStats.byType[request.vacationType] = 0;
            }
            vacationStats.byType[request.vacationType]++;
            
            if (!vacationStats.byUser.has(request.userId)) {
              vacationStats.byUser.set(request.userId, {
                userId: request.userId,
                vacations: []
              });
            }
            vacationStats.byUser.get(request.userId).vacations.push({
              type: request.vacationType,
              startDate: request.startDate,
              endDate: request.endDate,
              days: Math.ceil((new Date(request.endDate).getTime() - new Date(request.startDate).getTime()) / (1000 * 60 * 60 * 24))
            });
          });
          
          return {
            reportType: 'vacation',
            data: {
              ...vacationStats,
              byUser: Array.from(vacationStats.byUser.values())
            },
            generatedAt: new Date()
          };
          
        default:
          throw new Error('Invalid report type');
      }
    },
    
    // Employee management
    createEmployee: async (_: any, args: any, context: any) => {
      if (!context.user) throw new Error('Not authenticated');
      checkAdminPermission(context);
      
      const db = await getDB();
      
      // Check if user with this email already exists
      const existingUser = await db.collection('users').findOne({ email: args.input.email });
      if (existingUser) {
        throw new Error('User with this email already exists');
      }
      
      // Create user with proper structure
      const user = {
        ...args.input,
        displayName: `${args.input.firstName} ${args.input.lastName}`.trim(),
        password: args.input.password || 'Temp123!', // In production, this should be hashed
        systemRole: args.input.systemRole || 'DEPARTMENT_USER',
        isActive: args.input.isActive !== false,
        permissions: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: context.user.userId
      };
      
      const result = await db.collection('users').insertOne(user);
      
      return {
        ...user,
        id: result.insertedId.toString(),
        _id: result.insertedId
      };
    },
    
    // Update special days
    updateSpecialDays: async (_: any, args: any, context: any) => {
      if (!context.user) throw new Error('Not authenticated');
      checkAdminPermission(context);
      
      const db = await getDB();
      const specialDay = {
        name: args.input.name,
        date: new Date(args.input.date),
        type: args.input.type, // holiday, event, etc.
        affectsDepartments: args.input.departments || [],
        createdBy: context.user.userId,
        createdAt: new Date()
      };
      
      const result = await db.collection('specialDays').insertOne(specialDay);
      
      return {
        ...specialDay,
        id: result.insertedId.toString()
      };
    },
    
    deleteSpecialDay: async (_: any, args: any, context: any) => {
      if (!context.user) throw new Error('Not authenticated');
      checkAdminPermission(context);
      
      const db = await getDB();
      const result = await db.collection('specialDays').deleteOne({ _id: new ObjectId(args.id) });
      
      return result.deletedCount > 0;
    }
  },

  // Add Subscription resolvers
  Subscription: {
    shiftUpdated: {
      subscribe: (_: any, args: any, context: any) => {
        // This is a placeholder - implement with your pubsub system
        return context.pubsub.asyncIterator(['SHIFT_UPDATED']);
      }
    },
    shiftSwapRequestUpdated: {
      subscribe: (_: any, args: any, context: any) => {
        return context.pubsub.asyncIterator(['SHIFT_SWAP_REQUEST_UPDATED']);
      }
    },
    vacationRequestUpdated: {
      subscribe: (_: any, args: any, context: any) => {
        return context.pubsub.asyncIterator(['VACATION_REQUEST_UPDATED']);
      }
    }
  },

  // Field resolvers
  Shift: {
    id: (parent: any) => parent._id || parent.id,
    date: (parent: any) => parent.date.toISOString(),
    assignedWorkers: async (parent: any, _: any, context: any) => {
      const db = await getDB();
      const workers = [];
      
      console.log('🔍 Resolving assignedWorkers for shift:', parent._id);
      console.log('🔍 Parent assignedWorkers:', JSON.stringify(parent.assignedWorkers, null, 2));
      
      for (const assignment of parent.assignedWorkers || []) {
        try {
          console.log(`🔍 Looking up user with userId: ${assignment.userId}, type: ${typeof assignment.userId}`);
          
          const user = await db.collection('users').findOne({ _id: new ObjectId(assignment.userId) });
          if (user) {
            console.log(`✅ Found user: ${user.displayName || user.firstName}`);
            workers.push({
              ...assignment,
              user: {
                ...user,
                id: user._id.toString(),
                displayName: user.displayName || `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email || 'Unknown User'
              },
              assignedAt: assignment.assignedAt ? assignment.assignedAt.toISOString() : new Date().toISOString()
            });
          } else {
            console.warn(`❌ User not found for assignment userId: ${assignment.userId}`);
            // Create a placeholder user to avoid null errors
            workers.push({
              ...assignment,
              user: {
                id: assignment.userId,
                displayName: 'עובד לא ידוע',
                firstName: 'עובד',
                lastName: 'לא ידוע',
                email: 'unknown@example.com'
              },
              assignedAt: assignment.assignedAt ? assignment.assignedAt.toISOString() : new Date().toISOString()
            });
          }
        } catch (error) {
          console.error(`❌ Error fetching user ${assignment.userId}:`, error);
          // Create a placeholder user to avoid null errors
          workers.push({
            ...assignment,
            user: {
              id: assignment.userId,
              displayName: 'עובד לא ידוע',
              firstName: 'עובד',
              lastName: 'לא ידוע',
              email: 'unknown@example.com'
            },
            assignedAt: assignment.assignedAt ? assignment.assignedAt.toISOString() : new Date().toISOString()
          });
        }
      }
      
      console.log(`🔍 Returning ${workers.length} workers`);
      return workers;
    }
  },

  ShiftTemplate: {
    id: (parent: any) => parent._id || parent.id
  },

  ShiftSwapRequest: {
    id: (parent: any) => parent._id || parent.id,
    requestingUser: async (parent: any, _: any, context: any) => {
      const db = await getDB();
      return await db.collection('users').findOne({ _id: new ObjectId(parent.requestingUserId) });
    },
    targetUser: async (parent: any, _: any, context: any) => {
      const db = await getDB();
      return await db.collection('users').findOne({ _id: new ObjectId(parent.targetUserId) });
    },
    shift: async (parent: any, _: any, context: any) => {
      const db = await getDB();
      return await db.collection('shifts').findOne({ _id: new ObjectId(parent.shiftId) });
    },
    approvedByUser: async (parent: any, _: any, context: any) => {
      if (!parent.approvedBy) return null;
      const db = await getDB();
      return await db.collection('users').findOne({ _id: new ObjectId(parent.approvedBy) });
    },
    approvedAt: (parent: any) => parent.approvedAt?.toISOString(),
    createdAt: (parent: any) => parent.createdAt.toISOString(),
    updatedAt: (parent: any) => parent.updatedAt.toISOString()
  },

  VacationRequest: {
    id: (parent: any) => parent._id || parent.id,
    user: async (parent: any, _: any, context: any) => {
      console.log('🔍 VacationRequest.user resolver called for:', parent._id || parent.id, 'userId:', parent.userId);
      
      if (!parent.userId) {
        console.warn('❌ VacationRequest has no userId:', parent._id || parent.id);
        return null;
      }
      
      const db = await getDB();
      try {
        // Try to find user by ObjectId first
        console.log('🔍 Trying to find user with ObjectId:', parent.userId);
        let user = await db.collection('users').findOne({ _id: new ObjectId(parent.userId) });
        
        if (user) {
          console.log('✅ Found user with ObjectId lookup:', user.displayName);
          console.log('📊 User object:', {
            _id: user._id,
            _idType: typeof user._id,
            id: user.id,
            displayName: user.displayName,
            email: user.email
          });
        } else {
          // If not found, try with string userId
          console.log('🔍 ObjectId lookup failed, trying with string userId:', parent.userId);
          user = await db.collection('users').findOne({ _id: parent.userId });
          
          if (user) {
            console.log('✅ Found user with string lookup:', user.displayName);
          }
        }
        
        if (!user) {
          console.error('❌ User not found for vacation request. userId:', parent.userId);
          
          // Let's check what users exist in the database
          const sampleUsers = await db.collection('users').find({}).limit(3).toArray();
          console.log('📊 Sample users in DB:', sampleUsers.map(u => ({ _id: u._id, type: typeof u._id, displayName: u.displayName })));
        }
        
        // Ensure the user object has an id field before returning
        if (user) {
          return {
            ...user,
            id: user._id?.toString() || user._id || user.id
          };
        }
        return user;
      } catch (error: any) {
        // If ObjectId conversion fails, try with string
        console.log('⚠️ ObjectId conversion failed:', error.message || error);
        console.log('🔍 Trying with string userId:', parent.userId);
        const user = await db.collection('users').findOne({ _id: parent.userId });
        
        if (user) {
          console.log('✅ Found user with string lookup after error:', user.displayName);
          // Ensure the user object has an id field before returning
          return {
            ...user,
            id: user._id?.toString() || user._id || user.id
          };
        } else {
          console.error('❌ User not found for vacation request. userId:', parent.userId);
        }
        
        return null;
      }
    },
    startDate: (parent: any) => {
      if (!parent.startDate) return null;
      return parent.startDate instanceof Date ? parent.startDate.toISOString() : parent.startDate;
    },
    endDate: (parent: any) => {
      if (!parent.endDate) return null;
      return parent.endDate instanceof Date ? parent.endDate.toISOString() : parent.endDate;
    },
    approvedByUser: async (parent: any, _: any, context: any) => {
      if (!parent.approvedBy) return null;
      const db = await getDB();
      return await db.collection('users').findOne({ _id: new ObjectId(parent.approvedBy) });
    },
    approvedAt: (parent: any) => {
      if (!parent.approvedAt) return null;
      return parent.approvedAt instanceof Date ? parent.approvedAt.toISOString() : parent.approvedAt;
    },
    createdAt: (parent: any) => {
      if (!parent.createdAt) return null;
      return parent.createdAt instanceof Date ? parent.createdAt.toISOString() : parent.createdAt;
    },
    updatedAt: (parent: any) => {
      if (!parent.updatedAt) return null;
      return parent.updatedAt instanceof Date ? parent.updatedAt.toISOString() : parent.updatedAt;
    }
  },

  AvailabilityConstraint: {
    id: (parent: any) => parent._id || parent.id,
    user: async (parent: any, _: any, context: any) => {
      const db = await getDB();
      return await db.collection('users').findOne({ _id: new ObjectId(parent.userId) });
    },
    weekStartDate: (parent: any) => parent.weekStartDate.toISOString(),
    submittedAt: (parent: any) => parent.submittedAt?.toISOString(),
    createdAt: (parent: any) => parent.createdAt.toISOString(),
    updatedAt: (parent: any) => parent.updatedAt.toISOString()
  },

  EmployeeSettings: {
    id: (parent: any) => parent._id || parent.id,
    user: async (parent: any, _: any, context: any) => {
      const db = await getDB();
      return await db.collection('users').findOne({ _id: new ObjectId(parent.userId) });
    },
    createdAt: (parent: any) => parent.createdAt?.toISOString(),
    updatedAt: (parent: any) => parent.updatedAt?.toISOString()
  }
}; 