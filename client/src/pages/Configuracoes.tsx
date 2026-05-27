import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Upload, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function Configuracoes() {
  const [, setLocation] = useLocation();
  const [abaAtiva, setAbaAtiva] = useState("pessoais");
  const [uploading, setUploading] = useState(false);
  const [buscandoCep, setBuscandoCep] = useState(false);
  
  // Query para verificar perfil
  const { data: verificacao, refetch: refetchVerificacao } = trpc.onboarding.verificar.useQuery();
  
  // Mutation para atualizar perfil
  const atualizarMutation = trpc.onboarding.atualizar.useMutation({
    onSuccess: () => {
      refetchVerificacao();
      alert("Perfil atualizado com sucesso!");
    },
    onError: (error: any) => {
      alert("Erro ao salvar: " + (error.message || "Tente novamente"));
    },
  });
  
  // Estado do formulário
  const [formData, setFormData] = useState({
    // Dados pessoais
    name: "",
    cpf: "",
    dataNascimento: "",
    email: "",
    telefone: "",
    fotoUrl: "",
    
    // Dados profissionais
    creci: "",
    situacao: "ativo" as "ativo" | "inativo",
    dataCredenciamento: "",
    dataDescredenciamento: "",
    status: "ausente" as "presente" | "ausente",
    
    // Endereço
    cep: "",
    logradouro: "",
    numero: "",
    complemento: "",
    bairro: "",
    cidade: "",
    estado: "",
  });

  // Preencher formulário com dados do usuário
  useEffect(() => {
    if (verificacao?.user) {
      const user = verificacao.user;
      setFormData({
        name: user.name || "",
        cpf: user.cpf || "",
        dataNascimento: user.dataNascimento ? new Date(user.dataNascimento).toISOString().split("T")[0] : "",
        email: user.email || "",
        telefone: user.telefone || "",
        fotoUrl: user.fotoUrl || "",
        creci: user.creci || "",
        situacao: user.situacao || "ativo",
        dataCredenciamento: user.dataCredenciamento ? new Date(user.dataCredenciamento).toISOString().split("T")[0] : "",
        dataDescredenciamento: user.dataDescredenciamento ? new Date(user.dataDescredenciamento).toISOString().split("T")[0] : "",
        status: user.status || "ausente",
        cep: user.cep || "",
        logradouro: user.logradouro || "",
        numero: user.numero || "",
        complemento: user.complemento || "",
        bairro: user.bairro || "",
        cidade: user.cidade || "",
        estado: user.estado || "",
      });
    }
  }, [verificacao]);

  const handleChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleBuscarCEP = async () => {
    if (formData.cep.length < 8) {
      alert("Digite um CEP válido com 8 dígitos");
      return;
    }

    setBuscandoCep(true);
    try {
      const cepLimpo = formData.cep.replace(/\D/g, "");
      const response = await fetch(`https://viacep.com.br/ws/${cepLimpo}/json/`);
      const data = await response.json();
      
      if (data.erro) {
        alert("CEP não encontrado");
        return;
      }
      
      setFormData(prev => ({
        ...prev,
        logradouro: data.logradouro || "",
        bairro: data.bairro || "",
        cidade: data.localidade || "",
        estado: data.uf || "",
        complemento: data.complemento || prev.complemento,
      }));
      alert("CEP encontrado! Endereço preenchido automaticamente.");
    } catch (error) {
      alert("CEP não encontrado ou serviço indisponível");
    } finally {
      setBuscandoCep(false);
    }
  };

  const handleUploadFoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      alert("Por favor, selecione uma imagem");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      alert("A imagem deve ter no máximo 5MB");
      return;
    }

    setUploading(true);

    try {
      const formDataUpload = new FormData();
      formDataUpload.append("file", file);

      const response = await fetch("/api/upload", {
        method: "POST",
        body: formDataUpload,
      });

      if (!response.ok) {
        throw new Error("Erro no upload");
      }

      const { url } = await response.json();
      
      handleChange("fotoUrl", url);
      alert("Foto enviada com sucesso!");
    } catch (error) {
      console.error("Erro no upload:", error);
      alert("Não foi possível enviar a foto");
    } finally {
      setUploading(false);
    }
  };

  const handleSalvar = () => {
    const dados: any = { ...formData };
    
    // Converter datas: se preenchidas, enviar como Date; se vazias, remover do payload
    if (dados.dataNascimento && dados.dataNascimento.trim() !== '') {
      dados.dataNascimento = new Date(dados.dataNascimento + 'T00:00:00');
    } else {
      delete dados.dataNascimento;
    }
    if (dados.dataCredenciamento && dados.dataCredenciamento.trim() !== '') {
      dados.dataCredenciamento = new Date(dados.dataCredenciamento + 'T00:00:00');
    } else {
      delete dados.dataCredenciamento;
    }
    if (dados.dataDescredenciamento && dados.dataDescredenciamento.trim() !== '') {
      dados.dataDescredenciamento = new Date(dados.dataDescredenciamento + 'T00:00:00');
    } else {
      delete dados.dataDescredenciamento;
    }

    atualizarMutation.mutate(dados);
  };

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map(n => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  if (!verificacao) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const { completo, camposFaltantes } = verificacao;

  return (
    <DashboardLayout>
      {/* py-4 em vez de py-8 para ganhar espaço vertical */}
      <div className="container max-w-3xl py-4">
        <Card>
          {/* Cabeçalho compacto */}
          <CardHeader className="pb-3 pt-4 px-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <CardTitle className="text-xl">Configurar Perfil</CardTitle>
                <CardDescription className="text-sm mt-0.5">
                  Complete seu perfil para ter acesso completo ao sistema
                </CardDescription>
              </div>
              {/* Badge de status inline no cabeçalho */}
              {completo ? (
                <span className="flex items-center gap-1 text-xs text-green-600 bg-green-50 border border-green-200 rounded-full px-2 py-1 whitespace-nowrap">
                  <CheckCircle2 className="h-3 w-3" />
                  Perfil completo
                </span>
              ) : (
                <span className="flex items-center gap-1 text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-2 py-1 whitespace-nowrap">
                  <AlertCircle className="h-3 w-3" />
                  {camposFaltantes.length} campo{camposFaltantes.length !== 1 ? "s" : ""} faltando
                </span>
              )}
            </div>

            {/* Alerta de campos faltantes — só quando há campos, em versão compacta */}
            {!completo && camposFaltantes.length > 0 && (
              <Alert className="mt-2 py-2">
                <AlertCircle className="h-3.5 w-3.5" />
                <AlertDescription className="text-xs">
                  <strong>Faltando:</strong> {camposFaltantes.join(", ")}
                </AlertDescription>
              </Alert>
            )}
          </CardHeader>
          
          <CardContent className="px-5 pb-4">
            <Tabs value={abaAtiva} onValueChange={setAbaAtiva}>
              <TabsList className="grid w-full grid-cols-3 h-8 text-xs">
                <TabsTrigger value="pessoais" className="text-xs">Dados Pessoais</TabsTrigger>
                <TabsTrigger value="profissional" className="text-xs">Profissional</TabsTrigger>
                <TabsTrigger value="endereco" className="text-xs">Endereço</TabsTrigger>
              </TabsList>
              
              {/* ABA DADOS PESSOAIS */}
              <TabsContent value="pessoais" className="space-y-3 mt-4">
                {/* Foto de Perfil — compacta, horizontal */}
                <div className="flex items-center gap-4 pb-3 border-b">
                  <Avatar className="h-14 w-14 shrink-0">
                    <AvatarImage src={formData.fotoUrl} />
                    <AvatarFallback className="text-base">
                      {formData.name ? getInitials(formData.name) : "?"}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <Label htmlFor="foto" className="cursor-pointer">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={uploading}
                        asChild
                      >
                        <span>
                          {uploading ? (
                            <>
                              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                              Enviando...
                            </>
                          ) : (
                            <>
                              <Upload className="h-3.5 w-3.5 mr-1.5" />
                              Enviar Foto
                            </>
                          )}
                        </span>
                      </Button>
                    </Label>
                    <input
                      id="foto"
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleUploadFoto}
                      disabled={uploading}
                    />
                    <p className="text-xs text-muted-foreground mt-1">PNG, JPG ou JPEG até 5MB</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1 col-span-2">
                    <Label htmlFor="name" className="text-xs">Nome Completo *</Label>
                    <Input
                      id="name"
                      className="h-8 text-sm"
                      value={formData.name}
                      onChange={(e) => handleChange("name", e.target.value)}
                      placeholder="Seu nome completo"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="cpf" className="text-xs">CPF *</Label>
                    <Input
                      id="cpf"
                      className="h-8 text-sm"
                      value={formData.cpf}
                      onChange={(e) => handleChange("cpf", e.target.value)}
                      placeholder="000.000.000-00"
                      maxLength={14}
                    />
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="dataNascimento" className="text-xs">Data de Nascimento *</Label>
                    <Input
                      id="dataNascimento"
                      type="date"
                      className="h-8 text-sm"
                      value={formData.dataNascimento}
                      onChange={(e) => handleChange("dataNascimento", e.target.value)}
                    />
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="email" className="text-xs">Email *</Label>
                    <Input
                      id="email"
                      type="email"
                      className="h-8 text-sm"
                      value={formData.email}
                      onChange={(e) => handleChange("email", e.target.value)}
                      placeholder="seu@email.com"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="telefone" className="text-xs">Telefone *</Label>
                    <Input
                      id="telefone"
                      className="h-8 text-sm"
                      value={formData.telefone}
                      onChange={(e) => handleChange("telefone", e.target.value)}
                      placeholder="(11) 99999-9999"
                      maxLength={15}
                    />
                  </div>
                </div>
              </TabsContent>

              {/* ABA PROFISSIONAL */}
              <TabsContent value="profissional" className="space-y-3 mt-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="creci" className="text-xs">CRECI (opcional)</Label>
                    <Input
                      id="creci"
                      className="h-8 text-sm"
                      value={formData.creci}
                      onChange={(e) => handleChange("creci", e.target.value)}
                      placeholder="Número do CRECI"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="situacao" className="text-xs">Situação (opcional)</Label>
                    <Select
                      value={formData.situacao}
                      onValueChange={(value) => handleChange("situacao", value)}
                    >
                      <SelectTrigger id="situacao" className="h-8 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ativo">Ativo</SelectItem>
                        <SelectItem value="inativo">Inativo</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="dataCredenciamento" className="text-xs">Data de Credenciamento *</Label>
                    <Input
                      id="dataCredenciamento"
                      type="date"
                      className="h-8 text-sm"
                      value={formData.dataCredenciamento}
                      onChange={(e) => handleChange("dataCredenciamento", e.target.value)}
                    />
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="dataDescredenciamento" className="text-xs">Data de Descredenciamento (opcional)</Label>
                    <Input
                      id="dataDescredenciamento"
                      type="date"
                      className="h-8 text-sm"
                      value={formData.dataDescredenciamento}
                      onChange={(e) => handleChange("dataDescredenciamento", e.target.value)}
                    />
                  </div>

                  <div className="space-y-1 col-span-2">
                    <Label htmlFor="status" className="text-xs">Status de Plantão *</Label>
                    <Select
                      value={formData.status}
                      onValueChange={(value) => handleChange("status", value)}
                    >
                      <SelectTrigger id="status" className="h-8 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="presente">Presente</SelectItem>
                        <SelectItem value="ausente">Ausente</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </TabsContent>

              {/* ABA ENDEREÇO */}
              <TabsContent value="endereco" className="space-y-3 mt-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1 col-span-2">
                    <Label htmlFor="cep" className="text-xs">CEP *</Label>
                    <div className="flex gap-2">
                      <Input
                        id="cep"
                        className="h-8 text-sm"
                        value={formData.cep}
                        onChange={(e) => handleChange("cep", e.target.value)}
                        placeholder="00000-000"
                        maxLength={9}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 shrink-0"
                        onClick={handleBuscarCEP}
                        disabled={buscandoCep}
                      >
                        {buscandoCep ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          "Buscar"
                        )}
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-1 col-span-2">
                    <Label htmlFor="logradouro" className="text-xs">Logradouro *</Label>
                    <Input
                      id="logradouro"
                      className="h-8 text-sm"
                      value={formData.logradouro}
                      onChange={(e) => handleChange("logradouro", e.target.value)}
                      placeholder="Rua, Avenida, etc."
                    />
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="numero" className="text-xs">Número *</Label>
                    <Input
                      id="numero"
                      className="h-8 text-sm"
                      value={formData.numero}
                      onChange={(e) => handleChange("numero", e.target.value)}
                      placeholder="Número"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="complemento" className="text-xs">Complemento (opcional)</Label>
                    <Input
                      id="complemento"
                      className="h-8 text-sm"
                      value={formData.complemento}
                      onChange={(e) => handleChange("complemento", e.target.value)}
                      placeholder="Apto, Bloco, etc."
                    />
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="bairro" className="text-xs">Bairro *</Label>
                    <Input
                      id="bairro"
                      className="h-8 text-sm"
                      value={formData.bairro}
                      onChange={(e) => handleChange("bairro", e.target.value)}
                      placeholder="Bairro"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="cidade" className="text-xs">Cidade *</Label>
                    <Input
                      id="cidade"
                      className="h-8 text-sm"
                      value={formData.cidade}
                      onChange={(e) => handleChange("cidade", e.target.value)}
                      placeholder="Cidade"
                    />
                  </div>

                  <div className="space-y-1 col-span-2">
                    <Label htmlFor="estado" className="text-xs">Estado *</Label>
                    <Select
                      value={formData.estado}
                      onValueChange={(value) => handleChange("estado", value)}
                    >
                      <SelectTrigger id="estado" className="h-8 text-sm">
                        <SelectValue placeholder="Selecione..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="AC">AC</SelectItem>
                        <SelectItem value="AL">AL</SelectItem>
                        <SelectItem value="AP">AP</SelectItem>
                        <SelectItem value="AM">AM</SelectItem>
                        <SelectItem value="BA">BA</SelectItem>
                        <SelectItem value="CE">CE</SelectItem>
                        <SelectItem value="DF">DF</SelectItem>
                        <SelectItem value="ES">ES</SelectItem>
                        <SelectItem value="GO">GO</SelectItem>
                        <SelectItem value="MA">MA</SelectItem>
                        <SelectItem value="MT">MT</SelectItem>
                        <SelectItem value="MS">MS</SelectItem>
                        <SelectItem value="MG">MG</SelectItem>
                        <SelectItem value="PA">PA</SelectItem>
                        <SelectItem value="PB">PB</SelectItem>
                        <SelectItem value="PR">PR</SelectItem>
                        <SelectItem value="PE">PE</SelectItem>
                        <SelectItem value="PI">PI</SelectItem>
                        <SelectItem value="RJ">RJ</SelectItem>
                        <SelectItem value="RN">RN</SelectItem>
                        <SelectItem value="RS">RS</SelectItem>
                        <SelectItem value="RO">RO</SelectItem>
                        <SelectItem value="RR">RR</SelectItem>
                        <SelectItem value="SC">SC</SelectItem>
                        <SelectItem value="SP">SP</SelectItem>
                        <SelectItem value="SE">SE</SelectItem>
                        <SelectItem value="TO">TO</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </TabsContent>
            </Tabs>

            {/* Botão de salvar — sempre visível, compacto */}
            <div className="flex justify-end gap-2 mt-4 pt-3 border-t">
              <Button
                onClick={handleSalvar}
                disabled={atualizarMutation.isPending}
                size="sm"
                className="min-w-[110px]"
              >
                {atualizarMutation.isPending ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  "Concluir Cadastro"
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
