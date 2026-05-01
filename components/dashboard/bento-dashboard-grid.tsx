'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { fetchColorOverrides, type ColorOverrides } from '@/lib/module-colors';
import type { ModuleConfig } from './module-config';

function CompactCard({ module, colorFrom, colorTo }: { module: ModuleConfig; colorFrom: string; colorTo: string }) {
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

export function BentoDashboardGrid({ modules }: { modules: ModuleConfig[] }) {
  const { data: colorOverrides = {} } = useQuery<ColorOverrides>({
    queryKey: ['settings', 'module_colors'],
    queryFn: fetchColorOverrides,
    staleTime: 30000,
  });

  return (
    <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-8 gap-2">
      {modules.map(mod => {
        const ov = colorOverrides[mod.id];
        const from = ov?.from ?? mod.cardFrom;
        const to = ov?.to ?? mod.cardTo;
        return (
          <div key={mod.id}>
            <CompactCard module={mod} colorFrom={from} colorTo={to} />
          </div>
        );
      })}
    </div>
  );
}
