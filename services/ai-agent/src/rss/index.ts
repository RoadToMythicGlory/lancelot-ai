/**
 * RSS Pipeline Module Index
 *
 * Barrel exports for the RSS ingestion pipeline.
 */

export * from './rss-types';
export * from './rss-config';
export * from './rss-dedup';
export * from './rss-client';
export * from './rss-ranking';
export * from './rss-selection';
export * from './rss-brief-generator';
export * from './rss-pipeline';

export { default as rssConfig } from './rss-config';
export { default as rssDedup } from './rss-dedup';
export { default as rssClient } from './rss-client';
export { default as rssRanking } from './rss-ranking';
export { default as rssSelection } from './rss-selection';
export { default as rssBriefGenerator } from './rss-brief-generator';
export { default as rssPipeline } from './rss-pipeline';
