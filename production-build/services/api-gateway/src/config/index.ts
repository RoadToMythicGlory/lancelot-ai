import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

// Helper function to ensure required environment variables are set
function requireEnv(name: string, defaultValue?: string): string {
  const value = process.env[name] || defaultValue;
  
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  
  return value;
}

// Helper function to validate JWT secret strength
function validateJwtSecret(secret: string): void {
  const minLength = process.env.NODE_ENV === 'production' ? 64 : 32;
  
  if (secret.length < minLength) {
    throw new Error(`JWT_SECRET must be at least ${minLength} characters. Current length: ${secret.length}`);
  }
  
  // Check for weak patterns in any environment
  const weakPatterns = ['secret', 'password', '123456', 'dev', 'test', 'change', 'default', 'example'];
  const secretLower = secret.toLowerCase();
  
  for (const pattern of weakPatterns) {
    if (secretLower.includes(pattern)) {
      throw new Error('JWT_SECRET contains weak patterns. Use a cryptographically secure random string.');
    }
  }
  
  // Check entropy (rough estimate)
  const uniqueChars = new Set(secret).size;
  if (uniqueChars < 10) {
    throw new Error('JWT_SECRET has low entropy. Use a more random string with diverse characters.');
  }
}

export const config = {
  // Node Environment
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT || process.env.API_PORT || '4000', 10),
  

  
  // MongoDB
  MONGO_CONNECTION_STRING: process.env.MONGO_CONNECTION_STRING || 
    process.env.MONGODB_URL || 
    (process.env.NODE_ENV === 'development'
      ? 'mongodb://localhost:27017/lancelot'
      : `mongodb://LancelotERP_DB:${process.env.MONGO_PASSWORD || '<MONGO_PASSWORD>'}@${process.env.MONGO_HOST || 'mongodb'}:27017/lancelot?authSource=admin`
    ),
  
  // Redis
  // In production, do NOT default to localhost to avoid unwanted Redis dependency.
  // Provide REDIS_URL explicitly if you want Redis in production.
  REDIS_URL: process.env.REDIS_URL || (process.env.NODE_ENV === 'production' ? '' : 'redis://localhost:6379'),
  
  // Application
  APP_NAME: process.env.APP_NAME || 'Lancelot Platform',
  API_PREFIX: process.env.API_PREFIX || '/api/v1',
  
  // GraphQL
  GRAPHQL_PATH: process.env.GRAPHQL_PATH || '/graphql',
  GRAPHQL_PLAYGROUND: process.env.GRAPHQL_PLAYGROUND === 'true',
  
  // CORS
  CORS_ORIGIN: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3000'],
  CORS_ALLOWED_ORIGINS: process.env.CORS_ALLOWED_ORIGINS?.split(',') || 
    (process.env.NODE_ENV === 'production' ? [] : ['http://localhost:3000', 'http://localhost:3001', 'http://127.0.0.1:3000', 'http://0.0.0.0:3000']),
  CORS_ALLOW_CREDENTIALS: process.env.CORS_ALLOW_CREDENTIALS === 'true' || process.env.NODE_ENV === 'development',
  
  // JWT - Secure defaults required
  JWT_SECRET: requireEnv('JWT_SECRET', 
    process.env.NODE_ENV === 'development' 
      ? require('crypto').randomBytes(48).toString('base64') // Generate random secret for dev
      : undefined
  ),
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',
  JWT_REFRESH_EXPIRES_IN: process.env.JWT_REFRESH_EXPIRES_IN || '30d',
  
  // Security
  BCRYPT_ROUNDS: parseInt(process.env.BCRYPT_ROUNDS || '10', 10),
  SESSION_SECRET: process.env.SESSION_SECRET || 
    (process.env.NODE_ENV === 'development' 
      ? require('crypto').randomBytes(32).toString('base64')
      : requireEnv('SESSION_SECRET')
    ),
  CSRF_SECRET: process.env.CSRF_SECRET || 
    (process.env.NODE_ENV === 'development' 
      ? require('crypto').randomBytes(32).toString('base64')
      : requireEnv('CSRF_SECRET')
    ),
  
  // Rate Limiting
  RATE_LIMIT_WINDOW_MS: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10), // 15 minutes
  RATE_LIMIT_MAX_REQUESTS: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
  RATE_LIMIT_LOGIN_MAX: parseInt(process.env.RATE_LIMIT_LOGIN_MAX || '5', 10),
  
  // Microsoft Graph
  MS_GRAPH_CLIENT_ID: process.env.MS_GRAPH_CLIENT_ID || '',
  MS_GRAPH_CLIENT_SECRET: process.env.MS_GRAPH_CLIENT_SECRET || '',
  MS_GRAPH_TENANT_ID: process.env.MS_GRAPH_TENANT_ID || '',
  MS_GRAPH_REDIRECT_URI: process.env.MS_GRAPH_REDIRECT_URI || 'http://localhost:3000/auth/callback',
  
  // Vendor APIs
  LIVEU_API_KEY: process.env.LIVEU_API_KEY || '',
  LIVEU_API_URL: process.env.LIVEU_API_URL || 'https://api.liveu.tv/v1',
  VMIX_API_KEY: process.env.VMIX_API_KEY || '',
  VMIX_API_URL: process.env.VMIX_API_URL || 'http://localhost:8088/api',
  MAGNUM_API_KEY: process.env.MAGNUM_API_KEY || '',
  MAGNUM_API_URL: process.env.MAGNUM_API_URL || 'https://api.magnum.tv/v1',
  UNITY_API_KEY: process.env.UNITY_API_KEY || '',
  UNITY_API_URL: process.env.UNITY_API_URL || 'https://api.unity.com/v1',
  
  // Email (optional)
  SMTP_HOST: process.env.SMTP_HOST || '',
  SMTP_PORT: parseInt(process.env.SMTP_PORT || '587', 10),
  SMTP_SECURE: process.env.SMTP_SECURE === 'true',
  SMTP_USER: process.env.SMTP_USER || '',
  SMTP_PASS: process.env.SMTP_PASS || '',
  EMAIL_FROM: process.env.EMAIL_FROM || 'Lancelot Platform <noreply@lancelot.com>',
  
  // Features
  ENABLE_EXCEL_IMPORT: process.env.ENABLE_EXCEL_IMPORT !== 'false',
  ENABLE_BARCODE_SCANNER: process.env.ENABLE_BARCODE_SCANNER !== 'false',
  ENABLE_VOICE_COMMANDS: process.env.ENABLE_VOICE_COMMANDS === 'true',
  ENABLE_AR_OVERLAY: process.env.ENABLE_AR_OVERLAY === 'true',
  
  // Locale
  DEFAULT_LOCALE: process.env.DEFAULT_LOCALE || 'he',
  FALLBACK_LOCALE: process.env.FALLBACK_LOCALE || 'en',
  TIMEZONE: process.env.TIMEZONE || 'Asia/Jerusalem',
  
  // Debug
  DEBUG_SQL: process.env.DEBUG_SQL === 'true',
  DEBUG_GRAPHQL: process.env.DEBUG_GRAPHQL === 'true',
  DEBUG_PERMISSIONS: process.env.DEBUG_PERMISSIONS === 'true',
  
  // Excel Parser
  EXCEL_PARSER_URL: process.env.EXCEL_PARSER_URL || 'http://localhost:5001',
  
  // Routing Engine
  ROUTING_ENGINE_URL: process.env.ROUTING_ENGINE_URL || 'http://localhost:5002',
};

