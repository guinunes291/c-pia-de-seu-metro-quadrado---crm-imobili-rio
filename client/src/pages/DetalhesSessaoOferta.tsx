import { useParams, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  Plus,
  Users,
  Loader2,
  Calendar,
  CheckCircle2,
  Clock,
  PlayCircle,
  UserCircle,
  ExternalLink,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

// ─── helpers ────────────────────────────────────────────────────────────────
function statusVariant(s: string) {
  if (s === "concluida") return "secondary" as const;
  if (s === "em_andamento") return "default" as const;
  return "outline" as const;
}
function statusLabel(s: string) {
  const m: Record<string, string> = {
    agendada: "Agendada",
    em_andamento: "Em andamento",
    concluida: "Concluída",
  };
  return m[s] ?? s;
}
function statusAtribLabel(s: string) {
  const m: Record<string, string> = {
    pendente: "Pendente",
    em_andamento: "Em andamento",
    concluida: "Concluída",
  };
  return m[s] ?? s;
}

// ─── Component ──────────────────────────────────────────────────────────────
export default function DetalhesSessaoOferta() {
  const params = useParams<{ id: string }>();
  const sessaoId = Number(params.id);
  const [, navigate] = useLocation();

  // Queries
  const { data: sessao, isLoading, refetch } = trpc.ofertaAtiva.sessoes.get.useQuery(
    { id: sessaoId },
    { enabled: !!sessaoId && !isNaN(sessaoId) }
  );
  const { data: corretores } = trpc.corretores.list.useQuery();

  // Mutations
  const updateStatus = trpc.ofertaAtiva.sessoes.updateStatus.useMutation({
    onSuccess: () => { refetch(); toast.success("Status atualizado!"); },
    onError: (e) => toast.error(e.message),
  });

  const atribuir = trpc.ofertaAtiva.sessoes.atribuir.useMutation({
    onSuccess: () => {
      refetch();
      toast.success("Oferta atribuída com sucesso!");
      setAtribuirOpen(false);
      setCorretorSelecionado("");
      setNomeOferta("");
    },
    onError: (e) => toast.error(e.message),
  });

  // State do modal de atribuição
  const [atribuirOpen, setAtribuirOpen] = useState(false);
  const [corretorSelecionado, setCorretorSelecionado] = useState("");
  const [nomeOferta, setNomeOferta] = useState("");

  if (!sessaoId || isNaN(sessaoId)) {
    return (
      <DashboardLayout>
        <div className="max-w-3xl mx-auto p-6">
          <p className="text-destructive">ID de sessão inválido.</p>
        </div>
      </DashboardLayout>
    );
  }

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="max-w-3xl mx-auto p-6 space-y-4">
          <div className="h-8 w-48 bg-muted rounded animate-pulse" />
          <div className="h-32 bg-muted rounded-xl animate-pulse" />
          <div className="h-48 bg-muted rounded-xl animate-pulse" />
        </div>
      </DashboardLayout>
    );
  }

  if (!sessao) {
    return (
      <DashboardLayout>
        <div className="max-w-3xl mx-auto p-6">
          <Button variant="ghost" size="sm" onClick={() => navigate("/sessoes-oferta")} className="mb-4">
            <ArrowLeft className="w-4 h-4 mr-2" /> Voltar
          </Button>
          <p className="text-muted-foreground">Sessão não encontrada.</p>
        </div>
      </DashboardLayout>
    );
  }

  const atribuicoes = sessao.atribuicoes ?? [];

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate("/sessoes-oferta")}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold">{sessao.nome}</h1>
              <div className="flex items-center gap-3 mt-1 flex-wrap">
                <Badge variant={statusVariant(sessao.status)}>{statusLabel(sessao.status)}</Badge>
                <span className="text-sm text-muted-foreground flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5" />
                  {new Date(sessao.dataHora).toLocaleString("pt-BR", {
                    day: "2-digit",
                    month: "2-digit",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
              {sessao.descricao && (
                <p className="text-sm text-muted-foreground mt-1">{sessao.descricao}</p>
              )}
            </div>
          </div>

          {/* Ações de status */}
          <div className="flex items-center gap-2 flex-wrap">
            {sessao.status === "agendada" && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => updateStatus.mutate({ id: sessaoId, status: "em_andamento" })}
                disabled={updateStatus.isPending}
              >
                <PlayCircle className="w-4 h-4 mr-2 text-blue-500" />
                Iniciar Sessão
              </Button>
            )}
            {sessao.status === "em_andamento" && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => updateStatus.mutate({ id: sessaoId, status: "concluida" })}
                disabled={updateStatus.isPending}
              >
                <CheckCircle2 className="w-4 h-4 mr-2 text-green-500" />
                Concluir Sessão
              </Button>
            )}

            {/* Atribuir corretor */}
            <Dialog open={atribuirOpen} onOpenChange={setAtribuirOpen}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus className="w-4 h-4 mr-2" />
                  Atribuir Corretor
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Atribuir Oferta a Corretor</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-2">
                  <div>
                    <Label>Nome da Oferta *</Label>
                    <Input
                      value={nomeOferta}
                      onChange={(e) => setNomeOferta(e.target.value)}
                      placeholder="Ex: Oferta João - Terça 20/05"
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label>Corretor *</Label>
                    <Select value={corretorSelecionado} onValueChange={setCorretorSelecionado}>
                      <SelectTrigger className="mt-1">
                        <SelectValue placeholder="Selecione um corretor" />
                      </SelectTrigger>
                      <SelectContent>
                        {(corretores ?? []).map((c) => (
                          <SelectItem key={c.id} value={String(c.id)}>
                            {c.nome}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setAtribuirOpen(false)}>
                    Cancelar
                  </Button>
                  <Button
                    disabled={!nomeOferta.trim() || !corretorSelecionado || atribuir.isPending}
                    onClick={() =>
                      atribuir.mutate({
                        sessaoId,
                        corretorId: Number(corretorSelecionado),
                        nome: nomeOferta,
                        filtros: {},
                      })
                    }
                  >
                    {atribuir.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    Atribuir
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Resumo */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                <Users className="w-4 h-4" />
                Corretores
              </div>
              <p className="text-2xl font-bold">{atribuicoes.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                <Clock className="w-4 h-4" />
                Status
              </div>
              <p className="text-lg font-semibold capitalize">{statusLabel(sessao.status)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                <Calendar className="w-4 h-4" />
                Tipo
              </div>
              <p className="text-lg font-semibold capitalize">
                {sessao.tipo === "terca" ? "Terça-feira" : sessao.tipo === "quinta" ? "Quinta-feira" : "Avulsa"}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Lista de atribuições */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="w-4 h-4" />
              Corretores Atribuídos ({atribuicoes.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {atribuicoes.length === 0 ? (
              <div className="text-center py-10 border border-dashed rounded-xl">
                <UserCircle className="w-10 h-10 mx-auto text-muted-foreground/40 mb-3" />
                <p className="text-sm text-muted-foreground">Nenhum corretor atribuído ainda.</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Use o botão "Atribuir Corretor" para adicionar.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {atribuicoes.map((a) => {
                  const corretor = (corretores ?? []).find((c) => c.id === a.corretorId);
                  return (
                    <div
                      key={a.id}
                      className="flex items-center justify-between gap-3 p-3 border rounded-lg hover:bg-muted/30 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-sm">
                          {corretor?.nome?.charAt(0)?.toUpperCase() ?? "?"}
                        </div>
                        <div>
                          <p className="font-medium text-sm">
                            {corretor?.nome ?? `Corretor #${a.corretorId}`}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {statusAtribLabel(a.status)}
                          </p>
                        </div>
                      </div>
                      {a.ofertaId && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => navigate(`/oferta-ativa/${a.ofertaId}`)}
                          className="text-xs gap-1"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          Ver Oferta
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
