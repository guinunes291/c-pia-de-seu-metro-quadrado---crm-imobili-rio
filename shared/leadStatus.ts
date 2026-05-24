/**
 * Single source of truth for lead funnel stages, SLA config, and status labels.
 * Used by both client and server.
 */

export const LEAD_STATUS = [
  'novo',
  'aguardando_atendimento',
  'em_atendimento',
  'qualificado',
  'agendado',
  'visita_realizada',
  'analise_credito',
  'em_analise',
  'aprovado',
  'contrato_assinado',
  'contrato_fechado',
  'perdido',
] as const;

export type LeadStatus = (typeof LEAD_STATUS)[number];

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  novo: 'Novo',
  aguardando_atendimento: 'Aguardando',
  em_atendimento: 'Em Atendimento',
  qualificado: 'Qualificado',
  agendado: 'Agendado',
  visita_realizada: 'Visita Realizada',
  analise_credito: 'Análise de Crédito',
  em_analise: 'Em Análise',
  aprovado: 'Aprovado',
  contrato_assinado: 'Contrato Assinado',
  contrato_fechado: 'Contrato Fechado',
  perdido: 'Perdido',
};

export type LeadTemperature = 'cold' | 'warm' | 'hot' | 'urgent';

export const LEAD_TEMPERATURE_LABELS: Record<LeadTemperature, string> = {
  cold: 'Frio',
  warm: 'Morno',
  hot: 'Quente',
  urgent: 'Urgente',
};

/**
 * SLA config per status.
 * maxHours: SLA deadline (lead becomes "late")
 * urgentHours: threshold for "urgent" warning
 */
export const SLA_CONFIG: Partial<Record<LeadStatus, { maxHours: number; urgentHours: number }>> = {
  novo: { maxHours: 0.5, urgentHours: 0.17 },
  aguardando_atendimento: { maxHours: 2, urgentHours: 1 },
  em_atendimento: { maxHours: 24, urgentHours: 12 },
  agendado: { maxHours: 48, urgentHours: 24 },
  visita_realizada: { maxHours: 48, urgentHours: 24 },
  analise_credito: { maxHours: 72, urgentHours: 48 },
};

/** Terminal stages — no SLA applies */
export const TERMINAL_STATUSES: LeadStatus[] = ['contrato_fechado', 'perdido', 'contrato_assinado'];

export function isTerminalStatus(status: string): boolean {
  return TERMINAL_STATUSES.includes(status as LeadStatus);
}

/**
 * Calculate lead temperature based on hours since last contact and current status.
 */
export function calcLeadTemperature(
  status: string,
  hoursSinceLastContact: number,
  hasUpcomingAppointment: boolean,
): LeadTemperature {
  if (isTerminalStatus(status)) return 'cold';

  if (status === 'analise_credito' || status === 'visita_realizada' || status === 'aprovado') {
    return 'hot';
  }

  if (status === 'novo' || status === 'aguardando_atendimento') {
    if (hoursSinceLastContact > 2) return 'urgent';
    if (hoursSinceLastContact > 1) return 'hot';
    return 'warm';
  }

  if (hasUpcomingAppointment && hoursSinceLastContact < 24) return 'warm';
  if (hoursSinceLastContact > 72) return 'cold';
  if (hoursSinceLastContact > 48) return 'warm';
  if (hoursSinceLastContact < 4) return 'hot';

  return 'warm';
}

/**
 * Calculate SLA progress (0–100) and whether it's breached.
 */
export function calcSlaProgress(
  status: string,
  hoursSinceEntry: number,
): { progress: number; isBreached: boolean; isUrgent: boolean } {
  const sla = SLA_CONFIG[status as LeadStatus];
  if (!sla || isTerminalStatus(status)) {
    return { progress: 0, isBreached: false, isUrgent: false };
  }

  const progress = Math.min(100, (hoursSinceEntry / sla.maxHours) * 100);
  const isBreached = hoursSinceEntry >= sla.maxHours;
  const isUrgent = hoursSinceEntry >= sla.urgentHours;

  return { progress, isBreached, isUrgent };
}
