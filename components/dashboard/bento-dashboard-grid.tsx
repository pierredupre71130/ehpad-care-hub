'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { fetchColorOverrides, darkenHex, type ColorOverrides } from '@/lib/module-colors';
import { MODULE_CATEGORIES, type ModuleConfig } from './module-config';

// ── Storage helpers ───────────────────────────────────────────────────────────

const LS_KEY = 'bento_collapsed_cats';

function loadCollapsed(): Set<string> {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch { return new Set(); }
}

function saveCollapsed(s: Set<string>) {
  try { localStorage.setItem(LS_KEY, JSON.stringify([...s])); } catch { /* ignore */ }
}

// ── Hero card (first module in a category) ───────────────────────────────────

function HeroCard({ module, colorFrom, colorTo }: { module: ModuleConfig; colorFrom: string; colorTo: string }) {
  const Icon = module.icon;
  return (
    <Link href={module.href} className="block">
      <div
        className="relative flex items-center gap-5 p-5 rounded-2xl shadow-md min-h-[120px] sm:min-h-[140px] cursor-pointer transition-all duration-200 hover:shadow-xl hover:-translate-y-0.5 hover:brightness-110 select-none"
        style={{ background: `linear-gradient(145deg, ${colorFrom} 0%, ${colorTo} 100%)` }}
      >
        <div className="w-16 h-16 rounded-2xl bg-white/20 flex items-center justify-center flex-shrink-0">
          <Icon className="h-8 w-8 text-white" strokeWidth={1.5} />
        </div>
        <div>
          <h3 className="text-base font-bold text-white leading-tight">{module.label}</h3>
          <p className="text-[12px] text-white/75 mt-1 leading-snug">{module.description}</p>
        </div>
      </div>
    </Link>
  );
}

// ── Small card ────────────────────────────────────────────────────────────────

function SmallCard({ module, colorFrom, colorTo }: { module: ModuleConfig; colorFrom: string; colorTo: string }) {
  const Icon = module.icon;
  return (
    <Link href={module.href} className="block">
      <div
        className="flex flex-col items-center justify-center gap-2.5 p-4 rounded-2xl shadow-md min-h-[120px] sm:min-h-[130px] cursor-pointer transition-all duration-200 hover:shadow-xl hover:-translate-y-0.5 hover:brightness-110 select-none text-center"
        style={{ background: `linear-gradient(145deg, ${colorFrom} 0%, ${colorTo} 100%)` }}
      >
        <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center">
          <Icon className="h-6 w-6 text-white" strokeWidth={1.5} />
        </div>
        <h3 className="text-[12px] font-bold text-white leading-tight px-1">{module.label}</h3>
      </div>
    </Link>
  );
}

// ── Main grid ─────────────────────────────────────────────────────────────────

interface BentoDashboardGridProps {
  modules: ModuleConfig[];
}

export function BentoDashboardGrid({ modules }: BentoDashboardGridProps) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  useEffect(() => {
    setCollapsed(loadCollapsed());
  }, []);

  const { data: colorOverrides = {} } = useQuery<ColorOverrides>({
    queryKey: ['settings', 'module_colors'],
    queryFn: fetchColorOverrides,
    staleTime: 30000,
  });

  const toggle = (catId: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      next.has(catId) ? next.delete(catId) : next.add(catId);
      saveCollapsed(next as Set<string>);
      return next;
    });
  };

  const resolveColor = (mod: ModuleConfig): { from: string; to: string } => {
    const ov = colorOverrides[mod.id];
    return {
      from: ov?.from ?? mod.cardFrom,
      to: ov?.to ?? mod.cardTo,
    };
  };

  // Group modules by category, preserving order
  const categorized = MODULE_CATEGORIES.map(cat => ({
    cat,
    mods: modules.filter(m => m.categoryId === cat.id),
  })).filter(({ mods }) => mods.length > 0);

  // Modules without a known category
  const orphans = modules.filter(m => !MODULE_CATEGORIES.find(c => c.id === m.categoryId));

  return (
    <div className="space-y-5">
      {categorized.map(({ cat, mods }) => {
        const isOpen = !collapsed.has(cat.id);
        return (
          <div key={cat.id}>
            {/* Category header */}
            <button
              onClick={() => toggle(cat.id)}
              className="w-full flex items-center gap-2.5 mb-3 group"
            >
              <span
                className="w-3 h-3 rounded-full flex-shrink-0 transition-transform duration-200"
                style={{ background: cat.color }}
              />
              <span className="text-xs font-bold uppercase tracking-widest text-white/70 group-hover:text-white transition-colors">
                {cat.label}
              </span>
              <span className="flex-1 h-px bg-white/10 group-hover:bg-white/20 transition-colors" />
              <span className="text-white/40 group-hover:text-white/70 transition-colors">
                {isOpen
                  ? <ChevronDown className="h-3.5 w-3.5" />
                  : <ChevronRight className="h-3.5 w-3.5" />
                }
              </span>
            </button>

            {/* Module grid */}
            {isOpen && mods.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {mods.map((mod, i) => {
                  const c = resolveColor(mod);
                  return i === 0
                    ? (
                      <div key={mod.id} className="col-span-2">
                        <HeroCard module={mod} colorFrom={c.from} colorTo={c.to} />
                      </div>
                    ) : (
                      <div key={mod.id}>
                        <SmallCard module={mod} colorFrom={c.from} colorTo={c.to} />
                      </div>
                    );
                })}
              </div>
            )}
          </div>
        );
      })}

      {/* Orphan modules without a category */}
      {orphans.length > 0 && (
        <div>
          <div className="flex items-center gap-2.5 mb-3">
            <span className="w-3 h-3 rounded-full bg-white/30" />
            <span className="text-xs font-bold uppercase tracking-widest text-white/50">Autres</span>
            <span className="flex-1 h-px bg-white/10" />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {orphans.map((mod) => {
              const c = resolveColor(mod);
              return (
                <div key={mod.id}>
                  <SmallCard module={mod} colorFrom={c.from} colorTo={c.to} />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
