'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Trash2, Plus } from 'lucide-react';
import type { Keywords } from '@/lib/import-parser';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialConfig: Keywords;
  onSave: (config: Keywords) => void;
}

export function ImportKeywordConfig({ open, onOpenChange, initialConfig, onSave }: Props) {
  const [config, setConfig] = useState<Keywords>(initialConfig);

  useEffect(() => {
    if (open) setConfig(initialConfig);
  }, [open, initialConfig]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Configuration des mots-clés pour l'import</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {Object.keys(config).map((type) => (
            <div key={type} className="border rounded-lg p-4 bg-slate-50">
              <h3 className="font-bold text-sm mb-3 text-slate-900 capitalize">{type}</h3>
              <div className="space-y-2">
                {(config[type] || []).map((keyword, idx) => (
                  <div key={idx} className="flex gap-2">
                    <Input
                      value={keyword}
                      onChange={(e) => {
                        const updated = [...config[type]];
                        updated[idx] = e.target.value;
                        setConfig({ ...config, [type]: updated });
                      }}
                      placeholder="Ex: lit barreaudé"
                      className="text-xs"
                    />
                    <Button
                      onClick={() => setConfig({ ...config, [type]: config[type].filter((_, i) => i !== idx) })}
                      size="sm"
                      variant="ghost"
                      className="text-red-600 hover:text-red-800"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
              <Button
                onClick={() => setConfig({ ...config, [type]: [...(config[type] || []), ''] })}
                size="sm"
                variant="outline"
                className="mt-2 gap-1 text-xs"
              >
                <Plus className="h-3 w-3" /> Ajouter mot-clé
              </Button>
            </div>
          ))}
        </div>

        <div className="flex gap-2 pt-4 border-t">
          <Button
            onClick={() => { onSave(config); onOpenChange(false); }}
            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
          >
            Enregistrer
          </Button>
          <Button onClick={() => onOpenChange(false)} variant="outline">Annuler</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
