'use client';

import Link from 'next/link';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { PhoneCall, ShieldCheck, UserCog, ScrollText, Scale } from 'lucide-react';

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
  const handleUnlock = () => {
    onUnlock();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-base">Déverrouillage administrateur</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-slate-500 pt-1">
          Voulez-vous accéder aux paramètres administrateur ?
        </p>
        <div className="flex gap-2 pt-2">
          <Button onClick={handleUnlock} className="flex-1">
            Déverrouiller
          </Button>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
        </div>
        <div className="border-t border-slate-100 pt-3 mt-1">
          <p className="text-xs text-slate-400 mb-2 uppercase font-semibold tracking-wide">Paramètres</p>
          <Link
            href="/astreinte-settings"
            onClick={() => onOpenChange(false)}
            className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg hover:bg-slate-50 transition-colors text-sm text-slate-700 font-medium"
          >
            <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center flex-shrink-0">
              <PhoneCall className="h-4 w-4 text-indigo-600" />
            </div>
            <div>
              <div>Astreintes & Emails</div>
              <div className="text-xs text-slate-400 font-normal">IDEs, email cadre, Resend</div>
            </div>
          </Link>
          <Link
            href="/admin-permissions"
            onClick={() => onOpenChange(false)}
            className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg hover:bg-slate-50 transition-colors text-sm text-slate-700 font-medium"
          >
            <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
              <ShieldCheck className="h-4 w-4 text-blue-600" />
            </div>
            <div>
              <div>Gestion des Accès</div>
              <div className="text-xs text-slate-400 font-normal">Modules visibles par rôle</div>
            </div>
          </Link>
          <Link
            href="/admin-users"
            onClick={() => onOpenChange(false)}
            className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg hover:bg-slate-50 transition-colors text-sm text-slate-700 font-medium"
          >
            <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center flex-shrink-0">
              <UserCog className="h-4 w-4 text-emerald-600" />
            </div>
            <div>
              <div>Gestion des Utilisateurs</div>
              <div className="text-xs text-slate-400 font-normal">Comptes, rôles, mots de passe</div>
            </div>
          </Link>
          <Link
            href="/admin-audit"
            onClick={() => onOpenChange(false)}
            className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg hover:bg-slate-50 transition-colors text-sm text-slate-700 font-medium"
          >
            <div className="w-8 h-8 rounded-lg bg-orange-100 flex items-center justify-center flex-shrink-0">
              <ScrollText className="h-4 w-4 text-orange-600" />
            </div>
            <div>
              <div>Journal d&apos;audit</div>
              <div className="text-xs text-slate-400 font-normal">Traçabilité des actions RGPD</div>
            </div>
          </Link>
          <Link
            href="/admin-rgpd"
            onClick={() => onOpenChange(false)}
            className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg hover:bg-slate-50 transition-colors text-sm text-slate-700 font-medium"
          >
            <div className="w-8 h-8 rounded-lg bg-teal-100 flex items-center justify-center flex-shrink-0">
              <Scale className="h-4 w-4 text-teal-600" />
            </div>
            <div>
              <div>Outils RGPD</div>
              <div className="text-xs text-slate-400 font-normal">Export & anonymisation des données</div>
            </div>
          </Link>
        </div>
      </DialogContent>
    </Dialog>
  );
}
