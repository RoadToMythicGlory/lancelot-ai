#!/usr/bin/env node

/**
 * Vizrt Integration Setup Script
 * This script helps verify and set up the Vizrt integration in the Lancelot backend
 */

const fs = require('fs');
const path = require('path');

console.log('🎯 Lancelot Vizrt Integration Setup\n');

// Check if files exist
const checks = [
  {
    name: 'GraphQL Schema',
    path: 'src/schema/schema.graphql',
    check: (content) => content.includes('VizrtTemplate') && content.includes('vizrtConfigs'),
    fix: 'The Vizrt schema has been added to the main schema.graphql file'
  },
  {
    name: 'Vizrt Resolvers',
    path: 'src/resolvers/vizrt.ts',
    check: () => true,
    fix: 'Vizrt resolvers file exists'
  },
  {
    name: 'Vizrt Models',
    path: 'src/models/vizrt.models.ts',
    check: () => true,
    fix: 'Vizrt models file exists'
  },
  {
    name: 'Models Index',
    path: 'src/models/index.ts',
    check: (content) => content.includes('vizrt.models'),
    fix: 'Vizrt models are exported from index'
  },
  {
    name: 'Main Index Integration',
    path: 'src/index.ts',
    check: (content) => content.includes('vizrtResolvers') && content.includes('./resolvers/vizrt'),
    fix: 'Vizrt resolvers are imported and registered'
  }
];

let allGood = true;

checks.forEach(check => {
  const filePath = path.join(__dirname, check.path);
  
  if (!fs.existsSync(filePath)) {
    console.log(`❌ ${check.name}: File missing (${check.path})`);
    allGood = false;
    return;
  }
  
  const content = fs.readFileSync(filePath, 'utf8');
  
  if (check.check(content)) {
    console.log(`✅ ${check.name}: ${check.fix}`);
  } else {
    console.log(`❌ ${check.name}: Not properly configured`);
    allGood = false;
  }
});

console.log('\n' + '='.repeat(50));

if (allGood) {
  console.log('🎉 Vizrt integration is properly set up!');
  console.log('\nNext steps:');
  console.log('1. Restart your backend server');
  console.log('2. Run the seed script: npm run ts-node src/scripts/seed-vizrt-data.ts');
  console.log('3. Test the integration from the frontend');
} else {
  console.log('⚠️  Some issues need to be resolved.');
  console.log('\nPlease check the files mentioned above and ensure:');
  console.log('- All Vizrt files are in place');
  console.log('- Schema includes Vizrt types');
  console.log('- Resolvers are imported and registered');
  console.log('- Models are exported');
}

console.log('\n📚 For detailed setup instructions, see: docs/VIZRT_INTEGRATION_GUIDE.md');
