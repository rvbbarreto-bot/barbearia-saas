import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/shared/EmptyState';
import { useTenantVertical } from '@/hooks/useTenantVertical';
import { carWashJobAction, listCarWashJobs, type CarWashJob } from './carWashService';
import { ChecklistModal } from './ChecklistModal';
import { getApiErrorMessage } from '@/lib/apiErrorMessage';
import { LayoutGrid } from 'lucide-react';

const COLUMNS: { stage: string; title: string }[] = [
  { stage: 'scheduled', title: 'Agendados' },
  { stage: 'arrived', title: 'Chegaram' },
  { stage: 'washing', title: 'Lavando' },
  { stage: 'quality_check', title: 'Conferência' },
  { stage: 'ready', title: 'Prontos' },
  { stage: 'delivered', title: 'Entregues' },
];

function JobCard({
  job,
  onAction,
  onChecklist,
}: {
  job: CarWashJob;
  onAction: (action: Parameters<typeof carWashJobAction>[1]) => void;
  onChecklist: () => void;
}) {
  const label = [job.plate, job.brand, job.model].filter(Boolean).join(' · ');
  return (
    <article className="rounded-lg border bg-card p-3 text-sm shadow-sm">
      <p className="font-semibold">{job.plate ?? 'Sem placa'}</p>
      <p className="text-muted-foreground">{label}</p>
      <p>{job.customer_name}</p>
      <p className="text-xs text-muted-foreground">{job.service_name}</p>
      <p className="text-xs">{format(new Date(job.starts_at), 'HH:mm')}</p>
      {job.professional_name && <p className="text-xs">Box: {job.professional_name}</p>}
      <div className="mt-2 flex flex-wrap gap-1">
        {job.stage === 'scheduled' && (
          <>
            <Button size="sm" variant="outline" onClick={onChecklist}>
              Checklist
            </Button>
            <Button size="sm" onClick={() => onAction('arrive')}>
              Chegou
            </Button>
          </>
        )}
        {job.stage === 'arrived' && (
          <Button size="sm" onClick={() => onAction('start')}>
            Iniciar
          </Button>
        )}
        {job.stage === 'washing' && (
          <Button size="sm" onClick={() => onAction('quality-check')}>
            Conferência
          </Button>
        )}
        {job.stage === 'quality_check' && (
          <Button size="sm" onClick={() => onAction('ready')}>
            Pronto
          </Button>
        )}
        {job.stage === 'ready' && (
          <Button size="sm" onClick={() => onAction('deliver')}>
            Entregar
          </Button>
        )}
        <Button size="sm" variant="ghost" asChild>
          <Link to={`/operacao/mensagens`}>Mensagens</Link>
        </Button>
        <Button size="sm" variant="ghost" asChild>
          <Link to={`/operacao/auditoria`}>Auditoria</Link>
        </Button>
      </div>
    </article>
  );
}

export function CarWashBoardPage() {
  const { labels } = useTenantVertical();
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [checklistJob, setChecklistJob] = useState<string | null>(null);
  const qc = useQueryClient();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['car-wash-board', date],
    queryFn: () => listCarWashJobs({ date, limit: 200 }),
  });

  const mutation = useMutation({
    mutationFn: ({ id, action }: { id: string; action: Parameters<typeof carWashJobAction>[1] }) =>
      carWashJobAction(id, action),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['car-wash-board'] });
      toast.success('Status atualizado.');
    },
    onError: (err) => toast.error(getApiErrorMessage(err, 'Não foi possível atualizar o job.')),
  });

  const byStage = useMemo(() => {
    const map: Record<string, CarWashJob[]> = {};
    for (const col of COLUMNS) map[col.stage] = [];
    for (const job of data?.data ?? []) {
      if (map[job.stage]) map[job.stage].push(job);
    }
    return map;
  }, [data]);

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{labels.patio} — Lava-rápido</h1>
          <p className="text-sm text-muted-foreground">Operação do pátio por estágio</p>
        </div>
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-auto" />
      </div>

      {isError && (
        <EmptyState
          title="Erro ao carregar o pátio"
          description="Tente novamente."
          actionLabel="Recarregar"
          onAction={() => refetch()}
        />
      )}

      {!isLoading && !isError && !(data?.data.length) && (
        <EmptyState icon={LayoutGrid} title="Nenhum job no dia" description="Crie agendamentos com veículo." />
      )}

      <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
        {COLUMNS.map((col) => (
          <section key={col.stage} className="flex flex-col gap-2" aria-label={col.title}>
            <h2 className="text-sm font-medium text-muted-foreground">{col.title}</h2>
            <div className="flex min-h-[120px] flex-col gap-2">
              {(byStage[col.stage] ?? []).map((job) => (
                <JobCard
                  key={job.id}
                  job={job}
                  onAction={(action) => mutation.mutate({ id: job.id, action })}
                  onChecklist={() => setChecklistJob(job.id)}
                />
              ))}
            </div>
          </section>
        ))}
      </div>

      {checklistJob && (
        <ChecklistModal
          open
          jobId={checklistJob}
          type="arrival"
          onClose={() => setChecklistJob(null)}
          onSaved={() => qc.invalidateQueries({ queryKey: ['car-wash-board'] })}
        />
      )}
    </div>
  );
}
