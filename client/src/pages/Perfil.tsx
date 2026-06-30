import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  MessageCircle,
  Send,
  Smartphone,
  ShieldCheck,
  Info,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
} from "lucide-react";
import { getProdutorId, getProdutorNome } from "@/lib/api";

export default function Perfil() {
  const produtorId = getProdutorId();
  const produtorNome = getProdutorNome();
  const [telegramChatId, setTelegramChatId] = useState("");
  const [whatsappPriority, setWhatsappPriority] = useState(false);
  const [saved, setSaved] = useState(false);

  // Load current config
  const { data: config, isLoading } = trpc.produtorConfig.get.useQuery(undefined, {
    retry: false,
  });

  const saveConfig = trpc.produtorConfig.save.useMutation({
    onSuccess: () => {
      setSaved(true);
      toast.success("Configurações salvas com sucesso!");
      setTimeout(() => setSaved(false), 3000);
    },
    onError: (err) => {
      toast.error(err.message || "Erro ao salvar configurações.");
    },
  });

  // Populate form when config loads
  useEffect(() => {
    if (config) {
      setTelegramChatId(config.telegramChatId ?? "");
      setWhatsappPriority(config.whatsappPriority ?? false);
    }
  }, [config]);

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    saveConfig.mutate({
      telegramChatId: telegramChatId.trim() || null,
      whatsappPriority,
    });
  }

  const hasTelegramId = telegramChatId.trim().length > 0;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1
          className="text-2xl font-bold tracking-tight"
          style={{ fontFamily: "'Playfair Display', serif", color: "oklch(0.18 0.04 145)" }}
        >
          Perfil &amp; Configurações
        </h1>
        <p className="text-sm mt-1" style={{ color: "oklch(0.52 0.04 140)" }}>
          Gerencie suas preferências de notificação e segurança.
        </p>
      </div>

      {/* Producer info card */}
      <div
        className="rounded-2xl p-5"
        style={{
          background: "linear-gradient(135deg, oklch(0.38 0.12 145), oklch(0.44 0.14 150))",
          boxShadow: "0 8px 24px oklch(0.38 0.12 145 / 0.25)",
        }}
      >
        <div className="flex items-center gap-4">
          <div
            className="w-14 h-14 rounded-xl flex items-center justify-center text-white font-bold text-xl"
            style={{ background: "oklch(1 0 0 / 0.15)" }}
          >
            {produtorNome?.charAt(0).toUpperCase() ?? "P"}
          </div>
          <div>
            <p className="text-white font-semibold text-lg leading-tight">
              {produtorNome ?? "Produtor"}
            </p>
            <p className="text-white/70 text-sm mt-0.5">
              ID #{produtorId ?? "—"}
            </p>
          </div>
          <div className="ml-auto">
            <div
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold"
              style={{ background: "oklch(1 0 0 / 0.15)", color: "white" }}
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              Autenticado
            </div>
          </div>
        </div>
      </div>

      {/* Notification channel config */}
      <form onSubmit={handleSave}>
        <div
          className="rounded-2xl overflow-hidden"
          style={{
            background: "white",
            border: "1px solid oklch(0.92 0.02 130)",
            boxShadow: "0 4px 16px oklch(0.18 0.04 145 / 0.06)",
          }}
        >
          {/* Section header */}
          <div
            className="px-6 py-4 flex items-center gap-3"
            style={{ borderBottom: "1px solid oklch(0.94 0.02 130)", background: "oklch(0.98 0.01 145)" }}
          >
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ background: "oklch(0.94 0.04 145)" }}
            >
              <MessageCircle className="w-5 h-5" style={{ color: "oklch(0.38 0.12 145)" }} />
            </div>
            <div>
              <p className="font-semibold text-sm" style={{ color: "oklch(0.18 0.04 145)" }}>
                Canal de Verificação (2FA)
              </p>
              <p className="text-xs mt-0.5" style={{ color: "oklch(0.52 0.04 140)" }}>
                Configure como receber o código de acesso ao fazer login
              </p>
            </div>
          </div>

          <div className="p-6 space-y-6">
            {/* Current channel status */}
            <div
              className="flex items-start gap-3 px-4 py-3 rounded-xl text-sm"
              style={{
                background: hasTelegramId ? "oklch(0.94 0.04 145)" : "oklch(0.96 0.02 200)",
                color: hasTelegramId ? "oklch(0.28 0.10 145)" : "oklch(0.35 0.08 220)",
              }}
            >
              <Info className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                {isLoading ? (
                  "Carregando configurações..."
                ) : hasTelegramId ? (
                  <>
                    Canal ativo: <strong>Telegram direto</strong> (Chat ID configurado). O código chegará
                    diretamente na sua conversa privada com o bot.
                  </>
                ) : (
                  <>
                    Canal ativo: <strong>Grupo do Telegram</strong> (padrão). Configure seu Chat ID abaixo
                    para receber o código diretamente no seu Telegram pessoal.
                  </>
                )}
              </span>
            </div>

            {/* Telegram Chat ID */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="telegramChatId"
                  className="block text-xs font-bold uppercase tracking-wider"
                  style={{ color: "oklch(0.52 0.04 140)" }}
                >
                  Telegram Chat ID (pessoal)
                </label>
                {hasTelegramId && (
                  <span
                    className="flex items-center gap-1 text-xs font-semibold"
                    style={{ color: "oklch(0.38 0.12 145)" }}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Configurado
                  </span>
                )}
              </div>
              <div className="relative">
                <Send
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4"
                  style={{ color: "oklch(0.65 0.06 145)" }}
                />
                <input
                  id="telegramChatId"
                  type="text"
                  placeholder="Ex: 123456789"
                  value={telegramChatId}
                  onChange={(e) => setTelegramChatId(e.target.value.replace(/\D/g, ""))}
                  className="w-full rounded-xl pl-10 pr-4 py-2.5 text-sm outline-none transition-all duration-200"
                  style={{
                    border: "1.5px solid oklch(0.88 0.02 130)",
                    color: "oklch(0.18 0.04 145)",
                    background: "oklch(0.99 0 0)",
                    fontFamily: "monospace",
                    letterSpacing: "0.5px",
                  }}
                />
              </div>
              <p className="text-xs" style={{ color: "oklch(0.60 0.04 140)" }}>
                Para obter seu Chat ID: inicie uma conversa com{" "}
                <a
                  href="https://t.me/userinfobot"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold underline inline-flex items-center gap-0.5"
                  style={{ color: "oklch(0.38 0.12 145)" }}
                >
                  @userinfobot
                  <ExternalLink className="w-3 h-3" />
                </a>{" "}
                no Telegram e copie o número exibido.
              </p>
            </div>

            {/* WhatsApp priority toggle */}
            <div
              className="flex items-start justify-between gap-4 p-4 rounded-xl"
              style={{ background: "oklch(0.97 0.01 145)", border: "1px solid oklch(0.92 0.02 130)" }}
            >
              <div className="flex items-start gap-3">
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: whatsappPriority ? "oklch(0.92 0.12 145)" : "oklch(0.92 0.02 130)" }}
                >
                  <Smartphone
                    className="w-5 h-5"
                    style={{ color: whatsappPriority ? "oklch(0.38 0.12 145)" : "oklch(0.60 0.04 140)" }}
                  />
                </div>
                <div>
                  <p className="text-sm font-semibold" style={{ color: "oklch(0.18 0.04 145)" }}>
                    Prioridade WhatsApp
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: "oklch(0.52 0.04 140)" }}>
                    Ativar quando a Meta aprovar a integração. WhatsApp será o canal principal e Telegram o
                    fallback.
                  </p>
                  {whatsappPriority && (
                    <div
                      className="flex items-center gap-1.5 mt-2 text-xs font-semibold"
                      style={{ color: "oklch(0.55 0.16 30)" }}
                    >
                      <AlertCircle className="w-3.5 h-3.5" />
                      Ative somente após aprovação da Meta
                    </div>
                  )}
                </div>
              </div>
              {/* Toggle switch */}
              <button
                type="button"
                role="switch"
                aria-checked={whatsappPriority}
                onClick={() => setWhatsappPriority((v) => !v)}
                className="shrink-0 relative w-11 h-6 rounded-full transition-all duration-200 focus:outline-none"
                style={{
                  background: whatsappPriority ? "oklch(0.38 0.12 145)" : "oklch(0.85 0.02 130)",
                }}
              >
                <span
                  className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-200"
                  style={{ transform: whatsappPriority ? "translateX(20px)" : "translateX(0)" }}
                />
              </button>
            </div>

            {/* Save button */}
            <button
              type="submit"
              disabled={saveConfig.isPending || isLoading}
              className="w-full rounded-xl py-2.5 text-sm font-bold text-white transition-all duration-150 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              style={{
                background: saved
                  ? "oklch(0.45 0.14 155)"
                  : "linear-gradient(135deg, oklch(0.38 0.12 145), oklch(0.44 0.14 150))",
                boxShadow: "0 4px 16px oklch(0.38 0.12 145 / 0.25)",
              }}
            >
              {saveConfig.isPending ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Salvando...
                </>
              ) : saved ? (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  Salvo com sucesso!
                </>
              ) : (
                "Salvar configurações"
              )}
            </button>
          </div>
        </div>
      </form>

      {/* Info box */}
      <div
        className="rounded-xl p-4 text-sm space-y-2"
        style={{
          background: "oklch(0.97 0.02 200)",
          border: "1px solid oklch(0.88 0.04 220)",
          color: "oklch(0.35 0.08 220)",
        }}
      >
        <p className="font-semibold flex items-center gap-2">
          <Info className="w-4 h-4" />
          Como funciona a verificação em duas etapas
        </p>
        <p>
          Ao fazer login com seu CPF, o sistema envia um código de 6 dígitos válido por 5 minutos. O canal
          de envio é determinado pela configuração acima:
        </p>
        <ul className="list-disc list-inside space-y-1 pl-1">
          <li>
            <strong>Telegram direto</strong> — se você configurou um Chat ID, o código vai direto para sua
            conversa privada com o bot.
          </li>
          <li>
            <strong>Grupo do Telegram</strong> — canal padrão enquanto o Chat ID não está configurado.
          </li>
          <li>
            <strong>WhatsApp</strong> — disponível após aprovação da Meta; ative a opção acima quando
            receber a confirmação.
          </li>
        </ul>
      </div>
    </div>
  );
}
