# 🏗️ PROMPT MESTRE — Replicar CRM "Seu Metro Quadrado" no Lovable

> **Como usar este documento:**
> 1. Cole a seção **0 (Contexto Mestre)** + **1 (Stack)** + **2 (Identidade Visual)** + **3 (Papéis)** + **4 (Modelo de Dados Core)** na PRIMEIRA mensagem do Lovable. Isso cria a fundação.
> 2. Depois, construa **uma FASE por vez** (seções 6.1 a 6.5). Cole o bloco da fase, deixe o Lovable terminar, teste, e só então avance.
> 3. Nunca peça "construa tudo de uma vez" — o sistema é grande demais. Lovable trabalha melhor incremental.
> 4. As **Regras de Negócio (seção 5)** você cola junto com a fase relevante (ex.: regras de distribuição junto da Fase 1).

---

## 0. CONTEXTO MESTRE (cole sempre na primeira mensagem)

```
Você vai construir um CRM imobiliário completo chamado "Seu Metro Quadrado" (Seu m²),
voltado para venda de imóveis do programa Minha Casa Minha Vida (MCMV), com ticket
médio de R$150k a R$300k. A operação tem 16 a 30 corretores, recebe de 500 a 1.500
leads por mês (canal principal: Facebook/Instagram Ads), e a estrutura é mista
(equipes com gestor + corretores que reportam direto ao admin).

OBJETIVO DO PRODUTO: gerenciar o funil de vendas do lead à comissão, distribuir
leads automaticamente de forma justa, cobrar velocidade no primeiro contato
(meta < 5 min), dar visão gerencial em tempo real e gamificar a operação.

STACK OBRIGATÓRIA:
- Frontend: React + TypeScript + Vite + Tailwind CSS + shadcn/ui + Lucide icons + Recharts
- Backend: Supabase (Postgres + Row Level Security + Edge Functions + pg_cron)
- Auth: Supabase Auth (email/senha + Google OAuth)
- Idioma da interface: 100% Português do Brasil (pt-BR)
- PWA instalável (manifest + service worker + push notifications)

PRINCÍPIOS:
- Mobile-first (corretores usam muito no celular)
- Dark mode + light mode
- Type-safe ponta a ponta
- Todo dado financeiro em centavos (integer) ou DECIMAL(15,2) — nunca float
- Soft delete onde fizer sentido (campos `ativo`/`naLixeira` em vez de DELETE)
```

---

## 1. STACK & ARQUITETURA (mapeamento técnico)

| Sistema atual | Equivalente no Lovable/Supabase |
|---------------|--------------------------------|
| tRPC procedures | Supabase client + RLS + Edge Functions para lógica complexa |
| Drizzle ORM / TiDB | Postgres (Supabase) |
| `gestorProcedure` / `adminProcedure` | RLS policies por `role` na tabela `users` + helper `auth.uid()` |
| Cron jobs (setInterval) | **pg_cron** chamando Edge Functions |
| Webhooks de entrada (Facebook) | Edge Function pública com token de validação |
| Webhooks de saída (Zapier) | Edge Function + `net.http_post` ou trigger |
| WhatsApp (Z-API) | Edge Function chamando a API REST da Z-API |
| Upload de anexos (S3) | Supabase Storage (buckets) |
| Server-side cache | React Query (staleTime) no cliente + materialized views para métricas pesadas |

**Estrutura de pastas sugerida:**
```
src/
  pages/          → uma por rota
  components/     → componentes compartilhados + ui/ (shadcn)
  features/       → módulos (leads, dashboard, copa, comissoes...)
  lib/            → supabase client, utils, helpers
  hooks/          → useAuth, useRole, etc.
supabase/
  migrations/     → schema SQL
  functions/      → edge functions (distribuicao, webhooks, whatsapp, jobs)
```

---

## 2. IDENTIDADE VISUAL

