import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Normaliza texto para busca: remove acentos, cedilha, hífens, espaços extras,
 * converte para minúsculas. Ex: "São-Paulo" → "saopaulo", "Biânca" → "bianca".
 */
export function normalizeSearch(text: string | null | undefined): string {
  return (text || "")
    .normalize("NFD")                    // decompõe caracteres acentuados
    .replace(/[\u0300-\u036f]/g, "")     // remove diacríticos (acentos, til, etc.)
    .replace(/ç/gi, "c")                 // cedilha residual
    .replace(/[^a-z0-9]/gi, "")          // remove tudo que não é letra ou dígito
    .toLowerCase();
}

/**
 * Verifica se o campo do lead corresponde ao termo de busca normalizado.
 * Funciona para nome, telefone, e-mail e qualquer campo de texto.
 */
export function matchesNormalizedSearch(
  field: string | null | undefined,
  searchNorm: string
): boolean {
  if (!searchNorm) return true;
  return normalizeSearch(field).includes(searchNorm);
}

/**
 * Formata uma data como tempo relativo em português.
 * Ex: "agora", "5min atrás", "3h atrás", "2d atrás", "15/05/2026"
 */
export function formatTimeAgo(date: Date | string | null | undefined): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "—";
  const diffMs = Date.now() - d.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return "agora";
  if (diffMin < 60) return `${diffMin}min atrás`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h atrás`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 30) return `${diffD}d atrás`;
  return d.toLocaleDateString("pt-BR");
}

/**
 * Retorna o status de SLA baseado em horas sem contato.
 * ok = < 24h, warning = 24–48h, critical = > 48h
 */
export function getSlaStatus(
  updatedAt: Date | string | null | undefined
): "ok" | "warning" | "critical" {
  if (!updatedAt) return "critical";
  const d = typeof updatedAt === "string" ? new Date(updatedAt) : updatedAt;
  const hoursAgo = (Date.now() - d.getTime()) / 3_600_000;
  if (hoursAgo < 24) return "ok";
  if (hoursAgo < 48) return "warning";
  return "critical";
}

/**
 * Calcula score de prioridade de um lead (0–100).
 * Baseado em: semContato (+40), temperatura (+30/+15), SLA (+30/+15)
 */
export function calcLeadScore(lead: {
  status?: string | null;
  temperatura?: string | null;
  updatedAt?: Date | string | null;
  semContato?: boolean;
}): number {
  let score = 0;
  if (lead.semContato) score += 40;
  if (lead.temperatura === "quente") score += 30;
  else if (lead.temperatura === "morno") score += 15;
  const sla = getSlaStatus(lead.updatedAt);
  if (sla === "critical") score += 30;
  else if (sla === "warning") score += 15;
  return Math.min(score, 100);
}
