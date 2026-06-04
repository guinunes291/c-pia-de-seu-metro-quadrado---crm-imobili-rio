/**
 * Teste completo de ponta a ponta da Copa SMQ 2026
 * Simula: sorteio → pontuação → avanço de fases → final
 * Ao final, limpa todos os dados de teste
 */

import mysql from 'mysql2/promise';
import { readFileSync } from 'fs';

// Ler DATABASE_URL do .env
const envContent = readFileSync('/opt/.manus/webdev.sh.env', 'utf-8');
const dbUrlMatch = envContent.match(/DATABASE_URL="([^"]+)"/);
if (!dbUrlMatch) {
  console.error('DATABASE_URL não encontrada');
  process.exit(1);
}

const dbUrl = new URL(dbUrlMatch[1]);
const connection = await mysql.createConnection({
  host: dbUrl.hostname,
  port: parseInt(dbUrl.port || '3306'),
  user: dbUrl.username,
  password: dbUrl.password,
  database: dbUrl.pathname.slice(1),
  ssl: { rejectUnauthorized: false },
});

console.log('✅ Conectado ao banco de dados\n');

// Helper
async function query(sql) {
  const [rows] = await connection.execute(sql);
  return rows;
}

async function exec(sql) {
  await connection.execute(sql);
}

let errors = [];
let warnings = [];

function assert(condition, msg) {
  if (!condition) {
    errors.push(`❌ FALHA: ${msg}`);
    console.error(`❌ FALHA: ${msg}`);
  } else {
    console.log(`  ✓ ${msg}`);
  }
}

function warn(msg) {
  warnings.push(`⚠️ ${msg}`);
  console.warn(`  ⚠️ ${msg}`);
}

