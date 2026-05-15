import { useState } from 'react';
import { getApiErrorMessage } from '@/lib/apiErrorMessage';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { Loader2 } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { AppointmentStatusBadge } from '@/components/shared/AppointmentStatusBadge';
import { useRoleGate } from '@/hooks/useRoleGate';
import { useAuthStore } from '@/store/authStore';
import { hasMinRole } from '@/lib/rbac';
import type { Appointment } from '@/types/api';
import {
  cancelAppointment,
  checkInAppointment,
  completeAppointment,
  confirmAppointment,
  getAppointmentHistory,
  getAppointmentStatusHistory,
  noShowAppointment,
  rescheduleAppointment,
  startAppointment,
} from './agendaService';

interface Props {
  appointment?: Appointment;
  onClose: () => void;
}

const SOURCE_LABEL: Record<string, string> = {
  whatsapp: 'WhatsApp',
  manual: 'Manual',
  walk_in: 'Walk-in',
  admin: 'Admin',
  web: 'Web',
  api: 'API',
};

function eventLabel(type: string): string {
  const m: Record<string, string> = {
    CREATED: 'Criado',
    CONFIRMED: 'Confirmado',
    CANCELLED: 'Cancelado',
    RESCHEDULED: 'Remarcado',
    COMPLETED: 'Concluído',
    NO_SHOW: 'No-show',
    CHECK_IN: 'Check-in',
    SERVICE_STARTED: 'Serviço iniciado',
  };
  return m[type] ?? type;
}

