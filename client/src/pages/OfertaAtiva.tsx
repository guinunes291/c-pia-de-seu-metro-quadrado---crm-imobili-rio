import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Megaphone, Plus, Archive, Users, RotateCcw } from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import { toast } from "sonner";

function statusLabel(s: string) {
  const m: Record<string, string> = { rascunho: "Rascunho", ativa: "Ativa", concluida: "Concluída", arquivada: "Arquivada" };
  return m[s] ?? s;
}

function statusVariant(s: string): "default" | "secondary" | "destructive" | "outline" {
  if (s === "ativa") return "default";
  if (s === "concluida") return "secondary";
  return "outline";
}

export default function OfertaAtiva() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const [tab, setTab] = useState<"ativas" | "arquivadas">("ativas");

  const { data: listas, isLoading } = trpc.ofertaAtiva.list.useQuery({ incluirArquivadas: false });
  const { data: arquivadas, isLoading: isLoadingArq } = trpc.ofertaAtiva.list.useQuery(
    { incluirArquivadas: true },
    { select: (d) => d.filter((l) => l.status === "arquivada") }
  );

  const archiveMutation = trpc.ofertaAtiva.archive.useMutation({
    onSuccess: () => {
      utils.ofertaAtiva.list.invalidate();
      toast.success("Lista arquivada");
    },
  });

  const restaurarMutation = trpc.ofertaAtiva.restaurar.useMutation({
    onSuccess: () => {
      utils.ofertaAtiva.list.invalidate();
      toast.success("Lista restaurada como ativa");
    },
  });

  const isGestor = user?.role === "gestor" || user?.role === "admin" || user?.role === "superintendente";

  function ListaCard({ lista, arquivada = false }: { lista: any; arquivada?: boolean }) {
    const pctContatados = lista.totalLeads > 0 ? Math.round((lista.totalContatados / lista.totalLeads) * 100) : 0;
    const pctAvancados = lista.totalLeads > 0 ? Math.round((lista.totalAvancados / lista.totalLeads) * 100) : 0;

    return (
      <div
        className={`bg-white border rounded-xl p-4 hover:shadow-md transition-shadow ${arquivada ? "opacity-80" : "cursor-pointer"}`}
        onClick={() => !arquivada && navigate(`/oferta-ativa/${lista.id}`)}
      >
        <div className="flex items-start justify-between gap-2 mb-3">
          <div>
            <h3 className="font-semibold text-gray-900 leading-tight">{lista.nome}</h3>
            {lista.descricao && (
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{lista.descricao}</p>
            )}
          </div>
          <Badge variant={statusVariant(lista.status)}>{statusLabel(lista.status)}</Badge>
        </div>

        <div className="space-y-2 mb-3">
          <div>
            <div className="flex justify-between text-xs text-muted-foreground mb-1">
              <span>Contatados</span>
              <span>{lista.totalContatados}/{lista.totalLeads} ({pctContatados}%)</span>
            </div>
            <Progress value={pctContatados} className="h-1.5" />
          </div>
          <div>
            <div className="flex justify-between text-xs text-muted-foreground mb-1">
              <span>Agendamentos</span>
              <span>{lista.totalAvancados} ({pctAvancados}%)</span>
            </div>
            <Progress value={pctAvancados} className="h-1.5 [&>div]:bg-green-500" />
          </div>
        </div>

        <div className="flex justify-between items-center">
          <span className="text-xs text-muted-foreground">
            {new Date(lista.createdAt).toLocaleDateString("pt-BR")}
          </span>
          {arquivada ? (
            <button
              className="text-xs text-blue-600 hover:text-blue-800 transition-colors flex items-center gap-1"
              onClick={(e) => {
                e.stopPropagation();
                restaurarMutation.mutate({ id: lista.id });
              }}
              disabled={restaurarMutation.isPending}
            >
              <RotateCcw className="w-3 h-3" />
              Restaurar
            </button>
          ) : (
            <button
              className="text-xs text-muted-foreground hover:text-destructive transition-colors flex items-center gap-1"
              onClick={(e) => {
                e.stopPropagation();
                archiveMutation.mutate({ id: lista.id });
              }}
              disabled={archiveMutation.isPending}
            >
              <Archive className="w-3 h-3" />
              Arquivar
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto space-y-6 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Megaphone className="w-6 h-6 text-primary" />
              Oferta Ativa
            </h1>
          </div>
          <div className="flex gap-2">
            {isGestor && (
              <Button variant="outline" onClick={() => navigate("/sessoes-oferta")}>
                <Users className="w-4 h-4 mr-2" />
                Sessões
              </Button>
            )}
            <Button onClick={() => navigate("/oferta-ativa/nova")}>
              <Plus className="w-4 h-4 mr-2" />
              Nova Lista
            </Button>
          </div>
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
          <TabsList>
            <TabsTrigger value="ativas">
              Ativas {listas && listas.length > 0 && <Badge variant="secondary" className="ml-1.5 text-xs">{listas.length}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="arquivadas">
              Arquivadas {arquivadas && arquivadas.length > 0 && <Badge variant="secondary" className="ml-1.5 text-xs">{arquivadas.length}</Badge>}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="ativas">
            {isLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-36 bg-muted rounded-xl animate-pulse" />
                ))}
              </div>
            ) : !listas || listas.length === 0 ? (
              <div className="text-center py-20 border border-dashed rounded-xl mt-4">
                <Megaphone className="w-12 h-12 mx-auto text-muted-foreground/40 mb-4" />
                <p className="text-lg font-medium text-muted-foreground">Nenhuma lista criada ainda</p>
                <p className="text-sm text-muted-foreground mb-6">Crie uma lista segmentada de leads para começar uma campanha.</p>
                <Button onClick={() => navigate("/oferta-ativa/nova")}>
                  <Plus className="w-4 h-4 mr-2" />
                  Criar primeira lista
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                {listas.map((lista) => <ListaCard key={lista.id} lista={lista} />)}
              </div>
            )}
          </TabsContent>

          <TabsContent value="arquivadas">
            {isLoadingArq ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                {Array.from({ length: 2 }).map((_, i) => (
                  <div key={i} className="h-36 bg-muted rounded-xl animate-pulse" />
                ))}
              </div>
            ) : !arquivadas || arquivadas.length === 0 ? (
              <div className="text-center py-16 border border-dashed rounded-xl mt-4">
                <Archive className="w-10 h-10 mx-auto text-muted-foreground/40 mb-3" />
                <p className="text-muted-foreground">Nenhuma lista arquivada</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                {arquivadas.map((lista) => <ListaCard key={lista.id} lista={lista} arquivada />)}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
