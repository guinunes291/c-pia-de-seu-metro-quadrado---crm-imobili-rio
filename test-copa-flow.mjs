/**
 * Teste completo de ponta a ponta da Copa SMQ 2026 — Novo formato (14 semanas, 8 fases)
 * Fluxo: Grupos → Rep1 → Oitavas → Rep2 → Quartas → Semi → Final + 3º Lugar → Premiação
 */

import mysql from 'mysql2/promise';
import { readFileSync } from 'fs';

const envContent = readFileSync('/opt/.manus/webdev.sh.env', 'utf-8');
const dbUrlMatch = envContent.match(/DATABASE_URL="([^"]+)"/);
if (!dbUrlMatch) { console.error('DATABASE_URL não encontrada'); process.exit(1); }

const dbUrl = new URL(dbUrlMatch[1]);
const connection = await mysql.createConnection({
  host: dbUrl.hostname, port: parseInt(dbUrl.port || '3306'),
  user: dbUrl.username, password: dbUrl.password,
  database: dbUrl.pathname.slice(1), ssl: { rejectUnauthorized: false },
});
console.log('✅ Conectado ao banco de dados\n');

async function query(sql) { const [rows] = await connection.execute(sql); return rows; }
async function exec(sql) { await connection.execute(sql); }

let errors = [];
function assert(condition, msg) {
  if (!condition) { errors.push(`❌ FALHA: ${msg}`); console.error(`  ❌ FALHA: ${msg}`); }
  else { console.log(`  ✓ ${msg}`); }
}

// Helper: rankear IDs por total de pontuação
async function rankearPorPontos(ids) {
  if (ids.length === 0) return [];
  const rows = await query(`SELECT corretorId, COALESCE(SUM(total), 0) as pts FROM copa_pontuacoes WHERE corretorId IN (${ids.join(',')}) GROUP BY corretorId ORDER BY pts DESC`);
  const ranked = rows.map(r => r.corretorId);
  const missing = ids.filter(id => !ranked.includes(id));
  return [...ranked, ...missing];
}

async function aplicarBonus(corretorId, semana, bonus) {
  const existe = await query(`SELECT id FROM copa_pontuacoes WHERE corretorId = ${corretorId} AND semana = ${semana}`);
  if (existe.length > 0) {
    await exec(`UPDATE copa_pontuacoes SET total = total + ${bonus}, updatedAt = NOW() WHERE corretorId = ${corretorId} AND semana = ${semana}`);
  } else {
    await exec(`INSERT INTO copa_pontuacoes (corretorId, semana, agendamentos, visitas, documentacao, vendas, total, createdAt, updatedAt) VALUES (${corretorId}, ${semana}, 0, 0, 0, 0, ${bonus}, NOW(), NOW())`);
  }
}

