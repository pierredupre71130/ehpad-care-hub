'use client';

import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth-context';
import { fetchRolePermissions, type RolePermissions } from '@/lib/role-permissions';

/**
 * Returns the current user's access level for a given module.
 * - 'full'  : can read AND write
 * - 'read'  : can only view (read-only)
 * - null    : no access (or still loading)
 */
export function useModuleAccess(moduleId: string): 'full' | 'read' | null {
  const { profile } = useAuth();

  const { data: perms } = useQuery({
    queryKey: ['settings', 'role_permissions'],
    queryFn: fetchRolePermissions,
    staleTime: 30000,
  });

  if (!profile) return null;
  if (profile.role === 'admin') return 'full';
  if (!perms) return null;

  const rolePerms = (perms as RolePermissions)[profile.role];
  if (!rolePerms) return null;

  const access = rolePerms[moduleId];
  return access ?? null;
}
