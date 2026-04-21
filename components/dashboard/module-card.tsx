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
      style={{
        background: `linear-gradient(145deg, ${module.cardFrom} 0%, ${module.cardTo} 100%)`,
      }}
      className={cn(
        'relative flex flex-col items-center justify-center gap-3',
        'p-5 rounded-2xl shadow-md',
        'min-h-[148px] sm:min-h-[170px]',
        'transition-all duration-200 select-none',
        isDragging
          ? 'opacity-40 shadow-2xl scale-105 z-50 cursor-grabbing'
          : 'cursor-pointer hover:shadow-xl hover:-translate-y-1 hover:brightness-110'
      )}
    >
      {/* Grip handle en mode admin */}
      {isDraggable && (
        <button
          {...attributes}
          {...listeners}
          onClick={(e) => e.preventDefault()}
          className="absolute top-2 right-2 p-1 rounded text-white/40 hover:text-white/80 cursor-grab active:cursor-grabbing"
          aria-label="Déplacer"
        >
          <GripVertical className="h-4 w-4" />
        </button>
      )}

      {/* Icône sur fond semi-transparent */}
      <div className="w-14 h-14 rounded-2xl bg-white/20 flex items-center justify-center">
        <Icon className="h-7 w-7 text-white" strokeWidth={1.5} />
      </div>

      {/* Texte */}
      <div className="text-center px-1">
        <h3 className="text-sm font-bold text-white leading-tight">
          {module.label}
        </h3>
        <p className="text-[11px] text-white/75 mt-0.5 leading-snug hidden sm:block">
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
