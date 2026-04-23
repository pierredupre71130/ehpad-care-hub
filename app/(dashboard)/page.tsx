'use client';

import { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { LogOut, Settings, Stethoscope, Users, GripVertical, ChevronDown, ClipboardList, ShieldCheck, X, Lock, ScrollText, Database, Clock, FileCheck, Scale } from 'lucide-react';
import { DashboardGrid } from '@/components/dashboard/dashboard-grid';
import { AdminUnlockDialog } from '@/components/dashboard/admin-unlock-dialog';
import { MODULES, BOTTOM_NAV_IDS } from '@/components/dashboard/module-config';
import { useAuth } from '@/lib/auth-context';
import { createClient } from '@/lib/supabase/client';
import { fetchRolePermissions } from '@/lib/role-permissions';
import Link from 'next/link';
import { cn } from '@/lib/utils';

// ── Supabase helpers ──────────────────────────────────────────────────────────

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

// ── Helpers ───────────────────────────────────────────────────────────────────

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Bonjour';
  if (h < 18) return 'Bon après-midi';
  return 'Bonsoir';
}

// ── Fond réseau (SVG) ─────────────────────────────────────────────────────────

// Nœuds pré-calculés (coordonnées dans un espace 1500×860)
const NODES: [number, number][] = [
  [60,80],[180,30],[320,110],[480,55],[630,130],[790,40],[940,105],[1100,25],[1260,90],[1420,50],
  [100,220],[250,175],[410,240],[570,195],[720,260],[880,185],[1030,245],[1190,170],[1350,230],[1470,195],
  [40,380],[200,340],[360,410],[530,360],[680,420],[840,355],[1000,395],[1160,330],[1320,400],[1460,360],
  [120,540],[280,500],[440,565],[600,510],[760,570],[920,505],[1080,555],[1240,490],[1390,545],[1490,510],
  [60,700],[220,660],[380,720],[550,670],[700,730],[860,665],[1020,715],[1180,650],[1340,700],[1470,670],
  [150,820],[350,790],[560,840],[780,800],[1000,845],[1220,805],[1420,835],
];

// Connexions : nœuds à moins de 220px
const EDGES: [number, number][] = (() => {
  const edges: [number, number][] = [];
  for (let i = 0; i < NODES.length; i++) {
    for (let j = i + 1; j < NODES.length; j++) {
      const dx = NODES[i][0] - NODES[j][0];
      const dy = NODES[i][1] - NODES[j][1];
      if (dx * dx + dy * dy < 220 * 220) edges.push([i, j]);
    }
  }
  return edges;
})();

function NetworkBackground() {
  return (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none"
      viewBox="0 0 1500 860"
      preserveAspectRatio="xMidYMid slice"
      xmlns="http://www.w3.org/2000/svg"
    >
      {EDGES.map(([i, j], idx) => (
        <line
          key={idx}
          x1={NODES[i][0]} y1={NODES[i][1]}
          x2={NODES[j][0]} y2={NODES[j][1]}
          stroke="#8aabcc" strokeWidth="0.7" strokeOpacity="0.35"
        />
      ))}
      {NODES.map(([x, y], idx) => (
        <circle key={idx} cx={x} cy={y} r="3.5" fill="#8aabcc" fillOpacity="0.5" />
      ))}
    </svg>
  );
}

// ── Caducée SVG ───────────────────────────────────────────────────────────────

function CaduceusIcon() {
  return (
    <svg width="38" height="38" viewBox="0 0 38 38" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Cercle de fond */}
      <circle cx="19" cy="19" r="18" fill="white" fillOpacity="0.15" />
      {/* Bâton central */}
      <line x1="19" y1="5" x2="19" y2="33" stroke="white" strokeWidth="2" strokeLinecap="round"/>
      {/* Ailes */}
      <path d="M13 9.5 Q10 5 14 4 Q17 3 19 6 Q21 3 24 4 Q28 5 25 9.5" stroke="white" strokeWidth="1.4" fill="none" strokeLinecap="round"/>
      {/* Serpent gauche */}
      <path d="M19 10 Q13 13.5 15 17 Q17 20 19 19 Q21 18 23 21 Q25 24.5 19 28" stroke="white" strokeWidth="1.4" fill="none" strokeLinecap="round"/>
      {/* Serpent droit */}
      <path d="M19 10 Q25 13.5 23 17 Q21 20 19 19 Q17 18 15 21 Q13 24.5 19 28" stroke="white" strokeWidth="1.4" fill="none" strokeLinecap="round"/>
    </svg>
  );
}

