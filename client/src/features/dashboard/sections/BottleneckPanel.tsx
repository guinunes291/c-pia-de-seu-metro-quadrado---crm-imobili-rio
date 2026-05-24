import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/common";
import { EmptyState } from "@/components/common";
import { AlertTriangle, TrendingDown, Clock, Users, ArrowRight } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { LEAD_STATUS_LABELS, type LeadStatus } from "@shared/leadStatus";
import { useLocation } from "wouter";

// Etapas que importam para análise de gargalos
const FUNNEL_STAGES: LeadStatus[] = [
  "aguardando_atendimento",
  "em_atendimento",
  "agendado",
  "visita_realizada",
  "analise_credito",
];

interface StageBottleneck {
  status: LeadStatus;
  count: number;
  avgHours: number;
  slaBreached: number;
}

interface CorretorCold {
  corretorId: number;
  corretorNome: string;
  coldLeads: number;
  totalLeads: number;
}

function StageCard({ stage }: { stage: StageBottleneck }) {
  const [, setLocation] = useLocation();
  const isCritical = stage.slaBreached > 0;
  const isWarning = stage.avgHours > 24;

  return (
    <button
      onClick={() => setLocation(`/leads?status=${stage.status}`)}
      className={cn(
        "group flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-all hover:shadow-sm",
        isCritical
          ? "border-red-200 bg-red-50/50 dark:border-red-900/30 dark:bg-red-950/10"
          : isWarning
            ? "border-amber-200 bg-amber-50/50 dark:border-amber-900/30 dark:bg-amber-950/10"
            : "hover:bg-accent",
      )}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <StatusBadge status={stage.status} size="sm" />
          {isCritical && (
            <Badge variant="destructive" className="h-4 px-1.5 text-[10px]">
              {stage.slaBreached} atrasados
            </Badge>
          )}
        </div>
        <div className="mt-1.5 flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Users className="h-3 w-3" />
            {stage.count} leads
          </span>
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {stage.avgHours.toFixed(0)}h média
          </span>
        </div>
      </div>
      <ArrowRight className="h-4 w-4 flex-shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
    </button>
  );
}

interface BottleneckPanelProps {
  className?: string;
}

export function BottleneckPanel({ className }: BottleneckPanelProps) {
  const { user } = useAuth();
  const [, setLocation] = useLocation();

  const { data, isLoading } = trpc.analytics.bottlenecks?.useQuery(undefined, {
    enabled: user?.role !== "corretor",
    staleTime: 5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  }) ?? { data: null, isLoading: false };

  if (user?.role === "corretor") return null;

  return (
    <Card className={cn("", className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            Radar de Gargalos
          </CardTitle>
          {data?.totalSlaBreached ? (
            <Badge variant="destructive" className="text-xs">
              {data.totalSlaBreached} SLA expirado{data.totalSlaBreached > 1 ? "s" : ""}
            </Badge>
          ) : null}
        </div>
        <p className="text-xs text-muted-foreground">
          Etapas do funil com leads travados ou SLA vencido
        </p>
      </CardHeader>

      <CardContent className="space-y-2 pt-0">
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-14 animate-pulse rounded-lg bg-muted" />
            ))}
          </div>
        ) : !data?.stages?.length ? (
          <EmptyState
            title="Funil fluindo bem"
            description="Nenhum gargalos identificado no momento"
            className="py-6"
          />
        ) : (
          <>
            {(data.stages as StageBottleneck[]).map((stage) => (
              <StageCard key={stage.status} stage={stage} />
            ))}

            {(data.corretoresFrios as CorretorCold[])?.length > 0 && (
              <>
                <div className="pt-1">
                  <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <TrendingDown className="h-3 w-3" />
                    Corretores com leads frios
                  </p>
                  <div className="space-y-1.5">
                    {(data.corretoresFrios as CorretorCold[]).slice(0, 3).map((c) => (
                      <button
                        key={c.corretorId}
                        onClick={() => setLocation(`/leads?corretor=${c.corretorId}`)}
                        className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-accent"
                      >
                        <span className="truncate text-xs">{c.corretorNome}</span>
                        <Badge variant="secondary" className="ml-2 flex-shrink-0 text-[10px]">
                          {c.coldLeads} frios / {c.totalLeads}
                        </Badge>
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
