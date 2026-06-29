import { useRef, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { setSession, setImovelNome, clearSession, setRole, setRcToken } from "@/lib/api";
import { Leaf, ShieldCheck, Users, Tractor, FileText, ChevronRight, Upload, CheckCircle, Clock, XCircle } from "lucide-react";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCPF(v: string): string {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

type Perfil = "contador" | "produtor" | "procurador";
type Step = "perfil" | "cpf" | "otp" | "procuracao_upload" | "procuracao_aguardo";
type Channel = "whatsapp" | "telegram_direct" | "telegram_group";

// ─── Estilos base ─────────────────────────────────────────────────────────────

const BG = "linear-gradient(135deg, oklch(0.20 0.06 145) 0%, oklch(0.30 0.08 145) 50%, oklch(0.22 0.05 160) 100%)";
const CARD_BG = "oklch(1 0 0 / 0.97)";
const CARD_SHADOW = "0 32px 64px oklch(0.10 0.04 145 / 0.40), 0 0 0 1px oklch(0.90 0.02 130 / 0.5)";
const GREEN_DARK = "oklch(0.18 0.04 145)";
const GREEN_MID = "oklch(0.52 0.04 140)";
const GREEN_BTN = "linear-gradient(135deg, oklch(0.38 0.12 145), oklch(0.50 0.14 155))";
const GREEN_BTN_SHADOW = "0 4px 14px oklch(0.38 0.12 145 / 0.35)";

// ─── Component ────────────────────────────────────────────────────────────────

export default function Login() {
  const [, navigate] = useLocation();
  const [step, setStep] = useState<Step>("perfil");
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [cpf, setCpf] = useState("");
  const [produtorCpf, setProdutorCpf] = useState(""); // for procurador: CPF do produtor representado
  const [nome, setNome] = useState("");
  const [code, setCode] = useState(["", "", "", "", "", ""]);
  const [channel, setChannel] = useState<Channel>("telegram_group");
  const [maskedPhone, setMaskedPhone] = useState("");
  const [erro, setErro] = useState("");
  const [shake, setShake] = useState(false);
  const [procuracaoFile, setProcuracaoFile] = useState<File | null>(null);
  const [procuracaoStatus, setProcuracaoStatus] = useState<"pendente" | "aprovado" | "rejeitado" | null>(null);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const sendOtp = trpc.auth.sendOtp.useMutation();
  const verifyOtp = trpc.auth.verifyOtp.useMutation();
  const uploadProcuracao = trpc.procuracao.upload.useMutation();

  function triggerShake() {
    setShake(true);
    setTimeout(() => setShake(false), 500);
  }

  // ── Step: Perfil ──────────────────────────────────────────────────────────

  function handlePerfilSelect(p: Perfil) {
    setPerfil(p);
    setErro("");
    setStep("cpf");
  }

  // ── Step: CPF ─────────────────────────────────────────────────────────────

  async function handleCpfSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    const digits = cpf.replace(/\D/g, "");
    if (digits.length !== 11) {
      setErro("Digite um CPF válido com 11 dígitos.");
      triggerShake();
      return;
    }

    if (perfil === "procurador") {
      // Procurador: verificar se já tem procuração enviada
      // Vai para etapa de upload ou aguardo
      setStep("procuracao_upload");
      return;
    }

    // Contador ou Produtor: enviar OTP
    try {
      const result = await sendOtp.mutateAsync({ cpf: digits });
      setChannel(result.channel as Channel);
      setMaskedPhone(result.maskedPhone);
      setStep("otp");
      setTimeout(() => inputRefs.current[0]?.focus(), 50);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro ao enviar código.";
      setErro(msg);
      triggerShake();
    }
  }

  // ── Step: OTP ─────────────────────────────────────────────────────────────

  async function handleOtpSubmit() {
    const fullCode = code.join("");
    if (fullCode.length !== 6) return;
    setErro("");
    try {
      const result = await verifyOtp.mutateAsync({ cpf: cpf.replace(/\D/g, ""), code: fullCode });
      setSession(result.produtorId, result.produtorNome ?? "", result.imovelId ?? undefined, cpf.replace(/\D/g, ""));
      setRole(result.role ?? "user");
      if (result.rcClaimsToken) setRcToken(result.rcClaimsToken);

      if (result.imovelCount === 1 && result.imovelId) {
        navigate("/dashboard");
      } else {
        navigate("/selecionar-imovel");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Código inválido.";
      setErro(msg);
      triggerShake();
      setCode(["", "", "", "", "", ""]);
      setTimeout(() => inputRefs.current[0]?.focus(), 50);
    }
  }

  function handleCodeInput(idx: number, val: string) {
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
    if (e.key === "Backspace" && !code[idx] && idx > 0) inputRefs.current[idx - 1]?.focus();
    if (e.key === "Enter" && code.join("").length === 6) handleOtpSubmit();
  }

  async function handleResend() {
    setErro("");
    setCode(["", "", "", "", "", ""]);
    try {
      const result = await sendOtp.mutateAsync({ cpf: cpf.replace(/\D/g, "") });
      setChannel(result.channel as Channel);
      setMaskedPhone(result.maskedPhone);
    } catch (err: unknown) {
      setErro(err instanceof Error ? err.message : "Erro ao reenviar código.");
    }
  }

  // ── Step: Procuração Upload ───────────────────────────────────────────────

  async function handleProcuracaoSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    if (!procuracaoFile) {
      setErro("Selecione o arquivo da procuração.");
      triggerShake();
      return;
    }
    const prodDigits = produtorCpf.replace(/\D/g, "");
    if (prodDigits.length !== 11) {
      setErro("Digite o CPF do produtor representado.");
      triggerShake();
      return;
    }
    try {
      const arrayBuffer = await procuracaoFile.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      let binary = "";
      for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
      const base64 = btoa(binary);
      await uploadProcuracao.mutateAsync({
        procuradorCpf: cpf.replace(/\D/g, ""),
        procuradorNome: nome || undefined,
        produtorCpf: prodDigits,
        fileBase64: base64,
        fileName: procuracaoFile.name,
        mimeType: procuracaoFile.type || "application/pdf",
      });
      setProcuracaoStatus("pendente");
      setStep("procuracao_aguardo");
    } catch (err: unknown) {
      setErro(err instanceof Error ? err.message : "Erro ao enviar procuração.");
      triggerShake();
    }
  }

  const isLoading = sendOtp.isPending || verifyOtp.isPending || uploadProcuracao.isPending;

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div
      className="fixed inset-0 flex items-center justify-center overflow-hidden"
      style={{ background: BG }}
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
        className="relative z-10 w-full max-w-[420px] mx-4"
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
          style={{ background: CARD_BG, backdropFilter: "blur(20px)", boxShadow: CARD_SHADOW }}
        >
          {/* Logo */}
          <div className="flex flex-col items-center mb-6">
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center mb-3"
              style={{ background: GREEN_BTN, boxShadow: GREEN_BTN_SHADOW }}
            >
              {step === "otp" ? (
                <ShieldCheck className="w-7 h-7 text-white" strokeWidth={1.5} />
              ) : step === "procuracao_upload" || step === "procuracao_aguardo" ? (
                <FileText className="w-7 h-7 text-white" strokeWidth={1.5} />
              ) : (
                <Leaf className="w-7 h-7 text-white" strokeWidth={1.5} />
              )}
            </div>
            <h1
              className="text-[22px] font-bold tracking-tight"
              style={{ fontFamily: "'Playfair Display', serif", color: GREEN_DARK }}
            >
              RuralCaixa
            </h1>
            <p className="text-[13px] mt-1 text-center" style={{ color: GREEN_MID }}>
              {step === "perfil" && "Selecione seu perfil de acesso"}
              {step === "cpf" && (perfil === "contador" ? "Acesso do Contador" : perfil === "procurador" ? "Acesso do Procurador" : "Acesso do Produtor")}
              {step === "otp" && (channel === "whatsapp" ? "Código enviado via WhatsApp ✓" : channel === "telegram_direct" ? "Código enviado via Telegram ✓" : "Verifique o grupo do Telegram ✓")}
              {step === "procuracao_upload" && "Envie sua procuração"}
              {step === "procuracao_aguardo" && "Aguardando aprovação"}
            </p>
          </div>

          {/* ── Step: Seleção de Perfil ── */}
          {step === "perfil" && (
            <div className="space-y-3">
              {[
                { key: "contador" as Perfil, icon: Users, label: "Contador", desc: "Acesso a múltiplos imóveis e produtores" },
                { key: "produtor" as Perfil, icon: Tractor, label: "Produtor", desc: "Acesso ao seu imóvel rural" },
                { key: "procurador" as Perfil, icon: FileText, label: "Procurador", desc: "Acesso mediante procuração" },
              ].map(({ key, icon: Icon, label, desc }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => handlePerfilSelect(key)}
                  className="w-full flex items-center gap-4 rounded-xl px-4 py-3.5 text-left transition-all duration-200 group"
                  style={{
                    border: "1.5px solid oklch(0.88 0.02 130)",
                    background: "oklch(0.99 0 0)",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.borderColor = "oklch(0.50 0.14 155)";
                    (e.currentTarget as HTMLButtonElement).style.background = "oklch(0.97 0.01 145)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.borderColor = "oklch(0.88 0.02 130)";
                    (e.currentTarget as HTMLButtonElement).style.background = "oklch(0.99 0 0)";
                  }}
                >
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ background: "oklch(0.94 0.03 145)" }}
                  >
                    <Icon className="w-5 h-5" style={{ color: "oklch(0.38 0.12 145)" }} strokeWidth={1.5} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[14px] font-semibold" style={{ color: GREEN_DARK }}>{label}</div>
                    <div className="text-[12px] mt-0.5" style={{ color: GREEN_MID }}>{desc}</div>
                  </div>
                  <ChevronRight className="w-4 h-4 flex-shrink-0 opacity-40" style={{ color: GREEN_DARK }} />
                </button>
              ))}
            </div>
          )}

          {/* ── Step: CPF ── */}
          {step === "cpf" && (
            <form onSubmit={handleCpfSubmit} className="space-y-4">
              {/* Perfil badge */}
              <div className="flex items-center gap-2 mb-1">
                <button
                  type="button"
                  onClick={() => { setStep("perfil"); setErro(""); setCpf(""); }}
                  className="text-[12px] flex items-center gap-1 transition-opacity hover:opacity-70"
                  style={{ color: "oklch(0.50 0.14 155)" }}
                >
                  ← Voltar
                </button>
                <span className="text-[12px]" style={{ color: GREEN_MID }}>
                  Perfil: <strong>{perfil === "contador" ? "Contador" : perfil === "procurador" ? "Procurador" : "Produtor"}</strong>
                </span>
              </div>

              <div className="space-y-1.5">
                <label className="block text-[11px] font-bold uppercase tracking-[0.5px]" style={{ color: GREEN_MID }}>
                  CPF
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="000.000.000-00"
                  value={cpf}
                  onChange={(e) => { setCpf(formatCPF(e.target.value)); setErro(""); }}
                  disabled={isLoading}
                  autoFocus
                  className="w-full rounded-lg px-3 py-[10px] text-[15px] outline-none transition-all duration-200"
                  style={{
                    border: erro ? "1.5px solid oklch(0.65 0.20 25)" : "1.5px solid oklch(0.88 0.02 130)",
                    letterSpacing: "1px",
                    color: GREEN_DARK,
                    background: "oklch(0.99 0 0)",
                  }}
                  onFocus={(e) => { if (!erro) e.target.style.borderColor = "oklch(0.50 0.14 155)"; }}
                  onBlur={(e) => { if (!erro) e.target.style.borderColor = "oklch(0.88 0.02 130)"; }}
                />
              </div>

              {/* Para procurador: CPF do produtor e nome */}
              {perfil === "procurador" && (
                <>
                  <div className="space-y-1.5">
                    <label className="block text-[11px] font-bold uppercase tracking-[0.5px]" style={{ color: GREEN_MID }}>
                      CPF do Produtor Representado
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      placeholder="000.000.000-00"
                      value={produtorCpf}
                      onChange={(e) => { setProdutorCpf(formatCPF(e.target.value)); setErro(""); }}
                      disabled={isLoading}
                      className="w-full rounded-lg px-3 py-[10px] text-[15px] outline-none transition-all duration-200"
                      style={{
                        border: "1.5px solid oklch(0.88 0.02 130)",
                        letterSpacing: "1px",
                        color: GREEN_DARK,
                        background: "oklch(0.99 0 0)",
                      }}
                      onFocus={(e) => { e.target.style.borderColor = "oklch(0.50 0.14 155)"; }}
                      onBlur={(e) => { e.target.style.borderColor = "oklch(0.88 0.02 130)"; }}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-[11px] font-bold uppercase tracking-[0.5px]" style={{ color: GREEN_MID }}>
                      Seu Nome Completo
                    </label>
                    <input
                      type="text"
                      placeholder="Nome do procurador"
                      value={nome}
                      onChange={(e) => setNome(e.target.value)}
                      disabled={isLoading}
                      className="w-full rounded-lg px-3 py-[10px] text-[14px] outline-none transition-all duration-200"
                      style={{
                        border: "1.5px solid oklch(0.88 0.02 130)",
                        color: GREEN_DARK,
                        background: "oklch(0.99 0 0)",
                      }}
                      onFocus={(e) => { e.target.style.borderColor = "oklch(0.50 0.14 155)"; }}
                      onBlur={(e) => { e.target.style.borderColor = "oklch(0.88 0.02 130)"; }}
                    />
                  </div>
                </>
              )}

              {erro && (
                <div
                  className={`rounded-lg px-3 py-2.5 text-[13px] ${shake ? "shake" : ""}`}
                  style={{ background: "oklch(0.97 0.02 25)", border: "1px solid oklch(0.90 0.06 25)", color: "oklch(0.45 0.18 25)" }}
                >
                  {erro}
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading}
                className="w-full rounded-xl py-3 text-[15px] font-semibold text-white transition-all duration-200 active:scale-[0.97]"
                style={{ background: GREEN_BTN, boxShadow: GREEN_BTN_SHADOW, opacity: isLoading ? 0.7 : 1 }}
              >
                {isLoading ? "Verificando..." : perfil === "procurador" ? "Continuar" : "Enviar código de acesso"}
              </button>

              <p className="text-center text-[12px]" style={{ color: GREEN_MID }}>
                Use o CPF <strong>cadastrado</strong> no sistema.
              </p>
            </form>
          )}

          {/* ── Step: OTP ── */}
          {step === "otp" && (
            <div className="space-y-5">
              {/* Canal badge */}
              <div
                className="rounded-lg px-3 py-2.5 text-[12px] text-center"
                style={{ background: "oklch(0.95 0.03 145)", color: "oklch(0.35 0.10 145)" }}
              >
                {channel === "whatsapp" && `📱 Código enviado para ${maskedPhone} via WhatsApp`}
                {channel === "telegram_direct" && `✈️ Código enviado para você no Telegram`}
                {channel === "telegram_group" && `✈️ Verifique o grupo do Telegram do RuralCaixa`}
              </div>

              {/* 6 digit inputs */}
              <div className="flex gap-2 justify-center">
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
                    className="w-11 h-12 text-center text-[20px] font-bold rounded-xl outline-none transition-all duration-150"
                    style={{
                      border: erro ? "2px solid oklch(0.65 0.20 25)" : digit ? "2px solid oklch(0.50 0.14 155)" : "2px solid oklch(0.88 0.02 130)",
                      color: GREEN_DARK,
                      background: digit ? "oklch(0.96 0.02 145)" : "oklch(0.99 0 0)",
                    }}
                  />
                ))}
              </div>

              {erro && (
                <div
                  className={`rounded-lg px-3 py-2.5 text-[13px] text-center ${shake ? "shake" : ""}`}
                  style={{ background: "oklch(0.97 0.02 25)", border: "1px solid oklch(0.90 0.06 25)", color: "oklch(0.45 0.18 25)" }}
                >
                  {erro}
                </div>
              )}

              <button
                type="button"
                onClick={handleOtpSubmit}
                disabled={isLoading || code.join("").length !== 6}
                className="w-full rounded-xl py-3 text-[15px] font-semibold text-white transition-all duration-200 active:scale-[0.97]"
                style={{ background: GREEN_BTN, boxShadow: GREEN_BTN_SHADOW, opacity: (isLoading || code.join("").length !== 6) ? 0.6 : 1 }}
              >
                {isLoading ? "Verificando..." : "Confirmar acesso"}
              </button>

              <div className="flex items-center justify-between text-[12px]" style={{ color: GREEN_MID }}>
                <button type="button" onClick={() => { setStep("cpf"); setErro(""); setCode(["","","","","",""]); }} className="hover:opacity-70 transition-opacity">
                  ← Voltar
                </button>
                <button type="button" onClick={handleResend} disabled={sendOtp.isPending} className="hover:opacity-70 transition-opacity">
                  Reenviar código
                </button>
              </div>
            </div>
          )}

          {/* ── Step: Procuração Upload ── */}
          {step === "procuracao_upload" && (
            <form onSubmit={handleProcuracaoSubmit} className="space-y-4">
              <div
                className="rounded-xl p-4 text-[13px]"
                style={{ background: "oklch(0.96 0.02 145)", border: "1px solid oklch(0.88 0.04 145)", color: "oklch(0.35 0.08 145)" }}
              >
                Para acessar o sistema como procurador, envie o documento de procuração assinado. O acesso será liberado após aprovação do administrador.
              </div>

              {/* Upload area */}
              <div
                className="rounded-xl border-2 border-dashed p-6 text-center cursor-pointer transition-all duration-200"
                style={{
                  borderColor: procuracaoFile ? "oklch(0.50 0.14 155)" : "oklch(0.82 0.04 145)",
                  background: procuracaoFile ? "oklch(0.96 0.02 145)" : "oklch(0.99 0 0)",
                }}
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  className="hidden"
                  onChange={(e) => { setProcuracaoFile(e.target.files?.[0] ?? null); setErro(""); }}
                />
                {procuracaoFile ? (
                  <div className="flex flex-col items-center gap-2">
                    <CheckCircle className="w-8 h-8" style={{ color: "oklch(0.50 0.14 155)" }} />
                    <span className="text-[13px] font-medium" style={{ color: GREEN_DARK }}>{procuracaoFile.name}</span>
                    <span className="text-[11px]" style={{ color: GREEN_MID }}>Clique para trocar</span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <Upload className="w-8 h-8" style={{ color: "oklch(0.65 0.06 145)" }} />
                    <span className="text-[13px] font-medium" style={{ color: GREEN_DARK }}>Clique para selecionar</span>
                    <span className="text-[11px]" style={{ color: GREEN_MID }}>PDF, JPG ou PNG — máx. 10 MB</span>
                  </div>
                )}
              </div>

              {erro && (
                <div
                  className={`rounded-lg px-3 py-2.5 text-[13px] ${shake ? "shake" : ""}`}
                  style={{ background: "oklch(0.97 0.02 25)", border: "1px solid oklch(0.90 0.06 25)", color: "oklch(0.45 0.18 25)" }}
                >
                  {erro}
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading || !procuracaoFile}
                className="w-full rounded-xl py-3 text-[15px] font-semibold text-white transition-all duration-200 active:scale-[0.97]"
                style={{ background: GREEN_BTN, boxShadow: GREEN_BTN_SHADOW, opacity: (isLoading || !procuracaoFile) ? 0.6 : 1 }}
              >
                {isLoading ? "Enviando..." : "Enviar procuração"}
              </button>

              <button
                type="button"
                onClick={() => { setStep("cpf"); setErro(""); setProcuracaoFile(null); }}
                className="w-full text-[12px] text-center hover:opacity-70 transition-opacity"
                style={{ color: GREEN_MID }}
              >
                ← Voltar
              </button>
            </form>
          )}

          {/* ── Step: Procuração Aguardo ── */}
          {step === "procuracao_aguardo" && (
            <div className="space-y-5 text-center">
              <div className="flex justify-center">
                {procuracaoStatus === "aprovado" ? (
                  <CheckCircle className="w-14 h-14" style={{ color: "oklch(0.50 0.14 155)" }} />
                ) : procuracaoStatus === "rejeitado" ? (
                  <XCircle className="w-14 h-14" style={{ color: "oklch(0.55 0.20 25)" }} />
                ) : (
                  <Clock className="w-14 h-14" style={{ color: "oklch(0.65 0.12 80)" }} />
                )}
              </div>

              {procuracaoStatus === "pendente" && (
                <>
                  <div>
                    <p className="text-[15px] font-semibold" style={{ color: GREEN_DARK }}>Procuração enviada!</p>
                    <p className="text-[13px] mt-2" style={{ color: GREEN_MID }}>
                      Sua solicitação foi recebida e está aguardando aprovação do administrador. Você será notificado quando o acesso for liberado.
                    </p>
                  </div>
                  <div
                    className="rounded-xl px-4 py-3 text-[12px]"
                    style={{ background: "oklch(0.97 0.04 80)", border: "1px solid oklch(0.90 0.08 80)", color: "oklch(0.45 0.10 80)" }}
                  >
                    Prazo estimado: até 1 dia útil
                  </div>
                </>
              )}

              <button
                type="button"
                onClick={() => { clearSession(); setStep("perfil"); setPerfil(null); setCpf(""); setProdutorCpf(""); setNome(""); setProcuracaoFile(null); setProcuracaoStatus(null); setErro(""); }}
                className="w-full rounded-xl py-3 text-[14px] font-medium transition-all duration-200"
                style={{ background: "oklch(0.94 0.03 145)", color: GREEN_DARK }}
              >
                Voltar ao início
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
