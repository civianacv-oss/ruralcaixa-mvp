import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { MapPin, Ruler, Users, ChevronRight, Leaf, Loader2, LogOut } from "lucide-react";
import {
  clearSession,
  getProdutorNome,
  getProdutorId,
  setSession,
  setImovelNome,
  setRcToken,
} from "@/lib/api";
import { trpc } from "@/lib/trpc";

export default function SelecionarImovel() {
  const [, navigate] = useLocation();
  const [selecting, setSelecting] = useState<number | null>(null);

  const produtorNome = getProdutorNome();
  const firstName = produtorNome.split(" ")[0];

  // Busca imóveis via tRPC — o servidor aplica o filtro ACL por produtor
  const { data: imoveis, isLoading, error } = trpc.railway.imoveis.useQuery(undefined, {
    retry: false,
  });

  const switchImovelMutation = trpc.auth.switchImovel.useMutation();

  // Se só há 1 imóvel, seleciona automaticamente
  useEffect(() => {
    if (!imoveis || imoveis.length !== 1) return;
    const produtorId = getProdutorId();
    if (!produtorId) { navigate("/login"); return; }
    const im = imoveis[0];
    setSession(produtorId, produtorNome, im.id);
    setImovelNome(im.nome);
    switchImovelMutation.mutate(
      { imovelId: im.id },
      {
        onSuccess: (data) => { if (data.rcClaimsToken) setRcToken(data.rcClaimsToken); },
        onSettled: () => navigate("/dashboard"),
      }
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imoveis]);

  function handleSelect(im: { id: number; nome: string }) {
    if (selecting) return;
    setSelecting(im.id);
    const produtorId = getProdutorId();
    if (!produtorId) { navigate("/login"); return; }
    setSession(produtorId, produtorNome, im.id);
    setImovelNome(im.nome);
    switchImovelMutation.mutate(
      { imovelId: im.id },
      {
        onSuccess: (data) => { if (data.rcClaimsToken) setRcToken(data.rcClaimsToken); },
        onSettled: () => setTimeout(() => navigate("/dashboard"), 200),
      }
    );
  }

  function handleLogout() {
    clearSession();
    navigate("/login");
  }

  const loading = isLoading || (imoveis?.length === 1);

  return (
    <div
      className="fixed inset-0 flex flex-col items-center justify-center overflow-auto py-8 px-4"
      style={{
        background:
          "linear-gradient(135deg, oklch(0.20 0.06 145) 0%, oklch(0.30 0.08 145) 50%, oklch(0.22 0.05 160) 100%)",
      }}
    >
      {/* Decorative blobs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none select-none">
        <div
          className="absolute -top-40 -right-40 w-[500px] h-[500px] rounded-full opacity-10"
          style={{ background: "radial-gradient(circle, oklch(0.70 0.18 145), transparent)" }}
        />
        <div
          className="absolute -bottom-32 -left-32 w-96 h-96 rounded-full opacity-10"
          style={{ background: "radial-gradient(circle, oklch(0.60 0.16 160), transparent)" }}
        />
      </div>

      <div
        className="relative z-10 w-full max-w-[520px]"
        style={{ animation: "fadeInUp 0.40s cubic-bezier(0.23,1,0.32,1) both" }}
      >
        <style>{`
          @keyframes fadeInUp {
            from { opacity: 0; transform: translateY(18px) scale(0.97); }
            to   { opacity: 1; transform: translateY(0) scale(1); }
          }
        `}</style>

        {/* Header card */}
        <div
          className="rounded-2xl p-7 mb-4"
          style={{
            background: "oklch(1 0 0 / 0.97)",
            backdropFilter: "blur(20px)",
            boxShadow:
              "0 32px 64px oklch(0.10 0.04 145 / 0.40), 0 0 0 1px oklch(0.90 0.02 130 / 0.5)",
          }}
        >
          {/* Logo + greeting */}
          <div className="flex items-center gap-4 mb-5">
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
              style={{
                background:
                  "linear-gradient(135deg, oklch(0.38 0.12 145), oklch(0.50 0.14 155))",
                boxShadow: "0 6px 18px oklch(0.38 0.12 145 / 0.35)",
              }}
            >
              <Leaf className="w-6 h-6 text-white" strokeWidth={1.5} />
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.5px]" style={{ color: "oklch(0.52 0.04 140)" }}>
                Bem-vindo de volta
              </p>
              <h2
                className="text-[20px] font-bold leading-tight"
                style={{ fontFamily: "'Playfair Display', serif", color: "oklch(0.18 0.04 145)" }}
              >
                {firstName}
              </h2>
            </div>
            <button
              onClick={handleLogout}
              className="ml-auto flex items-center gap-1.5 text-[12px] font-medium px-3 py-1.5 rounded-lg transition-all hover:opacity-70"
              style={{ color: "oklch(0.52 0.04 140)", background: "oklch(0.94 0.01 130)" }}
            >
              <LogOut className="w-3.5 h-3.5" />
              Sair
            </button>
          </div>

          <div style={{ borderTop: "1px solid oklch(0.92 0.01 130)" }} className="pt-4">
            <p
              className="text-[15px] font-semibold"
              style={{ color: "oklch(0.18 0.04 145)" }}
            >
              Selecione a propriedade
            </p>
            <p className="text-[13px] mt-0.5" style={{ color: "oklch(0.52 0.04 140)" }}>
              Escolha qual imóvel deseja gerenciar nesta sessão.
            </p>
          </div>
        </div>

        {/* Loading state */}
        {loading && (
          <div className="flex flex-col items-center gap-3 py-10">
            <Loader2
              className="w-8 h-8 animate-spin"
              style={{ color: "oklch(0.70 0.10 145)" }}
            />
            <p className="text-[13px]" style={{ color: "oklch(0.75 0.05 145)" }}>
              Carregando propriedades...
            </p>
          </div>
        )}

        {/* Error */}
        {error && (
          <div
            className="rounded-xl px-4 py-3 text-[13px] mb-3"
            style={{
              background: "oklch(0.97 0.02 25 / 0.9)",
              border: "1px solid oklch(0.88 0.08 25)",
              color: "oklch(0.45 0.20 25)",
            }}
          >
            Não foi possível carregar as propriedades. Tente novamente.
          </div>
        )}

        {/* Imóvel cards */}
        {!loading && imoveis && imoveis.length > 1 && (
          <div className="space-y-3">
            {imoveis.map((im, idx) => {
              const isSelecting = selecting === im.id;
              const isDisabled = selecting !== null && !isSelecting;

              return (
                <button
                  key={im.id}
                  onClick={() => handleSelect(im)}
                  disabled={!!selecting}
                  className="w-full text-left rounded-2xl p-5 transition-all duration-200 group"
                  style={{
                    background: isSelecting
                      ? "oklch(0.94 0.05 145 / 0.98)"
                      : "oklch(1 0 0 / 0.97)",
                    backdropFilter: "blur(20px)",
                    boxShadow: isSelecting
                      ? "0 0 0 2px oklch(0.38 0.12 145), 0 16px 40px oklch(0.10 0.04 145 / 0.25)"
                      : "0 8px 24px oklch(0.10 0.04 145 / 0.20), 0 0 0 1px oklch(0.90 0.02 130 / 0.5)",
                    opacity: isDisabled ? 0.5 : 1,
                    animation: `fadeInUp ${0.40 + idx * 0.08}s cubic-bezier(0.23,1,0.32,1) both`,
                    transform: isSelecting ? "scale(1.01)" : undefined,
                    cursor: selecting ? "default" : "pointer",
                  }}
                >
                  <div className="flex items-start gap-4">
                    {/* Icon */}
                    <div
                      className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 mt-0.5 transition-all duration-200"
                      style={{
                        background: isSelecting
                          ? "linear-gradient(135deg, oklch(0.38 0.12 145), oklch(0.50 0.14 155))"
                          : "oklch(0.94 0.03 145)",
                        boxShadow: isSelecting
                          ? "0 4px 14px oklch(0.38 0.12 145 / 0.40)"
                          : "none",
                      }}
                    >
                      {isSelecting ? (
                        <Loader2 className="w-5 h-5 text-white animate-spin" />
                      ) : (
                        <span className="text-xl">🌾</span>
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <h3
                        className="text-[15px] font-bold truncate transition-colors mb-1"
                        style={{
                          fontFamily: "'Playfair Display', serif",
                          color: isSelecting
                            ? "oklch(0.28 0.10 145)"
                            : "oklch(0.18 0.04 145)",
                        }}
                      >
                        {im.nome}
                      </h3>

                      {/* Meta row */}
                      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5">
                        {(im.municipio || im.uf) && (
                          <span
                            className="flex items-center gap-1 text-[12px]"
                            style={{ color: "oklch(0.52 0.04 140)" }}
                          >
                            <MapPin className="w-3 h-3 shrink-0" />
                            {[im.municipio, im.uf].filter(Boolean).join(" — ")}
                          </span>
                        )}
                        {im.area_ha && (
                          <span
                            className="flex items-center gap-1 text-[12px]"
                            style={{ color: "oklch(0.52 0.04 140)" }}
                          >
                            <Ruler className="w-3 h-3 shrink-0" />
                            {im.area_ha.toLocaleString("pt-BR")} ha
                          </span>
                        )}
                        {im.total_produtores && im.total_produtores > 1 && (
                          <span
                            className="flex items-center gap-1 text-[12px]"
                            style={{ color: "oklch(0.52 0.04 140)" }}
                          >
                            <Users className="w-3 h-3 shrink-0" />
                            {im.total_produtores} produtores
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Arrow */}
                    <ChevronRight
                      className="w-5 h-5 shrink-0 mt-1 transition-all duration-200 group-hover:translate-x-0.5"
                      style={{
                        color: isSelecting
                          ? "oklch(0.38 0.12 145)"
                          : "oklch(0.70 0.04 140)",
                      }}
                    />
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* Empty state */}
        {!loading && imoveis && imoveis.length === 0 && (
          <div
            className="rounded-2xl p-8 text-center"
            style={{
              background: "oklch(1 0 0 / 0.97)",
              boxShadow: "0 8px 24px oklch(0.10 0.04 145 / 0.20)",
            }}
          >
            <p className="text-[14px]" style={{ color: "oklch(0.52 0.04 140)" }}>
              Nenhuma propriedade encontrada para este CPF.
            </p>
          </div>
        )}

        {/* Footer */}
        {!loading && (
          <p
            className="text-center text-[11px] mt-5"
            style={{ color: "oklch(0.65 0.04 145)" }}
          >
            Você pode trocar de propriedade a qualquer momento pelo menu lateral.
          </p>
        )}
      </div>
    </div>
  );
}
