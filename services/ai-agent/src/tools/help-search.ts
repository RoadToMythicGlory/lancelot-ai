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

// Raised from 0.18 → 0.32 after we observed weak (~0.20) cosine hits being
// fed to the LLM, which then fabricated answers (including drifting to
// Chinese) from unrelated articles like "Getting Started" or "Billing".
const MIN_SCORE = 0.32;       // anything below is treated as "no relevant article"
const TOP_K = 4;
const MAX_CONTEXT_CHARS = 2400;
// Sources the help-search tool draws from. `help` = Mongo helparticles
// collection; `knowledge_file` = curated markdown loaded by the indexer
// from AI_KNOWLEDGE_DIR (e.g. docs/user-manual/).
const HELP_SOURCES = ['help', 'knowledge_file'];

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

/**
 * Detect characters from scripts we never want in a Hebrew-context reply:
 *   - CJK ideographs (Chinese/Japanese/Korean)
 *   - Hiragana / Katakana
 *   - Hangul
 *   - Cyrillic
 *   - Arabic
 *
 * If the LLM produced any of these despite the Hebrew-only instruction we
 * treat the answer as untrusted (language-drift) and fall back to an
 * extractive snippet from the top source.
 */
function containsForbiddenScript(text: string): boolean {
  return /[\u3000-\u303F\u3040-\u309F\u30A0-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uAC00-\uD7AF\u0400-\u04FF\u0600-\u06FF]/.test(
    text,
  );
}

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
  const hits = store.searchBySources(embedResult.embedding, HELP_SOURCES, TOP_K);
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

  // Resolve hits → full article snippets. For `help` source we look up the
  // full Mongo document by slug; for `knowledge_file` source we use the
  // already-embedded content as-is (it came from the local .md file).
  const enrichedHits: HelpHit[] = [];
  for (const h of relevantHits) {
    const slug = String(h.document.metadata?.slug || '');
    const title = String(h.document.metadata?.title || h.document.metadata?.slug || '');
    const category = String(h.document.metadata?.category || '');
    const docSource = String(h.document.metadata?.source || '');
    let content = h.document.content;
    if (slug && docSource === 'help') {
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
    'ענה אך ורק בעברית. אסור להשתמש בסינית, יפנית, קוריאנית, רוסית או כל שפה אחרת — גם לא בתו בודד.',
    'ענה בקצרה (2-5 משפטים או רשימת תבליטים קצרה) על השאלה הבאה, על סמך המקורות בלבד.',
    'אם המקורות לא מכילים תשובה ברורה לשאלה הספציפית — כתוב בדיוק: "אין מספיק מידע בתיעוד על זה. אפשר לפתוח פנייה דרך מרכז העזרה." ואל תמציא צעדים, שמות מסכים, או כפתורים שלא מופיעים במקור.',
    'אם המקורות עוסקים בנושא קרוב אבל לא מדויק — אמור זאת במפורש, אל תנסה "להשלים".',
    '',
    `שאלה: ${message}`,
    '',
    'מקורות (ענה רק לפי מה שכתוב כאן):',
    contextBlock,
  ].join('\n');

  try {
    const provider = getLLMProvider();
    const response = await provider.generate(prompt, {
      systemPrompt:
        'אתה עוזר תיעוד למערכת לנסלוט. ענה אך ורק בעברית, על סמך המקורות בלבד. אסור להשתמש בסינית, יפנית, קוריאנית, או כל שפה אחרת מלבד עברית. אסור להמציא תוכן שלא מופיע במקורות.',
      temperature: 0.2,
      maxTokens: 400,
    });

    const text = response.text?.trim() || '';
    if (text.length === 0) {
      return { success: true, data: { hits: enrichedHits }, text: NO_ANSWER_HE };
    }

    // Safety net: if the model leaked CJK / Cyrillic / Arabic despite the
    // Hebrew-only system prompt, fall back to an extractive snippet from
    // the top source rather than serving a wrong-language answer.
    if (containsForbiddenScript(text)) {
      logger.warn('help-search: LLM produced forbidden script, falling back to extractive', {
        topScore: enrichedHits[0]?.score,
      });
      const topHit = enrichedHits[0];
      const snippet = topHit.content.slice(0, 500);
      return {
        success: true,
        data: { hits: enrichedHits },
        text: `${snippet}\n\nמקור: ${topHit.title}`,
      };
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
