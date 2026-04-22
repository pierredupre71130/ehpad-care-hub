'use client';

import { useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import Link from 'next/link';
import { GripVertical, Paintbrush, X } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import type { ModuleConfig } from './module-config';
import { fetchColorOverrides, saveColorOverride, darkenHex, type ColorOverrides } from '@/lib/module-colors';

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

  const [showPicker, setShowPicker] = useState(false);
  const [pickerColor, setPickerColor] = useState(module.cardFrom);

  const queryClient = useQueryClient();

  const { data: colorOverrides = {} } = useQuery<ColorOverrides>({
    queryKey: ['settings', 'module_colors'],
    queryFn: fetchColorOverrides,
    staleTime: 30000,
  });

  const override = colorOverrides[module.id];
  const colorFrom = override?.from ?? module.cardFrom;
  const colorTo = override?.to ?? module.cardTo;

  const handleOpenPicker = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setPickerColor(colorFrom);
    setShowPicker(true);
  };

  const handleApply = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const to = darkenHex(pickerColor, 22);
    await saveColorOverride(module.id, pickerColor, to, colorOverrides);
    queryClient.setQueryData<ColorOverrides>(['settings', 'module_colors'], {
      ...colorOverrides,
      [module.id]: { from: pickerColor, to },
    });
    setShowPicker(false);
  };

  const handleReset = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const next: ColorOverrides = { ...colorOverrides };
    delete next[module.id];
    await saveColorOverride(module.id, module.cardFrom, module.cardTo, next);
    // After delete we want the override removed entirely
    queryClient.setQueryData<ColorOverrides>(['settings', 'module_colors'], next);
    setShowPicker(false);
  };

  const handleClosePicker = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setShowPicker(false);
  };

  const inner = (
    <div
      style={{
        background: `linear-gradient(145deg, ${colorFrom} 0%, ${colorTo} 100%)`,
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
      {/* Paint brush button in admin mode (top-left) */}
      {isDraggable && (
        <button
          onClick={handleOpenPicker}
          className="absolute top-2 left-2 p-1 rounded text-white/40 hover:text-white/80"
          aria-label="Changer la couleur"
        >
          <Paintbrush className="h-4 w-4" />
        </button>
      )}

      {/* Grip handle in admin mode (top-right) */}
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

      {/* Color picker popover */}
      {showPicker && (
        <div
          className="absolute top-10 left-2 z-50 bg-white rounded-xl shadow-xl border border-slate-200 p-3 w-52"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-700">Couleur du module</span>
            <button
              onClick={handleClosePicker}
              className="text-slate-400 hover:text-slate-600 p-0.5"
              aria-label="Fermer"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Color input */}
          <input
            type="color"
            value={pickerColor}
            onChange={(e) => setPickerColor(e.target.value)}
            className="w-full h-8 rounded cursor-pointer border border-slate-200"
          />

          {/* Live preview gradient strip */}
          <div
            className="mt-2 h-5 rounded-md"
            style={{
              background: `linear-gradient(135deg, ${pickerColor} 0%, ${darkenHex(pickerColor, 22)} 100%)`,
            }}
          />

          {/* Action buttons */}
          <div className="flex gap-1.5 mt-2">
            <button
              onClick={handleApply}
              className="flex-1 bg-slate-800 hover:bg-slate-700 text-white text-xs font-medium rounded-lg px-2 py-1.5 transition-colors"
            >
              Appliquer
            </button>
            <button
              onClick={handleReset}
              className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-medium rounded-lg px-2 py-1.5 transition-colors"
            >
              Réinitialiser
            </button>
          </div>
        </div>
      )}

      {/* Icon on semi-transparent background */}
      <div className="w-14 h-14 rounded-2xl bg-white/20 flex items-center justify-center">
        <Icon className="h-7 w-7 text-white" strokeWidth={1.5} />
      </div>

      {/* Text */}
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
