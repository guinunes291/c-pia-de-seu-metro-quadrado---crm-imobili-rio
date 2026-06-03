import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { CompareProvider } from "./contexts/CompareContext";
import { CopilotProvider } from "./contexts/CopilotContext";
import { AlertasNotification } from "./components/AlertasNotification";
import { CorretorNotifications } from "./components/CorretorNotifications";

// Páginas críticas — carregamento imediato (core do fluxo de vendas)
import Home from "./pages/Home";
const DashboardPage = lazy(() => import("./pages/Dashboard"));

// Páginas primárias — lazy loading para reduzir bundle inicial
const PerformancePage = lazy(() => import("@/features/performance/PerformancePage"));
const Leads = lazy(() => import("./pages/Leads"));
const Kanban = lazy(() => import("@/pages/Kanban"));
const CarteiraAtiva = lazy(() => import("@/pages/CarteiraAtiva"));
const TarefasDoDia = lazy(() => import("@/pages/TarefasDoDia"));
const ModoBlitz = lazy(() => import("@/pages/ModoBlitz"));
const Agendamentos = lazy(() => import("@/pages/Agendamentos"));
const MinhaAgenda = lazy(() => import("@/pages/MinhaAgenda"));
const MeuPainel = lazy(() => import("@/pages/MeuPainel"));
const MeuFollowUp = lazy(() => import("@/pages/meu-negocio/MeuFollowUp"));

// Páginas secundárias — lazy loading (não acessadas na maioria das sessões)
const Projetos = lazy(() => import("./pages/Projetos"));
const Relatorios = lazy(() => import("./pages/Relatorios"));
const Configuracoes = lazy(() => import("./pages/Configuracoes"));
const ImportarSheets = lazy(() => import("./pages/ImportarSheets"));
const ProjetoDetalhes = lazy(() => import("@/pages/ProjetoDetalhes"));
const ImportarProjetos = lazy(() => import("@/pages/ImportarProjetos"));
const Corretores = lazy(() => import("@/pages/Corretores"));
const MeuPerfil = lazy(() => import("@/pages/MeuPerfil"));
const ImportarCSV = lazy(() => import("@/pages/ImportarCSV"));
const ControleDistribuicao = lazy(() => import("@/pages/ControleDistribuicao"));
const Comissoes = lazy(() => import("@/pages/Comissoes"));
const TemplatesComissao = lazy(() => import("@/pages/TemplatesComissao"));
const Notificacoes = lazy(() => import("@/pages/Notificacoes"));
const LeadsPorCorretor = lazy(() => import("@/pages/LeadsPorCorretor"));
const Metas = lazy(() => import("@/pages/Metas"));
const MetasDiarias = lazy(() => import("@/pages/MetasDiarias"));
const Roleta = lazy(() => import("@/pages/Roleta"));
const HistoricoDistribuicao = lazy(() => import("@/pages/HistoricoDistribuicao"));
const BoasVindas = lazy(() => import("@/pages/BoasVindas"));
const RankingTV = lazy(() => import("@/pages/RankingTV"));
const PerformanceTV = lazy(() => import("@/pages/PerformanceTV"));
const Lixeira = lazy(() => import("@/pages/Lixeira"));
const HistoricoPresenca = lazy(() => import("@/pages/HistoricoPresenca"));
const AprovarProjetos = lazy(() => import("@/pages/AprovarProjetos"));
const Conquistas = lazy(() => import("@/pages/Conquistas"));
const GoogleSheetsSync = lazy(() => import("@/pages/GoogleSheetsSync"));
const SincronizacaoBI = lazy(() => import("@/pages/SincronizacaoBI"));
const Propostas = lazy(() => import("@/pages/Propostas"));
const AgendamentoPublico = lazy(() => import("@/pages/AgendamentoPublico"));
const ChatbotPublico = lazy(() => import("@/pages/ChatbotPublico"));
const PropostaPublica = lazy(() => import("@/pages/PropostaPublica"));
const CalendarioGestor = lazy(() => import("@/pages/CalendarioGestor"));
const ConfiguracaoWebhooks = lazy(() => import("@/pages/ConfiguracaoWebhooks"));
const ControleLimites = lazy(() => import("@/pages/ControleLimites"));
const ProjetoFoco = lazy(() => import("@/pages/ProjetoFoco"));
const MonitoramentoFollowUps = lazy(() => import("@/pages/MonitoramentoFollowUps"));
const LogTransferencias = lazy(() => import("@/pages/LogTransferencias"));
const GestaoEquipes = lazy(() => import("@/pages/GestaoEquipes"));
const MinhaEquipe = lazy(() => import("@/pages/MinhaEquipe"));
const LimpezaDuplicatas = lazy(() => import("@/pages/LimpezaDuplicatas"));
const AtualizarProjetosEmMassa = lazy(() => import("@/pages/AtualizarProjetosEmMassa"));
const LimparProjetosOrfaos = lazy(() => import("@/pages/LimparProjetosOrfaos"));
const RelatorioEscolhasDiarias = lazy(() => import("@/pages/RelatorioEscolhasDiarias"));
const ScriptsVendas = lazy(() => import("@/pages/ScriptsVendas"));
const CentralAlertas = lazy(() => import("@/pages/CentralAlertas"));
const BuscadorProjetos = lazy(() => import("@/pages/BuscadorProjetos"));
const GerenciarTabeloes = lazy(() => import("@/pages/GerenciarTabeloes"));
const GerenciarFAQ = lazy(() => import("@/pages/GerenciarFAQ"));
const MeuDashboard = lazy(() => import("@/pages/meu-negocio/MeuDashboard"));
const PreAnaliseMcmv = lazy(() => import("@/pages/meu-negocio/PreAnaliseMcmv"));
const ComoAvaliarMeuNegocio = lazy(() => import("@/pages/meu-negocio/ComoAvaliarMeuNegocio"));
const ModeFoco = lazy(() => import("@/pages/meu-negocio/ModeFoco"));
const OfertaAtiva = lazy(() => import("@/pages/OfertaAtiva"));
const NovaOfertaAtiva = lazy(() => import("@/pages/NovaOfertaAtiva"));
const KanbanOfertaAtiva = lazy(() => import("@/pages/KanbanOfertaAtiva"));
const SessoesOferta = lazy(() => import("@/pages/SessoesOferta"));
const DetalhesSessaoOferta = lazy(() => import("@/pages/DetalhesSessaoOferta"));
const LinksUteis = lazy(() => import("@/pages/LinksUteis"));
const GerenciarLinksUteis = lazy(() => import("@/pages/GerenciarLinksUteis"));
const CopaSMQ = lazy(() => import("@/pages/CopaSMQ"));

