import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ListOrdered, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { DataTable, type Column } from '@/components/shared/DataTable';
import { EmptyState } from '@/components/shared/EmptyState';
import { formatDate } from '@/lib/utils';
import type { WaitlistEntry } from '@/types/api';
import { listClientes } from '@/features/clientes/clientesService';
import { listServicos } from '@/features/servicos/servicosService';
import { listProfissionais } from '@/features/profissionais/profissionaisService';
import { getAppointment } from '@/features/agenda/agendaService';
import { cancelWaitlistEntry, convertWaitlistEntry, createWaitlistEntry, listWaitlistEntries } from './waitlistService';

const waitlistConvertUi = import.meta.env.VITE_FEATURE_WAITLIST_CONVERT_UI === 'true';

function vipBadge(r: WaitlistEntry) {
  if (!r.customer_is_vip) return <span className="text-muted-foreground text-xs">—</span>;
  return (
    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900 dark:bg-amber-950 dark:text-amber-100">
      VIP
    </span>
  );
}

const columns: Column<WaitlistEntry>[] = [
  { key: 'customer_name', header: 'Cliente', cell: (r) => r.customer_name ?? '—' },
  { key: 'customer_is_vip', header: 'VIP', cell: (r) => vipBadge(r) },
  { key: 'customer_phone', header: 'Telefone', cell: (r) => r.customer_phone ?? '—' },
  { key: 'preferred_date_from', header: 'Data desejada (de)', cell: (r) => r.preferred_date_from },
  { key: 'preferred_date_to', header: 'Até', cell: (r) => r.preferred_date_to },
  { key: 'shift_preference', header: 'Turno', cell: (r) => r.shift_preference },
  { key: 'status', header: 'Estado', cell: (r) => r.status },
  { key: 'created_at', header: 'Criado', cell: (r) => formatDate(r.created_at) },
];

