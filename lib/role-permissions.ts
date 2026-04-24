import { createClient } from '@/lib/supabase/client';
import { ROLE_MODULES, MODULES } from '@/components/dashboard/module-config';

export type ModuleAccess = 'full' | 'read';
// New format: role → { moduleId → 'full'|'read' }
export type RolePermissions = Record<string, Record<string, ModuleAccess>>;

export const CONFIGURABLE_ROLES: {
  value: string;
  label: string;
  shortLabel: string;
  color: string;
}[] = [
  { value: 'cadre',          label: 'Cadre de santé',    shortLabel: 'Cadre',  color: '#3b72d8' },
  { value: 'aide-soignante', label: 'Aide-soignant(e)',  shortLabel: 'AS',     color: '#0f7e8e' },
  { value: 'as',             label: 'ASH',               shortLabel: 'ASH',    color: '#2e8b40' },
  { value: 'ide',            label: 'IDE',               shortLabel: 'IDE',    color: '#d84040' },
  { value: 'psychologue',    label: 'Psychologue',       shortLabel: 'Psy',    color: '#d63052' },
  { value: 'dieteticienne',  label: 'Diététicienne',     shortLabel: 'Diét.',  color: '#d48010' },
  { value: 'secretaire',     label: 'Secrétaire',        shortLabel: 'Secr.',  color: '#7c3aed' },
  { value: 'medecin',        label: 'Médecin',           shortLabel: 'Méd.',   color: '#0369a1' },
];

export function getDefaultPermissions(): RolePermissions {
  const defaults: RolePermissions = {};
  for (const { value } of CONFIGURABLE_ROLES) {
    const allowed = ROLE_MODULES[value];
    const ids = (allowed === null || allowed === undefined)
      ? MODULES.map(m => m.id)
      : allowed;
    defaults[value] = {};
    for (const id of ids) {
      defaults[value][id] = 'full';
    }
  }
  return defaults;
}

/** Migrate old string[] format or unknown data to new RolePermissions format */
function migrateToNewFormat(raw: unknown): RolePermissions {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return getDefaultPermissions();
  const result: RolePermissions = {};
  for (const [role, value] of Object.entries(raw as Record<string, unknown>)) {
    if (Array.isArray(value)) {
      // Old format: string[] → all modules get 'full' access
      result[role] = {};
      for (const moduleId of value as string[]) {
        result[role][moduleId] = 'full';
      }
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      // New format already
      result[role] = value as Record<string, ModuleAccess>;
    } else {
      result[role] = {};
    }
  }
  return result;
}

export async function fetchRolePermissions(): Promise<RolePermissions> {
  const sb = createClient();
  const { data } = await sb
    .from('settings')
    .select('value')
    .eq('key', 'role_permissions')
    .maybeSingle();

  if (data?.value) {
    const migrated = migrateToNewFormat(data.value);
    // Merge with defaults so newly added modules appear for all roles
    const defaults = getDefaultPermissions();
    const merged: RolePermissions = {};
    for (const { value } of CONFIGURABLE_ROLES) {
      merged[value] = migrated[value] ?? defaults[value];
    }
    return merged;
  }
  return getDefaultPermissions();
}

export async function saveRolePermissions(perms: RolePermissions): Promise<void> {
  const sb = createClient();
  await sb.from('settings').upsert(
    { key: 'role_permissions', value: perms, updated_at: new Date().toISOString() },
    { onConflict: 'key' }
  );
}

/** Whether a role has ANY access (full or read) to a module */
export function hasModuleAccess(perms: RolePermissions, role: string, moduleId: string): boolean {
  return !!perms[role]?.[moduleId];
}

/** Whether a role has read-only access to a module */
export function isModuleReadOnly(perms: RolePermissions, role: string, moduleId: string): boolean {
  return perms[role]?.[moduleId] === 'read';
}
