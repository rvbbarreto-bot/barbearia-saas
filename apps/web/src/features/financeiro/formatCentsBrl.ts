/** Formatação read-only para centimos inteiros (API). */
export function formatCentsBrl(cents: number | null | undefined): string {
  if (cents == null || Number.isNaN(Number(cents))) return '—';
  return (Number(cents) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