// ── Sélecteur de rôle compact ─────────────────────────────────────────────────

const ROLES = [
  { value: 'all',            label: 'Tous les modules' },
  { value: 'cadre',          label: 'Cadre de santé' },
  { value: 'aide-soignante', label: 'Aide-soignant(e)' },
  { value: 'as',             label: 'ASH' },
  { value: 'ide',            label: 'IDE' },
  { value: 'psychologue',    label: 'Psychologue' },
  { value: 'dieteticienne',  label: 'Diététicienne' },
  { value: 'secretaire',     label: 'Secrétaire' },
  { value: 'medecin',        label: 'Médecin' },
];

function RoleDropdown({ currentRole, onChange }: { currentRole: string; onChange: (r: string) => void }) {
  const [open, setOpen] = useState(false);
  const current = ROLES.find(r => r.value === currentRole) ?? ROLES[0];

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1.5 text-white/80 hover:text-white text-sm bg-white/10 hover:bg-white/20 rounded-lg px-3 py-1.5 transition-colors"
      >
        <Users className="h-3.5 w-3.5" />
        <span className="hidden sm:inline max-w-[140px] truncate">{current.label}</span>
        <ChevronDown className="h-3.5 w-3.5 opacity-60" />
      </button>
      {open && (
        <div className="absolute top-10 right-0 z-50 bg-white border border-slate-200 rounded-xl shadow-xl py-1 w-52">
          {ROLES.map(role => (
            <button
              key={role.value}
              onClick={() => { onChange(role.value); setOpen(false); }}
              className={cn(
                'w-full text-left px-4 py-2 text-sm transition-colors',
                currentRole === role.value
                  ? 'bg-blue-50 text-blue-700 font-medium'
                  : 'text-slate-700 hover:bg-slate-50'
              )}
            >
              {role.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Page principale ───────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { profile, signOut, isAuthenticated, isLoading } = useAuth();
  const router = useRouter();

  const [currentRole, setCurrentRole] = useState<string>('all');
  const [isAdminMode, setIsAdminMode] = useState(false);
  const [showAdminDialog, setShowAdminDialog] = useState(false);
  const [showRgpdModal, setShowRgpdModal] = useState(false);

  // Redirection si non authentifié
  useEffect(() => {
    if (!isLoading && !isAuthenticated) router.replace('/login');
  }, [isAuthenticated, isLoading, router]);

  // Rôle : pour les non-admins, toujours utiliser leur rôle réel (pas le rôle global sauvegardé)
  const isAdmin = profile?.role === 'admin';
  const { data: savedRole } = useQuery({
    queryKey: ['settings', 'dashboard_role'],
    queryFn: fetchRole,
    enabled: isAdmin, // inutile de fetch pour les non-admins
  });
  useEffect(() => {
    if (isAdmin) {
      // Admin : restaure le dernier rôle simulé
      if (savedRole) setCurrentRole(savedRole);
    } else if (profile?.role) {
      // Non-admin : toujours forcer leur propre rôle
      setCurrentRole(profile.role);
    }
  }, [savedRole, isAdmin, profile?.role]);

  // Permissions dynamiques (configurées par l'admin)
  const { data: rolePermissions } = useQuery({
    queryKey: ['settings', 'role_permissions'],
    queryFn: fetchRolePermissions,
  });

  const handleRoleChange = (role: string) => {
    setCurrentRole(role);
    saveRole(role);
  };

  // Pour les non-admins : toujours filtrer par le rôle réel du profil,
  // jamais par currentRole qui peut être en retard (race condition au chargement)
  const effectiveRole = isAdmin ? currentRole : (profile?.role ?? null);

  // Modules filtrés selon permissions dynamiques (hors bottom-nav)
  const visibleModules = useMemo(() => {
    // Non-admin : attendre que PROFIL et PERMISSIONS soient tous les deux chargés
    // Si l'un manque → 0 modules (sécurité par défaut, évite le flash "tout visible")
    if (!isAdmin && (!profile?.role || !rolePermissions)) return [];
    let mods = MODULES;
    if (effectiveRole && effectiveRole !== 'all' && !isAdminMode) {
      const allowed = rolePermissions?.[effectiveRole];
      const allowedList = Array.isArray(allowed) ? allowed : [];
      mods = mods.filter(m => allowedList.includes(m.id));
    }
    // Admin / mode admin : exclure les bottom-nav de la grille (ils sont déjà dans le bandeau)
    // Non-admin : inclure les bottom-nav SI ils sont dans leurs permissions (ex: secrétaire avec seulement GIR)
    if (isAdmin || isAdminMode) {
      return mods.filter(m => !BOTTOM_NAV_IDS.includes(m.id) && m.id !== 'fichesDePoste');
    }
    return mods.filter(m => m.id !== 'fichesDePoste');
  }, [effectiveRole, isAdmin, isAdminMode, rolePermissions, profile?.role]);

  // Fiches de poste visible selon permissions
  const fichesDePosteVisible = useMemo(() => {
    if (isAdmin || isAdminMode) return true;
    if (!rolePermissions || !effectiveRole) return false; // attendre le chargement
    const allowed = rolePermissions[effectiveRole];
    const allowedList = Array.isArray(allowed) ? allowed : [];
    return allowedList.includes('fichesDePoste');
  }, [isAdmin, effectiveRole, isAdminMode, rolePermissions]);

  // Visibilité bottom nav selon permissions du rôle réel
  const realRole = profile?.role ?? 'ide';
  const residentsVisible = useMemo(() => {
    if (isAdmin) return true;
    if (!rolePermissions) return false;
    const allowed = rolePermissions[realRole];
    const allowedList = Array.isArray(allowed) ? allowed : [];
    return allowedList.includes('residents');
  }, [isAdmin, realRole, rolePermissions]);

  const girVisible = useMemo(() => {
    if (isAdmin) return true;
    if (!rolePermissions) return false;
    const allowed = rolePermissions[realRole];
    const allowedList = Array.isArray(allowed) ? allowed : [];
    return allowedList.includes('girNiveauSoin');
  }, [isAdmin, realRole, rolePermissions]);

  if (isLoading || !isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center"
        style={{ background: 'linear-gradient(135deg, #1a3560 0%, #0d7a8a 100%)' }}>
        <div className="text-white/60 text-sm">Chargement…</div>
      </div>
    );
  }

  const displayName = profile?.display_name || 'Soignant';

  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#dde4ee' }}>

      {/* ── Fond réseau ── */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <NetworkBackground />
      </div>

      {/* ── Header gradient ── */}
      <header
        className="relative z-30 w-full"
        style={{ background: 'linear-gradient(135deg, #1a3560 0%, #0e6e80 100%)' }}
      >
        <div className="max-w-7xl mx-auto px-6 py-5 flex items-center justify-between gap-4">
          {/* Logo + titre + bouton fiches de poste */}
          <div className="flex items-center gap-4">
            <CaduceusIcon />
            <div>
              <h1 className="text-2xl font-extrabold text-white tracking-tight leading-none">
                EHPAD Care Hub
              </h1>
              <p className="text-sm text-white/65 mt-0.5">
                Résidence La Fourrier
              </p>
            </div>
            {fichesDePosteVisible && (
              <Link
                href="/fiches-de-poste"
                className="ml-2 hidden sm:flex items-center gap-1.5 bg-white/10 hover:bg-white/20 text-white/85 hover:text-white text-xs font-medium px-3 py-1.5 rounded-lg border border-white/15 transition-colors"
              >
                <ClipboardList className="h-3.5 w-3.5" />
                Fiches de Poste
              </Link>
            )}
          </div>

          {/* Droite : salutation + rôle */}
          <div className="flex items-center gap-4">
            {profile?.role === 'admin' && (
              <RoleDropdown currentRole={currentRole} onChange={handleRoleChange} />
            )}
            <div className="text-right hidden sm:block">
              <p className="text-lg font-bold text-white leading-none">
                {getGreeting()}, {displayName}
              </p>
              <p className="text-sm text-white/65 mt-0.5">
                {visibleModules.length} module{visibleModules.length > 1 ? 's' : ''} à votre disposition
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* ── Contenu principal ── */}
      <main className="relative z-10 flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-8 pb-28">

        {isAdminMode && (
          <div className="flex items-center gap-2 text-amber-700 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 text-sm mb-6">
            <GripVertical className="h-4 w-4" />
            Mode administrateur activé — vous pouvez déplacer les modules
          </div>
        )}

        <DashboardGrid modules={visibleModules} isAdminMode={isAdminMode} />
      </main>

      {/* ── Barre de navigation bas ── */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-20"
        style={{ background: '#0f1f3d' }}
      >
        <div className="max-w-7xl mx-auto px-4 flex items-stretch justify-around">

          {residentsVisible && (
            <Link href="/residents" className="flex flex-col items-center gap-1 px-4 py-3 text-white/70 hover:text-white transition-colors group">
              <div className="w-8 h-8 rounded-full bg-white/10 group-hover:bg-white/20 flex items-center justify-center transition-colors">
                <Users className="h-4 w-4" />
              </div>
              <span className="text-[11px] font-medium">Résidents</span>
            </Link>
          )}

          {girVisible && (
            <Link href="/gir-niveau-soin" className="flex flex-col items-center gap-1 px-4 py-3 text-white/70 hover:text-white transition-colors group">
              <div className="w-8 h-8 rounded-full bg-white/10 group-hover:bg-white/20 flex items-center justify-center transition-colors">
                <Stethoscope className="h-4 w-4" />
              </div>
              <span className="text-[11px] font-medium">GIR & Soins</span>
            </Link>
          )}

          {isAdmin && (
            <button
              onClick={() => setShowAdminDialog(true)}
              className={cn(
                'flex flex-col items-center gap-1 px-4 py-3 transition-colors group',
                isAdminMode ? 'text-amber-400' : 'text-white/70 hover:text-white'
              )}
            >
              <div className={cn(
                'w-8 h-8 rounded-full flex items-center justify-center transition-colors',
                isAdminMode ? 'bg-amber-500/30' : 'bg-white/10 group-hover:bg-white/20'
              )}>
                <Settings className="h-4 w-4" />
              </div>
              <span className="text-[11px] font-medium">Admin</span>
            </button>
          )}

          {/* Bouton RGPD — visible par tous */}
          <button
            onClick={() => setShowRgpdModal(true)}
            className="flex flex-col items-center gap-1 px-4 py-3 text-emerald-300 hover:text-emerald-200 transition-colors group"
          >
            <div className="w-8 h-8 rounded-full bg-emerald-500/25 group-hover:bg-emerald-500/40 flex items-center justify-center transition-colors ring-1 ring-emerald-400/40">
              <ShieldCheck className="h-4 w-4" />
            </div>
            <span className="text-[10px] font-semibold text-center leading-tight">Sécurité<br/>& RGPD</span>
          </button>

          <button
            onClick={signOut}
            className="flex flex-col items-center gap-1 px-4 py-3 text-white/70 hover:text-red-400 transition-colors group"
          >
            <div className="w-8 h-8 rounded-full bg-white/10 group-hover:bg-red-500/20 flex items-center justify-center transition-colors">
              <LogOut className="h-4 w-4" />
            </div>
            <span className="text-[11px] font-medium">Déconnexion</span>
          </button>

        </div>
      </nav>

      {/* ── Dialog admin ── */}
      <AdminUnlockDialog
        open={showAdminDialog}
        onOpenChange={setShowAdminDialog}
        onUnlock={() => setIsAdminMode(v => !v)}
      />

      {/* ── Modale Sécurité & RGPD ── */}
      {showRgpdModal && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          style={{ background: 'rgba(10,20,50,0.7)', backdropFilter: 'blur(6px)' }}
          onClick={() => setShowRgpdModal(false)}
        >
          <div
            className="bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-5 py-4 flex items-center gap-3 flex-shrink-0"
              style={{ background: 'linear-gradient(135deg, #1a3560, #0e6e80)' }}>
              <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
                <ShieldCheck className="h-5 w-5 text-white" />
              </div>
              <div className="flex-1">
                <h2 className="text-base font-bold text-white">Sécurisation & RGPD</h2>
                <p className="text-xs text-white/70">EHPAD Care Hub — Résidence La Fourrier</p>
              </div>
              <button onClick={() => setShowRgpdModal(false)}
                className="w-8 h-8 rounded-lg bg-white/15 hover:bg-white/25 flex items-center justify-center transition-colors">
                <X className="h-4 w-4 text-white" />
              </button>
            </div>

            {/* Contenu scrollable */}
            <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">

              <p className="text-sm text-slate-600 leading-relaxed">
                Cette application traite des données médicales sensibles. Les mesures suivantes ont été mises en place pour garantir leur sécurité et la conformité au Règlement Général sur la Protection des Données (RGPD — UE 2016/679).
              </p>

              {/* Mesures */}
              {[
                {
                  icon: <Clock className="h-4 w-4" />,
                  color: '#f59e0b',
                  title: 'Déconnexion automatique',
                  desc: 'La session se ferme automatiquement après 30 minutes d\'inactivité. Un avertissement apparaît 2 minutes avant pour permettre de rester connecté.',
                },
                {
                  icon: <Lock className="h-4 w-4" />,
                  color: '#3b72d8',
                  title: 'Contrôle d\'accès par rôle',
                  desc: 'Chaque utilisateur ne voit que les modules correspondant à son rôle (IDE, cadre, aide-soignant, médecin…). Les routes administratives sont protégées côté serveur.',
                },
                {
                  icon: <ShieldCheck className="h-4 w-4" />,
                  color: '#0e6e80',
                  title: 'En-têtes de sécurité HTTP',
                  desc: 'Protection contre le clickjacking (X-Frame-Options), le sniffing MIME, et forçage HTTPS en production. Une politique de sécurité du contenu (CSP) limite les sources autorisées.',
                },
                {
                  icon: <ScrollText className="h-4 w-4" />,
                  color: '#d97706',
                  title: 'Journal d\'audit',
                  desc: 'Toutes les actions sensibles sont tracées : connexions, déconnexions, envois d\'emails, créations et modifications de comptes utilisateurs.',
                },
                {
                  icon: <Database className="h-4 w-4" />,
                  color: '#7c3aed',
                  title: 'Sécurité des données (RLS)',
                  desc: 'La sécurité au niveau des lignes (Row Level Security) est activée sur toutes les tables Supabase. Seuls les utilisateurs authentifiés peuvent accéder aux données.',
                },
                {
                  icon: <Scale className="h-4 w-4" />,
                  color: '#16a34a',
                  title: 'Droits RGPD',
                  desc: 'L\'administrateur peut exporter l\'intégralité des données d\'un résident (Art. 15 — droit d\'accès) ou les anonymiser sur demande (Art. 17 — droit à l\'effacement), tout en respectant l\'obligation légale de conservation des dossiers médicaux (20 ans — Art. R.1112-7 CSP).',
                },
                {
                  icon: <FileCheck className="h-4 w-4" />,
                  color: '#0369a1',
                  title: 'Chiffrement & hébergement',
                  desc: 'Les données sont hébergées sur Supabase (infrastructure certifiée SOC 2 Type II) avec chiffrement en transit (TLS 1.3) et au repos. L\'application est déployée sur Vercel avec HTTPS forcé.',
                },
              ].map((item, i) => (
                <div key={i} className="flex gap-3">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
                    style={{ background: item.color + '18', color: item.color }}>
                    {item.icon}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{item.title}</p>
                    <p className="text-xs text-slate-500 leading-relaxed mt-0.5">{item.desc}</p>
                  </div>
                </div>
              ))}

              {/* Contact */}
              <div className="bg-slate-50 rounded-xl px-4 py-3 border border-slate-200">
                <p className="text-xs text-slate-600 leading-relaxed">
                  Pour toute question relative à la sécurité ou à vos droits RGPD, contactez l&apos;administrateur de l&apos;application :
                </p>
                <a
                  href="mailto:pierre.dupre@ch-paray.fr"
                  className="text-sm font-semibold text-blue-600 hover:text-blue-700 mt-1 flex items-center gap-1"
                >
                  pierre.dupre@ch-paray.fr
                </a>
              </div>

            </div>

            {/* Footer */}
            <div className="px-5 py-3 border-t border-slate-100 flex-shrink-0">
              <button
                onClick={() => setShowRgpdModal(false)}
                className="w-full py-2.5 rounded-xl text-sm font-semibold text-white transition-colors"
                style={{ background: 'linear-gradient(135deg, #1a3560, #0e4a7a)' }}
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
