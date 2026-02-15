// Ensure we're in development mode for local MongoDB
process.env.NODE_ENV = 'development';

import bcrypt from 'bcrypt';
import { connectMongoDB } from '../config/mongodb';
import { config } from '../config';

// Define all departments according to the specification
const departments = [
  // IT
  { code: 'IT', name: 'IT', category: 'IT', roles: ['System Administrator', 'Developer', 'Support'], isActive: true },
  { code: 'IT-MEDIA', name: 'IT Media', category: 'IT', roles: ['Media Systems Engineer', 'Broadcast IT Specialist'], isActive: true },
  
  // MCR
  { code: 'MCR-Playout', name: 'Playout', category: 'MCR', roles: ['Playout Operator', 'Senior Playout Operator'], isActive: true },
  { code: 'MCR-Ingest', name: 'Ingest', category: 'MCR', roles: ['Ingest Operator', 'Senior Ingest Operator'], isActive: true },
  { code: 'MCR-General', name: 'MCR', category: 'MCR', roles: ['MCR Operator', 'MCR Supervisor'], isActive: true },
  
  // Warehouse
  { code: 'Warehouse', name: 'Warehouse', category: 'Warehouse', roles: ['Warehouse Manager', 'Equipment Handler'], isActive: true },
  
  // Visuals
  { code: 'Visuals-VideoEditors', name: 'Video Editors', category: 'Visuals', roles: ['Video Editor', 'Senior Video Editor'], isActive: true },
  
  // New Media
  { code: 'NewMedia-Producers', name: 'New Media Producers', category: 'New Media', roles: ['Producer', 'Senior Producer'], isActive: true },
  { code: 'NewMedia-Editors', name: 'New Media Editors', category: 'New Media', roles: ['Editor', 'Senior Editor'], isActive: true },
  { code: 'NewMedia-Analysts', name: 'New Media Analysts', category: 'New Media', roles: ['Analyst', 'Senior Analyst'], isActive: true },
  
  // News
  { code: 'News-Producers', name: 'Producers', category: 'News', roles: ['News Producer', 'Senior News Producer'], isActive: true },
  { code: 'News-Desk', name: 'Desk', category: 'News', roles: ['Desk Editor', 'Senior Desk Editor'], isActive: true },
  { code: 'News-Editors', name: 'Editors', category: 'News', roles: ['News Editor', 'Senior News Editor'], isActive: true },
  { code: 'News-ProductionAssistants', name: 'Production Assistants', category: 'News', roles: ['Production Assistant', 'Senior Production Assistant'], isActive: true },
  { code: 'News-Researchers', name: 'Researchers', category: 'News', roles: ['Researcher', 'Senior Researcher'], isActive: true },
  
  // Production
  { code: 'Production-VTR', name: 'VTR', category: 'Production', roles: ['VTR Operator', 'Senior VTR Operator'], isActive: true },
  { code: 'Production-Directors', name: 'Directors', category: 'Production', roles: ['Director', 'Senior Director'], isActive: true },
  { code: 'Production-CG', name: 'CG', category: 'Production', roles: ['CG Operator', 'Senior CG Operator'], isActive: true },
  { code: 'Production-Commentators', name: 'Commentators', category: 'Production', roles: ['Commentator', 'Senior Commentator'], isActive: true },
  { code: 'Production-Soundmen', name: 'Soundmen', category: 'Production', roles: ['Sound Engineer', 'Senior Sound Engineer'], isActive: true },
  { code: 'Production-Technicians', name: 'Technicians', category: 'Production', roles: ['Technician', 'Senior Technician'], isActive: true },
  { code: 'Production-ExternalTechnicians', name: 'External Technicians', category: 'Production', roles: ['External Technician'], isActive: true }
];

async function seedDepartmentsAndUsers() {
  try {
    console.log('🌱 Starting departments and users seeding process...');
    
    const db = await connectMongoDB();
    
    // Clear and seed departments
    console.log('🏢 Seeding departments...');
    const departmentsCollection = db.collection('departments');
    await departmentsCollection.deleteMany({});
    
    for (const dept of departments) {
      await departmentsCollection.insertOne({
        ...dept,
        createdAt: new Date(),
        updatedAt: new Date()
      });
    }
    console.log(`✅ Seeded ${departments.length} departments`);
    
    // Create indexes
    await departmentsCollection.createIndex({ code: 1 }, { unique: true });
    await departmentsCollection.createIndex({ category: 1 });
    
    // Seed initial system admin user
    console.log('👤 Creating system admin user...');
    const usersCollection = db.collection('users');
    
    // Check if admin already exists
    const existingAdmin = await usersCollection.findOne({ email: 'admin@example.com' });
    
    if (!existingAdmin) {
      const hashedPassword = await bcrypt.hash('ChangeMe123!', config.BCRYPT_ROUNDS);
      
      const adminUser = {
        email: 'admin@example.com',
        password: hashedPassword,
        firstName: 'System',
        lastName: 'Administrator',
        displayName: 'System Administrator',
        systemRole: 'SYSTEM_ADMIN',
        departments: [
          {
            departmentId: 'IT',
            departmentName: 'IT',
            roles: ['System Administrator']
          }
        ],
        phone: '',
        mobile: '',
        isActive: true,
        lastLogin: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: 'system',
        updatedBy: 'system'
      };
      
      await usersCollection.insertOne(adminUser);
      console.log('✅ Created system admin user');
      console.log('   Email: admin@example.com');
      console.log('   Password: ChangeMe123!');
      console.log('   Role: SYSTEM_ADMIN');
    } else {
      console.log('ℹ️  System admin user already exists');
    }
    
    // Create indexes for users
    await usersCollection.createIndex({ email: 1 }, { unique: true });
    await usersCollection.createIndex({ systemRole: 1 });
    await usersCollection.createIndex({ 'departments.departmentId': 1 });
    await usersCollection.createIndex({ isActive: 1 });
    
    console.log('✅ Seeding completed successfully!');
    
  } catch (error) {
    console.error('❌ Error during seeding:', error);
    throw error;
  } finally {
    process.exit(0);
  }
}

// Run the seeding
seedDepartmentsAndUsers(); 