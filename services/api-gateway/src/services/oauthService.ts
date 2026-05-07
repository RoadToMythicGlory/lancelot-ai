import { Request, Response, Router } from 'express';
import crypto from 'crypto';
import { ObjectId } from 'mongodb';
import { connectMongoDB } from '../config/mongodb';
import { Organization } from '../models/organization.models';
import { Subscription } from '../models/billing.models';
import { jwtService } from './jwtService';
import { config } from '../config';
import { createLogger } from '../utils/logger';

const logger = createLogger('oauth-service');

// ==================== CONFIG ====================

const oauthConfig = {
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    userInfoUrl: 'https://www.googleapis.com/oauth2/v2/userinfo',
    scopes: ['openid', 'email', 'profile'],
  },
  twitch: {
    clientId: process.env.TWITCH_CLIENT_ID || '',
    clientSecret: process.env.TWITCH_CLIENT_SECRET || '',
    authUrl: 'https://id.twitch.tv/oauth2/authorize',
    tokenUrl: 'https://id.twitch.tv/oauth2/token',
    userInfoUrl: 'https://api.twitch.tv/helix/users',
    scopes: ['user:read:email'],
  },
  discord: {
    clientId: process.env.DISCORD_CLIENT_ID || '',
    clientSecret: process.env.DISCORD_CLIENT_SECRET || '',
    authUrl: 'https://discord.com/api/oauth2/authorize',
    tokenUrl: 'https://discord.com/api/oauth2/token',
    userInfoUrl: 'https://discord.com/api/users/@me',
    scopes: ['identify', 'email'],
  },
};

const CALLBACK_BASE = process.env.OAUTH_CALLBACK_BASE_URL || 'http://localhost:4000';
const STREAMER_APP_URL = process.env.STREAMER_APP_URL || 'http://localhost:3100';

// ==================== HELPERS ====================

async function findOrCreateOAuthUser(provider: string, profile: { email: string; name: string; avatarUrl?: string; oauthId: string }) {
  const db = await connectMongoDB();

  // Try find existing user by email or oauthId
  let user = await db.collection('users').findOne({
    $or: [
      { email: profile.email },
      { [`oauth.${provider}.id`]: profile.oauthId },
    ],
  });

  if (user) {
    // Update OAuth info
    await db.collection('users').updateOne(
      { _id: user._id },
      {
        $set: {
          [`oauth.${provider}`]: { id: profile.oauthId, email: profile.email },
          avatarUrl: profile.avatarUrl || user.avatarUrl,
          lastLogin: new Date(),
        },
      }
    );
    return { ...user, id: user._id.toString() };
  }

  // Create new user + organization
  const nameParts = profile.name.split(' ');
  const newUser: any = {
    email: profile.email,
    firstName: nameParts[0] || profile.name,
    lastName: nameParts.slice(1).join(' ') || '',
    displayName: profile.name,
    avatarUrl: profile.avatarUrl,
    systemRole: 'DEPARTMENT_USER',
    accountType: 'streamer',
    authProvider: provider,
    oauth: { [provider]: { id: profile.oauthId, email: profile.email } },
    departments: [],
    isActive: true,
    lastLogin: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const result = await db.collection('users').insertOne(newUser);
  const userId = result.insertedId.toString();

  // Auto-provision org
  const org = await Organization.create({
    name: `${profile.name}'s Workspace`,
    slug: `s-${userId.substring(0, 8)}`,
    plan: 'free',
    isActive: true,
    isTrial: true,
    trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    settings: {
      timezone: 'UTC', locale: 'en', dateFormat: 'MM/DD/YYYY',
      features: { chat: true, aiAgent: true, warehouse: false, vizrt: false, shifts: false, mcr: false, broadcasting: true, liveMonitoring: false },
      security: { mfaRequired: false, ssoEnabled: false, passwordMinLength: 8, sessionTimeoutMinutes: 1440, ipWhitelist: [] },
    },
    createdBy: userId,
  });

  await db.collection('users').updateOne({ _id: result.insertedId }, { $set: { organizationId: org._id } });

  await Subscription.create({
    organizationId: org._id, plan: 'free', status: 'trialing', billingCycle: 'monthly',
    currentPeriodStart: new Date(), currentPeriodEnd: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    trialStart: new Date(), trialEnd: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    limits: { maxUsers: 1, maxBroadcastEvents: 10, maxStorageGB: 1, maxDepartments: 1, maxApiCalls: 500 },
    currentUsage: { users: 1, broadcastEvents: 0, storageUsedGB: 0, departments: 0, apiCalls: 0 },
  });

  logger.info(`New streamer created via ${provider}: ${profile.email}`);
  return { ...newUser, id: userId, _id: result.insertedId };
}

function issueJWT(user: any) {
  return jwtService.sign({
    userId: user.id || user._id.toString(),
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    displayName: user.displayName,
    role: 'user',
    systemRole: user.systemRole || 'DEPARTMENT_USER',
    accountType: 'streamer',
    departments: user.departments || [],
  });
}

// ==================== ROUTES ====================

export const oauthRouter = Router();

// ---- Google ----
oauthRouter.get('/google', (req: Request, res: Response) => {
  const { clientId, authUrl, scopes } = oauthConfig.google;
  if (!clientId) return res.status(500).json({ error: 'Google OAuth not configured' });
  const state = crypto.randomBytes(16).toString('hex');
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${CALLBACK_BASE}/auth/google/callback`,
    response_type: 'code',
    scope: scopes.join(' '),
    state,
    access_type: 'offline',
    prompt: 'consent',
  });
  res.redirect(`${authUrl}?${params}`);
});

oauthRouter.get('/google/callback', async (req: Request, res: Response) => {
  try {
    const { code } = req.query;
    if (!code) return res.redirect(`${STREAMER_APP_URL}/login?error=no_code`);

    const { clientId, clientSecret, tokenUrl, userInfoUrl } = oauthConfig.google;
    // Exchange code for token
    const tokenRes = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: code as string,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: `${CALLBACK_BASE}/auth/google/callback`,
        grant_type: 'authorization_code',
      }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) return res.redirect(`${STREAMER_APP_URL}/login?error=token_failed`);

    // Get user info
    const userRes = await fetch(userInfoUrl, { headers: { Authorization: `Bearer ${tokenData.access_token}` } });
    const profile = await userRes.json();

    const user = await findOrCreateOAuthUser('google', {
      email: profile.email,
      name: profile.name,
      avatarUrl: profile.picture,
      oauthId: profile.id,
    });

    const token = issueJWT(user);
    res.redirect(`${STREAMER_APP_URL}/auth/callback?token=${token}`);
  } catch (error) {
    logger.error('Google OAuth callback error', { error });
    res.redirect(`${STREAMER_APP_URL}/login?error=oauth_failed`);
  }
});

// ---- Twitch ----
oauthRouter.get('/twitch', (req: Request, res: Response) => {
  const { clientId, authUrl, scopes } = oauthConfig.twitch;
  if (!clientId) return res.status(500).json({ error: 'Twitch OAuth not configured' });
  const state = crypto.randomBytes(16).toString('hex');
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${CALLBACK_BASE}/auth/twitch/callback`,
    response_type: 'code',
    scope: scopes.join(' '),
    state,
  });
  res.redirect(`${authUrl}?${params}`);
});

