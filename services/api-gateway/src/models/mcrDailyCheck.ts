import { Schema, model, Document, Types } from 'mongoose';

/**
 * MCR daily check items.
 *
 * Two collections: a reusable template list (`MCRDailyCheckTemplate`) that
 * defines which checks belong to the active checklist, and per-date entries
 * (`MCRDailyCheckEntry`) that record which checks have been completed on a
 * given day, by whom, and when.
 */

export interface IMCRDailyCheckTemplate extends Document {
  name: string;
  description?: string;
  order: number;
  isActive: boolean;
  isDefault: boolean;
  createdBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const dailyCheckTemplateSchema = new Schema<IMCRDailyCheckTemplate>({
  name: { type: String, required: true, trim: true },
  description: { type: String, trim: true },
  order: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true },
  isDefault: { type: Boolean, default: false },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

dailyCheckTemplateSchema.index({ isActive: 1, order: 1 });
dailyCheckTemplateSchema.index({ isDefault: 1 });

export const MCRDailyCheckTemplate = model<IMCRDailyCheckTemplate>(
  'MCRDailyCheckTemplate',
  dailyCheckTemplateSchema,
);

export interface IMCRDailyCheckEntry extends Document {
  date: Date;
  templateId: Types.ObjectId;
  isCompleted: boolean;
  completedBy?: Types.ObjectId;
  completedAt?: Date;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const dailyCheckEntrySchema = new Schema<IMCRDailyCheckEntry>({
  date: { type: Date, required: true },
  templateId: {
    type: Schema.Types.ObjectId,
    ref: 'MCRDailyCheckTemplate',
    required: true,
  },
  isCompleted: { type: Boolean, default: false },
  completedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  completedAt: { type: Date },
  notes: { type: String },
}, { timestamps: true });

dailyCheckEntrySchema.index({ date: 1, templateId: 1 }, { unique: true });
dailyCheckEntrySchema.index({ date: 1, isCompleted: 1 });

export const MCRDailyCheckEntry = model<IMCRDailyCheckEntry>(
  'MCRDailyCheckEntry',
  dailyCheckEntrySchema,
);

/**
 * Default checklist seeded for organizations that have not customized the
 * MCR daily checks. The set is intentionally broad — operators can disable
 * any items that do not apply to their workflow.
 */
export const DEFAULT_MCR_DAILY_CHECKS: Array<{ name: string; description?: string }> = [
  { name: 'בדיקת שרשרת שידור', description: 'ודא שכל שרשרת השידור מקצה לקצה תקינה' },
  { name: 'אימות יציאת שידור ראשית', description: 'אימות תקינות אות היציאה הראשית' },
  { name: 'אימות יציאת שידור גיבוי', description: 'אימות תקינות אות הגיבוי' },
  { name: 'בדיקת תקינות אות וידאו', description: 'בדיקת תקינות אות הווידאו' },
  { name: 'אימות ערוצי שמע', description: 'בדיקת תקינות ערוצי השמע' },
  { name: 'בדיקת מערכות זיהוי שקט וקפיאה' },
  { name: 'סנכרון זמן', description: 'בדיקת סנכרון השעון' },
  { name: 'סטטוס מערכת אוטומציה' },
  { name: 'אימות פלייליסט ולו"ז' },
  { name: 'בדיקת חיבורי ראוטר (Crosspoints)' },
  { name: 'בדיקת קליטות לוויניות ותרומה' },
  { name: 'בדיקת סטטוס מקודדים ומפענחים' },
  { name: 'בדיקת מערכת גרפיקה / CG' },
  { name: 'בדיקת מתג חירום' },
  { name: 'בדיקת מערכת הקלטה' },
  { name: 'אימות פריסות מולטי-ויואר' },
  { name: 'בדיקת חיבור רשת' },
  { name: 'בדיקת מערכות התראה וניטור' },
  { name: 'בדיקת אינטרקום ותקשורת פנים' },
  { name: 'סקירת יומן תפעולי (Logbook)' },
  { name: 'בדיקת זמינות מדיה לפלייאאוט' },
  { name: 'בדיקת מערכות גיבוי וחילוף' },
  { name: 'ניטור Loudness ועמידה ברגולציה' },
  { name: 'אימות מערכות ניטור חיצוניות' },
  { name: 'מוכנות לשליטה ידנית' },
];

/**
 * Ensure the database has at least the default templates seeded.
 * Safe to call repeatedly — only inserts items that do not already exist.
 */
export async function ensureDefaultDailyChecks(): Promise<void> {
  const count = await MCRDailyCheckTemplate.countDocuments({ isDefault: true });
  if (count >= DEFAULT_MCR_DAILY_CHECKS.length) return;

  const existingNames = new Set(
    (await MCRDailyCheckTemplate.find({ isDefault: true }, { name: 1 }).lean())
      .map((d: any) => d.name),
  );

  const missing = DEFAULT_MCR_DAILY_CHECKS.filter((c) => !existingNames.has(c.name));
  if (missing.length === 0) return;

  await MCRDailyCheckTemplate.insertMany(
    missing.map((c, idx) => ({
      name: c.name,
      description: c.description,
      order: existingNames.size + idx,
      isActive: true,
      isDefault: true,
    })),
  );
}
