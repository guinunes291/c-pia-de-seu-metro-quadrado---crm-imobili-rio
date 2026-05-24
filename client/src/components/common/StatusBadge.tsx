import { cn } from "@/lib/utils";
import type { LeadStatus } from "@shared/leadStatus";
import { LEAD_STATUS_LABELS } from "@shared/leadStatus";

const STATUS_STYLES: Record<string, string> = {
  novo: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  aguardando_atendimento: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  em_atendimento: "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400",
  qualificado: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  agendado: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400",
  visita_realizada: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400",
  analise_credito: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  em_analise: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  aprovado: "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400",
  contrato_assinado: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  contrato_fechado: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  perdido: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

interface StatusBadgeProps {
  status: string;
  className?: string;
  size?: "sm" | "md";
}

export function StatusBadge({ status, className, size = "sm" }: StatusBadgeProps) {
  const label = LEAD_STATUS_LABELS[status as LeadStatus] ?? status;
  const style = STATUS_STYLES[status] ?? "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300";

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full font-medium",
        size === "sm" ? "px-2 py-0.5 text-xs" : "px-2.5 py-1 text-sm",
        style,
        className,
      )}
    >
      {label}
    </span>
  );
}
