import { router, protectedProcedure } from "../_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import { sql } from "drizzle-orm";

// ============================================================================
// COPA SMQ — Router de Campeonato Interno
// ============================================================================

function isAdminOrSuperintendente(role: string) {
  return role === "admin" || role === "superintendente";
}

export const copaRouter = router({
  // Dados gerais da copa (seleções, fases, confrontos, corretores)
  getDados: protectedProcedure.query(async () => {
    const db = await getDb();
    const [selecoes, fases, confrontos, corretoresCopa] = await Promise.all([
      db.execute(sql`SELECT * FROM copa_selecoes ORDER BY nome`),
      db.execute(sql`SELECT * FROM copa_fases ORDER BY ordem`),
      db.execute(sql`SELECT * FROM copa_confrontos ORDER BY id`),
      db.execute(sql`
        SELECT cc.*, u.name as nome, s.nome as selecaoNome, s.bandeira as selecaoBandeira
        FROM copa_corretores cc
        JOIN users u ON u.id = cc.corretor_id
        LEFT JOIN copa_selecoes s ON s.id = cc.selecao_id
        ORDER BY u.name
      `),
    ]);

    const mapCorretor = (row: Record<string, unknown>) => ({
      corretorId: Number(row.corretor_id),
      nome: String(row.nome ?? ""),
      selecaoId: row.selecao_id ? Number(row.selecao_id) : null,
    });

    const mapSelecao = (row: Record<string, unknown>) => ({
      id: Number(row.id),
      nome: String(row.nome ?? ""),
      bandeira: String(row.bandeira ?? "🏳️"),
    });

    const mapFase = (row: Record<string, unknown>) => ({
      id: Number(row.id),
      nome: String(row.nome ?? ""),
      ordem: Number(row.ordem ?? 0),
      semanaInicio: row.semana_inicio ? String(row.semana_inicio) : null,
      semanaFim: row.semana_fim ? String(row.semana_fim) : null,
    });

    const mapConfronto = (row: Record<string, unknown>) => ({
      id: Number(row.id),
      faseId: Number(row.fase_id),
      corretorAId: row.corretor_a_id ? Number(row.corretor_a_id) : null,
      corretorBId: row.corretor_b_id ? Number(row.corretor_b_id) : null,
      vencedorId: row.vencedor_id ? Number(row.vencedor_id) : null,
    });

    return {
      selecoes: (selecoes as unknown as Record<string, unknown>[]).map(mapSelecao),
      fases: (fases as unknown as Record<string, unknown>[]).map(mapFase),
      confrontos: (confrontos as unknown as Record<string, unknown>[]).map(mapConfronto),
      corretoresCopa: (corretoresCopa as unknown as Record<string, unknown>[]).map(mapCorretor),
    };
  }),

  // Semana atual da copa
  getSemanaAtual: protectedProcedure.query(async () => {
    const inicio = new Date("2026-06-03");
    const agora = new Date();
    const diffMs = agora.getTime() - inicio.getTime();
    const diffDias = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const semana = Math.min(Math.max(Math.floor(diffDias / 7) + 1, 1), 8);
    return { semana };
  }),

  // Ranking geral (pontuação acumulada)
  getRanking: protectedProcedure.query(async () => {
    const db = await getDb();
    const rows = await db.execute(sql`
      SELECT 
        cc.corretor_id,
        u.name as nome,
        s.nome as selecao_nome,
        s.bandeira as selecao_bandeira,
        s.id as selecao_id,
        COALESCE(SUM(cp.agendamentos), 0) as total_agendamentos,
        COALESCE(SUM(cp.visitas), 0) as total_visitas,
        COALESCE(SUM(cp.documentacao), 0) as total_documentacao,
        COALESCE(SUM(cp.vendas), 0) as total_vendas,
        COALESCE(SUM(cp.agendamentos * 25 + cp.visitas * 40 + cp.documentacao * 60 + cp.vendas * 150), 0) as total_pontos
      FROM copa_corretores cc
      JOIN users u ON u.id = cc.corretor_id
      LEFT JOIN copa_selecoes s ON s.id = cc.selecao_id
      LEFT JOIN copa_pontuacoes cp ON cp.corretor_id = cc.corretor_id
      GROUP BY cc.corretor_id, u.name, s.nome, s.bandeira, s.id
      ORDER BY total_pontos DESC, u.name ASC
    `);

    return (rows as unknown as Record<string, unknown>[]).map((r, i) => ({
      posicao: i + 1,
      corretorId: Number(r.corretor_id),
      nome: String(r.nome ?? ""),
      selecao: r.selecao_id
        ? { id: Number(r.selecao_id), nome: String(r.selecao_nome ?? ""), bandeira: String(r.selecao_bandeira ?? "🏳️") }
        : null,
      totalAgendamentos: Number(r.total_agendamentos),
      totalVisitas: Number(r.total_visitas),
      totalDocumentacao: Number(r.total_documentacao),
      totalVendas: Number(r.total_vendas),
      totalPontos: Number(r.total_pontos),
    }));
  }),

  // Estatísticas gerais
  getStats: protectedProcedure.query(async () => {
    const db = await getDb();
    const [countRow] = await db.execute(sql`SELECT COUNT(*) as total FROM copa_corretores`);
    return {
      corretores: Number((countRow as Record<string, unknown>).total ?? 0),
    };
  }),

  // Salvar pontuação semanal (apenas admin/superintendente)
  salvarPontuacao: protectedProcedure
    .input(z.object({
      corretorId: z.number(),
      semana: z.number().min(1).max(8),
      agendamentos: z.number().min(0),
      visitas: z.number().min(0),
      documentacao: z.number().min(0),
      vendas: z.number().min(0),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!isAdminOrSuperintendente(ctx.user.role)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Apenas administradores podem lançar pontuações" });
      }

      const total =
        input.agendamentos * 25 +
        input.visitas * 40 +
        input.documentacao * 60 +
        input.vendas * 150;

      // Upsert: atualiza se já existe pontuação para esse corretor+semana
      const db = await getDb();
      await db.execute(sql`
        INSERT INTO copa_pontuacoes (corretor_id, semana, agendamentos, visitas, documentacao, vendas, total_pontos, updated_at)
        VALUES (${input.corretorId}, ${input.semana}, ${input.agendamentos}, ${input.visitas}, ${input.documentacao}, ${input.vendas}, ${total}, NOW())
        ON DUPLICATE KEY UPDATE
          agendamentos = VALUES(agendamentos),
          visitas = VALUES(visitas),
          documentacao = VALUES(documentacao),
          vendas = VALUES(vendas),
          total_pontos = VALUES(total_pontos),
          updated_at = NOW()
      `);

      return { success: true, total };
    }),

  // Definir vencedor de um confronto (apenas admin/superintendente)
  setVencedor: protectedProcedure
    .input(z.object({
      confrontoId: z.number(),
      vencedorId: z.number().nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!isAdminOrSuperintendente(ctx.user.role)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Apenas administradores podem definir vencedores" });
      }

      const db = await getDb();
      await db.execute(sql`
        UPDATE copa_confrontos SET vencedor_id = ${input.vencedorId} WHERE id = ${input.confrontoId}
      `);

      return { success: true };
    }),
});
