/**
 * Lead scoring, temperature, and SLA calculation for server-side enrichment.
 * Uses shared logic from @shared/leadStatus.
 */
import { calcLeadTemperature, calcSlaProgress, type LeadTemperature } from "../shared/leadStatus";

export type { LeadTemperature };
export { calcLeadTemperature, calcSlaProgress };

interface LeadForScoring {
  status: string;
  updatedAt?: Date | null;
  createdAt?: Date | null;
  proximoAgendamento?: Date | null;
}

function getHoursSince(date?: Date | null): number {
  if (!date) return 0;
  return (Date.now() - date.getTime()) / 3_600_000;
}

export function enrichLeadWithScoring<T extends LeadForScoring>(lead: T): T & {
  temperatura: LeadTemperature;
  slaProgress: number;
  slaBreached: boolean;
  slaUrgent: boolean;
} {
  const hoursSinceContact = getHoursSince(lead.updatedAt ?? lead.createdAt);
  const hasUpcomingAppt =
    lead.proximoAgendamento != null && lead.proximoAgendamento > new Date();

  const temperatura = calcLeadTemperature(lead.status, hoursSinceContact, hasUpcomingAppt);
  const { progress, isBreached, isUrgent } = calcSlaProgress(lead.status, hoursSinceContact);

  return {
    ...lead,
    temperatura,
    slaProgress: progress,
    slaBreached: isBreached,
    slaUrgent: isUrgent,
  };
}

export function sortLeadsByPriority<T extends LeadForScoring>(leads: T[]): T[] {
  const scoreMap: Record<LeadTemperature, number> = {
    urgent: 4,
    hot: 3,
    warm: 2,
    cold: 1,
  };

  return [...leads].sort((a, b) => {
    const hoursA = getHoursSince(a.updatedAt ?? a.createdAt);
    const hoursB = getHoursSince(b.updatedAt ?? b.createdAt);
    const hasApptA = a.proximoAgendamento != null && a.proximoAgendamento > new Date();
    const hasApptB = b.proximoAgendamento != null && b.proximoAgendamento > new Date();

    const tempA = calcLeadTemperature(a.status, hoursA, hasApptA);
    const tempB = calcLeadTemperature(b.status, hoursB, hasApptB);

    const scoreDiff = scoreMap[tempB] - scoreMap[tempA];
    if (scoreDiff !== 0) return scoreDiff;

    // Tie-break: longer wait = higher priority
    return hoursB - hoursA;
  });
}
