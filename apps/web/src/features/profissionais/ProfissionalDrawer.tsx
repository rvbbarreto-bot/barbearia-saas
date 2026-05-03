import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Loader2, Plus } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/shared/SkeletonRows';
import type { Professional, Service } from '@/types/api';
import {
  createProfissional, updateProfissional,
  listBusinessHours, createBusinessHour,
  type BusinessHour,
} from './profissionaisService';
import { listServicos } from '../servicos/servicosService';

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'];

const schema = z.object({
  name:        z.string().min(2, 'Nome obrigatorio'),
  slug:        z.string().min(2, 'Slug obrigatorio').regex(/^[a-z0-9-]+$/, 'Apenas letras minusculas, numeros e hifens'),
  phone:       z.string().optional(),
  timezone:    z.string().min(1),
  service_ids: z.array(z.string()),
});
type FormData = z.infer<typeof schema>;

const bhSchema = z.object({
  weekday:               z.coerce.number().int().min(0).max(6),
  starts_at:             z.string().regex(/^\d{2}:\d{2}$/, 'Formato HH:MM'),
  ends_at:               z.string().regex(/^\d{2}:\d{2}$/, 'Formato HH:MM'),
  slot_interval_minutes: z.coerce.number().int().min(5),
});
type BhInput  = z.input<typeof bhSchema>;
type BhOutput = z.infer<typeof bhSchema>;

interface Props {
  open: boolean;
  onClose: () => void;
  profissional?: Professional;
}