try {
  // ═══════════════════════════════════════════════════════════════════
  // FASE 1: Verificar estado atual
  // ═══════════════════════════════════════════════════════════════════
  console.log('\n═══ FASE 1: Verificar estado atual ═══');

  const corretores = await query('SELECT corretorId, grupo FROM copa_corretores WHERE ativo = 1 ORDER BY grupo, corretorId');
  assert(corretores.length === 14, `14 corretores ativos (encontrados: ${corretores.length})`);

  const grupoA = corretores.filter(c => c.grupo === 'A').map(c => c.corretorId);
  const grupoB = corretores.filter(c => c.grupo === 'B').map(c => c.corretorId);
  assert(grupoA.length === 7, `Grupo A tem 7 corretores (encontrado: ${grupoA.length})`);
  assert(grupoB.length === 7, `Grupo B tem 7 corretores (encontrado: ${grupoB.length})`);

  const fases = await query('SELECT id, nome, tipo, ordem FROM copa_fases ORDER BY ordem');
  console.log(`  Fases cadastradas: ${fases.length}`);
  for (const f of fases) console.log(`    ${f.ordem}. ${f.nome} (tipo: ${f.tipo})`);
  assert(fases.length === 9, `9 fases esperadas (encontradas: ${fases.length})`);

  const faseGrupos   = fases.find(f => f.tipo === 'grupos');
  const faseRep1     = fases.find(f => f.tipo === 'repescagem1');
  const faseOitavas  = fases.find(f => f.tipo === 'oitavas');
  const faseRep2     = fases.find(f => f.tipo === 'repescagem2');
  const faseQuartas  = fases.find(f => f.tipo === 'quartas');
  const faseSemi     = fases.find(f => f.tipo === 'semifinal');
  const faseTerceiro = fases.find(f => f.tipo === 'terceiro');
  const faseFinal    = fases.find(f => f.tipo === 'final');

  assert(!!faseGrupos,   'Fase Grupos existe');
  assert(!!faseRep1,     'Fase Repescagem 1 existe');
  assert(!!faseOitavas,  'Fase Oitavas existe');
  assert(!!faseRep2,     'Fase Repescagem 2 existe');
  assert(!!faseQuartas,  'Fase Quartas existe');
  assert(!!faseSemi,     'Fase Semifinal existe');
  assert(!!faseTerceiro, 'Fase 3º Lugar existe');
  assert(!!faseFinal,    'Fase Grande Final existe');

  // ═══════════════════════════════════════════════════════════════════
  // SALVAR ESTADO ANTERIOR
  // ═══════════════════════════════════════════════════════════════════
  const confrontosAntes  = await query('SELECT * FROM copa_confrontos');
  const pontuacoesAntes  = await query('SELECT * FROM copa_pontuacoes');
  console.log(`\n  Estado anterior: ${confrontosAntes.length} confrontos, ${pontuacoesAntes.length} pontuações`);

  await exec('DELETE FROM copa_confrontos');
  await exec('DELETE FROM copa_pontuacoes');

  // ═══════════════════════════════════════════════════════════════════
  // FASE 2: Sorteio round-robin
  // ═══════════════════════════════════════════════════════════════════
  console.log('\n═══ FASE 2: Sorteio round-robin ═══');

  const grupos = { A: grupoA, B: grupoB };
  let totalConf = 0, posicao = 1;

  for (const [, membros] of Object.entries(grupos)) {
    const arr = [...membros];
    if (arr.length % 2 !== 0) arr.push(-1); // dummy
    const m = arr.length;
    for (let rodada = 0; rodada < m - 1; rodada++) {
      const semana = rodada + 1;
      for (let j = 0; j < m / 2; j++) {
        const a = arr[j], b = arr[m - 1 - j];
        if (a === -1 || b === -1) continue;
        await exec(`INSERT INTO copa_confrontos (faseId, corretorAId, corretorBId, semanaRef, posicao) VALUES (${faseGrupos.id}, ${a}, ${b}, ${semana}, ${posicao++})`);
        totalConf++;
      }
      const last = arr[m - 1];
      for (let k = m - 1; k > 1; k--) arr[k] = arr[k - 1];
      arr[1] = last;
    }
  }

  assert(totalConf === 42, `42 confrontos round-robin (encontrados: ${totalConf})`);

  for (const [g, membros] of Object.entries(grupos)) {
    for (const cId of membros) {
      const r = await query(`SELECT COUNT(*) as cnt FROM copa_confrontos WHERE (corretorAId = ${cId} OR corretorBId = ${cId}) AND faseId = ${faseGrupos.id}`);
      assert(Number(r[0].cnt) === 6, `Corretor ${cId} (Grupo ${g}) tem 6 confrontos (encontrado: ${r[0].cnt})`);
    }
  }

  for (let sem = 1; sem <= 7; sem++) {
    const r = await query(`SELECT COUNT(*) as cnt FROM copa_confrontos WHERE semanaRef = ${sem} AND faseId = ${faseGrupos.id}`);
    assert(Number(r[0].cnt) === 6, `Semana ${sem}: 6 confrontos (encontrado: ${r[0].cnt})`);
  }

  // ═══════════════════════════════════════════════════════════════════
  // FASE 3: Pontuar e definir vencedores dos grupos
  // ═══════════════════════════════════════════════════════════════════
  console.log('\n═══ FASE 3: Pontuação e vencedores dos grupos ═══');

  // Grupo A: maior índice = mais pts (1º = 700, 7º = 100)
  // Grupo B: inverso para criar cruzamentos interessantes
  const ptsPorId = {};
  for (let i = 0; i < grupoA.length; i++) {
    const pts = (grupoA.length - i) * 100; // 700, 600, ..., 100
    ptsPorId[grupoA[i]] = pts;
    for (let sem = 1; sem <= 7; sem++) {
      await exec(`INSERT INTO copa_pontuacoes (corretorId, semana, agendamentos, visitas, documentacao, vendas, total, createdAt, updatedAt) VALUES (${grupoA[i]}, ${sem}, 1, 1, 0, 0, ${Math.floor(pts / 7)}, NOW(), NOW())`);
    }
  }
  for (let i = 0; i < grupoB.length; i++) {
    const pts = (i + 1) * 100; // 100, 200, ..., 700
    ptsPorId[grupoB[i]] = pts;
    for (let sem = 1; sem <= 7; sem++) {
      await exec(`INSERT INTO copa_pontuacoes (corretorId, semana, agendamentos, visitas, documentacao, vendas, total, createdAt, updatedAt) VALUES (${grupoB[i]}, ${sem}, 1, 1, 0, 0, ${Math.floor(pts / 7)}, NOW(), NOW())`);
    }
  }

  const gruposConf = await query(`SELECT id, corretorAId, corretorBId FROM copa_confrontos WHERE faseId = ${faseGrupos.id}`);
  for (const c of gruposConf) {
    const vencedor = (ptsPorId[c.corretorAId] ?? 0) >= (ptsPorId[c.corretorBId] ?? 0) ? c.corretorAId : c.corretorBId;
    await exec(`UPDATE copa_confrontos SET vencedorId = ${vencedor} WHERE id = ${c.id}`);
  }
  console.log(`  Vencedores definidos para ${gruposConf.length} confrontos`);

  // ═══════════════════════════════════════════════════════════════════
  // FASE 4: Grupos → Repescagem 1
  // ═══════════════════════════════════════════════════════════════════
  console.log('\n═══ FASE 4: Grupos → Repescagem 1 ═══');

  const grupoA_ranked = await rankearPorPontos(grupoA);
  const grupoB_ranked = await rankearPorPontos(grupoB);

  console.log(`  Grupo A: 1º=${grupoA_ranked[0]}, 2º=${grupoA_ranked[1]}, 3º=${grupoA_ranked[2]}, 4º=${grupoA_ranked[3]}, 5º=${grupoA_ranked[4]}, 6º=${grupoA_ranked[5]}, 7º=${grupoA_ranked[6]}`);
  console.log(`  Grupo B: 1º=${grupoB_ranked[0]}, 2º=${grupoB_ranked[1]}, 3º=${grupoB_ranked[2]}, 4º=${grupoB_ranked[3]}, 5º=${grupoB_ranked[4]}, 6º=${grupoB_ranked[5]}, 7º=${grupoB_ranked[6]}`);

  // Bônus por posição no grupo (semana 7)
  const bonusPorPosicao = [10, 9, 8, 7, 6, 5, 4];
  for (const [ranked] of [[grupoA_ranked], [grupoB_ranked]]) {
    for (let i = 0; i < ranked.length && i < bonusPorPosicao.length; i++) {
      await aplicarBonus(ranked[i], 7, bonusPorPosicao[i]);
    }
  }

  // Verificar bônus aplicados
  for (const [g, ranked] of [['A', grupoA_ranked], ['B', grupoB_ranked]]) {
    const r = await query(`SELECT total FROM copa_pontuacoes WHERE corretorId = ${ranked[0]} AND semana = 7`);
    const bonus1o = Number(r[0]?.total ?? 0);
    assert(bonus1o > 0, `1º do Grupo ${g} (${ranked[0]}) tem bônus registrado na semana 7 (total: ${bonus1o})`);
  }

  // Criar confrontos da Repescagem 1 (5ºA vs 6ºB, 6ºA vs 5ºB, 7ºA vs 7ºB)
  const rep1Duelos = [
    [grupoA_ranked[4], grupoB_ranked[5]],
    [grupoA_ranked[5], grupoB_ranked[4]],
    [grupoA_ranked[6], grupoB_ranked[6]],
  ];
  for (const [a, b] of rep1Duelos) {
    await exec(`INSERT INTO copa_confrontos (faseId, corretorAId, corretorBId, semanaRef, posicao) VALUES (${faseRep1.id}, ${a}, ${b}, 8, 1)`);
  }

  const rep1Conf = await query(`SELECT * FROM copa_confrontos WHERE faseId = ${faseRep1.id}`);
  assert(rep1Conf.length === 3, `Repescagem 1 tem 3 confrontos (encontrado: ${rep1Conf.length})`);
  console.log(`  Rep1: ${rep1Duelos.map(([a, b]) => `${a} vs ${b}`).join(' | ')}`);

  // ═══════════════════════════════════════════════════════════════════
  // FASE 5: Repescagem 1 → Oitavas
  // ═══════════════════════════════════════════════════════════════════
  console.log('\n═══ FASE 5: Repescagem 1 → Oitavas ═══');

  // Definir vencedores da Repescagem 1
  for (const c of rep1Conf) {
    const vencedor = (ptsPorId[c.corretorAId] ?? 0) >= (ptsPorId[c.corretorBId] ?? 0) ? c.corretorAId : c.corretorBId;
    await exec(`UPDATE copa_confrontos SET vencedorId = ${vencedor} WHERE id = ${c.id}`);
  }

  const rep1Vencedores = (await query(`SELECT vencedorId FROM copa_confrontos WHERE faseId = ${faseRep1.id} AND vencedorId IS NOT NULL ORDER BY id`)).map(r => r.vencedorId);
  assert(rep1Vencedores.length === 3, `3 vencedores da Rep1 (encontrado: ${rep1Vencedores.length})`);

  // Top 2 vencedores (por pts geral) avançam para Oitavas
  const rep1VencRanked = await rankearPorPontos(rep1Vencedores);
  const repAdvancam = rep1VencRanked.slice(0, 2);
  console.log(`  Avançam para Oitavas: ${repAdvancam.join(', ')} (3º eliminado: ${rep1VencRanked[2]})`);

  // Criar 5 Oitavas duelos
  const diretosA = grupoA_ranked.slice(0, 4);
  const diretosB = grupoB_ranked.slice(0, 4);
  const oitavasDuelos = [
    [diretosA[0], diretosB[3]],
    [diretosA[1], diretosB[2]],
    [diretosA[2], diretosB[1]],
    [diretosA[3], diretosB[0]],
    [repAdvancam[0], repAdvancam[1]],
  ];
  for (const [a, b] of oitavasDuelos) {
    await exec(`INSERT INTO copa_confrontos (faseId, corretorAId, corretorBId, semanaRef, posicao) VALUES (${faseOitavas.id}, ${a}, ${b}, 9, 1)`);
  }

  const oitavasConf = await query(`SELECT * FROM copa_confrontos WHERE faseId = ${faseOitavas.id}`);
  assert(oitavasConf.length === 5, `Oitavas tem 5 confrontos (encontrado: ${oitavasConf.length})`);

  // ═══════════════════════════════════════════════════════════════════
  // FASE 6: Oitavas → Repescagem 2
  // ═══════════════════════════════════════════════════════════════════
  console.log('\n═══ FASE 6: Oitavas → Repescagem 2 ═══');

  for (const c of oitavasConf) {
    const vencedor = (ptsPorId[c.corretorAId] ?? 0) >= (ptsPorId[c.corretorBId] ?? 0) ? c.corretorAId : c.corretorBId;
    await exec(`UPDATE copa_confrontos SET vencedorId = ${vencedor} WHERE id = ${c.id}`);
  }

  const oitavasVenc = (await query(`SELECT vencedorId FROM copa_confrontos WHERE faseId = ${faseOitavas.id} AND vencedorId IS NOT NULL ORDER BY id`)).map(r => r.vencedorId);
  const oitavasPerc = oitavasConf.map(c => {
    const v = c.vencedorId ?? (((ptsPorId[c.corretorAId] ?? 0) >= (ptsPorId[c.corretorBId] ?? 0)) ? c.corretorAId : c.corretorBId);
    return v === c.corretorAId ? c.corretorBId : c.corretorAId;
  });
  assert(oitavasVenc.length === 5, `5 vencedores das Oitavas (encontrado: ${oitavasVenc.length})`);

  // 5 perdedores: rankear, pior eliminado, top 4 jogam Rep2
  const percRanked = await rankearPorPontos(oitavasPerc);
  const rep2Jogadores = percRanked.slice(0, 4);
  const eliminadoDireto = percRanked[4];
  console.log(`  Eliminado direto (pior dos perdedores): ${eliminadoDireto}`);
  console.log(`  Rep2 participantes: ${rep2Jogadores.join(', ')}`);

  await exec(`INSERT INTO copa_confrontos (faseId, corretorAId, corretorBId, semanaRef, posicao) VALUES (${faseRep2.id}, ${rep2Jogadores[0]}, ${rep2Jogadores[3]}, 10, 1)`);
  await exec(`INSERT INTO copa_confrontos (faseId, corretorAId, corretorBId, semanaRef, posicao) VALUES (${faseRep2.id}, ${rep2Jogadores[1]}, ${rep2Jogadores[2]}, 10, 2)`);

  const rep2Conf = await query(`SELECT * FROM copa_confrontos WHERE faseId = ${faseRep2.id}`);
  assert(rep2Conf.length === 2, `Repescagem 2 tem 2 confrontos (encontrado: ${rep2Conf.length})`);

  // ═══════════════════════════════════════════════════════════════════
  // FASE 7: Repescagem 2 → Quartas (3 duelos + 1 bye)
  // ═══════════════════════════════════════════════════════════════════
  console.log('\n═══ FASE 7: Repescagem 2 → Quartas ═══');

  for (const c of rep2Conf) {
    const vencedor = (ptsPorId[c.corretorAId] ?? 0) >= (ptsPorId[c.corretorBId] ?? 0) ? c.corretorAId : c.corretorBId;
    await exec(`UPDATE copa_confrontos SET vencedorId = ${vencedor} WHERE id = ${c.id}`);
  }

  const rep2Venc = (await query(`SELECT vencedorId FROM copa_confrontos WHERE faseId = ${faseRep2.id} AND vencedorId IS NOT NULL ORDER BY id`)).map(r => r.vencedorId);
  assert(rep2Venc.length === 2, `2 vencedores da Rep2 (encontrado: ${rep2Venc.length})`);

  // Combinar: 5 Oitavas vencedores + 2 Rep2 vencedores = 7
  const todos7 = [...oitavasVenc, ...rep2Venc];
  const todos7Ranked = await rankearPorPontos(todos7);
  const byeId = todos7Ranked[0];
  const duelistas = todos7Ranked.slice(1); // 6 players

  console.log(`  Bye (melhor entre 7): ${byeId}`);
  console.log(`  Duelistas: ${duelistas.join(', ')}`);
  assert(duelistas.length === 6, `6 duelistas nas Quartas (encontrado: ${duelistas.length})`);

  // 3 duelos + 1 bye
  await exec(`INSERT INTO copa_confrontos (faseId, corretorAId, corretorBId, semanaRef, posicao) VALUES (${faseQuartas.id}, ${duelistas[0]}, ${duelistas[5]}, 11, 1)`);
  await exec(`INSERT INTO copa_confrontos (faseId, corretorAId, corretorBId, semanaRef, posicao) VALUES (${faseQuartas.id}, ${duelistas[1]}, ${duelistas[4]}, 11, 2)`);
  await exec(`INSERT INTO copa_confrontos (faseId, corretorAId, corretorBId, semanaRef, posicao) VALUES (${faseQuartas.id}, ${duelistas[2]}, ${duelistas[3]}, 11, 3)`);
  await exec(`INSERT INTO copa_confrontos (faseId, corretorAId, corretorBId, semanaRef, posicao) VALUES (${faseQuartas.id}, ${byeId}, NULL, 11, 4)`);

  const quartasConf = await query(`SELECT * FROM copa_confrontos WHERE faseId = ${faseQuartas.id}`);
  assert(quartasConf.length === 4, `Quartas tem 4 registros (3 duelos + 1 bye) (encontrado: ${quartasConf.length})`);
  const quartasBye = quartasConf.find(c => c.corretorBId === null);
  assert(!!quartasBye, 'Quartas tem 1 bye');
  assert(quartasBye?.corretorAId === byeId, `Bye é para o corretor ${byeId}`);

  // ═══════════════════════════════════════════════════════════════════
  // FASE 8: Quartas → Semifinal (2 duelos)
  // ═══════════════════════════════════════════════════════════════════
  console.log('\n═══ FASE 8: Quartas → Semifinal ═══');

  // Definir vencedores dos 3 duelos das Quartas
  const quartasDuelos = quartasConf.filter(c => c.corretorBId !== null);
  for (const c of quartasDuelos) {
    const vencedor = (ptsPorId[c.corretorAId] ?? 0) >= (ptsPorId[c.corretorBId] ?? 0) ? c.corretorAId : c.corretorBId;
    await exec(`UPDATE copa_confrontos SET vencedorId = ${vencedor} WHERE id = ${c.id}`);
  }
  // Definir vencedor do bye (automático)
  if (quartasBye) {
    await exec(`UPDATE copa_confrontos SET vencedorId = ${byeId} WHERE id = ${quartasBye.id}`);
  }

  const quartasVenc = (await query(`SELECT vencedorId FROM copa_confrontos WHERE faseId = ${faseQuartas.id} AND vencedorId IS NOT NULL AND corretorBId IS NOT NULL ORDER BY id`)).map(r => r.vencedorId);
  assert(quartasVenc.length === 3, `3 vencedores das Quartas (encontrado: ${quartasVenc.length})`);

  // 4 semifinalistas: 3 vencedores + bye
  const todos4 = [...quartasVenc, byeId];
  const todos4Ranked = await rankearPorPontos(todos4);

  // 2 duelos (semanaRef=12): 1º vs 4º, 2º vs 3º
  await exec(`INSERT INTO copa_confrontos (faseId, corretorAId, corretorBId, semanaRef, posicao) VALUES (${faseSemi.id}, ${todos4Ranked[0]}, ${todos4Ranked[3]}, 12, 1)`);
  await exec(`INSERT INTO copa_confrontos (faseId, corretorAId, corretorBId, semanaRef, posicao) VALUES (${faseSemi.id}, ${todos4Ranked[1]}, ${todos4Ranked[2]}, 12, 2)`);

  const semiConf = await query(`SELECT * FROM copa_confrontos WHERE faseId = ${faseSemi.id}`);
  assert(semiConf.length === 2, `Semifinal tem 2 duelos (encontrado: ${semiConf.length})`);
  console.log(`  Semi: ${todos4Ranked[0]} vs ${todos4Ranked[3]} | ${todos4Ranked[1]} vs ${todos4Ranked[2]}`);

  // ═══════════════════════════════════════════════════════════════════
  // FASE 9: Semifinal → Final + 3º Lugar
  // ═══════════════════════════════════════════════════════════════════
  console.log('\n═══ FASE 9: Semifinal → Final + 3º Lugar ═══');

  for (const c of semiConf) {
    const vencedor = (ptsPorId[c.corretorAId] ?? 0) >= (ptsPorId[c.corretorBId] ?? 0) ? c.corretorAId : c.corretorBId;
    await exec(`UPDATE copa_confrontos SET vencedorId = ${vencedor} WHERE id = ${c.id}`);
  }

  const semiVenc    = (await query(`SELECT vencedorId FROM copa_confrontos WHERE faseId = ${faseSemi.id} AND vencedorId IS NOT NULL ORDER BY id`)).map(r => r.vencedorId);
  const semiPerc    = semiConf.map(c => {
    const v = (ptsPorId[c.corretorAId] ?? 0) >= (ptsPorId[c.corretorBId] ?? 0) ? c.corretorAId : c.corretorBId;
    return v === c.corretorAId ? c.corretorBId : c.corretorAId;
  });
  assert(semiVenc.length === 2, `2 vencedores da Semifinal (encontrado: ${semiVenc.length})`);

  await exec(`INSERT INTO copa_confrontos (faseId, corretorAId, corretorBId, semanaRef, posicao) VALUES (${faseFinal.id}, ${semiVenc[0]}, ${semiVenc[1]}, 13, 1)`);
  await exec(`INSERT INTO copa_confrontos (faseId, corretorAId, corretorBId, semanaRef, posicao) VALUES (${faseTerceiro.id}, ${semiPerc[0]}, ${semiPerc[1]}, 13, 1)`);

  const finalConf   = await query(`SELECT * FROM copa_confrontos WHERE faseId = ${faseFinal.id}`);
  const terceiroConf = await query(`SELECT * FROM copa_confrontos WHERE faseId = ${faseTerceiro.id}`);
  assert(finalConf.length === 1,    `Grande Final tem 1 confronto (encontrado: ${finalConf.length})`);
  assert(terceiroConf.length === 1, `3º Lugar tem 1 confronto (encontrado: ${terceiroConf.length})`);

  // ═══════════════════════════════════════════════════════════════════
  // FASE 10: Grande Final + 3º Lugar + bônus finais
  // ═══════════════════════════════════════════════════════════════════
  console.log('\n═══ FASE 10: Grande Final e bônus finais ═══');

  const fc = finalConf[0];
  const campeao = (ptsPorId[fc.corretorAId] ?? 0) >= (ptsPorId[fc.corretorBId] ?? 0) ? fc.corretorAId : fc.corretorBId;
  const vice     = campeao === fc.corretorAId ? fc.corretorBId : fc.corretorAId;
  await exec(`UPDATE copa_confrontos SET vencedorId = ${campeao} WHERE id = ${fc.id}`);

  const tc = terceiroConf[0];
  const terceiro = (ptsPorId[tc.corretorAId] ?? 0) >= (ptsPorId[tc.corretorBId] ?? 0) ? tc.corretorAId : tc.corretorBId;
  const quarto   = terceiro === tc.corretorAId ? tc.corretorBId : tc.corretorAId;
  await exec(`UPDATE copa_confrontos SET vencedorId = ${terceiro} WHERE id = ${tc.id}`);

  // Aplicar bônus finais (semana 13)
  await aplicarBonus(campeao,  13, 10);
  await aplicarBonus(vice,     13, 7);
  await aplicarBonus(terceiro, 13, 5);
  await aplicarBonus(quarto,   13, 3);

  console.log(`  🏆 Campeão: ${campeao}  (+10 pts bônus)`);
  console.log(`  🥈 Vice:    ${vice}     (+7 pts bônus)`);
  console.log(`  🥉 3º:      ${terceiro} (+5 pts bônus)`);
  console.log(`  4º:         ${quarto}   (+3 pts bônus)`);

  // Verificar bônus aplicados
  const bonusCampeao = await query(`SELECT total FROM copa_pontuacoes WHERE corretorId = ${campeao} AND semana = 13`);
  assert(Number(bonusCampeao[0]?.total ?? 0) >= 10, `Campeão tem bônus na semana 13 (total: ${bonusCampeao[0]?.total})`);

  // ═══════════════════════════════════════════════════════════════════
  // VERIFICAÇÃO FINAL: contagem de confrontos por fase
  // ═══════════════════════════════════════════════════════════════════
  console.log('\n═══ VERIFICAÇÃO FINAL ═══');

  const resumo = await query(`
    SELECT f.nome, f.tipo, COUNT(c.id) as total,
           SUM(CASE WHEN c.vencedorId IS NOT NULL THEN 1 ELSE 0 END) as resolvidos
    FROM copa_fases f
    LEFT JOIN copa_confrontos c ON c.faseId = f.id
    GROUP BY f.id, f.nome, f.tipo ORDER BY f.ordem
  `);

  console.log('\n  Resumo por fase:');
  for (const f of resumo) {
    console.log(`    ${f.nome}: ${f.total} confrontos, ${f.resolvidos} resolvidos`);
  }

  const esperadoPorTipo = { grupos: 42, repescagem1: 3, oitavas: 5, repescagem2: 2, quartas: 4, semifinal: 2, terceiro: 1, final: 1 };
  for (const [tipo, esperado] of Object.entries(esperadoPorTipo)) {
    const fase = resumo.find(f => f.tipo === tipo);
    assert(Number(fase?.total ?? 0) === esperado, `Fase ${tipo}: ${esperado} confrontos (encontrado: ${fase?.total})`);
  }

  const totalAll = await query('SELECT COUNT(*) as cnt FROM copa_confrontos');
  // 42 + 3 + 5 + 2 + 4 + 2 + 1 + 1 = 60
  assert(Number(totalAll[0].cnt) === 60, `Total de 60 confrontos em todas as fases (encontrado: ${totalAll[0].cnt})`);

  const totalResolvidos = await query('SELECT COUNT(*) as cnt FROM copa_confrontos WHERE vencedorId IS NOT NULL');
  assert(Number(totalResolvidos[0].cnt) === 60, `Todos os 60 confrontos resolvidos (encontrado: ${totalResolvidos[0].cnt})`);

  // ═══════════════════════════════════════════════════════════════════
  // LIMPEZA: restaurar estado anterior
  // ═══════════════════════════════════════════════════════════════════
  console.log('\n═══ Limpando dados de teste ═══');

  await exec('DELETE FROM copa_confrontos');
  await exec('DELETE FROM copa_pontuacoes');

  for (const c of confrontosAntes) {
    await exec(`INSERT INTO copa_confrontos (id, faseId, corretorAId, corretorBId, vencedorId, semanaRef, posicao) VALUES (${c.id}, ${c.faseId}, ${c.corretorAId ?? 'NULL'}, ${c.corretorBId ?? 'NULL'}, ${c.vencedorId ?? 'NULL'}, ${c.semanaRef ?? 'NULL'}, ${c.posicao ?? 1})`);
  }
  for (const p of pontuacoesAntes) {
    await exec(`INSERT INTO copa_pontuacoes (id, corretorId, semana, agendamentos, visitas, documentacao, vendas, total, createdAt, updatedAt) VALUES (${p.id}, ${p.corretorId}, ${p.semana}, ${p.agendamentos}, ${p.visitas}, ${p.documentacao}, ${p.vendas}, ${p.total}, '${new Date(p.createdAt).toISOString().slice(0,19)}', '${new Date(p.updatedAt).toISOString().slice(0,19)}')`);
  }

  const depoisConf = await query('SELECT COUNT(*) as cnt FROM copa_confrontos');
  const depoisPont = await query('SELECT COUNT(*) as cnt FROM copa_pontuacoes');
  assert(Number(depoisConf[0].cnt) === confrontosAntes.length, `Confrontos restaurados (${confrontosAntes.length})`);
  assert(Number(depoisPont[0].cnt) === pontuacoesAntes.length, `Pontuações restauradas (${pontuacoesAntes.length})`);

  // ═══════════════════════════════════════════════════════════════════
  // RESULTADO
  // ═══════════════════════════════════════════════════════════════════
  console.log('\n══════════════════════════════════════════════════════════');
  console.log('  RESULTADO DO TESTE — COPA SMQ 2026 NOVO FORMATO');
  console.log('══════════════════════════════════════════════════════════');

  if (errors.length === 0) {
    console.log('  ✅ TODOS OS TESTES PASSARAM!');
    console.log('  Fluxo completo validado:');
    console.log('    • Round-robin: 42 confrontos, 6 por corretor, 6 por semana');
    console.log('    • Grupos → Rep1: 3 duelos (5º/6º/7º cruzados) + bônus posição');
    console.log('    • Rep1 → Oitavas: 5 duelos (8 diretos + 2 da rep1)');
    console.log('    • Oitavas → Rep2: 2 duelos (pior eliminado direto)');
    console.log('    • Rep2 → Quartas: 3 duelos + 1 bye (7 jogadores)');
    console.log('    • Quartas → Semi: 2 duelos (3 vencedores + bye)');
    console.log('    • Semi → Final + 3º: 2 confrontos simultâneos');
    console.log('    • Bônus finais aplicados: +10/+7/+5/+3 pts');
    console.log('    • Total: 60 confrontos em 8 fases');
  } else {
    console.log(`  ❌ ${errors.length} ERRO(S):`);
    for (const e of errors) console.log(`    ${e}`);
  }
  console.log('══════════════════════════════════════════════════════════\n');

} catch (err) {
  console.error('\n💥 ERRO FATAL:', err.message);
  console.error(err.stack);
  try {
    await exec('DELETE FROM copa_confrontos');
    await exec('DELETE FROM copa_pontuacoes');
  } catch {}
} finally {
  await connection.end();
}
