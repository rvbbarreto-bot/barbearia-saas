/** Chaves em `tenant_settings.settings` (jsonb) — políticas operacionais V4. */
export interface OperationalSettings {
  /** Minutos após `starts_at` sem check-in antes de marcar `no_show_pending`. */
  late_tolerance_minutes: number;
  /** Se true, permite promoção automática `no_show_pending` → `no_show` após tolerância extra (política avançada). */
  advanced_no_show_policy: boolean;
  /** Minutos após o slot + tolerância até no-show definitivo automático (só se advanced_no_show_policy). */
  auto_no_show_grace_minutes: number;
  /** Janela (dias) para contar no-shows do cliente. */
  no_show_history_window_days: number;
  /** Nº de no-shows na janela que dispara restrição. */
  no_show_threshold_for_restriction: number;
  /** Se true, após o limite marca `requires_deposit` em `customer_restrictions`. */
  auto_require_deposit_after_threshold: boolean;
  /**
   * Piloto comissão (021): só gera `commission_entries` ao concluir atendimento quando true.
   * Default false — ambientes sem migration 021 ou sem política ativa não quebram `completeAppointment`.
   */
  commission_enabled: boolean;
}

export const OPERATIONAL_SETTINGS_DEFAULTS: OperationalSettings = {
  late_tolerance_minutes: 15,
  advanced_no_show_policy: false,
  auto_no_show_grace_minutes: 90,
  no_show_history_window_days: 90,
  no_show_threshold_for_restriction: 3,
  auto_require_deposit_after_threshold: true,
  commission_enabled: false,
};
