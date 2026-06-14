/**
 * server/agentRoutes.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Endpoints de ingestao do agente multiagentes (orquestrador agente-smq).
 * Persiste conversas/turnos, eventos (telemetria/decisoes) e notas de qualidade,
 * e expoe o DESFECHO do lead (funil/visita/contrato) para rotular conversas.
 *
 * Auth: token dedicado em AGENT_API_TOKEN (query ?token=... ou header
 * x-agent-token). Sem PII nos eventos (telefone pseudonimizado pelo agente).
 *
 * Montagem (server/_core/index.ts):  app.use('/api/agent', agentRoutes)
 * Requer migration: pnpm run db:push (cria agent_* tables).
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { Router, Request, Response, NextFunction } from 'express';
import { eq } from 'drizzle-orm';
import { getDb } from './db';
import {
  agentConversations,
  agentMessages,
  agentEvents,
  agentEvalScores,
  leads,
  visitas,
  contratos,
} from '../drizzle/schema';

const router = Router();

/** Auth por token dedicado do agente. */
function requireAgentToken(req: Request, res: Response, next: NextFunction) {
  const expected = process.env.AGENT_API_TOKEN;
  if (!expected) {
    return res.status(503).json({ success: false, error: 'AGENT_API_TOKEN nao configurado' });
  }
  const token = (req.query.token as string) || (req.headers['x-agent-token'] as string) || '';
  if (token !== expected) {
    return res.status(401).json({ success: false, error: 'Token invalido' });
  }
  next();
}

router.use(requireAgentToken);

/**
 * POST /api/agent/conversation
 * Upsert da conversa + (opcional) turnos novos.
 * Body: { conversationId, phoneHash?, leadId?, estagio?, temperatura?, handoff?, messages?: [{role, content}] }
 */
router.post('/conversation', async (req: Request, res: Response) => {
  try {
    const { conversationId, phoneHash, leadId, estagio, temperatura, handoff, messages } = req.body || {};
    if (!conversationId) return res.status(400).json({ success: false, error: 'conversationId obrigatorio' });
    const db = await getDb();

    await db
      .insert(agentConversations)
      .values({ conversationId, phoneHash, leadId, estagio, temperatura, handoff: !!handoff })
      .onDuplicateKeyUpdate({ set: { estagio, temperatura, handoff: !!handoff } });

    if (Array.isArray(messages) && messages.length) {
      await db.insert(agentMessages).values(
        messages
          .filter((m: any) => m && m.role)
          .map((m: any) => ({ conversationId, role: m.role, content: m.content || '' })),
      );
    }
    res.json({ success: true });
  } catch (e: any) {
    console.error('[agent/conversation] erro:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

/**
 * POST /api/agent/events  — ingestao em lote de eventos/decisoes/KPIs.
 * Body: { events: [{ conversationId?, phoneHash?, agent, type, kpi?, value?, meta? }] }
 */
router.post('/events', async (req: Request, res: Response) => {
  try {
    const eventos = Array.isArray(req.body?.events) ? req.body.events : [];
    if (!eventos.length) return res.json({ success: true, inserted: 0 });
    const db = await getDb();
    await db.insert(agentEvents).values(
      eventos
        .filter((e: any) => e && e.agent && e.type)
        .map((e: any) => ({
          conversationId: e.conversationId || null,
          phoneHash: e.phoneHash || null,
          agent: e.agent,
          type: e.type,
          kpi: e.kpi || null,
          value: e.value != null ? String(e.value) : null,
          meta: e.meta || null,
        })),
    );
    res.json({ success: true, inserted: eventos.length });
  } catch (e: any) {
    console.error('[agent/events] erro:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

/**
 * POST /api/agent/eval  — nota de qualidade (0-100) de uma conversa.
 * Body: { conversationId, score, breakdown?, sugestoes? }
 */
router.post('/eval', async (req: Request, res: Response) => {
  try {
    const { conversationId, score, breakdown, sugestoes } = req.body || {};
    if (!conversationId || typeof score !== 'number') {
      return res.status(400).json({ success: false, error: 'conversationId e score obrigatorios' });
    }
    const db = await getDb();
    await db.insert(agentEvalScores).values({ conversationId, score, breakdown, sugestoes });
    res.json({ success: true });
  } catch (e: any) {
    console.error('[agent/eval] erro:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

/**
 * GET /api/agent/outcome?leadId=..|telefone=..
 * Devolve o desfecho atual do lead (rotulo para aprendizado).
 */
router.get('/outcome', async (req: Request, res: Response) => {
  try {
    const leadId = req.query.leadId ? Number(req.query.leadId) : null;
    const telefone = (req.query.telefone as string) || null;
    if (!leadId && !telefone) return res.status(400).json({ success: false, error: 'leadId ou telefone obrigatorio' });
    const db = await getDb();

    const row = leadId
      ? (await db.select().from(leads).where(eq(leads.id, leadId)).limit(1))[0]
      : (await db.select().from(leads).where(eq(leads.telefone, telefone!)).limit(1))[0];

    if (!row) return res.json({ success: true, found: false });

    const visita = (
      await db.select({ id: visitas.id }).from(visitas).where(eq(visitas.leadId, row.id)).limit(1)
    )[0];
    const contrato = (
      await db.select({ id: contratos.id, status: contratos.status }).from(contratos).where(eq(contratos.leadId, row.id)).limit(1)
    )[0];

    res.json({
      success: true,
      found: true,
      leadId: row.id,
      status: row.status, // novo..qualificado..visita_realizada..proposta_enviada..contrato_fechado..perdido
      temperatura: (row as any).temperatura ?? null,
      visitou: !!visita,
      temContrato: !!contrato,
      contratoStatus: contrato?.status ?? null,
    });
  } catch (e: any) {
    console.error('[agent/outcome] erro:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

export default router;
