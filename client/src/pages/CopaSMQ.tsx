import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Trophy, Swords, Target, Calendar, Gift, Star, ChevronUp, ChevronDown, Minus } from "lucide-react";
import { toast } from "sonner";

// ─── Tipos ───────────────────────────────────────────────────────────────────
interface Selecao { id: number; nome: string; bandeira: string; }
interface Fase { id: number; nome: string; ordem: number; semanaInicio: string | null; semanaFim: string | null; }
interface Confronto { id: number; faseId: number; corretorAId: number | null; corretorBId: number | null; vencedorId: number | null; }
interface CorretorCopa { corretorId: number; nome: string; selecaoId: number | null; }
interface RankingItem {
  posicao: number; corretorId: number; nome: string;
  selecao: Selecao | null;
  totalAgendamentos: number; totalVisitas: number; totalDocumentacao: number; totalVendas: number; totalPontos: number;
}

// ─── Constantes ──────────────────────────────────────────────────────────────
const PONTUACAO = { agendamentos: 25, visitas: 40, documentacao: 60, vendas: 150 };

const PREMIOS = [
  { posicao: "🥇 1º lugar", premio: "R$ 2.000", icon: "🏆" },
  { posicao: "🥈 2º lugar", premio: "R$ 1.000", icon: "🥈" },
  { posicao: "🥉 3º lugar", premio: "R$ 500", icon: "🥉" },
  { posicao: "⚽ Artilheiro (mais vendas)", premio: "R$ 500", icon: "⚽" },
  { posicao: "📅 Mais agendamentos", premio: "R$ 200", icon: "📅" },
  { posicao: "🏠 Mais visitas", premio: "R$ 150", icon: "🏠" },
];

