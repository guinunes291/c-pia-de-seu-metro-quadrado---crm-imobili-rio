import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Search, MessageSquare, Tag } from "lucide-react";

type Categoria = "financiamento" | "documentacao" | "visita" | "preco" | "localizacao" | "empreendimento" | "empresa" | "geral";

const CATEGORIAS: { value: Categoria; label: string }[] = [
  { value: "financiamento", label: "Financiamento" },
  { value: "documentacao", label: "Documentação" },
  { value: "visita", label: "Visita" },
  { value: "preco", label: "Preço" },
  { value: "localizacao", label: "Localização" },
  { value: "empreendimento", label: "Empreendimento" },
  { value: "empresa", label: "Empresa" },
  { value: "geral", label: "Geral" },
];

const CATEGORIA_COLORS: Record<Categoria, string> = {
  financiamento: "bg-blue-100 text-blue-800",
  documentacao: "bg-yellow-100 text-yellow-800",
  visita: "bg-green-100 text-green-800",
  preco: "bg-purple-100 text-purple-800",
  localizacao: "bg-orange-100 text-orange-800",
  empreendimento: "bg-teal-100 text-teal-800",
  empresa: "bg-pink-100 text-pink-800",
  geral: "bg-gray-100 text-gray-800",
};

type FaqForm = {
  pergunta: string;
  resposta: string;
  categoria: Categoria;
  palavrasChave: string;
  prioridade: number;
  ativo: boolean;
};

const EMPTY_FORM: FaqForm = {
  pergunta: "",
  resposta: "",
  categoria: "geral",
  palavrasChave: "",
  prioridade: 0,
  ativo: true,
};

