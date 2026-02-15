const { MongoClient } = require('mongodb');
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://LancelotERP_DB:<MONGO_PASSWORD>@localhost:27017/lancelot?authSource=admin';

async function addMCRUser() {
  const client = new MongoClient(MONGODB_URI);

  try {
    await client.connect();
    console.log('Connected to MongoDB');

    const db = client.db('lancelot');
    const usersCollection = db.collection('users');
    const departmentsCollection = db.collection('departments');

    // First, check if MCR department exists
    const existingDepartment = await departmentsCollection.findOne({ code: 'MCR-General' });
    
    if (!existingDepartment) {
      // Create MCR department
      const newDepartment = {
        id: uuidv4(),
        code: 'MCR-General',
        name: 'MCR',
        category: 'MCR',
        roles: ['MCR Operator', 'MCR Supervisor'],
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      await departmentsCollection.insertOne(newDepartment);
      console.log('Created MCR department');
    }

    // Check if user already exists
    const existingUser = await usersCollection.findOne({ email: 'mcr@example.com' });
    
    if (existingUser) {
      console.log('User mcr@example.com already exists');
      return;
    }

    // Create the MCR user
    const hashedPassword = await bcrypt.hash('MCR123456', 10);
    
    const mcrUser = {
      id: uuidv4(),
      email: 'mcr@example.com',
      password: hashedPassword,
      firstName: 'MCR',
      lastName: 'RGE',
      role: 'MCR Supervisor',
      department: 'MCR-General',
      systemRole: 'DEPARTMENT_ADMIN',
      departments: [{
        departmentId: 'MCR-General',
        departmentName: 'MCR',
        roles: ['MCR Supervisor']
      }],
      permissions: ['admin', 'shift_admin', 'broadcast_admin', 'equipment_admin'],
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    await usersCollection.insertOne(mcrUser);
    console.log('✅ Successfully created mcr@example.com user');
    console.log('📧 Email: mcr@example.com');
    console.log('🔑 Password: MCR123456');
    console.log('🏢 Department: MCR-General');
    console.log('👤 Role: MCR Supervisor');
    console.log('🛡️ System Role: DEPARTMENT_ADMIN');
    console.log('⚡ Permissions: admin, shift_admin, broadcast_admin, equipment_admin');

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await client.close();
  }
}

// Run the script
addMCRUser().catch(console.error);
