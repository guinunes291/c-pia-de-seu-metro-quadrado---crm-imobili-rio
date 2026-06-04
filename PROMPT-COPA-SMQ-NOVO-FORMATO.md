# Prompt para Claude — Implementar Novo Formato da Copa SMQ 2026

## Contexto do Projeto

Este é um CRM imobiliário (Seu Metro Quadrado) com uma funcionalidade de "Copa SMQ" — uma competição gamificada entre 14 corretores divididos em 2 grupos de 7. O projeto usa:
- **Backend:** Node.js + Express + tRPC + Drizzle ORM + MySQL (TiDB)
- **Frontend:** React 19 + Tailwind 4 + Vite
- **Arquivos principais da Copa:**
  - `server/routers/copa.ts` — todas as procedures tRPC (sorteio, pontuação, avanço de fases, etc.)
  - `client/src/pages/CopaSMQPage.tsx` — página completa da Copa (chaveamento, pontuação, premiação, admin)

## Estado Atual Implementado

O código atual já tem:
- 14 corretores em 2 grupos de 7 (tabela `copa_corretores` com coluna `grupo` = 'A' ou 'B')
- Algoritmo de round-robin com dummy player para N ímpar (gera 21 confrontos por grupo = 42 total)
- Tabela `copa_fases` com fases: Grupos, Quartas, Repescagem, Semifinal, 3º Lugar, Final
- Tabela `copa_confrontos` (faseId, corretorAId, corretorBId, vencedorId, semanaRef, posicao)
- Tabela `copa_pontuacoes` (corretorId, semana, agendamentos, visitas, documentacao, vendas, total)
- Tabela `copa_config_pontos` (chave, pontos — ex: agendamentos=25, visitas=40, documentacao=60, vendas=150)
- Tabela `copa_config_premios` (posicao, descricao, valor, icone, ordem)
- Procedure `realizarSorteio` — gera round-robin por grupo
- Procedure `avancarFase` — avança entre fases (precisa ser reescrita)
- Procedure `setVencedor` — define vencedor de um confronto e dá +20 pts bônus
- Procedure `getPontosConfronto` — calcula pontos de um corretor numa semana específica baseado em dados reais do CRM
- Frontend com calendário de semanas, cards de confronto, chaveamento visual, aba admin

## Novo Formato a Implementar (14 semanas — 03/06 a 08/09/2026)

```
FASE DE GRUPOS (Semanas 1–7, 03/06–21/07)
├── 14 corretores, 2 grupos de 7
├── Round-robin completo (cada um enfrenta os 6 do grupo)
├── 7 rodadas × 3 jogos por grupo × 2 grupos = 42 confrontos
├── Vencedor de cada confronto: +20 pts bônus (já implementado)
└── Ao final da semana 7: bônus por posição no grupo
    ├── 1º: +10 pts
    ├── 2º: +9 pts
    ├── 3º: +8 pts
    ├── 4º: +7 pts
    ├── 5º: +6 pts
    ├── 6º: +5 pts
    └── 7º: +4 pts

REPESCAGEM 1 (Semana 8, 22/07–28/07)
├── Participantes: 5º, 6º e 7º de cada grupo = 6 corretores
├── Formato: 3 duelos cruzados (5ºA vs 6ºB, 6ºA vs 5ºB, 7ºA vs 7ºB)
├── 3 vencedores → os 2 melhores (por pts geral) avançam para Oitavas
├── 1 vencedor restante + 3 perdedores = 4 ELIMINADOS
└── Bônus: vencedor do duelo +2 pts

OITAVAS DE FINAL (Semana 9, 29/07–04/08)
├── Participantes: 1º ao 4º de cada grupo (8) + 2 da Repescagem 1 = 10 corretores
├── Formato: 5 duelos cruzados
├── 5 vencedores avançam para Quartas
├── 5 perdedores → Repescagem 2
└── Bônus: vencedor do duelo +3 pts

REPESCAGEM 2 (Semana 10, 05/08–11/08)
├── Participantes: 5 perdedores das Oitavas
├── Formato: 2 duelos (4 melhores classificados por pts geral) + 1 eliminado direto (pior classificado)
├── 2 vencedores retornam → Quartas
├── 2 perdedores + 1 eliminado direto = 3 ELIMINADOS
└── Bônus: vencedor do duelo +2 pts

QUARTAS DE FINAL (Semana 11, 12/08–18/08)
├── Participantes: 5 das Oitavas + 2 da Repescagem 2 = 7 corretores
├── Formato: 3 duelos + 1 bye (melhor classificado geral entre os 7)
├── 4 avançam para Semifinal (3 vencedores + bye)
├── 3 ELIMINADOS
└── Bônus: vencedor do duelo +4 pts

SEMIFINAL (Semana 12, 19/08–25/08)
├── Participantes: 4 corretores
├── Formato: 2 duelos
├── 2 vencedores → Final
├── 2 perdedores → Disputa de 3º Lugar
└── Bônus: vencedor do duelo +5 pts

FINAL + 3º LUGAR (Semana 13, 26/08–01/09)
├── Grande Final: Vencedor Semi 1 vs Vencedor Semi 2
├── Disputa 3º: Perdedor Semi 1 vs Perdedor Semi 2
├── Critério de desempate em QUALQUER fase: pontuação geral acumulada
└── Bônus finais:
    ├── 🏆 Campeão: +10 pts
    ├── 🥈 Vice: +7 pts
    ├── 🥉 3º Lugar: +5 pts
    └── 4º Lugar: +3 pts

PREMIAÇÃO (Semana 14, 02/09–08/09) — apenas celebração, sem competição
```

