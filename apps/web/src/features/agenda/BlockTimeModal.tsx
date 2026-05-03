import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { Professional } from '@/types/api';
import { createCalendarBlock } from './agendaService';

interface Props {
  open: boolean;
  onClose: () => void;
  professionals: Professional[];
  defaultProfessionalId?: string | null;
}

function BlockTimeModalInner({
  onClose,
  professionals,
  defaultProfessionalId,
}: Omit<Props, 'open'>) {
  const qc = useQueryClient();
  const [profId, setProfId] = useState(() =>
    defaultProfessionalId ? defaultProfessionalId : 'global',
  );
  const [startsLocal, setStartsLocal] = useState('');
  const [endsLocal, setEndsLocal] = useState('');
  const [reason, setReason] = useState('');

  const mut = useMutation({
    mutationFn: () => {
      if (!startsLocal || !endsLocal) throw new Error('Horários obrigatórios');
      const starts_at = new Date(startsLocal).toISOString();
      const ends_at = new Date(endsLocal).toISOString();
      if (new Date(ends_at) <= new Date(starts_at)) throw new Error('Fim deve ser após o início');
      return createCalendarBlock({
        professional_id: profId === 'global' ? undefined : profId,
        starts_at,
        ends_at,
        kind: 'manual',
        reason: reason.trim().length >= 3 ? reason.trim() : undefined,
      });
    },
    onSuccess: () => {
      toast.success('Horário bloqueado.');
      qc.invalidateQueries({ queryKey: ['calendar-blocks'] });
      qc.invalidateQueries({ queryKey: ['availability'] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message || 'Erro ao bloquear.'),
  });

  const canSubmit =
    startsLocal &&
    endsLocal &&
    reason.trim().length >= 3 &&
    new Date(endsLocal) > new Date(startsLocal);

  return (
    <>
      <DialogHeader>
        <DialogTitle>Bloquear horário</DialogTitle>
      </DialogHeader>
      <div className="flex flex-col gap-4 py-2">
          <div className="flex flex-col gap-2">
            <Label>Profissional</Label>
            <Select value={profId} onValueChange={setProfId}>
              <SelectTrigger>
                <SelectValue placeholder="Escopo do bloqueio" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="global">Unidade (todos os profissionais)</SelectItem>
                {professionals.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label>Início</Label>
              <Input
                type="datetime-local"
                value={startsLocal}
                onChange={(e) => setStartsLocal(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Fim</Label>
              <Input
                type="datetime-local"
                value={endsLocal}
                onChange={(e) => setEndsLocal(e.target.value)}
              />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label>Motivo (obrigatório)</Label>
            <Textarea
              placeholder="Motivo do bloqueio (mín. 3 caracteres)"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
            />
          </div>
        </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Cancelar
        </Button>
        <Button disabled={!canSubmit || mut.isPending} onClick={() => mut.mutate()}>
          {mut.isPending && <Loader2 className="size-4 animate-spin" />}
          Confirmar bloqueio
        </Button>
      </DialogFooter>
    </>
  );
}

/** Bloqueio manual via API — disponibilidade futura respeita `calendar_blocks` no backend. */
export function BlockTimeModal({ open, onClose, professionals, defaultProfessionalId }: Props) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        {open ? (
          <BlockTimeModalInner
            onClose={onClose}
            professionals={professionals}
            defaultProfessionalId={defaultProfessionalId}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
