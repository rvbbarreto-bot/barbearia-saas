import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import type { Service } from '@/types/api';
import { createServico, updateServico } from './servicosService';

const schema = z.object({
  name:             z.string().min(2, 'Nome obrigatorio'),
  duration_minutes: z.coerce.number().int().min(1, 'Duracao invalida'),
  price_reais:      z.coerce.number().min(0, 'Preco invalido').multipleOf(0.01),
  active:           z.boolean(),
});
type FormInput  = z.input<typeof schema>;
type FormOutput = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onClose: () => void;
  servico?: Service;
}

export function ServicoDrawer({ open, onClose, servico }: Props) {
  const qc = useQueryClient();
  const isEdit = !!servico;

  const form = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', duration_minutes: 30, price_reais: 0, active: true },
  });
  const { register, handleSubmit, reset, watch, setValue, formState: { errors, isSubmitting } } = form;

  useEffect(() => {
    if (servico) {
      reset({
        name:             servico.name,
        duration_minutes: servico.duration_minutes,
        price_reais:      servico.price_cents / 100,
        active:           servico.active,
      });
    } else {
      reset({ name: '', duration_minutes: 30, price_reais: 0, active: true });
    }
  }, [servico, reset]);

  const mutation = useMutation({
    mutationFn: (data: FormOutput) => {
      const payload = {
        name:             data.name,
        duration_minutes: data.duration_minutes,
        price_cents:      Math.round(data.price_reais * 100),
        active:           data.active,
      };
      return isEdit ? updateServico(servico!.id, payload) : createServico(payload);
    },
    onSuccess: () => {
      toast.success(isEdit ? 'Servico atualizado.' : 'Servico criado.');
      qc.invalidateQueries({ queryKey: ['servicos'] });
      onClose();
    },
    onError: () => toast.error('Erro ao salvar servico.'),
  });

  const previewPrice = Number(watch('price_reais')) || 0;

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{isEdit ? 'Editar Servico' : 'Novo Servico'}</SheetTitle>
        </SheetHeader>

        <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="flex flex-col gap-4 px-6">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="s-name">Nome</Label>
            <Input id="s-name" {...register('name')} aria-invalid={!!errors.name} />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="s-duration">Duracao (minutos)</Label>
            <Input id="s-duration" type="number" min={1} {...register('duration_minutes')} aria-invalid={!!errors.duration_minutes} />
            {errors.duration_minutes && <p className="text-xs text-destructive">{errors.duration_minutes.message}</p>}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="s-price">Preco (R$)</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">R$</span>
              <Input
                id="s-price"
                type="number"
                step="0.01"
                min="0"
                placeholder="0,00"
                className="pl-9"
                {...register('price_reais')}
                aria-invalid={!!errors.price_reais}
              />
            </div>
            {errors.price_reais && <p className="text-xs text-destructive">{errors.price_reais.message}</p>}
            <p className="text-xs text-muted-foreground">
              Valor que sera cobrado:{' '}
              <strong>{previewPrice.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong>
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Switch
              id="s-active"
              checked={watch('active') as boolean}
              onCheckedChange={(v) => setValue('active', v)}
            />
            <Label htmlFor="s-active">Ativo</Label>
          </div>
        </form>

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
