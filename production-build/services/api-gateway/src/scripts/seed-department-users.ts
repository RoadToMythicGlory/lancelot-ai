// Ensure we're in development mode for local MongoDB
process.env.NODE_ENV = 'development';

import bcrypt from 'bcrypt';
import { connectMongoDB } from '../config/mongodb';
import { config } from '../config';
import * as fs from 'fs';
import * as path from 'path';

// Define all departments and their users
const departmentUsers = [
  // IT Department
  {
    department: { code: 'IT', name: 'IT', roles: ['System Administrator', 'Developer', 'Support'] },
    users: [
      { firstName: 'David', lastName: 'Cohen', role: 'System Administrator', email: 'david.cohen@example.com' },
      { firstName: 'Sarah', lastName: 'Levy', role: 'Developer', email: 'sarah.levy@example.com' },
      { firstName: 'Michael', lastName: 'Shapiro', role: 'Support', email: 'michael.shapiro@example.com' }
    ]
  },
  {
    department: { code: 'IT-MEDIA', name: 'IT Media', roles: ['Media Systems Engineer', 'Broadcast IT Specialist'] },
    users: [
      { firstName: 'Rachel', lastName: 'Green', role: 'Media Systems Engineer', email: 'rachel.green@example.com' },
      { firstName: 'Daniel', lastName: 'Brown', role: 'Broadcast IT Specialist', email: 'daniel.brown@example.com' },
      { firstName: 'Maya', lastName: 'Goldstein', role: 'Media Systems Engineer', email: 'maya.goldstein@example.com' }
    ]
  },
  
  // MCR Department
  {
    department: { code: 'MCR-Playout', name: 'Playout', roles: ['Playout Operator', 'Senior Playout Operator'] },
    users: [
      { firstName: 'Yossi', lastName: 'Mizrahi', role: 'Senior Playout Operator', email: 'yossi.mizrahi@example.com' },
      { firstName: 'Tal', lastName: 'Avraham', role: 'Playout Operator', email: 'tal.avraham@example.com' },
      { firstName: 'Shira', lastName: 'Ben-David', role: 'Playout Operator', email: 'shira.bendavid@example.com' }
    ]
  },
  {
    department: { code: 'MCR-Ingest', name: 'Ingest', roles: ['Ingest Operator', 'Senior Ingest Operator'] },
    users: [
      { firstName: 'Eli', lastName: 'Katz', role: 'Senior Ingest Operator', email: 'eli.katz@example.com' },
      { firstName: 'Noa', lastName: 'Friedman', role: 'Ingest Operator', email: 'noa.friedman@example.com' },
      { firstName: 'Avi', lastName: 'Rosenberg', role: 'Ingest Operator', email: 'avi.rosenberg@example.com' }
    ]
  },
  {
    department: { code: 'MCR-General', name: 'MCR', roles: ['MCR Operator', 'MCR Supervisor'] },
    users: [
      { firstName: 'Moshe', lastName: 'Klein', role: 'MCR Supervisor', email: 'moshe.klein@example.com' },
      { firstName: 'Yael', lastName: 'Weiss', role: 'MCR Operator', email: 'yael.weiss@example.com' },
      { firstName: 'Amit', lastName: 'Levi', role: 'MCR Operator', email: 'amit.levi@example.com' }
    ]
  },
  
  // Warehouse
  {
    department: { code: 'Warehouse', name: 'Warehouse', roles: ['Warehouse Manager', 'Equipment Handler'] },
    users: [
      { firstName: 'Shlomo', lastName: 'Golan', role: 'Warehouse Manager', email: 'shlomo.golan@example.com' },
      { firstName: 'Meir', lastName: 'Azoulay', role: 'Equipment Handler', email: 'meir.azoulay@example.com' },
      { firstName: 'Dina', lastName: 'Segal', role: 'Equipment Handler', email: 'dina.segal@example.com' }
    ]
  },
  
  // Visuals
  {
    department: { code: 'Visuals-VideoEditors', name: 'Video Editors', roles: ['Video Editor', 'Senior Video Editor'] },
    users: [
      { firstName: 'Ron', lastName: 'Peretz', role: 'Senior Video Editor', email: 'ron.peretz@example.com' },
      { firstName: 'Liora', lastName: 'Dahan', role: 'Video Editor', email: 'liora.dahan@example.com' },
      { firstName: 'Guy', lastName: 'Mor', role: 'Video Editor', email: 'guy.mor@example.com' }
    ]
  },
  
  // New Media
  {
    department: { code: 'NewMedia-Producers', name: 'New Media Producers', roles: ['Producer', 'Senior Producer'] },
    users: [
      { firstName: 'Tamar', lastName: 'Schwartz', role: 'Senior Producer', email: 'tamar.schwartz@example.com' },
      { firstName: 'Ido', lastName: 'Gabay', role: 'Producer', email: 'ido.gabay@example.com' },
      { firstName: 'Nir', lastName: 'Hasson', role: 'Producer', email: 'nir.hasson@example.com' }
    ]
  },
  {
    department: { code: 'NewMedia-Editors', name: 'New Media Editors', roles: ['Editor', 'Senior Editor'] },
    users: [
      { firstName: 'Orly', lastName: 'Biton', role: 'Senior Editor', email: 'orly.biton@example.com' },
      { firstName: 'Shaul', lastName: 'Navon', role: 'Editor', email: 'shaul.navon@example.com' },
      { firstName: 'Michal', lastName: 'Rosen', role: 'Editor', email: 'michal.rosen@example.com' }
    ]
  },
  {
    department: { code: 'NewMedia-Analysts', name: 'New Media Analysts', roles: ['Analyst', 'Senior Analyst'] },
    users: [
      { firstName: 'Eitan', lastName: 'Malka', role: 'Senior Analyst', email: 'eitan.malka@example.com' },
      { firstName: 'Hila', lastName: 'Shalom', role: 'Analyst', email: 'hila.shalom@example.com' },
      { firstName: 'Kobi', lastName: 'Yaakov', role: 'Analyst', email: 'kobi.yaakov@example.com' }
    ]
  },
  
  // News
  {
    department: { code: 'News-Producers', name: 'Producers', roles: ['News Producer', 'Senior News Producer'] },
    users: [
      { firstName: 'Yoram', lastName: 'Arbel', role: 'Senior News Producer', email: 'yoram.arbel@example.com' },
      { firstName: 'Dana', lastName: 'Stern', role: 'News Producer', email: 'dana.stern@example.com' },
      { firstName: 'Boaz', lastName: 'Goldberg', role: 'News Producer', email: 'boaz.goldberg@example.com' }
    ]
  },
  {
    department: { code: 'News-Desk', name: 'Desk', roles: ['Desk Editor', 'Senior Desk Editor'] },
    users: [
      { firstName: 'Iris', lastName: 'Nahum', role: 'Senior Desk Editor', email: 'iris.nahum@example.com' },
      { firstName: 'Gal', lastName: 'Ziv', role: 'Desk Editor', email: 'gal.ziv@example.com' },
      { firstName: 'Rina', lastName: 'Barak', role: 'Desk Editor', email: 'rina.barak@example.com' }
    ]
  },
  {
    department: { code: 'News-Editors', name: 'Editors', roles: ['News Editor', 'Senior News Editor'] },
    users: [
      { firstName: 'Asaf', lastName: 'Meiri', role: 'Senior News Editor', email: 'asaf.meiri@example.com' },
      { firstName: 'Vered', lastName: 'Harari', role: 'News Editor', email: 'vered.harari@example.com' },
      { firstName: 'Lior', lastName: 'Saban', role: 'News Editor', email: 'lior.saban@example.com' }
    ]
  },
  {
    department: { code: 'News-ProductionAssistants', name: 'Production Assistants', roles: ['Production Assistant', 'Senior Production Assistant'] },
    users: [
      { firstName: 'Naama', lastName: 'Tzur', role: 'Senior Production Assistant', email: 'naama.tzur@example.com' },
      { firstName: 'Benny', lastName: 'Ohana', role: 'Production Assistant', email: 'benny.ohana@example.com' },
      { firstName: 'Sigal', lastName: 'Yosef', role: 'Production Assistant', email: 'sigal.yosef@example.com' }
    ]
  },
  {
    department: { code: 'News-Researchers', name: 'Researchers', roles: ['Researcher', 'Senior Researcher'] },
    users: [
      { firstName: 'Efrat', lastName: 'Alon', role: 'Senior Researcher', email: 'efrat.alon@example.com' },
      { firstName: 'Uri', lastName: 'Magen', role: 'Researcher', email: 'uri.magen@example.com' },
      { firstName: 'Sivan', lastName: 'Eldar', role: 'Researcher', email: 'sivan.eldar@example.com' }
    ]
  },
  
  // Production
  {
    department: { code: 'Production-VTR', name: 'VTR', roles: ['VTR Operator', 'Senior VTR Operator'] },
    users: [
      { firstName: 'Doron', lastName: 'Paz', role: 'Senior VTR Operator', email: 'doron.paz@example.com' },
      { firstName: 'Keren', lastName: 'Nissan', role: 'VTR Operator', email: 'keren.nissan@example.com' },
      { firstName: 'Ilan', lastName: 'Gur', role: 'VTR Operator', email: 'ilan.gur@example.com' }
    ]
  },
  {
    department: { code: 'Production-Directors', name: 'Directors', roles: ['Director', 'Senior Director'] },
    users: [
      { firstName: 'Zvi', lastName: 'Romano', role: 'Senior Director', email: 'zvi.romano@example.com' },
      { firstName: 'Miri', lastName: 'Agmon', role: 'Director', email: 'miri.agmon@example.com' },
      { firstName: 'Rafi', lastName: 'Simchon', role: 'Director', email: 'rafi.simchon@example.com' }
    ]
  },
  {
    department: { code: 'Production-CG', name: 'CG', roles: ['CG Operator', 'Senior CG Operator'] },
    users: [
      { firstName: 'Tali', lastName: 'Bar', role: 'Senior CG Operator', email: 'tali.bar@example.com' },
      { firstName: 'Ofer', lastName: 'Shahar', role: 'CG Operator', email: 'ofer.shahar@example.com' },
      { firstName: 'Limor', lastName: 'Erez', role: 'CG Operator', email: 'limor.erez@example.com' }
    ]
  },
  {
    department: { code: 'Production-Commentators', name: 'Commentators', roles: ['Commentator', 'Senior Commentator'] },
    users: [
      { firstName: 'Nadav', lastName: 'Hadar', role: 'Senior Commentator', email: 'nadav.hadar@example.com' },
      { firstName: 'Yoni', lastName: 'Rozen', role: 'Commentator', email: 'yoni.rozen@example.com' },
      { firstName: 'Alon', lastName: 'Dror', role: 'Commentator', email: 'alon.dror@example.com' }
    ]
  },
  {
    department: { code: 'Production-Soundmen', name: 'Soundmen', roles: ['Sound Engineer', 'Senior Sound Engineer'] },
    users: [
      { firstName: 'Haim', lastName: 'Zohar', role: 'Senior Sound Engineer', email: 'haim.zohar@example.com' },
      { firstName: 'Ruthi', lastName: 'Oren', role: 'Sound Engineer', email: 'ruthi.oren@example.com' },
      { firstName: 'Gabi', lastName: 'Tal', role: 'Sound Engineer', email: 'gabi.tal@example.com' }
    ]
  },
  {
    department: { code: 'Production-Technicians', name: 'Technicians', roles: ['Technician', 'Senior Technician'] },
    users: [
      { firstName: 'Shai', lastName: 'Vaknin', role: 'Senior Technician', email: 'shai.vaknin@example.com' },
      { firstName: 'Nurit', lastName: 'Almog', role: 'Technician', email: 'nurit.almog@example.com' },
      { firstName: 'Motti', lastName: 'Ben-Ami', role: 'Technician', email: 'motti.benami@example.com' }
    ]
  },
  {
    department: { code: 'Production-ExternalTechnicians', name: 'External Technicians', roles: ['External Technician'] },
    users: [
      { firstName: 'Ariel', lastName: 'Kadosh', role: 'External Technician', email: 'ariel.kadosh@example.com' },
      { firstName: 'Dafna', lastName: 'Raviv', role: 'External Technician', email: 'dafna.raviv@example.com' },
      { firstName: 'Elad', lastName: 'Shemer', role: 'External Technician', email: 'elad.shemer@example.com' }
    ]
  }
];

