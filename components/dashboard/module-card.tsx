'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import Link from 'next/link';
import { GripVertical } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ModuleConfig } from './module-config';

interface ModuleCardProps {
  module: ModuleConfig;
  isDraggable: boolean;
}

export function ModuleCard({ module, isDraggable }: ModuleCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: module.id });

  const Icon = module.icon;

  const inner = (
    <div
      className={cn(
        'relative flex flex-col items-center justify-center gap-2.5',
        'p-4 sm:p-5 rounded-2xl border-2 bg-white',
        'min-h-[130px] sm:min-h-[148px]',
        'transition-all duration-200 select-none',
        module.colorClass,
        isDragging
          ? 'opacity-40 shadow-2xl scale-105 z-50 cursor-grabbing'
          : 'cursor-pointer hover:shadow-md hover:-translate-y-0.5'
      )}
    >
      {/* Grip handle (visible seulement en mode admin) */}
      {isDraggable && (
        <button
          {...attributes}
          {...listeners}
          onClick={(e) => e.preventDefault()}
          className="absolute top-2 right-2 p-0.5 rounded text-slate-300 hover:text-slate-500 cursor-grab active:cursor-grabbing"
          aria-label="Déplacer"
        >
          <GripVertical className="h-4 w-4" />
        </button>
      )}

      {/* Icône */}
      <div className={cn('flex items-center justify-center w-11 h-11 rounded-xl', module.iconBg)}>
        <Icon className="h-5 w-5" strokeWidth={1.75} />
      </div>

      {/* Texte */}
      <div className="text-center">
        <h3 className="text-sm font-semibold text-slate-800 leading-tight">
          {module.label}
        </h3>
        <p className="text-xs text-slate-400 mt-0.5 leading-snug hidden sm:block">
          {module.description}
        </p>
      </div>
    </div>
  );

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      {isDraggable ? (
        inner
      ) : (
        <Link href={module.href} className="block">
          {inner}
        </Link>
      )}
    </div>
  );
}