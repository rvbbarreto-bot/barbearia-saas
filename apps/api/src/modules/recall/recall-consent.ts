/**
 * Recall promocional: exige opt-in explícito de recall (último consentimento = granted).
 */
export function blocksPromotionalRecall(
  whatsappOptOut: boolean,
  recallGranted: boolean | undefined,
): boolean {
  if (whatsappOptOut) return true;
  if (recallGranted !== true) return true;
  return false;
}
