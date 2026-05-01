'use client';

import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { ModuleCard } from './module-card';
import type { ModuleConfig } from './module-config';
import { createClient } from '@/lib/supabase/client';

async function fetchLayout(modules: ModuleConfig[]): Promise<string[]> {
  const sb = createClient();
  const { data } = await sb.from('settings').select('value').eq('key', 'dashboard_layout').maybeSingle();
  if (data?.value) {
    const saved = data.value as string[];
    const moduleIds = modules.map(m => m.id);
    const valid = saved.filter(id => moduleIds.includes(id));
    const missing = moduleIds.filter(id => !valid.includes(id));
    return [...valid, ...missing];
  }
  return modules.map(m => m.id);
}

async function saveLayout(order: string[]): Promise<void> {
  const sb = createClient();
  await sb.from('settings').upsert(
    { key: 'dashboard_layout', value: order, updated_at: new Date().toISOString() },
    { onConflict: 'key' }
  );
}

interface DashboardGridProps {
  modules: ModuleConfig[];
  isAdminMode: boolean;
  maxCols?: 4 | 5;
}

export function DashboardGrid({ modules, isAdminMode, maxCols = 5 }: DashboardGridProps) {
  const queryClient = useQueryClient();

  const { data: order = modules.map(m => m.id) } = useQuery({
    queryKey: ['settings', 'dashboard_layout', modules.map(m => m.id).join(',')],
    queryFn: () => fetchLayout(modules),
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const orderedModules = order
    .map(id => modules.find(m => m.id === id))
    .filter(Boolean) as ModuleConfig[];

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = order.indexOf(active.id as string);
      const newIndex = order.indexOf(over.id as string);
      const next = arrayMove(order, oldIndex, newIndex);
      queryClient.setQueryData(['settings', 'dashboard_layout', modules.map(m => m.id).join(',')], next);
      await saveLayout(next);
    }
  }, [order, modules, queryClient]);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={order} strategy={rectSortingStrategy}>
        <div className={`grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 ${maxCols === 5 ? 'xl:grid-cols-5' : ''} gap-3 sm:gap-4`}>
          {orderedModules.map((module) => (
            <ModuleCard
              key={module.id}
              module={module}
              isDraggable={isAdminMode}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
