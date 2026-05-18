import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AppointmentStatusBadge } from '@/components/shared/AppointmentStatusBadge';
import { SkeletonRows } from '@/components/shared/SkeletonRows';
import type { Customer } from '@/types/api';
import { createCliente, updateCliente, getClienteAppointments } from './clientesService';
import { formatDateTime } from '@/lib/utils';
import { CustomerVehiclesTab } from './CustomerVehiclesTab';
import { useTenantVertical } from '@/hooks/useTenantVertical';

const schema = z.object({
  name:             z.string().optional(),
  phone:            z.string().min(8, 'Telefone obrigatorio'),
  email:            z.string().email('Email invalido').optional().or(z.literal('')),
  whatsapp_opt_in:  z.boolean(),
});
type FormData = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onClose: () => void;
  cliente?: Customer;
}

export function ClienteDrawer({ open, onClose, cliente }: Props) {
  const qc = useQueryClient();
  const isEdit = !!cliente;
  const { labels, isCarWash } = useTenantVertical();

  const { register, handleSubmit, reset, watch, setValue, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', phone: '', email: '', whatsapp_opt_in: false },
  });

  useEffect(() => {
    if (cliente) {
      reset({ name: cliente.name ?? '', phone: cliente.phone, email: cliente.email ?? '', whatsapp_opt_in: cliente.whatsapp_opt_in });
    } else {
      reset({ name: '', phone: '', email: '', whatsapp_opt_in: false });
    }
  }, [cliente, reset]);

  const { data: histData, isLoading: histLoading } = useQuery({
    queryKey: ['cliente-history', cliente?.id],
    queryFn: () => getClienteAppointments(cliente!.id),
    enabled: !!cliente?.id,
  });

  const mutation = useMutation({
    mutationFn: (data: FormData) => {
      const body = { ...data, email: data.email || undefined, name: data.name || undefined };
      return isEdit ? updateCliente(cliente!.id, body) : createCliente({ phone: body.phone, name: body.name, email: body.email, whatsapp_opt_in: body.whatsapp_opt_in });
    },
    onSuccess: () => {
      toast.success(isEdit ? 'Cliente atualizado.' : 'Cliente criado.');
      qc.invalidateQueries({ queryKey: ['clientes'] });
      onClose();
    },
    onError: () => toast.error('Erro ao salvar cliente.'),
  });

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-full sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{isEdit ? 'Editar Cliente' : 'Novo Cliente'}</SheetTitle>
        </SheetHeader>

        <Tabs defaultValue="dados" className="flex flex-col gap-4 px-6">
          <TabsList className="w-full">
            <TabsTrigger value="dados" className="flex-1">Dados</TabsTrigger>
            {isEdit && isCarWash && (
              <TabsTrigger value="veiculos" className="flex-1">
                {labels.vehicles}
              </TabsTrigger>
            )}
            {isEdit && <TabsTrigger value="historico" className="flex-1">Historico</TabsTrigger>}
          </TabsList>

          <TabsContent value="dados">
            <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="c-phone">Telefone *</Label>
                <Input id="c-phone" {...register('phone')} aria-invalid={!!errors.phone} />
                {errors.phone && <p className="text-xs text-destructive">{errors.phone.message}</p>}
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="c-name">Nome</Label>
                <Input id="c-name" {...register('name')} />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="c-email">Email</Label>
                <Input id="c-email" type="email" {...register('email')} aria-invalid={!!errors.email} />
                {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
              </div>

              <div className="flex items-center gap-3">
                <Switch
                  id="c-whatsapp"
                  checked={watch('whatsapp_opt_in')}
                  onCheckedChange={(v) => setValue('whatsapp_opt_in', v)}
                />
                <Label htmlFor="c-whatsapp">Aceita mensagens WhatsApp</Label>
              </div>
            </form>
          </TabsContent>

          {isEdit && isCarWash && cliente && (
            <TabsContent value="veiculos">
              <CustomerVehiclesTab customerId={cliente.id} />
            </TabsContent>
          )}

          {isEdit && (
            <TabsContent value="historico" className="flex flex-col gap-2">
              {histLoading ? (
                <SkeletonRows rows={4} cols={3} />
              ) : (histData?.data.length ?? 0) === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">Nenhum agendamento encontrado.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {histData!.data.map((a) => (
                    <div key={a.id} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                      <span className="text-muted-foreground">{formatDateTime(a.starts_at)}</span>
                      <span className="font-medium">{a.professional_name ?? '—'}</span>
                      <AppointmentStatusBadge status={a.status} />
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
          )}
        </Tabs>

        <SheetFooter>
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>Cancelar</Button>
          <Button onClick={handleSubmit((d) => mutation.mutate(d))} disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="size-4 animate-spin" />}
            <span>{isSubmitting ? 'Salvando...' : 'Salvar'}</span>
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
