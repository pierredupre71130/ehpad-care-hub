'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

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
  const handleUnlock = () => {
    onUnlock();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-base">{title}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-slate-500 pt-1">
          Voulez-vous accéder à cette section ?
        </p>
        <div className="flex gap-2 pt-2">
          <Button onClick={handleUnlock} className="flex-1">
            Accéder
          </Button>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
