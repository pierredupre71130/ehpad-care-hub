'use client';

import { ChevronDown, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const ROLES = [
  { value: 'all', label: 'Tous les modules' },
  { value: 'cadre', label: 'Cadre de santé' },
  { value: 'aide-soignante', label: 'Aide-soignant(e)' },
  { value: 'as', label: 'Agent de service (ASH)' },
  { value: 'ide', label: 'Infirmière (IDE)' },
  { value: 'psychologue', label: 'Psychologue' },
  { value: 'dieteticienne', label: 'Diététicienne' },
];

interface RoleSelectorProps {
  currentRole: string;
  onRoleChange: (role: string) => void;
}

export function RoleSelector({ currentRole, onRoleChange }: RoleSelectorProps) {
  const current = ROLES.find((r) => r.value === currentRole) ?? ROLES[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 text-slate-600 border-slate-200 h-8 text-xs"
        >
          <Users className="h-3.5 w-3.5" />
          <span className="hidden sm:inline max-w-[140px] truncate">
            {current.label}
          </span>
          <ChevronDown className="h-3.5 w-3.5 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel className="text-xs text-slate-400 font-normal">
          Filtrer par rôle
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {ROLES.map((role) => (
          <DropdownMenuItem
            key={role.value}
            onClick={() => onRoleChange(role.value)}
            className={
              currentRole === role.value ? 'bg-blue-50 text-blue-700 font-medium' : ''
            }
          >
            {role.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}