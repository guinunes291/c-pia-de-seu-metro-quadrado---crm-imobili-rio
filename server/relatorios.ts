import { getDb } from "./db";
import { leads, projects, users, contratos } from "../drizzle/schema";
import { eq, and, sql, inArray } from "drizzle-orm";

interface ConversaoPorProjeto {
  projectId: number;
  projectNome: string;
  totalLeads: number;
  leadsContatados: number;
  leadsAgendados: number;
  visitasRealizadas: number;
  contratosFechados: number;
  leadsPerdidos: number;
  taxaContato: number; // % de leads contatados
  taxaAgendamento: number; // % de leads agendados
  taxaVisita: number; // % de visitas realizadas
  taxaConversao: number; // % de contratos fechados
  ticketMedio: number; // Valor médio dos contratos em R$
}

/**
 * Calcula estatísticas de conversão por projeto.
 * Corrigido: batch query única em vez de N+1 (1 query por projeto).
 */
export async function calcularConversaoPorProjeto(
  periodo?: { dataInicio?: Date; dataFim?: Date },
  corretoresIds?: number[]
): Promise<ConversaoPorProjeto[]> {
  const db = await getDb();
  if (!db) return [];

  // 1. Buscar todos os projetos em uma query
  const todosProjetos = await db.select().from(projects);
  if (todosProjetos.length === 0) return [];

  // 2. Buscar TODOS os leads de uma vez (batch) com filtro de período
  let todosLeads;
  if (periodo?.dataInicio && periodo?.dataFim) {
    todosLeads = await db
      .select()
      .from(leads)
      .where(
        and(
          sql`${leads.createdAt} >= ${periodo.dataInicio}`,
          sql`${leads.createdAt} <= ${periodo.dataFim}`
        )
      );
  } else {
    todosLeads = await db.select().from(leads);
  }

  // Filtrar por equipe se necessário
  if (corretoresIds) {
    todosLeads = todosLeads.filter(l => l.corretorId && corretoresIds.includes(l.corretorId));
  }

  // 3. Buscar contratos dos leads com contrato_fechado para calcular ticketMedio
  const leadIdsComContrato = todosLeads
    .filter(l => l.status === "contrato_fechado")
    .map(l => l.id);

  const contratosMap = new Map<number, number>(); // leadId -> valorVenda
  if (leadIdsComContrato.length > 0) {
    const contratosResult = await db
      .select({ leadId: contratos.leadId, valorVenda: contratos.valorVenda })
      .from(contratos)
      .where(and(
        inArray(contratos.leadId, leadIdsComContrato),
        eq(contratos.distrato, false)
      ));
    for (const c of contratosResult) {
      if (c.valorVenda && c.leadId) {
        contratosMap.set(c.leadId, parseFloat(c.valorVenda));
      }
    }
  }

  // 4. Agrupar leads por projeto em memória
  const leadsPorProjeto = new Map<number, typeof todosLeads>();
  for (const lead of todosLeads) {
    if (!lead.projectId) continue;
    if (!leadsPorProjeto.has(lead.projectId)) {
      leadsPorProjeto.set(lead.projectId, []);
    }
    leadsPorProjeto.get(lead.projectId)!.push(lead);
  }

  const resultado: ConversaoPorProjeto[] = [];

  for (const projeto of todosProjetos) {
    const leadsDoProjeto = leadsPorProjeto.get(projeto.id) ?? [];
    if (leadsDoProjeto.length === 0) continue;

    const totalLeads = leadsDoProjeto.length;
    const leadsContatados = leadsDoProjeto.filter(
      (l) => l.status !== "novo" && l.status !== "aguardando_atendimento"
    ).length;
    const leadsAgendados = leadsDoProjeto.filter(
      (l) => l.status === "agendado" || l.status === "visita_realizada" || l.status === "analise_credito" || l.status === "contrato_fechado"
    ).length;
    const visitasRealizadas = leadsDoProjeto.filter(
      (l) => l.status === "visita_realizada" || l.status === "analise_credito" || l.status === "contrato_fechado"
    ).length;
    const contratosFechados = leadsDoProjeto.filter(
      (l) => l.status === "contrato_fechado"
    ).length;
    const leadsPerdidos = leadsDoProjeto.filter(
      (l) => l.status === "perdido"
    ).length;

    const taxaContato = totalLeads > 0 ? (leadsContatados / totalLeads) * 100 : 0;
    const taxaAgendamento = totalLeads > 0 ? (leadsAgendados / totalLeads) * 100 : 0;
    const taxaVisita = leadsAgendados > 0 ? (visitasRealizadas / leadsAgendados) * 100 : 0;
    const taxaConversao = totalLeads > 0 ? (contratosFechados / totalLeads) * 100 : 0;

    // Calcular ticket médio usando contratos.valorVenda
    const valoresContratos = leadsDoProjeto
      .filter(l => l.status === "contrato_fechado" && contratosMap.has(l.id))
      .map(l => contratosMap.get(l.id)!);
    const ticketMedio = valoresContratos.length > 0
      ? valoresContratos.reduce((a, b) => a + b, 0) / valoresContratos.length
      : 0;

    resultado.push({
      projectId: projeto.id,
      projectNome: projeto.nome,
      totalLeads,
      leadsContatados,
      leadsAgendados,
      visitasRealizadas,
      contratosFechados,
      leadsPerdidos,
      taxaContato: Math.round(taxaContato * 100) / 100,
      taxaAgendamento: Math.round(taxaAgendamento * 100) / 100,
      taxaVisita: Math.round(taxaVisita * 100) / 100,
      taxaConversao: Math.round(taxaConversao * 100) / 100,
      ticketMedio: Math.round(ticketMedio * 100) / 100,
    });
  }

  // Ordenar por taxa de conversão (maior primeiro)
  resultado.sort((a, b) => b.taxaConversao - a.taxaConversao);

  return resultado;
}