// Generate password for a user based on their name
function generatePassword(firstName: string, lastName: string): string {
  return `${firstName.charAt(0).toUpperCase()}${lastName.toLowerCase()}@Lancelot!`;
}

async function seedDepartmentUsers() {
  try {
    console.log('🌱 Starting user seeding process...');
    
    const db = await connectMongoDB();
    const usersCollection = db.collection('users');
    const departmentsCollection = db.collection('departments');
    
    let credentials: string[] = [];
    credentials.push('CHANNEL1 USER CREDENTIALS - KEEP SECURE!');
    credentials.push('='.repeat(80));
    credentials.push('Generated on: ' + new Date().toLocaleString());
    credentials.push('='.repeat(80));
    credentials.push('');
    
    let totalUsersCreated = 0;
    
    for (const deptData of departmentUsers) {
      const department = await departmentsCollection.findOne({ code: deptData.department.code });
      
      if (!department) {
        console.log(`⚠️  Department ${deptData.department.code} not found. Skipping...`);
        continue;
      }
      
      credentials.push(`\n${deptData.department.name} Department (${deptData.department.code})`);
      credentials.push('-'.repeat(50));
      
      console.log(`\n🏢 Creating users for ${deptData.department.name}...`);
      
      for (const userData of deptData.users) {
        // Check if user already exists
        const existingUser = await usersCollection.findOne({ email: userData.email });
        
        if (existingUser) {
          console.log(`   ⚠️  User ${userData.email} already exists. Skipping...`);
          continue;
        }
        
        const password = generatePassword(userData.firstName, userData.lastName);
        const hashedPassword = await bcrypt.hash(password, config.BCRYPT_ROUNDS);
        
        const newUser = {
          email: userData.email,
          password: hashedPassword,
          firstName: userData.firstName,
          lastName: userData.lastName,
          displayName: `${userData.firstName} ${userData.lastName}`,
          systemRole: 'DEPARTMENT_USER',
          departments: [
            {
              departmentId: deptData.department.code,
              departmentName: deptData.department.name,
              roles: [userData.role]
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
        
        await usersCollection.insertOne(newUser);
        totalUsersCreated++;
        
        console.log(`   ✅ Created user: ${userData.email}`);
        
        // Add to credentials file
        credentials.push(`Name: ${userData.firstName} ${userData.lastName}`);
        credentials.push(`Role: ${userData.role}`);
        credentials.push(`Email: ${userData.email}`);
        credentials.push(`Password: ${password}`);
        credentials.push('');
      }
    }
    
    // Save credentials to file
    const credentialsPath = path.join(process.cwd(), 'DEPARTMENT_USER_CREDENTIALS.txt');
    fs.writeFileSync(credentialsPath, credentials.join('\n'));
    
    console.log('\n' + '='.repeat(80));
    console.log(`✅ Successfully created ${totalUsersCreated} users across all departments!`);
    console.log(`📄 Credentials saved to: ${credentialsPath}`);
    console.log('⚠️  IMPORTANT: Keep this file secure and delete after distributing passwords!');
    console.log('='.repeat(80));
    
  } catch (error) {
    console.error('❌ Error during user seeding:', error);
    throw error;
  } finally {
    process.exit(0);
  }
}

// Run the seeding
seedDepartmentUsers();


