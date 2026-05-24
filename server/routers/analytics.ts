import { z } from "zod";
import * as db from "../db";
import { TRPCError } from "@trpc/server";
import { router } from "../_core/trpc";
import { gestorProcedure, isGestorLevel } from "../_core/rbac";
import { getDb } from "../db";
import { leads, users } from "../../drizzle/schema";
import { eq, and, sql, inArray, ne } from "drizzle-orm";
import { SLA_CONFIG, TERMINAL_STATUSES } from "../../shared/leadStatus";
import { calcLeadTemperature } from "../../shared/leadStatus";

// ============================================================================
// ROUTER DE ANALYTICS
// ============================================================================
export const analyticsRouter = router({
    // Funil de Conversão Geral
    funilConversao: gestorProcedure
      .input(z.object({
        dataInicio: z.date().optional(),
        dataFim: z.date().optional()
      }))
      .query(async ({ input }) => {
        return await db.getFunilConversaoGeral(input.dataInicio, input.dataFim);
      }),

    // Taxa de Conversão por Corretor
    taxaConversaoPorCorretor: gestorProcedure
      .input(z.object({
        dataInicio: z.date().optional(),
        dataFim: z.date().optional()
      }))
      .query(async ({ input }) => {
        return await db.getTaxaConversaoPorCorretor(input.dataInicio, input.dataFim);
      }),

    // Tempo Médio por Etapa
    tempoMedioPorEtapa: gestorProcedure
      .input(z.object({
        dataInicio: z.date().optional(),
        dataFim: z.date().optional()
      }))
      .query(async ({ input }) => {
        return await db.getTempoMedioPorEtapa(input.dataInicio, input.dataFim);
      }),

    // Evolução de Vendas (VGV)
    evolucaoVendas: gestorProcedure
      .input(z.object({
        dataInicio: z.date(),
        dataFim: z.date(),
        agrupamento: z.enum(['dia', 'semana', 'mes']).default('dia')
      }))
      .query(async ({ input }) => {
        return await db.getEvolucaoVendas(input.dataInicio, input.dataFim, input.agrupamento);
      }),

    // Distribuição de Vendas por Projeto
    distribuicaoVendasPorProjeto: gestorProcedure
      .input(z.object({
        dataInicio: z.date().optional(),
        dataFim: z.date().optional()
      }))
      .query(async ({ input }) => {
        return await db.getDistribuicaoVendasPorProjeto(input.dataInicio, input.dataFim);
      }),

    // Origem de Leads mais Efetiva
    origemLeadsMaisEfetiva: gestorProcedure
      .input(z.object({
        dataInicio: z.date().optional(),
        dataFim: z.date().optional()
      }))
      .query(async ({ input }) => {
        return await db.getOrigemLeadsMaisEfetiva(input.dataInicio, input.dataFim);
      }),

    // Leads por Horário de Entrada
    leadsPorHorarioEntrada: gestorProcedure
      .input(z.object({
        dataInicio: z.date().optional(),
        dataFim: z.date().optional()
      }))
      .query(async ({ input }) => {
        return await db.getLeadsPorHorarioEntrada(input.dataInicio, input.dataFim);
      }),

    // Ranking de Corretores
    rankingCorretores: gestorProcedure
      .input(z.object({
        dataInicio: z.date().optional(),
        dataFim: z.date().optional()
      }))
      .query(async ({ input }) => {
        return await db.getRankingCorretoresCompleto(input.dataInicio, input.dataFim);
      }),

    // Produtividade por Corretor
    produtividadePorCorretor: gestorProcedure
      .input(z.object({
        dataInicio: z.date().optional(),
        dataFim: z.date().optional()
      }))
      .query(async ({ input }) => {
        return await db.getProdutividadePorCorretor(input.dataInicio, input.dataFim);
      }),

    // Comparativo Mensal de Corretores
    comparativoMensalCorretores: gestorProcedure
      .input(z.object({
        anoInicio: z.number(),
        anoFim: z.number()
      }))
      .query(async ({ input }) => {
        return await db.getComparativoMensalCorretores(input.anoInicio, input.anoFim);
      }),

    // Carga de Trabalho
    cargaTrabalho: gestorProcedure
      .query(async () => {
        return await db.getCargaTrabalho();
      }),

    // Previsão de Vendas
    previsaoVendas: gestorProcedure
      .query(async () => {
        return await db.getPrevisaoVendas();
      }),

    // Radar de Gargalos — novo endpoint para BottleneckPanel
    bottlenecks: gestorProcedure
      .query(async () => {
        const drizzleDb = await getDb();
        if (!drizzleDb) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB indisponível' });

        const nonTerminal = Object.keys(SLA_CONFIG) as string[];

        // Buscar leads ativos por status (excluindo terminais e sem corretor)
        const leadsAtivos = await drizzleDb
          .select({
            id: leads.id,
            status: leads.status,
            corretorId: leads.corretorId,
            updatedAt: leads.updatedAt,
          })
          .from(leads)
          .where(
            and(
              eq(leads.naLixeira, false),
              inArray(leads.status, nonTerminal),
            )
          );

        const now = Date.now();

        // Calcular métricas por status
        const statusStats: Record<string, { count: number; totalHours: number; slaBreached: number }> = {};
        for (const lead of leadsAtivos) {
          if (!statusStats[lead.status]) {
            statusStats[lead.status] = { count: 0, totalHours: 0, slaBreached: 0 };
          }
          const s = statusStats[lead.status];
          s.count++;
          const hoursInStatus = (now - new Date(lead.updatedAt).getTime()) / 3_600_000;
          s.totalHours += hoursInStatus;
          const sla = SLA_CONFIG[lead.status as keyof typeof SLA_CONFIG];
          if (sla && hoursInStatus >= sla.maxHours) s.slaBreached++;
        }

        const stages = Object.entries(statusStats)
          .map(([status, stats]) => ({
            status,
            count: stats.count,
            avgHours: stats.count > 0 ? stats.totalHours / stats.count : 0,
            slaBreached: stats.slaBreached,
          }))
          .filter((s) => s.count > 0 || s.slaBreached > 0)
          .sort((a, b) => b.slaBreached - a.slaBreached || b.count - a.count);

        const totalSlaBreached = stages.reduce((acc, s) => acc + s.slaBreached, 0);

        // Corretores com mais leads frios
        const corretorIds = [...new Set(leadsAtivos.map((l) => l.corretorId).filter(Boolean))] as number[];
        const corretorUsers = corretorIds.length
          ? await drizzleDb.select({ id: users.id, nome: users.name }).from(users).where(inArray(users.id, corretorIds))
          : [];
        const corretorMap = new Map(corretorUsers.map((u) => [u.id, u.nome]));

        const corretorStats: Record<number, { coldLeads: number; totalLeads: number }> = {};
        for (const lead of leadsAtivos) {
          if (!lead.corretorId) continue;
          if (!corretorStats[lead.corretorId]) corretorStats[lead.corretorId] = { coldLeads: 0, totalLeads: 0 };
          const hoursInStatus = (now - new Date(lead.updatedAt).getTime()) / 3_600_000;
          const temp = calcLeadTemperature(lead.status, hoursInStatus, false);
          corretorStats[lead.corretorId].totalLeads++;
          if (temp === 'cold') corretorStats[lead.corretorId].coldLeads++;
        }

        const corretoresFrios = Object.entries(corretorStats)
          .filter(([, s]) => s.coldLeads > 0)
          .map(([id, s]) => ({
            corretorId: Number(id),
            corretorNome: corretorMap.get(Number(id)) ?? 'Corretor',
            coldLeads: s.coldLeads,
            totalLeads: s.totalLeads,
          }))
          .sort((a, b) => b.coldLeads - a.coldLeads)
          .slice(0, 5);

        return { stages, corretoresFrios, totalSlaBreached };
      }),
});
