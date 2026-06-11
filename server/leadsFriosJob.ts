/**
 * Job: Leads Frios Auto-Perdidos
 * Leads sem qualquer contato há 30+ dias → status = 'perdido'
 * Roda diariamente às 2h (SP)
 */
import { getDb } from "./db";
import { leads, leadHistory } from "../drizzle/schema";
import { eq, and, lt, isNull, or, inArray, notInArray } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { agora } from "./timezone";

const DIAS_INATIVO = 30;
const MOTIVO = "Sem contato por 30 dias — arquivado automaticamente";

async function arquivarLeadsFrios() {
  const db = await getDb();
  if (!db) return;

  const agr = agora();
  const limite = new Date(agr.getTime() - DIAS_INATIVO * 24 * 60 * 60 * 1000);

  try {
    // Buscar leads ativos sem contato há 30+ dias
    // Considera: ultimaInteracao OU ultimoContato (o mais recente)
    const friosResult = await db.select({ id: leads.id, nome: leads.nome, corretorId: leads.corretorId })
      .from(leads)
      .where(
        and(
          // Não está nos status finais
          notInArray(leads.status, ['perdido', 'contrato_fechado', 'pos_venda']),
          // Não está na lixeira
          sql`(${leads.naLixeira} = 0 OR ${leads.naLixeira} IS NULL)`,
          // Sem interação há 30 dias (considera ultimaInteracao e ultimoContato)
          or(
            and(
              sql`${leads.ultimaInteracao} IS NOT NULL`,
              lt(leads.ultimaInteracao, limite)
            ),
            and(
              isNull(leads.ultimaInteracao),
              sql`${leads.ultimoContato} IS NOT NULL`,
              lt(leads.ultimoContato, limite)
            ),
            and(
              isNull(leads.ultimaInteracao),
              isNull(leads.ultimoContato),
              lt(leads.createdAt, limite)
            )
          )
        )
      );

    if (friosResult.length === 0) {
      console.log("[LeadsFrios] Nenhum lead frio encontrado.");
      return;
    }

    const ids = friosResult.map(l => l.id);

    // Marcar como perdido
    await db.update(leads)
      .set({
        status: 'perdido' as const,
        motivoPerdido: MOTIVO,
        motivoPerdaCategoria: 'sem_retorno',
        updatedAt: agr,
      })
      .where(inArray(leads.id, ids));

    // Registrar histórico
    for (const lead of friosResult) {
      await db.insert(leadHistory).values({
        leadId: lead.id,
        corretorId: lead.corretorId ?? 0,
        tipo: 'outro' as const,
        resultado: 'outro' as const,
        observacoes: MOTIVO,
        createdAt: agr,
      }).catch(() => {});
    }

    console.log(`[LeadsFrios] ${ids.length} leads arquivados automaticamente (sem contato ${DIAS_INATIVO}+ dias)`);
  } catch (err) {
    console.error("[LeadsFrios] Erro ao arquivar leads frios:", err);
  }
}

function calcularMsAte2h(): number {
  const agr = agora();
  const amanha2h = new Date(agr);
  amanha2h.setDate(amanha2h.getDate() + 1);
  amanha2h.setHours(2, 0, 0, 0);
  return amanha2h.getTime() - agr.getTime();
}

export function iniciarLeadsFriosJob() {
  // Primeira execução no próximo dia às 2h
  const msAte2h = calcularMsAte2h();
  setTimeout(() => {
    arquivarLeadsFrios();
    setInterval(arquivarLeadsFrios, 24 * 60 * 60 * 1000);
  }, msAte2h);
  console.log(`[LeadsFrios] Job agendado — próxima execução em ${Math.round(msAte2h / 3600000)}h`);
}