oauthRouter.get('/twitch/callback', async (req: Request, res: Response) => {
  try {
    const { code } = req.query;
    if (!code) return res.redirect(`${STREAMER_APP_URL}/login?error=no_code`);

    const { clientId, clientSecret, tokenUrl, userInfoUrl } = oauthConfig.twitch;
    const tokenRes = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: code as string,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: `${CALLBACK_BASE}/auth/twitch/callback`,
        grant_type: 'authorization_code',
      }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) return res.redirect(`${STREAMER_APP_URL}/login?error=token_failed`);

    const userRes = await fetch(userInfoUrl, {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        'Client-Id': clientId,
      },
    });
    const userData = await userRes.json();
    const profile = userData.data?.[0];
    if (!profile) return res.redirect(`${STREAMER_APP_URL}/login?error=no_profile`);

    const user = await findOrCreateOAuthUser('twitch', {
      email: profile.email,
      name: profile.display_name,
      avatarUrl: profile.profile_image_url,
      oauthId: profile.id,
    });

    const token = issueJWT(user);
    res.redirect(`${STREAMER_APP_URL}/auth/callback?token=${token}`);
  } catch (error) {
    logger.error('Twitch OAuth callback error', { error });
    res.redirect(`${STREAMER_APP_URL}/login?error=oauth_failed`);
  }
});

// ---- Discord ----
oauthRouter.get('/discord', (req: Request, res: Response) => {
  const { clientId, authUrl, scopes } = oauthConfig.discord;
  if (!clientId) return res.status(500).json({ error: 'Discord OAuth not configured' });
  const state = crypto.randomBytes(16).toString('hex');
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${CALLBACK_BASE}/auth/discord/callback`,
    response_type: 'code',
    scope: scopes.join(' '),
    state,
  });
  res.redirect(`${authUrl}?${params}`);
});

oauthRouter.get('/discord/callback', async (req: Request, res: Response) => {
  try {
    const { code } = req.query;
    if (!code) return res.redirect(`${STREAMER_APP_URL}/login?error=no_code`);

    const { clientId, clientSecret, tokenUrl, userInfoUrl } = oauthConfig.discord;
    const tokenRes = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: code as string,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: `${CALLBACK_BASE}/auth/discord/callback`,
        grant_type: 'authorization_code',
      }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) return res.redirect(`${STREAMER_APP_URL}/login?error=token_failed`);

    const userRes = await fetch(userInfoUrl, { headers: { Authorization: `Bearer ${tokenData.access_token}` } });
    const profile = await userRes.json();

    const avatarUrl = profile.avatar
      ? `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.png`
      : undefined;

    const user = await findOrCreateOAuthUser('discord', {
      email: profile.email,
      name: profile.global_name || profile.username,
      avatarUrl,
      oauthId: profile.id,
    });

    const token = issueJWT(user);
    res.redirect(`${STREAMER_APP_URL}/auth/callback?token=${token}`);
  } catch (error) {
    logger.error('Discord OAuth callback error', { error });
    res.redirect(`${STREAMER_APP_URL}/login?error=oauth_failed`);
  }
});
