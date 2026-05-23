import mongoose from 'mongoose';
import { connectMongoose } from '../config/mongodb';
import { requirePermission } from '../middleware/auth';
import { Permission } from '../rbac';
import { EquipmentCategory, IEquipmentCategory } from '../models/equipmentCategory.models';
import { Equipment } from '../models/equipment.models';

let mongooseConnected = false;

async function ensureMongoConnection() {
  if (!mongooseConnected) {
    await connectMongoose();
    mongooseConnected = true;
  }
}

function mapCategory(doc: IEquipmentCategory | any) {
  if (!doc) return null;
  return {
    id: doc._id.toString(),
    slug: doc.slug,
    labelHe: doc.labelHe,
    sortOrder: doc.sortOrder ?? 1000,
    isActive: doc.isActive !== false,
    createdAt: doc.createdAt ? new Date(doc.createdAt).toISOString() : null,
    updatedAt: doc.updatedAt ? new Date(doc.updatedAt).toISOString() : null,
  };
}

// Slug normalization. We accept loosely-formatted user input (uppercase,
// hyphens, leading/trailing whitespace) and coerce it to the canonical
// lowercase_snake_case shape the schema validator expects.
function normalizeSlug(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw.trim().toLowerCase().replace(/[-\s]+/g, '_');
}

export const equipmentCategoryResolvers = {
  Query: {
    equipmentCategories: async (
      _: any,
      { includeInactive }: { includeInactive?: boolean | null },
      context: any,
    ) => {
      requirePermission(context, Permission.WAREHOUSE_VIEW);
      await ensureMongoConnection();

      const query: any = {};
      if (!includeInactive) {
        query.isActive = true;
      }

      const docs = await EquipmentCategory.find(query)
        .sort({ sortOrder: 1, labelHe: 1 })
        .exec();

      return docs.map(mapCategory);
    },
  },

  Mutation: {
    createEquipmentCategory: async (
      _: any,
      { input }: { input: { slug: string; labelHe: string; sortOrder?: number | null; isActive?: boolean | null } },
      context: any,
    ) => {
      requirePermission(context, Permission.WAREHOUSE_MANAGE);
      await ensureMongoConnection();

      const slug = normalizeSlug(input.slug);
      if (!slug || !/^[a-z][a-z0-9_]*$/.test(slug)) {
        throw new Error('Invalid category slug. Use lowercase letters, digits, and underscores only.');
      }
      const labelHe = input.labelHe?.trim();
      if (!labelHe) {
        throw new Error('labelHe is required');
      }

      const existing = await EquipmentCategory.findOne({ slug }).exec();
      if (existing) {
        throw new Error(`Category slug already exists: ${slug}`);
      }

      const created = await EquipmentCategory.create({
        slug,
        labelHe,
        sortOrder: input.sortOrder ?? 1000,
        isActive: input.isActive !== false,
      });

      return mapCategory(created);
    },

    updateEquipmentCategory: async (
      _: any,
      {
        id,
        input,
      }: {
        id: string;
        input: { slug?: string | null; labelHe?: string | null; sortOrder?: number | null; isActive?: boolean | null };
      },
      context: any,
    ) => {
      requirePermission(context, Permission.WAREHOUSE_MANAGE);
      await ensureMongoConnection();

      if (!mongoose.Types.ObjectId.isValid(id)) {
        throw new Error('Invalid category ID');
      }
      const doc = await EquipmentCategory.findById(id).exec();
      if (!doc) {
        throw new Error('Category not found');
      }

      // Slug changes are only allowed when no equipment currently uses
      // the existing slug — otherwise a rename would orphan inventory.
      // Admins should disable + add-new instead.
      if (input.slug !== undefined && input.slug !== null) {
        const nextSlug = normalizeSlug(input.slug);
        if (!nextSlug || !/^[a-z][a-z0-9_]*$/.test(nextSlug)) {
          throw new Error('Invalid category slug. Use lowercase letters, digits, and underscores only.');
        }
        if (nextSlug !== doc.slug) {
          const inUse = await Equipment.exists({ category: doc.slug });
          if (inUse) {
            throw new Error(
              `Cannot rename slug "${doc.slug}" — it is still used by existing equipment. Create a new category and disable this one instead.`,
            );
          }
          const dup = await EquipmentCategory.findOne({ slug: nextSlug, _id: { $ne: doc._id } }).exec();
          if (dup) {
            throw new Error(`Category slug already exists: ${nextSlug}`);
          }
          doc.slug = nextSlug;
        }
      }

      if (input.labelHe !== undefined && input.labelHe !== null) {
        const next = input.labelHe.trim();
        if (!next) {
          throw new Error('labelHe cannot be empty');
        }
        doc.labelHe = next;
      }

      if (input.sortOrder !== undefined && input.sortOrder !== null) {
        doc.sortOrder = input.sortOrder;
      }

      if (input.isActive !== undefined && input.isActive !== null) {
        doc.isActive = !!input.isActive;
      }

      const saved = await doc.save();
      return mapCategory(saved);
    },

    deleteEquipmentCategory: async (
      _: any,
      { id }: { id: string },
      context: any,
    ) => {
      requirePermission(context, Permission.WAREHOUSE_MANAGE);
      await ensureMongoConnection();

      if (!mongoose.Types.ObjectId.isValid(id)) {
        throw new Error('Invalid category ID');
      }
      const doc = await EquipmentCategory.findById(id).exec();
      if (!doc) {
        throw new Error('Category not found');
      }

      // Hard-delete is only permitted when zero equipment references the
      // slug. Otherwise the only safe operation is `isActive: false`.
      const inUse = await Equipment.exists({ category: doc.slug });
      if (inUse) {
        throw new Error(
          `Cannot delete category "${doc.labelHe}" — it is still used by existing equipment. Disable it instead.`,
        );
      }

      await doc.deleteOne();
      return true;
    },
  },
};
