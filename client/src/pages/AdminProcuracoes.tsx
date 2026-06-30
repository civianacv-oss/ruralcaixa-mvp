import { useState } from "react";
import { trpc } from "@/lib/trpc";
import RuralLayout from "@/components/RuralLayout";
import { CheckCircle, XCircle, Clock, FileText, Eye, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";

type StatusFilter = "todos" | "pendente" | "aprovado" | "rejeitado";

export default function AdminProcuracoes() {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("todos");
  const [expanded, setExpanded] = useState<number | null>(null);
  const [nota, setNota] = useState<Record<number, string>>({});

  const { data: procuracoes, isLoading, refetch } = trpc.procuracao.list.useQuery();
  const updateStatus = trpc.procuracao.updateStatus.useMutation({
    onSuccess: () => { refetch(); toast.success("Status atualizado com sucesso."); },
    onError: (e) => toast.error(e.message),
  });

  const filtered = (procuracoes ?? []).filter(p =>
    statusFilter === "todos" ? true : p.status === statusFilter
  );

  const counts = {
    todos: (procuracoes ?? []).length,
    pendente: (procuracoes ?? []).filter(p => p.status === "pendente").length,
    aprovado: (procuracoes ?? []).filter(p => p.status === "aprovado").length,
    rejeitado: (procuracoes ?? []).filter(p => p.status === "rejeitado").length,
  };

  const statusColor = {
    pendente: { bg: "oklch(0.97 0.04 80)", border: "oklch(0.88 0.08 80)", text: "oklch(0.45 0.12 80)", icon: Clock },
    aprovado: { bg: "oklch(0.96 0.03 145)", border: "oklch(0.82 0.06 145)", text: "oklch(0.38 0.12 145)", icon: CheckCircle },
    rejeitado: { bg: "oklch(0.97 0.03 25)", border: "oklch(0.88 0.08 25)", text: "oklch(0.45 0.18 25)", icon: XCircle },
  };

  return (
    <RuralLayout>
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold" style={{ fontFamily: "'Playfair Display', serif", color: "oklch(0.18 0.04 145)" }}>
            Procurações
          </h1>
          <p className="text-sm mt-1" style={{ color: "oklch(0.52 0.04 140)" }}>
            Gerencie as solicitações de acesso por procuração
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-3">
          {(["todos", "pendente", "aprovado", "rejeitado"] as StatusFilter[]).map(s => {
            const isActive = statusFilter === s;
            const colors = s === "todos" ? null : statusColor[s as keyof typeof statusColor];
            return (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className="rounded-xl px-4 py-3 text-left transition-all duration-200"
                style={{
                  background: isActive ? (colors?.bg ?? "oklch(0.94 0.03 145)") : "white",
                  border: `1.5px solid ${isActive ? (colors?.border ?? "oklch(0.82 0.06 145)") : "oklch(0.90 0.02 130)"}`,
                  boxShadow: isActive ? "0 2px 8px oklch(0.38 0.12 145 / 0.12)" : "none",
                }}
              >
                <div className="text-xl font-bold" style={{ color: isActive ? (colors?.text ?? "oklch(0.38 0.12 145)") : "oklch(0.30 0.04 145)" }}>
                  {counts[s]}
                </div>
                <div className="text-[11px] capitalize mt-0.5" style={{ color: "oklch(0.52 0.04 140)" }}>
                  {s === "todos" ? "Total" : s}
                </div>
              </button>
            );
          })}
        </div>

        {/* List */}
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-20 rounded-xl animate-pulse" style={{ background: "oklch(0.94 0.02 130)" }} />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-xl p-12 text-center" style={{ background: "white", border: "1px solid oklch(0.90 0.02 130)" }}>
            <FileText className="w-10 h-10 mx-auto mb-3 opacity-30" style={{ color: "oklch(0.52 0.04 140)" }} />
            <p className="text-sm" style={{ color: "oklch(0.52 0.04 140)" }}>Nenhuma procuração {statusFilter !== "todos" ? statusFilter : ""} encontrada.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(p => {
              const sc = statusColor[p.status as keyof typeof statusColor];
              const StatusIcon = sc.icon;
              const isOpen = expanded === p.id;
              return (
                <div
                  key={p.id}
                  className="rounded-xl overflow-hidden transition-all duration-200"
                  style={{ background: "white", border: "1px solid oklch(0.90 0.02 130)", boxShadow: "0 1px 4px oklch(0.18 0.04 145 / 0.06)" }}
                >
                  {/* Row */}
                  <div className="flex items-center gap-4 px-5 py-4">
                    <div
                      className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ background: sc.bg }}
                    >
                      <StatusIcon className="w-4 h-4" style={{ color: sc.text }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[14px] font-semibold" style={{ color: "oklch(0.18 0.04 145)" }}>
                          {p.procuradorNome ?? "Procurador"}
                        </span>
                        <span
                          className="text-[11px] px-2 py-0.5 rounded-full font-medium"
                          style={{ background: sc.bg, color: sc.text, border: `1px solid ${sc.border}` }}
                        >
                          {p.status}
                        </span>
                      </div>
                      <div className="text-[12px] mt-0.5" style={{ color: "oklch(0.52 0.04 140)" }}>
                        CPF: {p.procuradorCpf} → Produtor: {p.produtorCpf}
                      </div>
                      <div className="text-[11px] mt-0.5" style={{ color: "oklch(0.65 0.03 140)" }}>
                        Enviado em {new Date(p.createdAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {p.arquivoUrl && (
                        <a
                          href={p.arquivoUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-medium transition-all hover:opacity-80"
                          style={{ background: "oklch(0.94 0.03 145)", color: "oklch(0.38 0.12 145)" }}
                        >
                          <Eye className="w-3.5 h-3.5" />
                          Ver
                        </a>
                      )}
                      {p.status === "pendente" && (
                        <button
                          onClick={() => setExpanded(isOpen ? null : p.id)}
                          className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-[12px] font-medium transition-all hover:opacity-80"
                          style={{ background: "oklch(0.94 0.03 145)", color: "oklch(0.38 0.12 145)" }}
                        >
                          Analisar
                          {isOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Expand: approve/reject */}
                  {isOpen && p.status === "pendente" && (
                    <div
                      className="px-5 pb-4 pt-0 space-y-3"
                      style={{ borderTop: "1px solid oklch(0.93 0.02 130)", background: "oklch(0.99 0 0)" }}
                    >
                      <div className="space-y-1.5">
                        <label className="block text-[11px] font-bold uppercase tracking-[0.5px]" style={{ color: "oklch(0.52 0.04 140)" }}>
                          Nota (opcional)
                        </label>
                        <textarea
                          rows={2}
                          placeholder="Motivo da aprovação ou rejeição..."
                          value={nota[p.id] ?? ""}
                          onChange={(e) => setNota(prev => ({ ...prev, [p.id]: e.target.value }))}
                          className="w-full rounded-lg px-3 py-2 text-[13px] outline-none resize-none"
                          style={{ border: "1.5px solid oklch(0.88 0.02 130)", color: "oklch(0.18 0.04 145)", background: "white" }}
                          onFocus={(e) => { e.target.style.borderColor = "oklch(0.50 0.14 155)"; }}
                          onBlur={(e) => { e.target.style.borderColor = "oklch(0.88 0.02 130)"; }}
                        />
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => updateStatus.mutate({ id: p.id, status: "aprovado", adminNota: nota[p.id] })}
                          disabled={updateStatus.isPending}
                          className="flex-1 flex items-center justify-center gap-2 rounded-lg py-2 text-[13px] font-semibold text-white transition-all active:scale-[0.97]"
                          style={{ background: "linear-gradient(135deg, oklch(0.38 0.12 145), oklch(0.50 0.14 155))" }}
                        >
                          <CheckCircle className="w-4 h-4" />
                          Aprovar
                        </button>
                        <button
                          onClick={() => updateStatus.mutate({ id: p.id, status: "rejeitado", adminNota: nota[p.id] })}
                          disabled={updateStatus.isPending}
                          className="flex-1 flex items-center justify-center gap-2 rounded-lg py-2 text-[13px] font-semibold text-white transition-all active:scale-[0.97]"
                          style={{ background: "linear-gradient(135deg, oklch(0.45 0.18 25), oklch(0.55 0.20 25))" }}
                        >
                          <XCircle className="w-4 h-4" />
                          Rejeitar
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </RuralLayout>
  );
}
