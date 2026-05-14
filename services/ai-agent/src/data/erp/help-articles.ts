/**
 * Help Articles ERP Data Module
 *
 * Read-only access to the `helparticles` Mongo collection that backs the
 * web app's help center (apps/web/src/app/help/page.tsx).
 *
 * Help articles are public (anyone with CHAT_USE can read them), so this
 * module does NOT enforce per-document RBAC. The vector indexer uses
 * `listPublishedArticles` to embed the corpus on boot / refresh.
 */

import { connectMongoDB } from '../mongodb-adapter';
import { config } from '../../config';
import { createLogger } from '../../utils/logger';

const logger = createLogger('erp-help');

export interface HelpArticleDoc {
  id: string;
  title: string;
  titleHe?: string;
  slug: string;
  content: string;
  contentHe?: string;
  excerpt?: string;
  excerptHe?: string;
  category: string;
  tags: string[];
  isPublished: boolean;
}

/**
 * Mongoose's default collection name for the `HelpArticle` model is
 * lowercased + pluralized → `helparticles`. Configurable via env if the
 * deployment uses a custom name.
 */
function getCollectionName(): string {
  return process.env.AI_HELP_COLLECTION_NAME || 'helparticles';
}

/**
 * Load all published help articles for indexing.
 */
export async function listPublishedArticles(): Promise<HelpArticleDoc[]> {
  try {
    const db = await connectMongoDB();
    const docs = await db
      .collection(getCollectionName())
      .find({ isPublished: true })
      .project({
        title: 1,
        titleHe: 1,
        slug: 1,
        content: 1,
        contentHe: 1,
        excerpt: 1,
        excerptHe: 1,
        category: 1,
        tags: 1,
        isPublished: 1,
      })
      .toArray();

    return docs.map(normalize);
  } catch (error) {
    logger.warn('Failed to list help articles', {
      error: (error as Error).message,
      collection: getCollectionName(),
    });
    return [];
  }
}

/**
 * Look up a single article by slug (used by the help-search tool to
 * resolve a vector hit back to its full document).
 */
export async function findArticleBySlug(slug: string): Promise<HelpArticleDoc | null> {
  try {
    const db = await connectMongoDB();
    const doc = await db
      .collection(getCollectionName())
      .findOne({ slug, isPublished: true });
    return doc ? normalize(doc) : null;
  } catch (error) {
    logger.warn('Failed to find help article by slug', {
      slug,
      error: (error as Error).message,
    });
    return null;
  }
}

function normalize(doc: any): HelpArticleDoc {
  return {
    id: doc._id?.toString() || doc.id || '',
    title: String(doc.title || ''),
    titleHe: doc.titleHe ? String(doc.titleHe) : undefined,
    slug: String(doc.slug || ''),
    content: String(doc.content || ''),
    contentHe: doc.contentHe ? String(doc.contentHe) : undefined,
    excerpt: doc.excerpt ? String(doc.excerpt) : undefined,
    excerptHe: doc.excerptHe ? String(doc.excerptHe) : undefined,
    category: String(doc.category || 'getting_started'),
    tags: Array.isArray(doc.tags) ? doc.tags.filter((t: unknown): t is string => typeof t === 'string') : [],
    isPublished: !!doc.isPublished,
  };
}

export default {
  listPublishedArticles,
  findArticleBySlug,
};