function AppointmentDrawerBody({
  appointment,
  onClose,
}: {
  appointment: Appointment;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const isProfessional = useRoleGate('professional');

  const canDesk =
    !!user && user.role !== 'professional' && hasMinRole(user.role, 'attendant');

  const canOperateAttendance = !!user && hasMinRole(user.role, 'attendant');

  const [cancelReason, setCancelReason] = useState('');
  const [showCancelForm, setShowCancelForm] = useState(false);
  const [noShowReason, setNoShowReason] = useState('');
  const [showNoShowForm, setShowNoShowForm] = useState(false);
  const [showRescheduleForm, setShowRescheduleForm] = useState(false);
  const [rescheduleReason, setRescheduleReason] = useState('');
  const [startsLocal, setStartsLocal] = useState(() =>
    format(new Date(appointment.starts_at), "yyyy-MM-dd'T'HH:mm"),
  );
  const [endsLocal, setEndsLocal] = useState(() =>
    format(new Date(appointment.ends_at), "yyyy-MM-dd'T'HH:mm"),
  );

  function invalidateQueriesOnly() {
    qc.invalidateQueries({ queryKey: ['appointments'] });
    qc.invalidateQueries({ queryKey: ['dashboard-today'] });
    if (appointment?.id) {
      qc.invalidateQueries({ queryKey: ['appointment-history', appointment.id] });
      qc.invalidateQueries({ queryKey: ['appointment-status-history', appointment.id] });
    }
  }

  function invalidate() {
    invalidateQueriesOnly();
    onClose();
  }

  const { data: history = [], isLoading: historyLoading } = useQuery({
    queryKey: ['appointment-history', appointment?.id],
    queryFn: () => getAppointmentHistory(appointment!.id),
    enabled: !!appointment?.id,
  });

  const { data: statusHistory = [], isLoading: statusHistoryLoading } = useQuery({
    queryKey: ['appointment-status-history', appointment?.id],
    queryFn: () => getAppointmentStatusHistory(appointment!.id),
    enabled: !!appointment?.id,
  });

  const cancelMut = useMutation({
    mutationFn: () => cancelAppointment(appointment!.id, cancelReason.trim()),
    onSuccess: () => {
      toast.success('Agendamento cancelado.');
      invalidate();
    },
    onError: (err: unknown) => toast.error(getApiErrorMessage(err, 'Erro ao cancelar.')),
  });

  const rescheduleMut = useMutation({
    mutationFn: () =>
      rescheduleAppointment(appointment!.id, {
        starts_at: new Date(startsLocal).toISOString(),
        ends_at: new Date(endsLocal).toISOString(),
        reason: rescheduleReason.trim(),
      }),
    onSuccess: () => {
      toast.success('Agendamento remarcado.');
      invalidate();
    },
    onError: (err: unknown) => toast.error(getApiErrorMessage(err, 'Erro ao remarcar.')),
  });

  const checkInMut = useMutation({
    mutationFn: () => checkInAppointment(appointment!.id),
    onSuccess: () => {
      toast.success('Check-in registado.');
      invalidateQueriesOnly();
    },
    onError: (err: unknown) => toast.error(getApiErrorMessage(err, 'Erro no check-in.')),
  });

  const startMut = useMutation({
    mutationFn: () => startAppointment(appointment!.id),
    onSuccess: () => {
      toast.success('Serviço iniciado.');
      invalidateQueriesOnly();
    },
    onError: (err: unknown) => toast.error(getApiErrorMessage(err, 'Erro ao iniciar serviço.')),
  });

  const completeMut = useMutation({
    mutationFn: () => completeAppointment(appointment!.id),
    onSuccess: () => {
      toast.success('Marcado como concluído.');
      invalidate();
    },
    onError: (err: unknown) => toast.error(getApiErrorMessage(err, 'Erro ao concluir.')),
  });

  const confirmMut = useMutation({
    mutationFn: () => confirmAppointment(appointment!.id),
    onSuccess: () => {
      toast.success('Agendamento confirmado.');
      invalidate();
    },
    onError: (err: unknown) => toast.error(getApiErrorMessage(err, 'Erro ao confirmar.')),
  });

  const noShowMut = useMutation({
    mutationFn: () => noShowAppointment(appointment!.id, noShowReason.trim()),
    onSuccess: () => {
      toast.success('No-show registrado.');
      invalidate();
    },
    onError: (err: unknown) => toast.error(getApiErrorMessage(err, 'Erro ao registrar no-show.')),
  });

  const isActive = !['cancelled', 'completed', 'no_show'].includes(appointment.status);

  const cancelOk = cancelReason.trim().length >= 3;
  const rescheduleOk =
    rescheduleReason.trim().length >= 3 &&
    startsLocal &&
    endsLocal &&
    new Date(endsLocal) > new Date(startsLocal);
  const noShowOk = noShowReason.trim().length >= 3;

  const anyPending =
    cancelMut.isPending ||
    completeMut.isPending ||
    confirmMut.isPending ||
    noShowMut.isPending ||
    rescheduleMut.isPending ||
    checkInMut.isPending ||
    startMut.isPending;

  const canCheckIn =
    canOperateAttendance &&
    (appointment.status === 'confirmed' || appointment.status === 'no_show_pending');
  const canStart = canOperateAttendance && appointment.status === 'checked_in';
  const canCompleteFlow = isProfessional && appointment.status === 'in_service';

  const canMarkNoShow =
    canDesk &&
    !['checked_in', 'in_service', 'completed', 'cancelled', 'no_show'].includes(appointment.status);

  return (
    <>
      <div className="flex flex-col gap-5 px-6 pb-8">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Status</span>
              <AppointmentStatusBadge status={appointment.status} />
            </div>

            <div className="flex flex-col gap-3 rounded-xl border bg-muted/30 p-4 text-sm">
              <InfoRow
                label="Origem"
                value={
                  SOURCE_LABEL[appointment.source ?? ''] ??
                  (appointment.source ? String(appointment.source) : '—')
                }
              />
              <InfoRow label="Cliente" value={appointment.customer_name ?? '—'} />
              <InfoRow label="Profissional" value={appointment.professional_name ?? '—'} />
              <InfoRow label="Serviço" value={appointment.service_name ?? '—'} />
              <InfoRow
                label="Início"
                value={format(new Date(appointment.starts_at), "dd/MM/yyyy 'às' HH:mm")}
              />
              <InfoRow label="Fim" value={format(new Date(appointment.ends_at), 'HH:mm')} />
              {appointment.notes && <InfoRow label="Notas" value={appointment.notes} />}
              {appointment.cancellation_reason && (
                <InfoRow label="Motivo cancel." value={appointment.cancellation_reason} />
              )}
            </div>

            <div className="flex flex-col gap-2">
              <span className="text-xs font-medium uppercase text-muted-foreground">
                Alterações de status
              </span>
              <div className="max-h-40 overflow-y-auto rounded-md border text-xs">
                {statusHistoryLoading ? (
                  <p className="p-3 text-muted-foreground">A carregar…</p>
                ) : statusHistory.length === 0 ? (
                  <p className="p-3 text-muted-foreground">Sem registos de status.</p>
                ) : (
                  <ul className="divide-y">
                    {statusHistory.map((row) => (
                      <li key={row.id} className="px-3 py-2">
                        <div className="flex justify-between gap-2 font-medium">
                          <span>
                            {row.previous_status ?? '—'} → {row.new_status}
                          </span>
                          <span className="shrink-0 text-muted-foreground">
                            {format(new Date(row.changed_at), 'dd/MM HH:mm')}
                          </span>
                        </div>
                        {row.changed_by_name && (
                          <p className="text-muted-foreground">Por {row.changed_by_name}</p>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <span className="text-xs font-medium uppercase text-muted-foreground">
                Registo de eventos
              </span>
              <div className="max-h-48 overflow-y-auto rounded-md border text-xs">
                {historyLoading ? (
                  <p className="p-3 text-muted-foreground">A carregar…</p>
                ) : history.length === 0 ? (
                  <p className="p-3 text-muted-foreground">Sem eventos registados.</p>
                ) : (
                  <ul className="divide-y">
                    {history.map((row) => (
                      <li key={row.id} className="px-3 py-2">
                        <div className="flex justify-between gap-2 font-medium">
                          <span>{eventLabel(row.event_type)}</span>
                          <span className="shrink-0 text-muted-foreground">
                            {format(new Date(row.created_at), 'dd/MM HH:mm')}
                          </span>
                        </div>
                        {row.actor_name && (
                          <p className="text-muted-foreground">Por {row.actor_name}</p>
                        )}
                        {row.payload && Object.keys(row.payload).length > 0 && (
                          <pre className="mt-1 whitespace-pre-wrap break-all text-[10px] text-muted-foreground">
                            {JSON.stringify(row.payload)}
                          </pre>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {isActive && (
              <div className="flex flex-col gap-3 border-t pt-4">
                {canDesk && appointment.status === 'awaiting_confirmation' && (
                  <Button
                    className="bg-primary text-primary-foreground hover:bg-primary/90"
                    disabled={anyPending}
                    onClick={() => confirmMut.mutate()}
                  >
                    {confirmMut.isPending && <Loader2 className="size-4 animate-spin" />}
                    Confirmar agendamento
                  </Button>
                )}
                {canCheckIn && (
                  <Button variant="secondary" disabled={anyPending} onClick={() => checkInMut.mutate()}>
                    {checkInMut.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
                    Check-in (cliente chegou)
                  </Button>
                )}
                {canStart && (
                  <Button variant="secondary" disabled={anyPending} onClick={() => startMut.mutate()}>
                    {startMut.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
                    Iniciar atendimento
                  </Button>
                )}
                {canDesk && !showCancelForm && !showRescheduleForm && (
                  <div className="flex flex-col gap-2">
                    <Button variant="outline" onClick={() => setShowRescheduleForm(true)}>
                      Remarcar
                    </Button>
                    <Button
                      variant="outline"
                      className="text-destructive hover:bg-destructive/10"
                      onClick={() => setShowCancelForm(true)}
                    >
                      Cancelar agendamento
                    </Button>
                  </div>
                )}

                {showCancelForm && canDesk && (
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="cancel-reason">Motivo do cancelamento (obrigatório)</Label>
                    <Textarea
                      id="cancel-reason"
                      placeholder="Mínimo 3 caracteres"
                      value={cancelReason}
                      onChange={(e) => setCancelReason(e.target.value)}
                    />
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => setShowCancelForm(false)}>
                        Voltar
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        disabled={!cancelOk || cancelMut.isPending}
                        onClick={() => cancelMut.mutate()}
                      >
                        {cancelMut.isPending && <Loader2 className="size-4 animate-spin" />}
                        Confirmar cancelamento
                      </Button>
                    </div>
                  </div>
                )}

                {showRescheduleForm && canDesk && (
                  <div className="flex flex-col gap-3">
                    <Label>Novo horário</Label>
                    <div className="grid grid-cols-1 gap-2">
                      <Input
                        type="datetime-local"
                        value={startsLocal}
                        onChange={(e) => setStartsLocal(e.target.value)}
                      />
                      <Input
                        type="datetime-local"
                        value={endsLocal}
                        onChange={(e) => setEndsLocal(e.target.value)}
                      />
                    </div>
                    <Label htmlFor="res-reason">Motivo da remarcação (obrigatório)</Label>
                    <Textarea
                      id="res-reason"
                      value={rescheduleReason}
                      onChange={(e) => setRescheduleReason(e.target.value)}
                      placeholder="Mínimo 3 caracteres"
                    />
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => setShowRescheduleForm(false)}>
                        Voltar
                      </Button>
                      <Button
                        size="sm"
                        disabled={!rescheduleOk || rescheduleMut.isPending}
                        onClick={() => rescheduleMut.mutate()}
                      >
                        {rescheduleMut.isPending && <Loader2 className="size-4 animate-spin" />}
                        Confirmar remarcação
                      </Button>
                    </div>
                  </div>
                )}

                {canCompleteFlow && (
                  <Button
                    variant="outline"
                    className="text-green-700 hover:bg-green-50"
                    disabled={anyPending}
                    onClick={() => completeMut.mutate()}
                  >
                    {completeMut.isPending && <Loader2 className="size-4 animate-spin" />}
                    <span>Marcar como concluído</span>
                  </Button>
                )}

                {canMarkNoShow && !showNoShowForm && (
                  <Button
                    variant="outline"
                    className="text-orange-700 hover:bg-orange-50"
                    disabled={anyPending}
                    onClick={() => setShowNoShowForm(true)}
                  >
                    Marcar no-show
                  </Button>
                )}

                {canMarkNoShow && showNoShowForm && (
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="ns-reason">Motivo do no-show (obrigatório)</Label>
                    <Textarea
                      id="ns-reason"
                      value={noShowReason}
                      onChange={(e) => setNoShowReason(e.target.value)}
                      placeholder="Mínimo 3 caracteres"
                    />
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => setShowNoShowForm(false)}>
                        Voltar
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        disabled={!noShowOk || noShowMut.isPending}
                        onClick={() => noShowMut.mutate()}
                      >
                        {noShowMut.isPending && <Loader2 className="size-4 animate-spin" />}
                        Confirmar no-show
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

      <SheetFooter className="mt-auto border-t px-6 pt-4">
        <Button variant="outline" onClick={onClose}>
          Fechar
        </Button>
      </SheetFooter>
    </>
  );
}

export function AppointmentDrawer({ appointment, onClose }: Props) {
  return (
    <Sheet open={!!appointment} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="flex w-full flex-col overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Detalhes do agendamento</SheetTitle>
        </SheetHeader>
        {appointment ? (
          <AppointmentDrawerBody key={appointment.id} appointment={appointment} onClose={onClose} />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="text-right font-medium text-foreground">{value}</span>
    </div>
  );
}
