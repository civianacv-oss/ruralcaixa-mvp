import { useState, useEffect } from "react";
import { Plus, FileText, RefreshCw, Eye, Download, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { API_BASE, getImovelId } from "@/lib/api";

interface NFe {
  id: number;
  numero?: string;
  serie?: string;
  chave_acesso?: string;
  data_emissao?: string;
  valor_total?: number;
  destinatario?: string;
  status?: string;
  tipo?: string;
}

interface NFeStats {
  total?: number;
  autorizadas?: number;
  canceladas?: number;
  pendentes?: number;
  valor_total?: number;
}

async function fetchNFes(imovelId: number): Promise<NFe[]> {
  const res = await fetch(`${API_BASE}/nfe-produtor/notas?imovel_id=${imovelId}`);
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data) ? data : data.notas ?? data.items ?? [];
}

async function fetchStats(imovelId: number): Promise<NFeStats> {
  const res = await fetch(`${API_BASE}/nfe-produtor/dashboard/${imovelId}`);
  if (!res.ok) return {};
  return res.json();
}

const STATUS_COLORS: Record<string, string> = {
  autorizada: "bg-emerald-100 text-emerald-700",
  cancelada: "bg-red-100 text-red-700",
  pendente: "bg-yellow-100 text-yellow-700",
  rejeitada: "bg-orange-100 text-orange-700",
};

export default function NFeProdutor() {
  const [nfes, setNfes] = useState<NFe[]>([]);
  const [stats, setStats] = useState<NFeStats>({});
  const [loading, setLoading] = useState(true);
  const imovelId = getImovelId();

  const load = async () => {
    if (!imovelId) return;
    setLoading(true);
    try {
      const [notas, s] = await Promise.all([fetchNFes(imovelId), fetchStats(imovelId)]);
      setNfes(notas);
      setStats(s);
    } catch {
      toast.error("Não foi possível carregar as NF-e");
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
          <h1 className="text-2xl font-bold" style={{ color: "oklch(0.22 0.06 145)" }}>NF-e Produtor</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Nota Fiscal Eletrônica do Produtor Rural</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
          <Button size="sm" style={{ background: "oklch(0.42 0.14 145)" }} onClick={() => toast.info("Emissão de NF-e em breve")}>
            <Plus className="w-4 h-4 mr-2" />
            Emitir NF-e
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total", value: stats.total ?? nfes.length },
          { label: "Autorizadas", value: stats.autorizadas ?? nfes.filter((n) => n.status === "autorizada").length },
          { label: "Pendentes", value: stats.pendentes ?? nfes.filter((n) => n.status === "pendente").length },
          { label: "Canceladas", value: stats.canceladas ?? nfes.filter((n) => n.status === "cancelada").length },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">{s.label}</p>
              <p className="text-2xl font-bold mt-1" style={{ color: "oklch(0.35 0.12 145)" }}>{loading ? "—" : s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {stats.valor_total != null && (
        <Card className="border-emerald-200 bg-emerald-50">
          <CardContent className="p-4">
            <p className="text-sm text-emerald-700 font-medium">Valor Total Emitido</p>
            <p className="text-3xl font-bold text-emerald-700 mt-1">{fmt(stats.valor_total)}</p>
          </CardContent>
        </Card>
      )}

      {/* List */}
      {loading ? (
        <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 rounded-xl" />)}</div>
      ) : nfes.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">Nenhuma NF-e encontrada</p>
          <p className="text-sm mt-1">As notas emitidas aparecerão aqui</p>
        </div>
      ) : (
        <div className="space-y-3">
          {nfes.map((nfe) => (
            <Card key={nfe.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: "oklch(0.92 0.04 145)" }}>
                      <FileText className="w-5 h-5" style={{ color: "oklch(0.42 0.14 145)" }} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-sm">
                          NF-e {nfe.numero ? `nº ${nfe.numero}` : `#${nfe.id}`}
                          {nfe.serie && ` · Série ${nfe.serie}`}
                        </p>
                        {nfe.status && (
                          <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${STATUS_COLORS[nfe.status] ?? "bg-gray-100 text-gray-600"}`}>
                            {nfe.status}
                          </span>
                        )}
                      </div>
                      {nfe.destinatario && <p className="text-xs text-muted-foreground mt-0.5">{nfe.destinatario}</p>}
                      <div className="flex gap-3 mt-1 text-xs text-muted-foreground">
                        {nfe.data_emissao && <span>{new Date(nfe.data_emissao).toLocaleDateString("pt-BR")}</span>}
                        {nfe.valor_total != null && <span className="font-medium text-emerald-700">{fmt(nfe.valor_total)}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button variant="ghost" size="sm"><Eye className="w-4 h-4" /></Button>
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
