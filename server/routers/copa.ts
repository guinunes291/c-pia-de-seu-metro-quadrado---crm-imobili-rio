import { router, protectedProcedure } from "../_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import { sql } from "drizzle-orm";

function isAdminOrSuperintendente(role: string) {
  return ["admin", "superintendente", "gestor"].includes(role);
}

/**
 * Helper: db.execute() com Drizzle + mysql2 retorna [rows, fields].
 * Esta função extrai apenas o array de rows de forma segura.
 */
function getRows(result: unknown): Record<string, unknown>[] {
  if (Array.isArray(result) && result.length >= 1 && Array.isArray(result[0])) {
    return result[0] as Record<string, unknown>[];
  }
  if (Array.isArray(result)) {
    return result as Record<string, unknown>[];
  }
  return [];
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

    const mapConfronto = (row: Record<string, unknown>) => ({
      id: Number(row.id),
      faseId: Number(row.fase_id),
      corretorAId: row.corretor_a_id ? Number(row.corretor_a_id) : null,
      corretorBId: row.corretor_b_id ? Number(row.corretor_b_id) : null,
      vencedorId: row.vencedor_id ? Number(row.vencedor_id) : null,
      semanaRef: row.semana_ref ? Number(row.semana_ref) : null,
    });

    return {
      selecoes: getRows(selecoes).map(mapSelecao),
      fases: getRows(fases).map(mapFase),
      confrontos: getRows(confrontos).map(mapConfronto),
      corretoresCopa: getRows(corretoresCopa).map(mapCorretor),
    };
  }),

  // Semana atual (BRT = UTC-3)
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

    const configResult = await db.execute(sql`SELECT chave, pontos FROM copa_config_pontos`);
    const configMap: Record<string, number> = {};
    for (const row of getRows(configResult)) {
      configMap[String(row.chave)] = Number(row.pontos);
    }
    const ptAgendamento = configMap["agendamentos"] ?? 25;
    const ptVisita = configMap["visitas"] ?? 40;
    const ptDocumentacao = configMap["documentacao"] ?? 60;
    const ptVenda = configMap["vendas"] ?? 150;

    const COPA_INICIO = "2026-06-03 00:00:00";
    const COPA_FIM = "2026-07-26 23:59:59";

    const rankingResult = await db.execute(sql`
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

    const result = getRows(rankingResult).map((r) => {
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
    const countResult = await db.execute(sql`SELECT COUNT(*) as total FROM copa_corretores`);
    const countRows = getRows(countResult);
    return {
      corretores: Number(countRows[0]?.total ?? 0),
    };
  }),

  // Lançar pontuação manual
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

      const configResult = await db.execute(sql`SELECT chave, pontos FROM copa_config_pontos`);
      const configMap: Record<string, number> = {};
      for (const row of getRows(configResult)) {
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
    const result = await db.execute(sql`SELECT * FROM copa_config_pontos ORDER BY id`);
    return getRows(result).map((r) => ({
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
    const result = await db.execute(sql`SELECT * FROM copa_config_premios ORDER BY ordem`);
    return getRows(result).map((r) => ({
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

  getCorretoresDisponiveis: protectedProcedure.query(async ({ ctx }) => {
    if (!isAdminOrSuperintendente(ctx.user.role)) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Apenas administradores podem ver corretores disponíveis" });
    }
    const db = await getDb();
    const result = await db.execute(sql`
      SELECT u.id, u.name as nome, u.role,
        CASE WHEN cc.id IS NOT NULL THEN 1 ELSE 0 END as na_copa
      FROM users u
      LEFT JOIN copa_corretores cc ON cc.corretor_id = u.id
      WHERE u.role IN ('corretor', 'gestor', 'superintendente', 'admin')
      ORDER BY u.name
    `);
    return getRows(result).map((r) => ({
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
      return { success: true, total: input.corretorIds.length };
    }),

  realizarSorteio: protectedProcedure
    .input(z.object({ confirmar: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      if (!isAdminOrSuperintendente(ctx.user.role)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Apenas administradores podem realizar o sorteio" });
      }
      if (!input.confirmar) return { success: false as const, message: "Confirmação necessária", participantes: 0, confrontos: 0 };

      const db = await getDb();

      const participantesResult = await db.execute(sql`SELECT corretor_id FROM copa_corretores ORDER BY RAND()`);
      const selecoesResult = await db.execute(sql`SELECT id FROM copa_selecoes ORDER BY RAND()`);

      const participantes = getRows(participantesResult).map((r) => Number(r.corretor_id));
      const selecoes = getRows(selecoesResult).map((r) => Number(r.id));

      if (participantes.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Nenhum participante cadastrado. Salve os participantes primeiro." });
      }

      // Atribuir seleções aleatórias
      for (let i = 0; i < participantes.length; i++) {
        const selecaoId = selecoes[i % selecoes.length];
        await db.execute(sql`UPDATE copa_corretores SET selecao_id = ${selecaoId} WHERE corretor_id = ${participantes[i]}`);
      }

      // Recriar confrontos da fase de grupos
      await db.execute(sql`DELETE FROM copa_confrontos`);

      const faseResult = await db.execute(sql`SELECT id FROM copa_fases WHERE ordem = 1 LIMIT 1`);
      const faseRows = getRows(faseResult);
      const faseGruposId = Number(faseRows[0]?.id ?? 1);

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

  // Últimas 50 pontuações manuais com nome do corretor
  getHistoricoPontuacoes: protectedProcedure.query(async ({ ctx }) => {
    if (!isAdminOrSuperintendente(ctx.user.role)) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Apenas administradores podem ver o histórico" });
    }
    const db = await getDb();
    const result = await db.execute(sql`
      SELECT cp.id, cp.corretor_id, cp.semana, cp.agendamentos, cp.visitas,
             cp.documentacao, cp.vendas, cp.total_pontos, cp.updated_at,
             u.name as nome_corretor
      FROM copa_pontuacoes cp
      JOIN users u ON u.id = cp.corretor_id
      ORDER BY cp.updated_at DESC
      LIMIT 50
    `);
    return getRows(result).map((r) => ({
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

  // Excluir lançamento manual por ID
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

  // Breakdown semanal de pontos do usuário logado
  getMeusPontosSemana: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    const result = await db.execute(sql`
      SELECT semana, total_pontos
      FROM copa_pontuacoes
      WHERE corretor_id = ${ctx.user.id}
      ORDER BY semana
    `);
    return getRows(result).map((r) => ({
      semana: Number(r.semana),
      totalPontos: Number(r.total_pontos),
    }));
  }),

  // ── Inicializar dados da Copa (idempotente) ─────────────────────────────────
  inicializarDados: protectedProcedure.mutation(async ({ ctx }) => {
    if (!isAdminOrSuperintendente(ctx.user.role)) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Apenas administradores podem inicializar a copa" });
    }
    const db = await getDb();

    const faseCount = getRows(await db.execute(sql`SELECT COUNT(*) as c FROM copa_fases`));
    if (Number(faseCount[0]?.c) === 0) {
      const fases = [
        { nome: "Fase de Grupos", ordem: 1, si: 1, sf: 3 },
        { nome: "Oitavas de Final", ordem: 2, si: 4, sf: 4 },
        { nome: "Quartas de Final", ordem: 3, si: 5, sf: 5 },
        { nome: "Semifinal", ordem: 4, si: 6, sf: 6 },
        { nome: "Disputa 3º Lugar", ordem: 5, si: 7, sf: 7 },
        { nome: "Grande Final", ordem: 6, si: 8, sf: 8 },
      ];
      for (const f of fases) {
        await db.execute(sql`INSERT INTO copa_fases (nome, ordem, semana_inicio, semana_fim) VALUES (${f.nome}, ${f.ordem}, ${f.si}, ${f.sf})`);
      }
    }

    const selCount = getRows(await db.execute(sql`SELECT COUNT(*) as c FROM copa_selecoes`));
    if (Number(selCount[0]?.c) === 0) {
      const selecoes: [string, string][] = [
        ["Brasil", "🇧🇷"], ["Argentina", "🇦🇷"], ["França", "🇫🇷"], ["Alemanha", "🇩🇪"],
        ["Espanha", "🇪🇸"], ["Inglaterra", "🇬🇧"], ["Portugal", "🇵🇹"], ["Holanda", "🇳🇱"],
        ["Bélgica", "🇧🇪"], ["Itália", "🇮🇹"], ["Croácia", "🇭🇷"], ["Uruguai", "🇺🇾"],
        ["México", "🇲🇽"], ["EUA", "🇺🇸"], ["Canadá", "🇨🇦"], ["Marrocos", "🇲🇦"],
        ["Senegal", "🇸🇳"], ["Japão", "🇯🇵"], ["Coreia do Sul", "🇰🇷"], ["Austrália", "🇦🇺"],
        ["Suíça", "🇨🇭"], ["Dinamarca", "🇩🇰"], ["Polônia", "🇵🇱"], ["Sérvia", "🇷🇸"],
        ["Colômbia", "🇨🇴"], ["Equador", "🇪🇨"], ["Chile", "🇨🇱"], ["Peru", "🇵🇪"],
        ["Gana", "🇬🇭"], ["Tunísia", "🇹🇳"], ["Camarões", "🇨🇲"], ["Costa Rica", "🇨🇷"],
      ];
      for (const [nome, bandeira] of selecoes) {
        await db.execute(sql`INSERT INTO copa_selecoes (nome, bandeira) VALUES (${nome}, ${bandeira})`);
      }
    }

    const ptCount = getRows(await db.execute(sql`SELECT COUNT(*) as c FROM copa_config_pontos`));
    if (Number(ptCount[0]?.c) === 0) {
      const pontos = [
        { chave: "agendamentos", label: "Agendamento", pontos: 25 },
        { chave: "visitas", label: "Visita Realizada", pontos: 40 },
        { chave: "documentacao", label: "Análise de Crédito", pontos: 60 },
        { chave: "vendas", label: "Venda (Contrato)", pontos: 150 },
      ];
      for (const p of pontos) {
        await db.execute(sql`INSERT INTO copa_config_pontos (chave, label, pontos) VALUES (${p.chave}, ${p.label}, ${p.pontos})`);
      }
    }

    const prCount = getRows(await db.execute(sql`SELECT COUNT(*) as c FROM copa_config_premios`));
    if (Number(prCount[0]?.c) === 0) {
      const premios = [
        { posicao: "🏆 Campeão", descricao: "Grande Final - 1º Lugar", valor: "R$ 4.000,00", icone: "🏆", ordem: 1 },
        { posicao: "🥈 Vice-Campeão", descricao: "Grande Final - 2º Lugar", valor: "R$ 2.000,00", icone: "🥈", ordem: 2 },
        { posicao: "🥉 3º Lugar", descricao: "Disputa 3º Lugar", valor: "R$ 900,00", icone: "🥉", ordem: 3 },
        { posicao: "🎖️ Semifinalista", descricao: "Avanço à Semifinal", valor: "R$ 250,00", icone: "🎖️", ordem: 4 },
        { posicao: "⭐ Top 3 Grupos", descricao: "Top 3 da Fase de Grupos", valor: "R$ 100,00", icone: "⭐", ordem: 5 },
      ];
      for (const p of premios) {
        await db.execute(sql`INSERT INTO copa_config_premios (posicao, descricao, valor, icone, ordem) VALUES (${p.posicao}, ${p.descricao}, ${p.valor}, ${p.icone}, ${p.ordem})`);
      }
    }

    return { success: true };
  }),

  // ── Status do chaveamento (qual fase pode avançar) ──────────────────────────
  getStatusChaveamento: protectedProcedure.query(async ({ ctx }) => {
    if (!isAdminOrSuperintendente(ctx.user.role)) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Acesso negado" });
    }
    const db = await getDb();

    const fases = getRows(await db.execute(sql`SELECT id, nome, ordem FROM copa_fases ORDER BY ordem`))
      .map(r => ({ id: Number(r.id), nome: String(r.nome), ordem: Number(r.ordem) }));

    if (fases.length === 0) return { podeAvancar: false, faseAtual: null as null | { id: number; nome: string; total: number; completos: number }, proximaFase: null as null | { id: number; nome: string } };

    for (const fase of fases) {
      const countRow = getRows(await db.execute(sql`
        SELECT COUNT(*) as total,
               SUM(CASE WHEN vencedor_id IS NOT NULL THEN 1 ELSE 0 END) as completos
        FROM copa_confrontos WHERE fase_id = ${fase.id}
      `));
      const row = countRow[0];
      const total = Number(row?.total ?? 0);
      const completos = Number(row?.completos ?? 0);

      if (total === 0) continue;

      if (completos < total) {
        return {
          podeAvancar: false,
          faseAtual: { id: fase.id, nome: fase.nome, total, completos },
          proximaFase: fases.find(f => f.ordem === fase.ordem + 1) ?? null,
        };
      }

      // Todos completos — verifica se próxima fase tem slots vazios
      const nextFase = fases.find(f => f.ordem === fase.ordem + 1);
      if (nextFase) {
        const emptyRow = getRows(await db.execute(sql`SELECT COUNT(*) as c FROM copa_confrontos WHERE fase_id = ${nextFase.id} AND corretor_a_id IS NULL`));
        const emptyCount = Number(emptyRow[0]?.c ?? 0);
        if (emptyCount > 0) {
          return {
            podeAvancar: true,
            faseAtual: { id: fase.id, nome: fase.nome, total, completos },
            proximaFase: { id: nextFase.id, nome: nextFase.nome },
          };
        }
      }
    }

    return { podeAvancar: false, faseAtual: null, proximaFase: null };
  }),

  // ── Avançar fase: preenche slots da próxima fase com vencedores ─────────────
  avancarFase: protectedProcedure.mutation(async ({ ctx }) => {
    if (!isAdminOrSuperintendente(ctx.user.role)) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Apenas administradores podem avançar fases" });
    }
    const db = await getDb();

    const fases = getRows(await db.execute(sql`SELECT id, nome, ordem FROM copa_fases ORDER BY ordem`))
      .map(r => ({ id: Number(r.id), nome: String(r.nome), ordem: Number(r.ordem) }));

    let faseAtualId: number | null = null;
    let faseAtualOrdem: number | null = null;

    for (const fase of fases) {
      const countRow = getRows(await db.execute(sql`
        SELECT COUNT(*) as total,
               SUM(CASE WHEN vencedor_id IS NOT NULL THEN 1 ELSE 0 END) as completos
        FROM copa_confrontos WHERE fase_id = ${fase.id}
      `));
      const row = countRow[0];
      const total = Number(row?.total ?? 0);
      const completos = Number(row?.completos ?? 0);
      if (total === 0 || completos < total) continue;

      const nextFase = fases.find(f => f.ordem === fase.ordem + 1);
      if (nextFase) {
        const emptyRow = getRows(await db.execute(sql`SELECT COUNT(*) as c FROM copa_confrontos WHERE fase_id = ${nextFase.id} AND corretor_a_id IS NULL`));
        if (Number(emptyRow[0]?.c ?? 0) > 0) {
          faseAtualId = fase.id;
          faseAtualOrdem = fase.ordem;
          break;
        }
      }
    }

    if (!faseAtualId || faseAtualOrdem === null) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Nenhuma fase pronta para avançar" });
    }

    const vencedores = getRows(await db.execute(sql`SELECT vencedor_id FROM copa_confrontos WHERE fase_id = ${faseAtualId} AND vencedor_id IS NOT NULL ORDER BY RAND()`))
      .map(r => Number(r.vencedor_id));

    // Semifinal (ordem 4): perdedores → Disputa 3º (ordem 5), vencedores → Final (ordem 6)
    if (faseAtualOrdem === 4) {
      const perdedores = getRows(await db.execute(sql`
        SELECT CASE WHEN vencedor_id = corretor_a_id THEN corretor_b_id ELSE corretor_a_id END as perdedor_id
        FROM copa_confrontos WHERE fase_id = ${faseAtualId} ORDER BY RAND()
      `)).map(r => Number(r.perdedor_id));

      const fase3o = fases.find(f => f.ordem === 5);
      if (fase3o && perdedores.length >= 2) {
        const c3oRows = getRows(await db.execute(sql`SELECT id FROM copa_confrontos WHERE fase_id = ${fase3o.id} LIMIT 1`));
        const c3oId = Number(c3oRows[0]?.id);
        if (c3oId) await db.execute(sql`UPDATE copa_confrontos SET corretor_a_id = ${perdedores[0]}, corretor_b_id = ${perdedores[1]} WHERE id = ${c3oId}`);
      }

      const faseFinal = fases.find(f => f.ordem === 6);
      if (faseFinal && vencedores.length >= 2) {
        const cFinalRows = getRows(await db.execute(sql`SELECT id FROM copa_confrontos WHERE fase_id = ${faseFinal.id} LIMIT 1`));
        const cFinalId = Number(cFinalRows[0]?.id);
        if (cFinalId) await db.execute(sql`UPDATE copa_confrontos SET corretor_a_id = ${vencedores[0]}, corretor_b_id = ${vencedores[1]} WHERE id = ${cFinalId}`);
      }

      return { success: true, proximaFase: "Disputa 3º Lugar + Grande Final" };
    }

    // Normal: preenche slots da próxima fase em pares
    const proximaFase = fases.find(f => f.ordem === faseAtualOrdem! + 1);
    if (!proximaFase) throw new TRPCError({ code: "BAD_REQUEST", message: "Próxima fase não encontrada" });

    const slotIds = getRows(await db.execute(sql`SELECT id FROM copa_confrontos WHERE fase_id = ${proximaFase.id} AND corretor_a_id IS NULL ORDER BY posicao`))
      .map(r => Number(r.id));

    for (let i = 0; i < vencedores.length - 1 && i / 2 < slotIds.length; i += 2) {
      const slotId = slotIds[i / 2];
      await db.execute(sql`UPDATE copa_confrontos SET corretor_a_id = ${vencedores[i]}, corretor_b_id = ${vencedores[i + 1]} WHERE id = ${slotId}`);
    }

    return { success: true, proximaFase: proximaFase.nome };
  }),
});
