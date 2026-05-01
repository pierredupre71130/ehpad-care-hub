'use client';

import { useMemo } from 'react';
import { CheckCircle2, Eye, XCircle, Info } from 'lucide-react';
import { MODULES } from '@/components/dashboard/module-config';
import { CONFIGURABLE_ROLES, type RolePermissions } from '@/lib/role-permissions';

// ── Field-level restrictions defined per role ─────────────────────────────────
// Kept here as a single source of truth for the summary panel.
const FIELD_RESTRICTIONS: Record<string, string[]> = {
  cadre:          ['GIR & Niveaux de Soin : ne peut pas modifier le niveau de soin (réservé médecin)'],
  secretaire:     ['GIR & Niveaux de Soin : ne peut pas modifier le niveau de soin (réservé médecin)'],
  medecin:        ['GIR & Niveaux de Soin : peut modifier uniquement le niveau de soin'],
  'aide-soignante': ['Bilans Sanguins : gestion des bilans spéciaux réservée à l\'admin'],
  as:             ['Bilans Sanguins : gestion des bilans spéciaux réservée à l\'admin'],
  ide:            ['Bilans Sanguins : gestion des bilans spéciaux réservée à l\'admin'],
  psychologue:    [],
  dieteticienne:  [],
};

// ── Helpers ───────────────────────────────────────────────────────────────────

type AccessLevel = 'full' | 'read' | 'none';

function AccessBadge({ level }: { level: AccessLevel }) {
  if (level === 'full') return (
    <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
      <CheckCircle2 className="h-3 w-3" />Complet
    </span>
  );
  if (level === 'read') return (
    <span className="flex items-center gap-1 text-[11px] font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded-full px-2 py-0.5">
      <Eye className="h-3 w-3" />Lecture
    </span>
  );
  return (
    <span className="flex items-center gap-1 text-[11px] font-semibold text-slate-400 bg-slate-50 border border-slate-200 rounded-full px-2 py-0.5">
      <XCircle className="h-3 w-3" />Aucun
    </span>
  );
}

// ── Panel ─────────────────────────────────────────────────────────────────────

export function RoleSummaryPanel({
  role,
  permissions,
}: {
  role: string;
  permissions: RolePermissions;
}) {
  const roleMeta = CONFIGURABLE_ROLES.find(r => r.value === role);
  if (!roleMeta) return null;

  const rolePerms = permissions[role] ?? {};
  const fieldRestrictions = FIELD_RESTRICTIONS[role] ?? [];

  // Separate modules into accessible and inaccessible
  const { accessible, inaccessible } = useMemo(() => {
    const acc: { id: string; label: string; color: string; level: AccessLevel }[] = [];
    const inacc: { id: string; label: string; color: string }[] = [];
    for (const mod of MODULES) {
      if (mod.id === 'fichesDePoste') continue; // bottom-nav only
      const level = rolePerms[mod.id];
      if (level === 'full' || level === 'read') {
        acc.push({ id: mod.id, label: mod.label, color: mod.cardFrom, level });
      } else {
        inacc.push({ id: mod.id, label: mod.label, color: mod.cardFrom });
      }
    }
    return { accessible: acc, inaccessible: inacc };
  }, [rolePerms]);

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden mb-6">
      {/* Header */}
      <div
        className="px-5 py-3 flex items-center gap-3"
        style={{ background: `${roleMeta.color}18`, borderBottom: `2px solid ${roleMeta.color}30` }}
      >
        <span
          className="w-3 h-3 rounded-full flex-shrink-0"
          style={{ background: roleMeta.color }}
        />
        <span className="font-semibold text-slate-800 text-sm">
          Droits configurés — {roleMeta.label}
        </span>
        <span className="ml-auto text-xs text-slate-400">
          {accessible.length} module{accessible.length > 1 ? 's' : ''} accessible{accessible.length > 1 ? 's' : ''}
          {inaccessible.length > 0 && ` · ${inaccessible.length} inaccessible${inaccessible.length > 1 ? 's' : ''}`}
        </span>
      </div>

      <div className="p-5 space-y-5">
        {/* Accessible modules */}
        {accessible.length > 0 && (
          <div>
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-2">
              Modules accessibles
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {accessible.map(mod => (
                <div key={mod.id} className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-100">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: mod.color }} />
                    <span className="text-xs text-slate-700 font-medium truncate">{mod.label}</span>
                  </div>
                  <AccessBadge level={mod.level} />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Inaccessible modules */}
        {inaccessible.length > 0 && (
          <div>
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-2">
              Modules non accessibles
            </p>
            <div className="flex flex-wrap gap-1.5">
              {inaccessible.map(mod => (
                <div key={mod.id} className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-50 border border-slate-200">
                  <span className="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-slate-300" />
                  <span className="text-[11px] text-slate-400 font-medium">{mod.label}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Field-level restrictions */}
        {fieldRestrictions.length > 0 && (
          <div>
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-2">
              Restrictions par champ
            </p>
            <div className="space-y-1">
              {fieldRestrictions.map((r, i) => (
                <div key={i} className="flex items-start gap-2 px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-100">
                  <Info className="h-3.5 w-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
                  <span className="text-xs text-amber-800">{r}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