```
Nome do app: Seu Metro Quadrado (nome curto: "Seu m²")
Categoria: CRM Imobiliário (MCMV)

PALETA (use CSS variables em OKLCH no index.css):
- Cor primária (Navy/Azul Marinho): oklch(0.32 0.06 250)  ≈ #1e3a5f
- Navy escuro: oklch(0.22 0.05 250)
- Cor de destaque (Dourado/Gold): oklch(0.72 0.12 85)  ≈ #c9a227
- Dourado claro: oklch(0.82 0.10 85)
- Destrutivo (vermelho): oklch(0.577 0.245 27.325)

LIGHT MODE:
- background: oklch(0.99 0.002 250)  (quase branco)
- foreground: oklch(0.22 0.05 250)   (navy escuro)
- card: branco; primary: navy; accent: dourado claro

DARK MODE:
- background: oklch(0.15 0.03 250)  (azul muito escuro)
- foreground: oklch(0.92 0.01 85)   (texto dourado claro)
- primary no dark: dourado oklch(0.72 0.12 85)

Border radius: 0.65rem (cantos médios arredondados)
Cores de gráfico: dourado + navy + variações de azul
Fonte: sans-serif (padrão Tailwind), títulos em negrito
Ícones: Lucide React
Toasts: Sonner
Theme toggle no topo da sidebar, default light.

PWA manifest:
- theme_color e background_color: #1e3a5f
- display: standalone, orientation: portrait
- atalhos: Meus Leads (/leads), Dashboard (/dashboard), Projetos (/projetos)
```

---

## 3. PAPÉIS & PERMISSÕES

```
4 PAPÉIS (campo `role` na tabela users):
1. corretor       — vê e gerencia APENAS os próprios leads, agenda, comissões
2. gestor         — gerencia corretores da sua equipe; vê analytics, transfere leads, relatórios da equipe
3. superintendente — nível admin para visão da empresa toda
4. admin          — acesso total + exportação de dados + configurações do sistema

Implemente com Supabase RLS. Crie uma função helper:
  CREATE FUNCTION user_role() RETURNS text AS $$
    SELECT role FROM users WHERE id = auth.uid()
  $$ LANGUAGE sql STABLE SECURITY DEFINER;

REGRAS RLS POR TABELA (padrão):
- leads: corretor vê WHERE corretorId = auth.uid(); gestor vê leads dos corretores da sua equipeId; admin/superintendente vê tudo.
- contratos/comissoes: corretor vê os próprios; gestor vê da equipe; admin vê tudo.
- users: corretor vê o próprio perfil; gestor vê a equipe; admin gerencia todos.
- Tabelas de config (webhooks, templates, distribuição): apenas admin escreve.

Status do corretor (campo `status`): "presente" | "ausente" — controla elegibilidade
para receber leads (só recebe quem está "presente").
Situação (campo `situacao`): "ativo" | "inativo" — corretor inativo não opera.
```

---

## 4. MODELO DE DADOS — NÚCLEO (Fase 1)

> Estas são as tabelas essenciais para o MVP. As demais (gamificação, propostas, materiais)
> ficam nas fases seguintes. Crie como migration SQL no Supabase.

### 4.1 — users
```
id (uuid, default auth.uid no signup OU bigint identity), openId, name, email,
role: enum('admin','superintendente','gestor','corretor') default 'corretor',
status: enum('presente','ausente') default 'ausente',
situacao: enum('ativo','inativo') default 'ativo',
telefone, fotoUrl, cpf, dataNascimento, creci,
equipeId (FK equipes), indicadoPorId (FK users), codigoIndicacao (unique),
limiteDiarioLeads int default 50, limiteDiarioWebhook int default 10,
perfilCompleto bool default false, acessaLinksUteis bool default false,
googleCalendarId, googleRefreshToken, googleCalendarEnabled bool,
endereco (logradouro,numero,complemento,bairro,cidade,estado,cep),
createdAt, updatedAt, lastSignedIn
```

### 4.2 — equipes
```
id, nome, descricao, gestorId (FK users), superintendenteId (FK users),
cor varchar(7) default '#3b82f6', metaMensal int default 10, ativa bool default true,
createdAt, updatedAt
```

### 4.3 — projects (empreendimentos)
```
id, nome, construtora, construtoraId (FK), endereco, bairro,
cidade default 'São Paulo', estado default 'SP', descricao,
tipo: enum('mcmv','sfh','outro') default 'mcmv',
status: enum('ativo','inativo','esgotado') default 'ativo',
valorMinimo int (centavos), valorMaximo int (centavos),
metragemMinima int, metragemMaxima int, dormitorios varchar (ex "2,3"), vagas int,
zona: enum('norte','sul','leste','oeste','centro'),
enquadramento: enum('HIS1','HIS2','HMP','R2V'),
logoUrl, imagemCapaUrl, imagemPrincipal, imagensAdicionais (json),
bookPdfUrl, bookUrl, linkMateriais (json), regiao, latitude, longitude,
createdAt, updatedAt
```

