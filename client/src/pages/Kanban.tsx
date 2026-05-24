import { useState, useEffect, useMemo } from "react";
import { normalizeSearch } from "@/lib/utils";
import { trpc } from "@/lib/trpc";
import { gerarLinkWhatsApp } from "@/lib/whatsapp";
import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Phone, Mail, GripVertical, MessageCircle, CheckCircle2, FileCheck, FileText, Search, X, RefreshCw, CalendarPlus, Filter, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import LeadTimer from "@/components/LeadTimer";
import { TimerLead } from "@/components/TimerLead";
import { ModalRegistrarVisita } from "@/components/ModalRegistrarVisita";
import { ModalFecharContrato } from "@/components/ModalFecharContrato";
import { ModalRegistrarAnaliseCredito } from "@/components/ModalRegistrarAnaliseCredito";
import { LeadTemperatureBadge } from "@/components/common/LeadTemperatureBadge";
import { SLAProgressBar } from "@/components/common/SLAProgressBar";
import { calcLeadTemperature } from "@shared/leadStatus";

// Definição das colunas do Kanban baseadas nos status do lead
const KANBAN_COLUMNS = [
  { id: "novo", title: "Novos", color: "bg-blue-500" },
  { id: "aguardando_atendimento", title: "Aguardando", color: "bg-slate-500" },
  { id: "em_atendimento", title: "Em Atendimento", color: "bg-yellow-500" },
  { id: "qualificado", title: "Qualificado", color: "bg-teal-500" },
  { id: "agendado", title: "Agendado", color: "bg-cyan-500" },
  { id: "visita_realizada", title: "Visita Realizada", color: "bg-orange-500" },
  { id: "proposta_enviada", title: "Proposta Enviada", color: "bg-indigo-500" },
  { id: "analise_credito", title: "Análise de Crédito", color: "bg-purple-500" },
  { id: "contrato_fechado", title: "Contrato Fechado", color: "bg-green-500" },
  { id: "pos_venda", title: "Pós-venda", color: "bg-emerald-600" },
  { id: "perdido", title: "Perdidos", color: "bg-red-500" },
];

type Lead = {
  id: number;
  nome: string;
  telefone: string;
  email: string | null;
  status: string;
  origem: string | null;
  createdAt: Date;
  updatedAt: Date;
  corretorId: number | null;
};

