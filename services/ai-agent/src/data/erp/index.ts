/**
 * ERP Data Layer
 *
 * Read-only Mongo accessors used by the AI agent's tools to answer
 * "what does the system know" questions. Every module enforces RBAC
 * via `data/erp/rbac.ts` so the AI cannot surface anything the asking
 * user wouldn't normally see in the UI.
 */

export * as helpArticles from './help-articles';
export * as presets from './presets';
export * as equipment from './equipment';
export * as shifts from './shifts';
export * as broadcasts from './broadcasts';
export * as users from './users';
export * from './rbac';