### 4.4 — properties (unidades)
```
id, projectId (FK), unidade, bloco, andar, metragem, dormitorios, banheiros, vagas,
valor int (centavos), status: enum('disponivel','reservado','vendido') default 'disponivel',
createdAt, updatedAt
```

### 4.5 — leads (TABELA CENTRAL — a mais importante)
```
id, idPrincipal (unique, id de origem),
nome NOT NULL, email, telefone NOT NULL, cpf,
origem: enum('facebook','google_sheets','site','indicacao','captacao_corretor',
             'whatsapp','telefone','plantao','agendamento_self_service','chatbot','outro'),
projectId (FK), projetoCustom (texto livre),
corretorId (FK users), dataDistribuicao, timestampRecebimento,
timerAtivo bool default false,   -- timer de 5 min para leads Facebook
tentativasRedistribuicao int default 0,
status: enum('novo','aguardando_atendimento','em_atendimento','qualificado','agendado',
             'visita_realizada','proposta_enviada','analise_credito','contrato_fechado',
             'pos_venda','perdido') default 'novo',
temperatura: enum('quente','morno','frio'),  -- null = não classificado
proximoFollowup, diasFollowupConsecutivos int, ultimoContato, ultimaInteracao,
primeiroContatoEm, tempoAtePrimeiroContato int (minutos),
-- Triagem MCMV:
possuiImovel bool, numDependentes int, rendaFamiliar varchar, composicaoRenda (json),
rendaInformada, usaFgts bool default false, entradaDisponivel, faixaRenda,
-- Origem/marketing:
campanha, utmSource, utmMedium, utmCampaign, utmContent, utmTerm, origemWebhook bool,
-- Observações e perda:
observacoes, motivoPerdido, motivoPerdaCategoria,
-- Lixeira e atribuição:
naLixeira bool default false, dataMovidoLixeira,
corretorAnteriorId, corretoresQueTentaram (json array de ids),
transferidoManualmentePorAdmin bool default false,
tipoFilaOrigem: enum('geral','foco') default 'geral',
createdAt, updatedAt
```

### 4.6 — leadHistory (histórico de interações)
```
id, leadId (FK), corretorId (FK),
tipo: enum('ligacao','whatsapp','email','sms','visita','outro'),
resultado: enum('contato_realizado','nao_atendeu','agendamento','visita_realizada',
                'proposta_enviada','recusou','outro'),
observacoes, statusAnterior, statusNovo, createdAt
```

### 4.7 — leadStatusTransitions (métricas do funil — log de cada mudança)
```
id, leadId (FK), corretorId (FK),
statusAnterior (enum status), statusNovo (enum status), observacao, createdAt
```

### 4.8 — Distribuição (3 tabelas)
```
filaDistribuicao: id, corretorId (FK, unique), posicao int, ativo bool default true,
  maxLeadsDia int default 10, leadsRecebidosHoje int default 0, ultimaDistribuicao, timestamps

distributionLog: id, leadId (FK), corretorId (FK),
  tipo: enum('automatica','manual','inicial'), motivo, distribuidoPorId (FK), createdAt

leadEstoque: id, leadId (FK), tipoFila: enum('normal','foco') default 'normal',
  motivoEstoque, tentativasDistribuicao int, ultimaTentativa,
  status: enum('aguardando','distribuido','cancelado') default 'aguardando',
  criadoEm, distribuidoEm, distribuidoParaCorretorId
```

### 4.9 — agendamentos & visitas
```
agendamentos: id, leadId (FK), corretorId (FK), projectId (FK), projetoCustom, construtora,
  dataAgendamento NOT NULL, horaAgendamento varchar(5),
  status: enum('pendente','confirmado','realizado','cancelado','reagendado','nao_compareceu'),
  naoCompareceu bool, motivoNaoCompareceu, observacoes, criadoPorId, timestamps

visitas: id, leadId (FK), corretorId (FK), agendamentoId (FK), projectId (FK), projetoCustom,
  construtora, dataVisita NOT NULL, horaVisita varchar(5),
  resultado: enum('interesse_alto','interesse_medio','interesse_baixo','sem_interesse',
                  'pendente_documentacao','encaminhado_analise'),
  observacoes, registradoPorId, timestamps
```

