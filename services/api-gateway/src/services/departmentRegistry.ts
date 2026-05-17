import { Department } from '../models/department.models';
import { Permission, isValidPermission, setDepartmentRoleRegistry, LEGACY_PERMISSION_MAP } from '../rbac';
import { connectMongoose } from '../config/mongodb';

let mongooseConnected = false;
async function ensureMongoConnection() {
  if (!mongooseConnected) {
    await connectMongoose();
    mongooseConnected = true;
  }
}

/**
 * Reload the department role permission registry from the Department
 * collection. Call once on server boot, and again after any mutation that
 * changes a department's roles or permissions.
 */
export async function reloadDepartmentRoleRegistry(): Promise<void> {
  try {
    await ensureMongoConnection();
    const docs: any[] = await Department.find({ isActive: { $ne: false } }).lean();
    const entries: Array<{
      departmentCode: string;
      roleKey: string;
      roleName?: string;
      permissions: Permission[];
    }> = [];
    for (const doc of docs) {
      const code: string = doc.code || (doc._id ? String(doc._id) : '');
      if (!code) continue;
      // Department-wide permission grants (rare, but supported).
      if (Array.isArray(doc.permissions) && doc.permissions.length) {
        const perms = normalizePermissions(doc.permissions);
        if (perms.length) {
          entries.push({ departmentCode: code, roleKey: '__departmentDefault__', permissions: perms });
        }
      }
      const rawRoles = Array.isArray(doc.roles) ? doc.roles : [];
      for (const r of rawRoles) {
        if (!r || typeof r !== 'object') continue;
        if (r.isActive === false) continue;
        const key = r.key ? String(r.key) : (r.name ? String(r.name) : '');
        if (!key) continue;
        const perms = normalizePermissions(Array.isArray(r.permissions) ? r.permissions : []);
        entries.push({
          departmentCode: code,
          roleKey: key,
          roleName: r.name ? String(r.name) : undefined,
          permissions: perms,
        });
      }
    }
    setDepartmentRoleRegistry(entries);
  } catch (error) {
    // Don't crash bootstrap if the registry can't load — the legacy
    // hardcoded fallback in matrix.ts is still active.
    console.error('Failed to reload department role registry:', error);
  }
}

function normalizePermissions(input: any[]): Permission[] {
  const out: Permission[] = [];
  for (const raw of input) {
    if (typeof raw !== 'string') continue;
    if (isValidPermission(raw)) {
      out.push(raw as Permission);
    } else if (LEGACY_PERMISSION_MAP[raw]) {
      out.push(LEGACY_PERMISSION_MAP[raw]);
    }
  }
  return out;
}
