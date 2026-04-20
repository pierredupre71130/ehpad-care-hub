'use client';

import { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Building2, Lock, Unlock, LogOut, GripVertical, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DashboardGrid } from '@/components/dashboard/dashboard-grid';
import { RoleSelector } from '@/components/dashboard/role-selector';
import { AdminUnlockDialog } from '@/components/dashboard/admin-unlock-dialog';
import { MODULES, ROLE_MODULES } from '@/components/dashboard/module-config';
import { useAuth } from '@/lib/auth-context';
import { createClient } from '@/lib/supabase/client';

async function fetchRole(): Promise<string> {
  const sb = createClient();
  const { data } = await sb.from('settings').select('value').eq('key', 'dashboard_role').maybeSingle();
  return (data?.value as string) ?? 'all';
}

async function saveRole(role: string): Promise<void> {
  const sb = createClient();
  await sb.from('settings').upsert(
    { key: 'dashboard_role', value: role, updated_at: new Date().toISOString() },
    { onConflict: 'key' }
  );
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Bonjour';
  if (h < 18) return 'Bon après-midi';
  return 'Bonsoir';
}

export default function DashboardPage() {
  const { profile, signOut, isAuthenticated, isLoading } = useAuth();
  const router = useRouter();

  const [currentRole, setCurrentRole] = useState<string>('all');
  const [isAdminMode, setIsAdminMode] = useState(false);
  const [showAdminDialog, setShowAdminDialog] = useState(false);

  // Protection connexion
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace('/login');
    }
  }, [isAuthenticated, isLoading, router]);

  // Chargement rôle depuis Supabase
  const { data: savedRole } = useQuery({ queryKey: ['settings', 'dashboard_role'], queryFn: fetchRole });
  useEffect(() => { if (savedRole) setCurrentRole(savedRole); }, [savedRole]);

  const handleRoleChange = (role: string) => {
    setCurrentRole(role);
    saveRole(role);
  };

  const visibleModules = useMemo(() => {
    if (currentRole === 'all' || isAdminMode) return MODULES;
    const allowed = ROLE_MODULES[currentRole];
    if (!allowed) return MODULES;
    return MODULES.filter((m) => allowed.includes(m.id));
  }, [currentRole, isAdminMode]);

  if (isLoading || !isAuthenticated) {
    return <div className="min-h-screen flex items-center justify-center text-slate-500">Chargement...</div>;
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header élégant */}
      <header className="bg-white border-b border-slate-200 shadow-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-9 h-9 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-inner">
              <Building2 className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-slate-800 tracking-tight">EHPAD Care Hub</h1>
              <p className="text-xs text-slate-500 -mt-0.5">Maison de retraite • Soins personnalisés</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <RoleSelector currentRole={currentRole} onRoleChange={handleRoleChange} />

            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowAdminDialog(true)}
              className={isAdminMode ? "bg-amber-100 text-amber-700 hover:bg-amber-200" : ""}
            >
              {isAdminMode ? <Unlock className="h-4 w-4 mr-2" /> : <Lock className="h-4 w-4 mr-2" />}
              Admin
            </Button>

            <Button variant="ghost" size="icon" onClick={signOut} className="text-slate-500 hover:text-red-600">
              <LogOut className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </header>

      {/* Contenu principal */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-8">
          <h2 className="text-3xl font-semibold text-slate-800">
            {getGreeting()}, {profile?.display_name || 'Soignant'}
          </h2>
          <p className="text-slate-600 mt-1">
            {visibleModules.length} module{visibleModules.length > 1 ? 's' : ''} à votre disposition
          </p>
        </div>

        <DashboardGrid modules={visibleModules} isAdminMode={isAdminMode} />

        {isAdminMode && (
          <div className="mt-8 flex items-center gap-2 text-amber-600 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 text-sm">
            <GripVertical className="h-4 w-4" />
            Mode administrateur activé — vous pouvez déplacer les modules
          </div>
        )}
      </main>

      <AdminUnlockDialog
        open={showAdminDialog}
        onOpenChange={setShowAdminDialog}
        onUnlock={() => setIsAdminMode(true)}
      />
    </div>
  );
}