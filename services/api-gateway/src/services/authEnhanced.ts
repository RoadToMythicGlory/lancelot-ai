import crypto from 'crypto';
import { connectMongoDB } from '../config/mongodb';
import { ObjectId } from 'mongodb';
import { createLogger } from '../utils/logger';

const logger = createLogger('auth-enhanced');

// ==================== MFA / 2FA ====================

/**
 * Generate TOTP secret for MFA setup
 * In production, use 'otplib' package for proper TOTP implementation
 */
export function generateMFASecret(): { secret: string; otpauthUrl: string; backupCodes: string[] } {
  const secret = crypto.randomBytes(20).toString('base64url');
  
  // Generate backup codes
  const backupCodes = Array.from({ length: 10 }, () =>
    crypto.randomBytes(4).toString('hex').toUpperCase()
  );

  return {
    secret,
    otpauthUrl: `otpauth://totp/Lancelot:user?secret=${secret}&issuer=Lancelot`,
    backupCodes,
  };
}

/**
 * Verify TOTP code
 * In production, use 'otplib' for proper TOTP verification with time windows
 */
export function verifyMFACode(secret: string, code: string): boolean {
  // Placeholder - in production, use otplib.authenticator.verify()
  logger.info('MFA verification requested (placeholder)');
  return code.length === 6 && /^\d+$/.test(code);
}

export async function enableMFA(userId: string, secret: string, backupCodes: string[]): Promise<boolean> {
  const db = await connectMongoDB();
  
  // Hash backup codes
  const hashedBackupCodes = backupCodes.map(code => ({
    code: crypto.createHash('sha256').update(code).digest('hex'),
    used: false,
  }));

  await db.collection('users').updateOne(
    { _id: new ObjectId(userId) },
    {
      $set: {
        mfaEnabled: true,
        mfaSecret: secret, // In production, encrypt this
        mfaBackupCodes: hashedBackupCodes,
        mfaEnabledAt: new Date(),
      },
    }
  );

  logger.info(`MFA enabled for user ${userId}`);
  return true;
}

export async function disableMFA(userId: string): Promise<boolean> {
  const db = await connectMongoDB();

  await db.collection('users').updateOne(
    { _id: new ObjectId(userId) },
    {
      $set: {
        mfaEnabled: false,
        mfaSecret: null,
        mfaBackupCodes: null,
      },
    }
  );

  logger.info(`MFA disabled for user ${userId}`);
  return true;
}

// ==================== SSO / SAML ====================

export interface SSOConfig {
  provider: 'saml' | 'oauth2' | 'oidc';
  // SAML
  entityId?: string;
  ssoUrl?: string;
  certificate?: string;
  // OAuth2 / OIDC
  clientId?: string;
  clientSecret?: string;
  authorizationUrl?: string;
  tokenUrl?: string;
  userInfoUrl?: string;
  redirectUri?: string;
  scopes?: string[];
}

/**
 * Generate SAML metadata for service provider
 */
export function generateSAMLMetadata(entityId: string, acsUrl: string): string {
  return `<?xml version="1.0"?>
<EntityDescriptor xmlns="urn:oasis:names:tc:SAML:2.0:metadata" entityID="${entityId}">
  <SPSSODescriptor AuthnRequestsSigned="false" WantAssertionsSigned="true"
    protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
    <NameIDFormat>urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress</NameIDFormat>
    <AssertionConsumerService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST"
      Location="${acsUrl}" index="0" isDefault="true"/>
  </SPSSODescriptor>
</EntityDescriptor>`;
}

/**
 * Initiate OAuth2/OIDC login flow
 */
export function generateOAuthAuthorizationUrl(config: SSOConfig, state: string): string {
  if (!config.authorizationUrl || !config.clientId || !config.redirectUri) {
    throw new Error('OAuth2 configuration incomplete');
  }

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    scope: (config.scopes || ['openid', 'profile', 'email']).join(' '),
    state,
  });

  return `${config.authorizationUrl}?${params.toString()}`;
}

/**
 * Exchange OAuth2 authorization code for tokens
 * In production, implement full token exchange
 */
export async function exchangeOAuthCode(
  config: SSOConfig,
  code: string
): Promise<{ accessToken: string; idToken?: string; refreshToken?: string }> {
  if (!config.tokenUrl || !config.clientId || !config.clientSecret || !config.redirectUri) {
    throw new Error('OAuth2 configuration incomplete');
  }

  // In production, make actual HTTP request to token endpoint
  logger.info('OAuth2 code exchange requested (placeholder)');
  
  return {
    accessToken: 'placeholder_access_token',
    idToken: 'placeholder_id_token',
  };
}

// ==================== SESSION MANAGEMENT ====================

export interface Session {
  id: string;
  userId: string;
  token: string;
  refreshToken: string;
  deviceInfo: {
    userAgent: string;
    ip: string;
    platform?: string;
  };
  expiresAt: Date;
  lastActiveAt: Date;
  createdAt: Date;
}

export async function createSession(userId: string, deviceInfo: any): Promise<Session> {
  const db = await connectMongoDB();
  
  const session: any = {
    userId,
    token: crypto.randomBytes(32).toString('hex'),
    refreshToken: crypto.randomBytes(32).toString('hex'),
    deviceInfo,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    lastActiveAt: new Date(),
    createdAt: new Date(),
  };

  const result = await db.collection('sessions').insertOne(session);
  session.id = result.insertedId.toString();

  return session;
}

export async function getUserSessions(userId: string): Promise<Session[]> {
  const db = await connectMongoDB();
  
  const sessions = await db.collection('sessions')
    .find({ userId, expiresAt: { $gt: new Date() } })
    .sort({ lastActiveAt: -1 })
    .toArray();

  return sessions.map((s: any) => ({ ...s, id: s._id.toString() }));
}

export async function revokeSession(sessionId: string): Promise<boolean> {
  const db = await connectMongoDB();
  
  await db.collection('sessions').deleteOne({ _id: new ObjectId(sessionId) });
  return true;
}

export async function revokeAllSessions(userId: string, exceptSessionId?: string): Promise<number> {
  const db = await connectMongoDB();
  
  const query: any = { userId };
  if (exceptSessionId) {
    query._id = { $ne: new ObjectId(exceptSessionId) };
  }

  const result = await db.collection('sessions').deleteMany(query);
  return result.deletedCount;
}

export const authEnhanced = {
  generateMFASecret,
  verifyMFACode,
  enableMFA,
  disableMFA,
  generateSAMLMetadata,
  generateOAuthAuthorizationUrl,
  exchangeOAuthCode,
  createSession,
  getUserSessions,
  revokeSession,
  revokeAllSessions,
};