export function ProfissionalDrawer({ open, onClose, profissional }: Props) {
  const qc = useQueryClient();
  const isEdit = !!profissional;
  const [activeTab, setActiveTab] = useState('dados');

  const { register, handleSubmit, reset, watch, setValue, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', slug: '', phone: '', timezone: 'America/Sao_Paulo', service_ids: [] },
  });

  const bhForm = useForm<BhInput, unknown, BhOutput>({
    resolver: zodResolver(bhSchema),
    defaultValues: { weekday: 1, starts_at: '08:00', ends_at: '18:00', slot_interval_minutes: 30 },
  });

  const { data: servicosData } = useQuery({
    queryKey: ['servicos', 1, ''],
    queryFn: () => listServicos({ page: 1, limit: 100, search: '' }),
    staleTime: 60_000,
  });
  const allServicos = servicosData?.data ?? [];

  const { data: businessHours, isLoading: bhLoading } = useQuery({
    queryKey: ['business-hours', profissional?.id],
    queryFn: () => listBusinessHours(profissional!.id),
    enabled: !!profissional?.id && activeTab === 'horarios',
  });

  useEffect(() => {
    if (profissional) {
      reset({
        name: profissional.name,
        slug: profissional.slug,
        phone: profissional.phone ?? '',
        timezone: profissional.timezone,
        service_ids: profissional.service_ids ?? [],
      });
    } else {
      reset({ name: '', slug: '', phone: '', timezone: 'America/Sao_Paulo', service_ids: [] });
    }
  }, [profissional, reset]);

  const mutation = useMutation({
    mutationFn: (data: FormData) =>
      isEdit ? updateProfissional(profissional!.id, data) : createProfissional(data),
    onSuccess: () => {
      toast.success(isEdit ? 'Profissional atualizado.' : 'Profissional criado.');
      qc.invalidateQueries({ queryKey: ['profissionais'] });
      onClose();
    },
    onError: () => toast.error('Erro ao salvar profissional.'),
  });

  const bhMutation = useMutation({
    mutationFn: (data: BhOutput) => createBusinessHour(profissional!.id, data),
    onSuccess: () => {
      toast.success('Horario criado.');
      qc.invalidateQueries({ queryKey: ['business-hours', profissional?.id] });
      bhForm.reset({ weekday: 1, starts_at: '08:00', ends_at: '18:00', slot_interval_minutes: 30 });
    },
    onError: () => toast.error('Erro ao criar horario.'),
  });

  function toggleService(id: string) {
    const current = watch('service_ids');
    setValue('service_ids', current.includes(id) ? current.filter((x) => x !== id) : [...current, id]);
  }

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-full sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{isEdit ? 'Editar Profissional' : 'Novo Profissional'}</SheetTitle>
        </SheetHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col gap-4 px-6">
          <TabsList className="w-full">
            <TabsTrigger value="dados" className="flex-1">Dados</TabsTrigger>
            {isEdit && <TabsTrigger value="horarios" className="flex-1">Horarios</TabsTrigger>}
          </TabsList>

          <TabsContent value="dados">
            <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="p-name">Nome</Label>
                <Input id="p-name" {...register('name')} aria-invalid={!!errors.name} />
                {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="p-slug">Slug</Label>
                <Input id="p-slug" {...register('slug')} aria-invalid={!!errors.slug} />
                {errors.slug && <p className="text-xs text-destructive">{errors.slug.message}</p>}
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="p-phone">Telefone</Label>
                <Input id="p-phone" {...register('phone')} />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label>Servicos atendidos</Label>
                <div className="flex flex-col gap-2 rounded-md border p-3">
                  {allServicos.length === 0 && <p className="text-sm text-muted-foreground">Nenhum servico disponivel.</p>}
                  {allServicos.map((s: Service) => (
                    <label key={s.id} className="flex cursor-pointer items-center gap-2 text-sm">
                      <Checkbox
                        checked={watch('service_ids').includes(s.id)}
                        onCheckedChange={() => toggleService(s.id)}
                      />
                      {s.name}
                    </label>
                  ))}
                </div>
              </div>
            </form>
          </TabsContent>

          {isEdit && (
            <TabsContent value="horarios" className="flex flex-col gap-4">
              {bhLoading ? (
                <div className="flex flex-col gap-2">
                  {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10" />)}
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {(businessHours ?? []).map((bh: BusinessHour) => (
                    <div key={bh.id} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                      <span className="font-medium">{WEEKDAYS[bh.weekday]}</span>
                      <span className="text-muted-foreground">{bh.starts_at} – {bh.ends_at}</span>
                      <span className="text-xs text-muted-foreground">{bh.slot_interval_minutes} min</span>
                    </div>
                  ))}
                  {(!businessHours || businessHours.length === 0) && (
                    <p className="py-4 text-center text-sm text-muted-foreground">Nenhum horario configurado.</p>
                  )}
                </div>
              )}

              <div className="rounded-md border p-4">
                <p className="mb-3 text-sm font-medium">Adicionar horario</p>
                <div className="flex flex-col gap-3">
                  <div className="flex gap-2">
                    <div className="flex flex-1 flex-col gap-1">
                      <Label htmlFor="bh-weekday">Dia</Label>
                      <select
                        id="bh-weekday"
                        {...bhForm.register('weekday')}
                        className="h-9 rounded-md border bg-transparent px-2 text-sm"
                      >
                        {WEEKDAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
                      </select>
                    </div>
                    <div className="flex flex-1 flex-col gap-1">
                      <Label htmlFor="bh-slot">Slot (min)</Label>
                      <Input id="bh-slot" type="number" min={5} {...bhForm.register('slot_interval_minutes')} />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <div className="flex flex-1 flex-col gap-1">
                      <Label htmlFor="bh-start">Inicio</Label>
                      <Input id="bh-start" type="time" {...bhForm.register('starts_at')} />
                    </div>
                    <div className="flex flex-1 flex-col gap-1">
                      <Label htmlFor="bh-end">Fim</Label>
                      <Input id="bh-end" type="time" {...bhForm.register('ends_at')} />
                    </div>
                  </div>
                  <Button
                    size="sm"
                    onClick={bhForm.handleSubmit((d) => bhMutation.mutate(d))}
                    disabled={bhMutation.isPending}
                  >
                    {bhMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
                    <span>Adicionar</span>
                  </Button>
                </div>
              </div>
            </TabsContent>
          )}
        </Tabs>

        <SheetFooter>
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>Cancelar</Button>
          <Button
            onClick={handleSubmit((d) => mutation.mutate(d))}
            disabled={isSubmitting || activeTab === 'horarios'}
          >
            {isSubmitting && <Loader2 className="size-4 animate-spin" />}
            <span>{isSubmitting ? 'Salvando...' : 'Salvar'}</span>
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
