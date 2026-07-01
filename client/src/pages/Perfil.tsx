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
  Bell,
  BellOff,
  Clock,
  Package,
  Play,
  History,
} from "lucide-react";
import { getProdutorId, getProdutorNome } from "@/lib/api";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDateTime(d: Date | string): string {
  return new Date(d).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const NIVEL_LABELS: Record<string, string> = {
  critico: "Somente urgentes",
  atencao: "Somente atenção",
  ambos: "Urgentes e atenção",
};

const STATUS_CANAL: Record<string, { label: string; color: string }> = {
  telegram_direct: { label: "Telegram direto", color: "oklch(0.38 0.12 145)" },
  telegram_group: { label: "Grupo Telegram", color: "oklch(0.55 0.16 30)" },
  nenhum: { label: "Sem alertas", color: "oklch(0.60 0.04 140)" },
};

// ─── Componente principal ─────────────────────────────────────────────────────

export default function Perfil() {
  const produtorId = getProdutorId();
  const produtorNome = getProdutorNome();

  // ── Estado: canal de verificação (2FA) ──
  const [telegramChatId, setTelegramChatId] = useState("");
  const [whatsappPriority, setWhatsappPriority] = useState(false);
  const [saved2fa, setSaved2fa] = useState(false);

  // ── Estado: alertas de estoque ──
  const [alertasAtivo, setAlertasAtivo] = useState(true);
  const [nivelMinimo, setNivelMinimo] = useState<"critico" | "atencao" | "ambos">("ambos");
  const [horaEnvio, setHoraEnvio] = useState(7);
  const [cooldownHoras, setCooldownHoras] = useState(24);
  const [savedAlertas, setSavedAlertas] = useState(false);

  // ── Queries / mutations ──
  const { data: config, isLoading } = trpc.produtorConfig.get.useQuery(undefined, { retry: false });
  const { data: alertasConfig, isLoading: loadingAlertas } = trpc.alertasEstoque.getConfig.useQuery(undefined, { retry: false });
  const { data: logs } = trpc.alertasEstoque.getLogs.useQuery(undefined, { retry: false });

  const saveConfig = trpc.produtorConfig.save.useMutation({
    onSuccess: () => {
      setSaved2fa(true);
      toast.success("Configurações de canal salvas!");
      setTimeout(() => setSaved2fa(false), 3000);
    },
    onError: (err) => toast.error(err.message || "Erro ao salvar."),
  });

  const saveAlertas = trpc.alertasEstoque.saveConfig.useMutation({
    onSuccess: () => {
      setSavedAlertas(true);
      toast.success("Alertas de estoque configurados!");
      setTimeout(() => setSavedAlertas(false), 3000);
    },
    onError: (err) => toast.error(err.message || "Erro ao salvar alertas."),
  });

  const testarAlerta = trpc.alertasEstoque.testar.useMutation({
    onSuccess: (data) => {
      if (data.enviados > 0) {
        toast.success(`Alerta de teste enviado para ${data.enviados} imóvel(is)!`);
      } else {
        toast.info("Nenhum alerta enviado — sem insumos críticos ou em cooldown.");
      }
    },
    onError: (err) => toast.error(err.message || "Erro ao enviar alerta de teste."),
  });

  // Preencher formulário quando dados carregarem
  useEffect(() => {
    if (config) {
      setTelegramChatId(config.telegramChatId ?? "");
      setWhatsappPriority(config.whatsappPriority ?? false);
    }
  }, [config]);

  useEffect(() => {
    if (alertasConfig) {
      setAlertasAtivo(alertasConfig.ativo ?? true);
      setNivelMinimo((alertasConfig.nivelMinimo as "critico" | "atencao" | "ambos") ?? "ambos");
      setHoraEnvio(alertasConfig.horaEnvio ?? 7);
      setCooldownHoras(alertasConfig.cooldownHoras ?? 24);
    }
  }, [alertasConfig]);

  function handleSave2fa(e: React.FormEvent) {
    e.preventDefault();
    saveConfig.mutate({ telegramChatId: telegramChatId.trim() || null, whatsappPriority });
  }

  function handleSaveAlertas(e: React.FormEvent) {
    e.preventDefault();
    saveAlertas.mutate({ ativo: alertasAtivo, nivelMinimo, horaEnvio, cooldownHoras });
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
            <p className="text-white/70 text-sm mt-0.5">ID #{produtorId ?? "—"}</p>
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

      {/* ── Seção 1: Canal de verificação (2FA) ── */}
      <form onSubmit={handleSave2fa}>
        <div
          className="rounded-2xl overflow-hidden"
          style={{
            background: "white",
            border: "1px solid oklch(0.92 0.02 130)",
            boxShadow: "0 4px 16px oklch(0.18 0.04 145 / 0.06)",
          }}
        >
          <div
            className="px-6 py-4 flex items-center gap-3"
            style={{ borderBottom: "1px solid oklch(0.94 0.02 130)", background: "oklch(0.98 0.01 145)" }}
          >
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "oklch(0.94 0.04 145)" }}>
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
            {/* Status do canal */}
            <div
              className="flex items-start gap-3 px-4 py-3 rounded-xl text-sm"
              style={{
                background: hasTelegramId ? "oklch(0.94 0.04 145)" : "oklch(0.96 0.02 200)",
                color: hasTelegramId ? "oklch(0.28 0.10 145)" : "oklch(0.35 0.08 220)",
              }}
            >
              <Info className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                {isLoading ? "Carregando configurações..." : hasTelegramId ? (
                  <>Canal ativo: <strong>Telegram direto</strong> (Chat ID configurado).</>
                ) : (
                  <>Canal ativo: <strong>Grupo do Telegram</strong> (padrão). Configure seu Chat ID abaixo.</>
                )}
              </span>
            </div>

            {/* Telegram Chat ID */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label htmlFor="telegramChatId" className="block text-xs font-bold uppercase tracking-wider" style={{ color: "oklch(0.52 0.04 140)" }}>
                  Telegram Chat ID (pessoal)
                </label>
                {hasTelegramId && (
                  <span className="flex items-center gap-1 text-xs font-semibold" style={{ color: "oklch(0.38 0.12 145)" }}>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Configurado
                  </span>
                )}
              </div>
              <div className="relative">
                <Send className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "oklch(0.65 0.06 145)" }} />
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
                <a href="https://t.me/userinfobot" target="_blank" rel="noopener noreferrer" className="font-semibold underline inline-flex items-center gap-0.5" style={{ color: "oklch(0.38 0.12 145)" }}>
                  @userinfobot
                  <ExternalLink className="w-3 h-3" />
                </a>{" "}
                no Telegram e copie o número exibido.
              </p>
            </div>

            {/* WhatsApp priority */}
            <div className="flex items-start justify-between gap-4 p-4 rounded-xl" style={{ background: "oklch(0.97 0.01 145)", border: "1px solid oklch(0.92 0.02 130)" }}>
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: whatsappPriority ? "oklch(0.92 0.12 145)" : "oklch(0.92 0.02 130)" }}>
                  <Smartphone className="w-5 h-5" style={{ color: whatsappPriority ? "oklch(0.38 0.12 145)" : "oklch(0.60 0.04 140)" }} />
                </div>
                <div>
                  <p className="text-sm font-semibold" style={{ color: "oklch(0.18 0.04 145)" }}>Prioridade WhatsApp</p>
                  <p className="text-xs mt-0.5" style={{ color: "oklch(0.52 0.04 140)" }}>
                    Ativar quando a Meta aprovar a integração. WhatsApp será o canal principal e Telegram o fallback.
                  </p>
                  {whatsappPriority && (
                    <div className="flex items-center gap-1.5 mt-2 text-xs font-semibold" style={{ color: "oklch(0.55 0.16 30)" }}>
                      <AlertCircle className="w-3.5 h-3.5" />
                      Ative somente após aprovação da Meta
                    </div>
                  )}
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={whatsappPriority}
                onClick={() => setWhatsappPriority((v) => !v)}
                className="shrink-0 relative w-11 h-6 rounded-full transition-all duration-200 focus:outline-none"
                style={{ background: whatsappPriority ? "oklch(0.38 0.12 145)" : "oklch(0.85 0.02 130)" }}
              >
                <span className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-200" style={{ transform: whatsappPriority ? "translateX(20px)" : "translateX(0)" }} />
              </button>
            </div>

            {/* Botão salvar 2FA */}
            <button
              type="submit"
              disabled={saveConfig.isPending || isLoading}
              className="w-full rounded-xl py-2.5 text-sm font-bold text-white transition-all duration-150 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              style={{
                background: saved2fa ? "oklch(0.45 0.14 155)" : "linear-gradient(135deg, oklch(0.38 0.12 145), oklch(0.44 0.14 150))",
                boxShadow: "0 4px 16px oklch(0.38 0.12 145 / 0.25)",
              }}
            >
              {saveConfig.isPending ? (
                <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Salvando...</>
              ) : saved2fa ? (
                <><CheckCircle2 className="w-4 h-4" />Salvo com sucesso!</>
              ) : "Salvar canal de verificação"}
            </button>
          </div>
        </div>
      </form>

      {/* ── Seção 2: Alertas automáticos de estoque ── */}
      <form onSubmit={handleSaveAlertas}>
        <div
          className="rounded-2xl overflow-hidden"
          style={{
            background: "white",
            border: "1px solid oklch(0.92 0.02 130)",
            boxShadow: "0 4px 16px oklch(0.18 0.04 145 / 0.06)",
          }}
        >
          {/* Header da seção */}
          <div
            className="px-6 py-4 flex items-center justify-between gap-3"
            style={{ borderBottom: "1px solid oklch(0.94 0.02 130)", background: "oklch(0.98 0.01 145)" }}
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: alertasAtivo ? "oklch(0.92 0.08 50)" : "oklch(0.92 0.02 130)" }}>
                {alertasAtivo ? (
                  <Bell className="w-5 h-5" style={{ color: "oklch(0.55 0.16 50)" }} />
                ) : (
                  <BellOff className="w-5 h-5" style={{ color: "oklch(0.60 0.04 140)" }} />
                )}
              </div>
              <div>
                <p className="font-semibold text-sm" style={{ color: "oklch(0.18 0.04 145)" }}>
                  Alertas Automáticos de Estoque
                </p>
                <p className="text-xs mt-0.5" style={{ color: "oklch(0.52 0.04 140)" }}>
                  Receba notificações no Telegram quando insumos estiverem críticos
                </p>
              </div>
            </div>
            {/* Toggle ativo/inativo */}
            <button
              type="button"
              role="switch"
              aria-checked={alertasAtivo}
              onClick={() => setAlertasAtivo((v) => !v)}
              className="shrink-0 relative w-11 h-6 rounded-full transition-all duration-200 focus:outline-none"
              style={{ background: alertasAtivo ? "oklch(0.38 0.12 145)" : "oklch(0.85 0.02 130)" }}
            >
              <span className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-200" style={{ transform: alertasAtivo ? "translateX(20px)" : "translateX(0)" }} />
            </button>
          </div>

          <div className="p-6 space-y-5">
            {/* Banner de pré-requisito */}
            {!hasTelegramId && (
              <div
                className="flex items-start gap-3 px-4 py-3 rounded-xl text-sm"
                style={{ background: "oklch(0.97 0.04 50)", border: "1px solid oklch(0.88 0.08 50)", color: "oklch(0.45 0.14 50)" }}
              >
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  <strong>Configure seu Telegram Chat ID</strong> na seção acima para receber alertas diretamente no seu Telegram pessoal. Sem o Chat ID, os alertas serão enviados apenas para o grupo.
                </span>
              </div>
            )}

            {/* Nível mínimo */}
            <div className="space-y-2">
              <label className="block text-xs font-bold uppercase tracking-wider" style={{ color: "oklch(0.52 0.04 140)" }}>
                Nível mínimo para alertar
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(["critico", "atencao", "ambos"] as const).map((nivel) => (
                  <button
                    key={nivel}
                    type="button"
                    onClick={() => setNivelMinimo(nivel)}
                    className="rounded-xl py-2 px-3 text-xs font-semibold transition-all duration-150"
                    style={{
                      background: nivelMinimo === nivel ? "oklch(0.38 0.12 145)" : "oklch(0.96 0.01 145)",
                      color: nivelMinimo === nivel ? "white" : "oklch(0.52 0.04 140)",
                      border: nivelMinimo === nivel ? "1.5px solid oklch(0.38 0.12 145)" : "1.5px solid oklch(0.88 0.02 130)",
                    }}
                  >
                    {NIVEL_LABELS[nivel]}
                  </button>
                ))}
              </div>
            </div>

            {/* Hora de envio + cooldown */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="block text-xs font-bold uppercase tracking-wider flex items-center gap-1.5" style={{ color: "oklch(0.52 0.04 140)" }}>
                  <Clock className="w-3.5 h-3.5" />
                  Hora do alerta diário
                </label>
                <select
                  value={horaEnvio}
                  onChange={(e) => setHoraEnvio(Number(e.target.value))}
                  className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
                  style={{ border: "1.5px solid oklch(0.88 0.02 130)", color: "oklch(0.18 0.04 145)", background: "oklch(0.99 0 0)" }}
                >
                  {Array.from({ length: 24 }, (_, i) => (
                    <option key={i} value={i}>
                      {String(i).padStart(2, "0")}:00
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <label className="block text-xs font-bold uppercase tracking-wider flex items-center gap-1.5" style={{ color: "oklch(0.52 0.04 140)" }}>
                  <Package className="w-3.5 h-3.5" />
                  Intervalo mínimo
                </label>
                <select
                  value={cooldownHoras}
                  onChange={(e) => setCooldownHoras(Number(e.target.value))}
                  className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
                  style={{ border: "1.5px solid oklch(0.88 0.02 130)", color: "oklch(0.18 0.04 145)", background: "oklch(0.99 0 0)" }}
                >
                  <option value={6}>A cada 6h</option>
                  <option value={12}>A cada 12h</option>
                  <option value={24}>A cada 24h</option>
                  <option value={48}>A cada 48h</option>
                  <option value={168}>Semanal</option>
                </select>
              </div>
            </div>

            {/* Botões: salvar + testar */}
            <div className="flex gap-3">
              <button
                type="submit"
                disabled={saveAlertas.isPending || loadingAlertas}
                className="flex-1 rounded-xl py-2.5 text-sm font-bold text-white transition-all duration-150 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                style={{
                  background: savedAlertas ? "oklch(0.45 0.14 155)" : "linear-gradient(135deg, oklch(0.38 0.12 145), oklch(0.44 0.14 150))",
                  boxShadow: "0 4px 16px oklch(0.38 0.12 145 / 0.25)",
                }}
              >
                {saveAlertas.isPending ? (
                  <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Salvando...</>
                ) : savedAlertas ? (
                  <><CheckCircle2 className="w-4 h-4" />Salvo!</>
                ) : "Salvar alertas"}
              </button>
              <button
                type="button"
                disabled={testarAlerta.isPending}
                onClick={() => testarAlerta.mutate()}
                className="rounded-xl px-4 py-2.5 text-sm font-semibold transition-all duration-150 active:scale-[0.98] disabled:opacity-60 flex items-center gap-2"
                style={{
                  background: "oklch(0.96 0.02 200)",
                  border: "1.5px solid oklch(0.88 0.04 220)",
                  color: "oklch(0.35 0.08 220)",
                }}
              >
                {testarAlerta.isPending ? (
                  <span className="w-4 h-4 border-2 border-current/30 border-t-current rounded-full animate-spin" />
                ) : (
                  <Play className="w-4 h-4" />
                )}
                Testar
              </button>
            </div>
          </div>
        </div>
      </form>

      {/* ── Seção 3: Histórico de alertas ── */}
      {logs && logs.length > 0 && (
        <div
          className="rounded-2xl overflow-hidden"
          style={{
            background: "white",
            border: "1px solid oklch(0.92 0.02 130)",
            boxShadow: "0 4px 16px oklch(0.18 0.04 145 / 0.06)",
          }}
        >
          <div
            className="px-6 py-4 flex items-center gap-3"
            style={{ borderBottom: "1px solid oklch(0.94 0.02 130)", background: "oklch(0.98 0.01 145)" }}
          >
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "oklch(0.94 0.04 145)" }}>
              <History className="w-5 h-5" style={{ color: "oklch(0.38 0.12 145)" }} />
            </div>
            <div>
              <p className="font-semibold text-sm" style={{ color: "oklch(0.18 0.04 145)" }}>
                Histórico de Alertas Enviados
              </p>
              <p className="text-xs mt-0.5" style={{ color: "oklch(0.52 0.04 140)" }}>
                Últimos {logs.length} alertas registrados
              </p>
            </div>
          </div>
          <div className="divide-y" style={{ borderColor: "oklch(0.94 0.02 130)" }}>
            {logs.map((log) => {
              const canalInfo = STATUS_CANAL[log.canal] ?? { label: log.canal, color: "oklch(0.52 0.04 140)" };
              const isEnviado = log.status === "enviado";
              return (
                <div key={log.id} className="px-6 py-3 flex items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className="text-xs font-semibold px-2 py-0.5 rounded-full"
                        style={{
                          background: isEnviado ? "oklch(0.92 0.06 145)" : "oklch(0.94 0.04 20)",
                          color: isEnviado ? "oklch(0.38 0.12 145)" : "oklch(0.55 0.16 20)",
                        }}
                      >
                        {isEnviado ? "Enviado" : log.status === "falhou" ? "Falhou" : "Ignorado"}
                      </span>
                      <span className="text-xs" style={{ color: canalInfo.color }}>
                        {canalInfo.label}
                      </span>
                    </div>
                    <p className="text-xs mt-1" style={{ color: "oklch(0.52 0.04 140)" }}>
                      {log.totalCriticos > 0 && <span className="text-red-600 font-semibold">{log.totalCriticos} urgente(s)</span>}
                      {log.totalCriticos > 0 && log.totalAtencao > 0 && " · "}
                      {log.totalAtencao > 0 && <span className="text-orange-500 font-semibold">{log.totalAtencao} atenção</span>}
                      {log.totalCriticos === 0 && log.totalAtencao === 0 && "Sem alertas"}
                    </p>
                  </div>
                  <span className="text-xs shrink-0" style={{ color: "oklch(0.60 0.04 140)" }}>
                    {fmtDateTime(log.criadoEm)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

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
          Como funcionam os alertas automáticos
        </p>
        <p>
          O sistema verifica diariamente os insumos de todas as suas propriedades e envia uma mensagem no Telegram quando detecta itens abaixo do estoque mínimo.
        </p>
        <ul className="list-disc list-inside space-y-1 pl-1">
          <li><strong>Telegram direto</strong> — se você configurou um Chat ID, o alerta vai direto para sua conversa privada.</li>
          <li><strong>Grupo do Telegram</strong> — canal padrão quando o Chat ID não está configurado.</li>
          <li><strong>Intervalo mínimo</strong> — evita spam: após um alerta, o próximo só é enviado após o período configurado.</li>
          <li><strong>Botão "Testar"</strong> — dispara um alerta imediato para verificar se está funcionando.</li>
        </ul>
      </div>
    </div>
  );
}
