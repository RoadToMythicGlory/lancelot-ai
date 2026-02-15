/**
 * Schema Index
 * 
 * Export all JSON schemas for the AI agent.
 */

export * from './chat-response';
export * from './lineup-rundown';
export * from './cg-spec';
export * from './shift-schedule';
export * from './news-brief';
export * from './rights-board';
export * from './rss-schemas';

// Re-export default schemas
export { default as ChatAgentResponseSchema } from './chat-response';
export { default as LineupRundownSchema } from './lineup-rundown';
export { default as CGSpecSchema } from './cg-spec';
export { default as ShiftScheduleSchema } from './shift-schedule';
export { default as NewsBriefSchema } from './news-brief';
export { default as RightsBoardSchema } from './rights-board';
