import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { Link } from "wouter";

// Banner temático Copa do Mundo 2026 — exibido no topo do sistema
// Pode ser fechado pelo usuário (persiste no localStorage)
export function CopaWorldCupBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const dismissed = localStorage.getItem("copa2026_banner_dismissed");
    if (!dismissed) setVisible(true);
  }, []);

  const dismiss = () => {
    localStorage.setItem("copa2026_banner_dismissed", "1");
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div
      className="relative overflow-hidden w-full"
      style={{
        background: "linear-gradient(90deg, #009c3b 0%, #009c3b 30%, #002776 50%, #ffdf00 70%, #009c3b 100%)",
        backgroundSize: "200% 100%",
        animation: "copaSlide 8s linear infinite",
      }}
    >
      <style>{`
        @keyframes copaSlide {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        @keyframes copaBounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-3px); }
        }
      `}</style>

      <div className="flex items-center justify-between px-4 py-1.5 text-white text-sm font-semibold">
        <div className="flex items-center gap-2 flex-1 justify-center">
          <span style={{ animation: "copaBounce 1s ease-in-out infinite", display: "inline-block" }}>⚽</span>
          <span className="hidden sm:inline">Copa do Mundo 2026 • </span>
          <span>Copa SMQ em andamento!</span>
          <span className="hidden sm:inline">• 03/06 – 12/07 • R$ 4.350 em prêmios</span>
          <span style={{ animation: "copaBounce 1s ease-in-out infinite 0.5s", display: "inline-block" }}>🏆</span>
          <Link href="/copa-smq" className="ml-2 underline underline-offset-2 hover:opacity-80 transition-opacity text-white">
            Ver ranking →
          </Link>
        </div>
        <button
          onClick={dismiss}
          className="ml-3 p-0.5 rounded hover:bg-white/20 transition-colors flex-shrink-0"
          aria-label="Fechar banner"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