function PageLoader() {
  return (
    <div className="flex h-[60vh] items-center justify-center">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
  );
}



function Router() {
  return (
    <Suspense fallback={<PageLoader />}>
    <Switch>
      <Route path={"/"} component={Home} />
      <Route path={"/dashboard"} component={DashboardPage} />
      <Route path={"/performance"} component={PerformancePage} />
      <Route path="/projetos" component={Projetos} />
      <Route path="/aprovar-projetos" component={AprovarProjetos} />
      <Route path="/leads" component={Leads} />
      <Route path="/relatorios" component={Relatorios} />
      <Route path="/configuracoes" component={Configuracoes} />
      <Route path="/importar-sheets" component={ImportarSheets} />
      <Route path="/projetos/:id" component={ProjetoDetalhes} />
      <Route path="/importar-projetos" component={ImportarProjetos} />
      <Route path="/corretores" component={Corretores} />
      <Route path="/meu-painel" component={MeuPainel} />
      <Route path="/minha-performance">{() => { window.location.replace("/meu-painel"); return null; }}</Route>
      <Route path="/importar-csv" component={ImportarCSV} />
      <Route path="/controle-distribuicao" component={ControleDistribuicao} />
      <Route path="/comissoes" component={Comissoes} />
      <Route path="/templates-comissao" component={TemplatesComissao} />
      <Route path="/notificacoes" component={Notificacoes} />
      <Route path="/leads-por-corretor" component={LeadsPorCorretor} />
      <Route path="/kanban" component={Kanban} />
      <Route path="/metas" component={Metas} />
      <Route path="/agendamentos" component={Agendamentos} />
      <Route path="/roleta" component={Roleta} />
      <Route path="/historico-distribuicao" component={HistoricoDistribuicao} />
      <Route path="/boas-vindas" component={BoasVindas} />
      <Route path="/tarefas-do-dia" component={TarefasDoDia} />
      <Route path="/monitoramento-followups" component={MonitoramentoFollowUps} />
      <Route path="/relatorio-escolhas-diarias" component={RelatorioEscolhasDiarias} />

      <Route path="/modo-blitz" component={ModoBlitz} />
      <Route path="/ranking-tv" component={RankingTV} />
      <Route path="/performance-tv" component={PerformanceTV} />
      <Route path="/lixeira" component={Lixeira} />
      <Route path="/metas-diarias" component={MetasDiarias} />
      <Route path="/meu-perfil" component={MeuPerfil} />
      <Route path="/historico-presenca" component={HistoricoPresenca} />
      <Route path="/conquistas" component={Conquistas} />
      <Route path="/google-sheets-sync" component={GoogleSheetsSync} />
      <Route path="/sincronizacao-bi" component={SincronizacaoBI} />
      <Route path="/limpeza-duplicatas" component={LimpezaDuplicatas} />
      <Route path="/atualizar-projetos" component={AtualizarProjetosEmMassa} />
      <Route path="/limpar-projetos" component={LimparProjetosOrfaos} />
      <Route path="/minha-agenda" component={MinhaAgenda} />
      <Route path="/propostas" component={Propostas} />
      <Route path="/configuracao-webhooks" component={ConfiguracaoWebhooks} />
      <Route path="/controle-limites" component={ControleLimites} />
      <Route path="/projeto-foco" component={ProjetoFoco} />
      <Route path="/sistema/log-transferencias" component={LogTransferencias} />
      <Route path="/log-transferencias" component={LogTransferencias} />
      <Route path="/gestao-equipes" component={GestaoEquipes} />
      <Route path="/minha-equipe" component={MinhaEquipe} />
      <Route path="/carteira-ativa" component={CarteiraAtiva} />
      <Route path="/scripts" component={ScriptsVendas} />
      <Route path="/central-alertas" component={CentralAlertas} />
      <Route path="/buscador-projetos" component={BuscadorProjetos} />
      <Route path="/gerenciar-tabeloes" component={GerenciarTabeloes} />
      <Route path="/gerenciar-faq" component={GerenciarFAQ} />
      {/* Módulo Meu Negócio */}
      <Route path="/meu-negocio/dashboard" component={MeuDashboard} />
      <Route path="/meu-negocio/followup" component={MeuFollowUp} />
      <Route path="/meu-negocio/pre-analise" component={PreAnaliseMcmv} />
      <Route path="/meu-negocio/evolucao">{() => { window.location.replace("/meu-painel"); return null; }}</Route>
      <Route path="/meu-negocio/como-avaliar" component={ComoAvaliarMeuNegocio} />
      <Route path="/meu-negocio/foco" component={ModeFoco} />
      <Route path="/meu-negocio/relatorio-diario">{() => { window.location.replace("/meu-painel"); return null; }}</Route>

      {/* Oferta Ativa */}
      <Route path="/oferta-ativa" component={OfertaAtiva} />
      <Route path="/oferta-ativa/nova" component={NovaOfertaAtiva} />
      <Route path="/oferta-ativa/:id" component={KanbanOfertaAtiva} />
      <Route path="/sessoes-oferta" component={SessoesOferta} />
      <Route path="/sessoes-oferta/:id" component={DetalhesSessaoOferta} />
      {/* Copa SMQ */}
      <Route path="/copa-smq" component={CopaSMQ} />
      {/* Links Úteis */}
      <Route path="/links-uteis" component={LinksUteis} />
      <Route path="/gerenciar-links-uteis" component={GerenciarLinksUteis} />

      {/* Rotas Públicas */}
      <Route path="/agendar/:token" component={AgendamentoPublico} />
      <Route path="/chatbot" component={ChatbotPublico} />
      <Route path="/proposta/:token" component={PropostaPublica} />
      <Route path="/calendario-gestor" component={CalendarioGestor} />

      <Route path={"/404"} component={NotFound} />
      <Route component={NotFound} />
    </Switch>
    </Suspense>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light" switchable={true}>
        <CompareProvider>
          <CopilotProvider>
            <TooltipProvider>
              <Toaster />
              <Router />
              <AlertasNotification />
              <CorretorNotifications />
            </TooltipProvider>
          </CopilotProvider>
        </CompareProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
