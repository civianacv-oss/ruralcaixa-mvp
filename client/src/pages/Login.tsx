import { useState } from "react";
import { useLocation } from "wouter";
import { Loader2, Eye, EyeOff, Leaf } from "lucide-react";
import { loginByCpf, setSession } from "@/lib/api";

function formatCPF(v: string): string {
  return v
    .replace(/\D/g, "")
    .slice(0, 11)
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}

export default function Login() {
  const [, navigate] = useLocation();
  const [cpf, setCpf] = useState("");
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState("");

  async function handleLogin(e?: React.FormEvent) {
    e?.preventDefault();
    const cpfClean = cpf.replace(/\D/g, "");
    if (cpfClean.length !== 11) {
      setErro("CPF inválido. Digite os 11 dígitos.");
      return;
    }
    setLoading(true);
    setErro("");
    try {
      const { produtor, imoveis } = await loginByCpf(cpf);
      // Save session — use first imovel by default
      const imovelId = imoveis?.[0]?.id ?? undefined;
      setSession(produtor.id, produtor.nome, imovelId);
      navigate("/dashboard");
    } catch (err: unknown) {
      setErro(err instanceof Error ? err.message : "Erro de conexão. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 flex items-center justify-center overflow-hidden"
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

      {/* Card */}
      <div
        className="relative z-10 w-full max-w-[400px] mx-4"
        style={{ animation: "fadeInUp 0.45s cubic-bezier(0.23,1,0.32,1) both" }}
      >
        <style>{`
          @keyframes fadeInUp {
            from { opacity: 0; transform: translateY(20px) scale(0.97); }
            to   { opacity: 1; transform: translateY(0)   scale(1); }
          }
          @keyframes shakeX {
            0%,100% { transform: translateX(0); }
            20%,60% { transform: translateX(-6px); }
            40%,80% { transform: translateX(6px); }
          }
          .shake { animation: shakeX 0.4s ease; }
        `}</style>

        <div
          className="rounded-2xl p-8"
          style={{
            background: "oklch(1 0 0 / 0.97)",
            backdropFilter: "blur(20px)",
            boxShadow:
              "0 32px 64px oklch(0.10 0.04 145 / 0.40), 0 0 0 1px oklch(0.90 0.02 130 / 0.5)",
          }}
        >
          {/* Logo */}
          <div className="flex flex-col items-center mb-8">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
              style={{
                background:
                  "linear-gradient(135deg, oklch(0.38 0.12 145), oklch(0.50 0.14 155))",
                boxShadow: "0 8px 24px oklch(0.38 0.12 145 / 0.35)",
              }}
            >
              <Leaf className="w-8 h-8 text-white" strokeWidth={1.5} />
            </div>
            <h1
              className="text-[22px] font-bold tracking-tight"
              style={{ fontFamily: "'Playfair Display', serif", color: "oklch(0.18 0.04 145)" }}
            >
              RuralCaixa
            </h1>
            <p className="text-[13px] mt-1" style={{ color: "oklch(0.52 0.04 140)" }}>
              Digite seu CPF para acessar
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-1.5">
              <label
                htmlFor="cpf"
                className="block text-[11px] font-bold uppercase tracking-[0.5px]"
                style={{ color: "oklch(0.52 0.04 140)" }}
              >
                CPF
              </label>
              <input
                id="cpf"
                type="text"
                inputMode="numeric"
                placeholder="000.000.000-00"
                value={cpf}
                onChange={(e) => {
                  setCpf(formatCPF(e.target.value));
                  setErro("");
                }}
                onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                disabled={loading}
                className="w-full rounded-lg px-3 py-[10px] text-[15px] outline-none transition-all duration-200"
                style={{
                  border: erro
                    ? "1.5px solid oklch(0.65 0.20 25)"
                    : "1.5px solid oklch(0.88 0.02 130)",
                  letterSpacing: "1px",
                  boxSizing: "border-box",
                  color: "oklch(0.18 0.04 145)",
                  background: "oklch(0.99 0 0)",
                }}
              />
            </div>

            {/* Error */}
            {erro && (
              <div
                className="shake flex items-center gap-2 px-3 py-2.5 rounded-lg text-[13px]"
                style={{
                  background: "oklch(0.97 0.02 25)",
                  border: "1px solid oklch(0.88 0.08 25)",
                  color: "oklch(0.45 0.20 25)",
                }}
              >
                {erro}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || cpf.replace(/\D/g, "").length !== 11}
              className="w-full rounded-lg py-[11px] text-[14px] font-bold text-white transition-all duration-150 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              style={{
                background:
                  loading || cpf.replace(/\D/g, "").length !== 11
                    ? "oklch(0.60 0.08 145)"
                    : "linear-gradient(135deg, oklch(0.38 0.12 145), oklch(0.44 0.14 150))",
                boxShadow:
                  loading || cpf.replace(/\D/g, "").length !== 11
                    ? "none"
                    : "0 4px 16px oklch(0.38 0.12 145 / 0.35)",
              }}
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {loading ? "Entrando..." : "Entrar"}
            </button>
          </form>

          <p
            className="text-center text-[12px] mt-5"
            style={{ color: "oklch(0.65 0.03 140)" }}
          >
            Use o CPF cadastrado no sistema.
          </p>
        </div>
      </div>
    </div>
  );
}
