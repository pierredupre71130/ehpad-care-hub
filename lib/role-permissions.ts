import { createClient } from '@/lib/supabase/client';
import { ROLE_MODULES, MODULES } from '@/components/dashboard/module-config';

export type RolePermissions = Record<string, string[]>;

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
];

export function getDefaultPermissions(): RolePermissions {
  const defaults: RolePermissions = {};
  for (const { value } of CONFIGURABLE_ROLES) {
    const allowed = ROLE_MODULES[value];
    defaults[value] =
      allowed === null || allowed === undefined
        ? MODULES.map(m => m.id)
        : [...allowed];
  }
  return defaults;
}

export async function fetchRolePermissions(): Promise<RolePermissions> {
  const sb = createClient();
  const { data } = await sb
    .from('settings')
    .select('value')
    .eq('key', 'role_permissions')
    .maybeSingle();

  if (data?.value && typeof data.value === 'object' && !Array.isArray(data.value)) {
    // Merge with defaults so newly added modules appear
    const stored = data.value as RolePermissions;
    const defaults = getDefaultPermissions();
    const merged: RolePermissions = {};
    for (const { value } of CONFIGURABLE_ROLES) {
      merged[value] = stored[value] ?? defaults[value];
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
