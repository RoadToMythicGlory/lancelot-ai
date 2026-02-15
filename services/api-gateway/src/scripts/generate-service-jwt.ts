/**
 * Generate a long-lived JWT for service-to-service authentication.
 *
 * Usage:
 *   npx ts-node src/scripts/generate-service-jwt.ts
 *
 * Outputs a JWT that the AI agent (or other internal service) can use to call
 * the API Gateway GraphQL endpoint. Set the token as AI_AGENT_JWT env var.
 *
 * The token is signed with the current JWT_SECRET and expires in 365 days by
 * default. On secret rotation, re-run this script and update the env var.
 */

import dotenv from 'dotenv';
import path from 'path';

// Load env before importing config
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import { jwtService } from '../services/jwtService';
import { connectMongoDB } from '../config/mongodb';

async function main(): Promise<void> {
  const db = await connectMongoDB();
  const usersCollection = db.collection('users');

  // Find the seeded AI agent user
  const aiUser = await usersCollection.findOne({
    email: 'lancelot-ai@internal.system',
  });

  if (!aiUser) {
    console.error(
      '❌ AI agent user not found. Run the seed script first:\n' +
      '   cd services/ai-agent && npm run seed:ai-user',
    );
    process.exit(1);
  }

  const token = jwtService.signServiceToken({
    userId: aiUser._id.toString(),
    email: aiUser.email,
    role: 'SYSTEM_ADMIN',
    systemRole: aiUser.systemRole || 'SYSTEM_ADMIN',
    firstName: aiUser.firstName,
    lastName: aiUser.lastName,
    displayName: aiUser.displayName,
    departments: aiUser.departments || [],
  });

  console.log('✅ Service JWT generated for AI agent');
  console.log(`   User: ${aiUser.displayName} (${aiUser.email})`);
  console.log(`   Expires: 365 days from now`);
  console.log('');
  console.log('Set this in services/ai-agent/.env:');
  console.log(`   AI_AGENT_JWT=${token}`);
  console.log('');
  console.log('Or in docker-compose.yml environment for ai-agent service.');

  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Failed to generate service JWT:', err);
  process.exit(1);
});
