import { createClient } from '@/lib/supabase/client';
import { CONFIGURABLE_ROLES } from '@/lib/role-permissions';

export type ModuleSize = 'large' | 'small';
export type RoleModuleSizes = Record<string, Record<string, ModuleSize>>;

export function getDefaultModuleSizes(): RoleModuleSizes {
  const out: RoleModuleSizes = {};
  for (const { value } of CONFIGURABLE_ROLES) out[value] = {};
  return out;
}

export async function fetchRoleModuleSizes(): Promise<RoleModuleSizes> {
  const sb = createClient();
  const { data } = await sb
    .from('settings')
    .select('value')
    .eq('key', 'role_module_sizes')
    .maybeSingle();

  const defaults = getDefaultModuleSizes();
  if (!data?.value || typeof data.value !== 'object') return defaults;

  const merged: RoleModuleSizes = {};
  for (const { value: role } of CONFIGURABLE_ROLES) {
    const fromDb = (data.value as Record<string, unknown>)[role];
    merged[role] = (fromDb && typeof fromDb === 'object' && !Array.isArray(fromDb))
      ? (fromDb as Record<string, ModuleSize>)
      : {};
  }
  return merged;
}

export async function saveRoleModuleSizes(sizes: RoleModuleSizes): Promise<void> {
  const sb = createClient();
  await sb.from('settings').upsert(
    { key: 'role_module_sizes', value: sizes, updated_at: new Date().toISOString() },
    { onConflict: 'key' }
  );
}

export function getModuleSize(
  sizes: RoleModuleSizes,
  role: string,
  moduleId: string
): ModuleSize {
  return sizes[role]?.[moduleId] ?? 'large';
}
