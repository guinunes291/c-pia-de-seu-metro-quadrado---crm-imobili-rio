# Distribuição e Transferência de Leads — Documentação Técnica

> Última atualização: 2026-06-04  
> Cobre todo o ciclo de vida de um lead do ponto de entrada até o encerramento, incluindo jobs periódicos, regras de transferência e tabelas de auditoria.

---

## 1. Visão Geral — Fluxo Completo

```
┌──────────────────────────────────────────────────────────────────────┐
│                        ENTRADA DO LEAD                               │
│  Facebook Ads → webhookRoutes.ts  ─────────────────→ ROLETA (imediata)│
│  Facebook Foco → webhookRoutes.ts ─────────────────→ FILA FOCO (imediata)│
│  Google Sheets / Manual           ─────────────────→ ESTOQUE (aguarda job)│
└──────────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────────────┐
│                     DISTRIBUIÇÃO INICIAL                             │
│  Roleta/Foco → corretorId atribuído imediatamente                   │
│  Estoque → distribuicaoJob (a cada 10 min) distribui via round-robin │
└──────────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────────────┐
│                         EM ATENDIMENTO                               │
│  status: aguardando_atendimento → em_atendimento → (conversão)      │
│  Timer de 5 min: apenas desativa flag timerAtivo (não redistribui)  │
└──────────────────────────────────────────────────────────────────────┘
                            │
                     (sem follow-up)
                            │
                            ▼
┌──────────────────────────────────────────────────────────────────────┐
│                    REDISTRIBUIÇÃO AUTOMÁTICA                         │
│  transferenciaJob (6h): 5 dias sem follow-up → próximo da fila      │
│  Se sem corretor disponível → leadEstoque (aguarda próximo job)      │
└──────────────────────────────────────────────────────────────────────┘
                            │
                     (sem corretores)
                            │
                            ▼
┌──────────────────────────────────────────────────────────────────────┐
│                           ESTOQUE                                    │
│  Tabela leadEstoque — redistribuído automaticamente pelo              │
│  distribuicaoJob e transferenciaJob quando corretor elegível surgir  │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 2. Origens de Leads

| Origem (enum) | Descrição | Canal de entrada | Observação |
|---|---|---|---|
| `facebook` | Facebook Lead Ads | `webhookRoutes.ts` POST `/api/webhook/facebook/:token` | Ativa timer de 5 min |
| `google_sheets` | Importação de planilha | Importação manual no painel | Vai para estoque (sem roleta) |
| `site` | Formulário do site | Integração direta | — |
| `indicacao` | Indicação de cliente | Manual | — |
| `captacao_corretor` | Captação própria do corretor | Manual | **IMUNE a todas as transferências automáticas** |
| `whatsapp` | Contato via WhatsApp | Manual / integração | — |
| `telefone` | Ligação telefônica | Manual | — |
| `plantao` | Plantão de vendas | Manual | — |
| `agendamento_self_service` | Link de autoatendimento | Integração | — |
| `chatbot` | Chatbot de pré-qualificação | Integração | — |
| `outro` | Outras origens | Manual | — |

---

## 3. Distribuição Inicial

### 3.1 Distribuição via Roleta (Webhook — imediata)

**Arquivo:** `server/db.ts` → `distribuirLeadPelaRoleta()`

Quando um lead chega via webhook, a distribuição acontece **imediatamente** — sem esperar o job periódico.

```
Lead chega via webhook
        │
        ├─ É Projeto Foco ativo?
        │   └─ SIM → getProximoCorretorFilaFoco()
        │            Usa array JSON corretoresIds (tabela configuracao_projeto_foco)
        │            Rotaciona o array após cada distribuição
        │            SEM limite diário
        │
        └─ NÃO → getProximoCorretorFila()
                 Usa tabela fila_distribuicao ordenada por posicao (FIFO)
                 Move corretor para final da fila após receber
                 COM limite diário (leadsRecebidosHoje)

Pós-distribuição:
  - leads.corretorId = corretor escolhido
  - leads.timerAtivo = true (apenas se origem contém "facebook"/"webhook"/"fb"/"ads")
  - Registra em distribution_log
  - Notifica corretor (push + SSE)