---

## 5. REGRAS DE NEGÓCIO CRÍTICAS

> Cole a regra junto da fase relevante. Estas são o "cérebro" do sistema.

### 5.1 — Distribuição automática de leads (Edge Function + pg_cron a cada 10 min)
```
ELEGIBILIDADE: um corretor só recebe leads novos quando:
  - status = 'presente' (online), E
  - 90%+ dos leads dele NÃO estão em 'aguardando_atendimento' (ou seja, ≤10% esperando),
  - corretor com 0 leads é sempre elegível.

ALGORITMO:
  - Round-robin entre corretores elegíveis, priorizando os de maior taxa de conversão
    (por projeto > por região > geral).
  - Lote de até 30 leads por corretor por rodada.
  - Se NÃO houver corretor elegível, o lead vai para `leadEstoque` (status 'aguardando')
    e é reprocessado a cada 5 min.
  - Cooldown: lead distribuído nas últimas 8h não é redistribuído.
  - Todo movimento gravado em `distributionLog`.

LEADS FACEBOOK/ADS (origem facebook + origemWebhook=true):
  - Ao chegar, recebem timerAtivo=true e janela de 5 minutos para o corretor agir.
  - Job a cada 1 min desativa o timer expirado (apenas vira a flag, NÃO redistribui).
  - Meta de negócio: primeiro contato em < 5 minutos.

REDISTRIBUIÇÃO POR INATIVIDADE (job diário à meia-noite):
  - Lead 'em_atendimento' há 48h+ sem `ultimaInteracao` → transfere para próximo corretor
    elegível (round-robin). Se não houver ninguém → status 'perdido' + lixeira.
  - EXCEÇÃO: origem 'captacao_corretor' (lead próprio) nunca é auto-transferido.
  - EXCEÇÃO: transferidoManualmentePorAdmin=true é protegido.
  - Grava em `logTransferencias` e `historicoAtribuicoes`.
```

### 5.2 — Temperatura do lead (calculada)
```
quente: contato recente (< 24h) ou engajamento ativo / agendamento próximo
morno:  1 a 7 dias desde o último contato, ou meio do funil
frio:   > 7 dias sem contato
(null = não classificado). Pode ser setada manualmente pelo corretor também.
```

### 5.3 — Leads frios auto-perdidos (job diário 2h da manhã)
```
Lead com 30+ dias sem contato → status='perdido', motivoPerdaCategoria='sem_retorno'.
```

### 5.4 — Contrato / VGV
```
Ao mover lead para 'contrato_fechado', abrir MODAL para registrar a venda:
  empreendimento, unidade, valorVenda (VGV), data, anexos.
Cria registro em `contratos`. VGV = soma de valorVenda dos contratos com distrato=false.
Distrato: flag booleana que anula o contrato (não conta no VGV nem na comissão).
```

### 5.5 — Comissões
```
Percentuais padrão (configuráveis por template/projeto):
  imobiliária 3.50% | corretor 1.85% | gerente 0.50% | superintendente 0.30%
valorComissao = valorBase × percentual; valorLiquido = valorComissao − desconto.
Status: 'pendente_assinatura' → 'a_pagar' → 'paga'.
Contratos com distrato=true são EXCLUÍDOS do cálculo.
Tipos de comissão separados: corretor, gerente, superintendente.
```

### 5.6 — Pontuação / Atividades (gamificação base)
```
Cada atividade do corretor por dia gera pontos (tabela atividadesDiarias):
  ligação atendida = 2pts | WhatsApp = 1pt | agendamento = 100pts
  visita = 250pts | análise de crédito = 400pts | venda = 1000pts
(valores configuráveis em configuracaoPontuacao). Recalculado por job a cada 6h.
Streak = dias consecutivos com pelo menos 1 atividade.
```

### 5.7 — Copa SMQ (gamificação avançada — estilo Copa do Mundo)
```
Competição de 8 semanas. Corretores são distribuídos em "seleções" (países).
Fases: Fase de Grupos → Oitavas → Quartas → Semis → Disputa 3º → Final.
Pontuação Copa (diferente da diária): agendamento=25, visita=40, documentação=60, venda=150.
Admin pode adicionar pontos manuais. Ranking em tempo real, medalhas 🥇🥈🥉.
```