export default function GerenciarFAQ() {
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [categoriaFiltro, setCategoriaFiltro] = useState<string>("todas");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<FaqForm>(EMPTY_FORM);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);

  const utils = trpc.useUtils();

  const { data: faqs, isLoading } = trpc.chatbot.listAllFaqs.useQuery(
    categoriaFiltro !== "todas" ? { categoria: categoriaFiltro } : undefined
  );

  const createFaq = trpc.chatbot.createFaq.useMutation({
    onSuccess: () => {
      utils.chatbot.listAllFaqs.invalidate();
      toast.success("FAQ criada com sucesso!");
      setDialogOpen(false);
      setForm(EMPTY_FORM);
    },
    onError: (err) => toast.error(`Erro ao criar FAQ: ${err.message}`),
  });

  const updateFaq = trpc.chatbot.updateFaq.useMutation({
    onSuccess: () => {
      utils.chatbot.listAllFaqs.invalidate();
      toast.success("FAQ atualizada com sucesso!");
      setDialogOpen(false);
      setEditingId(null);
      setForm(EMPTY_FORM);
    },
    onError: (err) => toast.error(`Erro ao atualizar FAQ: ${err.message}`),
  });

  const deleteFaq = trpc.chatbot.deleteFaq.useMutation({
    onSuccess: () => {
      utils.chatbot.listAllFaqs.invalidate();
      toast.success("FAQ removida com sucesso!");
      setDeleteConfirmId(null);
    },
    onError: (err) => toast.error(`Erro ao remover FAQ: ${err.message}`),
  });

  const handleOpenCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };

  const handleOpenEdit = (faq: NonNullable<typeof faqs>[number]) => {
    setEditingId(faq.id);
    setForm({
      pergunta: faq.pergunta,
      resposta: faq.resposta,
      categoria: faq.categoria as Categoria,
      palavrasChave: faq.palavrasChave || "",
      prioridade: faq.prioridade,
      ativo: faq.ativo,
    });
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!form.pergunta.trim() || !form.resposta.trim()) {
      toast.error("Pergunta e resposta são obrigatórias.");
      return;
    }
    if (editingId) {
      updateFaq.mutate({ id: editingId, ...form });
    } else {
      createFaq.mutate(form);
    }
  };

  const filteredFaqs = (faqs || []).filter((faq) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      faq.pergunta.toLowerCase().includes(q) ||
      faq.resposta.toLowerCase().includes(q) ||
      (faq.palavrasChave || "").toLowerCase().includes(q)
    );
  });

  const isGestor = user?.role === "gestor" || user?.role === "admin";

  if (!isGestor) {
    return (
      <DashboardLayout>
        <div className="container py-8 text-center text-muted-foreground">
          Acesso restrito a gestores.
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="container py-8 space-y-6">
        {/* Cabeçalho */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <MessageSquare className="h-6 w-6 text-primary" />
              Gerenciar FAQ do Chatbot
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Cadastre perguntas e respostas para o chatbot público de pré-qualificação.
            </p>
          </div>
          <Button onClick={handleOpenCreate} className="gap-2">
            <Plus className="h-4 w-4" />
            Nova FAQ
          </Button>
        </div>

        {/* Filtros */}
        <div className="flex gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por pergunta, resposta ou palavras-chave..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={categoriaFiltro} onValueChange={setCategoriaFiltro}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Categoria" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas as categorias</SelectItem>
              {CATEGORIAS.map((c) => (
                <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Estatísticas */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold">{faqs?.length || 0}</div>
              <div className="text-xs text-muted-foreground">Total de FAQs</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold text-green-600">{faqs?.filter(f => f.ativo).length || 0}</div>
              <div className="text-xs text-muted-foreground">Ativas</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold text-gray-400">{faqs?.filter(f => !f.ativo).length || 0}</div>
              <div className="text-xs text-muted-foreground">Inativas</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold">{new Set(faqs?.map(f => f.categoria)).size || 0}</div>
              <div className="text-xs text-muted-foreground">Categorias usadas</div>
            </CardContent>
          </Card>
        </div>

        {/* Lista de FAQs */}
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </div>
        ) : filteredFaqs.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-40" />
              <p>Nenhuma FAQ encontrada.</p>
              <Button variant="outline" className="mt-4" onClick={handleOpenCreate}>
                Criar primeira FAQ
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {filteredFaqs.map((faq) => (
              <Card key={faq.id} className={!faq.ativo ? "opacity-60" : ""}>
                <CardContent className="py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${CATEGORIA_COLORS[faq.categoria as Categoria] || CATEGORIA_COLORS.geral}`}>
                          {CATEGORIAS.find(c => c.value === faq.categoria)?.label || faq.categoria}
                        </span>
                        {!faq.ativo && (
                          <Badge variant="secondary" className="text-xs">Inativa</Badge>
                        )}
                        {faq.prioridade > 0 && (
                          <Badge variant="outline" className="text-xs">Prioridade {faq.prioridade}</Badge>
                        )}
                      </div>
                      <p className="font-medium text-sm">{faq.pergunta}</p>
                      <p className="text-muted-foreground text-sm mt-1 line-clamp-2">{faq.resposta}</p>
                      {faq.palavrasChave && (
                        <div className="flex items-center gap-1 mt-2 flex-wrap">
                          <Tag className="h-3 w-3 text-muted-foreground" />
                          {faq.palavrasChave.split(",").map((kw, i) => (
                            <span key={i} className="text-xs bg-muted px-1.5 py-0.5 rounded">{kw.trim()}</span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleOpenEdit(faq)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setDeleteConfirmId(faq.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Dialog criar/editar */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) { setEditingId(null); setForm(EMPTY_FORM); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar FAQ" : "Nova FAQ"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label>Pergunta *</Label>
              <Input
                placeholder="Ex: Como funciona o financiamento?"
                value={form.pergunta}
                onChange={(e) => setForm(f => ({ ...f, pergunta: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>Resposta *</Label>
              <Textarea
                placeholder="Escreva a resposta completa..."
                value={form.resposta}
                onChange={(e) => setForm(f => ({ ...f, resposta: e.target.value }))}
                rows={4}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Categoria</Label>
                <Select value={form.categoria} onValueChange={(v) => setForm(f => ({ ...f, categoria: v as Categoria }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIAS.map((c) => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Prioridade</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={form.prioridade}
                  onChange={(e) => setForm(f => ({ ...f, prioridade: parseInt(e.target.value) || 0 }))}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Palavras-chave (separadas por vírgula)</Label>
              <Input
                placeholder="Ex: financiamento, crédito, banco, FGTS"
                value={form.palavrasChave}
                onChange={(e) => setForm(f => ({ ...f, palavrasChave: e.target.value }))}
              />
            </div>
            <div className="flex items-center gap-3">
              <Switch
                checked={form.ativo}
                onCheckedChange={(v) => setForm(f => ({ ...f, ativo: v }))}
              />
              <Label>FAQ ativa (visível no chatbot)</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button
              onClick={handleSubmit}
              disabled={createFaq.isPending || updateFaq.isPending}
            >
              {editingId ? "Salvar alterações" : "Criar FAQ"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog confirmar exclusão */}
      <Dialog open={deleteConfirmId !== null} onOpenChange={(open) => { if (!open) setDeleteConfirmId(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Remover FAQ?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            A FAQ será desativada e não aparecerá mais no chatbot. Esta ação pode ser revertida editando a FAQ.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmId(null)}>Cancelar</Button>
            <Button
              variant="destructive"
              onClick={() => deleteConfirmId && deleteFaq.mutate({ id: deleteConfirmId })}
              disabled={deleteFaq.isPending}
            >
              Remover
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
