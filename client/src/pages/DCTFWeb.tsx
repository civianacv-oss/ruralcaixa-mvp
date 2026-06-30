import { useState, useEffect } from "react";
import { RefreshCw, FileText, AlertTriangle, CheckCircle2, Clock, Send, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { API_BASE, getImovelId, getProdutorId } from "@/lib/api";

interface DCTFStats {
  total?: number;
  pendentes?: number;
  transmitidas?: number;
  com_debito?: number;
  valor_total_debito?: number;
}

interface DCTFDeclaracao {
  id: number;
  competencia?: string;
  tipo?: string;
  status?: string;
  valor_debito?: number;
  valor_credito?: number;
  data_transmissao?: string;
  protocolo?: string;
}

async function fetchStats(imovelId: number): Promise<DCTFStats> {
  const res = await fetch(`${API_BASE}/dctfweb/dashboard/${imovelId}`);
  if (!res.ok) return {};
  return res.json();
}

async function fetchDeclaracoes(imovelId: number): Promise<DCTFDeclaracao[]> {
  const res = await fetch(`${API_BASE}/dctfweb/declaracoes?imovel_id=${imovelId}`);
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data) ? data : data.declaracoes ?? data.items ?? [];
}

const STATUS_COLORS: Record<string, string> = {
  pendente: "bg-yellow-100 text-yellow-700",
  transmitida: "bg-blue-100 text-blue-700",
  retificada: "bg-purple-100 text-purple-700",
  com_debito: "bg-red-100 text-red-700",
  quitada: "bg-emerald-100 text-emerald-700",
};

export default function DCTFWeb() {
  const [stats, setStats] = useState<DCTFStats>({});
  const [declaracoes, setDeclaracoes] = useState<DCTFDeclaracao[]>([]);
  const [loading, setLoading] = useState(true);
  const imovelId = getImovelId();
  const produtorId = getProdutorId();

  const load = async () => {
    if (!imovelId) return;
    setLoading(true);
    try {
      const [s, d] = await Promise.all([fetchStats(imovelId), fetchDeclaracoes(imovelId)]);
      setStats(s);
      setDeclaracoes(d);
    } catch {
      toast.error("Não foi possível carregar os dados da DCTFWeb");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [imovelId]);

  const fmt = (v?: number) => (v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "oklch(0.22 0.06 145)" }}>DCTFWeb</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Declaração de Débitos e Créditos Tributários Federais Web</p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Declarações", value: stats.total ?? declaracoes.length, icon: <FileText className="w-4 h-4" /> },
          { label: "Pendentes", value: stats.pendentes ?? declaracoes.filter((d) => d.status === "pendente").length, icon: <Clock className="w-4 h-4 text-yellow-500" /> },
          { label: "Transmitidas", value: stats.transmitidas ?? declaracoes.filter((d) => d.status === "transmitida").length, icon: <Send className="w-4 h-4 text-blue-500" /> },
          { label: "Com Débito", value: stats.com_debito ?? declaracoes.filter((d) => d.status === "com_debito").length, icon: <AlertTriangle className="w-4 h-4 text-red-500" /> },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2">
                <span style={{ color: "oklch(0.42 0.14 145)" }}>{s.icon}</span>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">{s.label}</p>
              </div>
              <p className="text-2xl font-bold mt-1" style={{ color: "oklch(0.35 0.12 145)" }}>{loading ? "—" : s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {stats.valor_total_debito != null && stats.valor_total_debito > 0 && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle className="w-4 h-4 text-red-600" />
              <p className="text-sm text-red-700 font-medium">Débitos em Aberto</p>
            </div>
            <p className="text-3xl font-bold text-red-700">{fmt(stats.valor_total_debito)}</p>
          </CardContent>
        </Card>
      )}

      {/* Declarations list */}
      {loading ? (
        <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 rounded-xl" />)}</div>
      ) : declaracoes.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">Nenhuma declaração DCTFWeb encontrada</p>
          <p className="text-sm mt-1">As declarações transmitidas aparecerão aqui</p>
        </div>
      ) : (
        <div className="space-y-3">
          {declaracoes.map((d) => (
            <Card key={d.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: "oklch(0.92 0.04 145)" }}>
                      <FileText className="w-5 h-5" style={{ color: "oklch(0.42 0.14 145)" }} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-sm">
                          DCTFWeb {d.competencia && `— ${d.competencia}`}
                          {d.tipo && ` (${d.tipo})`}
                        </p>
                        {d.status && (
                          <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${STATUS_COLORS[d.status] ?? "bg-gray-100 text-gray-600"}`}>
                            {d.status.replace("_", " ")}
                          </span>
                        )}
                      </div>
                      <div className="flex gap-3 mt-1 text-xs text-muted-foreground">
                        {d.data_transmissao && <span>Transmitida: {new Date(d.data_transmissao).toLocaleDateString("pt-BR")}</span>}
                        {d.protocolo && <span>Protocolo: {d.protocolo}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right">
                      {d.valor_debito != null && <p className="text-sm font-bold text-red-600">{fmt(d.valor_debito)}</p>}
                      {d.valor_credito != null && <p className="text-xs text-emerald-700">Crédito: {fmt(d.valor_credito)}</p>}
                    </div>
                    <Button variant="ghost" size="sm"><Download className="w-4 h-4" /></Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
