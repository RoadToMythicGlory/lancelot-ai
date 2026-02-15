/**
 * RSS Pipeline Schemas (Zod)
 *
 * Validation schemas for ArticleCandidate, RankedArticle, and Brief.
 */

import { z } from 'zod';

// ─── ArticleCandidate ────────────────────────────────────────────────────────

export const ArticleCandidateSchema = z.object({
  id: z.string().min(1),
  url: z.string().url(),
  source: z.string().min(1),
  sourceName: z.string().min(1),
  title: z.string().min(1),
  summary: z.string(),
  publishedAt: z.string().datetime(),
  publishedAtEstimated: z.boolean(),
  fetchedAt: z.string().datetime(),
  lang: z.enum(['he', 'en']),
  rawCategories: z.array(z.string()).optional(),
  contentLevel: z.literal('rss_only'),
  excerptHash: z.string().min(1),
  titleHash: z.string().min(1),
  urlHash: z.string().min(1),
  expiresAt: z.string().datetime(),
});

export type ArticleCandidateZod = z.infer<typeof ArticleCandidateSchema>;

// ─── BriefQuality ────────────────────────────────────────────────────────────

export const BriefQualitySchema = z.enum(['llm', 'rss_only']);

// ─── BriefCitation ───────────────────────────────────────────────────────────

export const BriefCitationSchema = z.object({
  source: z.string().min(1),
  url: z.string().url(),
  publishedAt: z.string().datetime(),
});

// ─── Brief ───────────────────────────────────────────────────────────────────

export const BriefSchema = z.object({
  articleId: z.string().min(1),
  briefText: z.string().min(1),
  bullets: z.array(z.string()),
  whyItMatters: z.string().min(1),
  briefQuality: BriefQualitySchema,
  citation: BriefCitationSchema,
});

export type BriefZod = z.infer<typeof BriefSchema>;

// ─── RankedArticle ───────────────────────────────────────────────────────────

export const RankedArticleSchema = z.object({
  articleId: z.string().min(1),
  category: z.string().min(1),
  score: z.number(),
  reasons: z.array(z.string()),
  reject: z.boolean(),
});

export type RankedArticleZod = z.infer<typeof RankedArticleSchema>;

// ─── LLM Brief Output (for parsing LLM JSON response) ───────────────────────

export const LLMBriefOutputSchema = z.object({
  briefText: z.string().min(1),
  bullets: z.array(z.string()).min(1).max(5),
  whyItMatters: z.string().min(1),
});

export type LLMBriefOutput = z.infer<typeof LLMBriefOutputSchema>;

export default {
  ArticleCandidateSchema,
  BriefSchema,
  BriefQualitySchema,
  BriefCitationSchema,
  RankedArticleSchema,
  LLMBriefOutputSchema,
};
