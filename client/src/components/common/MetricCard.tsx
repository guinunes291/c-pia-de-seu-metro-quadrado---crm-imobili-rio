import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

type MetricFormat = "currency" | "percentage" | "number";

interface MetricCardProps {
  title: string;
  value: number | string;
  icon?: React.ReactNode;
  trend?: {
    value: number;
    direction: "up" | "down" | "neutral";
    label?: string;
  };
  format?: MetricFormat;
  subtitle?: string;
  highlight?: boolean;
  loading?: boolean;
  className?: string;
}

function formatValue(value: number | string, format?: MetricFormat): string {
  if (typeof value === "string") return value;
  if (format === "currency") {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(value);
  }
  if (format === "percentage") return `${value.toFixed(1)}%`;
  return new Intl.NumberFormat("pt-BR").format(value);
}

export function MetricCard({
  title,
  value,
  icon,
  trend,
  format,
  subtitle,
  highlight = false,
  loading = false,
  className,
}: MetricCardProps) {
  const TrendIcon =
    trend?.direction === "up" ? TrendingUp : trend?.direction === "down" ? TrendingDown : Minus;

  const trendColor =
    trend?.direction === "up"
      ? "text-emerald-600 dark:text-emerald-400"
      : trend?.direction === "down"
        ? "text-red-600 dark:text-red-400"
        : "text-muted-foreground";

  if (loading) {
    return (
      <Card className={cn("animate-pulse", className)}>
        <CardContent className="p-4">
          <div className="h-4 w-24 rounded bg-muted" />
          <div className="mt-2 h-8 w-16 rounded bg-muted" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card
      className={cn(
        "transition-shadow hover:shadow-md",
        highlight && "border-primary/50 bg-primary/5",
        className,
      )}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          {icon && (
            <span className="flex-shrink-0 rounded-md p-1.5 text-muted-foreground">{icon}</span>
          )}
        </div>

        <p className={cn("mt-1 text-2xl font-bold tracking-tight", highlight && "text-primary")}>
          {formatValue(value, format)}
        </p>

        {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}

        {trend && (
          <div className={cn("mt-1.5 flex items-center gap-1 text-xs font-medium", trendColor)}>
            <TrendIcon className="h-3 w-3" />
            <span>
              {trend.value > 0 ? "+" : ""}
              {trend.value.toFixed(1)}%{trend.label && ` ${trend.label}`}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
