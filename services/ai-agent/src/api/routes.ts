/**
 * API Routes
 * 
 * Express routes for the AI agent service.
 */

import { Router, Request, Response } from 'express';
import { handleChatMessage, handleStatus } from './chat-handler';
import { authPassthrough, requireAuth, AuthenticatedRequest } from './middleware';
import { withErrorRecovery } from '../middleware/error-recovery';
import { getToolByIntent } from '../tools/registry';
import { reindexAll } from '../data/indexer';
import { createLogger } from '../utils/logger';

const logger = createLogger('routes');
const router = Router();

// Agent status (no auth required for now)
router.get('/status', handleStatus);

// Chat endpoint (requires auth)
router.post('/chat', authPassthrough, requireAuth, handleChatMessage);

// Lineup builder
router.post('/lineup', authPassthrough, requireAuth, withErrorRecovery(async (req: Request, res: Response) => {
  const tool = getToolByIntent('lineup');
  if (!tool) {
    res.status(503).json({ error: 'Lineup builder tool not registered' });
    return;
  }
  const userId = (req as AuthenticatedRequest).user?.userId || 'anonymous';
  const result = await tool.handler(
    { message: req.body.message || '', entities: req.body.entities || {} },
    { conversationId: `lineup-${Date.now()}`, userId, message: req.body.message || '' }
  );
  res.json(result);
}));

// CG spec generator
router.post('/cg/spec', authPassthrough, requireAuth, withErrorRecovery(async (req: Request, res: Response) => {
  const tool = getToolByIntent('cg');
  if (!tool) {
    res.status(503).json({ error: 'CG spec generator tool not registered' });
    return;
  }
  const userId = (req as AuthenticatedRequest).user?.userId || 'anonymous';
  const result = await tool.handler(
    { message: req.body.message || req.body.context || '', entities: req.body.entities || {} },
    { conversationId: `cg-${Date.now()}`, userId, message: req.body.message || req.body.context || '' }
  );
  res.json(result);
}));

// Shift solver
router.post('/shifts/solve', authPassthrough, requireAuth, withErrorRecovery(async (req: Request, res: Response) => {
  const tool = getToolByIntent('shifts');
  if (!tool) {
    res.status(503).json({ error: 'Shift solver tool not registered' });
    return;
  }
  const userId = (req as AuthenticatedRequest).user?.userId || 'anonymous';
  const result = await tool.handler(
    { message: req.body.message || '', entities: req.body.entities || {} },
    { conversationId: `shifts-${Date.now()}`, userId, message: req.body.message || '' }
  );
  res.json(result);
}));

// News brief
router.get('/news/brief', authPassthrough, requireAuth, withErrorRecovery(async (req: Request, res: Response) => {
  const tool = getToolByIntent('news');
  if (!tool) {
    res.status(503).json({ error: 'News fetcher tool not registered' });
    return;
  }
  const userId = (req as AuthenticatedRequest).user?.userId || 'anonymous';
  const result = await tool.handler(
    { message: 'Fetch latest news', entities: {} },
    { conversationId: `news-${Date.now()}`, userId, message: 'Fetch latest news' }
  );
  res.json(result);
}));

// Rights board
router.get('/rights/board', authPassthrough, requireAuth, withErrorRecovery(async (req: Request, res: Response) => {
  const tool = getToolByIntent('rights');
  if (!tool) {
    res.status(503).json({ error: 'Rights board tool not registered' });
    return;
  }
  const userId = (req as AuthenticatedRequest).user?.userId || 'anonymous';
  const result = await tool.handler(
    { message: (req.query.q as string) || 'Show rights board', entities: {} },
    { conversationId: `rights-${Date.now()}`, userId, message: (req.query.q as string) || 'Show rights board' }
  );
  res.json(result);
}));

/**
 * Admin: trigger an immediate re-index of help articles + presets.
 *
 * The api-gateway resolver `reindexAIKnowledge` already gates this on
 * `SETTINGS_MANAGE`. We additionally check for the permission here as
 * defense-in-depth in case the AI agent is exposed directly.
 */
router.post('/admin/reindex', authPassthrough, requireAuth, withErrorRecovery(async (req: Request, res: Response) => {
  const authedReq = req as AuthenticatedRequest;
  const permissions = authedReq.user?.permissions || [];
  const isAdmin =
    authedReq.user?.systemRole === 'SYSTEM_ADMIN' ||
    authedReq.user?.systemRole === 'IT_ADMIN' ||
    permissions.includes('SETTINGS_MANAGE');

  if (!isAdmin) {
    res.status(403).json({
      error: 'Forbidden',
      message: 'SETTINGS_MANAGE permission required for AI knowledge reindex',
    });
    return;
  }

  logger.info('Admin reindex requested', {
    userId: authedReq.user?.userId,
    traceId: authedReq.traceId,
  });

  try {
    const stats = await reindexAll();
    res.json({
      success: true,
      documentsIndexed: stats.totalIndexed,
      message: `Indexed ${stats.totalIndexed} documents (${stats.helpArticles} help articles, ${stats.presets} presets, ${stats.knowledgeFiles} knowledge files) in ${stats.durationMs}ms`,
      stats,
    });
  } catch (error) {
    logger.error('Reindex failed', {
      error: (error as Error).message,
      traceId: authedReq.traceId,
    });
    res.status(500).json({
      success: false,
      error: 'Reindex failed',
      message: (error as Error).message,
    });
  }
}));

export default router;
