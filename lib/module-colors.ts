import { createClient } from '@/lib/supabase/client';

export type ColorOverrides = Record<string, { from: string; to: string }>;

export async function fetchColorOverrides(): Promise<ColorOverrides> {
  const sb = createClient();
  const { data } = await sb.from('settings').select('value').eq('key', 'module_colors').maybeSingle();
  return (data?.value as ColorOverrides) ?? {};
}

export async function saveColorOverride(
  moduleId: string,
  from: string,
  to: string,
  current: ColorOverrides,
): Promise<void> {
  const sb = createClient();
  const next = { ...current, [moduleId]: { from, to } };
  await sb.from('settings').upsert(
    { key: 'module_colors', value: next, updated_at: new Date().toISOString() },
    { onConflict: 'key' }
  );
}

/** Darkens a hex color by pct% (0-100) */
export function darkenHex(hex: string, pct = 22): string {
  const c = hex.replace('#', '');
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  const f = 1 - pct / 100;
  return '#' + [r, g, b].map(v => Math.round(v * f).toString(16).padStart(2, '0')).join('');
}