---

## 6. PLANO DE CONSTRUÇÃO FASEADO

> Construa UMA fase por vez. Teste antes de avançar.

### FASE 1 — Fundação + Funil de Leads (MVP)
```
Construa o núcleo do CRM:

1. Auth (Supabase Auth: email/senha + Google) com 4 papéis e RLS conforme seção 3.
2. Layout principal: sidebar colapsável com grupos de menu que mudam por papel,
   theme toggle (dark/light), header com perfil do usuário.
3. Tabelas core (seção 4): users, equipes, projects, properties, leads, leadHistory,
   leadStatusTransitions, filaDistribuicao, distributionLog, leadEstoque,
   agendamentos, visitas.
4. Página /leads — lista central com:
   - Tabela paginada (50/página), busca por nome/telefone/email,
   - Filtros: status, projeto, origem, corretor, temperatura, período,
   - Badge de temperatura e timer de urgência,
   - Ações por lead: registrar interação, agendar, registrar visita, enviar proposta,
     registrar análise de crédito, fechar contrato, marcar perdido (com motivo OBRIGATÓRIO),
     transferir corretor, link WhatsApp (wa.me).
   - Modais: RegistrarVisita, FecharContrato, RegistrarAnaliseCredito, EscolhaFollowUp.
5. Página /kanban — quadro com colunas por status do funil (11 etapas), drag-and-drop
   que atualiza o status (gravando em leadStatusTransitions), cor por temperatura.
6. Detalhe do lead — aba Resumo (dados + triagem MCMV: possuiImovel, numDependentes,
   rendaFamiliar), aba Histórico (timeline de leadHistory + transições + agendamentos +
   visitas), anotação rápida (1 clique, salva com Enter), badge de temperatura clicável,
   botão WhatsApp.
7. Distribuição automática (seção 5.1) como Edge Function + pg_cron.

Funil (11 etapas, nesta ordem):
novo → aguardando_atendimento → em_atendimento → qualificado → agendado →
visita_realizada → proposta_enviada → analise_credito → contrato_fechado →
pos_venda | perdido

REGRA: ao marcar 'perdido', abrir modal obrigatório de motivo (categorias:
sem_renda, imovel_proprio, nao_tem_entrada, banco_reprovou, desistiu, sem_retorno,
concorrente, outro). Não permite fechar sem selecionar.
```

### FASE 2 — Dashboard Gerencial + Agenda
```
1. Dashboard do GESTOR/ADMIN (leitura em 30 segundos, ordem de cima para baixo):
   ZONA 1 - Alertas críticos: corretores sem atividade hoje, leads sem 1º contato >30min,
            follow-ups vencidos, agendamentos sem confirmação.
   ZONA 2 - Visão executiva (5 KPIs do dia): leads recebidos hoje, atendidos hoje (%),
            tempo médio 1º contato (meta 5 min), VGV do mês, contratos no mês.
   ZONA 3 - Funil em 8 cards compactos numa linha (cada um com nº + % do total), clicáveis.
   ZONA 4 - Banner VGV em destaque (verde, com ticket médio) + Pipeline por Corretor
            (tabela: leads, agendamentos, visitas, análise, contratos, VGV) ao lado de
            uma lista compacta de Alertas do Time.
   ZONA 5 - Accordion "Análise Detalhada": VGV por equipe, gráficos históricos,
            leads parados, motivos de perda, redistribuições.
   Filtros de período no topo (hoje/semana/mês/ano/custom).

2. Dashboard do CORRETOR (/meu-painel): métricas pessoais (diário/mensal), funil pessoal,
   progresso vs meta, leads recentes, próximos agendamentos, status de comissão.

3. /agendamentos — gestão de agenda da equipe (calendário + lista), filtros, confirmar/
   cancelar, lembrete WhatsApp, marcar realizado.

4. /minha-agenda — agenda pessoal do corretor + criação de LINKS PÚBLICOS de agendamento
   (/agendar/:token com expiração configurável), disponibilidades (horários de trabalho),
   bloqueios (férias/folga). Tabelas: disponibilidadeCorretor, bloqueiosAgenda, linksAgendamento.

5. Página pública /agendar/:token (sem auth) — cliente escolhe horário disponível.
```