// Security validation on startup
console.log('🔐 Validating security configuration...');

// Validate JWT secret strength
try {
  validateJwtSecret(config.JWT_SECRET);
  console.log('✅ JWT secret validation passed');
} catch (error) {
  console.error('❌ JWT Secret validation failed:', error instanceof Error ? error.message : String(error));
  if (process.env.NODE_ENV === 'production') {
    process.exit(1);
  } else {
    console.warn('⚠️  WARNING: Weak JWT secret in development mode. This is NOT safe for production!');
  }
}

// Log security configuration (safely)
if (process.env.NODE_ENV === 'development') {
  console.log('🔐 Security Configuration:');
  console.log(`   - Environment: ${config.NODE_ENV}`);
  console.log(`   - JWT_SECRET length: ${config.JWT_SECRET.length} chars`);
  console.log(`   - JWT_EXPIRES_IN: ${config.JWT_EXPIRES_IN}`);
  console.log(`   - BCRYPT_ROUNDS: ${config.BCRYPT_ROUNDS}`);
  console.log(`   - Rate limit: ${config.RATE_LIMIT_MAX_REQUESTS} requests per ${config.RATE_LIMIT_WINDOW_MS/1000/60} minutes`);
  console.log(`   - CORS origins: ${config.CORS_ALLOWED_ORIGINS.join(', ')}`);
}

export default config; 