```

### 3.2 Distribuição via Job Periódico (Estoque — a cada 10 min)

**Arquivo:** `server/distribuicaoJob.ts` + `server/distribution.ts`

Roda a cada **10 minutos** (primeira execução 60s após startup).

**Leads elegíveis para distribuição:**
- `corretorId IS NULL` **ou** corretor tem role admin/gestor (lead sem dono válido)
- `status IN ('novo', 'aguardando_atendimento')`
- `naLixeira = false`
- `transferidoManualmentePorAdmin = false`
- `timerAtivo = false`
- Cooldown: `dataDistribuicao < (agora - 8h)` — leads distribuídos há menos de 8h não são redistribuídos

**Critério de elegibilidade do corretor** (`getCorretoresElegiveisParaDistribuicao()`):
- `status = "presente"` E
- `total_leads = 0` OU `percentual_não_aguardando >= 90%`
  - (Corretor com menos de 90% dos leads trabalhados não recebe novos)
- Ordenado por: taxa de conversão do projeto > taxa da região > taxa geral

**Algoritmo:** Round-robin com máximo de **30 leads por corretor por rodada**.  
Se nenhum corretor elegível → lead vai para `leadEstoque` com motivo "Nenhum corretor elegível".

### 3.3 Fila de Estoque

**Tabela:** `lead_estoque`  
Leads que não puderam ser distribuídos ficam aqui com `status = "aguardando"` e são tentados novamente a cada ciclo do distribuicaoJob.

---

## 4. Transferências e Redistribuições

### 4.1 Resumo de todos os tipos

| Tipo | Gatilho | Frequência | Imunidades | Destino se sem corretor |
|---|---|---|---|---|
| **Automática 5 dias** | `ultimaInteracao` (ou `dataDistribuicao`) < 5 dias atrás | A cada 6h | captacao_corretor, Carteira Ativa, transferidoManualmentePorAdmin | Estoque (`leadEstoque`) |
| **Manual (admin/gestor)** | Ação no painel | On-demand | Nenhuma | — |
| **Timer 5 min** | `timerAtivo = true` por > 5 min | A cada 1 min | — | Apenas desativa flag, **não redistribui** |
| **Carteira Ativa expirada** | `protecaoAte < agora` e não renovado | Job desativado | — | Volta para elegível |
| **Sem elegível → Estoque** | Nenhum corretor elegível no momento da distribuição | A cada 10 min | — | `leadEstoque` |

### 4.2 Transferência Automática por 5 Dias Sem Follow-up

**Arquivo:** `server/transferenciaJob.ts`  
**Frequência:** A cada 6 horas (primeira execução 5min após startup)

**Condições para transferir:**
```sql
corretorId IS NOT NULL
AND status IN ('aguardando_atendimento', 'em_atendimento')
AND transferidoManualmentePorAdmin = false
AND (timerAtivo = 0 OR timerAtivo IS NULL)
AND (
  (ultimaInteracao IS NOT NULL AND ultimaInteracao < agora - 5 dias)
  OR
  (ultimaInteracao IS NULL AND dataDistribuicao IS NOT NULL AND dataDistribuicao < agora - 5 dias)
)
LIMIT 50 por ciclo
```

**Imunidades (lead NÃO é transferido):**
1. `origem = 'captacao_corretor'`
2. `transferidoManualmentePorAdmin = true`
3. Lead protegido pela Carteira Ativa (`carteiraAtiva.protecaoAte > agora`)

**Algoritmo de seleção do novo corretor:**
1. Verifica histórico via `distribution_log` (quem já trabalhou o lead)
2. Se lead é da fila foco → usa `getCorretoresFilaFoco()`, se vazia → estoque
3. Se lead é da fila geral → usa `getCorretoresFilaGeral()`, se vazia → tenta redistribuição geral
4. Filtra quem já trabalhou o lead
5. Atribui ao primeiro disponível

**Efeito no lead:**
- `corretorId = novo corretor`
- `status = "aguardando_atendimento"`
- `timerAtivo = origemWebhook ? true : false` (reinicia timer para leads de webhook)
- `ultimaInteracao = agora`
- Grava em `distribution_log` e `log_transferencias`

### 4.3 Transferência Manual

**Arquivo:** `server/routers/leads.ts` (~391–574)

Três procedures:
- `transferir()` → muda status para `aguardando_atendimento`
- `reatribuir()` → mantém status atual
- `transferirEmLote()` → lote de leads

**Comportamento:**
- Cancela todos os follow-ups do corretor anterior
- Para leads com origem Facebook/webhook: reativa `timerAtivo` e volta para `aguardando_atendimento`
- Notifica novo corretor imediatamente (push notification)
- **Não** define `transferidoManualmentePorAdmin = true` automaticamente (o admin precisa marcar explicitamente se quiser travar)

### 4.4 Timer de 5 Minutos

**Arquivo:** `server/timerLeadsJob.ts`  
**Frequência:** A cada 1 minuto

Apenas **desativa o flag `timerAtivo`** quando um lead ficou > 5 min com `timerAtivo = true` sem resposta. **Não redistribui o lead.** O lead permanece com o corretor atual até que a regra de 5 dias (acima) o reatribua, ou o admin faça a transferência manualmente.

### 4.5 Redistribuição Manual pela Página de Distribuição (Admin)

**Arquivo:** `server/_core/systemRouter.ts`

Disponível na página de administração de distribuição. Redistribui leads com 2+ dias sem interação para corretores presentes com cotas disponíveis. Registra no `log_transferencias` e `historico_atribuicoes`.

### 4.6 [REMOVIDO] Job de 48h → Perdido+Lixeira

**Arquivo:** `server/transferenciaAutomaticaJob.ts` — **código morto, não é importado em produção.**

Esse job existia para transferir leads com 48h sem interação e, se não houvesse corretor, movê-los para `status = "perdido"` + `naLixeira = true`. Foi desativado (confirmado em `todo.md:5281` e nos testes em `transferenciaJob.test.ts`).

> ⚠️ O arquivo ainda existe no repositório mas **nenhum** import ativo o utiliza. Pode ser deletado com segurança.

---

## 5. Proteção de Carteira Ativa

**Arquivo:** `server/routers/carteiraAtiva.ts`

Um corretor pode adicionar um lead à sua "Carteira Ativa", protegendo-o por **15 dias** (campo `protecaoAte`). Durante esse período, o lead é **imune a todas as transferências automáticas** (job de 5 dias e job de 48h).

- Limite: 25% dos leads ativos totais do corretor podem estar protegidos
- Pode ser renovado por 3 dias ilimitadas vezes
- O **job de expiração** (`carteiraAtivaJob.ts`) está **desativado** — a imunidade é verificada on-demand pelas funções `isLeadProtegidoCarteira()` / `getLeadsProtegidosCarteira()`

---

## 6. Jobs Periódicos

| Job | Arquivo | Frequência real | O que faz | Status |
|---|---|---|---|---|
| Distribuição automática | `distribuicaoJob.ts` | A cada **10 min** | Distribui leads sem corretor para elegíveis; desativa timer de 5min; agenda priorização diária (7h) | ✅ Ativo |
| Timer de leads | `timerLeadsJob.ts` (via distribuicaoJob) | A cada **1 min** | Desativa `timerAtivo` em leads > 5min | ✅ Ativo |
| Transferência 5 dias | `transferenciaJob.ts` | A cada **6h** | Transfere leads sem follow-up há 5+ dias; distribui estoque | ✅ Ativo |
| Limpeza follow-ups órfãos | `followupCleanupJob.ts` | A cada **1h** | Cancela follow-ups de leads fora de `em_atendimento` | ✅ Ativo |
| Aviso follow-up vencido | `followupVencidoJob.ts` | Diário às **09h SP** | WhatsApp para corretor sobre follow-ups vencidos (máx 3/corretor/dia) | ✅ Ativo |
| Lembretes D-1 e boas-vindas | `whatsappRemindersJob.ts` | D-1: 18h SP (1x/dia) · boas-vindas: 10min | Lembra agendamentos do dia seguinte; envia boas-vindas a novos leads | ✅ Ativo |
| Sincronização de métricas | `metricasSyncJob.ts` | A cada **30 min** | Atualiza métricas de performance para ranking e dashboard | ✅ Ativo |
| Backup S3 | `backupJob.ts` | Diário às **3h SP** | Exporta banco para S3 | ✅ Ativo |
| Backup Google Sheets | `sheetsBackupJob.ts` | A cada **24h** | Exporta dados críticos para planilha | ✅ Ativo |
| Limpeza de logs | `logCleanupJob.ts` | Diário às **3h SP** | Remove distribution_log > 30d, log_transferencias > 60d, notifications > 30d | ✅ Ativo |
| Recálculo de pontuação | `pontuacaoJob.ts` | A cada **6h** | Recalcula pontuação de todos os corretores | ✅ Ativo |
| Reset de contadores diários | `resetContadoresJob.ts` | Diário às **00h SP** | Zera `leadsRecebidosHoje` na fila de distribuição | ✅ Ativo |
| DB Keep-Alive (TiDB) | `dbKeepAliveJob.ts` | A cada **4 min** | SELECT 1 para evitar cold start do TiDB Serverless | ✅ Ativo |
| SLA Monitor | `server/modules/slaMonitor.ts` | A cada **5 min** | Gera alertas de SLA violado (não inicializado no entrypoint principal) | ⚠️ Ativo via módulo |
| Agente de priorização (IA) | `agentePriorizacaoJob.ts` | Diário às **7h SP** | Chama LLM (Claude) para priorizar 5 leads mais urgentes por corretor | ✅ Ativo (via distribuicaoJob) |
| Conquistas | `conquistasJob.ts` | — | Verifica conquistas e badges dos corretores | ❌ Desativado |
| Carteira Ativa (expiração) | `carteiraAtivaJob.ts` | — | Processa leads com proteção expirada | ❌ Desativado |
| Importação automática | `sheetsImportJob.ts` | — | Importação periódica de planilhas | ❌ Desativado |
| Notion sync | `notionJob.ts` | — | Sync com Notion | ❌ Desativado |
| BI Sync | `biSyncJob.ts` | — | Sync com BI externo | ❌ Desativado |
| DRE Sync | `dreSyncJob.ts` | — | Exportação de DRE | Manual only |

---

## 7. Tabelas de Auditoria

### `distribution_log`

Registra **toda atribuição/distribuição** de lead a corretor. Usado para evitar que um lead retorne a um corretor que já o trabalhou.

| Campo | Tipo | Uso |
|---|---|---|
| `leadId` | int | Lead atribuído |
| `corretorId` | int | Corretor que recebeu |
| `tipo` | enum: automatica/manual/inicial | Origem da atribuição |
| `motivo` | text | Descrição |
| `distribuidoPorId` | int | Quem fez (se manual) |
| `createdAt` | timestamp | Data/hora |

Limpeza automática: registros com mais de **30 dias** são removidos pelo `logCleanupJob`.

### `log_transferencias`

Registra especificamente as **transferências** (de um corretor para outro), com origem, destino e motivo.

| Campo | Tipo | Uso |
|---|---|---|
| `leadId` | int | Lead transferido |
| `leadNome` | varchar notNull | Nome do lead |
| `corretorOrigemId` | int | Corretor anterior |
| `corretorOrigemNome` | varchar | Nome do corretor anterior |
| `corretorDestinoId` | int | Novo corretor |
| `corretorDestinoNome` | varchar | Nome do novo corretor |
| `motivo` | varchar notNull | Motivo (`5_dias_sem_followup`, `2_dias_sem_interacao`, etc.) |
| `statusFinal` | varchar notNull | `"transferido"` ou `"perdido"` |
| `dataTransferencia` | timestamp | Data/hora |

Limpeza automática: registros com mais de **60 dias** são removidos pelo `logCleanupJob`.

### `lead_estoque`

Fila de espera para leads sem corretor elegível disponível no momento.

| Campo | Uso |
|---|---|
| `leadId` | Lead aguardando |
| `tipoFila` | `"normal"` ou `"foco"` |
| `motivoEstoque` | Razão (ex: "Nenhum corretor elegível disponível") |
| `tentativasDistribuicao` | Contador de tentativas |
| `status` | `aguardando` / `distribuido` / `cancelado` |
| `distribuidoParaCorretorId` | Quem recebeu (quando distribuído) |

### `historico_atribuicoes`

Rastreamento completo de todos os corretores que já tiveram um lead.

| Campo | Uso |
|---|---|
| `leadId` | Lead |
| `corretorId` | Corretor |
| `tipoAtribuicao` | `distribuicao_inicial` / `redistribuicao_automatica` / `redistribuicao_manual` / etc. |
| `dataAtribuicao` | Data/hora |
| `observacoes` | Contexto (ex: "Redistribuído por inatividade") |

---

## 8. Bugs Encontrados e Correções Aplicadas (2026-06-04)

### Bug 1 — `distribution_log` não gravado nas transferências de 5 dias (CRÍTICO)

**Arquivo:** `server/transferenciaJob.ts` ~L235  
**Problema:** O insert usava `timestamp` (coluna inexistente, é `createdAt`) e **omitia `tipo`** (campo `NOT NULL`). O erro era engolido pelo `.catch(() => {})`, então todas as transferências por 5 dias **nunca gravavam no `distribution_log`**. Consequência direta: o mecanismo de "não devolver lead a corretor que já trabalhou" ficava cego para essas transferências.  
**Correção:** Corrigido para `{ leadId, corretorId, tipo: "automatica", motivo: "5_dias_sem_followup" }`. `.catch` agora loga o erro em vez de engolir.

### Bug 2 — `log_transferencias` não gravado nas transferências de 5 dias

**Arquivo:** `server/transferenciaJob.ts` ~L242  
**Problema:** Insert usava `corretorAntigoId`/`corretorNovoId`/`timestamp` (colunas inexistentes) e omitia `leadNome`/`statusFinal` (`NOT NULL`). Também engolido pelo `.catch(() => {})`.  
**Correção:** Corrigido para o shape real do schema: `{ leadId, leadNome, corretorOrigemId, corretorDestinoId, corretorDestinoNome, motivo, statusFinal: "transferido" }`.

### Bug 3 — `log_transferencias` não gravado na redistribuição manual da página de distribuição

**Arquivo:** `server/_core/systemRouter.ts` ~L501  
**Problema:** Omitia `leadNome` (`NOT NULL`), causando falha silenciosa no insert dentro de transação.  
**Correção:** Adicionado `leadNome: lead.nome ?? ""`. Motivo padronizado para `"2_dias_sem_interacao"` (consistência com `transferenciaAutomaticaJob`).

### Bug 4 — Comentário inválido no `timerLeadsJob.ts`

**Arquivo:** `server/timerLeadsJob.ts` L9–10  
**Problema:** Comentário dizia que a transferência ocorria "após 48h sem interação via `transferenciaAutomaticaJob`", job que não roda em produção.  
**Correção:** Atualizado para referenciar `transferenciaJob` (5 dias, a cada 6h).

### Bug 5 — Comentários de frequência errados no entrypoint

**Arquivo:** `server/_core/index.ts` L128, L155, L163, L198  
**Problema:** Logs de inicialização informavam frequências incorretas ("5 minutos", "30 segundos", "5 minutos", "5 minutos") sem correspondência com o código real dos jobs.  
**Correção:** Corrigidos para as frequências reais: 10 min, 6h, 30 min, 6h.

---

## 9. Sugestões de Melhoria (não implementadas)

### 9.1 Centralizar gravação de auditoria em um helper

Existem múltiplos pontos de código que fazem `db.insert(distributionLog)` e `db.insert(logTransferencias)` com shapes ligeiramente diferentes. Criar um helper `registrarTransferencia(db, {leadId, leadNome, corretorOrigemId, novoCorretorId, novoCorretorNome, motivo})` que encapsula ambos os inserts e garante consistência de colunas. Isso evitaria que uma divergência de schema voltasse a passar despercebida.

### 9.2 Remover o arquivo de código morto

`server/transferenciaAutomaticaJob.ts` não é importado em produção. O comportamento que ele implementa (lead → perdido + lixeira ao não ter corretor) é perigoso e foi intencionalmente removido. Deletar o arquivo evita que seja acidentalmente reativado no futuro.

### 9.3 Revisar a regra de elegibilidade de 90%

A regra "corretor recebe novos leads somente se ≥ 90% dos seus leads não estão em `aguardando_atendimento`" pode criar situações em que corretores ficam travados: um lead `aguardando_atendimento` que nenhum corretor quer trabalhar bloqueia a fila inteira. Considerar adicionar uma exceção para leads com mais de X dias sem ação (o job de 5 dias eventualmente resolve, mas há uma janela de 5 dias sem distribuição).

### 9.4 Consolidar os prazos de inatividade em uma constante central

Atualmente há três prazos de tempo espalhados: 5 min (timer), 8h (cooldown), 5 dias (transferência). Uma constante em `server/constants.ts` tornaria a manutenção mais segura e a lógica de negócio mais legível.

### 9.5 Cobrir transferências com testes de integração

Os testes existentes (`transferenciaJob.test.ts`) testam cenários unitários mas não verificam que os inserts em `distribution_log` e `log_transferencias` realmente persistem com o shape correto do schema Drizzle. Um teste de integração que leia as tabelas após executar `verificarTransferenciasAutomaticas()` garantiria que bugs como os corrigidos acima não retornem.

### 9.6 SLA Monitor — verificar inicialização

`server/modules/slaMonitor.ts` não está inicializado no entrypoint principal (`_core/index.ts`). Se alertas de SLA são necessários, verificar se esse módulo está sendo iniciado por outro caminho ou se precisa ser adicionado ao entrypoint.
