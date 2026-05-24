/**
 * SLA Monitor — runs every 5 minutes and creates alerts for leads with
 * breached or near-breached SLA limits.
 *
 * Logic:
 * - For each active (non-terminal) lead with a corretorId:
 *   - If SLA is BREACHED (hours in status ≥ maxHours): create urgent alert
 *   - If SLA is URGENT (hours in status ≥ urgentHours): create warning alert
 * - Deduplication: skips if an unread alert already exists for the same lead
 *   within the last hour.
 */
import { and, eq, gt, inArray, ne, isNotNull } from "drizzle-orm";
import { getDb } from "../db";
import { leads, alertas, users } from "../../drizzle/schema";
import { SLA_CONFIG, TERMINAL_STATUSES, calcSlaProgress } from "../../shared/leadStatus";
import { sendPushNotification } from "../pushNotifications";

const SLA_STATUSES = Object.keys(SLA_CONFIG) as string[];
const DEDUP_WINDOW_MS = 60 * 60 * 1000; // 1 hora entre alertas do mesmo lead

let isRunning = false;
let intervalHandle: ReturnType<typeof setInterval> | null = null;

export async function runSlaCheck(): Promise<{ checked: number; alerted: number }> {
  const db = await getDb();
  if (!db) return { checked: 0, alerted: 0 };

  const now = Date.now();

  // Fetch all active leads with SLA-relevant statuses that have a corretor
  const activeLeads = await db
    .select({
      id: leads.id,
      nome: leads.nome,
      status: leads.status,
      corretorId: leads.corretorId,
      updatedAt: leads.updatedAt,
    })
    .from(leads)
    .where(
      and(
        eq(leads.naLixeira, false),
        isNotNull(leads.corretorId),
        inArray(leads.status, SLA_STATUSES),
      ),
    );

  if (activeLeads.length === 0) return { checked: 0, alerted: 0 };

  // Fetch system user (id=1 or first admin) to use as remetenteId
  const systemUser = await db
    .select({ id: users.id })
    .from(users)
    .limit(1);
  const remetenteId = systemUser[0]?.id;
  if (!remetenteId) return { checked: activeLeads.length, alerted: 0 };

  // Fetch recent unread alerts to dedup
  const dedupeThreshold = new Date(now - DEDUP_WINDOW_MS);
  const recentAlerts = await db
    .select({ leadId: alertas.leadId })
    .from(alertas)
    .where(
      and(
        eq(alertas.lido, false),
        gt(alertas.createdAt, dedupeThreshold),
        inArray(
          alertas.leadId,
          activeLeads.map((l) => l.id),
        ),
      ),
    );
  const alreadyAlertedLeadIds = new Set(recentAlerts.map((a) => a.leadId));

  let alerted = 0;

  for (const lead of activeLeads) {
    if (!lead.corretorId) continue;
    if (alreadyAlertedLeadIds.has(lead.id)) continue;

    const hoursInStatus = (now - new Date(lead.updatedAt).getTime()) / 3_600_000;
    const { isBreached, isUrgent } = calcSlaProgress(lead.status, hoursInStatus);

    if (!isBreached && !isUrgent) continue;

    const hoursRounded = Math.round(hoursInStatus);
    const statusLabel =
      SLA_CONFIG[lead.status as keyof typeof SLA_CONFIG] &&
      `SLA: ${SLA_CONFIG[lead.status as keyof typeof SLA_CONFIG]!.maxHours}h`;

    const mensagem = isBreached
      ? `⛔ SLA VENCIDO: Lead "${lead.nome}" está ${hoursRounded}h no status "${lead.status}" (${statusLabel})`
      : `⚠️ SLA URGENTE: Lead "${lead.nome}" está há ${hoursRounded}h no status "${lead.status}" (${statusLabel})`;

    try {
      await db.insert(alertas).values({
        leadId: lead.id,
        corretorId: lead.corretorId,
        remetenteId,
        mensagem,
        lido: false,
      });

      // Push notification to corretor
      await sendPushNotification(lead.corretorId, {
        title: isBreached ? "SLA Vencido" : "Atenção: SLA Urgente",
        body: mensagem,
        tag: `sla-lead-${lead.id}`,
        url: `/leads?leadId=${lead.id}`,
      }).catch(() => {}); // non-blocking

      alerted++;
    } catch {
      // ignore individual insert failures
    }
  }

  return { checked: activeLeads.length, alerted };
}

export function startSlaMonitor(intervalMinutes = 5): void {
  if (intervalHandle) return; // already running

  const runSafe = async () => {
    if (isRunning) return;
    isRunning = true;
    try {
      const result = await runSlaCheck();
      if (result.alerted > 0) {
        console.log(`[SLA Monitor] ${result.alerted}/${result.checked} leads alertados`);
      }
    } catch (err) {
      console.error("[SLA Monitor] Erro:", err);
    } finally {
      isRunning = false;
    }
  };

  // First run after 1 minute so server finishes booting
  setTimeout(runSafe, 60_000);
  intervalHandle = setInterval(runSafe, intervalMinutes * 60_000);
  console.log(`[SLA Monitor] Iniciado — intervalo: ${intervalMinutes}min`);
}

export function stopSlaMonitor(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}
