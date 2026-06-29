import { useState, useEffect } from "react";
import { Plus, Users, RefreshCw, FileText, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { API_BASE, getImovelId } from "@/lib/api";

interface Trabalhador {
  id: number;
  nome: string;
  cpf?: string;
  cargo?: string;
  data_admissao?: string;
  data_demissao?: string;
  status?: string;
  salario?: number;
}

interface ESocialStats {
  total_trabalhadores?: number;
  ativos?: number;
  eventos_pendentes?: number;
  eventos_enviados?: number;
}

interface Evento {
  id: number;
  tipo: string;
  descricao?: string;
  status?: string;
  data?: string;
  trabalhador_nome?: string;
}

async function fetchStats(imovelId: number): Promise<ESocialStats> {
  const res = await fetch(`${API_BASE}/esocial/dashboard/${imovelId}`);
  if (!res.ok) return {};
  return res.json();
}

async function fetchTrabalhadores(imovelId: number): Promise<Trabalhador[]> {
  const res = await fetch(`${API_BASE}/esocial/trabalhadores?imovel_id=${imovelId}`);
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data) ? data : data.trabalhadores ?? data.items ?? [];
}

async function fetchEventos(imovelId: number): Promise<Evento[]> {
  const res = await fetch(`${API_BASE}/esocial/eventos?imovel_id=${imovelId}`);
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data) ? data : data.eventos ?? data.items ?? [];
}

const STATUS_COLORS: Record<string, string> = {
  ativo: "bg-emerald-100 text-emerald-700",
  inativo: "bg-gray-100 text-gray-600",
  pendente: "bg-yellow-100 text-yellow-700",
  enviado: "bg-blue-100 text-blue-700",
  erro: "bg-red-100 text-red-700",
};

export default function ESocialRural() {
  const [stats, setStats] = useState<ESocialStats>({});
  const [trabalhadores, setTrabalhadores] = useState<Trabalhador[]>([]);
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [loading, setLoading] = useState(true);
  const [aba, setAba] = useState<"trabalhadores" | "eventos">("trabalhadores");
  const imovelId = getImovelId();

  const load = async () => {
    if (!imovelId) return;
    setLoading(true);
    try {
      const [s, t, e] = await Promise.all([fetchStats(imovelId), fetchTrabalhadores(imovelId), fetchEventos(imovelId)]);
      setStats(s);
      setTrabalhadores(t);
      setEventos(e);
    } catch {
      toast.error("Não foi possível carregar os dados do eSocial");
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
          <h1 className="text-2xl font-bold" style={{ color: "oklch(0.22 0.06 145)" }}>eSocial Rural</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Trabalhadores rurais e obrigações do eSocial</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
          <Button size="sm" style={{ background: "oklch(0.42 0.14 145)" }} onClick={() => toast.info("Cadastro de trabalhador em breve")}>
            <Plus className="w-4 h-4 mr-2" />
            Novo Trabalhador
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Trabalhadores", value: stats.total_trabalhadores ?? trabalhadores.length, icon: <Users className="w-4 h-4" /> },
          { label: "Ativos", value: stats.ativos ?? trabalhadores.filter((t) => t.status === "ativo").length, icon: <CheckCircle2 className="w-4 h-4 text-emerald-600" /> },
          { label: "Eventos Pendentes", value: stats.eventos_pendentes ?? eventos.filter((e) => e.status === "pendente").length, icon: <AlertTriangle className="w-4 h-4 text-yellow-500" /> },
          { label: "Eventos Enviados", value: stats.eventos_enviados ?? eventos.filter((e) => e.status === "enviado").length, icon: <FileText className="w-4 h-4 text-blue-500" /> },
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

      {/* Tabs */}
      <div className="flex gap-2">
        {(["trabalhadores", "eventos"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setAba(t)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all capitalize ${aba === t ? "text-white shadow-sm" : "bg-white border hover:bg-gray-50 text-gray-700"}`}
            style={aba === t ? { background: "oklch(0.42 0.14 145)" } : undefined}
          >
            {t === "trabalhadores" ? "Trabalhadores" : "Eventos eSocial"}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>
      ) : aba === "trabalhadores" ? (
        trabalhadores.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="font-medium">Nenhum trabalhador cadastrado</p>
          </div>
        ) : (
          <div className="space-y-2">
            {trabalhadores.map((t) => (
              <Card key={t.id} className="hover:shadow-sm transition-shadow">
                <CardContent className="p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-white text-xs font-bold" style={{ background: "oklch(0.42 0.14 145)" }}>
                        {t.nome.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{t.nome}</p>
                        <p className="text-xs text-muted-foreground">
                          {t.cargo && `${t.cargo} · `}
                          {t.cpf && `CPF: ${t.cpf}`}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      {t.salario && <span className="text-sm font-medium text-emerald-700">{fmt(t.salario)}</span>}
                      {t.status && (
                        <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${STATUS_COLORS[t.status] ?? "bg-gray-100 text-gray-600"}`}>
                          {t.status}
                        </span>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )
      ) : (
        eventos.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="font-medium">Nenhum evento eSocial encontrado</p>
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
                        {e.status && (
                          <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${STATUS_COLORS[e.status] ?? "bg-gray-100 text-gray-600"}`}>
                            {e.status}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {e.data && new Date(e.data).toLocaleDateString("pt-BR")}
                        {e.trabalhador_nome && ` · ${e.trabalhador_nome}`}
                        {e.descricao && ` · ${e.descricao}`}
                      </p>
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
