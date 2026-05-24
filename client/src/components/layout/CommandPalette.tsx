import { useEffect, useState, useCallback } from "react";
import { useLocation } from "wouter";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  LayoutDashboard,
  Users,
  Kanban,
  CalendarCheck,
  FileText,
  BarChart3,
  Building2,
  Settings,
  ClipboardList,
  Target,
  Zap,
  Phone,
  Shield,
  Trophy,
  Tv,
  MessageCircle,
  AlertTriangle,
  Bot,
  Shuffle,
  Users2,
  History,
  DollarSign,
  Megaphone,
  ExternalLink,
  Calendar,
} from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";

interface CommandItem {
  label: string;
  icon: React.ElementType;
  path: string;
  group: string;
  roles?: string[];
  keywords?: string[];
}

const ALL_COMMANDS: CommandItem[] = [
  // Dashboard
  { label: "Dashboard", icon: LayoutDashboard, path: "/dashboard", group: "Início", keywords: ["inicio", "home"] },
  { label: "Tarefas do Dia", icon: ClipboardList, path: "/tarefas-do-dia", group: "Início", roles: ["corretor"] },
  { label: "Meu Painel", icon: BarChart3, path: "/meu-painel", group: "Início" },
  { label: "Central de Alertas", icon: AlertTriangle, path: "/central-alertas", group: "Início" },

  // Leads
  { label: "Todos os Leads", icon: Users, path: "/leads", group: "Leads", keywords: ["leads", "clientes"] },
  { label: "Kanban", icon: Kanban, path: "/kanban", group: "Leads", keywords: ["pipeline", "funil"] },
  { label: "Carteira Ativa", icon: Shield, path: "/carteira-ativa", group: "Leads" },
  { label: "Modo Blitz", icon: Zap, path: "/modo-blitz", group: "Leads", roles: ["corretor"] },

  // Agenda
  { label: "Agendamentos", icon: CalendarCheck, path: "/agendamentos", group: "Agenda" },
  { label: "Minha Agenda", icon: Calendar, path: "/minha-agenda", group: "Agenda", roles: ["corretor"] },
  { label: "Calendário Geral", icon: Calendar, path: "/calendario-gestor", group: "Agenda", roles: ["gestor", "admin", "superintendente"] },

  // Performance
  { label: "Follow-up", icon: Phone, path: "/meu-negocio/followup", group: "Performance", roles: ["corretor"] },
  { label: "Propostas", icon: FileText, path: "/propostas", group: "Performance" },
  { label: "Relatórios", icon: BarChart3, path: "/relatorios", group: "Performance" },
  { label: "Ranking TV", icon: Trophy, path: "/ranking-tv", group: "Performance", roles: ["gestor", "admin", "superintendente"] },
  { label: "Performance TV", icon: Tv, path: "/performance-tv", group: "Performance", roles: ["gestor", "admin", "superintendente"] },
  { label: "Monitoramento Follow-ups", icon: MessageCircle, path: "/monitoramento-followups", group: "Performance" },

  // Projetos
  { label: "Catálogo de Projetos", icon: Building2, path: "/projetos", group: "Projetos", keywords: ["empreendimentos"] },
  { label: "Buscador IA", icon: Bot, path: "/buscador-projetos", group: "Projetos", keywords: ["busca", "ia"] },

  // Equipe (gestores)
  { label: "Corretores", icon: Users2, path: "/corretores", group: "Equipe", roles: ["gestor", "admin", "superintendente"] },
  { label: "Minha Equipe", icon: Users2, path: "/minha-equipe", group: "Equipe", roles: ["gestor"] },
  { label: "Gestão de Equipes", icon: Users2, path: "/gestao-equipes", group: "Equipe", roles: ["admin", "superintendente"] },
  { label: "Metas Mensais", icon: Target, path: "/metas", group: "Equipe", roles: ["admin", "superintendente"] },
  { label: "Metas Diárias", icon: Target, path: "/metas-diarias", group: "Equipe", roles: ["admin", "superintendente"] },

  // Negócios
  { label: "Comissões", icon: DollarSign, path: "/comissoes", group: "Negócios" },
  { label: "Oferta Ativa", icon: Megaphone, path: "/oferta-ativa", group: "Negócios" },
  { label: "Links Úteis", icon: ExternalLink, path: "/links-uteis", group: "Negócios" },
  { label: "Scripts de Vendas", icon: MessageCircle, path: "/scripts", group: "Negócios" },

  // Sistema (admin)
  { label: "Distribuição de Leads", icon: Shuffle, path: "/controle-distribuicao", group: "Sistema", roles: ["admin"] },
  { label: "Histórico Distribuição", icon: History, path: "/historico-distribuicao", group: "Sistema", roles: ["admin"] },
  { label: "Roleta de Leads", icon: Shuffle, path: "/roleta", group: "Sistema", roles: ["admin"] },
  { label: "Configurações", icon: Settings, path: "/configuracoes", group: "Sistema" },
  { label: "Pré-Análise MCMV", icon: ClipboardList, path: "/meu-negocio/pre-analise", group: "Ferramentas", roles: ["corretor"] },
];

function filterForRole(role: string): CommandItem[] {
  return ALL_COMMANDS.filter((cmd) => {
    if (!cmd.roles) return true;
    return cmd.roles.includes(role);
  });
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [, setLocation] = useLocation();
  const { user } = useAuth();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const navigate = useCallback(
    (path: string) => {
      setLocation(path);
      setOpen(false);
    },
    [setLocation],
  );

  const role = user?.role ?? "corretor";
  const commands = filterForRole(role);

  // Group commands
  const grouped = commands.reduce<Record<string, CommandItem[]>>((acc, cmd) => {
    if (!acc[cmd.group]) acc[cmd.group] = [];
    acc[cmd.group].push(cmd);
    return acc;
  }, {});

  const groupOrder = ["Início", "Leads", "Agenda", "Performance", "Projetos", "Negócios", "Equipe", "Ferramentas", "Sistema"];

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Buscar páginas, ações..." />
      <CommandList>
        <CommandEmpty>Nenhum resultado encontrado.</CommandEmpty>
        {groupOrder.map((groupName, idx) => {
          const items = grouped[groupName];
          if (!items?.length) return null;
          return (
            <div key={groupName}>
              {idx > 0 && <CommandSeparator />}
              <CommandGroup heading={groupName}>
                {items.map((cmd) => {
                  const Icon = cmd.icon;
                  return (
                    <CommandItem
                      key={cmd.path}
                      value={`${cmd.label} ${cmd.keywords?.join(" ") ?? ""}`}
                      onSelect={() => navigate(cmd.path)}
                      className="flex cursor-pointer items-center gap-2"
                    >
                      <Icon className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                      {cmd.label}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </div>
          );
        })}
      </CommandList>
    </CommandDialog>
  );
}
