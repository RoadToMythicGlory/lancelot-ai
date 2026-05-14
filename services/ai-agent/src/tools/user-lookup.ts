/**
 * user-lookup Tool
 *
 * Directory queries with strict field allowlist:
 *   - "מי המפיק של X"
 *   - "אנשי הקשר של מחלקת MCR"
 *   - "מספר טלפון של דנה"
 *
 * Returns email/phone ONLY when caller has USERS_MANAGE_DEPT/ALL or is admin.
 * Permission: USERS_VIEW (or higher).
 */

import { z } from 'zod';
import {
  canReadUsers,
  searchUsers,
  type DirectoryUser,
} from '../data/erp/users';
import type { ToolHandler } from '../agent/orchestrator';

export const userLookupInputSchema = z.object({
  message: z.string().min(1),
  entities: z.record(z.string()).optional(),
});

export const userLookupTool: ToolHandler = async (input, context) => {
  const message = String(input.message || context.message || '').trim();

  const gate = canReadUsers(context.user);
  if (!gate.allowed) {
    return { success: true, text: gate.refusal!, data: { users: [] } };
  }

  const query = extractQueryToken(message);
  if (!query) {
    return {
      success: true,
      data: { users: [] },
      text: 'את מי תרצה לחפש? ציין שם, תפקיד או מחלקה.',
    };
  }

  const users = await searchUsers(context.user, query, 8);
  if (users.length === 0) {
    return {
      success: true,
      data: { users: [] },
      text: `לא נמצא משתמש פעיל שתואם "${query}".`,
    };
  }

  return {
    success: true,
    data: { users },
    text: formatUsers(users, query),
  };
};

function extractQueryToken(message: string): string {
  return message
    .replace(
      /^(מי\s+(?:ה?(?:מפיק|במאי|צלם|סאונדמן|מנהל|אחראי))\s+(?:של|את)?\s*)/i,
      '',
    )
    .replace(
      /^(אנשי\s+הקשר\s+של|הפרטים\s+של|מספר\s+הטלפון\s+של|מייל\s+של|אימייל\s+של|איך\s+ליצור\s+קשר\s+עם)\s*/i,
      '',
    )
    .replace(
      /^(who\s+(?:produces|directs|manages|is\s+responsible\s+for)|contact\s+for|email\s+for|phone\s+for|team\s+for)\s*/i,
      '',
    )
    .replace(/[?!.]+$/, '')
    .trim();
}

function formatUsers(users: DirectoryUser[], query: string): string {
  const lines = [`👥 נמצאו ${users.length} משתמשים עבור "${query}":`];
  for (const u of users) {
    const dept = u.departmentName || u.departmentId || '';
    const role = u.systemRole || '';
    const contact = [u.email, u.phone].filter(Boolean).join(' · ');
    const tail = [dept, role, contact].filter(Boolean).join(' | ');
    lines.push(`• ${u.displayName}${tail ? ` — ${tail}` : ''}`);
  }
  return lines.join('\n');
}

export default userLookupTool;
