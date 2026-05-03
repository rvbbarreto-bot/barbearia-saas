import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useAuthStore } from '@/store/authStore';
import {
  claimSupportTicket,
  closeSupportTicket,
  getSupportTicket,
  sendSupportTicketMessage,
} from './conversasService';
import { handoffReasonLabel, priorityLabel, ticketStatusLabel } from './handoffLabels';

interface Props {
  ticketId: string | null;
  open: boolean;
  onClose: () => void;
}

export function HandoffTicketDrawer({ ticketId, open, onClose }: Props) {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const [messageText, setMessageText] = useState('');
  const [resolution, setResolution] = useState('');
  const [showClose, setShowClose] = useState(false);

  const inv = () => {
    qc.invalidateQueries({ queryKey: ['support-tickets'] });
    if (ticketId) qc.invalidateQueries({ queryKey: ['support-ticket', ticketId] });
  };

  const { data, isLoading } = useQuery({
    queryKey: ['support-ticket', ticketId],
    queryFn: () => getSupportTicket(ticketId!),
    enabled: open && !!ticketId,
  });

  const ticket = data?.ticket;
  const messages = data?.outbox_messages ?? [];

  const isMine = !!(user && ticket?.assigned_to_user_id && ticket.assigned_to_user_id === user.id);
  const isOpenQueue = ticket && ['open', 'in_progress', 'waiting_customer'].includes(ticket.status);

  const claimMut = useMutation({
    mutationFn: () => claimSupportTicket(ticketId!),
    onSuccess: () => {
      toast.success('Ticket assumido.');
      inv();
    },
    onError: (e: { response?: { data?: { message?: string } } }) => {
      toast.error(e.response?.data?.message ?? 'Não foi possível assumir.');
    },
  });

  const sendMut = useMutation({
    mutationFn: () => sendSupportTicketMessage(ticketId!, { text: messageText.trim() }),
    onSuccess: () => {
      toast.success('Mensagem enviada para a fila (outbox).');
      setMessageText('');
      inv();
    },
    onError: (e: { response?: { data?: { message?: string } } }) => {
      toast.error(e.response?.data?.message ?? 'Erro ao enviar.');
    },
  });

  const closeMut = useMutation({
    mutationFn: () => closeSupportTicket(ticketId!, resolution.trim()),
    onSuccess: () => {
      toast.success('Ticket encerrado; cliente notificado quando o WhatsApp estiver configurado.');
      setShowClose(false);
      setResolution('');
      inv();
      onClose();
    },
    onError: (e: { response?: { data?: { message?: string } } }) => {
      toast.error(e.response?.data?.message ?? 'Erro ao encerrar.');
    },
  });

  const canSend = messageText.trim().length >= 1 && isMine && isOpenQueue;
  const canClose = resolution.trim().length >= 3 && isMine && isOpenQueue;

  const sortedMessages = useMemo(() => [...messages].sort((a, b) => a.created_at.localeCompare(b.created_at)), [messages]);

  return (
    <Sheet
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <SheetContent className="flex w-full flex-col overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Handoff / ticket</SheetTitle>
        </SheetHeader>

        {!ticketId ? null : isLoading ? (
          <p className="px-6 text-sm text-muted-foreground">A carregar…</p>
        ) : !ticket ? (
          <p className="px-6 text-sm text-muted-foreground">Ticket não encontrado.</p>
        ) : (
          <div className="flex flex-col gap-4 px-6 pb-6">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{ticketStatusLabel(ticket.status)}</Badge>
              <Badge variant="outline">{priorityLabel(ticket.priority)}</Badge>
            </div>

            <div className="rounded-xl border bg-muted/30 p-4 text-sm">
              <InfoRow label="Cliente" value={ticket.customer_name ?? '—'} />
              <InfoRow label="Telefone" value={ticket.customer_phone ?? '—'} />
              <InfoRow label="Motivo (V4)" value={handoffReasonLabel(ticket.handoff_reason_code)} />
              <InfoRow label="Assunto" value={ticket.subject} />
              {ticket.body && <InfoRow label="Contexto" value={ticket.body} />}
              <InfoRow label="Atribuído" value={ticket.assigned_to_name ?? '—'} />
            </div>

            <div className="flex flex-col gap-2">
              <span className="text-xs font-medium uppercase text-muted-foreground">Mensagens (outbox)</span>
              <div className="max-h-52 space-y-2 overflow-y-auto rounded-md border p-3 text-xs">
                {sortedMessages.length === 0 ? (
                  <p className="text-muted-foreground">Ainda sem mensagens na fila para este ticket.</p>
                ) : (
                  sortedMessages.map((m) => {
                    const text =
                      typeof m.payload === 'object' && m.payload && 'text' in m.payload
                        ? String((m.payload as { text?: string }).text ?? '')
                        : '';
                    return (
                      <div key={m.id} className="rounded-md bg-muted/40 p-2">
                        <div className="flex justify-between gap-2 text-[10px] text-muted-foreground">
                          <span>{m.status}</span>
                          <span>{format(new Date(m.created_at), 'dd/MM HH:mm')}</span>
                        </div>
                        <p className="mt-1 whitespace-pre-wrap">{text || JSON.stringify(m.payload)}</p>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {isOpenQueue && (
              <div className="flex flex-col gap-3 border-t pt-4">
                {!isMine && (
                  <Button disabled={claimMut.isPending} onClick={() => claimMut.mutate()}>
                    {claimMut.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
                    Assumir atendimento
                  </Button>
                )}

                {isMine && (
                  <>
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="handoff-msg">Mensagem ao cliente (via outbox)</Label>
                      <Textarea
                        id="handoff-msg"
                        rows={4}
                        value={messageText}
                        onChange={(e) => setMessageText(e.target.value)}
                        placeholder="Texto enviado pelo WhatsApp quando a integração estiver ativa."
                      />
                      <Button size="sm" disabled={!canSend || sendMut.isPending} onClick={() => sendMut.mutate()}>
                        {sendMut.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
                        Enviar mensagem
                      </Button>
                    </div>

                    {!showClose ? (
                      <Button variant="outline" size="sm" onClick={() => setShowClose(true)}>
                        Encerrar com solução
                      </Button>
                    ) : (
                      <div className="flex flex-col gap-2">
                        <Label htmlFor="resolution">Motivo / solução (registado e enviado ao cliente)</Label>
                        <Textarea
                          id="resolution"
                          rows={4}
                          value={resolution}
                          onChange={(e) => setResolution(e.target.value)}
                          placeholder="Mínimo 3 caracteres — aparece no encerramento e na auditoria."
                        />
                        <div className="flex gap-2">
                          <Button variant="outline" size="sm" onClick={() => setShowClose(false)}>
                            Voltar
                          </Button>
                          <Button
                            size="sm"
                            disabled={!canClose || closeMut.isPending}
                            onClick={() => closeMut.mutate()}
                          >
                            {closeMut.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
                            Confirmar encerramento
                          </Button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        )}

        <SheetFooter className="mt-auto border-t pt-4">
          <Button variant="outline" onClick={onClose}>
            Fechar
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="mb-2 flex flex-col gap-0.5 last:mb-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  );
}
