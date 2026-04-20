'use client';

import { useState } from 'react';
import { Lock } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const ADMIN_PASSWORD = 'mapad2022';

interface AdminUnlockDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUnlock: () => void;
}

export function AdminUnlockDialog({
  open,
  onOpenChange,
  onUnlock,
}: AdminUnlockDialogProps) {
  const [value, setValue] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (value === ADMIN_PASSWORD) {
      onUnlock();
      onOpenChange(false);
      setValue('');
      setError('');
    } else {
      setError('Mot de passe incorrect.');
      setValue('');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Lock className="h-4 w-4 text-slate-500" />
            Déverrouillage administrateur
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-1">
          <div className="space-y-1.5">
            <Label htmlFor="admin-pwd" className="text-sm text-slate-600">
              Mot de passe
            </Label>
            <Input
              id="admin-pwd"
              type="password"
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                setError('');
              }}
              autoFocus
              placeholder="••••••••"
              className="h-10"
            />
            {error && <p className="text-xs text-red-600">{error}</p>}
          </div>
          <div className="flex gap-2 pt-1">
            <Button type="submit" className="flex-1">
              Déverrouiller
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