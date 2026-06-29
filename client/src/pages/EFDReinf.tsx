import { useState, useEffect } from "react";
import { RefreshCw, FileText, AlertTriangle, CheckCircle2, Clock, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { API_BASE, getImovelId, getProdutorId } from "@/lib/api";

interface EFDStats {
  total_eventos?: number;
  pendentes?: number;
  enviados?: number;
  com_erro?: number;
  valor_retencao?: number;
}

interface EFDEvento {
  id: number;
  tipo: string;
  competencia?: string;
  valor?: number;
  status?: string;
  data_envio?: string;
  descricao?: string;
}

interface DARF {
  id: number;
  codigo_receita?: string;
  competencia?: string;
  valor_principal?: number;
  valor_juros?: number;
  valor_multa?: number;
  valor_total?: number;
  data_vencimento?: string;
  status?: string;
}

async function fetchStats(imovelId: number): Promise<EFDStats> {
  const res = await fetch(`${API_BASE}/efd-reinf/dashboard/${imovelId}`);
  if (!res.ok) return {};
  return res.json();
}

async function fetchEventos(imovelId: number): Promise<EFDEvento[]> {
  const res = await fetch(`${API_BASE}/efd-reinf/eventos?imovel_id=${imovelId}`);
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data) ? data : data.eventos ?? data.items ?? [];
}

async function fetchDarfs(produtorId: number): Promise<DARF[]> {
  const res = await fetch(`${API_BASE}/darf/produtores/${produtorId}/darfs`);
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data) ? data : data.darfs ?? data.items ?? [];
}

const STATUS_COLORS: Record<string, string> = {
  pendente: "bg-yellow-100 text-yellow-700",
  enviado: "bg-blue-100 text-blue-700",
  erro: "bg-red-100 text-red-700",
  pago: "bg-emerald-100 text-emerald-700",
  vencido: "bg-red-100 text-red-700",
};

export default function EFDReinf() {
  const [stats, setStats] = useState<EFDStats>({});
  const [eventos, setEventos] = useState<EFDEvento[]>([]);
  const [darfs, setDarfs] = useState<DARF[]>([]);
  const [loading, setLoading] = useState(true);
  const [aba, setAba] = useState<"efd" | "darf">("efd");
  const imovelId = getImovelId();
  const produtorId = getProdutorId();

  const load = async () => {
    if (!imovelId || !produtorId) return;
    setLoading(true);
    try {
      const [s, e, d] = await Promise.all([fetchStats(imovelId), fetchEventos(imovelId), fetchDarfs(produtorId)]);
      setStats(s);
      setEventos(e);
      setDarfs(d);
    } catch {
      toast.error("Não foi possível carregar os dados fiscais");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [imovelId, produtorId]);

  const fmt = (v?: number) => (v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "oklch(0.22 0.06 145)" }}>EFD-Reinf / DARF</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Escrituração Fiscal Digital e DARF do produtor rural</p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Eventos", value: stats.total_eventos ?? eventos.length, icon: <FileText className="w-4 h-4" /> },
          { label: "Pendentes", value: stats.pendentes ?? eventos.filter((e) => e.status === "pendente").length, icon: <Clock className="w-4 h-4 text-yellow-500" /> },
          { label: "Enviados", value: stats.enviados ?? eventos.filter((e) => e.status === "enviado").length, icon: <Send className="w-4 h-4 text-blue-500" /> },
          { label: "Com Erro", value: stats.com_erro ?? eventos.filter((e) => e.status === "erro").length, icon: <AlertTriangle className="w-4 h-4 text-red-500" /> },
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

      {stats.valor_retencao != null && (
        <Card className="border-orange-200 bg-orange-50">
          <CardContent className="p-4">
            <p className="text-sm text-orange-700 font-medium">Valor Total de Retenções</p>
            <p className="text-3xl font-bold text-orange-700 mt-1">{fmt(stats.valor_retencao)}</p>
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <div className="flex gap-2">
        {(["efd", "darf"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setAba(t)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${aba === t ? "text-white shadow-sm" : "bg-white border hover:bg-gray-50 text-gray-700"}`}
            style={aba === t ? { background: "oklch(0.42 0.14 145)" } : undefined}
          >
            {t === "efd" ? "Eventos EFD-Reinf" : "DARFs"}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>
      ) : aba === "efd" ? (
        eventos.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="font-medium">Nenhum evento EFD-Reinf encontrado</p>
          </div>
        ) : (
          <div className="space-y-2">
            {eventos.map((e) => (
              <Card key={e.id} className="hover:shadow-sm transition-shadow">
                <CardContent className="p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium">{e.tipo}</p>
                        {e.competencia && <span className="text-xs text-muted-foreground">{e.competencia}</span>}
                        {e.status && (
                          <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${STATUS_COLORS[e.status] ?? "bg-gray-100 text-gray-600"}`}>
                            {e.status}
                          </span>
                        )}
                      </div>
                      {e.descricao && <p className="text-xs text-muted-foreground mt-0.5">{e.descricao}</p>}
                    </div>
                    {e.valor != null && <span className="text-sm font-bold shrink-0" style={{ color: "oklch(0.35 0.12 145)" }}>{fmt(e.valor)}</span>}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )
      ) : (
        darfs.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="font-medium">Nenhum DARF encontrado</p>
          </div>
        ) : (
          <div className="space-y-2">
            {darfs.map((d) => (
              <Card key={d.id} className="hover:shadow-sm transition-shadow">
                <CardContent className="p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium">DARF {d.codigo_receita && `— Código ${d.codigo_receita}`}</p>
                        {d.competencia && <span className="text-xs text-muted-foreground">{d.competencia}</span>}
                        {d.status && (
                          <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${STATUS_COLORS[d.status] ?? "bg-gray-100 text-gray-600"}`}>
                            {d.status}
                          </span>
                        )}
                      </div>
                      {d.data_vencimento && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Vencimento: {new Date(d.data_vencimento).toLocaleDateString("pt-BR")}
                        </p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold" style={{ color: "oklch(0.35 0.12 145)" }}>{fmt(d.valor_total)}</p>
                      {(d.valor_juros || d.valor_multa) && (
                        <p className="text-xs text-red-500">+ juros/multa</p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )
      )}
    </div>
  );
}
