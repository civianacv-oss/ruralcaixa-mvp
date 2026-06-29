/**
 * ProcuracaoGate.tsx
 *
 * Tela exibida quando o usuário logado tem role="procurador" e precisa
 * verificar o status da sua procuração antes de acessar o sistema.
 *
 * Estados possíveis:
 *  - sem procuração → formulário de upload
 *  - pendente → aguardando aprovação do admin
 *  - aprovado → botão para continuar ao sistema
 *  - rejeitado → motivo + opção de reenviar
 */

import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { clearSession, getProdutorNome, getRole } from "@/lib/api";
import {
  CheckCircle,
  Clock,
  XCircle,
  Upload,
  FileText,
  Leaf,
  LogOut,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";

// ─── Estilos ──────────────────────────────────────────────────────────────────

const BG =
  "linear-gradient(135deg, oklch(0.20 0.06 145) 0%, oklch(0.30 0.08 145) 50%, oklch(0.22 0.05 160) 100%)";
const CARD_BG = "oklch(1 0 0 / 0.97)";
const CARD_SHADOW =
  "0 32px 64px oklch(0.10 0.04 145 / 0.40), 0 0 0 1px oklch(0.90 0.02 130 / 0.5)";
const GREEN_DARK = "oklch(0.18 0.04 145)";
const GREEN_MID = "oklch(0.52 0.04 140)";
const GREEN_BTN = "linear-gradient(135deg, oklch(0.38 0.12 145), oklch(0.50 0.14 155))";
const GREEN_BTN_SHADOW = "0 4px 14px oklch(0.38 0.12 145 / 0.35)";

function formatCPF(v: string): string {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ProcuracaoGate() {
  const [, navigate] = useLocation();
  const produtorNome = getProdutorNome();
  const role = getRole();

  // Upload form state
  const [produtorCpf, setProdutorCpf] = useState("");
  const [procuracaoFile, setProcuracaoFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [shake, setShake] = useState(false);
  const [showUploadForm, setShowUploadForm] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Query: status atual da procuração
  const statusQ = trpc.procuracao.status.useQuery(undefined, {
    refetchInterval: 30_000, // poll a cada 30s para detectar aprovação
  });

  const uploadMutation = trpc.procuracao.upload.useMutation({
    onSuccess: () => {
      toast.success("Procuração enviada! Aguardando aprovação.");
      statusQ.refetch();
      setShowUploadForm(false);
      setProcuracaoFile(null);
      setProdutorCpf("");
    },
    onError: (e) => {
      toast.error(e.message);
    },
  });

  function triggerShake() {
    setShake(true);
    setTimeout(() => setShake(false), 500);
  }

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!procuracaoFile) {
      toast.error("Selecione o arquivo da procuração.");
      triggerShake();
      return;
    }
    const prodDigits = produtorCpf.replace(/\D/g, "");
    if (prodDigits.length !== 11) {
      toast.error("Digite o CPF do produtor representado.");
      triggerShake();
      return;
    }

    setIsUploading(true);
    try {
      const arrayBuffer = await procuracaoFile.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      let binary = "";
      for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
      const base64 = btoa(binary);

      const cpfProcurador = localStorage.getItem("rc_produtor_cpf") ?? "";

      await uploadMutation.mutateAsync({
        procuradorCpf: cpfProcurador,
        procuradorNome: produtorNome || undefined,
        produtorCpf: prodDigits,
        fileBase64: base64,
        fileName: procuracaoFile.name,
        mimeType: procuracaoFile.type || "application/pdf",
      });
    } finally {
      setIsUploading(false);
    }
  }

  function handleLogout() {
    clearSession();
    navigate("/login");
  }

  const proc = statusQ.data;
  const isLoading = statusQ.isLoading;

  // Se não é procurador, redirecionar para o sistema (via useEffect para evitar render-time navigation)
  useEffect(() => {
    if (role !== "procurador") navigate("/dashboard");
  }, [role, navigate]);

  if (role !== "procurador") return null;

  return (
    <div
      className="fixed inset-0 flex items-center justify-center overflow-hidden"
      style={{ background: BG }}
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
        className="relative z-10 w-full max-w-[440px] mx-4"
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
            background: CARD_BG,
            backdropFilter: "blur(20px)",
            boxShadow: CARD_SHADOW,
          }}
        >
          {/* Header */}
          <div className="flex flex-col items-center mb-6">
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center mb-3"
              style={{ background: GREEN_BTN, boxShadow: GREEN_BTN_SHADOW }}
            >
              <FileText className="w-7 h-7 text-white" strokeWidth={1.5} />
            </div>
            <h1
              className="text-[22px] font-bold tracking-tight"
              style={{ fontFamily: "'Playfair Display', serif", color: GREEN_DARK }}
            >
              RuralCaixa
            </h1>
            <p className="text-[13px] mt-1 text-center" style={{ color: GREEN_MID }}>
              Acesso via Procuração
            </p>
          </div>

          {/* Loading */}
          {isLoading && (
            <div className="flex flex-col items-center gap-3 py-8">
              <div
                className="w-10 h-10 rounded-full border-2 border-t-transparent animate-spin"
                style={{ borderColor: "oklch(0.50 0.14 155)", borderTopColor: "transparent" }}
              />
              <p className="text-[13px]" style={{ color: GREEN_MID }}>
                Verificando procuração...
              </p>
            </div>
          )}

          {/* Sem procuração ou reenvio */}
          {!isLoading && (!proc || showUploadForm) && (
            <form onSubmit={handleUpload} className={`space-y-4 ${shake ? "shake" : ""}`}>
              <div
                className="rounded-xl p-4 text-[13px]"
                style={{
                  background: "oklch(0.96 0.02 145)",
                  border: "1px solid oklch(0.88 0.04 145)",
                  color: "oklch(0.35 0.08 145)",
                }}
              >
                {showUploadForm
                  ? "Envie uma nova procuração para reanalise."
                  : "Para acessar o sistema como procurador, envie o documento de procuração assinado. O acesso será liberado após aprovação do administrador."}
              </div>

              {/* CPF do produtor */}
              <div className="space-y-1.5">
                <label
                  className="block text-[11px] font-bold uppercase tracking-[0.5px]"
                  style={{ color: GREEN_MID }}
                >
                  CPF do Produtor Representado
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="000.000.000-00"
                  value={produtorCpf}
                  onChange={(e) => setProdutorCpf(formatCPF(e.target.value))}
                  disabled={isUploading}
                  className="w-full rounded-lg px-3 py-[10px] text-[15px] outline-none transition-all duration-200"
                  style={{
                    border: "1.5px solid oklch(0.88 0.02 130)",
                    letterSpacing: "1px",
                    color: GREEN_DARK,
                    background: "oklch(0.99 0 0)",
                  }}
                  onFocus={(e) => {
                    e.target.style.borderColor = "oklch(0.50 0.14 155)";
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = "oklch(0.88 0.02 130)";
                  }}
                />
              </div>

              {/* Upload area */}
              <div
                className="rounded-xl border-2 border-dashed p-6 text-center cursor-pointer transition-all duration-200"
                style={{
                  borderColor: procuracaoFile
                    ? "oklch(0.50 0.14 155)"
                    : "oklch(0.82 0.04 145)",
                  background: procuracaoFile
                    ? "oklch(0.96 0.02 145)"
                    : "oklch(0.99 0 0)",
                }}
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  className="hidden"
                  onChange={(e) => setProcuracaoFile(e.target.files?.[0] ?? null)}
                />
                {procuracaoFile ? (
                  <div className="flex flex-col items-center gap-2">
                    <CheckCircle
                      className="w-8 h-8"
                      style={{ color: "oklch(0.50 0.14 155)" }}
                    />
                    <span
                      className="text-[13px] font-medium"
                      style={{ color: GREEN_DARK }}
                    >
                      {procuracaoFile.name}
                    </span>
                    <span className="text-[11px]" style={{ color: GREEN_MID }}>
                      Clique para trocar
                    </span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <Upload
                      className="w-8 h-8"
                      style={{ color: "oklch(0.65 0.06 145)" }}
                    />
                    <span
                      className="text-[13px] font-medium"
                      style={{ color: GREEN_DARK }}
                    >
                      Clique para selecionar
                    </span>
                    <span className="text-[11px]" style={{ color: GREEN_MID }}>
                      PDF, JPG ou PNG — máx. 10 MB
                    </span>
                  </div>
                )}
              </div>

              <button
                type="submit"
                disabled={isUploading || !procuracaoFile}
                className="w-full rounded-xl py-3 text-[15px] font-semibold text-white transition-all duration-200 active:scale-[0.97]"
                style={{
                  background: GREEN_BTN,
                  boxShadow: GREEN_BTN_SHADOW,
                  opacity: isUploading || !procuracaoFile ? 0.6 : 1,
                }}
              >
                {isUploading ? "Enviando..." : "Enviar procuração"}
              </button>

              {showUploadForm && (
                <button
                  type="button"
                  onClick={() => setShowUploadForm(false)}
                  className="w-full text-[12px] text-center hover:opacity-70 transition-opacity"
                  style={{ color: GREEN_MID }}
                >
                  ← Voltar
                </button>
              )}
            </form>
          )}

          {/* Pendente */}
          {!isLoading && proc?.status === "pendente" && !showUploadForm && (
            <div className="space-y-5 text-center">
              <div className="flex justify-center">
                <Clock
                  className="w-14 h-14"
                  style={{ color: "oklch(0.65 0.12 80)" }}
                />
              </div>
              <div>
                <p
                  className="text-[15px] font-semibold"
                  style={{ color: GREEN_DARK }}
                >
                  Procuração em análise
                </p>
                <p className="text-[13px] mt-2" style={{ color: GREEN_MID }}>
                  Sua solicitação foi recebida e está aguardando aprovação do administrador. Você será notificado quando o acesso for liberado.
                </p>
              </div>
              <div
                className="rounded-xl px-4 py-3 text-[12px]"
                style={{
                  background: "oklch(0.97 0.04 80)",
                  border: "1px solid oklch(0.90 0.08 80)",
                  color: "oklch(0.45 0.10 80)",
                }}
              >
                Prazo estimado: até 1 dia útil
              </div>
              <button
                type="button"
                onClick={() => statusQ.refetch()}
                className="flex items-center gap-2 mx-auto text-[13px] font-medium transition-opacity hover:opacity-70"
                style={{ color: "oklch(0.50 0.14 155)" }}
              >
                <RefreshCw className="w-4 h-4" />
                Verificar novamente
              </button>
            </div>
          )}

          {/* Aprovado */}
          {!isLoading && proc?.status === "aprovado" && !showUploadForm && (
            <div className="space-y-5 text-center">
              <div className="flex justify-center">
                <CheckCircle
                  className="w-14 h-14"
                  style={{ color: "oklch(0.50 0.14 155)" }}
                />
              </div>
              <div>
                <p
                  className="text-[15px] font-semibold"
                  style={{ color: GREEN_DARK }}
                >
                  Procuração aprovada!
                </p>
                <p className="text-[13px] mt-2" style={{ color: GREEN_MID }}>
                  Seu acesso foi liberado. Clique no botão abaixo para entrar no sistema.
                </p>
              </div>
              {proc.adminNota && (
                <div
                  className="rounded-xl px-4 py-3 text-[12px] text-left"
                  style={{
                    background: "oklch(0.96 0.03 145)",
                    border: "1px solid oklch(0.88 0.06 145)",
                    color: "oklch(0.38 0.08 145)",
                  }}
                >
                  <strong>Nota do administrador:</strong> {proc.adminNota}
                </div>
              )}
              <button
                type="button"
                onClick={() => navigate("/selecionar-imovel")}
                className="w-full rounded-xl py-3 text-[15px] font-semibold text-white transition-all duration-200 active:scale-[0.97]"
                style={{ background: GREEN_BTN, boxShadow: GREEN_BTN_SHADOW }}
              >
                Entrar no sistema
              </button>
            </div>
          )}

          {/* Rejeitado */}
          {!isLoading && proc?.status === "rejeitado" && !showUploadForm && (
            <div className="space-y-5 text-center">
              <div className="flex justify-center">
                <XCircle
                  className="w-14 h-14"
                  style={{ color: "oklch(0.55 0.20 25)" }}
                />
              </div>
              <div>
                <p
                  className="text-[15px] font-semibold"
                  style={{ color: GREEN_DARK }}
                >
                  Procuração rejeitada
                </p>
                <p className="text-[13px] mt-2" style={{ color: GREEN_MID }}>
                  Sua solicitação foi rejeitada. Verifique o motivo abaixo e envie uma nova procuração se necessário.
                </p>
              </div>
              {proc.adminNota && (
                <div
                  className="rounded-xl px-4 py-3 text-[12px] text-left"
                  style={{
                    background: "oklch(0.97 0.02 25)",
                    border: "1px solid oklch(0.90 0.06 25)",
                    color: "oklch(0.45 0.18 25)",
                  }}
                >
                  <strong>Motivo:</strong> {proc.adminNota}
                </div>
              )}
              <button
                type="button"
                onClick={() => setShowUploadForm(true)}
                className="w-full rounded-xl py-3 text-[15px] font-semibold text-white transition-all duration-200 active:scale-[0.97]"
                style={{ background: GREEN_BTN, boxShadow: GREEN_BTN_SHADOW }}
              >
                Enviar nova procuração
              </button>
            </div>
          )}

          {/* Footer: logout */}
          <div className="mt-6 pt-4" style={{ borderTop: "1px solid oklch(0.92 0.02 130)" }}>
            <button
              type="button"
              onClick={handleLogout}
              className="flex items-center gap-2 mx-auto text-[12px] transition-opacity hover:opacity-70"
              style={{ color: GREEN_MID }}
            >
              <LogOut className="w-3.5 h-3.5" />
              Sair da conta
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
