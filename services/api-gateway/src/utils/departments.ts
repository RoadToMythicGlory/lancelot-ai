export interface ExpandMCRDepartmentsOptions {
  includeBaseMCR?: boolean;
}

export function expandMCRDepartments(
  deptIds: string[],
  options: ExpandMCRDepartmentsOptions = {}
): string[] {
  const expanded = new Set<string>();
  const includeBaseMCR = options.includeBaseMCR === true;

  for (const deptId of deptIds) {
    if (!deptId) continue;
    expanded.add(deptId);

    if (deptId === 'MCR' || deptId.startsWith('MCR')) {
      if (includeBaseMCR) {
        expanded.add('MCR');
      }
      expanded.add('Playout');
      expanded.add('Ingest');
      expanded.add('MCR-Playout');
      expanded.add('MCR-Ingest');
      expanded.add('MCR-General');
    }
  }

  return Array.from(expanded);
}

export default {
  expandMCRDepartments,
};
