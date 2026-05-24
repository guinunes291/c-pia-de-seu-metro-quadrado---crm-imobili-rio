import { cn } from "@/lib/utils";
import type { LeadTemperature } from "@shared/leadStatus";
import { LEAD_TEMPERATURE_LABELS } from "@shared/leadStatus";
import { Flame, Thermometer, Snowflake, AlertTriangle } from "lucide-react";

const TEMPERATURE_CONFIG: Record<
  LeadTemperature,
  { icon: React.ElementType; className: string; dotClass: string }
> = {
  urgent: {
    icon: AlertTriangle,
    className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    dotClass: "bg-red-500 animate-pulse",
  },
  hot: {
    icon: Flame,
    className: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
    dotClass: "bg-orange-500",
  },
  warm: {
    icon: Thermometer,
    className: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
    dotClass: "bg-yellow-500",
  },
  cold: {
    icon: Snowflake,
    className: "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400",
    dotClass: "bg-blue-400",
  },
};

interface LeadTemperatureBadgeProps {
  temperature: LeadTemperature;
  showLabel?: boolean;
  className?: string;
}

export function LeadTemperatureBadge({
  temperature,
  showLabel = false,
  className,
}: LeadTemperatureBadgeProps) {
  const config = TEMPERATURE_CONFIG[temperature];
  const Icon = config.icon;

  return (
    <span
      title={LEAD_TEMPERATURE_LABELS[temperature]}
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-xs font-medium",
        config.className,
        className,
      )}
    >
      <Icon className="h-3 w-3" />
      {showLabel && <span>{LEAD_TEMPERATURE_LABELS[temperature]}</span>}
    </span>
  );
}
