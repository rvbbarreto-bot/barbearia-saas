import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MessageCirclePlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DataTable, type Column } from '@/components/shared/DataTable';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import type { HandoffReasonCode, SupportTicketListRow } from '@/types/api';
import { listClientes } from '../clientes/clientesService';
import { createSupportTicket, listSupportTickets } from './conversasService';
import { HANDOFF_REASON_OPTIONS, handoffReasonLabel, priorityLabel, ticketStatusLabel } from './handoffLabels';
import { HandoffTicketDrawer } from './HandoffTicketDrawer';

/**
 * Conversas / handoff: fila `support_tickets` + ações via API (claim, outbox, encerrar com auditoria).
 */
export function ConversasPage() {
  const qc = useQueryClient();
  const [scope, setScope] = useState<'open' | 'all'>('open');
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newCustomerId, setNewCustomerId] = useState('');
  const [newSubject, setNewSubject] = useState('');
  const [newBody, setNewBody] = useState('');
  const [newReason, setNewReason] = useState<HandoffReasonCode>('ia_uncertain');

  const { data, isLoading } = useQuery({
    queryKey: ['support-tickets', scope, page],
    queryFn: () => listSupportTickets({ scope, page, limit: 20 }),
    staleTime: 10_000,
  });

  const { data: customersData } = useQuery({
    queryKey: ['clientes-handoff-pick', dialogOpen],
    queryFn: () => listClientes({ page: 1, limit: 200, search: '' }),
    enabled: dialogOpen,
    staleTime: 60_000,
  });

  const createMut = useMutation({
    mutationFn: () =>
      createSupportTicket({
        customer_id: newCustomerId,
        subject: newSubject.trim(),
        body: newBody.trim() || undefined,
        handoff_reason_code: newReason,
      }),
    onSuccess: () => {
      toast.success('Ticket criado (ex.: handoff da IA).');
      qc.invalidateQueries({ queryKey: ['support-tickets'] });
      setDialogOpen(false);
      setNewSubject('');
      setNewBody('');
      setNewCustomerId('');
      setNewReason('ia_uncertain');
    },
    onError: (e: { response?: { data?: { message?: string } } }) => {
      toast.error(e.response?.data?.message ?? 'Erro ao criar ticket.');
    },
  });

  const rows = data?.data ?? [];

  const columns: Column<SupportTicketListRow>[] = useMemo(
    () => [
      {
        key: 'customer',
        header: 'Cliente',
        cell: (r) => <span className="font-medium">{r.customer_name ?? '—'}</span>,
      },
      {
        key: 'phone',
        header: 'Telefone',
        cell: (r) => <span className="tabular-nums">{r.customer_phone ?? '—'}</span>,
      },
      {
        key: 'reason',
        header: 'Motivo',
        cell: (r) => <span>{handoffReasonLabel(r.handoff_reason_code)}</span>,
      },
      {
        key: 'priority',
        header: 'Prioridade',
        cell: (r) => priorityLabel(r.priority),
      },
      {
        key: 'last',
        header: 'Última mensagem',
        cell: (r) => (
          <span className="line-clamp-2 text-muted-foreground">
            {r.last_message_preview
              ? `${r.last_message_preview.slice(0, 80)}${r.last_message_preview.length > 80 ? '…' : ''}`
              : '—'}
          </span>
        ),
      },
      {
        key: 'status',
        header: 'Estado',
        cell: (r) => ticketStatusLabel(r.status),
      },
      {
        key: 'assignee',
        header: 'Atribuído',
        cell: (r) => r.assigned_to_name ?? '—',
      },
    ],
    [],
  );

  const createOk =
    newCustomerId.length > 0 && newSubject.trim().length >= 1 && !createMut.isPending;

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Conversas / Handoff</h1>
          <p className="text-sm text-muted-foreground">
            Fila de tickets abertos: assumir, responder pelo outbox WhatsApp e encerrar com solução (auditoria na API).
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={scope} onValueChange={(v) => setScope(v as 'open' | 'all')}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Âmbito" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="open">Só abertos / em curso</SelectItem>
              <SelectItem value="all">Todos (inclui encerrados)</SelectItem>
            </SelectContent>
          </Select>

          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="secondary" className="gap-2">
                <MessageCirclePlus className="size-4" />
                Novo ticket (handoff)
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Registar ticket de handoff</DialogTitle>
              </DialogHeader>
              <div className="flex flex-col gap-3 py-2">
                <div className="flex flex-col gap-2">
                  <Label>Cliente</Label>
                  <Select value={newCustomerId} onValueChange={setNewCustomerId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Escolher cliente" />
                    </SelectTrigger>
                    <SelectContent className="max-h-64">
                      {(customersData?.data ?? []).map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name?.trim() ? `${c.name} · ` : ''}
                          {c.phone}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-2">
                  <Label>Motivo V4</Label>
                  <Select value={newReason} onValueChange={(v) => setNewReason(v as HandoffReasonCode)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {HANDOFF_REASON_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="subj">Assunto</Label>
                  <Input id="subj" value={newSubject} onChange={(e) => setNewSubject(e.target.value)} />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="ctx">Contexto (opcional)</Label>
                  <Textarea id="ctx" rows={3} value={newBody} onChange={(e) => setNewBody(e.target.value)} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button disabled={!createOk} onClick={() => createMut.mutate()}>
                  Criar ticket
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Última mensagem: último texto na fila <code className="rounded bg-muted px-1">message_outbox</code> com{' '}
        <code className="rounded bg-muted px-1">correlation_id</code> = id do ticket.
      </p>

      <DataTable<SupportTicketListRow>
        columns={columns}
        data={rows}
        isLoading={isLoading}
        total={data?.total ?? 0}
        page={page}
        limit={20}
        onPageChange={setPage}
        emptyTitle="Nenhum ticket nesta vista"
        emptyDescription="Quando a IA ou o fluxo WhatsApp criar tickets, aparecem aqui. Pode simular com «Novo ticket»."
        onRowClick={(r) => setSelectedId(r.id)}
      />

      <HandoffTicketDrawer
        ticketId={selectedId}
        open={!!selectedId}
        onClose={() => setSelectedId(null)}
      />
    </div>
  );
}