## O que precisa ser feito no Backend (`server/routers/copa.ts`)

1. **Atualizar `getSemanaAtual`**: limite de 11 → 14 semanas
2. **Atualizar `salvarPontuacao`**: aceitar semanas 1–14
3. **Atualizar `getPontosConfronto`**: adicionar janelas de datas para semanas 9–14:
   - Sem 9: 29/07–04/08
   - Sem 10: 05/08–11/08
   - Sem 11: 12/08–18/08
   - Sem 12: 19/08–25/08
   - Sem 13: 26/08–01/09
   - Sem 14: 02/09–08/09
4. **Criar procedure `aplicarBonusFaseGrupos`**: ao final da semana 7, aplica bônus por posição (1º +10, 2º +9, ..., 7º +4) automaticamente
5. **Reescrever `avancarFase` completamente** com a nova lógica:
   - Grupos → Repescagem 1 (6 corretores, 3 duelos) + marca 1º–4º como "diretos para Oitavas"
   - Repescagem 1 → seleciona 2 melhores vencedores → Oitavas (10 corretores, 5 duelos)
   - Oitavas → 5 vencedores para Quartas + 5 perdedores para Repescagem 2
   - Repescagem 2 → elimina pior direto, 2 duelos, 2 vencedores → Quartas
   - Quartas → 3 duelos + 1 bye (melhor geral) → 4 para Semifinal
   - Semifinal → 2 duelos → 2 para Final + 2 para 3º Lugar
   - Final → define Campeão/Vice + 3º/4º Lugar + aplica bônus finais
6. **Criar procedure `aplicarBonusFase`**: aplica bônus automaticamente quando `setVencedor` é chamado nas fases eliminatórias (+2, +3, +4, +5 conforme a fase)
7. **Atualizar tabela `copa_fases`** no banco: adicionar Repescagem 1, Oitavas, Repescagem 2 (total 8 fases + premiação)

## O que precisa ser feito no Frontend (`client/src/pages/CopaSMQPage.tsx`)

1. **Atualizar constante `SEMANAS`**: 14 semanas com labels corretos
2. **Atualizar header**: "03 JUN → 08 SET 2026", "14 SEMANAS"
3. **Adicionar queries de pontos** para semanas 12, 13, 14
4. **Atualizar seção de chaveamento**:
   - Repescagem 1: mostrar 3 duelos + indicar quais 2 avançam
   - Oitavas de Final: mostrar 5 duelos
   - Repescagem 2: mostrar 2 duelos + indicar eliminado direto
   - Quartas: mostrar 3 duelos + card de bye
   - Semifinal: 2 duelos
   - Final + 3º Lugar: 2 duelos com destaque visual
5. **Adicionar visual de bônus**: mostrar bônus aplicados no ranking/pontuação
6. **Atualizar textos descritivos** de cada fase

## Banco de Dados — Fases necessárias (tabela `copa_fases`)

