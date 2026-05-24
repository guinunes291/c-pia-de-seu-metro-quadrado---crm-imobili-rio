import { cn } from "@/lib/utils";
import { formatTimeAgo } from "@/lib/utils";
import { StatusBadge } from "./StatusBadge";
import { LeadTemperatureBadge } from "./LeadTemperatureBadge";
import { SLAProgressBar } from "./SLAProgressBar";
import { calcLeadTemperature, calcSlaProgress } from "@shared/leadStatus";
import {
  Phone,
  MessageCircle,
  User,
  Building2,
  Clock,
  ChevronRight,
  MoreHorizontal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export interface LeadCardData {
  id: number;
  nome: string;
  telefone?: string | null;
  email?: string | null;
  status: string;
  projetoNome?: string | null;
  corretorNome?: string | null;
  origem?: string | null;
  updatedAt?: Date | string | null;
  createdAt?: Date | string | null;
  hoursInStatus?: number;
  hasUpcomingAppointment?: boolean;
}

export interface LeadCardAction {
  label: string;
  icon?: React.ReactNode;
  onClick: (lead: LeadCardData) => void;
  variant?: "default" | "destructive";
}

interface LeadCardProps {
  lead: LeadCardData;
  variant?: "compact" | "expanded" | "kanban";
  actions?: LeadCardAction[];
  primaryAction?: {
    label: string;
    icon?: React.ReactNode;
    onClick: (lead: LeadCardData) => void;
  };
  onClick?: (lead: LeadCardData) => void;
  className?: string;
}

function getHoursInStatus(updatedAt?: Date | string | null): number {
  if (!updatedAt) return 0;
  const d = typeof updatedAt === "string" ? new Date(updatedAt) : updatedAt;
  return (Date.now() - d.getTime()) / 3_600_000;
}

export function LeadCard({
  lead,
  variant = "expanded",
  actions = [],
  primaryAction,
  onClick,
  className,
}: LeadCardProps) {
  const hoursInStatus = lead.hoursInStatus ?? getHoursInStatus(lead.updatedAt);
  const temperature = calcLeadTemperature(
    lead.status,
    hoursInStatus,
    lead.hasUpcomingAppointment ?? false,
  );
  const { isBreached, isUrgent } = calcSlaProgress(lead.status, hoursInStatus);

  const phoneLink = lead.telefone
    ? `https://wa.me/55${lead.telefone.replace(/\D/g, "")}`
    : null;

  const isUrgentCard = temperature === "urgent" || isBreached;

  if (variant === "compact") {
    return (
      <div
        onClick={() => onClick?.(lead)}
        className={cn(
          "flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 transition-colors hover:bg-accent",
          isUrgentCard && "border-red-200 bg-red-50/50 dark:border-red-900/30 dark:bg-red-950/20",
          className,
        )}
      >
        <LeadTemperatureBadge temperature={temperature} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{lead.nome}</p>
          {lead.projetoNome && (
            <p className="truncate text-xs text-muted-foreground">{lead.projetoNome}</p>
          )}
        </div>
        <StatusBadge status={lead.status} />
        <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
      </div>
    );
  }

  if (variant === "kanban") {
    return (
      <div
        onClick={() => onClick?.(lead)}
        className={cn(
          "cursor-pointer rounded-lg border bg-card p-3 shadow-sm transition-all hover:shadow-md",
          isUrgentCard && "border-red-200 dark:border-red-900/40",
          className,
        )}
      >
        <div className="flex items-start justify-between gap-1">
          <p className="line-clamp-2 text-sm font-medium leading-snug">{lead.nome}</p>
          <LeadTemperatureBadge temperature={temperature} className="flex-shrink-0 mt-0.5" />
        </div>

        {lead.projetoNome && (
          <div className="mt-1.5 flex items-center gap-1 text-xs text-muted-foreground">
            <Building2 className="h-3 w-3 flex-shrink-0" />
            <span className="truncate">{lead.projetoNome}</span>
          </div>
        )}

        {lead.telefone && (
          <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
            <Phone className="h-3 w-3 flex-shrink-0" />
            <span>{lead.telefone}</span>
          </div>
        )}

        <SLAProgressBar status={lead.status} hoursInStatus={hoursInStatus} className="mt-2" />

        {(actions.length > 0 || primaryAction) && (
          <div className="mt-2 flex gap-1">
            {primaryAction && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 flex-1 text-xs"
                onClick={(e) => {
                  e.stopPropagation();
                  primaryAction.onClick(lead);
                }}
              >
                {primaryAction.icon}
                {primaryAction.label}
              </Button>
            )}
          </div>
        )}
      </div>
    );
  }

  // Default: expanded
  return (
    <div
      className={cn(
        "rounded-lg border bg-card p-4 shadow-sm transition-all hover:shadow-md",
        isUrgentCard && "border-red-200 dark:border-red-900/40",
        onClick && "cursor-pointer",
        className,
      )}
      onClick={() => onClick?.(lead)}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate font-semibold">{lead.nome}</p>
            <LeadTemperatureBadge temperature={temperature} />
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-2">
            <StatusBadge status={lead.status} />
            {lead.origem && (
              <span className="text-xs text-muted-foreground">via {lead.origem}</span>
            )}
          </div>
        </div>

        {actions.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
              <Button variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {actions.map((action) => (
                <DropdownMenuItem
                  key={action.label}
                  onClick={(e) => {
                    e.stopPropagation();
                    action.onClick(lead);
                  }}
                  className={action.variant === "destructive" ? "text-destructive" : undefined}
                >
                  {action.icon}
                  {action.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* Details */}
      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
        {lead.telefone && (
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Phone className="h-3.5 w-3.5 flex-shrink-0" />
            <span className="truncate">{lead.telefone}</span>
          </div>
        )}
        {lead.projetoNome && (
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Building2 className="h-3.5 w-3.5 flex-shrink-0" />
            <span className="truncate">{lead.projetoNome}</span>
          </div>
        )}
        {lead.corretorNome && (
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <User className="h-3.5 w-3.5 flex-shrink-0" />
            <span className="truncate">{lead.corretorNome}</span>
          </div>
        )}
        {lead.updatedAt && (
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Clock className="h-3.5 w-3.5 flex-shrink-0" />
            <span>{formatTimeAgo(lead.updatedAt)}</span>
          </div>
        )}
      </div>

      {/* SLA bar */}
      <SLAProgressBar
        status={lead.status}
        hoursInStatus={hoursInStatus}
        showLabel={isUrgent || isBreached}
        className="mt-3"
      />

      {/* Actions row */}
      {(primaryAction || phoneLink) && (
        <div className="mt-3 flex gap-2" onClick={(e) => e.stopPropagation()}>
          {phoneLink && (
            <Button
              size="sm"
              variant="outline"
              className="h-8 gap-1.5 text-xs"
              asChild
            >
              <a href={phoneLink} target="_blank" rel="noopener noreferrer">
                <MessageCircle className="h-3.5 w-3.5" />
                WhatsApp
              </a>
            </Button>
          )}
          {primaryAction && (
            <Button
              size="sm"
              variant="default"
              className="h-8 flex-1 text-xs"
              onClick={() => primaryAction.onClick(lead)}
            >
              {primaryAction.icon}
              {primaryAction.label}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
