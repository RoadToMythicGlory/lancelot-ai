import { useMemo } from 'react';
import { useQuery } from '@apollo/client';
import { GET_EQUIPMENT_CATEGORIES_CATALOG } from '../graphql/queries';

// Shape returned by the `equipmentCategories` GraphQL query. Kept narrow so
// hook consumers only depend on the canonical fields.
export interface EquipmentCategoryOption {
  id: string;
  slug: string;
  labelHe: string;
  sortOrder: number;
  isActive: boolean;
}

export interface UseEquipmentCategoriesResult {
  /** All categories returned from the catalog (sorted by sortOrder, labelHe). */
  categories: EquipmentCategoryOption[];
  /** Only the active subset — what a "create equipment" picker should show. */
  activeCategories: EquipmentCategoryOption[];
  /** Map from slug → option, for O(1) lookup. */
  bySlug: Record<string, EquipmentCategoryOption>;
  /**
   * Resolve a category slug to its Hebrew label. Falls back to the slug
   * itself when the category is unknown (e.g. a row stored before the
   * catalog was migrated). Always returns a string, never `undefined`,
   * so callers can render the result directly.
   */
  labelOf: (slug: string | null | undefined) => string;
  loading: boolean;
  error: unknown;
  refetch: () => Promise<unknown>;
}

interface UseEquipmentCategoriesOptions {
  /**
   * When true, soft-disabled categories are included in the result. The admin
   * Categories management UI needs this so disabled rows still appear in the
   * table; everywhere else should leave it false (the default).
   */
  includeInactive?: boolean;
}

/**
 * Hook that exposes the canonical equipment-category catalog to the UI.
 *
 * The catalog is the single deterministic source of truth — backed by the
 * `equipment_categories` Mongo collection and the `equipmentCategories`
 * GraphQL query. Use this hook anywhere the app needs to:
 *
 *   • Render a category dropdown (registration / edit / sets / filters).
 *   • Translate a stored `category` slug into a Hebrew label.
 *   • Decide whether a slug is still valid / active.
 *
 * The query runs with `cache-first` and is keyed on `includeInactive`, so
 * multiple consumers across the page share a single network roundtrip.
 */
export function useEquipmentCategories(
  options: UseEquipmentCategoriesOptions = {},
): UseEquipmentCategoriesResult {
  const { includeInactive = false } = options;

  const { data, loading, error, refetch } = useQuery(
    GET_EQUIPMENT_CATEGORIES_CATALOG,
    {
      variables: { includeInactive },
      fetchPolicy: 'cache-first',
    },
  );

  const categories: EquipmentCategoryOption[] = useMemo(() => {
    const raw = (data?.equipmentCategories ?? []) as EquipmentCategoryOption[];
    return [...raw].sort((a, b) => {
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      return a.labelHe.localeCompare(b.labelHe, 'he');
    });
  }, [data?.equipmentCategories]);

  const activeCategories = useMemo(
    () => categories.filter((c) => c.isActive),
    [categories],
  );

  const bySlug = useMemo(() => {
    const map: Record<string, EquipmentCategoryOption> = {};
    for (const c of categories) {
      map[c.slug] = c;
    }
    return map;
  }, [categories]);

  const labelOf = useMemo(
    () => (slug: string | null | undefined): string => {
      if (!slug) return '';
      return bySlug[slug]?.labelHe || slug;
    },
    [bySlug],
  );

  return {
    categories,
    activeCategories,
    bySlug,
    labelOf,
    loading,
    error,
    refetch: () => refetch(),
  };
}
