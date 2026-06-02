import { getDb } from "./db";
import { sql } from "drizzle-orm";

/**
 * Job de limpeza automática de tabelas de log
 * Remove registros antigos para reduzir o custo de armazenamento no Cloud.
 *
 * Política de retenção:
 * - distribution_log: mantém apenas os últimos 30 dias
 * - notifications: mantém apenas os últimos 30 dias
 * - log_transferencias: mantém apenas os últimos 60 dias
 *
 * Executa uma vez por dia às 3h (horário de SP)
 */
export async function executarLimpezaDeLogs(): Promise<void> {
  const db = await getDb();
  if (!db) {
    console.warn("[LogCleanup] Banco não disponível, pulando limpeza.");
    return;
  }

  console.log("[LogCleanup] Iniciando limpeza de tabelas de log...");

  try {
    // Limpar distribution_log com mais de 30 dias
    const [resDistrib] = await db.execute(
      sql`DELETE FROM distribution_log WHERE createdAt < NOW() - INTERVAL 30 DAY`
    );
    const distribDeleted = (resDistrib as any).affectedRows ?? 0;
    console.log(`[LogCleanup] distribution_log: ${distribDeleted} registros removidos (> 30 dias)`);

    // Limpar notifications com mais de 30 dias
    const [resNotif] = await db.execute(
      sql`DELETE FROM notifications WHERE createdAt < NOW() - INTERVAL 30 DAY`
    );
    const notifDeleted = (resNotif as any).affectedRows ?? 0;
    console.log(`[LogCleanup] notifications: ${notifDeleted} registros removidos (> 30 dias)`);

    // Limpar log_transferencias com mais de 60 dias
    const [resTrans] = await db.execute(
      sql`DELETE FROM log_transferencias WHERE dataTransferencia < NOW() - INTERVAL 60 DAY`
    );
    const transDeleted = (resTrans as any).affectedRows ?? 0;
    console.log(`[LogCleanup] log_transferencias: ${transDeleted} registros removidos (> 60 dias)`);

    console.log(
      `[LogCleanup] Limpeza concluída. Total removido: ${distribDeleted + notifDeleted + transDeleted} registros.`
    );
  } catch (error) {
    console.error("[LogCleanup] Erro durante limpeza:", error);
  }
}

/**
 * Agenda a limpeza diária de logs às 3h (horário de SP, UTC-3)
 */
export function agendarLimpezaDeLogs(): void {
  function calcularMsAte3hSP(): number {
    const agora = new Date();
    const offsetSP = -3 * 60;
    const agoraSP = new Date(agora.getTime() + (offsetSP - agora.getTimezoneOffset()) * 60 * 1000);

    const proxima3h = new Date(agoraSP);
    proxima3h.setHours(3, 0, 0, 0);

    if (agoraSP >= proxima3h) {
      proxima3h.setDate(proxima3h.getDate() + 1);
    }

    return proxima3h.getTime() - agoraSP.getTime();
  }

  function agendar() {
    const ms = calcularMsAte3hSP();
    const horas = (ms / 3600000).toFixed(1);
    console.log(`[LogCleanup] Próxima limpeza agendada em ${horas}h (às 3h SP)`);

    setTimeout(async () => {
      await executarLimpezaDeLogs();
      agendar();
    }, ms);
  }

  agendar();
}