const SEMANAS = [
  { semana: 1, periodo: "03/06 – 08/06", fase: "Fase de Grupos" },
  { semana: 2, periodo: "09/06 – 15/06", fase: "Fase de Grupos" },
  { semana: 3, periodo: "16/06 – 22/06", fase: "Fase de Grupos" },
  { semana: 4, periodo: "23/06 – 29/06", fase: "Oitavas de Final" },
  { semana: 5, periodo: "30/06 – 06/07", fase: "Quartas de Final" },
  { semana: 6, periodo: "07/07 – 09/07", fase: "Semifinal" },
  { semana: 7, periodo: "10/07 – 11/07", fase: "Disputa 3º Lugar" },
  { semana: 8, periodo: "12/07", fase: "Grande Final" },
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

// ─── Componente Principal ────────────────────────────────────────────────────
export default function CopaSMQ() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin" || user?.role === "superintendente";

  const { data: ranking = [], isLoading: loadingRanking } = trpc.copa.getRanking.useQuery();
  const { data: dados, isLoading: loadingDados } = trpc.copa.getDados.useQuery();
  const { data: semanaData } = trpc.copa.getSemanaAtual.useQuery();
  const semanaAtual = semanaData?.semana ?? 1;

  const utils = trpc.useUtils();

  const [selectedCorretor, setSelectedCorretor] = useState<number | null>(null);
  const [semanaLancar, setSemanaLancar] = useState(semanaAtual);
  const [pontos, setPontos] = useState({ agendamentos: 0, visitas: 0, documentacao: 0, vendas: 0 });

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

  const totalPontosPreview =
    pontos.agendamentos * PONTUACAO.agendamentos +
    pontos.visitas * PONTUACAO.visitas +
    pontos.documentacao * PONTUACAO.documentacao +
    pontos.vendas * PONTUACAO.vendas;

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
          <p className="text-white/60 text-sm mb-4">3 de junho – 12 de julho • R$ 4.350 em prêmios</p>

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

          {/* RANKING */}
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
                  {(Object.entries(PONTUACAO) as [string, number][]).map(([key, pts]) => (
                    <div key={key} className="bg-white/10 rounded-lg p-3 text-center">
                      <div className="text-yellow-400 font-black text-xl">{pts}</div>
                      <div className="text-white/60 text-xs capitalize mt-1">{key}</div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* CHAVEAMENTO */}
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

          {/* PRÊMIOS */}
          <TabsContent value="premios">
            <Card className="bg-white/5 border-white/10">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Gift className="h-5 w-5 text-yellow-400" /> Premiação Total: R$ 4.350
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {PREMIOS.map((p, i) => (
                    <div key={i} className={`flex items-center justify-between bg-gradient-to-r ${i === 0 ? "from-yellow-500/20 to-yellow-500/5 border-yellow-500/30" : i === 1 ? "from-slate-400/20 to-slate-400/5 border-slate-400/30" : i === 2 ? "from-orange-500/20 to-orange-500/5 border-orange-500/30" : "from-white/5 to-white/0 border-white/10"} border rounded-lg px-4 py-3`}>
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">{p.icon}</span>
                        <span className="text-white font-medium">{p.posicao}</span>
                      </div>
                      <span className="text-yellow-400 font-black text-lg">{p.premio}</span>
                    </div>
                  ))}
                </div>
                <p className="text-white/40 text-xs mt-4 text-center">Prêmios pagos até 5 dias úteis após 12/07/2026</p>
              </CardContent>
            </Card>
          </TabsContent>

          {/* REGRAS */}
          <TabsContent value="regras">
            <Card className="bg-white/5 border-white/10">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Star className="h-5 w-5 text-yellow-400" /> Regulamento
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-white/80 text-sm">
                <div><h3 className="text-white font-bold mb-1">📅 Período</h3><p>03 de junho a 12 de julho de 2026</p></div>
                <div><h3 className="text-white font-bold mb-1">⚽ Formato</h3><p>8 semanas: grupos (sem. 1–3), oitavas (4), quartas (5), semifinal (6), 3º lugar (7), final (8).</p></div>
                <div>
                  <h3 className="text-white font-bold mb-2">🏆 Pontuação</h3>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-white/10 rounded p-2">📅 Agendamento: <span className="text-yellow-400 font-bold">25 pts</span></div>
                    <div className="bg-white/10 rounded p-2">🏠 Visita: <span className="text-yellow-400 font-bold">40 pts</span></div>
                    <div className="bg-white/10 rounded p-2">📋 Documentação: <span className="text-yellow-400 font-bold">60 pts</span></div>
                    <div className="bg-white/10 rounded p-2">🤝 Venda: <span className="text-yellow-400 font-bold">150 pts</span></div>
                  </div>
                </div>
                <div>
                  <h3 className="text-white font-bold mb-1">⚠️ Regras Gerais</h3>
                  <ul className="list-disc list-inside space-y-1 text-white/60">
                    <li>Pontuações lançadas pelo gestor toda segunda-feira</li>
                    <li>Apenas atividades registradas no CRM são contabilizadas</li>
                    <li>Em empate: desempate por vendas, depois por visitas</li>
                    <li>Decisões da gestão são finais</li>
                  </ul>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ADMIN */}
          {isAdmin && (
            <TabsContent value="admin">
              <div className="space-y-4">
                <Card className="bg-white/5 border-red-500/30">
                  <CardHeader>
                    <CardTitle className="text-white flex items-center gap-2">
                      <Target className="h-5 w-5 text-red-400" /> Lançar Pontuação Semanal
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
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
                      {(["agendamentos", "visitas", "documentacao", "vendas"] as const).map((campo) => (
                        <div key={campo}>
                          <label className="text-white/60 text-xs mb-1 block capitalize">{campo} ({PONTUACAO[campo]}pts)</label>
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
                      ))}
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

                {(dados?.confrontos as Confronto[] | undefined)?.length ? (
                  <Card className="bg-white/5 border-white/10">
                    <CardHeader>
                      <CardTitle className="text-white flex items-center gap-2">
                        <Swords className="h-5 w-5 text-orange-400" /> Definir Vencedores
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
