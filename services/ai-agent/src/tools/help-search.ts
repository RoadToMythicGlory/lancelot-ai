/**
 * help-search Tool
 *
 * Answers "how do I..." / "what is..." questions by:
 *  1. Embedding the user's question
 *  2. Retrieving the top-K matching help-article chunks from the vector store
 *  3. Asking the LLM to compose a SHORT Hebrew answer constrained to the
 *     retrieved snippets (anti-hallucination)
 *
 * If the vector store has no good match, returns a friendly refusal —
 * never invents an answer.
 */

import { z } from 'zod';
import { getVectorStore } from '../data/vector-store';
import { embed as embedText } from '../llm/embeddings';
import { getLLMProvider } from '../llm';
import { findArticleBySlug } from '../data/erp/help-articles';
import { createLogger } from '../utils/logger';
import type { ToolHandler } from '../agent/orchestrator';

const logger = createLogger('tool-help-search');

const MIN_SCORE = 0.18;       // anything below is treated as "no relevant article"
const TOP_K = 4;
const MAX_CONTEXT_CHARS = 2400;

export const helpSearchInputSchema = z.object({
  message: z.string().min(1),
  entities: z.record(z.string()).optional(),
});

interface HelpHit {
  slug: string;
  title: string;
  category: string;
  score: number;
  content: string;
}

const NO_ANSWER_HE =
  'לא מצאתי תשובה למה ששאלת בתיעוד. אם תרצה, פתח פנייה דרך מרכז העזרה ואדאג שמישהו יחזור אליך.';

export const helpSearchTool: ToolHandler = async (input, context) => {
  const message = String(input.message || context.message || '').trim();
  if (!message) {
    return { success: false, text: NO_ANSWER_HE, error: 'empty message' };
  }

  // Embed the question and search vectors filtered to the 'help' source
  const embedResult = await embedText(message);
  if (!embedResult.embedding || embedResult.embedding.length === 0) {
    logger.warn('help-search: empty query embedding');
    return { success: true, text: NO_ANSWER_HE };
  }

  const store = getVectorStore();
  const hits = store.searchBySource(embedResult.embedding, 'help', TOP_K);
  const relevantHits = hits.filter((h) => h.score >= MIN_SCORE);

  if (relevantHits.length === 0) {
    logger.info('help-search: no hits above threshold', {
      topScore: hits[0]?.score ?? 0,
    });
    return {
      success: true,
      data: { hits: [] },
      text: NO_ANSWER_HE,
    };
  }

  // Resolve hits → full article snippets
  const enrichedHits: HelpHit[] = [];
  for (const h of relevantHits) {
    const slug = String(h.document.metadata?.slug || '');
    const title = String(h.document.metadata?.title || h.document.metadata?.slug || '');
    const category = String(h.document.metadata?.category || '');
    let content = h.document.content;
    if (slug) {
      const article = await findArticleBySlug(slug);
      if (article) {
        content = article.contentHe || article.content;
      }
    }
    enrichedHits.push({
      slug,
      title,
      category,
      score: h.score,
      content: content.slice(0, MAX_CONTEXT_CHARS),
    });
  }

  // Build a tightly-constrained context block
  const contextBlock = enrichedHits
    .map((h, i) => `--- מקור ${i + 1}: ${h.title} ---\n${h.content}`)
    .join('\n\n');

  const prompt = [
    'ענה בעברית בקצרה (2-4 משפטים) על השאלה הבאה, על סמך המקורות בלבד.',
    'אם המקורות לא מכילים תשובה — כתוב במפורש "אין מספיק מידע בתיעוד" ואל תמציא.',
    'בסוף התשובה, ציין את שמות המקורות שהשתמשת בהם.',
    '',
    `שאלה: ${message}`,
    '',
    'מקורות:',
    contextBlock,
  ].join('\n');

  try {
    const provider = getLLMProvider();
    const response = await provider.generate(prompt, {
      systemPrompt:
        'אתה עוזר תיעוד למערכת לנסלוט. ענה בקצרה, על סמך המקורות בלבד, ובעברית כשנשאלת בעברית.',
      temperature: 0.2,
      maxTokens: 400,
    });

    const text = response.text?.trim() || '';
    if (text.length === 0) {
      return { success: true, data: { hits: enrichedHits }, text: NO_ANSWER_HE };
    }

    // Append a citations footer with article titles
    const citationsLine = enrichedHits
      .slice(0, 3)
      .map((h) => `• ${h.title}`)
      .join('\n');
    const finalText = `${text}\n\nמקורות:\n${citationsLine}`;

    return {
      success: true,
      data: { hits: enrichedHits },
      text: finalText,
    };
  } catch (error) {
    logger.warn('help-search: LLM generation failed', {
      error: (error as Error).message,
    });
    // Fall back to extractive snippet from the top hit
    const topHit = enrichedHits[0];
    return {
      success: true,
      data: { hits: enrichedHits },
      text: `${topHit.content.slice(0, 500)}\n\nמקור: ${topHit.title}`,
    };
  }
};

export default helpSearchTool;
