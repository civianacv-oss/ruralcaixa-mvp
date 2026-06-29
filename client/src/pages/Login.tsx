import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { Loader2, Leaf, MessageCircle, RotateCcw, ShieldCheck } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { setSession } from "@/lib/api";

function formatCPF(v: string): string {
  return v
    .replace(/\D/g, "")
    .slice(0, 11)
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}

type Step = "cpf" | "otp";

export default function Login() {
  const [, navigate] = useLocation();
  const [step, setStep] = useState<Step>("cpf");
  const [cpf, setCpf] = useState("");
  const [code, setCode] = useState(["", "", "", "", "", ""]);
  const [channel, setChannel] = useState<"whatsapp" | "telegram">("whatsapp");
  const [maskedPhone, setMaskedPhone] = useState("");
  const [produtorNome, setProdutorNome] = useState("");
  const [erro, setErro] = useState("");
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const sendOtp = trpc.auth.sendOtp.useMutation();
  const verifyOtp = trpc.auth.verifyOtp.useMutation();

  // Focus first OTP input when step changes
  useEffect(() => {
    if (step === "otp") {
      setTimeout(() => inputRefs.current[0]?.focus(), 100);
    }
  }, [step]);

  async function handleCpfSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    const cpfClean = cpf.replace(/\D/g, "");
    if (cpfClean.length !== 11) {
      setErro("CPF inválido. Digite os 11 dígitos.");
      return;
    }
    setErro("");
    try {
      const result = await sendOtp.mutateAsync({ cpf: cpfClean });
      setChannel(result.channel);
      setMaskedPhone(result.maskedPhone);
      setProdutorNome(result.produtorNome);
      setStep("otp");
    } catch (err: unknown) {
      setErro(err instanceof Error ? err.message : "Erro ao enviar código. Tente novamente.");
    }
  }

  async function handleOtpSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    const fullCode = code.join("");
    if (fullCode.length !== 6) {
      setErro("Digite o código completo de 6 dígitos.");
      return;
    }
    setErro("");
    try {
      const result = await verifyOtp.mutateAsync({ cpf: cpf.replace(/\D/g, ""), code: fullCode });
      setSession(result.produtorId, result.produtorNome, result.imovelId);
      navigate("/dashboard");
    } catch (err: unknown) {
      setErro(err instanceof Error ? err.message : "Código inválido. Tente novamente.");
      // Shake and clear code on error
      setCode(["", "", "", "", "", ""]);
      setTimeout(() => inputRefs.current[0]?.focus(), 50);
    }
  }

  function handleCodeInput(idx: number, val: string) {
    // Handle paste of full code
    if (val.length > 1) {
      const digits = val.replace(/\D/g, "").slice(0, 6).split("");
      const newCode = [...code];
      digits.forEach((d, i) => { if (i < 6) newCode[i] = d; });
      setCode(newCode);
      const nextIdx = Math.min(digits.length, 5);
      inputRefs.current[nextIdx]?.focus();
      return;
    }
    const digit = val.replace(/\D/g, "").slice(-1);
    const newCode = [...code];
    newCode[idx] = digit;
    setCode(newCode);
    if (digit && idx < 5) inputRefs.current[idx + 1]?.focus();
  }

  function handleCodeKeyDown(idx: number, e: React.KeyboardEvent) {
    if (e.key === "Backspace" && !code[idx] && idx > 0) {
      inputRefs.current[idx - 1]?.focus();
    }
    if (e.key === "Enter" && code.join("").length === 6) handleOtpSubmit();
  }

  async function handleResend() {
    setErro("");
    setCode(["", "", "", "", "", ""]);
    try {
      const result = await sendOtp.mutateAsync({ cpf: cpf.replace(/\D/g, "") });
      setChannel(result.channel);
      setMaskedPhone(result.maskedPhone);
    } catch (err: unknown) {
      setErro(err instanceof Error ? err.message : "Erro ao reenviar código.");
    }
  }

  const isLoading = sendOtp.isPending || verifyOtp.isPending;

  return (
    <div
      className="fixed inset-0 flex items-center justify-center overflow-hidden"
      style={{
        background: "linear-gradient(135deg, oklch(0.20 0.06 145) 0%, oklch(0.30 0.08 145) 50%, oklch(0.22 0.05 160) 100%)",
      }}
    >
      {/* Decorative blobs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none select-none">
        <div className="absolute -top-40 -right-40 w-[500px] h-[500px] rounded-full opacity-10"
          style={{ background: "radial-gradient(circle, oklch(0.70 0.18 145), transparent)" }} />
        <div className="absolute -bottom-32 -left-32 w-96 h-96 rounded-full opacity-10"
          style={{ background: "radial-gradient(circle, oklch(0.60 0.16 160), transparent)" }} />
      </div>

      {/* Card */}
      <div
        key={step}
        className="relative z-10 w-full max-w-[400px] mx-4"
        style={{ animation: "fadeInUp 0.40s cubic-bezier(0.23,1,0.32,1) both" }}
      >
        <style>{`
          @keyframes fadeInUp {
            from { opacity: 0; transform: translateY(18px) scale(0.97); }
            to   { opacity: 1; transform: translateY(0) scale(1); }
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
            boxShadow: "0 32px 64px oklch(0.10 0.04 145 / 0.40), 0 0 0 1px oklch(0.90 0.02 130 / 0.5)",
          }}
        >
          {/* Logo */}
          <div className="flex flex-col items-center mb-7">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
              style={{
                background: "linear-gradient(135deg, oklch(0.38 0.12 145), oklch(0.50 0.14 155))",
                boxShadow: "0 8px 24px oklch(0.38 0.12 145 / 0.35)",
              }}
            >
              {step === "otp" ? (
                <ShieldCheck className="w-8 h-8 text-white" strokeWidth={1.5} />
              ) : (
                <Leaf className="w-8 h-8 text-white" strokeWidth={1.5} />
              )}
            </div>
            <h1
              className="text-[22px] font-bold tracking-tight"
              style={{ fontFamily: "'Playfair Display', serif", color: "oklch(0.18 0.04 145)" }}
            >
              RuralCaixa
            </h1>
            <p className="text-[13px] mt-1 text-center" style={{ color: "oklch(0.52 0.04 140)" }}>
              {step === "cpf"
                ? "Digite seu CPF para acessar"
                : `Código enviado via ${channel === "whatsapp" ? "WhatsApp" : "Telegram"}`}
            </p>
          </div>

          {/* ── Step 1: CPF ── */}
          {step === "cpf" && (
            <form onSubmit={handleCpfSubmit} className="space-y-4">
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
                  onChange={(e) => { setCpf(formatCPF(e.target.value)); setErro(""); }}
                  disabled={isLoading}
                  className="w-full rounded-lg px-3 py-[10px] text-[15px] outline-none transition-all duration-200"
                  style={{
                    border: erro ? "1.5px solid oklch(0.65 0.20 25)" : "1.5px solid oklch(0.88 0.02 130)",
                    letterSpacing: "1px",
                    color: "oklch(0.18 0.04 145)",
                    background: "oklch(0.99 0 0)",
                  }}
                />
              </div>

              {erro && (
                <div className="shake flex items-center gap-2 px-3 py-2.5 rounded-lg text-[13px]"
                  style={{ background: "oklch(0.97 0.02 25)", border: "1px solid oklch(0.88 0.08 25)", color: "oklch(0.45 0.20 25)" }}>
                  {erro}
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading || cpf.replace(/\D/g, "").length !== 11}
                className="w-full rounded-lg py-[11px] text-[14px] font-bold text-white transition-all duration-150 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                style={{
                  background: isLoading || cpf.replace(/\D/g, "").length !== 11
                    ? "oklch(0.60 0.08 145)"
                    : "linear-gradient(135deg, oklch(0.38 0.12 145), oklch(0.44 0.14 150))",
                  boxShadow: isLoading || cpf.replace(/\D/g, "").length !== 11
                    ? "none"
                    : "0 4px 16px oklch(0.38 0.12 145 / 0.35)",
                }}
              >
                {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                {isLoading ? "Enviando código..." : "Enviar código de acesso"}
              </button>

              <p className="text-center text-[12px] mt-2" style={{ color: "oklch(0.65 0.03 140)" }}>
                Use o CPF cadastrado no sistema.
              </p>
            </form>
          )}

          {/* ── Step 2: OTP ── */}
          {step === "otp" && (
            <form onSubmit={handleOtpSubmit} className="space-y-5">
              {/* Channel badge */}
              <div
                className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-[13px]"
                style={{ background: "oklch(0.94 0.04 145)", color: "oklch(0.28 0.10 145)" }}
              >
                <MessageCircle className="w-4 h-4 shrink-0" />
                <span>
                  Olá, <strong>{produtorNome.split(" ")[0]}</strong>! Código enviado para{" "}
                  <strong>{maskedPhone}</strong> via{" "}
                  <strong>{channel === "whatsapp" ? "WhatsApp" : "Telegram"}</strong>.
                </span>
              </div>

              {/* 6-digit OTP inputs */}
              <div className="space-y-1.5">
                <label className="block text-[11px] font-bold uppercase tracking-[0.5px]"
                  style={{ color: "oklch(0.52 0.04 140)" }}>
                  Código de verificação
                </label>
                <div className="flex gap-2 justify-between">
                  {code.map((digit, idx) => (
                    <input
                      key={idx}
                      ref={(el) => { inputRefs.current[idx] = el; }}
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      value={digit}
                      onChange={(e) => handleCodeInput(idx, e.target.value)}
                      onKeyDown={(e) => handleCodeKeyDown(idx, e)}
                      onFocus={(e) => e.target.select()}
                      disabled={isLoading}
                      className="w-full aspect-square text-center text-[20px] font-bold rounded-xl outline-none transition-all duration-150"
                      style={{
                        border: erro
                          ? "2px solid oklch(0.65 0.20 25)"
                          : digit
                          ? "2px solid oklch(0.38 0.12 145)"
                          : "2px solid oklch(0.88 0.02 130)",
                        color: "oklch(0.18 0.04 145)",
                        background: digit ? "oklch(0.96 0.03 145)" : "oklch(0.99 0 0)",
                        boxShadow: digit ? "0 0 0 3px oklch(0.38 0.12 145 / 0.12)" : "none",
                      }}
                    />
                  ))}
                </div>
              </div>

              {erro && (
                <div className="shake flex items-center gap-2 px-3 py-2.5 rounded-lg text-[13px]"
                  style={{ background: "oklch(0.97 0.02 25)", border: "1px solid oklch(0.88 0.08 25)", color: "oklch(0.45 0.20 25)" }}>
                  {erro}
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading || code.join("").length !== 6}
                className="w-full rounded-lg py-[11px] text-[14px] font-bold text-white transition-all duration-150 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                style={{
                  background: isLoading || code.join("").length !== 6
                    ? "oklch(0.60 0.08 145)"
                    : "linear-gradient(135deg, oklch(0.38 0.12 145), oklch(0.44 0.14 150))",
                  boxShadow: isLoading || code.join("").length !== 6
                    ? "none"
                    : "0 4px 16px oklch(0.38 0.12 145 / 0.35)",
                }}
              >
                {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                {isLoading ? "Verificando..." : "Confirmar e entrar"}
              </button>

              {/* Actions */}
              <div className="flex items-center justify-between pt-1">
                <button
                  type="button"
                  onClick={() => { setStep("cpf"); setErro(""); setCode(["", "", "", "", "", ""]); }}
                  className="text-[12px] flex items-center gap-1 transition-opacity hover:opacity-70"
                  style={{ color: "oklch(0.52 0.04 140)" }}
                >
                  ← Alterar CPF
                </button>
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={sendOtp.isPending}
                  className="text-[12px] flex items-center gap-1 transition-opacity hover:opacity-70 disabled:opacity-40"
                  style={{ color: "oklch(0.38 0.12 145)" }}
                >
                  <RotateCcw className="w-3 h-3" />
                  Reenviar código
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
