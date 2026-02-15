#!/usr/bin/env node

import { generateJWTSecret } from '../services/jwtService';

console.log('🔐 JWT Secret Generator for Lancelot Platform');
console.log('==========================================\n');

// Generate different length secrets
const secrets = {
  standard: generateJWTSecret(32),  // 256-bit
  strong: generateJWTSecret(48),    // 384-bit
  maximum: generateJWTSecret(64),   // 512-bit
};

console.log('Generated JWT Secrets:\n');

console.log('Standard (256-bit):');
console.log(`JWT_SECRET="${secrets.standard}"`);
console.log(`Length: ${secrets.standard.length} characters\n`);

console.log('Strong (384-bit) - Recommended:');
console.log(`JWT_SECRET="${secrets.strong}"`);
console.log(`Length: ${secrets.strong.length} characters\n`);

console.log('Maximum (512-bit):');
console.log(`JWT_SECRET="${secrets.maximum}"`);
console.log(`Length: ${secrets.maximum.length} characters\n`);

console.log('📋 Instructions:');
console.log('1. Copy one of the secrets above');
console.log('2. Add it to your .env file');
console.log('3. For production, use at least the "Strong" option');
console.log('4. Keep your old secret as JWT_SECRET_PREVIOUS when rotating\n');

console.log('🔄 For secret rotation:');
console.log('JWT_SECRET="<new-secret-here>"');
console.log('JWT_SECRET_PREVIOUS="<current-secret-here>"');
console.log('JWT_SECRET_VERSION="2" # Increment this');
console.log('JWT_SECRET_ROTATION_DATE="' + new Date().toISOString() + '"');

// Command line argument for direct generation
const args = process.argv.slice(2);
if (args.includes('--env')) {
  console.log('\n📄 Environment variable format:');
  console.log(`JWT_SECRET="${secrets.strong}"`);
}

if (args.includes('--docker')) {
  console.log('\n🐳 Docker secret format:');
  console.log(`echo "${secrets.strong}" | docker secret create jwt_secret -`);
} 