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
 *
 * Colunas do banco (camelCase):
 * copa_confrontos:   id, faseId, corretorAId, corretorBId, vencedorId, semanaRef, posicao, createdAt
 * copa_corretores:   id, corretorId, selecaoId, ativo, createdAt
 * copa_fases:        id, nome, tipo, ordem, semanaInicio, semanaFim, createdAt
 * copa_selecoes:     id, nome, bandeira, corPrimaria, createdAt
 * copa_pontuacoes:   id, corretorId, semana, agendamentos, visitas, documentacao, vendas, total, createdAt, updatedAt
 * copa_config_pontos:  id, chave, label, pontos, updated_at
 * copa_config_premios: id, posicao, descricao, valor, icone, ordem, updated_at
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
        JOIN users u ON u.id = cc.corretorId
        LEFT JOIN copa_selecoes s ON s.id = cc.selecaoId
        ORDER BY u.name
      `),
    ]);

    const mapCorretor = (row: Record<string, unknown>) => ({
      corretorId: Number(row.corretorId),
      nome: String(row.nome ?? ""),
      selecaoId: row.selecaoId ? Number(row.selecaoId) : null,
      selecaoNome: row.selecaoNome ? String(row.selecaoNome) : null,
      selecaoBandeira: row.selecaoBandeira ? String(row.selecaoBandeira) : null,
      grupo: row.grupo ? String(row.grupo) : null,
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
      semanaInicio: row.semanaInicio ? String(row.semanaInicio) : null,
      semanaFim: row.semanaFim ? String(row.semanaFim) : null,
    });

    const mapConfronto = (row: Record<string, unknown>) => ({
      id: Number(row.id),
      faseId: Number(row.faseId),
      corretorAId: row.corretorAId ? Number(row.corretorAId) : null,
      corretorBId: row.corretorBId ? Number(row.corretorBId) : null,
      vencedorId: row.vencedorId ? Number(row.vencedorId) : null,
      semanaRef: row.semanaRef ? Number(row.semanaRef) : null,
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
    const semana = Math.min(Math.max(Math.floor(diffDias / 7) + 1, 1), 11);
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
        cc.corretorId,
        u.name as nome,
        s.nome as selecaoNome,
        s.bandeira as selecaoBandeira,
        s.id as selecaoId,

        COALESCE((
          SELECT COUNT(*)
          FROM agendamentos a
          WHERE a.corretorId = cc.corretorId
            AND a.createdAt >= ${COPA_INICIO}
            AND a.createdAt <= ${COPA_FIM}
        ), 0) as crm_agendamentos,

        COALESCE((
          SELECT COUNT(*)
          FROM lead_status_transitions lst
          WHERE lst.corretorId = cc.corretorId
            AND lst.statusNovo = 'visita_realizada'
            AND lst.createdAt >= ${COPA_INICIO}
            AND lst.createdAt <= ${COPA_FIM}
        ), 0) as crm_visitas,

        COALESCE((
          SELECT COUNT(*)
          FROM lead_status_transitions lst
          WHERE lst.corretorId = cc.corretorId
            AND lst.statusNovo = 'analise_credito'
            AND lst.createdAt >= ${COPA_INICIO}
            AND lst.createdAt <= ${COPA_FIM}
        ), 0) as crm_documentacao,

        COALESCE((
          SELECT COUNT(*)
          FROM lead_status_transitions lst
          WHERE lst.corretorId = cc.corretorId
            AND lst.statusNovo = 'contrato_fechado'
            AND lst.createdAt >= ${COPA_INICIO}
            AND lst.createdAt <= ${COPA_FIM}
        ), 0) as crm_vendas,

        COALESCE((SELECT SUM(cp.agendamentos) FROM copa_pontuacoes cp WHERE cp.corretorId = cc.corretorId), 0) as manual_agendamentos,
        COALESCE((SELECT SUM(cp.visitas) FROM copa_pontuacoes cp WHERE cp.corretorId = cc.corretorId), 0) as manual_visitas,
        COALESCE((SELECT SUM(cp.documentacao) FROM copa_pontuacoes cp WHERE cp.corretorId = cc.corretorId), 0) as manual_documentacao,
        COALESCE((SELECT SUM(cp.vendas) FROM copa_pontuacoes cp WHERE cp.corretorId = cc.corretorId), 0) as manual_vendas

      FROM copa_corretores cc
      JOIN users u ON u.id = cc.corretorId
      LEFT JOIN copa_selecoes s ON s.id = cc.selecaoId
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
        corretorId: Number(r.corretorId),
        nome: String(r.nome ?? ""),
        selecao: r.selecaoId
          ? { id: Number(r.selecaoId), nome: String(r.selecaoNome ?? ""), bandeira: String(r.selecaoBandeira ?? "🏳️") }
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
      semana: z.number().min(1).max(11),
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
        INSERT INTO copa_pontuacoes (corretorId, semana, agendamentos, visitas, documentacao, vendas, total, updatedAt)
        VALUES (${input.corretorId}, ${input.semana}, ${input.agendamentos}, ${input.visitas}, ${input.documentacao}, ${input.vendas}, ${total}, NOW())
        ON DUPLICATE KEY UPDATE
          agendamentos = VALUES(agendamentos),
          visitas = VALUES(visitas),
          documentacao = VALUES(documentacao),
          vendas = VALUES(vendas),
          total = VALUES(total),
          updatedAt = NOW()
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
    .input(z.object({ id: z.number(), descricao: z.string(), valor: z.string(), icone: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (!isAdminOrSuperintendente(ctx.user.role)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Apenas administradores podem editar prêmios" });
      }
      const db = await getDb();
      await db.execute(sql`
        UPDATE copa_config_premios
        SET descricao = ${input.descricao}, valor = ${input.valor}, icone = ${input.icone}
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
      LEFT JOIN copa_corretores cc ON cc.corretorId = u.id
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
          INSERT INTO copa_corretores (corretorId, selecaoId, ativo) VALUES (${id}, NULL, 1)
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

      const participantesResult = await db.execute(sql`SELECT corretorId FROM copa_corretores ORDER BY RAND()`);
      const selecoesResult = await db.execute(sql`SELECT id FROM copa_selecoes ORDER BY RAND()`);

      const participantes = getRows(participantesResult).map((r) => Number(r.corretorId));
      const selecoes = getRows(selecoesResult).map((r) => Number(r.id));

      if (participantes.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Nenhum participante cadastrado. Salve os participantes primeiro." });
      }

      // Atribuir seleções aleatórias
      for (let i = 0; i < participantes.length; i++) {
        const selecaoId = selecoes[i % selecoes.length];
        await db.execute(sql`UPDATE copa_corretores SET selecaoId = ${selecaoId} WHERE corretorId = ${participantes[i]}`);
      }

      // Recriar confrontos da fase de grupos
      await db.execute(sql`DELETE FROM copa_confrontos`);

      const faseResult = await db.execute(sql`SELECT id FROM copa_fases WHERE ordem = 1 LIMIT 1`);
      const faseRows = getRows(faseResult);
      const faseGruposId = Number(faseRows[0]?.id ?? 1);

      // Buscar grupos dos corretores
      const gruposResult = getRows(await db.execute(sql`
        SELECT corretorId, grupo FROM copa_corretores WHERE ativo = 1
      `)).map(r => ({ id: Number(r.corretorId), grupo: String(r.grupo ?? "A") }));

      const grupoMap: Record<string, number[]> = {};
      for (const g of gruposResult) {
        if (!grupoMap[g.grupo]) grupoMap[g.grupo] = [];
        grupoMap[g.grupo].push(g.id);
      }

      // Gerar round-robin por grupo usando algoritmo de rotação circular
      // Para N corretores: N-1 rodadas, cada rodada tem N/2 confrontos
      let totalConfrontos = 0;
      let posicao = 1;

      for (const [, membros] of Object.entries(grupoMap)) {
        const n = membros.length;
        if (n < 2) continue;

        // Algoritmo de round-robin com rotação circular
        // Fixa o primeiro elemento, rotaciona os demais
        const arr = [...membros];
        const numRodadas = n % 2 === 0 ? n - 1 : n;
        const numJogosPorRodada = Math.floor(n / 2);

        for (let rodada = 0; rodada < numRodadas; rodada++) {
          const semana = rodada + 1; // semanas 1 a 7
          for (let j = 0; j < numJogosPorRodada; j++) {
            const a = arr[j];
            const b = arr[n - 1 - j];
            if (a !== undefined && b !== undefined && a !== b) {
              await db.execute(sql`
                INSERT INTO copa_confrontos (faseId, corretorAId, corretorBId, semanaRef, posicao)
                VALUES (${faseGruposId}, ${a}, ${b}, ${semana}, ${posicao})
              `);
              posicao++;
              totalConfrontos++;
            }
          }
          // Rotacionar: manter arr[0] fixo, rotacionar arr[1..n-1]
          const last = arr[n - 1];
          for (let k = n - 1; k > 1; k--) arr[k] = arr[k - 1];
          arr[1] = last!;
        }
      }

      return { success: true as const, participantes: participantes.length, confrontos: totalConfrontos };
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

      // Buscar confronto atual para saber o vencedor anterior e semanaRef
      const confrontoRows = getRows(await db.execute(sql`
        SELECT vencedorId, semanaRef FROM copa_confrontos WHERE id = ${input.confrontoId}
      `));
      const confrontoAtual = confrontoRows[0];
      const vencedorAnterior = confrontoAtual?.vencedorId ? Number(confrontoAtual.vencedorId) : null;
      const semanaRef = confrontoAtual?.semanaRef ? Number(confrontoAtual.semanaRef) : 1;

      // Atualizar o vencedor do confronto
      await db.execute(sql`
        UPDATE copa_confrontos SET vencedorId = ${input.vencedorId} WHERE id = ${input.confrontoId}
      `);

      const BONUS_VENCEDOR = 20;

      // Remover bônus do vencedor anterior (se estava definido e mudou)
      if (vencedorAnterior && vencedorAnterior !== input.vencedorId) {
        await db.execute(sql`
          UPDATE copa_pontuacoes
          SET total = GREATEST(0, total - ${BONUS_VENCEDOR}),
              updatedAt = NOW()
          WHERE corretorId = ${vencedorAnterior} AND semana = ${semanaRef}
        `);
      }

      // Adicionar +20 pontos ao novo vencedor (se definido)
      if (input.vencedorId && input.vencedorId !== vencedorAnterior) {
        // Upsert: se não existe registro para essa semana, cria; senão, incrementa
        const existeRows = getRows(await db.execute(sql`
          SELECT id FROM copa_pontuacoes WHERE corretorId = ${input.vencedorId} AND semana = ${semanaRef}
        `));
        if (existeRows.length > 0) {
          await db.execute(sql`
            UPDATE copa_pontuacoes
            SET total = total + ${BONUS_VENCEDOR},
                updatedAt = NOW()
            WHERE corretorId = ${input.vencedorId} AND semana = ${semanaRef}
          `);
        } else {
          await db.execute(sql`
            INSERT INTO copa_pontuacoes (corretorId, semana, agendamentos, visitas, documentacao, vendas, total, createdAt, updatedAt)
            VALUES (${input.vencedorId}, ${semanaRef}, 0, 0, 0, 0, ${BONUS_VENCEDOR}, NOW(), NOW())
          `);
        }
      }

      return { success: true };
    }),

  // Pontos de cada corretor por semana específica (para placar dos confrontos)
  // Cada semana tem um intervalo de datas fixo no calendário da Copa
  getPontosConfronto: protectedProcedure
    .input(z.object({
      corretorIds: z.array(z.number()),
      semanaRef: z.number().min(1).max(11),
    }))
    .query(async ({ input }) => {
      const db = await getDb();

      // Mapa de semana → janela de datas (SP = UTC-3, então início = DD/06 03:00 UTC)
      const SEMANAS: Record<number, { inicio: string; fim: string }> = {
        1: { inicio: "2026-06-03 03:00:00", fim: "2026-06-09 02:59:59" },
        2: { inicio: "2026-06-10 03:00:00", fim: "2026-06-16 02:59:59" },
        3: { inicio: "2026-06-17 03:00:00", fim: "2026-06-23 02:59:59" },
        4: { inicio: "2026-06-24 03:00:00", fim: "2026-06-30 02:59:59" },
        5: { inicio: "2026-07-01 03:00:00", fim: "2026-07-07 02:59:59" },
        6: { inicio: "2026-07-08 03:00:00", fim: "2026-07-14 02:59:59" },
        7: { inicio: "2026-07-15 03:00:00", fim: "2026-07-21 02:59:59" },
        8: { inicio: "2026-07-22 03:00:00", fim: "2026-07-28 02:59:59" },
        9: { inicio: "2026-07-29 03:00:00", fim: "2026-08-04 02:59:59" },
        10: { inicio: "2026-08-05 03:00:00", fim: "2026-08-11 02:59:59" },
        11: { inicio: "2026-08-12 03:00:00", fim: "2026-08-18 02:59:59" },
      };

      const janela = SEMANAS[input.semanaRef];
      if (!janela) return {};

      const configResult = await db.execute(sql`SELECT chave, pontos FROM copa_config_pontos`);
      const configMap: Record<string, number> = {};
      for (const row of getRows(configResult)) {
        configMap[String(row.chave)] = Number(row.pontos);
      }
      const ptAgendamento = configMap["agendamentos"] ?? 25;
      const ptVisita = configMap["visitas"] ?? 40;
      const ptDocumentacao = configMap["documentacao"] ?? 60;
      const ptVenda = configMap["vendas"] ?? 150;

      const resultado: Record<number, number> = {};

      for (const corretorId of input.corretorIds) {
        // CRM: contar eventos do CRM na janela da semana
        const [agRows, visRows, docRows, vendRows] = await Promise.all([
          db.execute(sql`
            SELECT COUNT(*) as cnt FROM agendamentos
            WHERE corretorId = ${corretorId}
              AND createdAt >= ${janela.inicio} AND createdAt <= ${janela.fim}
          `),
          db.execute(sql`
            SELECT COUNT(*) as cnt FROM lead_status_transitions
            WHERE corretorId = ${corretorId} AND statusNovo = 'visita_realizada'
              AND createdAt >= ${janela.inicio} AND createdAt <= ${janela.fim}
          `),
          db.execute(sql`
            SELECT COUNT(*) as cnt FROM lead_status_transitions
            WHERE corretorId = ${corretorId} AND statusNovo = 'analise_credito'
              AND createdAt >= ${janela.inicio} AND createdAt <= ${janela.fim}
          `),
          db.execute(sql`
            SELECT COUNT(*) as cnt FROM lead_status_transitions
            WHERE corretorId = ${corretorId} AND statusNovo = 'contrato_fechado'
              AND createdAt >= ${janela.inicio} AND createdAt <= ${janela.fim}
          `),
        ]);

        const crmAg = Number(getRows(agRows)[0]?.cnt ?? 0);
        const crmVis = Number(getRows(visRows)[0]?.cnt ?? 0);
        const crmDoc = Number(getRows(docRows)[0]?.cnt ?? 0);
        const crmVend = Number(getRows(vendRows)[0]?.cnt ?? 0);

        // Manual: pontuação lançada manualmente para essa semana
        const manualRows = getRows(await db.execute(sql`
          SELECT agendamentos, visitas, documentacao, vendas
          FROM copa_pontuacoes
          WHERE corretorId = ${corretorId} AND semana = ${input.semanaRef}
        `));
        const manual = manualRows[0] ?? {};
        const manAg = Number(manual.agendamentos ?? 0);
        const manVis = Number(manual.visitas ?? 0);
        const manDoc = Number(manual.documentacao ?? 0);
        const manVend = Number(manual.vendas ?? 0);

        const totalPontos =
          (crmAg + manAg) * ptAgendamento +
          (crmVis + manVis) * ptVisita +
          (crmDoc + manDoc) * ptDocumentacao +
          (crmVend + manVend) * ptVenda;

        resultado[corretorId] = totalPontos;
      }

      return resultado; // { [corretorId]: pontos }
    }),

  // Últimas 50 pontuações manuais com nome do corretor
  getHistoricoPontuacoes: protectedProcedure.query(async ({ ctx }) => {
    if (!isAdminOrSuperintendente(ctx.user.role)) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Apenas administradores podem ver o histórico" });
    }
    const db = await getDb();
    const result = await db.execute(sql`
      SELECT cp.id, cp.corretorId, cp.semana, cp.agendamentos, cp.visitas,
             cp.documentacao, cp.vendas, cp.total, cp.updatedAt,
             u.name as nomeCorretor
      FROM copa_pontuacoes cp
      JOIN users u ON u.id = cp.corretorId
      ORDER BY cp.updatedAt DESC
      LIMIT 50
    `);
    return getRows(result).map((r) => ({
      id: Number(r.id),
      corretorId: Number(r.corretorId),
      nomeCorretor: String(r.nomeCorretor ?? ""),
      semana: Number(r.semana),
      agendamentos: Number(r.agendamentos),
      visitas: Number(r.visitas),
      documentacao: Number(r.documentacao),
      vendas: Number(r.vendas),
      totalPontos: Number(r.total),
      updatedAt: r.updatedAt ? String(r.updatedAt) : null,
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
      SELECT semana, total
      FROM copa_pontuacoes
      WHERE corretorId = ${ctx.user.id}
      ORDER BY semana
    `);
    return getRows(result).map((r) => ({
      semana: Number(r.semana),
      totalPontos: Number(r.total),
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
        { nome: "Fase de Grupos", tipo: "grupos", ordem: 1, si: "03/06", sf: "21/06" },
        { nome: "Quartas de Final", tipo: "quartas", ordem: 2, si: "24/06", sf: "28/06" },
        { nome: "Repescagem", tipo: "repescagem", ordem: 3, si: "24/06", sf: "28/06" },
        { nome: "Semifinais", tipo: "semifinal", ordem: 4, si: "01/07", sf: "05/07" },
        { nome: "3º Lugar", tipo: "terceiro", ordem: 5, si: "08/07", sf: "12/07" },
        { nome: "Grande Final", tipo: "final", ordem: 6, si: "08/07", sf: "12/07" },
      ];
      for (const f of fases) {
        await db.execute(sql`INSERT INTO copa_fases (nome, tipo, ordem, semanaInicio, semanaFim) VALUES (${f.nome}, ${f.tipo}, ${f.ordem}, ${f.si}, ${f.sf})`);
      }
    }

    const selCount = getRows(await db.execute(sql`SELECT COUNT(*) as c FROM copa_selecoes`));
    if (Number(selCount[0]?.c) === 0) {
      const selecoes: [string, string][] = [
        ["Brasil", "🇧🇷"], ["Argentina", "🇦🇷"], ["França", "🇫🇷"], ["Alemanha", "🇩🇪"],
        ["Espanha", "🇪🇸"], ["Portugal", "🇵🇹"], ["Holanda", "🇳🇱"], ["Itália", "🇮🇹"],
        ["Croácia", "🇭🇷"], ["Japão", "🇯🇵"], ["Marrocos", "🇲🇦"], ["Senegal", "🇸🇳"],
        ["Bélgica", "🇧🇪"], ["Uruguai", "🇺🇾"],
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

    if (fases.length === 0) return {
      podeAvancar: false,
      faseAtual: null as null | { id: number; nome: string; total: number; completos: number },
      proximaFase: null as null | { id: number; nome: string },
    };

    for (const fase of fases) {
      const countRow = getRows(await db.execute(sql`
        SELECT COUNT(*) as total,
               SUM(CASE WHEN vencedorId IS NOT NULL THEN 1 ELSE 0 END) as completos
        FROM copa_confrontos WHERE faseId = ${fase.id}
      `));
      const row = countRow[0];
      const total = Number(row?.total ?? 0);
      const completos = Number(row?.completos ?? 0);

      if (total === 0) continue; // fase sem confrontos ainda

      if (completos < total) {
        // Fase em andamento
        return {
          podeAvancar: false,
          faseAtual: { id: fase.id, nome: fase.nome, total, completos },
          proximaFase: fases.find(f => f.ordem === fase.ordem + 1) ?? null,
        };
      }

      // Todos completos — verifica se próxima fase já foi preenchida
      const nextFase = fases.find(f => f.ordem === fase.ordem + 1);
      if (nextFase) {
        const nextCount = getRows(await db.execute(sql`SELECT COUNT(*) as c FROM copa_confrontos WHERE faseId = ${nextFase.id}`));
        const nextTotal = Number(nextCount[0]?.c ?? 0);
        // Se próxima fase não tem confrontos OU tem confrontos sem corretores, pode avançar
        if (nextTotal === 0) {
          return {
            podeAvancar: true,
            faseAtual: { id: fase.id, nome: fase.nome, total, completos },
            proximaFase: { id: nextFase.id, nome: nextFase.nome },
          };
        }
        const emptyRow = getRows(await db.execute(sql`SELECT COUNT(*) as c FROM copa_confrontos WHERE faseId = ${nextFase.id} AND corretorAId IS NULL`));
        const emptyCount = Number(emptyRow[0]?.c ?? 0);
        if (emptyCount > 0) {
          return {
            podeAvancar: true,
            faseAtual: { id: fase.id, nome: fase.nome, total, completos },
            proximaFase: { id: nextFase.id, nome: nextFase.nome },
          };
        }
        // Próxima fase já preenchida, continua para ver se há fases posteriores
      }
    }

    return { podeAvancar: false, faseAtual: null, proximaFase: null };
  }),

  // ── Avançar fase: cria/preenche confrontos da próxima fase com vencedores ─────────────
  avancarFase: protectedProcedure.mutation(async ({ ctx }) => {
    if (!isAdminOrSuperintendente(ctx.user.role)) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Apenas administradores podem avançar fases" });
    }
    const db = await getDb();

    const fases = getRows(await db.execute(sql`SELECT id, nome, tipo, ordem FROM copa_fases ORDER BY ordem`))
      .map(r => ({ id: Number(r.id), nome: String(r.nome), tipo: String(r.tipo), ordem: Number(r.ordem) }));

    // Encontrar a fase atual (com todos confrontos completos e próxima fase sem confrontos)
    let faseAtualId: number | null = null;
    let faseAtualOrdem: number | null = null;

    for (const fase of fases) {
      const countRow = getRows(await db.execute(sql`
        SELECT COUNT(*) as total,
               SUM(CASE WHEN vencedorId IS NOT NULL THEN 1 ELSE 0 END) as completos
        FROM copa_confrontos WHERE faseId = ${fase.id}
      `));
      const row = countRow[0];
      const total = Number(row?.total ?? 0);
      const completos = Number(row?.completos ?? 0);
      if (total === 0 || completos < total) continue;

      const nextFase = fases.find(f => f.ordem === fase.ordem + 1);
      if (nextFase) {
        const nextCountRow = getRows(await db.execute(sql`SELECT COUNT(*) as c FROM copa_confrontos WHERE faseId = ${nextFase.id}`));
        const nextTotal = Number(nextCountRow[0]?.c ?? 0);
        if (nextTotal === 0) {
          faseAtualId = fase.id;
          faseAtualOrdem = fase.ordem;
          break;
        }
        const emptyRow = getRows(await db.execute(sql`SELECT COUNT(*) as c FROM copa_confrontos WHERE faseId = ${nextFase.id} AND corretorAId IS NULL`));
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

    const faseAtual = fases.find(f => f.id === faseAtualId)!;

    // Buscar vencedores da fase atual
    const vencedores = getRows(await db.execute(sql`
      SELECT vencedorId FROM copa_confrontos
      WHERE faseId = ${faseAtualId} AND vencedorId IS NOT NULL
      ORDER BY id
    `)).map(r => Number(r.vencedorId));

    // Buscar perdedores (para repescagem e 3º lugar)
    const perdedores = getRows(await db.execute(sql`
      SELECT CASE WHEN vencedorId = corretorAId THEN corretorBId ELSE corretorAId END as perdedorId
      FROM copa_confrontos WHERE faseId = ${faseAtualId} AND vencedorId IS NOT NULL ORDER BY id
    `)).map(r => Number(r.perdedorId));

    // Helper: criar confronto
    const criarConfronto = async (faseId: number, aId: number, bId: number, semana: number) => {
      await db.execute(sql`
        INSERT INTO copa_confrontos (faseId, corretorAId, corretorBId, semanaRef, posicao)
        VALUES (${faseId}, ${aId}, ${bId}, ${semana}, 1)
      `);
    };

    // Helper: atualizar confronto existente
    const atualizarConfronto = async (confrontoId: number, aId: number, bId: number) => {
      await db.execute(sql`UPDATE copa_confrontos SET corretorAId = ${aId}, corretorBId = ${bId} WHERE id = ${confrontoId}`);
    };

    // === FASE DE GRUPOS (ordem 1) → QUARTAS diretos (1º e 2º de cada grupo) + REPESCAGEM (3º e 4º) ===
    if (faseAtual.tipo === "grupos" || faseAtual.ordem === 1) {
      const faseQuartas = fases.find(f => f.tipo === "quartas" || f.ordem === 2);
      const faseRepescagem = fases.find(f => f.tipo === "repescagem" || f.ordem === 3);

      // Buscar pontos por corretor
      const pontosRows = getRows(await db.execute(sql`
        SELECT corretorId, SUM(total) as pts FROM copa_pontuacoes GROUP BY corretorId
      `)).map(r => ({ id: Number(r.corretorId), pts: Number(r.pts ?? 0) }));
      const ptsPorId = Object.fromEntries(pontosRows.map(p => [p.id, p.pts]));

      // Buscar grupos
      const gruposRows = getRows(await db.execute(sql`
        SELECT cc.corretorId, cc.grupo FROM copa_corretores cc WHERE cc.ativo = 1
      `)).map(r => ({ id: Number(r.corretorId), grupo: String(r.grupo ?? "A") }));

      const grupoMap: Record<string, number[]> = {};
      for (const g of gruposRows) {
        if (!grupoMap[g.grupo]) grupoMap[g.grupo] = [];
        grupoMap[g.grupo].push(g.id);
      }

      // Por grupo: 1º e 2º → Quartas diretos; 3º e 4º → Repescagem; 5º+ → eliminados
      const quartasDiretos: number[] = []; // 1º e 2º de cada grupo (4 no total)
      const repescagemIds: number[] = [];   // 3º e 4º de cada grupo (4 no total)

      for (const [, membros] of Object.entries(grupoMap)) {
        const sorted = [...membros].sort((a, b) => (ptsPorId[b] ?? 0) - (ptsPorId[a] ?? 0));
        if (sorted.length > 0) quartasDiretos.push(sorted[0]); // 1º
        if (sorted.length > 1) quartasDiretos.push(sorted[1]); // 2º
        if (sorted.length > 2) repescagemIds.push(sorted[2]);  // 3º
        if (sorted.length > 3) repescagemIds.push(sorted[3]);  // 4º
        // 5º, 6º, 7º são eliminados (não entram em nenhuma fase)
      }

      // Criar confrontos das Quartas (4 diretos = 2 duelos; 2 vagas reservadas para vencedores da repescagem)
      if (faseQuartas) {
        const existingQ = getRows(await db.execute(sql`SELECT id, corretorAId FROM copa_confrontos WHERE faseId = ${faseQuartas.id}`));
        if (existingQ.length === 0) {
          // Criar 2 duelos com os 4 diretos: 1º A vs 2º B e 2º A vs 1º B (cruzamento)
          // quartasDiretos = [1ºA, 2ºA, 1ºB, 2ºB] (ordem de entrada por grupo)
          const [p1A, p2A, p1B, p2B] = quartasDiretos;
          if (p1A && p2B) await criarConfronto(faseQuartas.id, p1A, p2B, 9);
          if (p2A && p1B) await criarConfronto(faseQuartas.id, p2A, p1B, 9);
          // Mais 1 slot vazio para vencedor da repescagem
          if (repescagemIds.length > 0) {
            await db.execute(sql`INSERT INTO copa_confrontos (faseId, corretorAId, corretorBId, semanaRef, posicao) VALUES (${faseQuartas.id}, NULL, NULL, 9, 3)`);
          }
        } else {
          // Preencher slot vazio com vencedor da repescagem (se houver)
          const emptySlots = existingQ.filter(r => !r.corretorAId).map(r => Number(r.id));
          // Slots vazios serão preenchidos quando a repescagem avançar
          void emptySlots;
        }
      }

      // Criar confrontos da Repescagem (3º e 4º de cada grupo, cruzados)
      if (faseRepescagem && repescagemIds.length >= 2) {
        const existingR = getRows(await db.execute(sql`SELECT id, corretorAId FROM copa_confrontos WHERE faseId = ${faseRepescagem.id}`));
        if (existingR.length === 0) {
          // Cruzamento: 3º A vs 4º B e 4º A vs 3º B
          const [r3A, r3B, r4A, r4B] = repescagemIds.length >= 4
            ? [repescagemIds[0], repescagemIds[2], repescagemIds[1], repescagemIds[3]]
            : [repescagemIds[0], repescagemIds[1], null, null];
          if (r3A && r4B) await criarConfronto(faseRepescagem.id, r3A, r4B, 8);
          if (r4A && r3B) await criarConfronto(faseRepescagem.id, r4A, r3B, 8);
        }
      }

      return { success: true, proximaFase: `${faseQuartas?.nome ?? "Quartas"} + ${faseRepescagem?.nome ?? "Repescagem"}` };
    }

    // === REPESCAGEM (ordem 3) → preenche slot vazio nas QUARTAS ===
    if (faseAtual.tipo === "repescagem" || faseAtual.ordem === 3) {
      const faseQuartas = fases.find(f => f.tipo === "quartas" || f.ordem === 2);
      if (!faseQuartas) throw new TRPCError({ code: "BAD_REQUEST", message: "Fase quartas não encontrada" });

      // Os 2 vencedores da repescagem preenchem o slot vazio das quartas
      // vencedores já foi calculado acima (vencedores da faseAtual = repescagem)
      const emptySlots = getRows(await db.execute(sql`
        SELECT id FROM copa_confrontos WHERE faseId = ${faseQuartas.id} AND corretorAId IS NULL ORDER BY id
      `)).map(r => Number(r.id));

      if (emptySlots.length > 0 && vencedores.length >= 2) {
        // Preencher o slot vazio com os 2 vencedores da repescagem
        await atualizarConfronto(emptySlots[0], vencedores[0], vencedores[1]);
      }

      return { success: true, proximaFase: faseQuartas.nome };
    }

    // === QUARTAS (ordem 2) → SEMIFINAL (ordem 4): 3 vencedores + 1 bye ===
    if (faseAtual.tipo === "quartas" || faseAtual.ordem === 2) {
      const faseSemi = fases.find(f => f.tipo === "semifinal" || f.ordem === 4);
      if (!faseSemi) throw new TRPCError({ code: "BAD_REQUEST", message: "Fase semifinal não encontrada" });

      // Buscar todos os vencedores das quartas (3 duelos = 3 vencedores)
      // O melhor classificado geral entre os vencedores recebe o bye
      const pontosVencedores = getRows(await db.execute(sql`
        SELECT corretorId, SUM(total) as pts FROM copa_pontuacoes
        WHERE corretorId IN (${sql.join(vencedores.map(v => sql`${v}`), sql`, `)})
        GROUP BY corretorId
      `)).map(r => ({ id: Number(r.corretorId), pts: Number(r.pts ?? 0) }));

      const vencedoresOrdenados = [...vencedores].sort((a, b) => {
        const ptsA = pontosVencedores.find(p => p.id === a)?.pts ?? 0;
        const ptsB = pontosVencedores.find(p => p.id === b)?.pts ?? 0;
        return ptsB - ptsA;
      });

      const byeId = vencedoresOrdenados[0]; // melhor classificado → bye
      const semiDuelistas = vencedoresOrdenados.slice(1); // outros 2 → duelo

      const existingSemi = getRows(await db.execute(sql`SELECT id, corretorAId FROM copa_confrontos WHERE faseId = ${faseSemi.id}`));
      if (existingSemi.length === 0) {
        // Criar 1 duelo entre os 2 piores classificados
        if (semiDuelistas.length >= 2) {
          await criarConfronto(faseSemi.id, semiDuelistas[0], semiDuelistas[1], 10);
        }
        // Criar 1 registro de bye para o melhor (corretorBId = NULL)
        if (byeId) {
          await db.execute(sql`
            INSERT INTO copa_confrontos (faseId, corretorAId, corretorBId, semanaRef, posicao)
            VALUES (${faseSemi.id}, ${byeId}, NULL, 10, 2)
          `);
        }
      }

      return { success: true, proximaFase: faseSemi.nome };
    }

    // === SEMIFINAL (ordem 4) → 3º LUGAR (ordem 5) + FINAL (ordem 6) ===
    if (faseAtual.tipo === "semifinal" || faseAtual.ordem === 4) {
      const fase3o = fases.find(f => f.tipo === "terceiro" || f.ordem === 5);
      const faseFinal = fases.find(f => f.tipo === "final" || f.ordem === 6);

      // Vencedores do duelo semi + o bye → Final
      // Perdedor do duelo semi → 3º Lugar
      // O bye não tem perdedor (corretorBId = NULL), então filtrar apenas duelos reais
      const duelosSemi = getRows(await db.execute(sql`
        SELECT vencedorId, corretorAId, corretorBId FROM copa_confrontos
        WHERE faseId = ${faseAtualId} AND corretorBId IS NOT NULL AND vencedorId IS NOT NULL
      `));
      const byeSemi = getRows(await db.execute(sql`
        SELECT corretorAId FROM copa_confrontos
        WHERE faseId = ${faseAtualId} AND corretorBId IS NULL AND corretorAId IS NOT NULL
      `));

      const vencedorDuelo = duelosSemi[0]?.vencedorId ? Number(duelosSemi[0].vencedorId) : null;
      const perdedorDuelo = duelosSemi[0]
        ? (Number(duelosSemi[0].vencedorId) === Number(duelosSemi[0].corretorAId)
          ? Number(duelosSemi[0].corretorBId)
          : Number(duelosSemi[0].corretorAId))
        : null;
      const byeCorretor = byeSemi[0]?.corretorAId ? Number(byeSemi[0].corretorAId) : null;

      // Final: vencedor do duelo + bye
      if (faseFinal && vencedorDuelo && byeCorretor) {
        const existingFinal = getRows(await db.execute(sql`SELECT id FROM copa_confrontos WHERE faseId = ${faseFinal.id}`));
        if (existingFinal.length === 0) {
          await criarConfronto(faseFinal.id, byeCorretor, vencedorDuelo, 11);
        } else {
          await atualizarConfronto(Number(existingFinal[0].id), byeCorretor, vencedorDuelo);
        }
      }

      // 3º Lugar: perdedor do duelo semi
      if (fase3o && perdedorDuelo) {
        const existing3o = getRows(await db.execute(sql`SELECT id FROM copa_confrontos WHERE faseId = ${fase3o.id}`));
        if (existing3o.length === 0) {
          // 3º lugar: perdedor vs placeholder (só 1 duelo se houver apenas 1 perdedor)
          // Como só há 1 perdedor real (o bye não perde), registrar como confronto solo
          await db.execute(sql`
            INSERT INTO copa_confrontos (faseId, corretorAId, corretorBId, semanaRef, posicao)
            VALUES (${fase3o.id}, ${perdedorDuelo}, NULL, 11, 1)
          `);
        } else {
          await atualizarConfronto(Number(existing3o[0].id), perdedorDuelo, perdedorDuelo);
        }
      }

      return { success: true, proximaFase: "Grande Final + Disputa 3º Lugar (Semana 11)" };
    }

    throw new TRPCError({ code: "BAD_REQUEST", message: `Fase "${faseAtual.nome}" não tem transição definida` });
  }),
});
