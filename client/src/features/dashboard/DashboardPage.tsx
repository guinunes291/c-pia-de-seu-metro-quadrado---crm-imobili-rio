import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import {
  Zap, Users2, CheckSquare, Calendar, AlertTriangle,
  Phone, MessageCircle, TrendingUp, Trophy, BarChart2,
  GitBranch, BarChart3, Target, Loader2,
} from "lucide-react";
import { formatTimeAgo, getSlaStatus } from "@/lib/utils";
import { BottleneckPanel } from "@/features/dashboard/sections/BottleneckPanel";

// ============================================================================
// DASHBOARD DO CORRETOR
// ============================================================================
function DashboardCorretor() {
  const [, navigate] = useLocation();
  const { data, isLoading } = trpc.dashboard.leadsPrioritarios.useQuery(undefined, {
    refetchInterval: 30_000,
    staleTime: 0,
  });

  const urgentes = [
    ...(data?.semPrimeiroContato ?? []).map((l) => ({ ...l, tipo: "sem_contato" as const })),
    ...(data?.followUpsVencidos ?? []).map((l) => ({ ...l, tipo: "followup" as const })),
  ].slice(0, 5);

  return (
    <div className="space-y-4 max-w-3xl">
      {/* Quick actions */}
      <div className="grid grid-cols-3 gap-3">
        <Button
          variant="default"
          className="bg-amber-500 hover:bg-amber-600 text-white h-12 flex-col gap-1"
          onClick={() => navigate("/modo-blitz")}
        >
          <Zap className="h-4 w-4" />
          <span className="text-xs">Modo Blitz</span>
        </Button>
        <Button
          variant="outline"
          className="h-12 flex-col gap-1"
          onClick={() => navigate("/kanban")}
        >
          <GitBranch className="h-4 w-4" />
          <span className="text-xs">Kanban</span>
        </Button>
        <Button
          variant="outline"
          className="h-12 flex-col gap-1"
          onClick={() => navigate("/tarefas-do-dia")}
        >
          <CheckSquare className="h-4 w-4" />
          <span className="text-xs">Tarefas</span>
        </Button>
      </div>

      {/* Ações Urgentes */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-red-500" />
            Ações Urgentes
            {urgentes.length > 0 && (
              <Badge variant="destructive" className="ml-auto">{urgentes.length}</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : urgentes.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-3">
              Nenhuma ação urgente no momento 🎉
            </p>
          ) : (
            <ul className="space-y-2">
              {urgentes.map((lead) => (
                <li
                  key={`${lead.tipo}-${lead.id}`}
                  className="group flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse shrink-0" />
                  <span className="flex-1 min-w-0">
                    <span className="font-medium text-sm truncate block">{lead.nome}</span>
                    <span className="text-xs text-muted-foreground">
                      {lead.tipo === "followup" ? "Follow-up vencido" : "Sem primeiro contato"} ·{" "}
                      {"createdAt" in lead
                        ? formatTimeAgo(lead.createdAt)
                        : "status" in lead
                        ? lead.status
                        : ""}
                    </span>
                  </span>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <a
                      href={`tel:${lead.telefone}`}
                      className="p-1.5 rounded hover:bg-green-100 hover:text-green-700 transition-colors"
                      title="Ligar"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Phone className="h-3.5 w-3.5" />
                    </a>
                    <a
                      href={`https://wa.me/55${(lead.telefone ?? "").replace(/\D/g, "")}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 rounded hover:bg-green-100 hover:text-green-700 transition-colors"
                      title="WhatsApp"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <MessageCircle className="h-3.5 w-3.5" />
                    </a>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Agendamentos Hoje */}
      {(data?.agendamentosHoje ?? []).length > 0 && (
        <Card className="border-blue-200 bg-blue-50/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Calendar className="h-4 w-4 text-blue-600" />
              Agendamentos Hoje
              <Badge className="ml-auto bg-blue-100 text-blue-700 hover:bg-blue-100">
                {data!.agendamentosHoje.length}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1.5">
              {data!.agendamentosHoje.slice(0, 3).map((ag) => (
                <li key={ag.id} className="flex items-center gap-2 text-sm">
                  <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
                  <span className="font-medium truncate">{ag.leadNome}</span>
                  {ag.horaAgendamento && (
                    <span className="text-xs text-muted-foreground ml-auto shrink-0">
                      {ag.horaAgendamento}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Leads Quentes */}
      {(data?.leadsQuentes ?? []).length > 0 && (
        <Card className="border-amber-200 bg-amber-50/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Zap className="h-4 w-4 text-amber-600" />
              Leads Quentes
              <Badge className="ml-auto bg-amber-100 text-amber-700 hover:bg-amber-100">
                {data!.leadsQuentes.length}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {data!.leadsQuentes.slice(0, 4).map((lead) => (
                <li
                  key={lead.id}
                  className="group flex items-center gap-2 py-1 px-2 rounded-lg hover:bg-amber-100/60 transition-colors"
                >
                  <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
                  <span className="flex-1 min-w-0">
                    <span className="font-medium text-sm truncate block">{lead.nome}</span>
                    <span className="text-xs text-muted-foreground">{lead.status}</span>
                  </span>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <a
                      href={`tel:${lead.telefone}`}
                      className="p-1.5 rounded hover:bg-green-100 hover:text-green-700 transition-colors"
                      title="Ligar"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Phone className="h-3.5 w-3.5" />
                    </a>
                    <a
                      href={`https://wa.me/55${(lead.telefone ?? "").replace(/\D/g, "")}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 rounded hover:bg-green-100 hover:text-green-700 transition-colors"
                      title="WhatsApp"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <MessageCircle className="h-3.5 w-3.5" />
                    </a>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ============================================================================
// DASHBOARD DO GESTOR / ADMIN / SUPERINTENDENTE
// ============================================================================
function DashboardGestor() {
  const [, navigate] = useLocation();
  const { data, isLoading } = trpc.alertasGestor.lista.useQuery(undefined, {
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const followUpsCount = data?.followUpsVencidos?.length ?? 0;
  const semContatoCount = data?.leadsSemPrimeiroContato?.length ?? 0;
  const corretoresInativos = data?.corretoresSemAtividade?.length ?? 0;
  const agSemConfirmacao = data?.agendamentosSemConfirmacao?.length ?? 0;

  return (
    <div className="space-y-4 max-w-4xl">
      {/* Quick actions */}
      <div className="grid grid-cols-4 gap-3">
        <Button variant="outline" className="h-12 flex-col gap-1" onClick={() => navigate("/leads")}>
          <Users2 className="h-4 w-4" />
          <span className="text-xs">Leads</span>
        </Button>
        <Button variant="outline" className="h-12 flex-col gap-1" onClick={() => navigate("/monitoramento-followups")}>
          <Target className="h-4 w-4" />
          <span className="text-xs">Monitoramento</span>
        </Button>
        <Button variant="outline" className="h-12 flex-col gap-1" onClick={() => navigate("/relatorios")}>
          <BarChart3 className="h-4 w-4" />
          <span className="text-xs">Relatórios</span>
        </Button>
        <Button variant="outline" className="h-12 flex-col gap-1" onClick={() => navigate("/ranking-tv")}>
          <Trophy className="h-4 w-4" />
          <span className="text-xs">Ranking</span>
        </Button>
      </div>

      {/* Cards de métricas */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className={followUpsCount > 0 ? "border-red-300" : ""}>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Follow-ups vencidos</p>
            <p className={`text-2xl font-bold mt-1 ${followUpsCount > 0 ? "text-red-600" : "text-foreground"}`}>
              {isLoading ? "…" : followUpsCount}
            </p>
          </CardContent>
        </Card>
        <Card className={semContatoCount > 0 ? "border-orange-300" : ""}>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Leads sem contato</p>
            <p className={`text-2xl font-bold mt-1 ${semContatoCount > 0 ? "text-orange-600" : "text-foreground"}`}>
              {isLoading ? "…" : semContatoCount}
            </p>
          </CardContent>
        </Card>
        <Card className={corretoresInativos > 0 ? "border-yellow-300" : ""}>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Corretores inativos</p>
            <p className={`text-2xl font-bold mt-1 ${corretoresInativos > 0 ? "text-yellow-600" : "text-foreground"}`}>
              {isLoading ? "…" : corretoresInativos}
            </p>
          </CardContent>
        </Card>
        <Card className={agSemConfirmacao > 0 ? "border-blue-300" : ""}>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Ag. sem confirmação</p>
            <p className={`text-2xl font-bold mt-1 ${agSemConfirmacao > 0 ? "text-blue-600" : "text-foreground"}`}>
              {isLoading ? "…" : agSemConfirmacao}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Lista leads sem contato */}
      {semContatoCount > 0 && (
        <Card className="border-orange-200 bg-orange-50/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-orange-600" />
              Leads sem primeiro contato
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {data!.leadsSemPrimeiroContato.slice(0, 5).map((lead) => (
                <li key={lead.id} className="flex items-center gap-2 text-sm">
                  <span className="w-2 h-2 rounded-full bg-orange-500 animate-pulse shrink-0" />
                  <span className="flex-1 min-w-0">
                    <span className="font-medium truncate block">{lead.nome}</span>
                    <span className="text-xs text-muted-foreground">
                      {(lead as any).corretorNome ?? "Sem corretor"} · {formatTimeAgo(lead.createdAt)}
                    </span>
                  </span>
                  {(lead as any).origem && (
                    <Badge variant="secondary" className="text-xs shrink-0">
                      {(lead as any).origem}
                    </Badge>
                  )}
                </li>
              ))}
            </ul>
            {semContatoCount > 5 && (
              <button
                className="text-xs text-muted-foreground hover:text-foreground mt-2 transition-colors"
                onClick={() => navigate("/leads")}
              >
                Ver todos ({semContatoCount}) →
              </button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Lista follow-ups vencidos */}
      {followUpsCount > 0 && (
        <Card className="border-red-200 bg-red-50/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-600" />
              Follow-ups vencidos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {data!.followUpsVencidos.slice(0, 5).map((fu) => (
                <li key={fu.id} className="flex items-center gap-2 text-sm">
                  <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
                  <span className="flex-1 min-w-0">
                    <span className="font-medium truncate block">{fu.leadNome}</span>
                    <span className="text-xs text-muted-foreground">
                      {fu.corretorNome} · {formatTimeAgo(fu.dataFollowUp)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
            {followUpsCount > 5 && (
              <button
                className="text-xs text-muted-foreground hover:text-foreground mt-2 transition-colors"
                onClick={() => navigate("/monitoramento-followups")}
              >
                Ver todos ({followUpsCount}) →
              </button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Radar de Gargalos — SLA e leads travados no funil */}
      <BottleneckPanel />
    </div>
  );
}

// ============================================================================
// COMPONENTE RAIZ
// ============================================================================
export default function DashboardPage() {
  const { user } = useAuth();
  const isCorretor = user?.role === "corretor";

  return (
    <DashboardLayout>
      <div>
        <div className="p-4 lg:p-6 pb-2">
          <h1 className="text-xl font-bold">
            {isCorretor
              ? `Olá, ${(user?.name ?? "").split(" ")[0]}!`
              : "Painel de Controle"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {isCorretor ? "Seu resumo de hoje" : "Visão geral da equipe"}
          </p>
        </div>
        <div className="p-4 lg:p-6 pt-2">
          {isCorretor ? <DashboardCorretor /> : <DashboardGestor />}
        </div>
      </div>
    </DashboardLayout>
  );
}
