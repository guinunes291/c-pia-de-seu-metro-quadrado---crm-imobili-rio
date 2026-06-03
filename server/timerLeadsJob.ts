import { getDb } from "./db";
import { leads } from "../drizzle/schema";
import { and, eq, lt, inArray } from "drizzle-orm";

/**
 * Tempo máximo em "Aguardando Atendimento" com timerAtivo antes de desativar o timer: 5 minutos
 * ⚠️ REGRA ATUALIZADA: o timer NÃO redistribui mais o lead.
 * Leads em aguardando_atendimento ficam com o corretor atual.
 * A transferência só ocorre por ação manual ou após 48h sem interação
 * (via transferenciaAutomaticaJob que roda à meia-noite).
 */
const TIMER_MINUTOS = 5;

/**
 * Job que verifica leads com timer ativo que ultrapassaram 5 minutos.
 * Apenas desativa o timerAtivo — NÃO redistribui o lead para outro corretor.
 *
 * Executa a cada 1 minuto.
 */
export async function verificarTimerLeads() {
  try {
    const db = await getDb();
    if (!db) {
      console.error("[Timer Job] Banco de dados não disponível");
      return;
    }

    const agora = new Date();
    const limiteTempoAtras = new Date(agora.getTime() - TIMER_MINUTOS * 60 * 1000);

    // Buscar leads com timer ativo que ultrapassaram 5 minutos
    const leadsExpirados = await db
      .select({ id: leads.id })
      .from(leads)
      .where(
        and(
          eq(leads.timerAtivo, true),
          eq(leads.status, "aguardando_atendimento"),
          eq(leads.transferidoManualmentePorAdmin, false),
          lt(leads.timestampRecebimento, limiteTempoAtras)
        )
      )
      .limit(100);

    if (leadsExpirados.length > 0) {
      const ids = leadsExpirados.map(l => l.id);
      await db
        .update(leads)
        .set({ timerAtivo: false })
        .where(inArray(leads.id, ids));
      console.log(`[Timer Job] timerAtivo desativado em ${ids.length} leads (sem redistribuição)`);
    }
  } catch (error) {
    console.error("[Timer Job] Erro na verificação de timer:", error);
  }
}

// Job será executado pelo distribuicaoJob.ts