export default function Kanban() {
  const { user } = useAuth();
  const utils = trpc.useUtils();
  
  // Kanban mostra apenas de "Em Atendimento" em diante (sem Novos e Aguardando)
  const visibleColumns = KANBAN_COLUMNS.filter(
    col => col.id !== 'novo' && col.id !== 'aguardando_atendimento'
  );
  
  // Uma única query retorna todos os leads agrupados por status (9x menos requests)
  const { data: kanbanData, isLoading } = trpc.leads.kanban.useQuery(undefined, {
    staleTime: 30 * 1000,
    refetchOnWindowFocus: true,
  });

  const refetchAll = () => {
    utils.leads.kanban.invalidate();
  };
  
  // Mutation para atualizar status do lead
  const updateLead = trpc.leads.update.useMutation({
    onSuccess: () => {
      refetchAll(); // Recarrega todos os leads após atualização
    },
  });

  // Estado para drag and drop
  const [draggedLead, setDraggedLead] = useState<Lead | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);
  
  // Estado do modal de registro de visita
  const [modalVisitaOpen, setModalVisitaOpen] = useState(false);
  const [leadSelecionado, setLeadSelecionado] = useState<Lead | null>(null);
  
  // Estado do modal de fechamento de contrato
  const [modalContratoOpen, setModalContratoOpen] = useState(false);
  const [leadContratoSelecionado, setLeadContratoSelecionado] = useState<Lead | null>(null);
  
  // Estado do modal de análise de crédito
  const [modalAnaliseOpen, setModalAnaliseOpen] = useState(false);
  const [leadAnaliseSelecionado, setLeadAnaliseSelecionado] = useState<Lead | null>(null);

  // Estado do modal de agendar visita (em_atendimento / qualificado)
  const [modalAgendarOpen, setModalAgendarOpen] = useState(false);
  const [leadAgendarSelecionado, setLeadAgendarSelecionado] = useState<Lead | null>(null);
  const [agendarData, setAgendarData] = useState("");
  const [agendarHora, setAgendarHora] = useState("");
  const [agendarProjectId, setAgendarProjectId] = useState<string>("");

  const { data: projetos } = trpc.projects.list.useQuery();

  // Filtros avançados (gestor)
  const isGestor = user?.role === 'gestor' || user?.role === 'admin' || user?.role === 'superintendente';
  const [corretorFiltroKanban, setCorretorFiltroKanban] = useState<string>("todos");
  const [projetoFiltroKanban, setProjetoFiltroKanban] = useState<string>("todos");
  const [slaFiltroKanban, setSlaFiltroKanban] = useState<boolean>(false);
  const { data: corretoresListaKanban } = trpc.corretores.list.useQuery(undefined, { enabled: isGestor });

  const criarAgendamento = trpc.agendamentos.create.useMutation({
    onSuccess: () => {
      if (leadAgendarSelecionado?.telefone) {
        const dataFmt = agendarData ? new Date(agendarData + 'T12:00:00').toLocaleDateString('pt-BR') : agendarData;
        const msg = `Oi ${leadAgendarSelecionado.nome}, confirmando sua visita para ${dataFmt} às ${agendarHora}. Até lá! 🏠`;
        const numero = leadAgendarSelecionado.telefone.replace(/\D/g, "");
        const waLink = `https://wa.me/${numero.startsWith("55") ? numero : "55" + numero}?text=${encodeURIComponent(msg)}`;
        toast.success(
          <span>
            Visita agendada!{" "}
            <a href={waLink} target="_blank" rel="noopener noreferrer" className="underline font-semibold text-green-700">
              Enviar confirmação no WhatsApp
            </a>
          </span>
        );
      } else {
        toast.success("Visita agendada com sucesso!");
      }
      setModalAgendarOpen(false);
      setLeadAgendarSelecionado(null);
      setAgendarData("");
      setAgendarHora("");
      setAgendarProjectId("");
      refetchAll();
    },
    onError: (err) => {
      toast.error(err.message || "Erro ao agendar visita");
    },
  });

  function handleSalvarAgendamento() {
    if (!leadAgendarSelecionado || !agendarData || !agendarHora) return;
    criarAgendamento.mutate({
      leadId: leadAgendarSelecionado.id,
      dataAgendamento: agendarData,
      horaAgendamento: agendarHora,
      projectId: agendarProjectId ? Number(agendarProjectId) : undefined,
    });
  }

  // Estado de busca
  const [searchTerm, setSearchTerm] = useState("");
  // Normaliza o termo de busca: remove acentos, cedilha, hífens, espaços
  const searchNorm = normalizeSearch(searchTerm);

  // Extrair leads do resultado agrupado
  const allLeadsByStatus = visibleColumns.reduce((acc, column) => {
    acc[column.id] = ((kanbanData?.[column.id] || []) as Lead[]);
    return acc;
  }, {} as Record<string, Lead[]>);

  // Filtrar leads pela busca normalizada + filtros avançados
  const leadsByStatus = useMemo(() => {
    const matchesSearch = (lead: Lead) => {
      if (!searchNorm) return true;
      if (normalizeSearch(lead.nome).includes(searchNorm)) return true;
      const phoneDigits = (lead.telefone || "").replace(/\D/g, "");
      const searchDigits = searchNorm.replace(/\D/g, "");
      if (searchDigits.length >= 4 && phoneDigits.includes(searchDigits)) return true;
      if (normalizeSearch((lead as any).corretorNome).includes(searchNorm)) return true;
      if (normalizeSearch(lead.email).includes(searchNorm)) return true;
      return false;
    };
    const matchesFilters = (lead: Lead) => {
      if (corretorFiltroKanban !== "todos" && String((lead as any).corretorId) !== corretorFiltroKanban) return false;
      if (projetoFiltroKanban !== "todos" && String((lead as any).projectId) !== projetoFiltroKanban) return false;
      if (slaFiltroKanban) {
        const hoursAgo = (Date.now() - new Date(lead.updatedAt).getTime()) / 3_600_000;
        if (hoursAgo < 48) return false;
      }
      return true;
    };
    return visibleColumns.reduce((acc, column) => {
      acc[column.id] = allLeadsByStatus[column.id].filter(l => matchesSearch(l) && matchesFilters(l));
      return acc;
    }, {} as Record<string, Lead[]>);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allLeadsByStatus, searchNorm, corretorFiltroKanban, projetoFiltroKanban, slaFiltroKanban]);

  const totalFound = useMemo(
    () => Object.values(leadsByStatus).flat().length,
    [leadsByStatus]
  );

  // Handlers de drag and drop
  const handleDragStart = (e: React.DragEvent, lead: Lead) => {
    setDraggedLead(lead);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", lead.id.toString());
  };

  const handleDragEnd = () => {
    setDraggedLead(null);
    setDragOverColumn(null);
  };

  const handleDragOver = (e: React.DragEvent, columnId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverColumn(columnId);
  };

  const handleDragLeave = () => {
    setDragOverColumn(null);
  };

  const handleDrop = (e: React.DragEvent, newStatus: string) => {
    e.preventDefault();
    setDragOverColumn(null);

    if (draggedLead && draggedLead.status !== newStatus) {
      // Verificar se o novo status exige dados adicionais
      if (newStatus === "agendado") {
        // Para agendado, impedir drag direto e mostrar toast
        toast.info("Para agendar uma visita, use o botão 'Agendar Visita' no card do lead.");
        setDraggedLead(null);
        return;
      } else if (newStatus === "visita_realizada") {
        // Abrir modal de registro de visita
        setLeadSelecionado(draggedLead);
        setModalVisitaOpen(true);
        setDraggedLead(null);
        return;
      } else if (newStatus === "analise_credito") {
        // Abrir modal de registro de análise de crédito
        setLeadAnaliseSelecionado(draggedLead);
        setModalAnaliseOpen(true);
        setDraggedLead(null);
        return;
      } else if (newStatus === "contrato_fechado") {
        // Abrir modal de fechamento de contrato
        setLeadContratoSelecionado(draggedLead);
        setModalContratoOpen(true);
        setDraggedLead(null);
        return;
      }

      // Para outros status, atualizar diretamente
      updateLead.mutate({
        id: draggedLead.id,
        data: {
          status: newStatus as "novo" | "aguardando_atendimento" | "em_atendimento" | "qualificado" | "agendado" | "visita_realizada" | "proposta_enviada" | "analise_credito" | "contrato_fechado" | "pos_venda" | "perdido",
        }
      });
    }
    setDraggedLead(null);
  };

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">Kanban de Leads</h1>
            <p className="text-muted-foreground mt-1">
              Arraste os leads entre as colunas para atualizar o status
              {totalFound > 0 && !searchNorm && (
                <span className="ml-2 font-medium text-foreground">
                  · {Object.values(allLeadsByStatus).flat().length} leads no quadro
                </span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={refetchAll}
              title="Atualizar dados"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
            {/* Campo de busca */}
            <div className="relative w-full sm:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Buscar por nome, telefone ou corretor..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 pr-9"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label="Limpar busca"
              >
                <X className="h-4 w-4" />
              </button>
            )}
            </div>
          </div>
        </div>

        {/* Filtros avançados para gestor */}
        {isGestor && (
          <div className="flex flex-wrap items-end gap-3 p-3 rounded-lg border border-dashed bg-muted/20">
            <div className="flex items-center gap-1 text-xs text-muted-foreground mr-1">
              <Filter className="h-3.5 w-3.5" />
              <span>Filtros</span>
            </div>
            {/* Filtro por corretor */}
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Corretor</Label>
              <Select value={corretorFiltroKanban} onValueChange={setCorretorFiltroKanban}>
                <SelectTrigger className="h-8 text-xs w-44">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os corretores</SelectItem>
                  {(corretoresListaKanban || []).map((c: any) => (
                    <SelectItem key={c.id} value={String(c.id)}>{c.nome || c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {/* Filtro por projeto */}
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Projeto</Label>
              <Select value={projetoFiltroKanban} onValueChange={setProjetoFiltroKanban}>
                <SelectTrigger className="h-8 text-xs w-44">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os projetos</SelectItem>
                  {(projetos || []).map((p: any) => (
                    <SelectItem key={p.id} value={String(p.id)}>{p.nome || p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {/* Filtro SLA crítico */}
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">SLA</Label>
              <button
                onClick={() => setSlaFiltroKanban(!slaFiltroKanban)}
                className={`flex items-center gap-1.5 h-8 px-3 rounded-md border text-xs font-medium transition-colors ${
                  slaFiltroKanban
                    ? "bg-red-500/10 border-red-500 text-red-600"
                    : "bg-muted border-border text-muted-foreground hover:bg-muted/80"
                }`}
              >
                <AlertTriangle className="h-3.5 w-3.5" />
                SLA crítico (&gt;48h)
              </button>
            </div>
            {/* Limpar filtros */}
            {(corretorFiltroKanban !== "todos" || projetoFiltroKanban !== "todos" || slaFiltroKanban) && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs text-muted-foreground self-end"
                onClick={() => {
                  setCorretorFiltroKanban("todos");
                  setProjetoFiltroKanban("todos");
                  setSlaFiltroKanban(false);
                }}
              >
                <X className="h-3.5 w-3.5 mr-1" />
                Limpar
              </Button>
            )}
          </div>
        )}

        {/* Resultado da busca */}
        {searchNorm && (
          <div className="text-sm">
            {totalFound === 0
              ? <span className="text-destructive">Nenhum lead encontrado para "{searchTerm}"</span>
              : <span className="text-muted-foreground"><strong className="text-foreground">{totalFound}</strong> lead(s) encontrado(s) para "{searchTerm}"</span>
            }
          </div>
        )}

        {/* Kanban Board */}
        <div className="flex gap-4 overflow-x-auto pb-4">
          {visibleColumns.map((column) => (
            <div
              key={column.id}
              className={`flex-shrink-0 w-80 rounded-lg border bg-muted/30 transition-colors ${
                dragOverColumn === column.id ? "ring-2 ring-primary bg-primary/5" : ""
              }`}
              onDragOver={(e) => handleDragOver(e, column.id)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, column.id)}
            >
              {/* Column Header */}
              <div className="p-3 border-b flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full ${column.color}`} />
                  <h3 className="font-semibold">{column.title}</h3>
                </div>
                <Badge variant="secondary" className="text-xs">
                  {leadsByStatus[column.id]?.length || 0}
                </Badge>
              </div>

              {/* Column Content */}
              <div className="p-2 space-y-2 min-h-[400px] max-h-[calc(100vh-300px)] overflow-y-auto">
                {leadsByStatus[column.id]?.map((lead: Lead) => (
                  <Card
                    key={lead.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, lead)}
                    onDragEnd={handleDragEnd}
                    className={`cursor-grab active:cursor-grabbing transition-all hover:shadow-md ${
                      draggedLead?.id === lead.id ? "opacity-50 scale-95" : ""
                    }`}
                  >
                    <CardContent className="p-3">
                      <div className="flex items-start gap-2">
                        <GripVertical className="h-4 w-4 text-muted-foreground mt-1 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <p className="font-medium truncate flex-1">{lead.nome}</p>
                            {(() => {
                              const hoursInStatus = (Date.now() - new Date(lead.updatedAt).getTime()) / 3_600_000;
                              const temp = calcLeadTemperature(lead.status, hoursInStatus, false);
                              return <LeadTemperatureBadge temperature={temp} className="flex-shrink-0" />;
                            })()}
                          </div>
                          {(() => {
                            const hoursInStatus = (Date.now() - new Date(lead.updatedAt).getTime()) / 3_600_000;
                            return <SLAProgressBar status={lead.status} hoursInStatus={hoursInStatus} className="mb-1" />;
                          })()}
                          
                          {lead.telefone && (
                            <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                              <Phone className="h-3 w-3" />
                              <span className="truncate">{lead.telefone}</span>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-5 w-5 p-0 ml-1 bg-green-50 hover:bg-green-100 text-green-700"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  window.open(gerarLinkWhatsApp(lead.telefone, lead.nome), '_blank');
                                }}
                              >
                                <MessageCircle className="h-3 w-3" />
                              </Button>
                            </div>
                          )}
                          
                          {lead.email && (
                            <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                              <Mail className="h-3 w-3" />
                              <span className="truncate">{lead.email}</span>
                            </div>
                          )}
                          
                          {(user?.role === 'gestor' || user?.role === 'admin' || user?.role === 'superintendente') && lead.corretorNome && (
                            <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                              <span className="font-medium">Corretor:</span>
                              <span className="truncate">{lead.corretorNome}</span>
                            </div>
                          )}
                          
                          {lead.faixaRenda && (
                            <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                              <span className="font-medium">Renda:</span>
                              <span className="truncate">{lead.faixaRenda}</span>
                            </div>
                          )}

                          <div className="flex items-center justify-between mt-2">
                            {lead.origem && (
                              <Badge variant="outline" className="text-xs">
                                {lead.origem}
                              </Badge>
                            )}
                            <div className="flex flex-col gap-1 items-end w-full">
                              <LeadTimer createdAt={lead.createdAt} status={lead.status} compact showIcon />
                              <TimerLead 
                                timestampRecebimento={lead.timestampRecebimento} 
                                timerAtivo={lead.timerAtivo ?? false}
                                origem={lead.origem}
                                nomeCliente={lead.nome}
                                leadId={lead.id}
                                showProgress={true}
                                isCorretor={user?.role === 'corretor'}
                                ultimaInteracao={(lead as any).ultimaInteracao}
                              />
                            </div>
                          </div>
                          
                          <div className="mt-2 space-y-2">
                            {/* Botão Agendar Visita para leads em atendimento ou qualificados */}
                            {(column.id === 'em_atendimento' || column.id === 'qualificado') && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="w-full mt-2 h-7 text-xs bg-cyan-50 hover:bg-cyan-100 border-cyan-300 text-cyan-700"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setLeadAgendarSelecionado(lead);
                                  setAgendarData("");
                                  setAgendarHora("");
                                  setAgendarProjectId("");
                                  setModalAgendarOpen(true);
                                }}
                              >
                                <CalendarPlus className="h-3 w-3 mr-1" />
                                Agendar Visita
                              </Button>
                            )}

                            {/* Botão Registrar Visita apenas para leads agendados */}
                            {column.id === 'agendado' && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="w-full mt-2 h-7 text-xs bg-orange-50 hover:bg-orange-100 border-orange-300 text-orange-700"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setLeadSelecionado(lead);
                                  setModalVisitaOpen(true);
                                }}
                              >
                                <CheckCircle2 className="h-3 w-3 mr-1" />
                                Registrar Visita
                              </Button>
                            )}
                            
                            {/* Botão Registrar Análise para leads em visita realizada */}
                            {column.id === 'visita_realizada' && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="w-full mt-2 h-7 text-xs bg-purple-50 hover:bg-purple-100 border-purple-300 text-purple-700"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setLeadAnaliseSelecionado(lead);
                                  setModalAnaliseOpen(true);
                                }}
                              >
                                <FileText className="h-3 w-3 mr-1" />
                                Registrar Análise
                              </Button>
                            )}
                            
                            {/* Botão Fechar Contrato para leads em análise de crédito */}
                            {column.id === 'analise_credito' && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="w-full mt-2 h-7 text-xs bg-green-50 hover:bg-green-100 border-green-300 text-green-700"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setLeadContratoSelecionado(lead);
                                  setModalContratoOpen(true);
                                }}
                              >
                                <FileCheck className="h-3 w-3 mr-1" />
                                Fechar Contrato
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}

                {/* Empty state */}
                {(!leadsByStatus[column.id] || leadsByStatus[column.id].length === 0) && (
                  <div className="flex items-center justify-center h-24 text-muted-foreground text-sm border-2 border-dashed rounded-lg">
                    Nenhum lead
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Loading indicator for status update */}
        {updateLead.isPending && (
          <div className="fixed bottom-4 right-4 bg-primary text-primary-foreground px-4 py-2 rounded-lg shadow-lg flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Atualizando status...</span>
          </div>
        )}
      </div>
      
      {/* Modal de Registro de Visita */}
      {leadSelecionado && (
        <ModalRegistrarVisita
          open={modalVisitaOpen}
          onOpenChange={setModalVisitaOpen}
          leadId={leadSelecionado.id}
          leadNome={leadSelecionado.nome}
          onSuccess={() => {
            refetchAll(); // Recarregar leads após registrar visita
          }}
        />
      )}
      
      {/* Modal de Fechamento de Contrato */}
      {leadContratoSelecionado && (
        <ModalFecharContrato
          isOpen={modalContratoOpen}
          onClose={() => setModalContratoOpen(false)}
          leadId={leadContratoSelecionado.id}
          leadNome={leadContratoSelecionado.nome}
          onSuccess={() => {
            refetchAll(); // Recarregar leads após fechar contrato
          }}
        />
      )}
      
      {/* Modal de Registro de Análise de Crédito */}
      {leadAnaliseSelecionado && (
        <ModalRegistrarAnaliseCredito
          open={modalAnaliseOpen}
          onClose={() => setModalAnaliseOpen(false)}
          leadId={leadAnaliseSelecionado.id}
          leadNome={leadAnaliseSelecionado.nome}
          onSuccess={() => {
            refetchAll();
          }}
        />
      )}

      {/* Modal de Agendamento de Visita */}
      <Dialog open={modalAgendarOpen} onOpenChange={(open) => { if (!open) { setModalAgendarOpen(false); setLeadAgendarSelecionado(null); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarPlus className="h-5 w-5 text-cyan-600" />
              Agendar Visita
            </DialogTitle>
          </DialogHeader>
          {leadAgendarSelecionado && (
            <div className="space-y-4 py-2">
              <p className="text-sm text-muted-foreground">
                Agendando visita para <strong>{leadAgendarSelecionado.nome}</strong>
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="agendar-data">Data *</Label>
                  <Input
                    id="agendar-data"
                    type="date"
                    value={agendarData}
                    onChange={(e) => setAgendarData(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="agendar-hora">Hora *</Label>
                  <Input
                    id="agendar-hora"
                    type="time"
                    value={agendarHora}
                    onChange={(e) => setAgendarHora(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="agendar-projeto">Empreendimento</Label>
                <Select value={agendarProjectId} onValueChange={setAgendarProjectId}>
                  <SelectTrigger id="agendar-projeto">
                    <SelectValue placeholder="Selecione (opcional)" />
                  </SelectTrigger>
                  <SelectContent>
                    {projetos?.map((p: any) => (
                      <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalAgendarOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleSalvarAgendamento}
              disabled={!agendarData || !agendarHora || criarAgendamento.isPending}
              className="bg-cyan-600 hover:bg-cyan-700"
            >
              {criarAgendamento.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <CalendarPlus className="h-4 w-4 mr-2" />
              )}
              Confirmar Agendamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
