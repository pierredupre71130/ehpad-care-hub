import { createClient } from '@/lib/supabase/client';

export type ModuleSizeConfig = Record<string, 'large' | 'small'>;

export async function fetchModuleSizes(role: string): Promise<ModuleSizeConfig> {
  const sb = createClient();
  const { data } = await sb
    .from('settings')
    .select('value')
    .eq('key', `module_sizes_${role}`)
    .maybeSingle();
  return (data?.value as ModuleSizeConfig) ?? {};
}

export async function saveModuleSizes(role: string, config: ModuleSizeConfig): Promise<void> {
  const sb = createClient();
  await sb.from('settings').upsert(
    { key: `module_sizes_${role}`, value: config, updated_at: new Date().toISOString() },
    { onConflict: 'key' }
  );
}
