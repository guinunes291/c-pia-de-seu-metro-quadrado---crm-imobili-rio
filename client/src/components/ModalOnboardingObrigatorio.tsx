import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertCircle, UserCog } from "lucide-react";

/**
 * Modal de bloqueio para onboarding obrigatório
 *
 * Sistema de camadas:
 * 1ª camada: Perfil incompleto → bloqueia e redireciona para /configuracoes
 * 2ª camada: Follow-up pendente → só aparece após completar perfil
 */
export default function ModalOnboardingObrigatorio() {
  const [, setLocation] = useLocation();
  const [aberto, setAberto] = useState(false);

  const { data: verificacao } = trpc.onboarding.verificar.useQuery(undefined, {
    refetchOnMount: true,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (!verificacao) return;
    const { completo, user } = verificacao;
    if (user.role === "admin" || user.role === "superintendente") {
      setAberto(false);
      return;
    }
    setAberto(!completo);
  }, [verificacao]);

  const handleIrParaConfiguracao = () => {
    setAberto(false);
    setLocation("/configuracoes");
  };

  if (!verificacao || !aberto) return null;

  const { camposFaltantes } = verificacao;

  return (
    <Dialog open={aberto} onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-[420px]" showCloseButton={false}>
        <DialogHeader className="pb-2">
          {/* Ícone menor e sem margem excessiva */}
          <div className="flex items-center justify-center mb-2">
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
              <UserCog className="h-6 w-6 text-primary" />
            </div>
          </div>
          <DialogTitle className="text-center text-lg">
            Complete seu Perfil
          </DialogTitle>
          <DialogDescription className="text-center text-sm">
            Para acessar o sistema, preencha os campos obrigatórios abaixo.
          </DialogDescription>
        </DialogHeader>

        {/* Lista compacta de campos faltantes */}
        {camposFaltantes.length > 0 && (
          <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0 text-amber-500" />
            <span>
              <strong>Faltando:</strong> {camposFaltantes.join(", ")}
            </span>
          </div>
        )}

        <Button onClick={handleIrParaConfiguracao} size="sm" className="w-full mt-1">
          Completar Cadastro Agora
        </Button>
      </DialogContent>
    </Dialog>
  );
}