export function WaitlistPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<'active' | 'cancelled' | 'converted' | 'all'>('active');
  const [filterProfId, setFilterProfId] = useState('');
  const [filterSvcId, setFilterSvcId] = useState('');
  const limit = 20;

  const { data: filterProfs } = useQuery({
    queryKey: ['waitlist-filter-profs'],
    queryFn: () => listProfissionais({ page: 1, limit: 200, search: '' }),
  });
  const { data: filterSvcs } = useQuery({
    queryKey: ['waitlist-filter-svcs'],
    queryFn: () => listServicos({ page: 1, limit: 200, search: '' }),
  });

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['waitlist', page, status, filterProfId, filterSvcId],
    queryFn: () =>
      listWaitlistEntries({
        page,
        limit,
        status,
        professional_id: filterProfId || undefined,
        service_id: filterSvcId || undefined,
      }),
  });

  const cancelMut = useMutation({
    mutationFn: (id: string) => cancelWaitlistEntry(id),
    onSuccess: () => {
      toast.success('Entrada cancelada.');
      void qc.invalidateQueries({ queryKey: ['waitlist'] });
    },
    onError: (e) => {
      toast.error((e as Error)?.message ?? 'Não foi possível cancelar.');
    },
  });

  const [open, setOpen] = useState(false);
  const [custId, setCustId] = useState('');
  const [svcId, setSvcId] = useState('');
  const [profId, setProfId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [shift, setShift] = useState<'morning' | 'afternoon' | 'evening' | 'any'>('any');

  const { data: customers } = useQuery({
    queryKey: ['waitlist-dialog-customers'],
    queryFn: () => listClientes({ page: 1, limit: 100, search: '' }),
    enabled: open,
  });
  const { data: services } = useQuery({
    queryKey: ['waitlist-dialog-services'],
    queryFn: () => listServicos({ page: 1, limit: 100, search: '' }),
    enabled: open,
  });
  const { data: profs } = useQuery({
    queryKey: ['waitlist-dialog-profs'],
    queryFn: () => listProfissionais({ page: 1, limit: 100, search: '' }),
    enabled: open,
  });

  const [convOpen, setConvOpen] = useState(false);
  const [convEntry, setConvEntry] = useState<WaitlistEntry | null>(null);
  const [convApptId, setConvApptId] = useState('');

  const convertMut = useMutation({
    mutationFn: async (vars: { entry: WaitlistEntry; appointmentId: string }) => {
      const trimmed = vars.appointmentId.trim();
      if (!/^[0-9a-f-]{36}$/i.test(trimmed)) {
        throw new Error('Indique um UUID de agendamento válido.');
      }
      const appt = await getAppointment(trimmed);
      if (appt.customer_id !== vars.entry.customer_id) {
        throw new Error('O agendamento não pertence ao mesmo cliente da fila.');
      }
      return convertWaitlistEntry(vars.entry.id, trimmed);
    },
    onSuccess: () => {
      toast.success('Entrada convertida.');
      setConvOpen(false);
      setConvEntry(null);
      setConvApptId('');
      void qc.invalidateQueries({ queryKey: ['waitlist'] });
    },
    onError: (e) => {
      toast.error((e as Error)?.message ?? 'Não foi possível converter.');
    },
  });

  const createMut = useMutation({
    mutationFn: () =>
      createWaitlistEntry({
        customer_id: custId,
        service_id: svcId,
        professional_id: profId || null,
        preferred_date_from: from,
        preferred_date_to: to,
        shift_preference: shift,
        deposit_priority: false,
      }),
    onSuccess: () => {
      toast.success('Entrada criada na fila.');
      setOpen(false);
      setCustId('');
      setSvcId('');
      setProfId('');
      setFrom('');
      setTo('');
      void qc.invalidateQueries({ queryKey: ['waitlist'] });
    },
    onError: (e) => {
      toast.error((e as Error)?.message ?? 'Erro ao criar entrada.');
    },
  });

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Lista de espera</h1>
          <p className="text-sm text-muted-foreground">Entradas ativas e histórico recente.</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <Label>Estado</Label>
            <Select
              value={status}
              onValueChange={(v) => {
                setStatus(v as typeof status);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Ativas</SelectItem>
                <SelectItem value="cancelled">Canceladas</SelectItem>
                <SelectItem value="converted">Convertidas</SelectItem>
                <SelectItem value="all">Todas</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Serviço</Label>
            <Select
              value={filterSvcId || '__all_svc__'}
              onValueChange={(v) => {
                setFilterSvcId(v === '__all_svc__' ? '' : v);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all_svc__">Todos os serviços</SelectItem>
                {(filterSvcs?.data ?? []).map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Profissional</Label>
            <Select
              value={filterProfId || '__all_prof__'}
              onValueChange={(v) => {
                setFilterProfId(v === '__all_prof__' ? '' : v);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all_prof__">Todos</SelectItem>
                {(filterProfs?.data ?? []).map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="size-4" />
                Nova entrada
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Nova entrada na fila</DialogTitle>
                <DialogDescription>Cliente, serviço e janela de datas (YYYY-MM-DD).</DialogDescription>
              </DialogHeader>
              <div className="grid gap-3 py-2">
                <div className="space-y-1">
                  <Label>Cliente</Label>
                  <Select value={custId} onValueChange={setCustId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      {(customers?.data ?? []).map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name ?? c.phone}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Serviço</Label>
                  <Select value={svcId} onValueChange={setSvcId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      {(services?.data ?? []).map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Profissional (opcional)</Label>
                  <Select value={profId || '__any__'} onValueChange={(v) => setProfId(v === '__any__' ? '' : v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Qualquer" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__any__">Qualquer</SelectItem>
                      {(profs?.data ?? []).map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label>De</Label>
                    <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label>Até</Label>
                    <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label>Turno preferido</Label>
                  <Select value={shift} onValueChange={(v) => setShift(v as typeof shift)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="morning">Manhã</SelectItem>
                      <SelectItem value="afternoon">Tarde</SelectItem>
                      <SelectItem value="evening">Noite</SelectItem>
                      <SelectItem value="any">Indiferente</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="secondary" type="button" onClick={() => setOpen(false)}>
                  Fechar
                </Button>
                <Button
                  type="button"
                  disabled={!custId || !svcId || !from || !to || createMut.isPending}
                  onClick={() => createMut.mutate()}
                >
                  {createMut.isPending ? 'A guardar…' : 'Criar'}
                </Button>
              </DialogFooter>
              {createMut.isError && (
                <p className="text-sm text-destructive">{(createMut.error as Error)?.message ?? 'Erro ao criar.'}</p>
              )}
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {isError && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {(error as Error)?.message ?? 'Erro ao carregar fila.'}
        </div>
      )}

      {!isLoading && !isError && !data?.data.length ? (
        <EmptyState icon={ListOrdered} title="Sem entradas" description="Crie uma entrada ou altere o filtro de estado." />
      ) : (
        <div className="rounded-xl border bg-card shadow-sm">
          <DataTable
            columns={[
              ...columns,
              {
                key: 'actions',
                header: '',
                cell: (r) =>
                  r.status === 'active' ? (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={cancelMut.isPending}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (window.confirm('Cancelar esta entrada?')) cancelMut.mutate(r.id);
                        }}
                      >
                        Cancelar
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        disabled={!waitlistConvertUi}
                        title={
                          waitlistConvertUi
                            ? 'Associar a um agendamento existente (mesmo cliente)'
                            : 'Defina VITE_FEATURE_WAITLIST_CONVERT_UI=true após validação QA'
                        }
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!waitlistConvertUi) return;
                          setConvEntry(r);
                          setConvApptId('');
                          setConvOpen(true);
                        }}
                      >
                        Converter
                      </Button>
                    </div>
                  ) : (
                    <span className="text-muted-foreground text-sm">—</span>
                  ),
              },
            ]}
            data={data?.data ?? []}
            isLoading={isLoading}
            total={data?.total ?? 0}
            page={page}
            limit={limit}
            onPageChange={setPage}
            emptyTitle="Sem resultados"
            emptyDescription="Tente outro filtro."
          />
        </div>
      )}

      <Dialog
        open={convOpen}
        onOpenChange={(o) => {
          setConvOpen(o);
          if (!o) {
            setConvEntry(null);
            setConvApptId('');
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Converter entrada</DialogTitle>
            <DialogDescription>
              Indique o UUID do agendamento já criado para o mesmo cliente. A API valida o cliente e regista auditoria —
              não envia WhatsApp a partir desta ação.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 py-2">
            <Label htmlFor="conv-appt">appointment_id (UUID)</Label>
            <Input
              id="conv-appt"
              value={convApptId}
              onChange={(e) => setConvApptId(e.target.value)}
              placeholder="00000000-0000-0000-0000-000000000000"
              className="font-mono text-sm"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setConvOpen(false)}>
              Fechar
            </Button>
            <Button
              type="button"
              disabled={!convEntry || !convApptId.trim() || convertMut.isPending}
              onClick={() => {
                if (!convEntry || !window.confirm('Confirmar conversão desta entrada?')) return;
                convertMut.mutate({ entry: convEntry, appointmentId: convApptId });
              }}
            >
              {convertMut.isPending ? 'A processar…' : 'Confirmar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
