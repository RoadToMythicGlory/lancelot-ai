import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { config } from '../config';

export interface JWTPayload {
  userId: string;
  email: string;
  role: string;
  systemRole?: string;
  accountType?: string; // 'streamer' for B2C users, undefined for ERP users
  departmentId?: string;
  departments?: any[];
  firstName?: string;
  lastName?: string;
  displayName?: string;
  iat?: number;
  exp?: number;
  version?: number;
}

interface JWTSecretConfig {
  current: string;
  previous?: string;
  rotationDate?: Date;
  version: number;
}

class JWTService {
  private secrets: JWTSecretConfig;
  private readonly minSecretLength = 32;

  constructor() {
    this.secrets = this.initializeSecrets();
    this.validateSecrets();
  }

  private initializeSecrets(): JWTSecretConfig {
    const currentSecret = config.JWT_SECRET;
    const previousSecret = process.env.JWT_SECRET_PREVIOUS;
    const rotationDateStr = process.env.JWT_SECRET_ROTATION_DATE;
    const version = parseInt(process.env.JWT_SECRET_VERSION || '1', 10);

    return {
      current: currentSecret,
      previous: previousSecret,
      rotationDate: rotationDateStr ? new Date(rotationDateStr) : undefined,
      version,
    };
  }

  private validateSecrets(): void {
    if (!this.secrets.current) {
      throw new Error('JWT_SECRET is required');
    }

    if (config.NODE_ENV === 'production') {
      // Validate secret strength
      if (this.secrets.current.length < this.minSecretLength) {
        throw new Error(`JWT_SECRET must be at least ${this.minSecretLength} characters in production`);
      }

      // Check for weak patterns
      const weakPatterns = ['secret', 'password', '123456', 'dev', 'test', 'change'];
      const secretLower = this.secrets.current.toLowerCase();
      for (const pattern of weakPatterns) {
        if (secretLower.includes(pattern)) {
          throw new Error('JWT_SECRET contains weak patterns. Use a cryptographically secure random string.');
        }
      }
    }
  }

  /**
   * Generate a new secure JWT secret
   */
  static generateSecret(length: number = 64): string {
    return crypto.randomBytes(length).toString('base64');
  }

  /**
   * Sign a JWT token
   */
  sign(payload: Omit<JWTPayload, 'iat' | 'exp' | 'version'>): string {
    const tokenPayload: JWTPayload = {
      ...payload,
      version: this.secrets.version,
    };

    const options: jwt.SignOptions = {
      expiresIn: config.JWT_EXPIRES_IN as any, // Valid values like "7d", "24h", etc.
      issuer: 'lancelot-platform',
      audience: 'lancelot-users',
    };

    return jwt.sign(tokenPayload, this.secrets.current, options);
  }

  /**
   * Verify a JWT token with support for secret rotation
   */
  verify(token: string): JWTPayload {
    // First, try to verify with the current secret
    try {
      const decoded = jwt.verify(token, this.secrets.current, {
        issuer: 'lancelot-platform',
        audience: 'lancelot-users',
      }) as JWTPayload;
      
      return decoded;
    } catch (currentError) {
      // If current secret fails and we have a previous secret (rotation scenario)
      if (this.secrets.previous) {
        try {
          const decoded = jwt.verify(token, this.secrets.previous, {
            issuer: 'lancelot-platform',
            audience: 'lancelot-users',
          }) as JWTPayload;
          
          // Log that we're using old secret (for monitoring)
          console.warn('JWT verified with previous secret - consider refreshing token', {
            userId: decoded.userId,
            tokenVersion: decoded.version,
            currentVersion: this.secrets.version,
          });
          
          return decoded;
        } catch (previousError) {
          // Both secrets failed
          throw new Error('Invalid or expired token');
        }
      }
      
      // No previous secret, throw original error
      throw currentError;
    }
  }

  /**
   * Sign a long-lived JWT for service-to-service auth (e.g., AI agent).
   * Uses the same secret/issuer/audience as user tokens but with a longer expiry.
   * The caller must provide a valid service user payload (seeded via seed:ai-user).
   */
  signServiceToken(
    payload: Omit<JWTPayload, 'iat' | 'exp' | 'version'>,
    expiresIn: string = '365d',
  ): string {
    const tokenPayload: JWTPayload = {
      ...payload,
      version: this.secrets.version,
    };

    const options: jwt.SignOptions = {
      expiresIn: expiresIn as any,
      issuer: 'lancelot-platform',
      audience: 'lancelot-users',
    };

    return jwt.sign(tokenPayload, this.secrets.current, options);
  }

  /**
   * Decode a JWT token without verification (for debugging)
   */
  decode(token: string): JWTPayload | null {
    try {
      return jwt.decode(token) as JWTPayload;
    } catch {
      return null;
    }
  }

  /**
   * Check if a token needs refresh due to secret rotation
   */
  needsRefresh(token: string): boolean {
    try {
      const decoded = this.decode(token);
      if (!decoded) return true;

      // Token needs refresh if it was signed with an older version
      return (decoded.version || 1) < this.secrets.version;
    } catch {
      return true;
    }
  }

  /**
   * Get information about current secret configuration (for monitoring)
   */
  getSecretInfo(): { version: number; rotationDate?: Date; hasBackupSecret: boolean } {
    return {
      version: this.secrets.version,
      rotationDate: this.secrets.rotationDate,
      hasBackupSecret: !!this.secrets.previous,
    };
  }
}

// Export singleton instance
export const jwtService = new JWTService();

// Export utility for generating new secrets
export const generateJWTSecret = JWTService.generateSecret; 