interface ConversaoPorCorretor {
  corretorId: number;
  corretorNome: string;
  totalLeads: number;
  leadsContatados: number;
  leadsAgendados: number;
  visitasRealizadas: number;
  contratosFechados: number;
  leadsPerdidos: number;
  taxaContato: number;
  taxaAgendamento: number;
  taxaVisita: number;
  taxaConversao: number;
  tempoMedioResposta: number; // Em minutos (média do campo tempoAtePrimeiroContato)
}

/**
 * Calcula estatísticas de conversão por corretor.
 * Corrigido: batch query única em vez de N+1 (1 query por corretor).
 */
export async function calcularConversaoPorCorretor(
  periodo?: { dataInicio?: Date; dataFim?: Date },
  corretoresIds?: number[]
): Promise<ConversaoPorCorretor[]> {
  const db = await getDb();
  if (!db) return [];

  // 1. Buscar TODOS os leads de uma vez (batch) com filtro de período
  let todosLeads;
  if (periodo?.dataInicio && periodo?.dataFim) {
    todosLeads = await db
      .select()
      .from(leads)
      .where(
        and(
          sql`${leads.corretorId} IS NOT NULL`,
          sql`${leads.createdAt} >= ${periodo.dataInicio}`,
          sql`${leads.createdAt} <= ${periodo.dataFim}`
        )
      );
  } else {
    todosLeads = await db
      .select()
      .from(leads)
      .where(sql`${leads.corretorId} IS NOT NULL`);
  }

  // Filtrar por equipe se necessário
  if (corretoresIds) {
    todosLeads = todosLeads.filter(l => l.corretorId && corretoresIds.includes(l.corretorId));
  }

  if (todosLeads.length === 0) return [];

  // 2. Buscar todos os corretores relevantes em uma query
  const corretorIdsUnicos = [...new Set(todosLeads.map(l => l.corretorId!).filter(Boolean))];
  const corretoresResult = await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(inArray(users.id, corretorIdsUnicos));

  const corretoresMap = new Map(corretoresResult.map(c => [c.id, c.name || ""]));

  // 3. Agrupar leads por corretor em memória
  const leadsPorCorretor = new Map<number, typeof todosLeads>();
  for (const lead of todosLeads) {
    if (!lead.corretorId) continue;
    if (!leadsPorCorretor.has(lead.corretorId)) {
      leadsPorCorretor.set(lead.corretorId, []);
    }
    leadsPorCorretor.get(lead.corretorId)!.push(lead);
  }

  const resultado: ConversaoPorCorretor[] = [];

  for (const [corretorId, leadsDoCorretor] of leadsPorCorretor) {
    if (leadsDoCorretor.length === 0) continue;

    const corretorNome = corretoresMap.get(corretorId) ?? "";

    const totalLeads = leadsDoCorretor.length;
    const leadsContatados = leadsDoCorretor.filter(
      (l) => l.status !== "novo" && l.status !== "aguardando_atendimento"
    ).length;
    const leadsAgendados = leadsDoCorretor.filter(
      (l) => l.status === "agendado" || l.status === "visita_realizada" || l.status === "analise_credito" || l.status === "contrato_fechado"
    ).length;
    const visitasRealizadas = leadsDoCorretor.filter(
      (l) => l.status === "visita_realizada" || l.status === "analise_credito" || l.status === "contrato_fechado"
    ).length;
    const contratosFechados = leadsDoCorretor.filter(
      (l) => l.status === "contrato_fechado"
    ).length;
    const leadsPerdidos = leadsDoCorretor.filter(
      (l) => l.status === "perdido"
    ).length;

    const taxaContato = totalLeads > 0 ? (leadsContatados / totalLeads) * 100 : 0;
    const taxaAgendamento = totalLeads > 0 ? (leadsAgendados / totalLeads) * 100 : 0;
    const taxaVisita = leadsAgendados > 0 ? (visitasRealizadas / leadsAgendados) * 100 : 0;
    const taxaConversao = totalLeads > 0 ? (contratosFechados / totalLeads) * 100 : 0;

    // Calcular tempo médio de resposta usando campo tempoAtePrimeiroContato (em minutos)
    const temposResposta = leadsDoCorretor
      .filter(l => l.tempoAtePrimeiroContato !== null && l.tempoAtePrimeiroContato !== undefined)
      .map(l => l.tempoAtePrimeiroContato!);
    const tempoMedioResposta = temposResposta.length > 0
      ? Math.round(temposResposta.reduce((a, b) => a + b, 0) / temposResposta.length)
      : 0;

    resultado.push({
      corretorId,
      corretorNome,
      totalLeads,
      leadsContatados,
      leadsAgendados,
      visitasRealizadas,
      contratosFechados,
      leadsPerdidos,
      taxaContato: Math.round(taxaContato * 100) / 100,
      taxaAgendamento: Math.round(taxaAgendamento * 100) / 100,
      taxaVisita: Math.round(taxaVisita * 100) / 100,
      taxaConversao: Math.round(taxaConversao * 100) / 100,
      tempoMedioResposta,
    });
  }

  // Ordenar por taxa de conversão (maior primeiro)
  resultado.sort((a, b) => b.taxaConversao - a.taxaConversao);

  return resultado;
}

