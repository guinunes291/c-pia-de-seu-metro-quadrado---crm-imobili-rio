import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Trophy, Swords, Target, Calendar, Gift, Star, ChevronUp, ChevronDown, Minus, Users, Shuffle, Settings, Award } from "lucide-react";
import { toast } from "sonner";

// ─── Tipos ───────────────────────────────────────────────────────────────────
interface Selecao { id: number; nome: string; bandeira: string; }
interface Fase { id: number; nome: string; ordem: number; semanaInicio: string | null; semanaFim: string | null; }
interface Confronto { id: number; faseId: number; corretorAId: number | null; corretorBId: number | null; vencedorId: number | null; }
interface CorretorCopa { corretorId: number; nome: string; selecaoId: number | null; }
interface CorretorDisponivel { id: number; nome: string; role: string; naCopa: boolean; }
interface ConfigPonto { chave: string; label: string; pontos: number; }
interface ConfigPremio { id: number; posicao: string; descricao: string; valor: string; icone: string; ordem: number; }
interface RankingItem {
  posicao: number; corretorId: number; nome: string;
  selecao: Selecao | null;
  totalAgendamentos: number; totalVisitas: number; totalDocumentacao: number; totalVendas: number; totalPontos: number;
}

// ─── Constantes ──────────────────────────────────────────────────────────────
const PONTUACAO_DEFAULT = { agendamentos: 25, visitas: 40, documentacao: 60, vendas: 150 };

