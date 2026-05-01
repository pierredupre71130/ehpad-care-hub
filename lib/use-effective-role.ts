'use client';

import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth-context';
import { createClient } from '@/lib/supabase/client';

/**
 * Returns the role to use for permission checks.
 * For real non-admins: their actual profile role.
 * For admins: the simulated role selected on the dashboard (dashboard_role setting),
 *             falling back to 'admin' if no simulation is active.
 */
export function useEffectiveRole(): string | null {
  const { profile } = useAuth();
  const isRealAdmin = profile?.role === 'admin';

  const { data: simulatedRole } = useQuery<string>({
    queryKey: ['settings', 'dashboard_role'],
    queryFn: async () => {
      const sb = createClient();
      const { data } = await sb.from('settings').select('value').eq('key', 'dashboard_role').maybeSingle();
      return (data?.value as string) ?? 'all';
    },
    enabled: isRealAdmin,
    staleTime: 0,
  });

  if (!profile) return null;
  if (!isRealAdmin) return profile.role;
  // Admin simulating a role: 'all' means no simulation → stay as admin
  if (!simulatedRole || simulatedRole === 'all') return 'admin';
  return simulatedRole;
}