/**
 * Calcula estatísticas gerais do CRM
 */
export async function calcularEstatisticasGerais(
  periodo?: { dataInicio?: Date; dataFim?: Date },
  corretoresIds?: number[]
): Promise<{
  totalLeads: number;
  leadsDistribuidos: number;
  leadsNaoDistribuidos: number;
  leadsContatados: number;
  leadsAgendados: number;
  visitasRealizadas: number;
  contratosFechados: number;
  leadsPerdidos: number;
  taxaDistribuicao: number;
  taxaContato: number;
  taxaConversao: number;
  projetosAtivos: number;
  corretoresAtivos: number;
}> {
  const db = await getDb();
  if (!db) {
    return {
      totalLeads: 0,
      leadsDistribuidos: 0,
      leadsNaoDistribuidos: 0,
      leadsContatados: 0,
      leadsAgendados: 0,
      visitasRealizadas: 0,
      contratosFechados: 0,
      leadsPerdidos: 0,
      taxaDistribuicao: 0,
      taxaContato: 0,
      taxaConversao: 0,
      projetosAtivos: 0,
      corretoresAtivos: 0,
    };
  }

  // Buscar todos os leads (com filtro de período e equipe se fornecido)
  let todosLeads;

  if (periodo?.dataInicio && periodo?.dataFim) {
    todosLeads = await db
      .select()
      .from(leads)
      .where(
        and(
          sql`${leads.createdAt} >= ${periodo.dataInicio}`,
          sql`${leads.createdAt} <= ${periodo.dataFim}`
        )
      );
  } else {
    todosLeads = await db.select().from(leads);
  }
  
  // Filtrar por equipe se necessário
  if (corretoresIds) {
    todosLeads = todosLeads.filter(l => l.corretorId && corretoresIds.includes(l.corretorId));
  }

  const totalLeads = todosLeads.length;
  const leadsDistribuidos = todosLeads.filter((l) => l.corretorId !== null).length;
  const leadsNaoDistribuidos = todosLeads.filter((l) => l.corretorId === null).length;
  const leadsContatados = todosLeads.filter(
    (l) => l.status !== "novo" && l.status !== "aguardando_atendimento"
  ).length;
  const leadsAgendados = todosLeads.filter(
    (l) => l.status === "agendado" || l.status === "visita_realizada" || l.status === "analise_credito" || l.status === "contrato_fechado"
  ).length;
  const visitasRealizadas = todosLeads.filter(
    (l) => l.status === "visita_realizada" || l.status === "analise_credito" || l.status === "contrato_fechado"
  ).length;
  const contratosFechados = todosLeads.filter((l) => l.status === "contrato_fechado").length;
  const leadsPerdidos = todosLeads.filter((l) => l.status === "perdido").length;

  const taxaDistribuicao = totalLeads > 0 ? (leadsDistribuidos / totalLeads) * 100 : 0;
  const taxaContato = leadsDistribuidos > 0 ? (leadsContatados / leadsDistribuidos) * 100 : 0;
  const taxaConversao = totalLeads > 0 ? (contratosFechados / totalLeads) * 100 : 0;

  // Contar projetos ativos
  const projetosAtivos = await db
    .select()
    .from(projects)
    .where(eq(projects.status, "ativo"));

  // Contar corretores ativos (presentes)
  const corretoresAtivos = await db
    .select()
    .from(users)
    .where(and(eq(users.role, "corretor"), eq(users.status, "presente")));

  return {
    totalLeads,
    leadsDistribuidos,
    leadsNaoDistribuidos,
    leadsContatados,
    leadsAgendados,
    visitasRealizadas,
    contratosFechados,
    leadsPerdidos,
    taxaDistribuicao: Math.round(taxaDistribuicao * 100) / 100,
    taxaContato: Math.round(taxaContato * 100) / 100,
    taxaConversao: Math.round(taxaConversao * 100) / 100,
    projetosAtivos: projetosAtivos.length,
    corretoresAtivos: corretoresAtivos.length,
  };
}