### FASE 3 — Vendas, Comissões & Propostas
```
1. Tabelas: contratos, comissoes, templatesComissao, documentacoes, analises_credito,
   followUps, tarefas, transferHistory, logTransferencias, historicoAtribuicoes.

2. /comissoes — abas Comissões e Distratos. Tabela: cliente, imóvel, data, valor contrato,
   % comissão, valor, status. Ações: marcar pago, registrar distrato (com motivo).
   Corretor vê as próprias; gestor vê da equipe; admin vê tudo. Regras na seção 5.5.

3. /propostas — propostas digitais interativas:
   Tabela `propostas` (criar conforme cluster de propostas do anexo A).
   Criar proposta: lead, projeto, tabela de parcelas (financiamento, FGTS, subsídio,
   entrada, mensais), upload de imagens/plantas. Link público /proposta/:token que o
   cliente abre (rastreia visualizações, aceite com assinatura digital).
   Status: rascunho → enviada → visualizada → aceita/recusada/expirada.

4. Tarefas do dia (/tarefas-do-dia) e Follow-ups: sistema de follow-up de 1 dia
   (escolha diária: aceita follow-up = trava o lead; recusa = risco de transferência).

5. Modal de fechar contrato (seção 5.4) integrado ao /leads e /kanban.
```

### FASE 4 — Gamificação + Produtividade
```
1. Tabelas: atividadesDiarias, metas, metasDiarias, configuracaoPontuacao,
   conquistas, tiposConquista, blitzSessoes, alertasProdutividade.

2. Jobs (pg_cron + Edge Functions):
   - pontuacaoJob (a cada 6h): recalcula atividadesDiarias (pontuação seção 5.6).
   - conquistasJob (a cada 4h): verifica e concede conquistas/badges.
   - metricasSyncJob (a cada 30min): consolida métricas para Ranking TV e Dashboard.
   - resetContadoresJob (meia-noite): zera contadores diários.

3. /ranking-tv — tela para TV: ranking animado em tempo real, com efeitos sonoros
   (Web Audio API, fanfarra na mudança de posição), métricas VGV/agendamentos/visitas/
   documentação/vendas, auto-refresh 10-30s, toggle de som.

4. /copa-smq — Copa SMQ (seção 5.7): seleções, fases tipo Copa do Mundo, confrontos,
   ranking com medalhas, painel admin para adicionar pontos e configurar fases.

5. /modo-blitz — interface de ligação rápida: carrega leads em sequência, scripts
   dinâmicos por etapa do funil, dicas por etapa, botões de ação rápida (ligar, agendar,
   visita, proposta, perdido), timer de idade do lead, registra sessão em blitzSessoes.

6. /metas e /metas-diarias — gestão de metas mensais e diárias por corretor.
```

### FASE 5 — Automação, Integrações & Conteúdo
```
1. INTEGRAÇÕES (Edge Functions):
   - Webhook de ENTRADA Facebook/Instagram: Edge Function pública com token de validação
     (tabela webhookConfig). Recebe lead do Meta Lead Ads, cria lead com origem='facebook',
     origemWebhook=true, timerAtivo=true, e dispara distribuição.
   - Webhook de SAÍDA (Zapier/n8n): eventos lead.created, lead.status_changed,
     agendamento.created, proposta.aceita, venda.fechada → POST para URL configurável.
   - WhatsApp via Z-API: Edge Function que envia mensagem ao corretor quando ele recebe
     um lead novo (NÃO inclui telefone do cliente na mensagem). Credenciais via secrets do
     Supabase (ZAPI_INSTANCE_ID, ZAPI_TOKEN, ZAPI_CLIENT_TOKEN) — NUNCA hardcoded.
     Mensagem: "🔥 Novo lead recebido! 👤 Nome / 🏠 Projeto / 📣 Origem / 👉 link para o CRM /
     Responda em até 5 minutos."
   - Meta Conversions API: envia eventos de conversão (Lead, Schedule, Purchase) ao Pixel,
     com email/telefone hasheados.

2. CHATBOT público (/chatbot, sem auth): qualifica visitante (renda, entrada, prazo),
   tabelas conversasChatbot + faqChatbot, converte em lead. Knowledge base com FAQ.

3. PORTAL DE MATERIAIS: tabelas construtoras, tabeloes (tabelas de preço mensais),
   materiais (books/fotos/plantas), historicosPrecos. Página /projetos/:id com book e materiais.

4. CARTEIRA ATIVA (/carteira-ativa) e OFERTA ATIVA (/oferta-ativa): gestão de portfólio
   protegido (carteiraAtiva: proteção de 15 dias + renovações) e campanhas de oferta em
   Kanban (ofertaAtiva + itemOfertaAtiva com status ofertar/tratando/agendou/sem_retorno/perdido).

5. NOTIFICAÇÕES: sino no header com contador (tabela notifications + alertas),
   push notifications (pushSubscriptions), central de alertas (/central-alertas).

6. SCRIPTS DE VENDAS (/scripts): biblioteca por categoria (scriptsVendas + objecoesPlaybook),
   drawer no detalhe do lead filtrado pela etapa atual.

7. ADMIN: /controle-distribuicao, /controle-limites, /roleta, /projeto-foco,
   /gestao-equipes, /configuracao-webhooks, /relatorios (exportação CSV),
   /importar-csv, /importar-sheets, /lixeira.
```

