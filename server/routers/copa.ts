import { router, protectedProcedure } from "../_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import { sql } from "drizzle-orm";

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
      selecaoNome: row.selecaoNome ? String(row.selecaoNome) : null,
      selecaoBandeira: row.selecaoBandeira ? String(row.selecaoBandeira) : null,
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

    // Bug 5 fix: include semana_ref in mapConfronto
    const mapConfronto = (row: Record<string, unknown>) => ({
      id: Number(row.id),
      faseId: Number(row.fase_id),
      corretorAId: row.corretor_a_id ? Number(row.corretor_a_id) : null,
      corretorBId: row.corretor_b_id ? Number(row.corretor_b_id) : null,
      vencedorId: row.vencedor_id ? Number(row.vencedor_id) : null,
      semanaRef: row.semana_ref ? Number(row.semana_ref) : null,
    });

    return {
      selecoes: (selecoes as unknown as Record<string, unknown>[]).map(mapSelecao),
      fases: (fases as unknown as Record<string, unknown>[]).map(mapFase),
      confrontos: (confrontos as unknown as Record<string, unknown>[]).map(mapConfronto),
      corretoresCopa: (corretoresCopa as unknown as Record<string, unknown>[]).map(mapCorretor),
    };
  }),

  // Bug 4 fix: use UTC offset for BRT timezone (03:00 UTC = 00:00 BRT)
  getSemanaAtual: protectedProcedure.query(async () => {
    const inicio = new Date("2026-06-03T03:00:00.000Z");
    const agora = new Date();
    const diffMs = agora.getTime() - inicio.getTime();
    const diffDias = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const semana = Math.min(Math.max(Math.floor(diffDias / 7) + 1, 1), 8);
    return { semana };
  }),

  // Ranking geral — calculado em tempo real com dados do CRM + pontuação manual
  getRanking: protectedProcedure.query(async () => {
    const db = await getDb();

    const configPontosRows = await db.execute(sql`SELECT chave, pontos FROM copa_config_pontos`);
    const configMap: Record<string, number> = {};
    for (const row of configPontosRows as unknown as Record<string, unknown>[]) {
      configMap[String(row.chave)] = Number(row.pontos);
    }
    const ptAgendamento = configMap["agendamentos"] ?? 25;
    const ptVisita = configMap["visitas"] ?? 40;
    const ptDocumentacao = configMap["documentacao"] ?? 60;
    const ptVenda = configMap["vendas"] ?? 150;

    const COPA_INICIO = "2026-06-03 00:00:00";
    const COPA_FIM = "2026-07-26 23:59:59";

    const rows = await db.execute(sql`
      SELECT
        cc.corretor_id,
        u.name as nome,
        s.nome as selecao_nome,
        s.bandeira as selecao_bandeira,
        s.id as selecao_id,

        COALESCE((
          SELECT COUNT(*)
          FROM agendamentos a
          WHERE a.corretorId = cc.corretor_id
            AND a.createdAt >= ${COPA_INICIO}
            AND a.createdAt <= ${COPA_FIM}
        ), 0) as crm_agendamentos,

        COALESCE((
          SELECT COUNT(*)
          FROM lead_status_transitions lst
          WHERE lst.corretorId = cc.corretor_id
            AND lst.statusNovo = 'visita_realizada'
            AND lst.createdAt >= ${COPA_INICIO}
            AND lst.createdAt <= ${COPA_FIM}
        ), 0) as crm_visitas,

        COALESCE((
          SELECT COUNT(*)
          FROM lead_status_transitions lst
          WHERE lst.corretorId = cc.corretor_id
            AND lst.statusNovo = 'analise_credito'
            AND lst.createdAt >= ${COPA_INICIO}
            AND lst.createdAt <= ${COPA_FIM}
        ), 0) as crm_documentacao,

        COALESCE((
          SELECT COUNT(*)
          FROM lead_status_transitions lst
          WHERE lst.corretorId = cc.corretor_id
            AND lst.statusNovo = 'contrato_fechado'
            AND lst.createdAt >= ${COPA_INICIO}
            AND lst.createdAt <= ${COPA_FIM}
        ), 0) as crm_vendas,

        COALESCE((SELECT SUM(cp.agendamentos) FROM copa_pontuacoes cp WHERE cp.corretor_id = cc.corretor_id), 0) as manual_agendamentos,
        COALESCE((SELECT SUM(cp.visitas) FROM copa_pontuacoes cp WHERE cp.corretor_id = cc.corretor_id), 0) as manual_visitas,
        COALESCE((SELECT SUM(cp.documentacao) FROM copa_pontuacoes cp WHERE cp.corretor_id = cc.corretor_id), 0) as manual_documentacao,
        COALESCE((SELECT SUM(cp.vendas) FROM copa_pontuacoes cp WHERE cp.corretor_id = cc.corretor_id), 0) as manual_vendas

      FROM copa_corretores cc
      JOIN users u ON u.id = cc.corretor_id
      LEFT JOIN copa_selecoes s ON s.id = cc.selecao_id
      ORDER BY u.name ASC
    `);

    const result = (rows as unknown as Record<string, unknown>[]).map((r) => {
      const totalAgendamentos = Number(r.crm_agendamentos) + Number(r.manual_agendamentos);
      const totalVisitas = Number(r.crm_visitas) + Number(r.manual_visitas);
      const totalDocumentacao = Number(r.crm_documentacao) + Number(r.manual_documentacao);
      const totalVendas = Number(r.crm_vendas) + Number(r.manual_vendas);
      const totalPontos =
        totalAgendamentos * ptAgendamento +
        totalVisitas * ptVisita +
        totalDocumentacao * ptDocumentacao +
        totalVendas * ptVenda;

      return {
        posicao: 0,
        corretorId: Number(r.corretor_id),
        nome: String(r.nome ?? ""),
        selecao: r.selecao_id
          ? { id: Number(r.selecao_id), nome: String(r.selecao_nome ?? ""), bandeira: String(r.selecao_bandeira ?? "🏳️") }
          : null,
        totalAgendamentos,
        totalVisitas,
        totalDocumentacao,
        totalVendas,
        totalPontos,
      };
    });

    result.sort((a, b) => b.totalPontos - a.totalPontos || a.nome.localeCompare(b.nome));
    result.forEach((r, i) => { r.posicao = i + 1; });

    return result;
  }),

  getStats: protectedProcedure.query(async () => {
    const db = await getDb();
    const [countRow] = await db.execute(sql`SELECT COUNT(*) as total FROM copa_corretores`);
    return {
      corretores: Number((countRow as Record<string, unknown>).total ?? 0),
    };
  }),

  // Bug 3 fix: fetch copa_config_pontos before calculating total instead of using hardcoded values
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

      const db = await getDb();

      const configRows = await db.execute(sql`SELECT chave, pontos FROM copa_config_pontos`);
      const configMap: Record<string, number> = {};
      for (const row of configRows as unknown as Record<string, unknown>[]) {
        configMap[String(row.chave)] = Number(row.pontos);
      }

      const total =
        input.agendamentos * (configMap["agendamentos"] ?? 25) +
        input.visitas * (configMap["visitas"] ?? 40) +
        input.documentacao * (configMap["documentacao"] ?? 60) +
        input.vendas * (configMap["vendas"] ?? 150);

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

  getConfigPontos: protectedProcedure.query(async () => {
    const db = await getDb();
    const rows = await db.execute(sql`SELECT * FROM copa_config_pontos ORDER BY id`);
    return (rows as unknown as Record<string, unknown>[]).map((r) => ({
      id: Number(r.id),
      chave: String(r.chave),
      label: String(r.label),
      pontos: Number(r.pontos),
    }));
  }),

  updateConfigPontos: protectedProcedure
    .input(z.object({ chave: z.string(), pontos: z.number().min(0).max(9999) }))
    .mutation(async ({ ctx, input }) => {
      if (!isAdminOrSuperintendente(ctx.user.role)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Apenas administradores podem editar pontuações" });
      }
      const db = await getDb();
      await db.execute(sql`UPDATE copa_config_pontos SET pontos = ${input.pontos} WHERE chave = ${input.chave}`);
      return { success: true };
    }),

  getConfigPremios: protectedProcedure.query(async () => {
    const db = await getDb();
    const rows = await db.execute(sql`SELECT * FROM copa_config_premios ORDER BY ordem`);
    return (rows as unknown as Record<string, unknown>[]).map((r) => ({
      id: Number(r.id),
      posicao: String(r.posicao),
      descricao: String(r.descricao),
      valor: String(r.valor),
      icone: String(r.icone),
      ordem: Number(r.ordem),
    }));
  }),

  updateConfigPremio: protectedProcedure
    .input(z.object({ id: z.number(), posicao: z.string(), descricao: z.string(), valor: z.string(), icone: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (!isAdminOrSuperintendente(ctx.user.role)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Apenas administradores podem editar prêmios" });
      }
      const db = await getDb();
      await db.execute(sql`
        UPDATE copa_config_premios
        SET posicao = ${input.posicao}, descricao = ${input.descricao}, valor = ${input.valor}, icone = ${input.icone}
        WHERE id = ${input.id}
      `);
      return { success: true };
    }),

  getCorretoresDisponiveis: protectedProcedure.query(async () => {
    const db = await getDb();
    const rows = await db.execute(sql`
      SELECT u.id, u.name as nome, u.role,
        CASE WHEN cc.id IS NOT NULL THEN 1 ELSE 0 END as na_copa
      FROM users u
      LEFT JOIN copa_corretores cc ON cc.corretor_id = u.id
      WHERE u.role IN ('corretor', 'gestor', 'superintendente')
      ORDER BY u.name
    `);
    return (rows as unknown as Record<string, unknown>[]).map((r) => ({
      id: Number(r.id),
      nome: String(r.nome ?? ""),
      role: String(r.role ?? ""),
      naCopa: Number(r.na_copa) === 1,
    }));
  }),

  setParticipantes: protectedProcedure
    .input(z.object({ corretorIds: z.array(z.number()) }))
    .mutation(async ({ ctx, input }) => {
      if (!isAdminOrSuperintendente(ctx.user.role)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Apenas administradores podem gerenciar participantes" });
      }
      const db = await getDb();
      await db.execute(sql`DELETE FROM copa_corretores`);
      for (const id of input.corretorIds) {
        await db.execute(sql`
          INSERT INTO copa_corretores (corretor_id, selecao_id, ativo) VALUES (${id}, NULL, 1)
        `);
      }
      return { success: true };
    }),

  realizarSorteio: protectedProcedure
    .input(z.object({ confirmar: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      if (!isAdminOrSuperintendente(ctx.user.role)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Apenas administradores podem realizar o sorteio" });
      }
      if (!input.confirmar) return { success: false as const, message: "Confirmação necessária", participantes: 0, confrontos: 0 };

      const db = await getDb();

      const participantesRows = await db.execute(sql`SELECT corretor_id FROM copa_corretores ORDER BY RAND()`);
      const selecoesRows = await db.execute(sql`SELECT id FROM copa_selecoes ORDER BY RAND()`);

      const participantes = (participantesRows as unknown as Record<string, unknown>[]).map((r) => Number(r.corretor_id));
      const selecoes = (selecoesRows as unknown as Record<string, unknown>[]).map((r) => Number(r.id));

      if (participantes.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Nenhum participante cadastrado" });
      }

      for (let i = 0; i < participantes.length; i++) {
        const selecaoId = selecoes[i % selecoes.length];
        await db.execute(sql`UPDATE copa_corretores SET selecao_id = ${selecaoId} WHERE corretor_id = ${participantes[i]}`);
      }

      await db.execute(sql`DELETE FROM copa_confrontos`);

      const faseGruposRow = await db.execute(sql`SELECT id FROM copa_fases WHERE ordem = 1 LIMIT 1`);
      const faseGruposId = Number((faseGruposRow as unknown as Record<string, unknown>[])[0]?.id ?? 1);

      let posicao = 1;
      for (let i = 0; i < participantes.length - 1; i += 2) {
        const a = participantes[i];
        const b = participantes[i + 1] ?? null;
        if (b !== null) {
          await db.execute(sql`
            INSERT INTO copa_confrontos (fase_id, corretor_a_id, corretor_b_id, semana_ref, posicao)
            VALUES (${faseGruposId}, ${a}, ${b}, 1, ${posicao})
          `);
          posicao++;
        }
      }

      return { success: true as const, participantes: participantes.length, confrontos: posicao - 1 };
    }),

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

  // New: last 50 manual pontuacao entries with corretor name
  getHistoricoPontuacoes: protectedProcedure.query(async ({ ctx }) => {
    if (!isAdminOrSuperintendente(ctx.user.role)) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Apenas administradores podem ver o histórico" });
    }
    const db = await getDb();
    const rows = await db.execute(sql`
      SELECT cp.id, cp.corretor_id, cp.semana, cp.agendamentos, cp.visitas,
             cp.documentacao, cp.vendas, cp.total_pontos, cp.updated_at,
             u.name as nome_corretor
      FROM copa_pontuacoes cp
      JOIN users u ON u.id = cp.corretor_id
      ORDER BY cp.updated_at DESC
      LIMIT 50
    `);
    return (rows as unknown as Record<string, unknown>[]).map((r) => ({
      id: Number(r.id),
      corretorId: Number(r.corretor_id),
      nomeCorretor: String(r.nome_corretor ?? ""),
      semana: Number(r.semana),
      agendamentos: Number(r.agendamentos),
      visitas: Number(r.visitas),
      documentacao: Number(r.documentacao),
      vendas: Number(r.vendas),
      totalPontos: Number(r.total_pontos),
      updatedAt: r.updated_at ? String(r.updated_at) : null,
    }));
  }),

  // New: delete a pontuacao entry by id
  deletePontuacao: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      if (!isAdminOrSuperintendente(ctx.user.role)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Apenas administradores podem excluir pontuações" });
      }
      const db = await getDb();
      await db.execute(sql`DELETE FROM copa_pontuacoes WHERE id = ${input.id}`);
      return { success: true };
    }),

  // New: weekly points breakdown for the logged-in user
  getMeusPontosSemana: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    const rows = await db.execute(sql`
      SELECT semana, total_pontos
      FROM copa_pontuacoes
      WHERE corretor_id = ${ctx.user.id}
      ORDER BY semana
    `);
    return (rows as unknown as Record<string, unknown>[]).map((r) => ({
      semana: Number(r.semana),
      totalPontos: Number(r.total_pontos),
    }));
  }),
});
