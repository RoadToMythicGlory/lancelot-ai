// Script to add IT Department Admin user
process.env.NODE_ENV = 'development';

import bcrypt from 'bcrypt';
import { connectMongoDB, closeMongoDB } from '../config/mongodb';
import { config } from '../config';

async function addITDepartmentAdmin() {
  try {
    console.log('🌱 Adding IT Department Admin user...');
    
    const db = await connectMongoDB();
    const usersCollection = db.collection('users');
    
    // Check if user already exists
    const existingUser = await usersCollection.findOne({ email: 'itadmin@example.com' });
    
    if (existingUser) {
      console.log('ℹ️  IT Admin user already exists');
      return;
    }
    
    // Hash password
    const hashedPassword = await bcrypt.hash('123456', config.BCRYPT_ROUNDS);
    
    const itAdminUser = {
      email: 'itadmin@example.com',
      password: hashedPassword,
      firstName: 'IT',
      lastName: 'Admin',
      displayName: 'IT Admin',
      systemRole: 'DEPARTMENT_ADMIN',
      department: 'IT',  // For compatibility
      departments: [
        {
          departmentId: 'IT',
          departmentName: 'IT',
          roles: ['Department Administrator']
        }
      ],
      permissions: ['admin', 'user', 'shift_admin'], // For compatibility
      phone: '',
      mobile: '',
      isActive: true,
      lastLogin: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: 'system',
      updatedBy: 'system'
    };
    
    await usersCollection.insertOne(itAdminUser);
    console.log('✅ Created IT Department Admin user');
    console.log('   Email: itadmin@example.com');
    console.log('   Password: 123456');
    console.log('   Department: IT');
    console.log('   Role: DEPARTMENT_ADMIN');
    
  } catch (error) {
    console.error('❌ Error adding IT admin:', error);
    throw error;
  } finally {
    await closeMongoDB();
    process.exit(0);
  }
}

// Run the script
addITDepartmentAdmin(); 