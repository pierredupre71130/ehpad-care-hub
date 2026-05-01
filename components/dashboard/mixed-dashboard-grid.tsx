'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { fetchColorOverrides, type ColorOverrides } from '@/lib/module-colors';
import type { ModuleConfig } from './module-config';
import type { ModuleSizeConfig } from '@/lib/module-sizes';

function LargeCard({ module, colorFrom, colorTo }: { module: ModuleConfig; colorFrom: string; colorTo: string }) {
  const Icon = module.icon;
  return (
    <Link href={module.href} className="block">
      <div
        className="flex flex-col items-center justify-center gap-3 p-5 rounded-2xl shadow-md min-h-[148px] sm:min-h-[170px] cursor-pointer transition-all duration-200 select-none hover:shadow-xl hover:-translate-y-1 hover:brightness-110"
        style={{ background: `linear-gradient(145deg, ${colorFrom} 0%, ${colorTo} 100%)` }}
      >
        <div className="w-14 h-14 rounded-2xl bg-white/20 flex items-center justify-center">
          <Icon className="h-7 w-7 text-white" strokeWidth={1.5} />
        </div>
        <div className="text-center px-1">
          <h3 className="text-sm font-bold text-white leading-tight">{module.label}</h3>
          <p className="text-[11px] text-white/75 mt-0.5 leading-snug hidden sm:block">{module.description}</p>
        </div>
      </div>
    </Link>
  );
}

function SmallCard({ module, colorFrom, colorTo }: { module: ModuleConfig; colorFrom: string; colorTo: string }) {
  const Icon = module.icon;
  return (
    <Link href={module.href} className="block">
      <div
        className="flex flex-col items-center justify-center gap-1.5 p-3 rounded-xl shadow-sm min-h-[80px] cursor-pointer transition-all duration-150 hover:shadow-md hover:-translate-y-0.5 hover:brightness-110 select-none text-center"
        style={{ background: `linear-gradient(145deg, ${colorFrom} 0%, ${colorTo} 100%)` }}
      >
        <div className="w-9 h-9 rounded-lg bg-white/20 flex items-center justify-center">
          <Icon className="h-5 w-5 text-white" strokeWidth={1.5} />
        </div>
        <span className="text-[11px] font-semibold text-white leading-tight px-0.5 line-clamp-2">
          {module.label}
        </span>
      </div>
    </Link>
  );
}

interface MixedDashboardGridProps {
  modules: ModuleConfig[];
  sizeConfig: ModuleSizeConfig;
}

export function MixedDashboardGrid({ modules, sizeConfig }: MixedDashboardGridProps) {
  const { data: colorOverrides = {} } = useQuery<ColorOverrides>({
    queryKey: ['settings', 'module_colors'],
    queryFn: fetchColorOverrides,
    staleTime: 30000,
  });

  const largeModules = modules.filter(m => (sizeConfig[m.id] ?? 'large') === 'large');
  const smallModules = modules.filter(m => sizeConfig[m.id] === 'small');

  const getColors = (mod: ModuleConfig) => {
    const ov = colorOverrides[mod.id];
    return { from: ov?.from ?? mod.cardFrom, to: ov?.to ?? mod.cardTo };
  };

  return (
    <div className="flex flex-col gap-4">
      {largeModules.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4">
          {largeModules.map(mod => {
            const { from, to } = getColors(mod);
            return (
              <div key={mod.id}>
                <LargeCard module={mod} colorFrom={from} colorTo={to} />
              </div>
            );
          })}
        </div>
      )}
      {smallModules.length > 0 && (
        <>
          {largeModules.length > 0 && (
            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-white/20" />
              <span className="text-[11px] font-semibold text-white/50 uppercase tracking-wide">Accès rapide</span>
              <div className="h-px flex-1 bg-white/20" />
            </div>
          )}
          <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-8 gap-2">
            {smallModules.map(mod => {
              const { from, to } = getColors(mod);
              return (
                <div key={mod.id}>
                  <SmallCard module={mod} colorFrom={from} colorTo={to} />
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
