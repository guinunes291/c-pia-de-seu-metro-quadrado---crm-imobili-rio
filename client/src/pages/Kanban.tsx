import { useState, useMemo } from "react";
import { normalizeSearch } from "@/lib/utils";
import { trpc } from "@/lib/trpc";
import { gerarLinkWhatsApp } from "@/lib/whatsapp";
import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Loader2, Phone, Mail, GripVertical, MessageCircle, CheckCircle2, FileCheck, FileText, Search, X, RefreshCw, CalendarCheck } from "lucide-react";
import { toast } from "sonner";
import LeadTimer from "@/components/LeadTimer";
import { TimerLead } from "@/components/TimerLead";
import { ModalRegistrarVisita } from "@/components/ModalRegistrarVisita";
import { ModalFecharContrato } from "@/components/ModalFecharContrato";
import { ModalRegistrarAnaliseCredito } from "@/components/ModalRegistrarAnaliseCredito";

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
  corretorId: number | null;
};

const todayISO = () => new Date().toISOString().split("T")[0];

export default function Kanban() {
  const { user } = useAuth();
  const utils = trpc.useUtils();

  const visibleColumns = KANBAN_COLUMNS.filter(
    col => col.id !== 'novo' && col.id !== 'aguardando_atendimento'
  );
  
  // Buscar leads separadamente por status para garantir que TODOS os leads de cada coluna apareçam
  // Cada query filtra por status no backend, evitando o problema de limit global
  const kanbanOpts = { refetchInterval: 30 * 1000, refetchOnWindowFocus: true, staleTime: 15_000 };
  const emAtendimento = trpc.leads.list.useQuery({ status: 'em_atendimento', limit: 99999 }, kanbanOpts);
  const qualificado = trpc.leads.list.useQuery({ status: 'qualificado', limit: 99999 }, kanbanOpts);
  const agendado = trpc.leads.list.useQuery({ status: 'agendado', limit: 99999 }, kanbanOpts);
  const visitaRealizada = trpc.leads.list.useQuery({ status: 'visita_realizada', limit: 99999 }, kanbanOpts);
  const propostaEnviada = trpc.leads.list.useQuery({ status: 'proposta_enviada', limit: 99999 }, kanbanOpts);
  const analiseCredito = trpc.leads.list.useQuery({ status: 'analise_credito', limit: 99999 }, kanbanOpts);
  const contratoFechado = trpc.leads.list.useQuery({ status: 'contrato_fechado', limit: 99999 }, kanbanOpts);
  const posVenda = trpc.leads.list.useQuery({ status: 'pos_venda', limit: 99999 }, kanbanOpts);
  const perdido = trpc.leads.list.useQuery({ status: 'perdido', limit: 99999 }, kanbanOpts);

  const queriesByStatus: Record<string, typeof emAtendimento> = {
    em_atendimento: emAtendimento,
    qualificado,
    agendado,
    visita_realizada: visitaRealizada,
    proposta_enviada: propostaEnviada,
    analise_credito: analiseCredito,
    contrato_fechado: contratoFechado,
    pos_venda: posVenda,
    perdido,
  };

  const isLoading = Object.values(queriesByStatus).some(q => q.isLoading);

  const refetchAll = () => utils.leads.list.invalidate();

  const updateLead = trpc.leads.update.useMutation({ onSuccess: refetchAll });

  // ── Agendamento modal ──────────────────────────────────────────────────────
  const [modalAgendarOpen, setModalAgendarOpen] = useState(false);
  const [leadAgendarSelecionado, setLeadAgendarSelecionado] = useState<Lead | null>(null);
  const [formAgendar, setFormAgendar] = useState({
    dataAgendamento: todayISO(),
    horaAgendamento: "10:00",
    projetoCustom: "",
    observacoes: "",
  });

  const criarAgendamento = trpc.agendamentos.agendamentos.create.useMutation({
    onSuccess: () => {
      const lead = leadAgendarSelecionado;
      setModalAgendarOpen(false);
      setLeadAgendarSelecionado(null);
      setFormAgendar({ dataAgendamento: todayISO(), horaAgendamento: "10:00", projetoCustom: "", observacoes: "" });
      refetchAll();
      if (lead) {
        const msg = `Oi ${lead.nome.split(" ")[0]}, confirmando sua visita para ${formAgendar.dataAgendamento.split("-").reverse().join("/")} às ${formAgendar.horaAgendamento}. Até lá! 🏠`;
        const wpp = gerarLinkWhatsApp(lead.telefone, lead.nome, msg);
        toast.success("Agendamento criado!", {
          description: "Clique para enviar confirmação pelo WhatsApp",
          action: { label: "WhatsApp", onClick: () => window.open(wpp, "_blank") },
          duration: 8000,
        });
      }
    },
    onError: (err) => toast.error(err.message || "Erro ao criar agendamento"),
  });

  const openAgendarModal = (lead: Lead) => {
    setLeadAgendarSelecionado(lead);
    setFormAgendar({ dataAgendamento: todayISO(), horaAgendamento: "10:00", projetoCustom: "", observacoes: "" });
    setModalAgendarOpen(true);
  };

  const handleSubmitAgendar = () => {
    if (!leadAgendarSelecionado) return;
    if (!formAgendar.dataAgendamento || !formAgendar.horaAgendamento) {
      toast.error("Informe data e horário");
      return;
    }
    criarAgendamento.mutate({
      leadId: leadAgendarSelecionado.id,
      dataAgendamento: formAgendar.dataAgendamento,
      horaAgendamento: formAgendar.horaAgendamento,
      projetoCustom: formAgendar.projetoCustom || undefined,
      observacoes: formAgendar.observacoes || undefined,
    });
  };

  // ── Outros modais ──────────────────────────────────────────────────────────
  const [draggedLead, setDraggedLead] = useState<Lead | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);
  const [modalVisitaOpen, setModalVisitaOpen] = useState(false);
  const [leadSelecionado, setLeadSelecionado] = useState<Lead | null>(null);
  const [modalContratoOpen, setModalContratoOpen] = useState(false);
  const [leadContratoSelecionado, setLeadContratoSelecionado] = useState<Lead | null>(null);
  const [modalAnaliseOpen, setModalAnaliseOpen] = useState(false);
  const [leadAnaliseSelecionado, setLeadAnaliseSelecionado] = useState<Lead | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const searchNorm = normalizeSearch(searchTerm);

  const allLeadsByStatus = visibleColumns.reduce((acc, column) => {
    acc[column.id] = (queriesByStatus[column.id]?.data?.leads || []) as Lead[];
    return acc;
  }, {} as Record<string, Lead[]>);

  const leadsByStatus = useMemo(() => {
    if (!searchNorm) return allLeadsByStatus;
    const matchesSearch = (lead: Lead) => {
      if (normalizeSearch(lead.nome).includes(searchNorm)) return true;
      const phoneDigits = (lead.telefone || "").replace(/\D/g, "");
      const searchDigits = searchNorm.replace(/\D/g, "");
      if (searchDigits.length >= 4 && phoneDigits.includes(searchDigits)) return true;
      if (normalizeSearch((lead as any).corretorNome).includes(searchNorm)) return true;
      if (normalizeSearch(lead.email).includes(searchNorm)) return true;
      return false;
    };
    return visibleColumns.reduce((acc, column) => {
      acc[column.id] = allLeadsByStatus[column.id].filter(matchesSearch);
      return acc;
    }, {} as Record<string, Lead[]>);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allLeadsByStatus, searchNorm]);

  const totalFound = useMemo(
    () => Object.values(leadsByStatus).flat().length,
    [leadsByStatus]
  );

  // ── Drag & Drop ────────────────────────────────────────────────────────────
  const handleDragStart = (e: React.DragEvent, lead: Lead) => {
    setDraggedLead(lead);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", lead.id.toString());
  };

  const handleDragEnd = () => { setDraggedLead(null); setDragOverColumn(null); };
  const handleDragOver = (e: React.DragEvent, columnId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverColumn(columnId);
  };
  const handleDragLeave = () => setDragOverColumn(null);

  const handleDrop = (e: React.DragEvent, newStatus: string) => {
    e.preventDefault();
    setDragOverColumn(null);
    if (!draggedLead || draggedLead.status === newStatus) { setDraggedLead(null); return; }

    if (newStatus === "agendado") {
      openAgendarModal(draggedLead);
    } else if (newStatus === "visita_realizada") {
      setLeadSelecionado(draggedLead);
      setModalVisitaOpen(true);
    } else if (newStatus === "analise_credito") {
      setLeadAnaliseSelecionado(draggedLead);
      setModalAnaliseOpen(true);
    } else if (newStatus === "contrato_fechado") {
      setLeadContratoSelecionado(draggedLead);
      setModalContratoOpen(true);
    } else {
      updateLead.mutate({
        id: draggedLead.id,
        data: { status: newStatus as "novo" | "aguardando_atendimento" | "em_atendimento" | "agendado" | "visita_realizada" | "analise_credito" | "contrato_fechado" | "perdido" },
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
              {!searchNorm && (
                <span className="ml-2 font-medium text-foreground">
                  · {Object.values(allLeadsByStatus).flat().length} leads no quadro
                </span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={refetchAll} title="Atualizar dados">
              <RefreshCw className="h-4 w-4" />
            </Button>
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
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        </div>

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
              <div className="p-3 border-b flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full ${column.color}`} />
                  <h3 className="font-semibold">{column.title}</h3>
                </div>
                <Badge variant="secondary" className="text-xs">
                  {leadsByStatus[column.id]?.length || 0}
                </Badge>
              </div>

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
                          <p className="font-medium truncate">{lead.nome}</p>

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

                          {(user?.role === 'gestor' || user?.role === 'admin' || user?.role === 'superintendente') && (lead as any).corretorNome && (
                            <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                              <span className="font-medium">Corretor:</span>
                              <span className="truncate">{(lead as any).corretorNome}</span>
                            </div>
                          )}

                          {(lead as any).faixaRenda && (
                            <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                              <span className="font-medium">Renda:</span>
                              <span className="truncate">{(lead as any).faixaRenda}</span>
                            </div>
                          )}

                          <div className="flex items-center justify-between mt-2">
                            {lead.origem && (
                              <Badge variant="outline" className="text-xs">{lead.origem}</Badge>
                            )}
                            <div className="flex flex-col gap-1 items-end w-full">
                              <LeadTimer createdAt={lead.createdAt} status={lead.status} compact showIcon />
                              <TimerLead
                                timestampRecebimento={(lead as any).timestampRecebimento}
                                timerAtivo={(lead as any).timerAtivo ?? false}
                                origem={lead.origem}
                                nomeCliente={lead.nome}
                                leadId={lead.id}
                                showProgress={true}
                                isCorretor={user?.role === 'corretor'}
                                ultimaInteracao={(lead as any).ultimaInteracao}
                              />
                            </div>
                          </div>

                          <div className="mt-2 space-y-1">
                            {/* Agendar Visita — em_atendimento e qualificado */}
                            {(column.id === 'em_atendimento' || column.id === 'qualificado') && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="w-full h-7 text-xs bg-cyan-50 hover:bg-cyan-100 border-cyan-300 text-cyan-700"
                                onClick={(e) => { e.stopPropagation(); openAgendarModal(lead); }}
                              >
                                <CalendarCheck className="h-3 w-3 mr-1" />
                                Agendar Visita
                              </Button>
                            )}

                            {/* Registrar Visita — agendado */}
                            {column.id === 'agendado' && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="w-full h-7 text-xs bg-orange-50 hover:bg-orange-100 border-orange-300 text-orange-700"
                                onClick={(e) => { e.stopPropagation(); setLeadSelecionado(lead); setModalVisitaOpen(true); }}
                              >
                                <CheckCircle2 className="h-3 w-3 mr-1" />
                                Registrar Visita
                              </Button>
                            )}

                            {/* Registrar Análise — visita_realizada */}
                            {column.id === 'visita_realizada' && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="w-full h-7 text-xs bg-purple-50 hover:bg-purple-100 border-purple-300 text-purple-700"
                                onClick={(e) => { e.stopPropagation(); setLeadAnaliseSelecionado(lead); setModalAnaliseOpen(true); }}
                              >
                                <FileText className="h-3 w-3 mr-1" />
                                Registrar Análise
                              </Button>
                            )}

                            {/* Fechar Contrato — analise_credito */}
                            {column.id === 'analise_credito' && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="w-full h-7 text-xs bg-green-50 hover:bg-green-100 border-green-300 text-green-700"
                                onClick={(e) => { e.stopPropagation(); setLeadContratoSelecionado(lead); setModalContratoOpen(true); }}
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

                {(!leadsByStatus[column.id] || leadsByStatus[column.id].length === 0) && (
                  <div className="flex items-center justify-center h-24 text-muted-foreground text-sm border-2 border-dashed rounded-lg">
                    Nenhum lead
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {updateLead.isPending && (
          <div className="fixed bottom-4 right-4 bg-primary text-primary-foreground px-4 py-2 rounded-lg shadow-lg flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Atualizando status...</span>
          </div>
        )}
      </div>

      {/* ── Modal de Agendamento de Visita ────────────────────────────────── */}
      <Dialog open={modalAgendarOpen} onOpenChange={(open) => { if (!open) { setModalAgendarOpen(false); setLeadAgendarSelecionado(null); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarCheck className="h-5 w-5 text-cyan-600" />
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
                  <Label htmlFor="data-agend">Data *</Label>
                  <Input
                    id="data-agend"
                    type="date"
                    value={formAgendar.dataAgendamento}
                    min={todayISO()}
                    onChange={(e) => setFormAgendar(f => ({ ...f, dataAgendamento: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="hora-agend">Horário *</Label>
                  <Input
                    id="hora-agend"
                    type="time"
                    value={formAgendar.horaAgendamento}
                    onChange={(e) => setFormAgendar(f => ({ ...f, horaAgendamento: e.target.value }))}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="projeto-agend">Projeto (opcional)</Label>
                <Input
                  id="projeto-agend"
                  placeholder="Ex: Residencial Park Sul"
                  value={formAgendar.projetoCustom}
                  onChange={(e) => setFormAgendar(f => ({ ...f, projetoCustom: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="obs-agend">Observações (opcional)</Label>
                <Textarea
                  id="obs-agend"
                  placeholder="Ponto de encontro, documentos necessários..."
                  value={formAgendar.observacoes}
                  onChange={(e) => setFormAgendar(f => ({ ...f, observacoes: e.target.value }))}
                  rows={3}
                />
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setModalAgendarOpen(false); setLeadAgendarSelecionado(null); }}>
              Cancelar
            </Button>
            <Button
              onClick={handleSubmitAgendar}
              disabled={criarAgendamento.isPending}
              className="bg-cyan-600 hover:bg-cyan-700"
            >
              {criarAgendamento.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CalendarCheck className="h-4 w-4 mr-2" />}
              Confirmar Agendamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de Registro de Visita */}
      {leadSelecionado && (
        <ModalRegistrarVisita
          open={modalVisitaOpen}
          onOpenChange={setModalVisitaOpen}
          leadId={leadSelecionado.id}
          leadNome={leadSelecionado.nome}
          onSuccess={refetchAll}
        />
      )}

      {/* Modal de Fechamento de Contrato */}
      {leadContratoSelecionado && (
        <ModalFecharContrato
          isOpen={modalContratoOpen}
          onClose={() => setModalContratoOpen(false)}
          leadId={leadContratoSelecionado.id}
          leadNome={leadContratoSelecionado.nome}
          onSuccess={refetchAll}
        />
      )}

      {/* Modal de Registro de Análise de Crédito */}
      {leadAnaliseSelecionado && (
        <ModalRegistrarAnaliseCredito
          open={modalAnaliseOpen}
          onClose={() => setModalAnaliseOpen(false)}
          leadId={leadAnaliseSelecionado.id}
          leadNome={leadAnaliseSelecionado.nome}
          onSuccess={refetchAll}
        />
      )}
    </DashboardLayout>
  );
}
