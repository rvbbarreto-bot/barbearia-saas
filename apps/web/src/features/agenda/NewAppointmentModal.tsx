import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { Check, ChevronRight, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/shared/SkeletonRows';
import { useDebounce } from '@/hooks/useDebounce';
import { useRoleGate } from '@/hooks/useRoleGate';
import type { Customer, Service, Professional, AvailabilitySlot, AppointmentSource } from '@/types/api';
import { listClientes } from '../clientes/clientesService';
import { listServicos } from '../servicos/servicosService';
import { listProfissionais } from '../profissionais/profissionaisService';
import { createAppointment, getAvailability } from './agendaService';
import axios from 'axios';
import { getApiErrorMessage } from '@/lib/apiErrorMessage';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const STEPS = ['Cliente', 'Servico', 'Profissional', 'Horario'];

interface Props {
  open: boolean;
  onClose: () => void;
}

function NewAppointmentModalInner({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const idempotencyKey = useRef(crypto.randomUUID());
  const isManager = useRoleGate('manager');

  const [step, setStep] = useState(0);
  const [customerSearch, setCustomerSearch] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | undefined>();
  const [selectedService, setSelectedService] = useState<Service | undefined>();
  const [selectedProfessional, setSelectedProfessional] = useState<Professional | undefined>();
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [selectedSlot, setSelectedSlot] = useState<AvailabilitySlot | undefined>();
  const [source, setSource] = useState<AppointmentSource>('manual');
  const [squeezeNotes, setSqueezeNotes] = useState('');

  const debouncedSearch = useDebounce(customerSearch, 300);

  const { data: customersData, isLoading: customersLoading } = useQuery({
    queryKey: ['modal-customers', debouncedSearch],
    queryFn: () => listClientes({ page: 1, limit: 10, search: debouncedSearch }),
    enabled: step === 0,
    staleTime: 15_000,
  });

  const { data: servicosData, isLoading: servicosLoading } = useQuery({
    queryKey: ['modal-servicos'],
    queryFn: () => listServicos({ page: 1, limit: 100, search: '' }),
    enabled: step === 1,
    staleTime: 60_000,
  });

  const { data: profData, isLoading: profLoading } = useQuery({
    queryKey: ['modal-profissionais'],
    queryFn: () => listProfissionais({ page: 1, limit: 100, search: '' }),
    enabled: step === 2,
    staleTime: 60_000,
  });

  const { data: slotsData, isLoading: slotsLoading, refetch: refetchSlots } = useQuery({
    queryKey: ['modal-slots', selectedProfessional?.id, selectedService?.id, selectedDate],
    queryFn: () => getAvailability({
      professional_id: selectedProfessional!.id,
      service_id: selectedService!.id,
      date: selectedDate,
    }),
    enabled: step === 3 && !!selectedProfessional && !!selectedService,
    staleTime: 0,
  });

  const mutation = useMutation({
    mutationFn: () =>
      createAppointment({
        customer_id: selectedCustomer!.id,
        professional_id: selectedProfessional!.id,
        service_id: selectedService!.id,
        starts_at: selectedSlot!.starts_at,
        ends_at: selectedSlot!.ends_at,
        idempotency_key: idempotencyKey.current,
        source,
        explicit_confirmation: true,
        notes:
          isManager && squeezeNotes.trim().length >= 3
            ? `[encaixe] ${squeezeNotes.trim()}`
            : undefined,
      }),
    onSuccess: () => {
      toast.success('Agendamento criado com sucesso!');
      qc.invalidateQueries({ queryKey: ['appointments'] });
      qc.invalidateQueries({ queryKey: ['dashboard-today'] });
      onClose();
    },
    onError: (err) => {
      if (axios.isAxiosError(err) && err.response?.status === 409) {
        const code = (err.response.data as { error?: string } | undefined)?.error;
        if (code === 'SLOT_UNAVAILABLE') {
          toast.warning(getApiErrorMessage(err, 'Horário indisponível. Escolha outro horário.'));
          refetchSlots();
        } else if (code === 'DUPLICATE_IDEMPOTENCY_KEY') {
          toast.info(getApiErrorMessage(err, 'Esta operação já foi processada. Atualize a tela.'));
          onClose();
        } else {
          toast.error(getApiErrorMessage(err, 'Conflito ao criar agendamento.'));
        }
      } else {
        toast.error(getApiErrorMessage(err, 'Erro ao criar agendamento.'));
      }
    },
  });

  const canProceed =
    (step === 0 && !!selectedCustomer) ||
    (step === 1 && !!selectedService) ||
    (step === 2 && !!selectedProfessional) ||
    (step === 3 && !!selectedSlot);

  return (
    <>
      <DialogHeader>
        <DialogTitle>Novo Agendamento</DialogTitle>
      </DialogHeader>

        {/* Stepper header */}
        <div className="flex items-center gap-1">
          {STEPS.map((label, i) => (
            <div key={i} className="flex flex-1 items-center">
              <div className={`flex size-7 items-center justify-center rounded-full text-xs font-medium transition-colors ${
                i < step ? 'bg-primary text-primary-foreground' :
                i === step ? 'bg-primary text-primary-foreground ring-2 ring-primary/30' :
                'bg-muted text-muted-foreground'
              }`}>
                {i < step ? <Check className="size-3.5" /> : i + 1}
              </div>
              <span className={`ml-1 text-xs ${i === step ? 'font-medium text-foreground' : 'text-muted-foreground'}`}>
                {label}
              </span>
              {i < STEPS.length - 1 && <ChevronRight className="mx-1 size-3 shrink-0 text-muted-foreground" />}
            </div>
          ))}
        </div>

        {/* Step 1: Cliente */}
        {step === 0 && (
          <div className="flex flex-col gap-3">
            <Input
              placeholder="Buscar cliente por nome ou telefone..."
              value={customerSearch}
              onChange={(e) => setCustomerSearch(e.target.value)}
              autoFocus
            />
            {customersLoading ? (
              <div className="flex flex-col gap-1.5">
                {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10" />)}
              </div>
            ) : (
              <div className="flex max-h-52 flex-col gap-1 overflow-y-auto">
                {(customersData?.data ?? []).map((c: Customer) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setSelectedCustomer(c)}
                    className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors ${
                      selectedCustomer?.id === c.id ? 'border-primary bg-primary/5' : 'hover:bg-muted/60'
                    }`}
                  >
                    <div className="flex flex-col gap-0.5">
                      <span className="font-medium">{c.name ?? c.phone}</span>
                      {c.name && <span className="text-xs text-muted-foreground">{c.phone}</span>}
                    </div>
                    {selectedCustomer?.id === c.id && <Check className="ml-auto size-4 text-primary" />}
                  </button>
                ))}
                {!customersLoading && (customersData?.data.length ?? 0) === 0 && (
                  <p className="py-6 text-center text-sm text-muted-foreground">Nenhum cliente encontrado.</p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Step 2: Servico */}
        {step === 1 && (
          <div className="flex max-h-64 flex-col gap-1 overflow-y-auto">
            {servicosLoading ? (
              Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12" />)
            ) : (
              (servicosData?.data ?? []).filter((s: Service) => s.active).map((s: Service) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSelectedService(s)}
                  className={`flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-left text-sm transition-colors ${
                    selectedService?.id === s.id ? 'border-primary bg-primary/5' : 'hover:bg-muted/60'
                  }`}
                >
                  <div className="flex flex-col gap-0.5">
                    <span className="font-medium">{s.name}</span>
                    <span className="text-xs text-muted-foreground">{s.duration_minutes} min · {(s.price_cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                  </div>
                  {selectedService?.id === s.id && <Check className="size-4 text-primary" />}
                </button>
              ))
            )}
          </div>
        )}

        {/* Step 3: Profissional */}
        {step === 2 && (
          <div className="flex max-h-64 flex-col gap-1 overflow-y-auto">
            {profLoading ? (
              Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12" />)
            ) : (
              (profData?.data ?? [])
                .filter((p: Professional) => !selectedService || (p.service_ids ?? []).includes(selectedService.id))
                .map((p: Professional) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setSelectedProfessional(p)}
                    className={`flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-left text-sm transition-colors ${
                      selectedProfessional?.id === p.id ? 'border-primary bg-primary/5' : 'hover:bg-muted/60'
                    }`}
                  >
                    <span className="font-medium">{p.name}</span>
                    {selectedProfessional?.id === p.id && <Check className="size-4 text-primary" />}
                  </button>
                ))
            )}
          </div>
        )}

        {/* Step 4: Slot */}
        {step === 3 && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-2">
              <Label>Origem do agendamento</Label>
              <Select value={source} onValueChange={(v) => setSource(v as AppointmentSource)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">Manual (balcão)</SelectItem>
                  <SelectItem value="walk_in">Walk-in</SelectItem>
                  <SelectItem value="whatsapp">WhatsApp</SelectItem>
                  <SelectItem value="web">Web</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="api">API / integração</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {isManager && (
              <div className="flex flex-col gap-2">
                <Label>Motivo do encaixe (opcional, gerente)</Label>
                <Textarea
                  placeholder="Se for encaixe fora da regra habitual, descreva o motivo (mín. 3 caracteres se preencher)."
                  value={squeezeNotes}
                  onChange={(e) => setSqueezeNotes(e.target.value)}
                  rows={2}
                />
              </div>
            )}
            <Input
              type="date"
              value={selectedDate}
              onChange={(e) => { setSelectedDate(e.target.value); setSelectedSlot(undefined); }}
            />
            {slotsLoading ? (
              <div className="grid grid-cols-3 gap-2">
                {Array.from({ length: 9 }).map((_, i) => <Skeleton key={i} className="h-9" />)}
              </div>
            ) : (
              <div className="grid max-h-52 grid-cols-3 gap-2 overflow-y-auto">
                {(slotsData ?? []).filter((s: AvailabilitySlot) => s.available !== false).map((s: AvailabilitySlot) => (
                  <button
                    key={s.starts_at}
                    type="button"
                    onClick={() => setSelectedSlot(s)}
                    className={`rounded-lg border px-2 py-2 text-sm font-medium transition-colors ${
                      selectedSlot?.starts_at === s.starts_at ? 'border-primary bg-primary text-primary-foreground' : 'hover:border-primary/50 hover:bg-muted/60'
                    }`}
                  >
                    {format(new Date(s.starts_at), 'HH:mm')}
                  </button>
                ))}
                {!slotsLoading && (slotsData?.filter((s) => s.available !== false).length ?? 0) === 0 && (
                  <p className="col-span-3 py-6 text-center text-sm text-muted-foreground">Nenhum horario disponivel nesta data.</p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="flex justify-between gap-2">
          <Button
            variant="outline"
            onClick={() => step > 0 ? setStep(step - 1) : onClose()}
          >
            {step > 0 ? 'Voltar' : 'Cancelar'}
          </Button>
          {step < 3 ? (
            <Button onClick={() => setStep(step + 1)} disabled={!canProceed}>
              Próximo
            </Button>
          ) : (
            <Button
              onClick={() => mutation.mutate()}
              disabled={
                !canProceed ||
                mutation.isPending ||
                (isManager && squeezeNotes.length > 0 && squeezeNotes.trim().length < 3)
              }
            >
              {mutation.isPending && <Loader2 className="size-4 animate-spin" />}
              <span>{mutation.isPending ? 'Confirmando...' : 'Confirmar'}</span>
            </Button>
          )}
        </div>
    </>
  );
}

export function NewAppointmentModal({ open, onClose }: Props) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        {open ? <NewAppointmentModalInner onClose={onClose} /> : null}
      </DialogContent>
    </Dialog>
  );
}
