/**
 * RSS Brief Generator
 *
 * LLM-powered abstractive summary with explicit quality tracking.
 * Falls back to rss_only when LLM is unavailable or output is malformed.
 */

import { getLLMProvider } from '../llm';
import { BRIEF_GENERATOR_PROMPT } from '../llm/prompt-templates';
import { createLogger } from '../utils/logger';
import { extractJSON } from '../utils/validation';
import { LLMBriefOutputSchema } from '../schemas/rss-schemas';
import { ArticleCandidate, Brief, BriefQuality } from './rss-types';

const logger = createLogger('rss-brief-generator');

/**
 * Generate a broadcast-ready brief for a single article.
 *
 * When LLM is available: produces an abstractive summary with briefQuality='llm'.
 * When LLM is unavailable or output is malformed: falls back to RSS excerpt
 * with briefQuality='rss_only'. Never presents RSS snippet as LLM-generated.
 */
export async function generateBrief(article: ArticleCandidate): Promise<Brief> {
  const citation = {
    source: article.sourceName,
    url: article.url,
    publishedAt: article.publishedAt,
  };

  try {
    const provider = getLLMProvider();
    const isAvailable = await provider.isAvailable();

    if (!isAvailable) {
      logger.debug('LLM unavailable, returning rss_only brief', { articleId: article.id });
      return buildRssOnlyBrief(article, citation);
    }

    // Build prompt with article context
    const prompt = `Article title: ${article.title}\n\nArticle excerpt:\n${article.summary}\n\nSource: ${article.sourceName}`;

    const result = await provider.generate(prompt, {
      systemPrompt: BRIEF_GENERATOR_PROMPT,
      temperature: 0.4,
      maxTokens: 512,
    });

    // LLM JSON safety: extract JSON then validate with Zod
    const jsonStr = extractJSON(result.text);
    let parsed: any;
    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      logger.warn('LLM brief output is not valid JSON, falling back to rss_only', {
        articleId: article.id,
        raw: result.text.substring(0, 200),
      });
      return buildRssOnlyBrief(article, citation);
    }

    const validation = LLMBriefOutputSchema.safeParse(parsed);
    if (!validation.success) {
      logger.warn('LLM brief output failed Zod validation, falling back to rss_only', {
        articleId: article.id,
        errors: validation.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`),
      });
      return buildRssOnlyBrief(article, citation);
    }

    return {
      articleId: article.id,
      briefText: validation.data.briefText,
      bullets: validation.data.bullets,
      whyItMatters: validation.data.whyItMatters,
      briefQuality: 'llm',
      citation,
    };
  } catch (error) {
    logger.error('Brief generation failed, falling back to rss_only', {
      articleId: article.id,
      error: (error as Error).message,
    });
    return buildRssOnlyBrief(article, citation);
  }
}

/**
 * Generate briefs for multiple articles with sequential processing.
 * Placeholder articles (isPlaceholder) must NOT be passed here.
 */
export async function generateBriefs(
  articles: ArticleCandidate[],
): Promise<Brief[]> {
  const briefs: Brief[] = [];

  for (const article of articles) {
    const brief = await generateBrief(article);
    briefs.push(brief);
  }

  const llmCount = briefs.filter((b) => b.briefQuality === 'llm').length;
  const rssCount = briefs.filter((b) => b.briefQuality === 'rss_only').length;

  logger.info('Briefs generated', {
    total: briefs.length,
    llm: llmCount,
    rssOnly: rssCount,
  });

  return briefs;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildRssOnlyBrief(
  article: ArticleCandidate,
  citation: Brief['citation'],
): Brief {
  return {
    articleId: article.id,
    briefText: article.summary || article.title,
    bullets: [],
    whyItMatters: '[LLM unavailable - RSS excerpt only]',
    briefQuality: 'rss_only',
    citation,
  };
}

export default {
  generateBrief,
  generateBriefs,
};
