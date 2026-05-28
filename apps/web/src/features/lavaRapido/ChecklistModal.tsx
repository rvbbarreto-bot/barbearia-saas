import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { createChecklist } from './carWashService';
import { getApiErrorMessage } from '@/lib/apiErrorMessage';

interface Props {
  open: boolean;
  jobId: string;
  type: 'arrival' | 'delivery';
  onClose: () => void;
  onSaved?: () => void;
}

export function ChecklistModal({ open, jobId, type, onClose, onSaved }: Props) {
  const [bodyScratches, setBodyScratches] = useState(false);
  const [wheelDamage, setWheelDamage] = useState(false);
  const [fuelLevel, setFuelLevel] = useState('1/2');
  const [interiorObjects, setInteriorObjects] = useState('');
  const [generalNotes, setGeneralNotes] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      createChecklist(jobId, {
        checklist_type: type,
        items: {
          body_scratches: bodyScratches,
          wheel_damage: wheelDamage,
          fuel_level: fuelLevel,
          interior_objects: interiorObjects,
          general_notes: generalNotes,
        },
      }),
    onSuccess: () => {
      toast.success('Checklist registrado.');
      onSaved?.();
      onClose();
    },
    onError: (err) => toast.error(getApiErrorMessage(err, 'Erro ao salvar checklist.')),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent aria-labelledby="checklist-title">
        <DialogHeader>
          <DialogTitle id="checklist-title">
            Checklist {type === 'arrival' ? 'de entrada' : 'de entrega'}
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <Label htmlFor="body-scratches">Arranhões na lataria</Label>
            <Switch id="body-scratches" checked={bodyScratches} onCheckedChange={setBodyScratches} />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="wheel-damage">Avaria nas rodas</Label>
            <Switch id="wheel-damage" checked={wheelDamage} onCheckedChange={setWheelDamage} />
          </div>
          <div>
            <Label htmlFor="fuel">Combustível</Label>
            <input
              id="fuel"
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
              value={fuelLevel}
              onChange={(e) => setFuelLevel(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="interior">Objetos no interior</Label>
            <Textarea id="interior" value={interiorObjects} onChange={(e) => setInteriorObjects(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="notes">Observações gerais</Label>
            <Textarea id="notes" value={generalNotes} onChange={(e) => setGeneralNotes(e.target.value)} />
          </div>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !fuelLevel.trim() || !interiorObjects.trim()}
          >
            Salvar checklist
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