---

## ANEXO A — Tabelas secundárias (referência para Fases 3-5)

> Quando o Lovable precisar do schema completo de uma tabela secundária, copie daqui.

**propostas:** id, leadId, corretorId, projectId, token (unique), nomeCliente, emailCliente, telefoneCliente, unidade, tipologia, metragem, valorImovel, valorEntrada, valorFinanciamento, parcelas, valorParcela, taxaJuros, desconto, motivoDesconto, mensagemPersonalizada, tabelaPagamento (json), imagensSelecionadas (json), plantasSelecionadas (json), videos (json), validoAte, status enum('rascunho','enviada','visualizada','aceita','recusada','expirada'), visualizacoes, primeiraVisualizacao, ultimaVisualizacao, aceiteEm, ipAceite, assinaturaDigital, pdfUrl, timestamps

**contratos:** id, leadId, corretorId, valorVenda DECIMAL(15,2), percentualComissao DECIMAL(5,2) default 3.50, percentualCorretor default 1.85, percentualGerente default 0.50, percentualSuperintendente default 0.30, anexos (json), statusRecebimentoImobiliaria default 'pendente', dataRecebimentoImobiliaria, distrato bool default false, dataDistrato, motivoDistrato, distratadoPorId, observacoes, createdAt

**comissoes:** id, contratoId, usuarioId, tipo enum('corretor','gerente','superintendente'), valorBase DECIMAL(15,2), percentual DECIMAL(5,2), valorComissao DECIMAL(15,2), percentualDesconto default 0, valorLiquido DECIMAL(15,2), status enum('pendente_assinatura','a_pagar','paga'), dataPagamento, comprovantePagamento, observacoes, timestamps

**atividadesDiarias:** id, corretorId, data, clientesCadastrados, alteracoesStatus, ligacoesRealizadas, ligacoesAtendidas, whatsappEnviados, whatsappRespondidos, agendamentosConfirmados, visitasRealizadas, propostasEnviadas, analiseCreditoEnviadas, contratosFechados, vgvDia (centavos), pontuacaoTotal, timestamps

**metas:** id, corretorId, mes (1-12), ano, metaLeads, metaAgendamentos, metaVisitas, metaContratos, metaVGV (centavos), observacoes, timestamps

**followUps:** id, leadId, corretorId, dataFollowUp, dataRegistro, resultado enum('respondeu','nao_respondeu'), observacao, status enum('pendente','concluido','cancelado'), timestamps

**tarefas:** id, corretorId, leadId, titulo, descricao, tipo enum('follow_up','agendamento','ligacao','whatsapp','email','visita','documentacao','outro'), dataAgendada, status enum('pendente','concluida','cancelada'), prioridade enum('baixa','media','alta'), concluidaEm, observacoesConclusao, timestamps

**conquistas / tiposConquista:** tiposConquista(id, codigo unique, nome, descricao, icone, cor, categoria enum('vendas','produtividade','streak','especial'), criterioTipo, criterioValor, ativo, recorrente); conquistas(id, corretorId, tipoConquistaId, periodoInicio, periodoFim, valor, posicao, observacao, notificado, createdAt)

