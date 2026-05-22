import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { useLocation } from "wouter";
import { Trophy, TrendingUp, BarChart3 } from "lucide-react";
import MinhaPerformance from "@/pages/MinhaPerformance";

// ============================================================================
// PERFORMANCE PARA GESTOR / ADMIN / SUPERINTENDENTE
// ============================================================================
function PerformanceGestor() {
  const [, navigate] = useLocation();

  const atalhos = [
    {
      icon: Trophy,
      label: "Corrida dos Campeões",
      descricao: "Ranking em tempo real da equipe",
      path: "/ranking-tv",
      cor: "text-amber-600",
      bg: "bg-amber-50 hover:bg-amber-100 border-amber-200",
    },
    {
      icon: TrendingUp,
      label: "Meu Painel",
      descricao: "Métricas individuais e metas",
      path: "/meu-painel",
      cor: "text-blue-600",
      bg: "bg-blue-50 hover:bg-blue-100 border-blue-200",
    },
    {
      icon: BarChart3,
      label: "Relatórios",
      descricao: "Análises e exportações",
      path: "/relatorios",
      cor: "text-purple-600",
      bg: "bg-purple-50 hover:bg-purple-100 border-purple-200",
    },
  ];

  return (
    <DashboardLayout>
      <div className="p-4 lg:p-6">
        <div className="mb-6">
          <h1 className="text-xl font-bold">Performance</h1>
          <p className="text-sm text-muted-foreground">Acompanhamento de desempenho da equipe</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-3xl">
          {atalhos.map((item) => (
            <Card
              key={item.path}
              className={`cursor-pointer border transition-colors ${item.bg}`}
              onClick={() => navigate(item.path)}
            >
              <CardContent className="p-6 flex flex-col items-center text-center gap-3">
                <div className={`p-3 rounded-full ${item.bg}`}>
                  <item.icon className={`h-6 w-6 ${item.cor}`} />
                </div>
                <div>
                  <p className="font-semibold">{item.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{item.descricao}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </DashboardLayout>
  );
}

// ============================================================================
// COMPONENTE RAIZ
// ============================================================================
export default function PerformancePage() {
  const { user } = useAuth();
  // Corretor: renderiza MinhaPerformance (já envolve DashboardLayout)
  if (user?.role === "corretor") return <MinhaPerformance />;
  // Gestor/Admin/Superintendente: painel de atalhos
  return <PerformanceGestor />;
}
