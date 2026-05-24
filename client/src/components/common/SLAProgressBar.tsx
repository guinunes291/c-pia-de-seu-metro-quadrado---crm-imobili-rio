import { cn } from "@/lib/utils";
import { calcSlaProgress } from "@shared/leadStatus";

interface SLAProgressBarProps {
  status: string;
  /** Hours since lead entered current status */
  hoursInStatus: number;
  showLabel?: boolean;
  className?: string;
}

export function SLAProgressBar({
  status,
  hoursInStatus,
  showLabel = false,
  className,
}: SLAProgressBarProps) {
  const { progress, isBreached, isUrgent } = calcSlaProgress(status, hoursInStatus);

  if (progress === 0) return null;

  const barColor = isBreached
    ? "bg-red-500"
    : isUrgent
      ? "bg-amber-400"
      : "bg-emerald-500";

  const label = isBreached
    ? "SLA expirado"
    : isUrgent
      ? "SLA urgente"
      : "No prazo";

  return (
    <div className={cn("w-full", className)}>
      {showLabel && (
        <p
          className={cn(
            "mb-0.5 text-xs",
            isBreached ? "text-red-600 dark:text-red-400" : isUrgent ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground",
          )}
        >
          {label}
        </p>
      )}
      <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full transition-all", barColor)}
          style={{ width: `${Math.min(progress, 100)}%` }}
        />
      </div>
    </div>
  );
}