**webhookConfig:** id, webhookToken (unique), nome, fonte enum('facebook','instagram','google','rdstation','outro'), tipoFila enum('geral','foco'), projectIdPadrao, formIdMapping (json), ativo, leadsRecebidos, ultimoLeadRecebido, timestamps

**carteiraAtiva:** id, leadId, corretorId, protecaoAte, renovacoes, observacao, notificadoExpiracao, ativo, timestamps

**ofertaAtiva / itemOfertaAtiva:** ofertaAtiva(id, nome, descricao, corretorId, criadoPorId, sessaoId, status, filtros json, totalLeads, totalContatados, totalAvancados, timestamps); itemOfertaAtiva(id, ofertaId, leadId, statusKanban enum('ofertar','tratando','agendou','sem_retorno','perdido'), agendamentoId, observacao, contatadoEm, ordem, createdAt)

**notifications:** id, userId, titulo, mensagem, tipo enum('lead_recebido','follow_up','sistema','alerta'), leadId, lida, lidaEm, createdAt

**scriptsVendas:** id, titulo, conteudo, categoria enum('primeiro_contato','agendamento','pos_visita','objecao_preco','objecao_documentacao','objecao_credito','nao_compareceu','reativacao','fechamento','outro'), tipo enum('whatsapp','telefone','email'), ativo, ordem, criadoPorId, timestamps

**construtoras / tabeloes / materiais:** construtoras(id, nome, logoUrl, ativo, timestamps); tabeloes(id, construtoraId, mes, ano, drivePdfUrl, s3PdfUrl, statusProcessamento, totalProjetos, timestamps); materiais(id, projetoId, tipo enum('book','foto','tabela','outro'), nome, s3Url, mimeType, tamanho, createdAt)

> Lista completa de 81 tabelas disponível no schema original — peça ao Lovable as demais
> (chatbot, presença, indicações, BI) conforme for chegando nas funcionalidades.

---

## ANEXO B — Inventário de páginas (72+ rotas)

```
PÚBLICAS: /agendar/:token, /proposta/:token, /chatbot
HOME: / (redireciona corretor→/meu-painel, demais→/dashboard)
LEADS: /leads, /kanban, /agendamentos, /minha-agenda, /carteira-ativa, /tarefas-do-dia,
       /propostas, /leads-por-corretor, /modo-blitz, /scripts, /notificacoes
PROJETOS: /projetos, /projetos/:id, /buscador-projetos, /importar-projetos
PERFORMANCE: /dashboard, /meu-painel, /ranking-tv, /performance-tv, /copa-smq, /conquistas,
       /metas, /metas-diarias, /meu-perfil
MEU NEGÓCIO: /meu-negocio/dashboard, /meu-negocio/followup, /meu-negocio/pre-analise,
       /meu-negocio/foco, /meu-negocio/como-avaliar
GESTÃO: /minha-equipe, /central-alertas, /monitoramento-followups, /corretores,
       /gestao-equipes, /controle-distribuicao, /controle-limites, /roleta, /projeto-foco,
       /calendario-gestor, /comissoes, /historico-distribuicao, /historico-presenca
OFERTA: /oferta-ativa, /oferta-ativa/nova, /oferta-ativa/:id, /sessoes-oferta
SISTEMA: /relatorios, /configuracoes, /google-sheets-sync, /sincronizacao-bi,
       /configuracao-webhooks, /links-uteis, /importar-csv, /importar-sheets, /lixeira,
       /limpeza-duplicatas, /boas-vindas
```
```
```
```

---

### ⚠️ Avisos importantes ao construir no Lovable

1. **Segredos NUNCA no código.** Z-API, Meta, chaves → use **Supabase Secrets** / env vars.
2. **Comece pequeno.** Fase 1 já é um CRM funcional. Não tente as 5 fases de uma vez.
3. **Migrations idempotentes.** Use `CREATE TABLE IF NOT EXISTS` e `ADD COLUMN IF NOT EXISTS`.
4. **RLS desde o início.** Configure as policies por papel ANTES de popular dados.
5. **Valores financeiros** sempre em centavos (int) ou DECIMAL(15,2). Nunca float.
6. **Jobs** = pg_cron chamando Edge Functions (não há servidor Node persistente no Lovable).
7. Quando o Lovable "esquecer" o contexto, recole a seção 0 (Contexto Mestre).
```
