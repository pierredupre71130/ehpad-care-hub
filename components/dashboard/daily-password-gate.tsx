'use client';

import { useState } from 'react';
import { CalendarDays } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

function getDailyCode(): string {
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  return `${dd}${mm}`;
}

interface DailyPasswordGateProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUnlock: () => void;
  title?: string;
}

export function DailyPasswordGate({
  open,
  onOpenChange,
  onUnlock,
  title = 'Accès paramètres',
}: DailyPasswordGateProps) {
  const [value, setValue] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (value === getDailyCode()) {
      onUnlock();
      onOpenChange(false);
      setValue('');
      setError('');
    } else {
      setError('Code incorrect — format JJMM (ex : 1904)');
      setValue('');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <CalendarDays className="h-4 w-4 text-slate-500" />
            {title}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-1">
          <p className="text-sm text-slate-500">
            Saisissez le code du jour pour continuer.
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="daily-code" className="text-sm text-slate-600">
              Code du jour
            </Label>
            <Input
              id="daily-code"
              type="password"
              inputMode="numeric"
              value={value}
              onChange={(e) => {
                setValue(e.target.value.replace(/\D/g, '').slice(0, 4));
                setError('');
              }}
              autoFocus
              placeholder="JJMM"
              maxLength={4}
              className="h-10 text-center text-lg tracking-[0.3em] font-mono"
            />
            {error && <p className="text-xs text-red-600">{error}</p>}
          </div>
          <div className="flex gap-2 pt-1">
            <Button type="submit" className="flex-1">
              Valider
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                onOpenChange(false);
                setValue('');
                setError('');
              }}
            >
              Annuler
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}