const SEMANAS = [
  { semana: 1, periodo: "03/06 – 08/06", fase: "Fase de Grupos" },
  { semana: 2, periodo: "09/06 – 15/06", fase: "Fase de Grupos" },
  { semana: 3, periodo: "16/06 – 22/06", fase: "Fase de Grupos" },
  { semana: 4, periodo: "23/06 – 29/06", fase: "Oitavas de Final" },
  { semana: 5, periodo: "30/06 – 06/07", fase: "Quartas de Final" },
  { semana: 6, periodo: "07/07 – 13/07", fase: "Semifinal" },
  { semana: 7, periodo: "14/07 – 20/07", fase: "Disputa 3º Lugar" },
  { semana: 8, periodo: "21/07 – 26/07", fase: "Grande Final" },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────
function medalha(pos: number) {
  if (pos === 1) return "🥇";
  if (pos === 2) return "🥈";
  if (pos === 3) return "🥉";
  return `${pos}º`;
}

function corCard(pos: number) {
  if (pos === 1) return "from-yellow-500/20 to-yellow-500/5 border-yellow-500/30";
  if (pos === 2) return "from-slate-400/20 to-slate-400/5 border-slate-400/30";
  if (pos === 3) return "from-orange-500/20 to-orange-500/5 border-orange-500/30";
  return "from-white/5 to-white/0 border-white/10";
}

function labelChave(chave: string) {
  const map: Record<string, string> = {
    agendamentos: "Agendamento",
    visitas: "Visita Realizada",
    documentacao: "Análise de Crédito",
    vendas: "Venda (Contrato)",
  };
  return map[chave] ?? chave;
}

// ─── Componente Principal ────────────────────────────────────────────────────
export default function CopaSMQ() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin" || user?.role === "superintendente";

  const { data: ranking = [], isLoading: loadingRanking } = trpc.copa.getRanking.useQuery(undefined, { refetchInterval: 30000 });
  const { data: dados, isLoading: loadingDados } = trpc.copa.getDados.useQuery();
  const { data: semanaData } = trpc.copa.getSemanaAtual.useQuery();
  const semanaAtual = semanaData?.semana ?? 1;

  const utils = trpc.useUtils();

  // ── Estado lançamento pontuação ──
  const [selectedCorretor, setSelectedCorretor] = useState<number | null>(null);
  const [semanaLancar, setSemanaLancar] = useState(semanaAtual);
  const [pontos, setPontos] = useState({ agendamentos: 0, visitas: 0, documentacao: 0, vendas: 0 });

  // ── Estado config pontuação ──
  const { data: configPontos = [] } = trpc.copa.getConfigPontos.useQuery();
  const [editPontos, setEditPontos] = useState<Record<string, number>>({});
  const [editandoPontos, setEditandoPontos] = useState(false);

  // ── Estado config prêmios ──
  const { data: configPremios = [] } = trpc.copa.getConfigPremios.useQuery();
  const [editPremios, setEditPremios] = useState<Record<number, Partial<ConfigPremio>>>({});
  const [editandoPremio, setEditandoPremio] = useState<number | null>(null);

  // ── Estado participantes / sorteio ──
  const { data: corretoresDisponiveis = [], isLoading: loadingCorretores } = trpc.copa.getCorretoresDisponiveis.useQuery(undefined, { enabled: isAdmin });
  const [selecionados, setSelecionados] = useState<Set<number>>(new Set());
  const [sorteioConfirm, setSorteioConfirm] = useState(false);

  // Inicializar selecionados com quem já está na copa
  useEffect(() => {
    const lista = corretoresDisponiveis as CorretorDisponivel[];
    if (lista.length > 0) {
      const nasCopa = lista.filter(c => c.naCopa).map(c => c.id);
      setSelecionados(new Set(nasCopa));
    }
  }, [(corretoresDisponiveis as CorretorDisponivel[]).length]);

  // ── Mutations ──
  const salvarPontuacao = trpc.copa.salvarPontuacao.useMutation({
    onSuccess: () => {
      toast.success("Pontuação salva!");
      utils.copa.getRanking.invalidate();
      setPontos({ agendamentos: 0, visitas: 0, documentacao: 0, vendas: 0 });
    },
    onError: (e) => toast.error(e.message),
  });

  const setVencedor = trpc.copa.setVencedor.useMutation({
    onSuccess: () => { toast.success("Vencedor definido!"); utils.copa.getDados.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const updateConfigPontos = trpc.copa.updateConfigPontos.useMutation({
    onSuccess: () => {
      toast.success("Pontuação atualizada!");
      utils.copa.getConfigPontos.invalidate();
      setEditandoPontos(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const updateConfigPremio = trpc.copa.updateConfigPremio.useMutation({
    onSuccess: () => {
      toast.success("Prêmio atualizado!");
      utils.copa.getConfigPremios.invalidate();
      setEditandoPremio(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const setParticipantes = trpc.copa.setParticipantes.useMutation({
    onSuccess: () => {
      toast.success("Participantes salvos!");
      utils.copa.getCorretoresDisponiveis.invalidate();
      utils.copa.getDados.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const realizarSorteio = trpc.copa.realizarSorteio.useMutation({
    onSuccess: (res) => {
      if (res.success) {
        toast.success(`Sorteio realizado! ${res.participantes} participantes, ${res.confrontos} confrontos criados.`);
        utils.copa.getDados.invalidate();
        utils.copa.getRanking.invalidate();
        setSorteioConfirm(false);
      }
    },
    onError: (e) => toast.error(e.message),
  });

  // ── Helpers de UI ──
  const totalPontosPreview =
    pontos.agendamentos * PONTUACAO_DEFAULT.agendamentos +
    pontos.visitas * PONTUACAO_DEFAULT.visitas +
    pontos.documentacao * PONTUACAO_DEFAULT.documentacao +
    pontos.vendas * PONTUACAO_DEFAULT.vendas;

  const nomeCorretor = (id: number | null) => {
    if (!id) return "—";
    return dados?.corretoresCopa.find((c: CorretorCopa) => c.corretorId === id)?.nome ?? `#${id}`;
  };

  const selecaoCorretor = (id: number | null): Selecao | null => {
    if (!id || !dados) return null;
    const cc = dados.corretoresCopa.find((c: CorretorCopa) => c.corretorId === id);
    if (!cc?.selecaoId) return null;
    return dados.selecoes.find((s: Selecao) => s.id === cc.selecaoId) ?? null;
  };

  const faseAtual = dados?.fases?.find((f: Fase) => {
    if (!f.semanaInicio || !f.semanaFim) return false;
    return semanaAtual >= parseInt(f.semanaInicio) && semanaAtual <= parseInt(f.semanaFim);
  }) ?? dados?.fases?.[0];

  const toggleSelecionado = (id: number) => {
    setSelecionados(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="min-h-screen" style={{ background: "linear-gradient(135deg, #0a1628 0%, #0d2137 40%, #0a1628 100%)" }}>
      {/* Hero */}
      <div className="relative overflow-hidden border-b border-white/10">
        <div className="absolute inset-0 opacity-5" style={{
          backgroundImage: "repeating-linear-gradient(45deg, #009c3b 0, #009c3b 1px, transparent 0, transparent 50%)",
          backgroundSize: "20px 20px",
        }} />
        <div className="relative px-4 py-8 text-center">
          <div className="flex items-center justify-center gap-3 mb-2">
            <span className="text-4xl" style={{ filter: "drop-shadow(0 0 12px #ffdf00)" }}>⚽</span>
            <h1 className="text-3xl md:text-4xl font-black text-white tracking-tight">
              COPA <span style={{ color: "#ffdf00" }}>SMQ</span> 2026
            </h1>
            <span className="text-4xl" style={{ filter: "drop-shadow(0 0 12px #ffdf00)" }}>🏆</span>
          </div>
          <p className="text-white/60 text-sm mb-4">3 de junho – 26 de julho de 2026 • R$ 7.250 em prêmios</p>

          <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm border border-white/20 rounded-full px-4 py-1.5">
            <Calendar className="h-4 w-4 text-yellow-400" />
            <span className="text-white font-semibold text-sm">
              Semana {semanaAtual} — {SEMANAS[semanaAtual - 1]?.fase ?? "Encerrado"}
            </span>
            <span className="text-white/50 text-xs">({SEMANAS[semanaAtual - 1]?.periodo})</span>
          </div>

          {!loadingRanking && ranking.length > 0 && (
            <div className="flex justify-center gap-3 mt-5 flex-wrap">
              {(ranking as RankingItem[]).slice(0, 3).map((r) => (
                <div key={r.corretorId} className={`flex flex-col items-center gap-1 bg-gradient-to-b ${corCard(r.posicao)} border rounded-xl px-4 py-2 min-w-[100px]`}>
                  <span className="text-2xl">{medalha(r.posicao)}</span>
                  <span className="text-white font-bold text-xs text-center leading-tight">{r.nome.split(" ")[0]}</span>
                  {r.selecao && <span className="text-lg">{r.selecao.bandeira}</span>}
                  <span className="text-yellow-400 font-black text-sm">{r.totalPontos} pts</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Conteúdo */}
      <div className="max-w-5xl mx-auto px-4 py-6">
        <Tabs defaultValue="ranking">
          <TabsList className="bg-white/10 border border-white/20 mb-6 w-full flex-wrap h-auto gap-1 p-1">
            <TabsTrigger value="ranking" className="flex-1 text-white data-[state=active]:bg-yellow-500 data-[state=active]:text-black text-xs sm:text-sm">
              <Trophy className="h-3.5 w-3.5 mr-1" /> Ranking
            </TabsTrigger>
            <TabsTrigger value="chaveamento" className="flex-1 text-white data-[state=active]:bg-yellow-500 data-[state=active]:text-black text-xs sm:text-sm">
              <Swords className="h-3.5 w-3.5 mr-1" /> Chaveamento
            </TabsTrigger>
            <TabsTrigger value="premios" className="flex-1 text-white data-[state=active]:bg-yellow-500 data-[state=active]:text-black text-xs sm:text-sm">
              <Gift className="h-3.5 w-3.5 mr-1" /> Prêmios
            </TabsTrigger>
            <TabsTrigger value="regras" className="flex-1 text-white data-[state=active]:bg-yellow-500 data-[state=active]:text-black text-xs sm:text-sm">
              <Star className="h-3.5 w-3.5 mr-1" /> Regras
            </TabsTrigger>
            {isAdmin && (
              <TabsTrigger value="admin" className="flex-1 text-white data-[state=active]:bg-red-600 data-[state=active]:text-white text-xs sm:text-sm">
                <Target className="h-3.5 w-3.5 mr-1" /> Admin
              </TabsTrigger>
            )}
          </TabsList>

          {/* ─── RANKING ─────────────────────────────────────────────────────── */}
          <TabsContent value="ranking">
            <Card className="bg-white/5 border-white/10">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Trophy className="h-5 w-5 text-yellow-400" /> Classificação Geral
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loadingRanking ? (
                  <div className="text-center text-white/50 py-8">Carregando ranking...</div>
                ) : (ranking as RankingItem[]).length === 0 ? (
                  <div className="text-center text-white/50 py-8">Nenhuma pontuação registrada ainda.</div>
                ) : (
                  <div className="space-y-2">
                    {(ranking as RankingItem[]).map((r) => (
                      <div key={r.corretorId} className={`flex items-center gap-3 bg-gradient-to-r ${corCard(r.posicao)} border rounded-lg px-4 py-3 transition-all hover:scale-[1.01]`}>
                        <span className="text-xl w-8 text-center font-black text-white">{medalha(r.posicao)}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-white font-semibold truncate">{r.nome}</span>
                            {r.selecao && <span className="text-lg" title={r.selecao.nome}>{r.selecao.bandeira}</span>}
                          </div>
                          <div className="flex gap-3 text-xs text-white/50 mt-0.5 flex-wrap">
                            <span>📅 {r.totalAgendamentos}</span>
                            <span>🏠 {r.totalVisitas}</span>
                            <span>📋 {r.totalDocumentacao}</span>
                            <span>🤝 {r.totalVendas}</span>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <span className="text-yellow-400 font-black text-lg">{r.totalPontos}</span>
                          <span className="text-white/40 text-xs ml-1">pts</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
            <Card className="bg-white/5 border-white/10 mt-4">
              <CardHeader><CardTitle className="text-white text-sm">Tabela de Pontuação</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {(configPontos as ConfigPonto[]).length > 0
                    ? (configPontos as ConfigPonto[]).map((p) => (
                        <div key={p.chave} className="bg-white/10 rounded-lg p-3 text-center">
                          <div className="text-yellow-400 font-black text-xl">{p.pontos}</div>
                          <div className="text-white/60 text-xs mt-1">{labelChave(p.chave)}</div>
                        </div>
                      ))
                    : Object.entries(PONTUACAO_DEFAULT).map(([key, pts]) => (
                        <div key={key} className="bg-white/10 rounded-lg p-3 text-center">
                          <div className="text-yellow-400 font-black text-xl">{pts}</div>
                          <div className="text-white/60 text-xs capitalize mt-1">{key}</div>
                        </div>
                      ))
                  }
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ─── CHAVEAMENTO ─────────────────────────────────────────────────── */}
          <TabsContent value="chaveamento">
            {loadingDados ? (
              <div className="text-center text-white/50 py-8">Carregando...</div>
            ) : !dados?.fases?.length ? (
              <div className="text-center text-white/50 py-8">Chaveamento ainda não configurado.</div>
            ) : (
              <div className="space-y-4">
                {(dados.fases as Fase[]).map((fase) => {
                  const confrontosFase = (dados.confrontos as Confronto[]).filter((c) => c.faseId === fase.id);
                  const isAtual = faseAtual?.id === fase.id;
                  return (
                    <Card key={fase.id} className={`border ${isAtual ? "border-yellow-500/50 bg-yellow-500/5" : "border-white/10 bg-white/5"}`}>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-white flex items-center gap-2 text-base">
                          {isAtual && <Badge className="bg-yellow-500 text-black text-xs">Fase Atual</Badge>}
                          <span>{fase.nome}</span>
                          {fase.semanaInicio && (
                            <span className="text-white/40 text-xs font-normal">Sem. {fase.semanaInicio}–{fase.semanaFim}</span>
                          )}
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        {confrontosFase.length === 0 ? (
                          <p className="text-white/40 text-sm">Confrontos a definir</p>
                        ) : (
                          <div className="grid gap-2 sm:grid-cols-2">
                            {confrontosFase.map((c) => {
                              const selA = selecaoCorretor(c.corretorAId);
                              const selB = selecaoCorretor(c.corretorBId);
                              return (
                                <div key={c.id} className="flex items-center gap-2 bg-white/10 rounded-lg px-3 py-2">
                                  <div className="flex-1 text-right">
                                    <span className={`text-sm font-medium ${c.vencedorId === c.corretorAId ? "text-yellow-400 font-bold" : "text-white"}`}>{nomeCorretor(c.corretorAId)}</span>
                                    {selA && <span className="ml-1">{selA.bandeira}</span>}
                                  </div>
                                  <span className="text-white/30 text-xs shrink-0">vs</span>
                                  <div className="flex-1">
                                    {selB && <span className="mr-1">{selB.bandeira}</span>}
                                    <span className={`text-sm font-medium ${c.vencedorId === c.corretorBId ? "text-yellow-400 font-bold" : "text-white"}`}>{nomeCorretor(c.corretorBId)}</span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* ─── PRÊMIOS ─────────────────────────────────────────────────────── */}
          <TabsContent value="premios">
            <Card className="bg-white/5 border-white/10">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Gift className="h-5 w-5 text-yellow-400" /> Premiação Total: R$ 7.250
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {(configPremios as ConfigPremio[]).length > 0
                    ? (configPremios as ConfigPremio[]).map((p, i) => (
                        <div key={p.id} className={`flex items-center justify-between bg-gradient-to-r ${i === 0 ? "from-yellow-500/20 to-yellow-500/5 border-yellow-500/30" : i === 1 ? "from-slate-400/20 to-slate-400/5 border-slate-400/30" : i === 2 ? "from-orange-500/20 to-orange-500/5 border-orange-500/30" : "from-white/5 to-white/0 border-white/10"} border rounded-lg px-4 py-3`}>
                          <div className="flex items-center gap-3">
                            <span className="text-2xl">{p.icone}</span>
                            <div>
                              <div className="text-white font-medium">{p.posicao}</div>
                              <div className="text-white/50 text-xs">{p.descricao}</div>
                            </div>
                          </div>
                          <span className="text-yellow-400 font-black text-lg">{p.valor}</span>
                        </div>
                      ))
                    : <div className="text-white/50 text-center py-4">Carregando prêmios...</div>
                  }
                </div>
                <p className="text-white/40 text-xs mt-4 text-center">Prêmios pagos até 5 dias úteis após 26/07/2026</p>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ─── REGRAS ──────────────────────────────────────────────────────── */}
          <TabsContent value="regras">
            <Card className="bg-white/5 border-white/10">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Star className="h-5 w-5 text-yellow-400" /> Regulamento
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-white/80 text-sm">
                <div><h3 className="text-white font-bold mb-1">📅 Período</h3><p>03 de junho a 26 de julho de 2026</p></div>
                <div><h3 className="text-white font-bold mb-1">⚽ Formato</h3><p>8 semanas: grupos (sem. 1–3), oitavas (4), quartas (5), semifinal (6), 3º lugar (7), final (8).</p></div>
                <div>
                  <h3 className="text-white font-bold mb-2">🏆 Pontuação</h3>
                  <div className="grid grid-cols-2 gap-2">
                    {(configPontos as ConfigPonto[]).length > 0
                      ? (configPontos as ConfigPonto[]).map((p) => (
                          <div key={p.chave} className="bg-white/10 rounded p-2">
                            {labelChave(p.chave)}: <span className="text-yellow-400 font-bold">{p.pontos} pts</span>
                          </div>
                        ))
                      : <>
                          <div className="bg-white/10 rounded p-2">📅 Agendamento: <span className="text-yellow-400 font-bold">25 pts</span></div>
                          <div className="bg-white/10 rounded p-2">🏠 Visita: <span className="text-yellow-400 font-bold">40 pts</span></div>
                          <div className="bg-white/10 rounded p-2">📋 Documentação: <span className="text-yellow-400 font-bold">60 pts</span></div>
                          <div className="bg-white/10 rounded p-2">🤝 Venda: <span className="text-yellow-400 font-bold">150 pts</span></div>
                        </>
                    }
                  </div>
                </div>
                <div>
                  <h3 className="text-white font-bold mb-2">🎁 Premiação</h3>
                  <div className="space-y-1">
                    <div className="bg-white/10 rounded p-2">🏅 Top 3 Fase de Grupos: <span className="text-yellow-400 font-bold">R$ 100,00 cada</span></div>
                    <div className="bg-white/10 rounded p-2">🎖️ Avanço à Semifinal: <span className="text-yellow-400 font-bold">R$ 250,00</span></div>
                    <div className="bg-white/10 rounded p-2">🥉 3º Lugar: <span className="text-yellow-400 font-bold">R$ 900,00</span></div>
                    <div className="bg-white/10 rounded p-2">🥈 Vice-Campeão: <span className="text-yellow-400 font-bold">R$ 2.000,00</span></div>
                    <div className="bg-white/10 rounded p-2">🏆 Campeão: <span className="text-yellow-400 font-bold">R$ 4.000,00</span></div>
                  </div>
                </div>
                <div>
                  <h3 className="text-white font-bold mb-1">⚠️ Regras Gerais</h3>
                  <ul className="list-disc list-inside space-y-1 text-white/60">
                    <li>Pontuação calculada automaticamente pelo CRM</li>
                    <li>Apenas atividades registradas no CRM são contabilizadas</li>
                    <li>Em empate: desempate por vendas, depois por visitas</li>
                    <li>Decisões da gestão são finais</li>
                  </ul>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ─── ADMIN ───────────────────────────────────────────────────────── */}
          {isAdmin && (
            <TabsContent value="admin">
              <div className="space-y-5">

                {/* ── 1. Gerenciar Participantes ── */}
                <Card className="bg-white/5 border-blue-500/30">
                  <CardHeader>
                    <CardTitle className="text-white flex items-center gap-2">
                      <Users className="h-5 w-5 text-blue-400" /> Gerenciar Participantes
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {loadingCorretores ? (
                      <div className="text-white/50 text-sm text-center py-4">Carregando corretores...</div>
                    ) : (
                      <>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-white/60 text-sm">{selecionados.size} selecionados de {(corretoresDisponiveis as CorretorDisponivel[]).length}</span>
                          <div className="flex gap-2">
                            <Button size="sm" variant="outline" className="border-white/20 text-white hover:bg-white/10 text-xs h-7"
                              onClick={() => setSelecionados(new Set((corretoresDisponiveis as CorretorDisponivel[]).map(c => c.id)))}>
                              Todos
                            </Button>
                            <Button size="sm" variant="outline" className="border-white/20 text-white hover:bg-white/10 text-xs h-7"
                              onClick={() => setSelecionados(new Set())}>
                              Nenhum
                            </Button>
                          </div>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-72 overflow-y-auto pr-1">
                          {(corretoresDisponiveis as CorretorDisponivel[]).map((c) => (
                            <label key={c.id} className={`flex items-center gap-3 rounded-lg px-3 py-2 cursor-pointer border transition-all ${selecionados.has(c.id) ? "bg-blue-500/20 border-blue-500/40" : "bg-white/5 border-white/10 hover:bg-white/10"}`}>
                              <input
                                type="checkbox"
                                checked={selecionados.has(c.id)}
                                onChange={() => toggleSelecionado(c.id)}
                                className="accent-blue-400"
                              />
                              <span className="text-white text-sm flex-1 truncate">{c.nome}</span>
                              <Badge className={`text-xs ${c.role === "gestor" ? "bg-purple-500/30 text-purple-300 border-purple-500/30" : "bg-white/10 text-white/50 border-white/10"}`}>
                                {c.role}
                              </Badge>
                            </label>
                          ))}
                        </div>
                        <Button
                          className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold"
                          disabled={setParticipantes.isPending}
                          onClick={() => setParticipantes.mutate({ corretorIds: Array.from(selecionados) })}
                        >
                          {setParticipantes.isPending ? "Salvando..." : `Salvar ${selecionados.size} Participantes`}
                        </Button>
                      </>
                    )}
                  </CardContent>
                </Card>

                {/* ── 2. Sorteio Automático ── */}
                <Card className="bg-white/5 border-purple-500/30">
                  <CardHeader>
                    <CardTitle className="text-white flex items-center gap-2">
                      <Shuffle className="h-5 w-5 text-purple-400" /> Sorteio Automático de Seleções
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <p className="text-white/60 text-sm">
                      O sorteio atribui aleatoriamente uma seleção para cada participante e cria os confrontos da fase de grupos.
                      <span className="text-red-400 font-semibold"> Atenção: isso apaga confrontos anteriores.</span>
                    </p>
                    <div className="bg-white/5 rounded-lg p-3 border border-white/10">
                      <div className="text-white/60 text-xs mb-2">Participantes cadastrados ({dados?.corretoresCopa?.length ?? 0}):</div>
                      <div className="flex flex-wrap gap-2">
                        {dados?.corretoresCopa && (dados.corretoresCopa as CorretorCopa[]).length > 0
                          ? (dados.corretoresCopa as CorretorCopa[]).map((c) => {
                              const sel = dados.selecoes?.find((s: Selecao) => s.id === c.selecaoId);
                              return (
                                <span key={c.corretorId} className="bg-white/10 rounded-full px-2 py-0.5 text-white text-xs flex items-center gap-1">
                                  {sel ? sel.bandeira : "🏳️"} {c.nome.split(" ")[0]}
                                </span>
                              );
                            })
                          : <span className="text-white/40 text-xs">Nenhum participante cadastrado ainda. Salve os participantes acima primeiro.</span>
                        }
                      </div>
                    </div>
                    {!sorteioConfirm ? (
                      <Button
                        className="w-full bg-purple-600 hover:bg-purple-500 text-white font-bold"
                        onClick={() => setSorteioConfirm(true)}
                        disabled={!dados?.corretoresCopa?.length}
                      >
                        <Shuffle className="h-4 w-4 mr-2" /> Realizar Sorteio
                      </Button>
                    ) : (
                      <div className="space-y-2">
                        <p className="text-red-400 text-sm font-semibold text-center">⚠️ Confirma o sorteio? Esta ação não pode ser desfeita.</p>
                        <div className="flex gap-2">
                          <Button
                            className="flex-1 bg-red-600 hover:bg-red-500 text-white font-bold"
                            disabled={realizarSorteio.isPending}
                            onClick={() => realizarSorteio.mutate({ confirmar: true })}
                          >
                            {realizarSorteio.isPending ? "Sorteando..." : "Confirmar Sorteio"}
                          </Button>
                          <Button
                            variant="outline"
                            className="flex-1 border-white/20 text-white hover:bg-white/10"
                            onClick={() => setSorteioConfirm(false)}
                          >
                            Cancelar
                          </Button>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* ── 3. Lançar Pontuação Manual ── */}
                <Card className="bg-white/5 border-yellow-500/30">
                  <CardHeader>
                    <CardTitle className="text-white flex items-center gap-2">
                      <Target className="h-5 w-5 text-yellow-400" /> Lançar Pontuação Manual (Bônus/Correção)
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <p className="text-white/50 text-xs">A pontuação automática já é calculada pelo CRM. Use este painel apenas para bônus ou correções manuais.</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-white/60 text-xs mb-1 block">Corretor</label>
                        <select
                          className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white text-sm"
                          value={selectedCorretor ?? ""}
                          onChange={(e) => setSelectedCorretor(Number(e.target.value) || null)}
                        >
                          <option value="">Selecionar...</option>
                          {(dados?.corretoresCopa as CorretorCopa[] | undefined)?.map((c) => (
                            <option key={c.corretorId} value={c.corretorId}>{c.nome}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="text-white/60 text-xs mb-1 block">Semana</label>
                        <select
                          className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white text-sm"
                          value={semanaLancar}
                          onChange={(e) => setSemanaLancar(Number(e.target.value))}
                        >
                          {SEMANAS.map((s) => (
                            <option key={s.semana} value={s.semana}>Sem. {s.semana} — {s.fase}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {(["agendamentos", "visitas", "documentacao", "vendas"] as const).map((campo) => {
                        const pts = (configPontos as ConfigPonto[]).find(p => p.chave === campo)?.pontos ?? PONTUACAO_DEFAULT[campo];
                        return (
                          <div key={campo}>
                            <label className="text-white/60 text-xs mb-1 block capitalize">{campo} ({pts}pts)</label>
                            <div className="flex items-center gap-1">
                              <Button size="icon" variant="outline" className="h-8 w-8 border-white/20 text-white hover:bg-white/10"
                                onClick={() => setPontos(p => ({ ...p, [campo]: Math.max(0, p[campo] - 1) }))}>
                                <ChevronDown className="h-3 w-3" />
                              </Button>
                              <Input type="number" min={0}
                                className="h-8 text-center bg-white/10 border-white/20 text-white text-sm"
                                value={pontos[campo]}
                                onChange={(e) => setPontos(p => ({ ...p, [campo]: Math.max(0, parseInt(e.target.value) || 0) }))}
                              />
                              <Button size="icon" variant="outline" className="h-8 w-8 border-white/20 text-white hover:bg-white/10"
                                onClick={() => setPontos(p => ({ ...p, [campo]: p[campo] + 1 }))}>
                                <ChevronUp className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-white/60 text-sm">
                        Total: <span className="text-yellow-400 font-black text-lg">{totalPontosPreview} pts</span>
                      </span>
                      <Button
                        className="bg-yellow-500 hover:bg-yellow-400 text-black font-bold"
                        disabled={!selectedCorretor || salvarPontuacao.isPending}
                        onClick={() => {
                          if (!selectedCorretor) return;
                          salvarPontuacao.mutate({ corretorId: selectedCorretor, semana: semanaLancar, ...pontos });
                        }}
                      >
                        {salvarPontuacao.isPending ? "Salvando..." : "Salvar Pontuação"}
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                {/* ── 4. Editar Pontuação por Atividade ── */}
                <Card className="bg-white/5 border-green-500/30">
                  <CardHeader>
                    <CardTitle className="text-white flex items-center gap-2">
                      <Settings className="h-5 w-5 text-green-400" /> Editar Pontuação por Atividade
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {(configPontos as ConfigPonto[]).length === 0 ? (
                      <div className="text-white/50 text-sm text-center py-4">Carregando configurações...</div>
                    ) : (
                      <>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                          {(configPontos as ConfigPonto[]).map((p) => (
                            <div key={p.chave} className="bg-white/10 rounded-lg p-3">
                              <label className="text-white/60 text-xs block mb-1">{labelChave(p.chave)}</label>
                              {editandoPontos ? (
                                <Input
                                  type="number"
                                  min={0}
                                  className="h-8 text-center bg-white/10 border-white/20 text-white text-sm"
                                  value={editPontos[p.chave] ?? p.pontos}
                                  onChange={(e) => setEditPontos(prev => ({ ...prev, [p.chave]: parseInt(e.target.value) || 0 }))}
                                />
                              ) : (
                                <div className="text-yellow-400 font-black text-xl text-center">{p.pontos}</div>
                              )}
                            </div>
                          ))}
                        </div>
                        {editandoPontos ? (
                          <div className="flex gap-2">
                            <Button
                              className="flex-1 bg-green-600 hover:bg-green-500 text-white font-bold"
                              disabled={updateConfigPontos.isPending}
                              onClick={async () => {
                                for (const p of configPontos as ConfigPonto[]) {
                                  const novoPts = editPontos[p.chave] ?? p.pontos;
                                  if (novoPts !== p.pontos) {
                                    await updateConfigPontos.mutateAsync({ chave: p.chave, pontos: novoPts });
                                  }
                                }
                                toast.success("Pontuações atualizadas!");
                                utils.copa.getConfigPontos.invalidate();
                                setEditandoPontos(false);
                              }}
                            >
                              {updateConfigPontos.isPending ? "Salvando..." : "Salvar Alterações"}
                            </Button>
                            <Button
                              variant="outline"
                              className="flex-1 border-white/20 text-white hover:bg-white/10"
                              onClick={() => { setEditandoPontos(false); setEditPontos({}); }}
                            >
                              Cancelar
                            </Button>
                          </div>
                        ) : (
                          <Button
                            variant="outline"
                            className="w-full border-green-500/30 text-green-400 hover:bg-green-500/10"
                            onClick={() => {
                              const init: Record<string, number> = {};
                              (configPontos as ConfigPonto[]).forEach(p => { init[p.chave] = p.pontos; });
                              setEditPontos(init);
                              setEditandoPontos(true);
                            }}
                          >
                            <Settings className="h-4 w-4 mr-2" /> Editar Pontuações
                          </Button>
                        )}
                      </>
                    )}
                  </CardContent>
                </Card>

                {/* ── 5. Editar Prêmios ── */}
                <Card className="bg-white/5 border-orange-500/30">
                  <CardHeader>
                    <CardTitle className="text-white flex items-center gap-2">
                      <Award className="h-5 w-5 text-orange-400" /> Editar Prêmios
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {(configPremios as ConfigPremio[]).length === 0 ? (
                      <div className="text-white/50 text-sm text-center py-4">Carregando prêmios...</div>
                    ) : (
                      (configPremios as ConfigPremio[]).map((p) => {
                        const isEditing = editandoPremio === p.id;
                        const edit = editPremios[p.id] ?? {};
                        return (
                          <div key={p.id} className="bg-white/10 rounded-lg p-3 border border-white/10">
                            {isEditing ? (
                              <div className="space-y-2">
                                <div className="grid grid-cols-2 gap-2">
                                  <div>
                                    <label className="text-white/50 text-xs block mb-1">Ícone</label>
                                    <Input
                                      className="h-8 bg-white/10 border-white/20 text-white text-sm"
                                      value={edit.icone ?? p.icone}
                                      onChange={(e) => setEditPremios(prev => ({ ...prev, [p.id]: { ...prev[p.id], icone: e.target.value } }))}
                                    />
                                  </div>
                                  <div>
                                    <label className="text-white/50 text-xs block mb-1">Valor</label>
                                    <Input
                                      className="h-8 bg-white/10 border-white/20 text-white text-sm"
                                      value={edit.valor ?? p.valor}
                                      onChange={(e) => setEditPremios(prev => ({ ...prev, [p.id]: { ...prev[p.id], valor: e.target.value } }))}
                                    />
                                  </div>
                                </div>
                                <div>
                                  <label className="text-white/50 text-xs block mb-1">Posição / Título</label>
                                  <Input
                                    className="h-8 bg-white/10 border-white/20 text-white text-sm"
                                    value={edit.posicao ?? p.posicao}
                                    onChange={(e) => setEditPremios(prev => ({ ...prev, [p.id]: { ...prev[p.id], posicao: e.target.value } }))}
                                  />
                                </div>
                                <div>
                                  <label className="text-white/50 text-xs block mb-1">Descrição</label>
                                  <Input
                                    className="h-8 bg-white/10 border-white/20 text-white text-sm"
                                    value={edit.descricao ?? p.descricao}
                                    onChange={(e) => setEditPremios(prev => ({ ...prev, [p.id]: { ...prev[p.id], descricao: e.target.value } }))}
                                  />
                                </div>
                                <div className="flex gap-2">
                                  <Button
                                    size="sm"
                                    className="flex-1 bg-orange-600 hover:bg-orange-500 text-white font-bold text-xs h-8"
                                    disabled={updateConfigPremio.isPending}
                                    onClick={() => updateConfigPremio.mutate({
                                      id: p.id,
                                      posicao: edit.posicao ?? p.posicao,
                                      descricao: edit.descricao ?? p.descricao,
                                      valor: edit.valor ?? p.valor,
                                      icone: edit.icone ?? p.icone,
                                    })}
                                  >
                                    {updateConfigPremio.isPending ? "Salvando..." : "Salvar"}
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="flex-1 border-white/20 text-white hover:bg-white/10 text-xs h-8"
                                    onClick={() => setEditandoPremio(null)}
                                  >
                                    Cancelar
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                  <span className="text-2xl">{p.icone}</span>
                                  <div>
                                    <div className="text-white font-medium text-sm">{p.posicao}</div>
                                    <div className="text-white/50 text-xs">{p.descricao}</div>
                                  </div>
                                </div>
                                <div className="flex items-center gap-3">
                                  <span className="text-yellow-400 font-black">{p.valor}</span>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="border-white/20 text-white hover:bg-white/10 text-xs h-7"
                                    onClick={() => {
                                      setEditPremios(prev => ({ ...prev, [p.id]: { ...p } }));
                                      setEditandoPremio(p.id);
                                    }}
                                  >
                                    Editar
                                  </Button>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </CardContent>
                </Card>

                {/* ── 6. Definir Vencedores ── */}
                {(dados?.confrontos as Confronto[] | undefined)?.length ? (
                  <Card className="bg-white/5 border-white/10">
                    <CardHeader>
                      <CardTitle className="text-white flex items-center gap-2">
                        <Swords className="h-5 w-5 text-orange-400" /> Definir Vencedores dos Confrontos
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {(dados!.confrontos as Confronto[]).map((c) => {
                          const fase = (dados!.fases as Fase[]).find((f) => f.id === c.faseId);
                          return (
                            <div key={c.id} className="flex items-center gap-2 bg-white/10 rounded-lg px-3 py-2">
                              <span className="text-white/40 text-xs w-20 shrink-0">{fase?.nome ?? "—"}</span>
                              <div className="flex-1 flex items-center gap-2">
                                <Button size="sm"
                                  className={`flex-1 text-xs h-7 ${c.vencedorId === c.corretorAId ? "bg-yellow-500 text-black hover:bg-yellow-400" : "bg-transparent border border-white/20 text-white hover:bg-white/10"}`}
                                  onClick={() => setVencedor.mutate({ confrontoId: c.id, vencedorId: c.corretorAId })}>
                                  {nomeCorretor(c.corretorAId)}
                                </Button>
                                <Minus className="h-3 w-3 text-white/30 shrink-0" />
                                <Button size="sm"
                                  className={`flex-1 text-xs h-7 ${c.vencedorId === c.corretorBId ? "bg-yellow-500 text-black hover:bg-yellow-400" : "bg-transparent border border-white/20 text-white hover:bg-white/10"}`}
                                  onClick={() => setVencedor.mutate({ confrontoId: c.id, vencedorId: c.corretorBId })}>
                                  {nomeCorretor(c.corretorBId)}
                                </Button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>
                ) : null}

              </div>
            </TabsContent>
          )}
        </Tabs>
      </div>
    </div>
  );
}
