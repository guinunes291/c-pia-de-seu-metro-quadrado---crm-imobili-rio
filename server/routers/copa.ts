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
    const semana = Math.min(Math.max(Math.floor(diffDias / 7) + 1, 1), 14);
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
      semana: z.number().min(1).max(14),
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

        // Algoritmo de round-robin com dummy player para N ímpar
        // Se N é ímpar, adiciona um "fantasma" (-1) para tornar par
        // Quem enfrentar o fantasma tem bye naquela rodada
        const arr = [...membros];
        if (n % 2 !== 0) arr.push(-1); // dummy
        const m = arr.length; // agora sempre par
        const numRodadas = m - 1; // N-1 rodadas para N par
        const numJogosPorRodada = m / 2;

        for (let rodada = 0; rodada < numRodadas; rodada++) {
          const semana = rodada + 1; // semanas 1 a 7 (para 7 corretores: 7 rodadas com dummy = 6 rodadas efetivas... não!)
          // Com dummy: 8 slots, 7 rodadas, 4 jogos/rodada, mas 1 jogo por rodada é contra o dummy (bye)
          // Então efetivamente: 7 rodadas × 3 jogos reais = 21 confrontos = C(7,2) ✓
          for (let j = 0; j < numJogosPorRodada; j++) {
            const a = arr[j];
            const b = arr[m - 1 - j];
            // Pular se algum é o dummy (-1)
            if (a === -1 || b === -1) continue;
            if (a !== undefined && b !== undefined && a !== b) {
              await db.execute(sql`
                INSERT INTO copa_confrontos (faseId, corretorAId, corretorBId, semanaRef, posicao)
                VALUES (${faseGruposId}, ${a}, ${b}, ${semana}, ${posicao})
              `);
              posicao++;
              totalConfrontos++;
            }
          }
          // Rotacionar: manter arr[0] fixo, rotacionar arr[1..m-1]
          const last = arr[m - 1];
          for (let k = m - 1; k > 1; k--) arr[k] = arr[k - 1];
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

      // Buscar confronto atual + tipo da fase para calcular bônus correto
      const confrontoRows = getRows(await db.execute(sql`
        SELECT cc.vencedorId, cc.semanaRef, cc.corretorBId, cf.tipo as faseTipo
        FROM copa_confrontos cc
        JOIN copa_fases cf ON cc.faseId = cf.id
        WHERE cc.id = ${input.confrontoId}
      `));
      const confrontoAtual = confrontoRows[0];
      const vencedorAnterior = confrontoAtual?.vencedorId ? Number(confrontoAtual.vencedorId) : null;
      const semanaRef = confrontoAtual?.semanaRef ? Number(confrontoAtual.semanaRef) : 1;
      const faseTipo = String(confrontoAtual?.faseTipo ?? "grupos");
      // Byes/WO têm corretorBId nulo — não recebem bônus de fase extra
      const isRealDuelo = confrontoAtual?.corretorBId != null;

      // Atualizar o vencedor do confronto
      await db.execute(sql`
        UPDATE copa_confrontos SET vencedorId = ${input.vencedorId} WHERE id = ${input.confrontoId}
      `);

      const BONUS_VENCEDOR = 20;
      const BONUS_FASE: Record<string, number> = {
        repescagem1: 2, oitavas: 3, repescagem2: 2, quartas: 4, semifinal: 5,
      };
      const bonusFase = isRealDuelo ? (BONUS_FASE[faseTipo] ?? 0) : 0;
      const bonusTotal = BONUS_VENCEDOR + bonusFase;

      // Remover bônus do vencedor anterior (se estava definido e mudou)
      if (vencedorAnterior && vencedorAnterior !== input.vencedorId) {
        await db.execute(sql`
          UPDATE copa_pontuacoes
          SET total = GREATEST(0, total - ${bonusTotal}),
              updatedAt = NOW()
          WHERE corretorId = ${vencedorAnterior} AND semana = ${semanaRef}
        `);
      }

      // Adicionar bônus ao novo vencedor (se definido)
      if (input.vencedorId && input.vencedorId !== vencedorAnterior) {
        const existeRows = getRows(await db.execute(sql`
          SELECT id FROM copa_pontuacoes WHERE corretorId = ${input.vencedorId} AND semana = ${semanaRef}
        `));
        if (existeRows.length > 0) {
          await db.execute(sql`
            UPDATE copa_pontuacoes
            SET total = total + ${bonusTotal},
                updatedAt = NOW()
            WHERE corretorId = ${input.vencedorId} AND semana = ${semanaRef}
          `);
        } else {
          await db.execute(sql`
            INSERT INTO copa_pontuacoes (corretorId, semana, agendamentos, visitas, documentacao, vendas, total, createdAt, updatedAt)
            VALUES (${input.vencedorId}, ${semanaRef}, 0, 0, 0, 0, ${bonusTotal}, NOW(), NOW())
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
      semanaRef: z.number().min(1).max(14),
    }))
    .query(async ({ input }) => {
      const db = await getDb();

      // Mapa de semana → janela de datas (SP = UTC-3, então início = DD/06 03:00 UTC)
      const SEMANAS: Record<number, { inicio: string; fim: string }> = {
        1:  { inicio: "2026-06-03 03:00:00", fim: "2026-06-09 02:59:59" },
        2:  { inicio: "2026-06-10 03:00:00", fim: "2026-06-16 02:59:59" },
        3:  { inicio: "2026-06-17 03:00:00", fim: "2026-06-23 02:59:59" },
        4:  { inicio: "2026-06-24 03:00:00", fim: "2026-06-30 02:59:59" },
        5:  { inicio: "2026-07-01 03:00:00", fim: "2026-07-07 02:59:59" },
        6:  { inicio: "2026-07-08 03:00:00", fim: "2026-07-14 02:59:59" },
        7:  { inicio: "2026-07-15 03:00:00", fim: "2026-07-21 02:59:59" },
        8:  { inicio: "2026-07-22 03:00:00", fim: "2026-07-28 02:59:59" },
        9:  { inicio: "2026-07-29 03:00:00", fim: "2026-08-04 02:59:59" },
        10: { inicio: "2026-08-05 03:00:00", fim: "2026-08-11 02:59:59" },
        11: { inicio: "2026-08-12 03:00:00", fim: "2026-08-18 02:59:59" },
        12: { inicio: "2026-08-19 03:00:00", fim: "2026-08-25 02:59:59" },
        13: { inicio: "2026-08-26 03:00:00", fim: "2026-09-01 02:59:59" },
        14: { inicio: "2026-09-02 03:00:00", fim: "2026-09-08 02:59:59" },
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

    // Sempre recriar fases com o novo formato (DELETE + INSERT idempotente)
    await db.execute(sql`DELETE FROM copa_fases`);
    const novasFases = [
      { nome: "Fase de Grupos",   tipo: "grupos",      ordem: 1, si: "03/06", sf: "21/07" },
      { nome: "Repescagem 1",     tipo: "repescagem1", ordem: 2, si: "22/07", sf: "28/07" },
      { nome: "Oitavas de Final", tipo: "oitavas",     ordem: 3, si: "29/07", sf: "04/08" },
      { nome: "Repescagem 2",     tipo: "repescagem2", ordem: 4, si: "05/08", sf: "11/08" },
      { nome: "Quartas de Final", tipo: "quartas",     ordem: 5, si: "12/08", sf: "18/08" },
      { nome: "Semifinal",        tipo: "semifinal",   ordem: 6, si: "19/08", sf: "25/08" },
      { nome: "3º Lugar",         tipo: "terceiro",    ordem: 7, si: "26/08", sf: "01/09" },
      { nome: "Grande Final",     tipo: "final",       ordem: 8, si: "26/08", sf: "01/09" },
      { nome: "Premiação",        tipo: "premiacao",   ordem: 9, si: "02/09", sf: "08/09" },
    ];
    for (const f of novasFases) {
      await db.execute(sql`INSERT INTO copa_fases (nome, tipo, ordem, semanaInicio, semanaFim) VALUES (${f.nome}, ${f.tipo}, ${f.ordem}, ${f.si}, ${f.sf})`);
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

  // ── Avançar fase: cria confrontos da próxima fase com base nos resultados da fase atual ────
  avancarFase: protectedProcedure.mutation(async ({ ctx }) => {
    if (!isAdminOrSuperintendente(ctx.user.role)) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Apenas administradores podem avançar fases" });
    }
    const db = await getDb();

    const fases = getRows(await db.execute(sql`SELECT id, nome, tipo, ordem FROM copa_fases ORDER BY ordem`))
      .map(r => ({ id: Number(r.id), nome: String(r.nome), tipo: String(r.tipo), ordem: Number(r.ordem) }));

    // Encontrar a fase atual (todos confrontos completos, próxima fase vazia ou com slots null)
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

    // Vencedores e perdedores dos duelos reais da fase atual (excluindo byes/WO)
    const vencedores = getRows(await db.execute(sql`
      SELECT vencedorId FROM copa_confrontos
      WHERE faseId = ${faseAtualId} AND vencedorId IS NOT NULL AND corretorBId IS NOT NULL
      ORDER BY id
    `)).map(r => Number(r.vencedorId));

    const perdedores = getRows(await db.execute(sql`
      SELECT CASE WHEN vencedorId = corretorAId THEN corretorBId ELSE corretorAId END as perdedorId
      FROM copa_confrontos
      WHERE faseId = ${faseAtualId} AND vencedorId IS NOT NULL AND corretorBId IS NOT NULL
      ORDER BY id
    `)).map(r => Number(r.perdedorId));

    // Helper: criar confronto (bId pode ser null para bye/WO)
    const criarConfronto = async (faseId: number, aId: number, bId: number | null, semana: number) => {
      await db.execute(sql`
        INSERT INTO copa_confrontos (faseId, corretorAId, corretorBId, semanaRef, posicao)
        VALUES (${faseId}, ${aId}, ${bId}, ${semana}, 1)
      `);
    };

    // Helper: rankear lista de corretores por pontos totais acumulados
    const rankearPorPontos = async (ids: number[]): Promise<number[]> => {
      if (ids.length === 0) return [];
      const rows = getRows(await db.execute(sql`
        SELECT corretorId, COALESCE(SUM(total), 0) as pts
        FROM copa_pontuacoes
        WHERE corretorId IN (${sql.join(ids.map(id => sql`${id}`), sql`, `)})
        GROUP BY corretorId ORDER BY pts DESC
      `));
      const ranked = rows.map(r => Number(r.corretorId));
      // Incluir jogadores sem pontuação registrada (ficam no fim)
      const missing = ids.filter(id => !ranked.includes(id));
      return [...ranked, ...missing];
    };

    // Helper: aplicar bônus de pontuação para um corretor numa semana (upsert)
    const aplicarBonus = async (corretorId: number, semana: number, bonus: number) => {
      const existeRow = getRows(await db.execute(sql`
        SELECT id FROM copa_pontuacoes WHERE corretorId = ${corretorId} AND semana = ${semana}
      `));
      if (existeRow.length > 0) {
        await db.execute(sql`
          UPDATE copa_pontuacoes SET total = total + ${bonus}, updatedAt = NOW()
          WHERE corretorId = ${corretorId} AND semana = ${semana}
        `);
      } else {
        await db.execute(sql`
          INSERT INTO copa_pontuacoes (corretorId, semana, agendamentos, visitas, documentacao, vendas, total, createdAt, updatedAt)
          VALUES (${corretorId}, ${semana}, 0, 0, 0, 0, ${bonus}, NOW(), NOW())
        `);
      }
    };

    // === GRUPOS (ordem 1) → REPESCAGEM 1 (5º, 6º, 7º de cada grupo) ===
    if (faseAtual.tipo === "grupos" || faseAtual.ordem === 1) {
      const faseRep1 = fases.find(f => f.tipo === "repescagem1");
      if (!faseRep1) throw new TRPCError({ code: "BAD_REQUEST", message: "Fase Repescagem 1 não encontrada. Inicialize a Copa." });

      const gruposRows = getRows(await db.execute(sql`
        SELECT corretorId, grupo FROM copa_corretores WHERE ativo = 1
      `)).map(r => ({ id: Number(r.corretorId), grupo: String(r.grupo ?? "A") }));

      const grupoMap: Record<string, number[]> = {};
      for (const g of gruposRows) {
        if (!grupoMap[g.grupo]) grupoMap[g.grupo] = [];
        grupoMap[g.grupo].push(g.id);
      }

      const gruposOrdenados = Object.keys(grupoMap).sort();
      const rankingGrupos: Record<string, number[]> = {};
      for (const grupo of gruposOrdenados) {
        rankingGrupos[grupo] = await rankearPorPontos(grupoMap[grupo] ?? []);
      }

      // Aplicar bônus de posição no grupo (1º=+10, 2º=+9, ..., 7º=+4) na semana 7
      const bonusPorPosicao = [10, 9, 8, 7, 6, 5, 4];
      for (const membrosOrdenados of Object.values(rankingGrupos)) {
        for (let i = 0; i < membrosOrdenados.length && i < bonusPorPosicao.length; i++) {
          const cId = membrosOrdenados[i];
          if (cId) await aplicarBonus(cId, 7, bonusPorPosicao[i]!);
        }
      }

      // 5º (idx 4), 6º (idx 5), 7º (idx 6) → Repescagem 1 (semanaRef=8)
      const grupoA = rankingGrupos[gruposOrdenados[0]] ?? [];
      const grupoB = rankingGrupos[gruposOrdenados[1]] ?? [];

      const rep1Duelos: [number, number][] = ([
        [grupoA[4], grupoB[5]], // 5ºA vs 6ºB
        [grupoA[5], grupoB[4]], // 6ºA vs 5ºB
        [grupoA[6], grupoB[6]], // 7ºA vs 7ºB
      ] as (number | undefined)[][]).filter(([a, b]) => a != null && b != null) as [number, number][];

      for (const [aId, bId] of rep1Duelos) {
        await criarConfronto(faseRep1.id, aId, bId, 8);
      }

      return { success: true, proximaFase: faseRep1.nome };
    }

    // === REPESCAGEM 1 (ordem 2) → OITAVAS DE FINAL (5 duelos) ===
    if (faseAtual.tipo === "repescagem1" || faseAtual.ordem === 2) {
      const faseOitavas = fases.find(f => f.tipo === "oitavas");
      if (!faseOitavas) throw new TRPCError({ code: "BAD_REQUEST", message: "Fase Oitavas não encontrada. Inicialize a Copa." });

      // Top 2 vencedores (por pts geral) avançam para Oitavas; 3º vencedor eliminado
      const vencedoresRanked = await rankearPorPontos(vencedores);
      const repAdvancam = vencedoresRanked.slice(0, 2);

      // Ranking de 1º-4º de cada grupo para os 8 diretos
      const gruposRows = getRows(await db.execute(sql`
        SELECT corretorId, grupo FROM copa_corretores WHERE ativo = 1
      `)).map(r => ({ id: Number(r.corretorId), grupo: String(r.grupo ?? "A") }));

      const grupoMap: Record<string, number[]> = {};
      for (const g of gruposRows) {
        if (!grupoMap[g.grupo]) grupoMap[g.grupo] = [];
        grupoMap[g.grupo].push(g.id);
      }

      const gruposOrdenados = Object.keys(grupoMap).sort();
      const grupoA_ranked = await rankearPorPontos(grupoMap[gruposOrdenados[0]] ?? []);
      const grupoB_ranked = await rankearPorPontos(grupoMap[gruposOrdenados[1]] ?? []);
      const diretosA = grupoA_ranked.slice(0, 4);
      const diretosB = grupoB_ranked.slice(0, 4);

      // 5 duelos cruzados (semanaRef=9): 1ºA vs 4ºB, 2ºA vs 3ºB, 3ºA vs 2ºB, 4ºA vs 1ºB + rep1 vs rep2
      const oitavasDuelos: [number, number][] = ([
        [diretosA[0], diretosB[3]],
        [diretosA[1], diretosB[2]],
        [diretosA[2], diretosB[1]],
        [diretosA[3], diretosB[0]],
        [repAdvancam[0], repAdvancam[1]],
      ] as (number | undefined)[][]).filter(([a, b]) => a != null && b != null) as [number, number][];

      for (const [aId, bId] of oitavasDuelos) {
        await criarConfronto(faseOitavas.id, aId, bId, 9);
      }

      return { success: true, proximaFase: faseOitavas.nome };
    }

    // === OITAVAS (ordem 3) → REPESCAGEM 2 (4 melhores perdedores em 2 duelos) ===
    if (faseAtual.tipo === "oitavas" || faseAtual.ordem === 3) {
      const faseRep2 = fases.find(f => f.tipo === "repescagem2");
      if (!faseRep2) throw new TRPCError({ code: "BAD_REQUEST", message: "Fase Repescagem 2 não encontrada. Inicialize a Copa." });

      // perdedores = 5 losers; pior (5º) eliminado direto; top 4 jogam 2 duelos
      const perdedoresRanked = await rankearPorPontos(perdedores);
      const rep2Jogadores = perdedoresRanked.slice(0, 4);

      if (rep2Jogadores.length >= 4) {
        await criarConfronto(faseRep2.id, rep2Jogadores[0]!, rep2Jogadores[3]!, 10);
        await criarConfronto(faseRep2.id, rep2Jogadores[1]!, rep2Jogadores[2]!, 10);
      }

      return { success: true, proximaFase: faseRep2.nome };
    }

    // === REPESCAGEM 2 (ordem 4) → QUARTAS DE FINAL (3 duelos + 1 bye) ===
    if (faseAtual.tipo === "repescagem2" || faseAtual.ordem === 4) {
      const faseQuartas = fases.find(f => f.tipo === "quartas");
      if (!faseQuartas) throw new TRPCError({ code: "BAD_REQUEST", message: "Fase Quartas não encontrada. Inicialize a Copa." });

      // Recuperar os 5 vencedores das Oitavas do banco
      const faseOitavas = fases.find(f => f.tipo === "oitavas");
      if (!faseOitavas) throw new TRPCError({ code: "BAD_REQUEST", message: "Fase Oitavas não encontrada" });

      const oitavasVencedores = getRows(await db.execute(sql`
        SELECT vencedorId FROM copa_confrontos
        WHERE faseId = ${faseOitavas.id} AND vencedorId IS NOT NULL
        ORDER BY id
      `)).map(r => Number(r.vencedorId));

      // 7 jogadores: 5 das Oitavas + 2 da Repescagem 2
      const todos7 = [...oitavasVencedores, ...vencedores];
      const todos7Ranked = await rankearPorPontos(todos7);

      // Melhor → bye; restantes 6 → 3 duelos (semanaRef=11)
      const byeId = todos7Ranked[0];
      const duelistas = todos7Ranked.slice(1);

      if (duelistas.length >= 6) {
        await criarConfronto(faseQuartas.id, duelistas[0]!, duelistas[5]!, 11);
        await criarConfronto(faseQuartas.id, duelistas[1]!, duelistas[4]!, 11);
        await criarConfronto(faseQuartas.id, duelistas[2]!, duelistas[3]!, 11);
      }
      if (byeId) {
        await criarConfronto(faseQuartas.id, byeId, null, 11);
      }

      return { success: true, proximaFase: faseQuartas.nome };
    }

    // === QUARTAS (ordem 5) → SEMIFINAL (2 duelos) ===
    if (faseAtual.tipo === "quartas" || faseAtual.ordem === 5) {
      const faseSemi = fases.find(f => f.tipo === "semifinal");
      if (!faseSemi) throw new TRPCError({ code: "BAD_REQUEST", message: "Fase Semifinal não encontrada. Inicialize a Copa." });

      // vencedores = 3 duelos winners + bye player
      const byeRows = getRows(await db.execute(sql`
        SELECT corretorAId FROM copa_confrontos
        WHERE faseId = ${faseAtualId} AND corretorBId IS NULL AND corretorAId IS NOT NULL
      `));
      const byeId = byeRows[0]?.corretorAId ? Number(byeRows[0].corretorAId) : null;

      const todos4 = byeId ? [...vencedores, byeId] : vencedores;
      const todos4Ranked = await rankearPorPontos(todos4);

      // 2 duelos (semanaRef=12): 1º vs 4º, 2º vs 3º
      if (todos4Ranked.length >= 4) {
        await criarConfronto(faseSemi.id, todos4Ranked[0]!, todos4Ranked[3]!, 12);
        await criarConfronto(faseSemi.id, todos4Ranked[1]!, todos4Ranked[2]!, 12);
      } else if (todos4Ranked.length >= 2) {
        await criarConfronto(faseSemi.id, todos4Ranked[0]!, todos4Ranked[1]!, 12);
      }

      return { success: true, proximaFase: faseSemi.nome };
    }

    // === SEMIFINAL (ordem 6) → GRANDE FINAL (ordem 8) + 3º LUGAR (ordem 7) ===
    if (faseAtual.tipo === "semifinal" || faseAtual.ordem === 6) {
      const fase3o = fases.find(f => f.tipo === "terceiro");
      const faseFinal = fases.find(f => f.tipo === "final");
      if (!fase3o || !faseFinal) throw new TRPCError({ code: "BAD_REQUEST", message: "Fases de Final/3º Lugar não encontradas. Inicialize a Copa." });

      // vencedores = 2 semifinal winners → Final; perdedores → 3º Lugar (semanaRef=13)
      if (vencedores.length >= 2) {
        await criarConfronto(faseFinal.id, vencedores[0]!, vencedores[1]!, 13);
      }
      if (perdedores.length >= 2) {
        await criarConfronto(fase3o.id, perdedores[0]!, perdedores[1]!, 13);
      }

      return { success: true, proximaFase: `${faseFinal.nome} + ${fase3o.nome}` };
    }

    // === FINAL (ordem 8) → PREMIAÇÃO: aplicar bônus finais ===
    if (faseAtual.tipo === "final" || faseAtual.ordem === 8) {
      // vencedores[0] = campeão, perdedores[0] = vice
      const campeaoId = vencedores[0];
      const viceId = perdedores[0];

      // Resultado do 3º Lugar
      const fase3o = fases.find(f => f.tipo === "terceiro");
      if (!fase3o) throw new TRPCError({ code: "BAD_REQUEST", message: "Fase 3º Lugar não encontrada" });

      const t3Row = getRows(await db.execute(sql`
        SELECT vencedorId, corretorAId, corretorBId
        FROM copa_confrontos WHERE faseId = ${fase3o.id} AND vencedorId IS NOT NULL LIMIT 1
      `))[0];

      const vencedor3o = t3Row?.vencedorId ? Number(t3Row.vencedorId) : null;
      const perdedor3o = t3Row
        ? (Number(t3Row.vencedorId) === Number(t3Row.corretorAId) ? Number(t3Row.corretorBId) : Number(t3Row.corretorAId))
        : null;

      // Aplicar bônus finais na semana 13
      const bonusFinais: { id: number | undefined | null; bonus: number }[] = [
        { id: campeaoId, bonus: 10 },
        { id: viceId,    bonus: 7  },
        { id: vencedor3o, bonus: 5 },
        { id: perdedor3o, bonus: 3 },
      ];
      for (const { id, bonus } of bonusFinais) {
        if (id) await aplicarBonus(id, 13, bonus);
      }

      const fasePremio = fases.find(f => f.tipo === "premiacao");
      return { success: true, proximaFase: fasePremio?.nome ?? "Premiação" };
    }

    throw new TRPCError({ code: "BAD_REQUEST", message: `Fase "${faseAtual.nome}" não tem transição definida` });
  }),
});
