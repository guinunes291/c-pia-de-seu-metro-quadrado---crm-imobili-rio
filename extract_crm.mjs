import { createConnection } from 'mysql2/promise';
import { config } from 'dotenv';
import { writeFileSync } from 'fs';

config();

const conn = await createConnection(process.env.DATABASE_URL);
const results = {};

// 1. Total de leads no sistema
const [totalLeads] = await conn.execute('SELECT COUNT(*) as total FROM leads');
results.total_leads = totalLeads[0].total;

// 2. Leads por status
const [byStatus] = await conn.execute('SELECT status, COUNT(*) as total FROM leads GROUP BY status ORDER BY total DESC');
results.leads_por_status = byStatus;

// 3. Leads por mês (2026) - usando datetime real
const [byMonth] = await conn.execute(`
  SELECT 
    DATE_FORMAT(dataHoraCriacao, '%Y-%m') as mes,
    COUNT(*) as total
  FROM leads 
  WHERE dataHoraCriacao >= '2026-01-01'
  GROUP BY mes 
  ORDER BY mes
`);
results.leads_por_mes = byMonth;

// 4. Total de corretores ativos
const [corretores] = await conn.execute("SELECT COUNT(*) as total FROM users WHERE role='corretor' AND perfilCompleto=1");
results.corretores_ativos = corretores[0].total;

// 5. Total de corretores cadastrados
const [totalCorr] = await conn.execute("SELECT COUNT(*) as total FROM users WHERE role='corretor'");
results.total_corretores = totalCorr[0].total;

// 6. Leads convertidos (vendidos)
const [vendidos] = await conn.execute("SELECT COUNT(*) as total FROM leads WHERE status='vendido' OR status='contrato_fechado'");
results.leads_vendidos = vendidos[0].total;

// 7. Top 10 corretores por leads atribuídos
const [topCorretores] = await conn.execute(`
  SELECT u.name as nome, u.email, COUNT(l.id) as total_leads,
    SUM(CASE WHEN l.status IN ('vendido','contrato_fechado') THEN 1 ELSE 0 END) as vendas
  FROM users u
  LEFT JOIN leads l ON l.corretorId = u.id
  WHERE u.role='corretor'
  GROUP BY u.id
  ORDER BY total_leads DESC
  LIMIT 10
`);
results.top_corretores = topCorretores;

// 8. Leads por campanha/origem (utmCampaign)
const [byCampanha] = await conn.execute(`
  SELECT 
    COALESCE(utmCampaign, campanha, 'Sem campanha') as campanha,
    COUNT(*) as total,
    SUM(CASE WHEN status IN ('vendido','contrato_fechado') THEN 1 ELSE 0 END) as vendas
  FROM leads 
  GROUP BY COALESCE(utmCampaign, campanha, 'Sem campanha')
  ORDER BY total DESC 
  LIMIT 15
`);
results.leads_por_campanha = byCampanha;

// 9. Leads por origem (utmSource)
const [bySource] = await conn.execute(`
  SELECT 
    COALESCE(utmSource, origem, 'Desconhecida') as origem,
    COUNT(*) as total
  FROM leads 
  GROUP BY COALESCE(utmSource, origem, 'Desconhecida')
  ORDER BY total DESC 
  LIMIT 10
`);
results.leads_por_origem = bySource;

// 10. Taxa de conversão geral
const [conv] = await conn.execute(`
  SELECT 
    COUNT(*) as total,
    SUM(CASE WHEN status IN ('vendido','contrato_fechado') THEN 1 ELSE 0 END) as vendidos,
    SUM(CASE WHEN status='perdido' THEN 1 ELSE 0 END) as perdidos,
    SUM(CASE WHEN status='em_atendimento' THEN 1 ELSE 0 END) as em_atendimento,
    SUM(CASE WHEN status='agendado' THEN 1 ELSE 0 END) as agendados,
    SUM(CASE WHEN status='visita_realizada' THEN 1 ELSE 0 END) as visitas,
    SUM(CASE WHEN status='analise_credito' THEN 1 ELSE 0 END) as analise_credito,
    SUM(CASE WHEN status='aguardando_atendimento' THEN 1 ELSE 0 END) as aguardando
  FROM leads
`);
results.funil = conv[0];

// 11. Leads recebidos por mês com origem Meta
const [metaLeads] = await conn.execute(`
  SELECT 
    DATE_FORMAT(dataHoraCriacao, '%Y-%m') as mes,
    COUNT(*) as total
  FROM leads 
  WHERE (utmSource LIKE '%facebook%' OR utmSource LIKE '%instagram%' OR utmSource LIKE '%meta%' OR origemWebhook LIKE '%meta%' OR origemWebhook LIKE '%facebook%')
  GROUP BY mes 
  ORDER BY mes
`);
results.meta_leads_por_mes = metaLeads;

// 12. Tempo médio para primeiro contato (em minutos)
const [tempoContato] = await conn.execute(`
  SELECT 
    AVG(tempoParaPrimeiroContato) as media_minutos,
    MIN(tempoParaPrimeiroContato) as min_minutos,
    MAX(tempoParaPrimeiroContato) as max_minutos
  FROM leads 
  WHERE tempoParaPrimeiroContato IS NOT NULL AND tempoParaPrimeiroContato > 0
`);
results.tempo_primeiro_contato = tempoContato[0];

// 13. Leads por projeto/empreendimento
const [byProjeto] = await conn.execute(`
  SELECT 
    COALESCE(projetoCustom, projectId, 'Não informado') as projeto,
    COUNT(*) as total,
    SUM(CASE WHEN status IN ('vendido','contrato_fechado') THEN 1 ELSE 0 END) as vendas
  FROM leads 
  GROUP BY COALESCE(projetoCustom, projectId, 'Não informado')
  ORDER BY total DESC
  LIMIT 15
`);
results.leads_por_projeto = byProjeto;

await conn.end();

writeFileSync('/tmp/crm_data.json', JSON.stringify(results, null, 2));
console.log('CRM data saved to /tmp/crm_data.json');
console.log('TOTAL_LEADS:', results.total_leads);
console.log('CORRETORES_ATIVOS:', results.corretores_ativos);
console.log('TOTAL_CORRETORES:', results.total_corretores);
console.log('LEADS_VENDIDOS:', results.leads_vendidos);
console.log('FUNIL:', JSON.stringify(results.funil));
console.log('LEADS_POR_MES:', JSON.stringify(results.leads_por_mes));