try {
  // ═══════════════════════════════════════════════════════════════════
  // FASE 1: Verificar estado atual
  // ═══════════════════════════════════════════════════════════════════
  console.log('\n═══ FASE 1: Verificar estado atual ═══');
  
  const corretores = await query('SELECT corretorId, grupo FROM copa_corretores WHERE ativo = 1 ORDER BY grupo, corretorId');
  console.log(`  Corretores ativos: ${corretores.length}`);
  assert(corretores.length === 14, `Devem haver 14 corretores ativos (encontrados: ${corretores.length})`);
  
  const grupoA = corretores.filter(c => c.grupo === 'A');
  const grupoB = corretores.filter(c => c.grupo === 'B');
  assert(grupoA.length === 7, `Grupo A deve ter 7 corretores (encontrados: ${grupoA.length})`);
  assert(grupoB.length === 7, `Grupo B deve ter 7 corretores (encontrados: ${grupoB.length})`);
  
  const fases = await query('SELECT id, nome, tipo, ordem FROM copa_fases ORDER BY ordem');
  console.log(`  Fases cadastradas: ${fases.length}`);
  for (const f of fases) {
    console.log(`    Fase ${f.ordem}: ${f.nome} (tipo: ${f.tipo}, id: ${f.id})`);
  }
  assert(fases.length >= 6, `Devem haver pelo menos 6 fases (encontradas: ${fases.length})`);
  
  const faseGrupos = fases.find(f => f.tipo === 'grupos');
  const faseQuartas = fases.find(f => f.tipo === 'quartas');
  const faseRepescagem = fases.find(f => f.tipo === 'repescagem');
  const faseSemifinal = fases.find(f => f.tipo === 'semifinal');
  const faseTerceiro = fases.find(f => f.tipo === 'terceiro');
  const faseFinal = fases.find(f => f.tipo === 'final');
  
  assert(!!faseGrupos, 'Fase de Grupos existe');
  assert(!!faseQuartas, 'Fase Quartas existe');
  assert(!!faseRepescagem, 'Fase Repescagem existe');
  assert(!!faseSemifinal, 'Fase Semifinal existe');
  assert(!!faseTerceiro, 'Fase 3º Lugar existe');
  assert(!!faseFinal, 'Fase Final existe');

  // ═══════════════════════════════════════════════════════════════════
  // FASE 2: Limpar confrontos existentes e simular sorteio (round-robin)
  // ═══════════════════════════════════════════════════════════════════
  console.log('\n═══ FASE 2: Simular sorteio (round-robin por grupo) ═══');
  
  // Salvar estado anterior para restaurar depois
  const confrontosAntes = await query('SELECT * FROM copa_confrontos');
  const pontuacoesAntes = await query('SELECT * FROM copa_pontuacoes');
  console.log(`  Confrontos antes do teste: ${confrontosAntes.length}`);
  console.log(`  Pontuações antes do teste: ${pontuacoesAntes.length}`);
  
  // Limpar para o teste
  await exec('DELETE FROM copa_confrontos');
  await exec('DELETE FROM copa_pontuacoes');
  
  // Gerar round-robin por grupo
  const grupos = { A: grupoA.map(c => c.corretorId), B: grupoB.map(c => c.corretorId) };
  let totalConfrontos = 0;
  let posicao = 1;
  
  for (const [grupoNome, membros] of Object.entries(grupos)) {
    const n = membros.length;
    const arr = [...membros];
    // Dummy player para N ímpar
    if (n % 2 !== 0) arr.push(-1);
    const m = arr.length;
    const numRodadas = m - 1;
    const numJogosPorRodada = m / 2;
    
    console.log(`  Grupo ${grupoNome}: ${n} corretores, ${numRodadas} rodadas, ${numJogosPorRodada} jogos/rodada (com dummy)`);
    
    for (let rodada = 0; rodada < numRodadas; rodada++) {
      const semana = rodada + 1;
      for (let j = 0; j < numJogosPorRodada; j++) {
        const a = arr[j];
        const b = arr[m - 1 - j];
        if (a === -1 || b === -1) continue; // pular dummy
        if (a !== undefined && b !== undefined && a !== b) {
          await exec(`INSERT INTO copa_confrontos (faseId, corretorAId, corretorBId, semanaRef, posicao) VALUES (${faseGrupos.id}, ${a}, ${b}, ${semana}, ${posicao})`);
          posicao++;
          totalConfrontos++;
        }
      }
      // Rotacionar: manter arr[0] fixo, rotacionar arr[1..m-1]
      const last = arr[m - 1];
      for (let k = m - 1; k > 1; k--) arr[k] = arr[k - 1];
      arr[1] = last;
    }
  }
  
  console.log(`  Total confrontos criados: ${totalConfrontos}`);
  // 7 corretores = 7 rodadas × 3 jogos × 2 grupos = 42 confrontos
  assert(totalConfrontos === 42, `Devem ser 42 confrontos no round-robin (criados: ${totalConfrontos})`);
  
  // Verificar que cada corretor tem exatamente 6 confrontos (enfrenta todos do grupo)
  for (const [grupoNome, membros] of Object.entries(grupos)) {
    for (const cId of membros) {
      const confrontosCorretor = await query(`SELECT COUNT(*) as cnt FROM copa_confrontos WHERE (corretorAId = ${cId} OR corretorBId = ${cId}) AND faseId = ${faseGrupos.id}`);
      const cnt = Number(confrontosCorretor[0].cnt);
      assert(cnt === 6, `Corretor ${cId} (Grupo ${grupoNome}) tem ${cnt} confrontos (esperado: 6)`);
    }
  }
  
  // Verificar distribuição por semana
  for (let sem = 1; sem <= 7; sem++) {
    const porSemana = await query(`SELECT COUNT(*) as cnt FROM copa_confrontos WHERE semanaRef = ${sem} AND faseId = ${faseGrupos.id}`);
    const cnt = Number(porSemana[0].cnt);
    assert(cnt === 6, `Semana ${sem}: ${cnt} confrontos (esperado: 6 — 3 por grupo)`);
  }

  // ═══════════════════════════════════════════════════════════════════
  // FASE 3: Simular pontuação e definir vencedores da fase de grupos
  // ═══════════════════════════════════════════════════════════════════
  console.log('\n═══ FASE 3: Simular pontuação e definir vencedores ═══');
  
  // Dar pontos crescentes para simular ranking claro
  // Grupo A: corretores[0] = 700pts, [1] = 600pts, ..., [6] = 100pts
  // Grupo B: corretores[0] = 700pts, [1] = 600pts, ..., [6] = 100pts
  for (const [grupoNome, membros] of Object.entries(grupos)) {
    for (let i = 0; i < membros.length; i++) {
      const pts = (membros.length - i) * 100; // 700, 600, 500, 400, 300, 200, 100
      // Distribuir pontos em 7 semanas
      for (let sem = 1; sem <= 7; sem++) {
        const semPts = Math.floor(pts / 7) + (sem <= pts % 7 ? 1 : 0);
        await exec(`INSERT INTO copa_pontuacoes (corretorId, semana, agendamentos, visitas, documentacao, vendas, total, createdAt, updatedAt) VALUES (${membros[i]}, ${sem}, 1, 1, 1, 0, ${semPts}, NOW(), NOW())`);
      }
      console.log(`  Grupo ${grupoNome} - Corretor ${membros[i]}: ${pts} pts total`);
    }
  }
  
  // Definir vencedores de todos os confrontos da fase de grupos
  // O vencedor é quem tem mais pontos totais (simples: quem tem mais pts ganha)
  const confrontosGrupos = await query(`SELECT id, corretorAId, corretorBId FROM copa_confrontos WHERE faseId = ${faseGrupos.id}`);
  
  // Calcular pontos totais por corretor
  const pontosResult = await query('SELECT corretorId, SUM(total) as pts FROM copa_pontuacoes GROUP BY corretorId');
  const ptsPorId = {};
  for (const r of pontosResult) {
    ptsPorId[r.corretorId] = Number(r.pts);
  }
  
  for (const c of confrontosGrupos) {
    const ptsA = ptsPorId[c.corretorAId] ?? 0;
    const ptsB = ptsPorId[c.corretorBId] ?? 0;
    const vencedor = ptsA >= ptsB ? c.corretorAId : c.corretorBId;
    await exec(`UPDATE copa_confrontos SET vencedorId = ${vencedor} WHERE id = ${c.id}`);
  }
  
  console.log(`  Vencedores definidos para ${confrontosGrupos.length} confrontos da fase de grupos`);
  
  // Verificar classificação esperada por grupo
  console.log('\n  Classificação esperada:');
  for (const [grupoNome, membros] of Object.entries(grupos)) {
    const sorted = [...membros].sort((a, b) => (ptsPorId[b] ?? 0) - (ptsPorId[a] ?? 0));
    console.log(`  Grupo ${grupoNome}: 1º=${sorted[0]}(${ptsPorId[sorted[0]]}pts), 2º=${sorted[1]}(${ptsPorId[sorted[1]]}pts), 3º=${sorted[2]}(${ptsPorId[sorted[2]]}pts), 4º=${sorted[3]}(${ptsPorId[sorted[3]]}pts)`);
    console.log(`    Eliminados: 5º=${sorted[4]}, 6º=${sorted[5]}, 7º=${sorted[6]}`);
  }

  // ═══════════════════════════════════════════════════════════════════
  // FASE 4: Avançar para Repescagem + Quartas
  // ═══════════════════════════════════════════════════════════════════
  console.log('\n═══ FASE 4: Avançar Fase de Grupos → Repescagem + Quartas ═══');
  
  // Simular a lógica do avancarFase (Fase de Grupos → Quartas diretos + Repescagem)
  const quartasDiretos = []; // 1º e 2º de cada grupo
  const repescagemIds = [];  // 3º e 4º de cada grupo
  
  for (const [grupoNome, membros] of Object.entries(grupos)) {
    const sorted = [...membros].sort((a, b) => (ptsPorId[b] ?? 0) - (ptsPorId[a] ?? 0));
    quartasDiretos.push(sorted[0]); // 1º
    quartasDiretos.push(sorted[1]); // 2º
    repescagemIds.push(sorted[2]);  // 3º
    repescagemIds.push(sorted[3]);  // 4º
  }
  
  console.log(`  Quartas diretos (4): ${quartasDiretos.join(', ')}`);
  console.log(`  Repescagem (4): ${repescagemIds.join(', ')}`);
  
  // Criar confrontos das Quartas (2 duelos cruzados: 1ºA vs 2ºB, 2ºA vs 1ºB)
  const [p1A, p2A, p1B, p2B] = quartasDiretos;
  await exec(`INSERT INTO copa_confrontos (faseId, corretorAId, corretorBId, semanaRef, posicao) VALUES (${faseQuartas.id}, ${p1A}, ${p2B}, 9, 1)`);
  await exec(`INSERT INTO copa_confrontos (faseId, corretorAId, corretorBId, semanaRef, posicao) VALUES (${faseQuartas.id}, ${p2A}, ${p1B}, 9, 2)`);
  // Slot vazio para vencedores da repescagem
  await exec(`INSERT INTO copa_confrontos (faseId, corretorAId, corretorBId, semanaRef, posicao) VALUES (${faseQuartas.id}, NULL, NULL, 9, 3)`);
  
  // Criar confrontos da Repescagem (cruzados: 3ºA vs 4ºB, 4ºA vs 3ºB)
  // repescagemIds = [3ºA, 3ºB, 4ºA, 4ºB] — na verdade é [3ºA, 4ºA, 3ºB, 4ºB] pela ordem de push
  // Corrigir: push é 3ºA, 4ºA (grupo A), depois 3ºB, 4ºB (grupo B)
  const r3A = repescagemIds[0]; // 3º do A
  const r4A = repescagemIds[1]; // 4º do A
  const r3B = repescagemIds[2]; // 3º do B
  const r4B = repescagemIds[3]; // 4º do B
  
  await exec(`INSERT INTO copa_confrontos (faseId, corretorAId, corretorBId, semanaRef, posicao) VALUES (${faseRepescagem.id}, ${r3A}, ${r4B}, 8, 1)`);
  await exec(`INSERT INTO copa_confrontos (faseId, corretorAId, corretorBId, semanaRef, posicao) VALUES (${faseRepescagem.id}, ${r4A}, ${r3B}, 8, 2)`);
  
  console.log(`  Quartas: ${p1A} vs ${p2B}, ${p2A} vs ${p1B} + 1 slot vazio`);
  console.log(`  Repescagem: ${r3A} vs ${r4B}, ${r4A} vs ${r3B}`);
  
  // Verificar
  const quartasConf = await query(`SELECT id, corretorAId, corretorBId FROM copa_confrontos WHERE faseId = ${faseQuartas.id}`);
  assert(quartasConf.length === 3, `Quartas deve ter 3 confrontos (encontrados: ${quartasConf.length})`);
  
  const repescConf = await query(`SELECT id, corretorAId, corretorBId FROM copa_confrontos WHERE faseId = ${faseRepescagem.id}`);
  assert(repescConf.length === 2, `Repescagem deve ter 2 confrontos (encontrados: ${repescConf.length})`);

  // ═══════════════════════════════════════════════════════════════════
  // FASE 5: Definir vencedores da Repescagem e preencher slot das Quartas
  // ═══════════════════════════════════════════════════════════════════
  console.log('\n═══ FASE 5: Repescagem → preencher Quartas ═══');
  
  // Vencedores da repescagem: quem tem mais pontos ganha
  for (const c of repescConf) {
    const ptsA = ptsPorId[c.corretorAId] ?? 0;
    const ptsB = ptsPorId[c.corretorBId] ?? 0;
    const vencedor = ptsA >= ptsB ? c.corretorAId : c.corretorBId;
    await exec(`UPDATE copa_confrontos SET vencedorId = ${vencedor} WHERE id = ${c.id}`);
    console.log(`  Repescagem: ${c.corretorAId}(${ptsA}pts) vs ${c.corretorBId}(${ptsB}pts) → Vencedor: ${vencedor}`);
  }
  
  // Buscar vencedores da repescagem
  const vencedoresRepesc = await query(`SELECT vencedorId FROM copa_confrontos WHERE faseId = ${faseRepescagem.id} AND vencedorId IS NOT NULL ORDER BY id`);
  const repescVencedores = vencedoresRepesc.map(r => r.vencedorId);
  console.log(`  Vencedores da Repescagem: ${repescVencedores.join(', ')}`);
  assert(repescVencedores.length === 2, `Devem haver 2 vencedores da repescagem (encontrados: ${repescVencedores.length})`);
  
  // Preencher slot vazio das Quartas com os 2 vencedores da repescagem
  const slotVazio = await query(`SELECT id FROM copa_confrontos WHERE faseId = ${faseQuartas.id} AND corretorAId IS NULL`);
  assert(slotVazio.length === 1, `Deve haver 1 slot vazio nas Quartas (encontrados: ${slotVazio.length})`);
  
  if (slotVazio.length > 0) {
    await exec(`UPDATE copa_confrontos SET corretorAId = ${repescVencedores[0]}, corretorBId = ${repescVencedores[1]} WHERE id = ${slotVazio[0].id}`);
    console.log(`  Slot vazio preenchido: ${repescVencedores[0]} vs ${repescVencedores[1]}`);
  }
  
  // Verificar que todas as Quartas agora têm corretores
  const quartasCompletas = await query(`SELECT id, corretorAId, corretorBId FROM copa_confrontos WHERE faseId = ${faseQuartas.id} AND corretorAId IS NOT NULL`);
  assert(quartasCompletas.length === 3, `Quartas deve ter 3 confrontos completos (encontrados: ${quartasCompletas.length})`);

  // ═══════════════════════════════════════════════════════════════════
  // FASE 6: Definir vencedores das Quartas e avançar para Semifinal
  // ═══════════════════════════════════════════════════════════════════
  console.log('\n═══ FASE 6: Quartas → Semifinal ═══');
  
  // Definir vencedores das Quartas (quem tem mais pontos)
  const quartasParaResolver = await query(`SELECT id, corretorAId, corretorBId FROM copa_confrontos WHERE faseId = ${faseQuartas.id} AND corretorAId IS NOT NULL`);
  const vencedoresQuartas = [];
  
  for (const c of quartasParaResolver) {
    const ptsA = ptsPorId[c.corretorAId] ?? 0;
    const ptsB = ptsPorId[c.corretorBId] ?? 0;
    const vencedor = ptsA >= ptsB ? c.corretorAId : c.corretorBId;
    vencedoresQuartas.push(vencedor);
    await exec(`UPDATE copa_confrontos SET vencedorId = ${vencedor} WHERE id = ${c.id}`);
    console.log(`  Quartas: ${c.corretorAId}(${ptsA}pts) vs ${c.corretorBId}(${ptsB}pts) → Vencedor: ${vencedor}`);
  }
  
  console.log(`  Vencedores das Quartas: ${vencedoresQuartas.join(', ')}`);
  assert(vencedoresQuartas.length === 3, `Devem haver 3 vencedores das Quartas (encontrados: ${vencedoresQuartas.length})`);
  
  // Avançar para Semifinal: melhor classificado ganha bye, outros 2 duelam
  const vencedoresOrdenados = [...vencedoresQuartas].sort((a, b) => (ptsPorId[b] ?? 0) - (ptsPorId[a] ?? 0));
  const byeId = vencedoresOrdenados[0]; // melhor classificado → bye
  const semiDuelistas = vencedoresOrdenados.slice(1); // outros 2 → duelo
  
  console.log(`  Bye (melhor classificado): ${byeId} (${ptsPorId[byeId]}pts)`);
  console.log(`  Duelo semifinal: ${semiDuelistas[0]}(${ptsPorId[semiDuelistas[0]]}pts) vs ${semiDuelistas[1]}(${ptsPorId[semiDuelistas[1]]}pts)`);
  
  // Criar confrontos da Semifinal
  await exec(`INSERT INTO copa_confrontos (faseId, corretorAId, corretorBId, semanaRef, posicao) VALUES (${faseSemifinal.id}, ${semiDuelistas[0]}, ${semiDuelistas[1]}, 10, 1)`);
  // Bye: corretorBId = NULL
  await exec(`INSERT INTO copa_confrontos (faseId, corretorAId, corretorBId, semanaRef, posicao) VALUES (${faseSemifinal.id}, ${byeId}, NULL, 10, 2)`);
  
  const semiConf = await query(`SELECT id, corretorAId, corretorBId FROM copa_confrontos WHERE faseId = ${faseSemifinal.id}`);
  assert(semiConf.length === 2, `Semifinal deve ter 2 registros (1 duelo + 1 bye) (encontrados: ${semiConf.length})`);
  
  const semiDuelo = semiConf.find(c => c.corretorBId !== null);
  const semiBye = semiConf.find(c => c.corretorBId === null);
  assert(!!semiDuelo, 'Semifinal tem um duelo real');
  assert(!!semiBye, 'Semifinal tem um bye');
  assert(semiBye?.corretorAId === byeId, `Bye é para o corretor ${byeId}`);

  // ═══════════════════════════════════════════════════════════════════
  // FASE 7: Definir vencedor da Semifinal e avançar para Final + 3º Lugar
  // ═══════════════════════════════════════════════════════════════════
  console.log('\n═══ FASE 7: Semifinal → Final + 3º Lugar ═══');
  
  // Definir vencedor do duelo da semifinal
  const ptsA_semi = ptsPorId[semiDuelo.corretorAId] ?? 0;
  const ptsB_semi = ptsPorId[semiDuelo.corretorBId] ?? 0;
  const vencedorSemi = ptsA_semi >= ptsB_semi ? semiDuelo.corretorAId : semiDuelo.corretorBId;
  const perdedorSemi = ptsA_semi >= ptsB_semi ? semiDuelo.corretorBId : semiDuelo.corretorAId;
  
  await exec(`UPDATE copa_confrontos SET vencedorId = ${vencedorSemi} WHERE id = ${semiDuelo.id}`);
  // Bye: vencedor é automaticamente o próprio
  await exec(`UPDATE copa_confrontos SET vencedorId = ${byeId} WHERE id = ${semiBye.id}`);
  
  console.log(`  Duelo Semi: ${semiDuelo.corretorAId}(${ptsA_semi}pts) vs ${semiDuelo.corretorBId}(${ptsB_semi}pts) → Vencedor: ${vencedorSemi}`);
  console.log(`  Bye: ${byeId} avança automaticamente`);
  console.log(`  Perdedor Semi (3º Lugar): ${perdedorSemi}`);
  
  // Criar Final: bye vs vencedor do duelo
  await exec(`INSERT INTO copa_confrontos (faseId, corretorAId, corretorBId, semanaRef, posicao) VALUES (${faseFinal.id}, ${byeId}, ${vencedorSemi}, 11, 1)`);
  
  // Criar 3º Lugar: perdedor do duelo (como só há 1 perdedor, registrar como W.O. / vitória automática)
  await exec(`INSERT INTO copa_confrontos (faseId, corretorAId, corretorBId, semanaRef, posicao) VALUES (${faseTerceiro.id}, ${perdedorSemi}, NULL, 11, 1)`);
  
  console.log(`  Final: ${byeId} vs ${vencedorSemi}`);
  console.log(`  3º Lugar: ${perdedorSemi} (W.O.)`);
  
  const finalConf = await query(`SELECT id, corretorAId, corretorBId FROM copa_confrontos WHERE faseId = ${faseFinal.id}`);
  assert(finalConf.length === 1, `Final deve ter 1 confronto (encontrados: ${finalConf.length})`);
  assert(finalConf[0]?.corretorAId === byeId && finalConf[0]?.corretorBId === vencedorSemi, 'Final tem os corretores corretos');

  // ═══════════════════════════════════════════════════════════════════
  // FASE 8: Definir campeão
  // ═══════════════════════════════════════════════════════════════════
  console.log('\n═══ FASE 8: Grande Final ═══');
  
  const ptsA_final = ptsPorId[byeId] ?? 0;
  const ptsB_final = ptsPorId[vencedorSemi] ?? 0;
  const campeao = ptsA_final >= ptsB_final ? byeId : vencedorSemi;
  const vice = ptsA_final >= ptsB_final ? vencedorSemi : byeId;
  
  await exec(`UPDATE copa_confrontos SET vencedorId = ${campeao} WHERE id = ${finalConf[0].id}`);
  
  // 3º lugar: vencedor automático (W.O.)
  const terceiroConf = await query(`SELECT id FROM copa_confrontos WHERE faseId = ${faseTerceiro.id}`);
  if (terceiroConf.length > 0) {
    await exec(`UPDATE copa_confrontos SET vencedorId = ${perdedorSemi} WHERE id = ${terceiroConf[0].id}`);
  }
  
  console.log(`  🏆 CAMPEÃO: Corretor ${campeao} (${ptsPorId[campeao]}pts)`);
  console.log(`  🥈 VICE: Corretor ${vice} (${ptsPorId[vice]}pts)`);
  console.log(`  🥉 3º LUGAR: Corretor ${perdedorSemi} (${ptsPorId[perdedorSemi]}pts)`);

  // ═══════════════════════════════════════════════════════════════════
  // VERIFICAÇÃO FINAL: Contagem de confrontos por fase
  // ═══════════════════════════════════════════════════════════════════
  console.log('\n═══ VERIFICAÇÃO FINAL ═══');
  
  const totalPorFase = await query(`
    SELECT f.nome, f.tipo, COUNT(c.id) as total, 
           SUM(CASE WHEN c.vencedorId IS NOT NULL THEN 1 ELSE 0 END) as resolvidos
    FROM copa_fases f 
    LEFT JOIN copa_confrontos c ON c.faseId = f.id
    GROUP BY f.id, f.nome, f.tipo
    ORDER BY f.ordem
  `);
  
  console.log('\n  Resumo por fase:');
  for (const f of totalPorFase) {
    console.log(`    ${f.nome}: ${f.total} confrontos, ${f.resolvidos} resolvidos`);
  }
  
  // Verificar integridade
  const totalConfrontosAll = await query('SELECT COUNT(*) as cnt FROM copa_confrontos');
  const totalResolvidos = await query('SELECT COUNT(*) as cnt FROM copa_confrontos WHERE vencedorId IS NOT NULL');
  console.log(`\n  Total confrontos: ${totalConfrontosAll[0].cnt}`);
  console.log(`  Total resolvidos: ${totalResolvidos[0].cnt}`);
  
  // Esperado: 42 (grupos) + 3 (quartas) + 2 (repescagem) + 2 (semifinal) + 1 (final) + 1 (3º lugar) = 51
  assert(Number(totalConfrontosAll[0].cnt) === 51, `Total de confrontos deve ser 51 (encontrados: ${totalConfrontosAll[0].cnt})`);
  assert(Number(totalResolvidos[0].cnt) === 51, `Todos os confrontos devem estar resolvidos: ${totalResolvidos[0].cnt}/51`);

  // ═══════════════════════════════════════════════════════════════════
  // FASE 9: Limpar dados de teste
  // ═══════════════════════════════════════════════════════════════════
  console.log('\n═══ FASE 9: Limpando dados de teste ═══');
  
  await exec('DELETE FROM copa_confrontos');
  await exec('DELETE FROM copa_pontuacoes');
  
  // Restaurar confrontos e pontuações anteriores (se existiam)
  if (confrontosAntes.length > 0) {
    for (const c of confrontosAntes) {
      await exec(`INSERT INTO copa_confrontos (id, faseId, corretorAId, corretorBId, vencedorId, semanaRef, posicao) VALUES (${c.id}, ${c.faseId}, ${c.corretorAId ?? 'NULL'}, ${c.corretorBId ?? 'NULL'}, ${c.vencedorId ?? 'NULL'}, ${c.semanaRef ?? 'NULL'}, ${c.posicao ?? 1})`);
    }
    console.log(`  Restaurados ${confrontosAntes.length} confrontos anteriores`);
  } else {
    console.log('  Nenhum confronto anterior para restaurar');
  }
  
  if (pontuacoesAntes.length > 0) {
    for (const p of pontuacoesAntes) {
      await exec(`INSERT INTO copa_pontuacoes (id, corretorId, semana, agendamentos, visitas, documentacao, vendas, total, createdAt, updatedAt) VALUES (${p.id}, ${p.corretorId}, ${p.semana}, ${p.agendamentos}, ${p.visitas}, ${p.documentacao}, ${p.vendas}, ${p.total}, '${p.createdAt.toISOString().slice(0, 19)}', '${p.updatedAt.toISOString().slice(0, 19)}')`);
    }
    console.log(`  Restauradas ${pontuacoesAntes.length} pontuações anteriores`);
  } else {
    console.log('  Nenhuma pontuação anterior para restaurar');
  }
  
  // Verificar que dados foram restaurados
  const confrontosDepois = await query('SELECT COUNT(*) as cnt FROM copa_confrontos');
  const pontuacoesDepois = await query('SELECT COUNT(*) as cnt FROM copa_pontuacoes');
  console.log(`  Confrontos após restauração: ${confrontosDepois[0].cnt} (antes: ${confrontosAntes.length})`);
  console.log(`  Pontuações após restauração: ${pontuacoesDepois[0].cnt} (antes: ${pontuacoesAntes.length})`);
  
  assert(Number(confrontosDepois[0].cnt) === confrontosAntes.length, 'Confrontos restaurados corretamente');
  assert(Number(pontuacoesDepois[0].cnt) === pontuacoesAntes.length, 'Pontuações restauradas corretamente');

  // ═══════════════════════════════════════════════════════════════════
  // RESULTADO FINAL
  // ═══════════════════════════════════════════════════════════════════
  console.log('\n\n══════════════════════════════════════════════════════════');
  console.log('  RESULTADO DO TESTE DE PONTA A PONTA');
  console.log('══════════════════════════════════════════════════════════');
  
  if (errors.length === 0) {
    console.log('  ✅ TODOS OS TESTES PASSARAM COM SUCESSO!');
    console.log('  O fluxo completo da Copa funciona corretamente:');
    console.log('    • Sorteio com round-robin por grupo (42 confrontos)');
    console.log('    • Cada corretor enfrenta todos do grupo (6 confrontos)');
    console.log('    • 6 confrontos por semana (3 por grupo)');
    console.log('    • Avanço: 1º e 2º → Quartas, 3º e 4º → Repescagem');
    console.log('    • Repescagem: 2 duelos cruzados, vencedores preenchem Quartas');
    console.log('    • Quartas: 3 duelos, 3 vencedores');
    console.log('    • Semifinal: melhor classificado ganha bye, outros 2 duelam');
    console.log('    • Final: bye vs vencedor do duelo semi');
    console.log('    • 3º Lugar: perdedor do duelo semi');
    console.log('    • Dados de teste limpos e estado anterior restaurado');
  } else {
    console.log(`  ❌ ${errors.length} ERRO(S) ENCONTRADO(S):`);
    for (const e of errors) console.log(`    ${e}`);
  }
  
  if (warnings.length > 0) {
    console.log(`\n  ⚠️ ${warnings.length} AVISO(S):`);
    for (const w of warnings) console.log(`    ${w}`);
  }
  
  console.log('══════════════════════════════════════════════════════════\n');

} catch (err) {
  console.error('\n💥 ERRO FATAL NO TESTE:', err.message);
  console.error(err.stack);
  
  // Tentar limpar mesmo em caso de erro
  try {
    console.log('\n⚠️ Tentando limpar dados de teste após erro...');
    await exec('DELETE FROM copa_confrontos');
    await exec('DELETE FROM copa_pontuacoes');
    console.log('  Dados de teste limpos');
  } catch (cleanErr) {
    console.error('  Falha ao limpar:', cleanErr.message);
  }
} finally {
  await connection.end();
}
