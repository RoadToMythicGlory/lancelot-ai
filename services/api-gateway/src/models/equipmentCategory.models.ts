import mongoose, { Schema, Document } from 'mongoose';

// EquipmentCategory — the single, deterministic source of truth for all
// equipment categories across Lancelot.
//
// Historically, categories lived as a hardcoded `EQUIPMENT_CATEGORIES` map
// in `equipment.models.ts` (41 keys + Hebrew labels) AND in 6 stale local
// copies on the web app. This collection replaces both:
//
//   • Backend writes (`createEquipment`, `updateEquipment`) validate
//     `Equipment.category` by looking up the slug here (instead of the
//     legacy enum derived from the constant).
//   • Frontend dropdowns load this collection over GraphQL and use it
//     for both option lists and slug→Hebrew label resolution.
//
// Categories are seeded on startup from the legacy `EQUIPMENT_CATEGORIES`
// map plus any distinct slugs found on existing equipment, so an upgrade
// never orphans a row. Admins (WAREHOUSE_MANAGE) can add/rename/disable
// categories from the Warehouse > Categories tab. Slugs are immutable
// once any equipment references them; categories cannot be hard-deleted
// while equipment uses them — admins must disable them instead.
export interface IEquipmentCategory extends Document {
  _id: mongoose.Types.ObjectId;
  // Canonical machine identifier. Lowercase snake_case. Used as the value
  // stored on `Equipment.category`.
  slug: string;
  // Hebrew display label shown in dropdowns, tags, filters, reports, etc.
  labelHe: string;
  // Manual sort order for dropdowns. Lower comes first; ties broken by labelHe.
  sortOrder: number;
  // Soft-disable. Inactive categories are hidden from "new equipment" pickers
  // but remain readable for existing equipment that already uses them.
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const equipmentCategorySchema = new Schema<IEquipmentCategory>(
  {
    slug: {
      type: String,
      required: true,
      unique: true,
      index: true,
      lowercase: true,
      trim: true,
      // Defensive validator: enforce snake_case at the model layer so a
      // bad write never gets persisted, even if the resolver normalization
      // is bypassed.
      match: /^[a-z][a-z0-9_]*$/,
    },
    labelHe: {
      type: String,
      required: true,
      trim: true,
    },
    sortOrder: {
      type: Number,
      required: true,
      default: 1000,
    },
    isActive: {
      type: Boolean,
      required: true,
      default: true,
    },
  },
  {
    timestamps: true,
    collection: 'equipment_categories',
  },
);

equipmentCategorySchema.index({ isActive: 1, sortOrder: 1, labelHe: 1 });

export const EquipmentCategory = mongoose.model<IEquipmentCategory>(
  'EquipmentCategory',
  equipmentCategorySchema,
);