```sql
-- Limpar fases antigas e recriar
DELETE FROM copa_fases;
INSERT INTO copa_fases (nome, tipo, ordem, semanaInicio, semanaFim) VALUES
('Fase de Grupos', 'grupos', 1, '03/06', '21/07'),
('Repescagem 1', 'repescagem1', 2, '22/07', '28/07'),
('Oitavas de Final', 'oitavas', 3, '29/07', '04/08'),
('Repescagem 2', 'repescagem2', 4, '05/08', '11/08'),
('Quartas de Final', 'quartas', 5, '12/08', '18/08'),
('Semifinal', 'semifinal', 6, '19/08', '25/08'),
('3º Lugar', 'terceiro', 7, '26/08', '01/09'),
('Grande Final', 'final', 8, '26/08', '01/09');
```

## Regras Importantes

- **Critério de desempate em TODAS as fases**: pontuação geral acumulada (soma de todos os pontos + bônus)
- **Bônus de vitória em confronto (+20 pts)** continua valendo em TODAS as fases (grupos e eliminatórias)
- **Bônus de fase** são adicionais e aplicados automaticamente ao avançar/concluir cada fase
- **O bye nas Quartas** vai para o melhor classificado geral (por pontuação acumulada) entre os 7 corretores
- **Na Repescagem 2**, o eliminado direto é o pior classificado geral entre os 5 perdedores das Oitavas
- **Na Repescagem 1**, dos 3 vencedores, os 2 com melhor pontuação geral avançam; o 3º vencedor é eliminado

## Teste de Ponta a Ponta

Após implementar, criar um script `test-copa-flow.mjs` que:
1. Salva estado atual do banco (confrontos e pontuações existentes)
2. Limpa dados e simula todo o fluxo: sorteio → pontuação → avanço de todas as fases → campeão
3. Verifica que cada corretor tem exatamente 6 confrontos na fase de grupos
4. Verifica que os bônus são aplicados corretamente
5. Verifica que o número de confrontos por fase está correto
6. Verifica que o desempate por pontuação geral funciona
7. Restaura o estado anterior do banco ao final
8. Reporta todos os erros encontrados

## Resumo de Eliminações Progressivas

| Semana | Fase | Eliminados na semana | Total eliminados | Ainda vivos |
|---|---|---|---|---|
| 7 | Fim dos Grupos | 0 | 0 | 14 |
| 8 | Repescagem 1 | 4 (3 perdedores + 1 pior vencedor) | 4 | 10 |
| 9 | Oitavas | 0 (perdedores vão para Repescagem 2) | 4 | 10 |
| 10 | Repescagem 2 | 3 (pior direto + 2 perdedores) | 7 | 7 |
| 11 | Quartas | 3 | 10 | 4 |
| 12 | Semi | 0 (vão para 3º lugar) | 10 | 4 |
| 13 | Final + 3º | 0 | 10 | 4 premiados |

## Sistema Completo de Bônus

| Fase | Condição | Bônus |
|---|---|---|
| Fase de Grupos (qualquer confronto) | Vencedor do confronto | +20 pts |
| Fase de Grupos (posição final) | 1º do grupo | +10 pts |
| Fase de Grupos (posição final) | 2º do grupo | +9 pts |
| Fase de Grupos (posição final) | 3º do grupo | +8 pts |
| Fase de Grupos (posição final) | 4º do grupo | +7 pts |
| Fase de Grupos (posição final) | 5º do grupo | +6 pts |
| Fase de Grupos (posição final) | 6º do grupo | +5 pts |
| Fase de Grupos (posição final) | 7º do grupo | +4 pts |
| Repescagem 1 | Vencedor do duelo | +2 pts |
| Oitavas de Final | Vencedor do duelo | +3 pts |
| Repescagem 2 | Vencedor do duelo | +2 pts |
| Quartas de Final | Vencedor do duelo | +4 pts |
| Semifinal | Vencedor do duelo | +5 pts |
| Final | 🏆 Campeão | +10 pts |
| Final | 🥈 Vice-Campeão | +7 pts |
| 3º Lugar | 🥉 3º Lugar | +5 pts |
| 3º Lugar | 4º Lugar | +3 pts |

## Bônus Máximo Possível (Campeão perfeito)

- Fase de Grupos: 6 vitórias × 20 = 120 + posição 1º = 10 → **130 pts bônus**
- Oitavas: vitória +20 + fase +3 → **23 pts**
- Quartas: vitória +20 + fase +4 → **24 pts**
- Semifinal: vitória +20 + fase +5 → **25 pts**
- Final: vitória +20 + campeão +10 → **30 pts**
- **Total bônus máximo: 232 pts** (além da pontuação de produção)
