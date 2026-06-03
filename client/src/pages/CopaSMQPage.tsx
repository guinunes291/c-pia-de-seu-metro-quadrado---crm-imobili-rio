import { useState, useEffect, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";

// ─── Types ───────────────────────────────────────────────────────────────────
interface Selecao { id: number; nome: string; bandeira: string; }
interface Fase { id: number; nome: string; ordem: number; semanaInicio: string | null; semanaFim: string | null; }
interface Confronto { id: number; faseId: number; corretorAId: number | null; corretorBId: number | null; vencedorId: number | null; semanaRef: number | null; }
interface CorretorCopa { corretorId: number; nome: string; selecaoId: number | null; selecaoNome: string | null; selecaoBandeira: string | null; grupo?: string | null; }
interface CorretorDisponivel { id: number; nome: string; role: string; naCopa: boolean; }
interface ConfigPonto { id: number; chave: string; label: string; pontos: number; }
interface ConfigPremio { id: number; posicao: number; descricao: string; valor: string; icone: string; ordem: number; }
interface RankingItem { posicao: number; corretorId: number; nome: string; selecao: Selecao | null; totalAgendamentos: number; totalVisitas: number; totalDocumentacao: number; totalVendas: number; totalPontos: number; }

// ─── Calendário ──────────────────────────────────────────────────────────────
const SEMANAS = [
  { semana: 1, periodo: "03/06–09/06", label: "FASE DE GRUPOS" },
  { semana: 2, periodo: "10/06–16/06", label: "FASE DE GRUPOS" },
  { semana: 3, periodo: "17/06–23/06", label: "REPESCAGEM + QUARTAS" },
  { semana: 4, periodo: "24/06–30/06", label: "QUARTAS DE FINAL" },
  { semana: 5, periodo: "01/07–07/07", label: "SEMIFINAL" },
  { semana: 6, periodo: "08/07–14/07", label: "SEMIFINAL" },
  { semana: 7, periodo: "15/07–21/07", label: "FINAL & 3º LUGAR" },
  { semana: 8, periodo: "22/07–28/07", label: "FINAL & 3º LUGAR" },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────
function parseDDMM(str: string | null): Date | null {
  if (!str) return null;
  const parts = str.trim().split("/");
  const d = Number(parts[0]);
  const m = Number(parts[1]);
  if (!d || !m) return null;
  return new Date(2026, m - 1, d);
}

function shortName(nome: string): string {
  const parts = nome.trim().split(/\s+/);
  if (parts.length <= 1) return parts[0] ?? nome;
  return `${parts[0]} ${parts[parts.length - 1]}`;
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "rgba(255,255,255,0.08)",
  border: "1px solid rgba(255,255,255,0.15)",
  borderRadius: 6,
  padding: "8px 12px",
  color: "#fff",
  fontSize: 14,
  outline: "none",
  boxSizing: "border-box",
};

const labelStyle: React.CSSProperties = {
  color: "rgba(255,255,255,0.5)",
  fontSize: 11,
  display: "block",
  marginBottom: 4,
  letterSpacing: 1,
  textTransform: "uppercase",
};

function btnStyle(bg: string, small = false): React.CSSProperties {
  return {
    background: bg,
    color: "#fff",
    border: "none",
    borderRadius: small ? 6 : 8,
    padding: small ? "6px 12px" : "10px 20px",
    fontSize: small ? 12 : 13,
    fontWeight: 700,
    cursor: "pointer",
    letterSpacing: 1,
    textTransform: "uppercase" as const,
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
  };
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function CopaSMQPage() {
  const { user } = useAuth();
  const isAdmin = ["admin", "superintendente", "gestor"].includes(user?.role ?? "");
  const [aba, setAba] = useState<"chaveamento" | "pontuacao" | "premiacao" | "admin">("chaveamento");

  // ── Queries ──
  const { data: dadosRaw } = trpc.copa.getDados.useQuery();
  const { data: rankingRaw = [] } = trpc.copa.getRanking.useQuery(undefined, { refetchInterval: 30000 });
  const { data: semanaData } = trpc.copa.getSemanaAtual.useQuery();
  const { data: configPontosRaw = [] } = trpc.copa.getConfigPontos.useQuery();
  const { data: configPremiosRaw = [] } = trpc.copa.getConfigPremios.useQuery();
  const { data: corretoresDispRaw = [] } = trpc.copa.getCorretoresDisponiveis.useQuery(undefined, { enabled: isAdmin });
  const { data: statusChaveamento } = trpc.copa.getStatusChaveamento.useQuery(undefined, { enabled: isAdmin, refetchInterval: 10000 });

  const dados = dadosRaw as { selecoes: Selecao[]; fases: Fase[]; confrontos: Confronto[]; corretoresCopa: CorretorCopa[] } | undefined;
  const ranking = rankingRaw as RankingItem[];
  const configPontos = configPontosRaw as ConfigPonto[];
  const configPremios = configPremiosRaw as ConfigPremio[];
  const corretoresDisp = corretoresDispRaw as CorretorDisponivel[];
  const semanaAtual = semanaData?.semana ?? 1;

  const utils = trpc.useUtils();

  // ── Dados derivados ──
  const corretoresCopa = useMemo(() => (dados?.corretoresCopa ?? []) as (CorretorCopa & { grupo?: string | null })[], [dados]);
  const fases = useMemo(() => dados?.fases ?? [], [dados]);
  const confrontos = useMemo(() => dados?.confrontos ?? [], [dados]);

  const faseAtual = useMemo(() => {
    if (!fases.length) return null;
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const found = fases.find(f => {
      const ini = parseDDMM(f.semanaInicio);
      const fim = parseDDMM(f.semanaFim);
      if (!ini || !fim) return false;
      fim.setHours(23, 59, 59);
      return hoje >= ini && hoje <= fim;
    });
    return found ?? fases[0] ?? null;
  }, [fases]);

  // Grupos
  const grupos = useMemo(() => {
    const map: Record<string, (CorretorCopa & { grupo?: string | null })[]> = {};
    for (const c of corretoresCopa) {
      const g = c.grupo ?? "?";
      if (!map[g]) map[g] = [];
      map[g].push(c);
    }
    return map;
  }, [corretoresCopa]);
  const gruposOrdenados = useMemo(() => Object.keys(grupos).filter(g => g !== "?").sort(), [grupos]);

  // Fases específicas
  const faseGrupos = fases.find(f => f.ordem === 1 || f.nome?.toLowerCase().includes("grupo"));
  const faseRepescagem = fases.find(f => f.nome?.toLowerCase().includes("repescagem"));
  const faseQuartas = fases.find(f => f.nome?.toLowerCase().includes("quarta"));
  const faseSemi = fases.find(f => f.nome?.toLowerCase().includes("semi"));
  const faseTerceiro = fases.find(f => f.nome?.toLowerCase().includes("3") || f.nome?.toLowerCase().includes("terceiro"));
  const faseFinal = fases.find(f => f.nome?.toLowerCase().includes("final") && !f.nome?.toLowerCase().includes("semi") && !f.nome?.toLowerCase().includes("3"));

  // Meus confrontos (fase de grupos) — filtrado pelo corretor logado; admin vê todos
  const meusConfrontos = useMemo(() => {
    if (!user?.id) return [];
    const fgId = faseGrupos?.id ?? 1;
    if (isAdmin) {
      // Admin vê todos os confrontos da fase de grupos
      return confrontos.filter(c => c.faseId === fgId && (c.corretorAId || c.corretorBId));
    }
    const myId = Number(user.id);
    return confrontos.filter(c =>
      c.faseId === fgId &&
      (Number(c.corretorAId) === myId || Number(c.corretorBId) === myId)
    );
  }, [confrontos, user?.id, faseGrupos, isAdmin]);

  function confrontosDaFase(faseId: number) {
    return confrontos.filter(c => c.faseId === faseId && (c.corretorAId || c.corretorBId));
  }

  function nomeCorretor(id: number | null): string {
    if (!id) return "A definir";
    const c = corretoresCopa.find(c => Number(c.corretorId) === Number(id));
    return c ? shortName(c.nome) : `#${id}`;
  }

  function selecaoCorretor(id: number | null): { nome: string; bandeira: string } | null {
    if (!id) return null;
    const c = corretoresCopa.find(c => Number(c.corretorId) === Number(id));
    if (!c) return null;
    return { nome: c.selecaoNome ?? "", bandeira: c.selecaoBandeira ?? "🏳️" };
  }

  function ptsPorCorretor(id: number | null): number {
    if (!id) return 0;
    return ranking.find(r => Number(r.corretorId) === Number(id))?.totalPontos ?? 0;
  }

  // ── Mutations ──
  const setVencedorMut = trpc.copa.setVencedor.useMutation({
    onSuccess: () => { utils.copa.getDados.invalidate(); utils.copa.getRanking.invalidate(); toast.success("Vencedor definido!"); },
    onError: (e) => toast.error(e.message),
  });

  const updatePontosMut = trpc.copa.updateConfigPontos.useMutation({
    onSuccess: () => { utils.copa.getConfigPontos.invalidate(); toast.success("Pontuação atualizada!"); setEditandoPontos(false); },
    onError: (e) => toast.error(e.message),
  });

  const updatePremioMut = trpc.copa.updateConfigPremio.useMutation({
    onSuccess: () => { utils.copa.getConfigPremios.invalidate(); toast.success("Prêmio atualizado!"); setEditandoPremio(null); },
    onError: (e) => toast.error(e.message),
  });

  const setParticipantesMut = trpc.copa.setParticipantes.useMutation({
    onSuccess: () => { utils.copa.getCorretoresDisponiveis.invalidate(); utils.copa.getDados.invalidate(); toast.success("Participantes salvos!"); },
    onError: (e) => toast.error(e.message),
  });

  const realizarSorteioMut = trpc.copa.realizarSorteio.useMutation({
    onSuccess: (res) => { utils.copa.getDados.invalidate(); utils.copa.getRanking.invalidate(); toast.success(`Sorteio realizado! ${res.participantes} participantes.`); },
    onError: (e) => toast.error(e.message),
  });

  const salvarPontuacaoMut = trpc.copa.salvarPontuacao.useMutation({
    onSuccess: () => { utils.copa.getRanking.invalidate(); toast.success("Pontuação lançada!"); setPontosLancar({ agendamentos: 0, visitas: 0, documentacao: 0, vendas: 0 }); },
    onError: (e) => toast.error(e.message),
  });

  const avancarFaseMut = trpc.copa.avancarFase.useMutation({
    onSuccess: (res) => { utils.copa.getDados.invalidate(); utils.copa.getStatusChaveamento.invalidate(); toast.success(`Fase avançada! Próxima: ${res.proximaFase}`); },
    onError: (e) => toast.error(e.message),
  });

  const inicializarMut = trpc.copa.inicializarDados.useMutation({
    onSuccess: () => { utils.copa.getConfigPontos.invalidate(); utils.copa.getConfigPremios.invalidate(); utils.copa.getDados.invalidate(); toast.success("Copa inicializada!"); },
    onError: (e) => toast.error(e.message),
  });

  // ── Estado Admin ──
  const [editandoPontos, setEditandoPontos] = useState(false);
  const [pontosDraft, setPontosDraft] = useState<Record<string, number>>({});
  const [editandoPremio, setEditandoPremio] = useState<number | null>(null);
  const [premioDraft, setPremioDraft] = useState<Partial<ConfigPremio>>({});
  const [selecionados, setSelecionados] = useState<Set<number>>(new Set());
  const [semanaLancar, setSemanaLancar] = useState(semanaAtual);
  const [corretorLancar, setCorretorLancar] = useState<number | null>(null);
  const [pontosLancar, setPontosLancar] = useState({ agendamentos: 0, visitas: 0, documentacao: 0, vendas: 0 });

  useEffect(() => {
    if (corretoresDisp.length > 0) {
      setSelecionados(new Set(corretoresDisp.filter(c => c.naCopa).map(c => c.id)));
    }
  }, [corretoresDisp]);

  useEffect(() => {
    if (configPontos.length > 0) {
      const draft: Record<string, number> = {};
      configPontos.forEach(p => { draft[p.chave] = p.pontos; });
      setPontosDraft(draft);
    }
  }, [configPontos]);

  const semanaLabel = SEMANAS[semanaAtual - 1];

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div style={{ background: "#0a1628", minHeight: "100vh", color: "#fff", fontFamily: "'Inter', sans-serif" }}>
      {/* HEADER */}
      <div style={{ background: "linear-gradient(180deg, #0d1f3c 0%, #0a1628 100%)", borderBottom: "2px solid #009c3b", padding: "24px 32px" }}>
        <div style={{ maxWidth: 1280, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ fontSize: 52, lineHeight: 1, filter: "drop-shadow(0 0 12px #ffdf00)" }}>🏆</div>
            <div>
              <div style={{ color: "#009c3b", fontSize: 34, fontWeight: 900, letterSpacing: 2, textTransform: "uppercase", lineHeight: 1 }}>
                COPA SMQ 2026
              </div>
              <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 12, letterSpacing: 3, textTransform: "uppercase", marginTop: 3 }}>
                CAMPEONATO DE VENDAS · SEU METRO QUADRADO
              </div>
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ color: "#009c3b", fontSize: 18, fontWeight: 700, letterSpacing: 1 }}>03 JUN → 26 JUL 2026</div>
            <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 12, letterSpacing: 2, textTransform: "uppercase" }}>
              8 SEMANAS · {corretoresCopa.length} CORRETORES · R$ 7.250 EM PRÊMIOS
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "flex-end", marginTop: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#009c3b", display: "inline-block", boxShadow: "0 0 6px #009c3b" }} />
              <span style={{ color: "#009c3b", fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase" }}>
                SEMANA {semanaAtual} — {semanaLabel?.label ?? "EM ANDAMENTO"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ABAS */}
      <div style={{ background: "#0d1f3c", borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
        <div style={{ maxWidth: 1280, margin: "0 auto", display: "flex" }}>
          {([
            { key: "chaveamento", icon: "⚽", label: "CHAVEAMENTO" },
            { key: "pontuacao", icon: "📊", label: "PONTUAÇÃO" },
            { key: "premiacao", icon: "🏅", label: "PREMIAÇÃO" },
            ...(isAdmin ? [{ key: "admin", icon: "⚙️", label: "ADMIN" }] : []),
          ] as { key: string; icon: string; label: string }[]).map(tab => (
            <button
              key={tab.key}
              onClick={() => setAba(tab.key as typeof aba)}
              style={{
                padding: "14px 24px",
                background: "transparent",
                border: "none",
                borderBottom: aba === tab.key ? "3px solid #009c3b" : "3px solid transparent",
                color: aba === tab.key ? "#fff" : "rgba(255,255,255,0.5)",
                fontSize: 13,
                fontWeight: 700,
                letterSpacing: 2,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 8,
                transition: "all 0.2s",
              }}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* CONTEÚDO */}
      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "32px 24px" }}>

        {/* ── ABA CHAVEAMENTO ── */}
        {aba === "chaveamento" && (
          <div>
            {/* Calendário */}
            <SectionTitle>CALENDÁRIO DO CAMPEONATO</SectionTitle>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 12, marginBottom: 40 }}>
              {SEMANAS.map(s => {
                const isAtual = s.semana === semanaAtual;
                return (
                  <div key={s.semana} style={{
                    background: isAtual ? "rgba(0,156,59,0.15)" : "rgba(255,255,255,0.03)",
                    border: `1px solid ${isAtual ? "#009c3b" : "rgba(255,255,255,0.1)"}`,
                    borderRadius: 8,
                    padding: "14px 12px",
                    textAlign: "center",
                    position: "relative",
                  }}>
                    {isAtual && (
                      <div style={{ position: "absolute", top: 6, right: 8, background: "#009c3b", color: "#fff", fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 4, letterSpacing: 1 }}>
                        AO VIVO
                      </div>
                    )}
                    <div style={{ color: isAtual ? "#009c3b" : "rgba(255,255,255,0.4)", fontSize: 32, fontWeight: 900, lineHeight: 1 }}>{s.semana}</div>
                    <div style={{ color: isAtual ? "#fff" : "rgba(255,255,255,0.6)", fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", marginTop: 4 }}>{s.label}</div>
                    <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 10, marginTop: 2 }}>{s.periodo}</div>
                  </div>
                );
              })}
            </div>

            {/* Fase de Grupos */}
            {faseGrupos && (
              <div style={{ marginBottom: 48 }}>
                <FaseHeader
                  nome="FASE DE GRUPOS"
                  periodo={`SEMANAS 1–2 · ${faseGrupos.semanaInicio ?? "03/06"} A ${faseGrupos.semanaFim ?? "16/06"}`}
                />
                <p style={{ color: "rgba(255,255,255,0.55)", fontSize: 13, marginBottom: 20, lineHeight: 1.6 }}>
                  {corretoresCopa.length} corretores em {gruposOrdenados.length} grupos. O 1º de cada grupo avança direto para as Quartas.
                  O melhor 2º colocado (wild card) também avança. Os demais entram na{" "}
                  <span style={{ color: "#e53e3e", fontWeight: 700 }}>Repescagem</span>.
                </p>
                <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(gruposOrdenados.length, 4)}, 1fr)`, gap: 16 }}>
                  {gruposOrdenados.map(grupo => (
                    <GrupoCard
                      key={grupo}
                      grupo={grupo}
                      corretores={grupos[grupo]}
                      ranking={ranking}
                      semanaAtual={semanaAtual}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Meus Confrontos — corretores veem os seus; admin vê todos */}
            {meusConfrontos.length > 0 && (
              <div style={{ marginBottom: 48 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
                  <div style={{ width: 4, height: 28, background: "#009c3b", borderRadius: 2 }} />
                  <div style={{ color: "#fff", fontSize: 18, fontWeight: 900, letterSpacing: 2, textTransform: "uppercase" }}>{isAdmin ? "⚽ TODOS OS CONFRONTOS" : "⚽ MEUS CONFRONTOS"}</div>
                  <div style={{ background: "rgba(0,156,59,0.15)", border: "1px solid rgba(0,156,59,0.3)", borderRadius: 20, padding: "4px 12px", color: "#009c3b", fontSize: 12, fontWeight: 700 }}>
                    {meusConfrontos.length} {isAdmin ? "confrontos" : "duelos"}
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {meusConfrontos.map(c => {
                    const isA = !isAdmin && Number(c.corretorAId) === Number(user?.id);
                    // Para admin: sempre mostra A vs B; para corretor: mostra "Você" vs adversário
                    const leftId = isAdmin ? c.corretorAId : (isA ? c.corretorAId : c.corretorBId);
                    const rightId = isAdmin ? c.corretorBId : (isA ? c.corretorBId : c.corretorAId);
                    const selLeft = selecaoCorretor(leftId);
                    const selRight = selecaoCorretor(rightId);
                    const ptsLeft = ptsPorCorretor(leftId);
                    const ptsRight = ptsPorCorretor(rightId);
                    const leftWon = c.vencedorId && Number(c.vencedorId) === Number(leftId);
                    const rightWon = c.vencedorId && Number(c.vencedorId) === Number(rightId);
                    const isMyWin = !isAdmin && leftWon;
                    const isMyLoss = !isAdmin && rightWon;
                    return (
                      <div key={c.id} style={{
                        background: isMyWin ? "rgba(0,156,59,0.12)" : isMyLoss ? "rgba(229,62,62,0.08)" : "rgba(255,255,255,0.04)",
                        border: `1px solid ${isMyWin ? "rgba(0,156,59,0.4)" : isMyLoss ? "rgba(229,62,62,0.3)" : "rgba(255,255,255,0.1)"}`,
                        borderRadius: 10,
                        padding: "16px 20px",
                        display: "flex",
                        alignItems: "center",
                        gap: 16,
                      }}>
                        {/* Lado esquerdo */}
                        <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1 }}>
                          <span style={{ fontSize: 40, lineHeight: 1 }}>{selLeft?.bandeira ?? "🏳️"}</span>
                          <div>
                            <div style={{ color: "#009c3b", fontSize: 16, fontWeight: 800 }}>{selLeft?.nome ?? "A definir"}</div>
                            <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 13, fontWeight: 600 }}>{isAdmin ? nomeCorretor(leftId) : "Você"}</div>
                          </div>
                        </div>
                        {/* Placar */}
                        <div style={{ textAlign: "center", minWidth: 90 }}>
                          <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 10, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", marginBottom: 4 }}>SEM {c.semanaRef ?? 1}</div>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "center" }}>
                            <span style={{ color: leftWon ? "#009c3b" : "#fff", fontSize: 24, fontWeight: 900 }}>{ptsLeft}</span>
                            <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 16 }}>×</span>
                            <span style={{ color: rightWon ? "#009c3b" : "#fff", fontSize: 24, fontWeight: 900 }}>{ptsRight}</span>
                          </div>
                          {c.vencedorId ? (
                            <div style={{ fontSize: 11, fontWeight: 700, marginTop: 4, color: leftWon ? "#009c3b" : rightWon ? "#e53e3e" : "#fff" }}>
                              {leftWon ? (isAdmin ? `✅ ${selLeft?.nome ?? ""} venceu` : "✅ VITÓRIA") : (isAdmin ? `✅ ${selRight?.nome ?? ""} venceu` : "❌ DERROTA")}
                            </div>
                          ) : (
                            <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 11, marginTop: 4 }}>EM ANDAMENTO</div>
                          )}
                        </div>
                        {/* Lado direito */}
                        <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, justifyContent: "flex-end" }}>
                          <div style={{ textAlign: "right" }}>
                            <div style={{ color: "#fff", fontSize: 16, fontWeight: 800 }}>{selRight?.nome ?? "A definir"}</div>
                            <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 13, fontWeight: 600 }}>{nomeCorretor(rightId)}</div>
                          </div>
                          <span style={{ fontSize: 40, lineHeight: 1 }}>{selRight?.bandeira ?? "🏳️"}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Repescagem */}
            {faseRepescagem && (
              <div style={{ marginBottom: 48 }}>
                <FaseHeader
                  nome="REPESCAGEM – SEGUNDA CHANCE"
                  periodo={`SEMANA 3 · ${faseRepescagem.semanaInicio ?? "17/06"} A ${faseRepescagem.semanaFim ?? "23/06"}`}
                  cor="#e53e3e"
                />
                <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, padding: 24 }}>
                  <p style={{ color: "rgba(255,255,255,0.55)", fontSize: 13, marginBottom: 16, lineHeight: 1.6 }}>
                    Os eliminados da fase de grupos disputam duelos. Os vencedores avançam para as Quartas de Final.
                  </p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                    {confrontosDaFase(faseRepescagem.id).length > 0
                      ? confrontosDaFase(faseRepescagem.id).map(c => {
                          const selA = selecaoCorretor(c.corretorAId);
                          const selB = selecaoCorretor(c.corretorBId);
                          return (
                            <div key={c.id} style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "10px 14px", display: "flex", alignItems: "center", gap: 8 }}>
                              <span style={{ fontSize: 20 }}>{selA?.bandeira ?? "🏳️"}</span>
                              <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 12 }}>VS</span>
                              <span style={{ fontSize: 20 }}>{selB?.bandeira ?? "🏳️"}</span>
                              <div style={{ marginLeft: 4 }}>
                                <div style={{ color: "#fff", fontSize: 12, fontWeight: 700 }}>{selA?.nome ?? "A definir"} vs {selB?.nome ?? "A definir"}</div>
                                <div style={{ color: "#e53e3e", fontSize: 11 }}>{nomeCorretor(c.corretorAId)} vs {nomeCorretor(c.corretorBId)}</div>
                              </div>
                            </div>
                          );
                        })
                      : (
                        <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 13 }}>
                          Aguardando resultado da fase de grupos para definir os participantes da repescagem.
                        </div>
                      )
                    }
                  </div>
                </div>
              </div>
            )}

            {/* Fase Eliminatória */}
            {(faseQuartas || faseSemi || faseFinal) && (
              <div style={{ marginBottom: 48 }}>
                <FaseHeader nome="FASE ELIMINATÓRIA" periodo="SEMANAS 3–8 · QUARTAS → SEMIFINAL → FINAL" />
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 20 }}>
                  {/* Quartas */}
                  <div>
                    <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", textAlign: "center", marginBottom: 12 }}>
                      ⚔️ QUARTAS DE FINAL
                    </div>
                    {faseQuartas
                      ? confrontosDaFase(faseQuartas.id).length > 0
                        ? confrontosDaFase(faseQuartas.id).map(c => (
                            <ConfrontoCard key={c.id} confronto={c} nomeCorretor={nomeCorretor} selecaoCorretor={selecaoCorretor} ptsPorCorretor={ptsPorCorretor} />
                          ))
                        : [0, 1, 2, 3].map(i => <ConfrontoPlaceholder key={i} />)
                      : [0, 1, 2, 3].map(i => <ConfrontoPlaceholder key={i} />)
                    }
                  </div>
                  {/* Semifinal */}
                  <div>
                    <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", textAlign: "center", marginBottom: 12 }}>
                      🏃 SEMIFINAL
                    </div>
                    {faseSemi
                      ? confrontosDaFase(faseSemi.id).length > 0
                        ? confrontosDaFase(faseSemi.id).map(c => (
                            <ConfrontoCard key={c.id} confronto={c} nomeCorretor={nomeCorretor} selecaoCorretor={selecaoCorretor} ptsPorCorretor={ptsPorCorretor} />
                          ))
                        : [0, 1].map(i => <ConfrontoPlaceholder key={i} />)
                      : [0, 1].map(i => <ConfrontoPlaceholder key={i} />)
                    }
                  </div>
                  {/* Final */}
                  <div>
                    <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", textAlign: "center", marginBottom: 12 }}>
                      🏆 GRANDE FINAL
                    </div>
                    {faseFinal
                      ? confrontosDaFase(faseFinal.id).length > 0
                        ? confrontosDaFase(faseFinal.id).map(c => (
                            <ConfrontoCard key={c.id} confronto={c} nomeCorretor={nomeCorretor} selecaoCorretor={selecaoCorretor} ptsPorCorretor={ptsPorCorretor} />
                          ))
                        : <ConfrontoPlaceholder />
                      : <ConfrontoPlaceholder />
                    }
                    {faseTerceiro && (
                      <>
                        <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", textAlign: "center", margin: "16px 0 12px" }}>
                          🥉 DISPUTA 3º LUGAR
                        </div>
                        {confrontosDaFase(faseTerceiro.id).length > 0
                          ? confrontosDaFase(faseTerceiro.id).map(c => (
                              <ConfrontoCard key={c.id} confronto={c} nomeCorretor={nomeCorretor} selecaoCorretor={selecaoCorretor} ptsPorCorretor={ptsPorCorretor} />
                            ))
                          : <ConfrontoPlaceholder />
                        }
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}

            {corretoresCopa.length === 0 && fases.length === 0 && (
              <div style={{ textAlign: "center", padding: "60px 20px", color: "rgba(255,255,255,0.4)" }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>⚽</div>
                <div style={{ fontSize: 16, marginBottom: 8 }}>Chaveamento ainda não configurado.</div>
                {isAdmin && <div style={{ fontSize: 13 }}>Acesse a aba Admin para inicializar a Copa.</div>}
              </div>
            )}
          </div>
        )}

        {/* ── ABA PONTUAÇÃO ── */}
        {aba === "pontuacao" && (
          <div>
            <SectionTitle>TABELA DE PONTUAÇÃO GERAL</SectionTitle>
            <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 13, marginBottom: 20 }}>
              Pontuação acumulada de toda a competição. Dentro de cada duelo, somente a pontuação da semana conta para o avanço.
            </p>

            {/* Legenda pontos */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 20 }}>
              {configPontos.map(p => (
                <div key={p.chave} style={{ background: "rgba(0,156,59,0.1)", border: "1px solid rgba(0,156,59,0.3)", borderRadius: 8, padding: "8px 14px", display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ color: "rgba(255,255,255,0.6)", fontSize: 13 }}>{p.label}</span>
                  <span style={{ color: "#009c3b", fontSize: 16, fontWeight: 900 }}>+{p.pontos} pts</span>
                </div>
              ))}
            </div>

            <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, overflow: "hidden" }}>
              {/* Cabeçalho */}
              <div style={{ display: "grid", gridTemplateColumns: "60px 1fr 90px 90px 90px 90px 90px", padding: "12px 20px", background: "rgba(0,0,0,0.3)", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                {["#", "SELEÇÃO / CORRETOR", "📅 AGEND", "🏠 VISITAS", "📄 DOCS", "✅ VENDAS", "TOTAL PTS"].map((h, i) => (
                  <div key={i} style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, fontWeight: 700, letterSpacing: 1, textAlign: i > 1 ? "center" : "left" }}>{h}</div>
                ))}
              </div>
              {/* Linhas */}
              {ranking.length === 0 ? (
                <div style={{ padding: "40px 20px", textAlign: "center", color: "rgba(255,255,255,0.3)" }}>Nenhuma pontuação registrada ainda.</div>
              ) : (
                ranking.map((r, idx) => {
                  const isMe = Number(r.corretorId) === Number(user?.id);
                  return (
                    <div key={r.corretorId} style={{
                      display: "grid",
                      gridTemplateColumns: "60px 1fr 90px 90px 90px 90px 90px",
                      padding: "14px 20px",
                      borderBottom: "1px solid rgba(255,255,255,0.05)",
                      background: isMe ? "rgba(0,156,59,0.08)" : idx % 2 === 0 ? "transparent" : "rgba(255,255,255,0.01)",
                      alignItems: "center",
                    }}>
                      <div style={{ color: r.posicao <= 3 ? "#ffdf00" : "rgba(255,255,255,0.4)", fontSize: 18, fontWeight: 900 }}>
                        {r.posicao === 1 ? "🥇" : r.posicao === 2 ? "🥈" : r.posicao === 3 ? "🥉" : r.posicao}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ fontSize: 24 }}>{r.selecao?.bandeira ?? "🏳️"}</span>
                        <div>
                          <div style={{ color: "#fff", fontSize: 14, fontWeight: 700 }}>{r.selecao?.nome ?? "Sem seleção"}</div>
                          <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 11 }}>
                            {shortName(r.nome)}
                            {isMe && <span style={{ color: "#009c3b", marginLeft: 6, fontWeight: 700 }}>● Você</span>}
                          </div>
                        </div>
                      </div>
                      {[r.totalAgendamentos, r.totalVisitas, r.totalDocumentacao, r.totalVendas].map((v, i) => (
                        <div key={i} style={{ textAlign: "center", color: "rgba(255,255,255,0.7)", fontSize: 14, fontWeight: 600 }}>{v}</div>
                      ))}
                      <div style={{ textAlign: "center", color: "#009c3b", fontSize: 16, fontWeight: 900 }}>{r.totalPontos}</div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* ── ABA PREMIAÇÃO ── */}
        {aba === "premiacao" && (
          <div>
            <SectionTitle>PREMIAÇÃO OFICIAL</SectionTitle>

            {/* Prêmios principais (ordem 3 = 3º lugar, 4 = vice, 5 = campeão) */}
            {(() => {
              // Identificar campeão, vice e 3º lugar pelos nomes da posição ou pela ordem (maior = mais importante)
              const sorted = [...configPremios].sort((a, b) => b.ordem - a.ordem);
              const campeao = sorted.find(p => String(p.posicao).toLowerCase().includes("campe") && !String(p.posicao).toLowerCase().includes("vice")) ?? sorted[0];
              const vice = sorted.find(p => String(p.posicao).toLowerCase().includes("vice")) ?? sorted[1];
              const terceiro = sorted.find(p => String(p.posicao).toLowerCase().includes("3") || String(p.posicao).toLowerCase().includes("terceiro")) ?? sorted[2];
              const podio = [campeao, vice, terceiro].filter(Boolean) as typeof configPremios;
              const bons = configPremios.filter(p => p !== campeao && p !== vice && p !== terceiro);
              const colors = ["#b8860b", "#9e9e9e", "#cd7f32"];
              const bgs = ["rgba(184,134,11,0.15)", "rgba(158,158,158,0.1)", "rgba(205,127,50,0.1)"];
              const borders = ["rgba(184,134,11,0.4)", "rgba(158,158,158,0.3)", "rgba(205,127,50,0.3)"];
              const labels = ["CAMPEÃO", "VICE-CAMPEÃO", "3º LUGAR"];
              const sublabels = ["OURO SMQ", "PRATA SMQ", "BRONZE SMQ"];
              return (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: `repeat(${podio.length}, 1fr)`, gap: 20, marginBottom: 32 }}>
                    {podio.map((p, idx) => {
                      const vencedor = ranking[idx];
                      return (
                        <div key={p.id} style={{
                          background: bgs[idx] ?? "rgba(255,255,255,0.05)",
                          border: `1px solid ${borders[idx] ?? "rgba(255,255,255,0.1)"}`,
                          borderRadius: 12,
                          padding: 28,
                          textAlign: "center",
                        }}>
                          <div style={{ fontSize: 40, marginBottom: 8 }}>{p.icone}</div>
                          <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 11, letterSpacing: 2, textTransform: "uppercase", marginBottom: 4 }}>{labels[idx]}</div>
                          <div style={{ color: colors[idx] ?? "#fff", fontSize: 18, fontWeight: 900, letterSpacing: 1, textTransform: "uppercase", marginBottom: 4 }}>{sublabels[idx]}</div>
                          <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 13, marginBottom: 12 }}>{p.posicao}</div>
                          <div style={{ color: "#fff", fontSize: 24, fontWeight: 900 }}>
                            {vencedor && vencedor.totalPontos > 0 ? shortName(vencedor.nome) : "A definir"}
                          </div>
                          <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 13, marginTop: 8 }}>{p.descricao}</div>
                          <div style={{ color: colors[idx] ?? "#fff", fontSize: 22, fontWeight: 900, marginTop: 12 }}>{p.valor}</div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Bônus por fase */}
                  {bons.length > 0 && (
                    <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, padding: 24, marginBottom: 24 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
                        <span style={{ fontSize: 20 }}>🎁</span>
                        <span style={{ color: "#009c3b", fontSize: 16, fontWeight: 900, letterSpacing: 2, textTransform: "uppercase" }}>BÔNUS POR AVANÇO DE FASE</span>
                      </div>
                      {bons.sort((a, b) => a.ordem - b.ordem).map(p => (
                        <div key={p.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 0", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <span style={{ fontSize: 18 }}>{p.icone}</span>
                            <div>
                              <div style={{ color: "#fff", fontSize: 14, fontWeight: 600 }}>{p.posicao}</div>
                              <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 12 }}>{p.descricao}</div>
                            </div>
                          </div>
                          <span style={{ color: "#009c3b", fontSize: 16, fontWeight: 900 }}>{p.valor}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {configPremios.length === 0 && (
                    <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, padding: 24, marginBottom: 24 }}>
                      <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 13 }}>Nenhum prêmio configurado. Configure no painel Admin.</div>
                    </div>
                  )}
                </>
              );
            })()}

            <div style={{ background: "rgba(255,223,0,0.05)", border: "1px solid rgba(255,223,0,0.2)", borderRadius: 8, padding: 16, fontSize: 13, color: "rgba(255,255,255,0.5)" }}>
              💡 <strong style={{ color: "#ffdf00" }}>Prêmios definidos pelo gestor.</strong> Configure os valores no painel Admin.
            </div>
          </div>
        )}

        {/* ── ABA ADMIN ── */}
        {aba === "admin" && isAdmin && (
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            <SectionTitle>PAINEL ADMINISTRATIVO</SectionTitle>

            {/* Inicializar Copa */}
            <AdminCard title="Inicializar / Resetar Copa" color="#e53e3e" icon="🔧">
              <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 13, marginBottom: 16 }}>
                Cria as fases, seleções, configurações de pontos e prêmios padrão. Use apenas na primeira vez ou para resetar.
              </p>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
                <div style={{ background: "rgba(255,255,255,0.05)", borderRadius: 8, padding: "10px 16px", fontSize: 13 }}>
                  <span style={{ color: "rgba(255,255,255,0.5)" }}>Fases: </span>
                  <span style={{ color: "#fff", fontWeight: 700 }}>{fases.length}</span>
                </div>
                <div style={{ background: "rgba(255,255,255,0.05)", borderRadius: 8, padding: "10px 16px", fontSize: 13 }}>
                  <span style={{ color: "rgba(255,255,255,0.5)" }}>Participantes: </span>
                  <span style={{ color: "#fff", fontWeight: 700 }}>{corretoresCopa.length}</span>
                </div>
                <div style={{ background: "rgba(255,255,255,0.05)", borderRadius: 8, padding: "10px 16px", fontSize: 13 }}>
                  <span style={{ color: "rgba(255,255,255,0.5)" }}>Confrontos: </span>
                  <span style={{ color: "#fff", fontWeight: 700 }}>{confrontos.length}</span>
                </div>
              </div>
              <button
                onClick={() => { if (confirm("Inicializar/resetar dados da Copa? Isso pode sobrescrever configurações existentes.")) inicializarMut.mutate(); }}
                style={btnStyle("#e53e3e")}
                disabled={inicializarMut.isPending}
              >
                🔧 {inicializarMut.isPending ? "Inicializando..." : "Inicializar Copa SMQ"}
              </button>
            </AdminCard>

            {/* Avançar Fase */}
            {statusChaveamento?.podeAvancar && (
              <AdminCard title="Avançar Fase" color="#009c3b" icon="⏭️">
                <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 13, marginBottom: 16 }}>
                  Todos os confrontos da fase atual têm vencedor. Você pode avançar para a próxima fase.
                </p>
                <button onClick={() => avancarFaseMut.mutate()} style={btnStyle("#009c3b")} disabled={avancarFaseMut.isPending}>
                  ⏭️ {avancarFaseMut.isPending ? "Avançando..." : "Avançar para Próxima Fase"}
                </button>
              </AdminCard>
            )}

            {/* Editar Pontuação */}
            <AdminCard title="Editar Pontuação por Atividade" color="#009c3b" icon="📊">
              {!editandoPontos ? (
                <div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12, marginBottom: 16 }}>
                    {configPontos.map(p => (
                      <div key={p.id} style={{ background: "rgba(255,255,255,0.05)", borderRadius: 8, padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ color: "rgba(255,255,255,0.7)", fontSize: 14 }}>{p.label}</span>
                        <span style={{ color: "#009c3b", fontSize: 18, fontWeight: 900 }}>{p.pontos} pts</span>
                      </div>
                    ))}
                    {configPontos.length === 0 && <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 13 }}>Nenhuma configuração. Inicialize a Copa primeiro.</div>}
                  </div>
                  <button onClick={() => setEditandoPontos(true)} style={btnStyle("#009c3b")}>✏️ Editar Pontuações</button>
                </div>
              ) : (
                <div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12, marginBottom: 16 }}>
                    {configPontos.map(p => (
                      <div key={p.id} style={{ background: "rgba(255,255,255,0.05)", borderRadius: 8, padding: "12px 16px" }}>
                        <label style={labelStyle}>{p.label}</label>
                        <input
                          type="number"
                          value={pontosDraft[p.chave] ?? p.pontos}
                          onChange={e => setPontosDraft(prev => ({ ...prev, [p.chave]: Number(e.target.value) }))}
                          style={inputStyle}
                        />
                      </div>
                    ))}
                  </div>
                  <div style={{ display: "flex", gap: 10 }}>
                    <button
                      onClick={() => {
                        configPontos.forEach(p => {
                          if (pontosDraft[p.chave] !== undefined) {
                            updatePontosMut.mutate({ id: p.id, pontos: pontosDraft[p.chave] });
                          }
                        });
                      }}
                      style={btnStyle("#009c3b")}
                    >✅ Salvar</button>
                    <button onClick={() => setEditandoPontos(false)} style={btnStyle("#555")}>✕ Cancelar</button>
                  </div>
                </div>
              )}
            </AdminCard>

            {/* Editar Prêmios */}
            <AdminCard title="Editar Prêmios" color="#f6ad55" icon="🏆">
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {configPremios.sort((a, b) => a.ordem - b.ordem).map(p => (
                  <div key={p.id} style={{ background: "rgba(255,255,255,0.04)", borderRadius: 8, padding: "12px 16px" }}>
                    {editandoPremio === p.id ? (
                      <div style={{ display: "grid", gridTemplateColumns: "80px 1fr 1fr auto", gap: 10, alignItems: "end" }}>
                        <div>
                          <label style={labelStyle}>Ícone</label>
                          <input value={premioDraft.icone ?? p.icone} onChange={e => setPremioDraft(prev => ({ ...prev, icone: e.target.value }))} style={inputStyle} />
                        </div>
                        <div>
                          <label style={labelStyle}>Descrição</label>
                          <input value={premioDraft.descricao ?? p.descricao} onChange={e => setPremioDraft(prev => ({ ...prev, descricao: e.target.value }))} style={inputStyle} />
                        </div>
                        <div>
                          <label style={labelStyle}>Valor</label>
                          <input value={premioDraft.valor ?? p.valor} onChange={e => setPremioDraft(prev => ({ ...prev, valor: e.target.value }))} style={inputStyle} />
                        </div>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button onClick={() => updatePremioMut.mutate({ id: p.id, icone: premioDraft.icone ?? p.icone, descricao: premioDraft.descricao ?? p.descricao, valor: premioDraft.valor ?? p.valor })} style={btnStyle("#009c3b", true)}>✅</button>
                          <button onClick={() => setEditandoPremio(null)} style={btnStyle("#555", true)}>✕</button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                          <span style={{ fontSize: 24 }}>{p.icone}</span>
                          <div>
                            <div style={{ color: "#fff", fontSize: 14, fontWeight: 700 }}>{p.descricao}</div>
                            <div style={{ color: "#009c3b", fontSize: 16, fontWeight: 900 }}>{p.valor}</div>
                          </div>
                        </div>
                        <button onClick={() => { setEditandoPremio(p.id); setPremioDraft({ icone: p.icone, descricao: p.descricao, valor: p.valor }); }} style={btnStyle("#f6ad55", true)}>✏️ Editar</button>
                      </div>
                    )}
                  </div>
                ))}
                {configPremios.length === 0 && <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 13 }}>Nenhum prêmio configurado. Inicialize a Copa primeiro.</div>}
              </div>
            </AdminCard>

            {/* Gerenciar Participantes */}
            <AdminCard title="Gerenciar Participantes" color="#4299e1" icon="👥">
              <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 13, marginBottom: 16 }}>
                {selecionados.size} selecionados de {corretoresDisp.length} disponíveis
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 8, marginBottom: 16, maxHeight: 300, overflowY: "auto" }}>
                {corretoresDisp.map(c => {
                  const sel = selecionados.has(c.id);
                  return (
                    <label key={c.id} style={{
                      display: "flex", alignItems: "center", gap: 10, padding: "10px 12px",
                      background: sel ? "rgba(66,153,225,0.15)" : "rgba(255,255,255,0.03)",
                      border: `1px solid ${sel ? "rgba(66,153,225,0.4)" : "rgba(255,255,255,0.08)"}`,
                      borderRadius: 8, cursor: "pointer",
                    }}>
                      <input
                        type="checkbox"
                        checked={sel}
                        onChange={() => setSelecionados(prev => {
                          const next = new Set(prev);
                          if (next.has(c.id)) next.delete(c.id); else next.add(c.id);
                          return next;
                        })}
                        style={{ accentColor: "#4299e1" }}
                      />
                      <div>
                        <div style={{ color: "#fff", fontSize: 13, fontWeight: 600 }}>{shortName(c.nome)}</div>
                        <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 11 }}>{c.role}</div>
                      </div>
                    </label>
                  );
                })}
                {corretoresDisp.length === 0 && <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 13 }}>Nenhum usuário disponível.</div>}
              </div>
              <button onClick={() => setParticipantesMut.mutate({ corretorIds: Array.from(selecionados) })} style={btnStyle("#4299e1")} disabled={setParticipantesMut.isPending}>
                💾 {setParticipantesMut.isPending ? "Salvando..." : "Salvar Participantes"}
              </button>
            </AdminCard>

            {/* Sorteio */}
            <AdminCard title="Sorteio Automático de Seleções" color="#9f7aea" icon="🎲">
              <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 13, marginBottom: 16 }}>
                Atribui aleatoriamente uma seleção para cada participante e cria os confrontos da fase de grupos.
                {corretoresCopa.length > 0 && <span style={{ color: "#e53e3e" }}> Atenção: irá substituir o sorteio atual!</span>}
              </p>
              <button
                onClick={() => { if (confirm("Confirmar sorteio? Isso substituirá o sorteio atual.")) realizarSorteioMut.mutate(); }}
                style={btnStyle("#9f7aea")}
                disabled={realizarSorteioMut.isPending}
              >
                🎲 {realizarSorteioMut.isPending ? "Sorteando..." : "Realizar Sorteio"}
              </button>
            </AdminCard>

            {/* Lançar Pontuação Manual */}
            <AdminCard title="Lançar Pontuação Manual" color="#ed8936" icon="✏️">
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
                <div>
                  <label style={labelStyle}>Corretor</label>
                  <select value={corretorLancar ?? ""} onChange={e => setCorretorLancar(Number(e.target.value))} style={inputStyle}>
                    <option value="">Selecionar...</option>
                    {corretoresCopa.map(c => (
                      <option key={c.corretorId} value={c.corretorId}>
                        {shortName(c.nome)} — {c.selecaoBandeira} {c.selecaoNome}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Semana</label>
                  <select value={semanaLancar} onChange={e => setSemanaLancar(Number(e.target.value))} style={inputStyle}>
                    {SEMANAS.map(s => <option key={s.semana} value={s.semana}>Semana {s.semana} — {s.label}</option>)}
                  </select>
                </div>
                {(["agendamentos", "visitas", "documentacao", "vendas"] as const).map(f => {
                  const labels: Record<string, string> = { agendamentos: "Agendamentos", visitas: "Visitas", documentacao: "Docs/Análise", vendas: "Vendas" };
                  return (
                    <div key={f}>
                      <label style={labelStyle}>{labels[f]}</label>
                      <input
                        type="number" min={0}
                        value={pontosLancar[f]}
                        onChange={e => setPontosLancar(prev => ({ ...prev, [f]: Number(e.target.value) }))}
                        style={inputStyle}
                      />
                    </div>
                  );
                })}
              </div>
              <button
                onClick={() => {
                  if (!corretorLancar) { toast.error("Selecione um corretor"); return; }
                  salvarPontuacaoMut.mutate({ corretorId: corretorLancar, semana: semanaLancar, ...pontosLancar });
                }}
                style={btnStyle("#ed8936")}
                disabled={salvarPontuacaoMut.isPending}
              >
                ✅ {salvarPontuacaoMut.isPending ? "Salvando..." : "Lançar Pontuação"}
              </button>
            </AdminCard>

            {/* Definir Vencedores */}
            <AdminCard title="Definir Vencedores dos Confrontos" color="#e53e3e" icon="⚔️">
              {fases.filter(f => confrontosDaFase(f.id).length > 0).map(fase => (
                <div key={fase.id} style={{ marginBottom: 20 }}>
                  <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 12, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", marginBottom: 10, display: "flex", alignItems: "center", gap: 8 }}>
                    {fase.nome}
                    <span style={{ background: "rgba(255,255,255,0.1)", borderRadius: 4, padding: "2px 8px", fontSize: 11 }}>
                      {confrontosDaFase(fase.id).filter(c => c.vencedorId).length}/{confrontosDaFase(fase.id).length}
                    </span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {confrontosDaFase(fase.id).map(c => {
                      const selA = selecaoCorretor(c.corretorAId);
                      const selB = selecaoCorretor(c.corretorBId);
                      return (
                        <div key={c.id} style={{ background: "rgba(255,255,255,0.04)", borderRadius: 8, padding: "12px 16px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                          <button
                            onClick={() => { if (c.corretorAId) setVencedorMut.mutate({ confrontoId: c.id, vencedorId: c.corretorAId }); }}
                            style={{ ...btnStyle(c.vencedorId === c.corretorAId ? "#009c3b" : "#333"), flex: 1, minWidth: 120, justifyContent: "center" }}
                          >
                            {selA?.bandeira ?? "🏳️"} {selA?.nome ?? "A definir"}
                            <span style={{ fontSize: 11, opacity: 0.7 }}>({nomeCorretor(c.corretorAId)})</span>
                          </button>
                          <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 12, fontWeight: 700 }}>VS</span>
                          <button
                            onClick={() => { if (c.corretorBId) setVencedorMut.mutate({ confrontoId: c.id, vencedorId: c.corretorBId }); }}
                            style={{ ...btnStyle(c.vencedorId === c.corretorBId ? "#009c3b" : "#333"), flex: 1, minWidth: 120, justifyContent: "center" }}
                          >
                            {selB?.bandeira ?? "🏳️"} {selB?.nome ?? "A definir"}
                            <span style={{ fontSize: 11, opacity: 0.7 }}>({nomeCorretor(c.corretorBId)})</span>
                          </button>
                          {c.vencedorId && (
                            <span style={{ color: "#009c3b", fontSize: 12, fontWeight: 700 }}>✅ {selecaoCorretor(c.vencedorId)?.nome ?? nomeCorretor(c.vencedorId)}</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
              {fases.filter(f => confrontosDaFase(f.id).length > 0).length === 0 && (
                <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 13 }}>Nenhum confronto disponível. Realize o sorteio primeiro.</div>
              )}
            </AdminCard>
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{ textAlign: "center", padding: "24px 20px", color: "rgba(255,255,255,0.2)", fontSize: 11, letterSpacing: 2, textTransform: "uppercase", borderTop: "1px solid rgba(255,255,255,0.05)" }}>
        COPA SMQ 2026 · SEU METRO QUADRADO · CAMPEONATO INTERNO DE VENDAS
      </div>
    </div>
  );
}

// ─── Sub-componentes ──────────────────────────────────────────────────────────

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 24 }}>
      <h2 style={{ color: "#009c3b", fontSize: 22, fontWeight: 900, letterSpacing: 3, textTransform: "uppercase", margin: 0 }}>{children}</h2>
      <div style={{ flex: 1, height: 2, background: "linear-gradient(90deg, rgba(0,156,59,0.5) 0%, transparent 100%)" }} />
    </div>
  );
}

function FaseHeader({ nome, periodo, cor = "#009c3b" }: { nome: string; periodo: string; cor?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 20 }}>
      <h3 style={{ color: cor, fontSize: 20, fontWeight: 900, letterSpacing: 3, textTransform: "uppercase", margin: 0 }}>{nome}</h3>
      <div style={{ background: `${cor}20`, border: `1px solid ${cor}40`, borderRadius: 6, padding: "4px 12px", color: cor, fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", whiteSpace: "nowrap" }}>
        {periodo}
      </div>
      <div style={{ flex: 1, height: 1, background: `linear-gradient(90deg, ${cor}40 0%, transparent 100%)` }} />
    </div>
  );
}

function GrupoCard({ grupo, corretores, ranking, semanaAtual }: {
  grupo: string;
  corretores: CorretorCopa[];
  ranking: RankingItem[];
  semanaAtual: number;
}) {
  const sorted = [...corretores].sort((a, b) => {
    const ptsA = ranking.find(r => Number(r.corretorId) === Number(a.corretorId))?.totalPontos ?? 0;
    const ptsB = ranking.find(r => Number(r.corretorId) === Number(b.corretorId))?.totalPontos ?? 0;
    return ptsB - ptsA;
  });

  return (
    <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, overflow: "hidden" }}>
      <div style={{ padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid rgba(255,255,255,0.08)", background: "rgba(0,156,59,0.08)" }}>
        <span style={{ color: "#009c3b", fontSize: 16, fontWeight: 900, letterSpacing: 2 }}>GRUPO {grupo}</span>
        <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, letterSpacing: 1 }}>SEM 1–2</span>
      </div>
      <div style={{ padding: "8px 16px 4px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 50px 60px", gap: 4, marginBottom: 6 }}>
          {["SELEÇÃO", "PTS", "STATUS"].map((h, i) => (
            <span key={i} style={{ color: "rgba(255,255,255,0.3)", fontSize: 10, letterSpacing: 1, textTransform: "uppercase", textAlign: i > 0 ? "center" : "left" }}>{h}</span>
          ))}
        </div>
        {sorted.map((c, idx) => {
          const r = ranking.find(r => Number(r.corretorId) === Number(c.corretorId));
          const pts = r?.totalPontos ?? 0;
          const isLider = idx === 0;
          return (
            <div key={c.corretorId} style={{ display: "grid", gridTemplateColumns: "1fr 50px 60px", gap: 4, padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.04)", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 20 }}>{c.selecaoBandeira ?? "🏳️"}</span>
                <div>
                  <div style={{ color: "#fff", fontSize: 13, fontWeight: 700 }}>{c.selecaoNome ?? "A definir"}</div>
                  <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 10 }}>{shortName(c.nome)}</div>
                </div>
              </div>
              <div style={{ textAlign: "center", color: pts > 0 ? "#ffdf00" : "rgba(255,255,255,0.5)", fontSize: 14, fontWeight: 900 }}>{pts}</div>
              <div style={{ textAlign: "center" }}>
                <span style={{
                  width: 10, height: 10, borderRadius: "50%",
                  background: isLider && semanaAtual >= 1 ? "#009c3b" : "rgba(255,255,255,0.2)",
                  display: "inline-block",
                  boxShadow: isLider ? "0 0 4px #009c3b" : "none",
                }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ConfrontoCard({ confronto, nomeCorretor, selecaoCorretor, ptsPorCorretor }: {
  confronto: Confronto;
  nomeCorretor: (id: number | null) => string;
  selecaoCorretor: (id: number | null) => { nome: string; bandeira: string } | null;
  ptsPorCorretor: (id: number | null) => number;
}) {
  const selA = selecaoCorretor(confronto.corretorAId);
  const selB = selecaoCorretor(confronto.corretorBId);
  const isVencedorA = confronto.vencedorId != null && confronto.vencedorId === confronto.corretorAId;
  const isVencedorB = confronto.vencedorId != null && confronto.vencedorId === confronto.corretorBId;

  return (
    <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, overflow: "hidden", marginBottom: 12 }}>
      {([
        { id: confronto.corretorAId, sel: selA, isVencedor: isVencedorA },
        { id: confronto.corretorBId, sel: selB, isVencedor: isVencedorB },
      ] as { id: number | null; sel: { nome: string; bandeira: string } | null; isVencedor: boolean }[]).map((p, i) => (
        <div key={i} style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "12px 16px",
          background: p.isVencedor ? "rgba(0,156,59,0.1)" : "transparent",
          borderBottom: i === 0 ? "1px solid rgba(255,255,255,0.06)" : "none",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 22, opacity: p.id ? 1 : 0.3 }}>{p.sel?.bandeira ?? "🏳️"}</span>
            <div>
              <div style={{ color: p.id ? "#fff" : "rgba(255,255,255,0.3)", fontSize: 13, fontWeight: 700 }}>{p.sel?.nome ?? "A definir"}</div>
              <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 11 }}>{nomeCorretor(p.id)}</div>
            </div>
          </div>
          <div style={{ color: p.isVencedor ? "#009c3b" : "rgba(255,255,255,0.5)", fontSize: 16, fontWeight: 900 }}>
            {p.id ? ptsPorCorretor(p.id) : "—"}
          </div>
        </div>
      ))}
      <div style={{ padding: "8px 16px", background: "rgba(0,0,0,0.2)", textAlign: "center", color: "rgba(255,255,255,0.3)", fontSize: 10, letterSpacing: 1, textTransform: "uppercase" }}>
        {confronto.vencedorId
          ? `✅ ${selecaoCorretor(confronto.vencedorId)?.nome ?? nomeCorretor(confronto.vencedorId)} venceu`
          : "AGUARDANDO PONTUAÇÃO"}
      </div>
    </div>
  );
}

function ConfrontoPlaceholder() {
  return (
    <div style={{ background: "rgba(255,255,255,0.02)", border: "1px dashed rgba(255,255,255,0.1)", borderRadius: 8, overflow: "hidden", marginBottom: 12, opacity: 0.5 }}>
      {[0, 1].map(i => (
        <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderBottom: i === 0 ? "1px solid rgba(255,255,255,0.06)" : "none" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 22, opacity: 0.3 }}>🏳️</span>
            <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 13 }}>A definir</div>
          </div>
          <div style={{ color: "rgba(255,255,255,0.2)", fontSize: 16 }}>—</div>
        </div>
      ))}
      <div style={{ padding: "8px 16px", background: "rgba(0,0,0,0.2)", textAlign: "center", color: "rgba(255,255,255,0.2)", fontSize: 10, letterSpacing: 1, textTransform: "uppercase" }}>
        AGUARDANDO FASE ANTERIOR
      </div>
    </div>
  );
}

function AdminCard({ title, color, icon, children }: { title: string; color: string; icon: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${color}40`, borderRadius: 12, padding: 24 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        <span style={{ fontSize: 20 }}>{icon}</span>
        <span style={{ color, fontSize: 16, fontWeight: 900, letterSpacing: 2, textTransform: "uppercase" }}>{title}</span>
      </div>
      {children}
    </div>
  );
}
