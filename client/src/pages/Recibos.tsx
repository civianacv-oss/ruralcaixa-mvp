import { useState, useEffect } from "react";
import { Plus, Send, Download, Trash2, RefreshCw, Search, Receipt as ReceiptIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { API_BASE, getApiToken } from "@/lib/api";

interface Recibo {
  id: string;
  produtor_id: number;
  destinatario_nome: string;
  destinatario_documento: string;
  destinatario_telefone: string;
  objeto: string;
  valor: number;
  lancamento_id?: string | null;
  status: "rascunho" | "aguardando_assinatura" | "assinado";
  assinado_em?: string | null;
  criado_em: string;
}

function authHeaders(): Record<string, string> {
  const token = getApiToken();
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { ...authHeaders(), ...(options?.headers ?? {}) },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    const msg = typeof err.detail === "string" ? err.detail
      : Array.isArray(err.detail) ? err.detail.map((d: { msg?: string }) => d.msg).join("; ")
      : `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return res.json();
}

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  rascunho: { label: "RASCUNHO", className: "bg-blue-100 text-blue-700" },
  aguardando_assinatura: { label: "AGUARDANDO ASSINATURA", className: "bg-purple-100 text-purple-700" },
  assinado: { label: "ASSINADO", className: "bg-green-100 text-green-700" },
};

function fmtValor(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtData(s?: string | null): string {
  if (!s) return "";
  return new Date(s).toLocaleString("pt-BR");
}

export default function Recibos() {
  const [recibos, setRecibos] = useState<Recibo[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState("");

  const [showNew, setShowNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    destinatario_nome: "",
    destinatario_documento: "",
    destinatario_telefone: "",
    objeto: "",
    valor: "",
  });

  const [enviandoId, setEnviandoId] = useState<string | null>(null);
  const [excluindoId, setExcluindoId] = useState<string | null>(null);
  const [baixandoId, setBaixandoId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const r = await apiFetch<{ data: Recibo[] }>("/recibos/");
      setRecibos(Array.isArray(r.data) ? r.data : []);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao carregar recibos");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleCreate = async () => {
    if (!form.destinatario_nome.trim()) { toast.error("Informe o nome do destinatário."); return; }
    if (!form.destinatario_documento.trim()) { toast.error("Informe o CPF/CNPJ do destinatário."); return; }
    if (!form.destinatario_telefone.trim()) { toast.error("Informe o telefone (WhatsApp) do destinatário."); return; }
    if (!form.objeto.trim()) { toast.error("Descreva o objeto do recibo."); return; }
    if (!form.valor || Number(form.valor) <= 0) { toast.error("Informe um valor válido."); return; }

    setSaving(true);
    try {
      await apiFetch("/recibos/", {
        method: "POST",
        body: JSON.stringify({
          destinatario_nome: form.destinatario_nome,
          destinatario_documento: form.destinatario_documento,
          destinatario_telefone: form.destinatario_telefone,
          objeto: form.objeto,
          valor: Number(form.valor),
        }),
      });
      toast.success("Recibo criado com sucesso");
      setShowNew(false);
      setForm({ destinatario_nome: "", destinatario_documento: "", destinatario_telefone: "", objeto: "", valor: "" });
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao criar recibo");
    } finally {
      setSaving(false);
    }
  };

  const handleEnviar = async (id: string) => {
    setEnviandoId(id);
    try {
      const r = await apiFetch<{ message: string; enviado_whatsapp: boolean }>(`/recibos/${id}/enviar-assinatura`, {
        method: "POST",
      });
      if (r.enviado_whatsapp) {
        toast.success("Código enviado por WhatsApp!");
      } else {
        toast.error(r.message || "Envio falhou ou sem telefone cadastrado.");
      }
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao enviar assinatura");
    } finally {
      setEnviandoId(null);
    }
  };

  const handleExcluir = async (id: string) => {
    setExcluindoId(id);
    try {
      await apiFetch(`/recibos/${id}`, { method: "DELETE" });
      toast.success("Recibo excluído");
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao excluir recibo");
    } finally {
      setExcluindoId(null);
    }
  };

  const handleBaixar = async (r: Recibo) => {
    setBaixandoId(r.id);
    try {
      const res = await fetch(`${API_BASE}/recibos/${r.id}/documento`, { headers: authHeaders() });
      if (!res.ok) throw new Error("Erro ao gerar documento");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Recibo_${r.destinatario_nome.replace(/\s+/g, "_")}.docx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao baixar documento");
    } finally {
      setBaixandoId(null);
    }
  };

  const filtrados = recibos.filter((r) => {
    const q = busca.toLowerCase();
    return !q
      || r.destinatario_nome.toLowerCase().includes(q)
      || r.objeto.toLowerCase().includes(q)
      || r.destinatario_documento.includes(q);
  });

  const total = recibos.length;
  const rascunhos = recibos.filter((r) => r.status === "rascunho").length;
  const aguardando = recibos.filter((r) => r.status === "aguardando_assinatura").length;
  const assinados = recibos.filter((r) => r.status === "assinado").length;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ReceiptIcon className="w-6 h-6" /> Recibos
          </h1>
          <p className="text-muted-foreground text-sm">Emita recibos com assinatura por WhatsApp</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={load} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} /> Atualizar
          </Button>
          <Button onClick={() => setShowNew(true)} style={{ background: "oklch(0.42 0.14 145)" }}>
            <Plus className="w-4 h-4 mr-2" /> Novo Recibo
          </Button>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por destinatário, objeto ou documento..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="pl-9"
        />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardContent className="pt-4">
          <p className="text-xs text-muted-foreground uppercase">Total</p>
          <p className="text-2xl font-bold">{total}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4">
          <p className="text-xs text-muted-foreground uppercase">Rascunhos</p>
          <p className="text-2xl font-bold">{rascunhos}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4">
          <p className="text-xs text-muted-foreground uppercase">Aguardando</p>
          <p className="text-2xl font-bold">{aguardando}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4">
          <p className="text-xs text-muted-foreground uppercase">Assinados</p>
          <p className="text-2xl font-bold text-green-700">{assinados}</p>
        </CardContent></Card>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full" />)}
        </div>
      ) : filtrados.length === 0 ? (
        <p className="text-center text-muted-foreground py-12">Nenhum recibo encontrado.</p>
      ) : (
        <div className="space-y-3">
          {filtrados.map((r) => {
            const statusInfo = STATUS_LABELS[r.status] ?? STATUS_LABELS.rascunho;
            return (
              <Card key={r.id} className="hover:shadow-md transition-shadow">
                <CardContent className="pt-4 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold">{r.destinatario_nome}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusInfo.className}`}>
                        {statusInfo.label}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground truncate">{r.objeto}</p>
                    <div className="flex gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                      <span>💰 {fmtValor(r.valor)}</span>
                      <span title={r.id}>🕒 Criado em {fmtData(r.criado_em)}</span>
                      {r.assinado_em && <span>✅ Assinado em {fmtData(r.assinado_em)}</span>}
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    {r.status !== "assinado" && (
                      <Button
                        variant="ghost" size="sm"
                        onClick={() => handleEnviar(r.id)}
                        disabled={enviandoId === r.id}
                        title="Enviar código de assinatura por WhatsApp"
                      >
                        <Send className={`w-4 h-4 ${enviandoId === r.id ? "animate-pulse" : ""}`} />
                      </Button>
                    )}
                    <Button
                      variant="ghost" size="sm"
                      onClick={() => handleBaixar(r)}
                      disabled={baixandoId === r.id}
                      title="Baixar recibo em Word"
                    >
                      <Download className={`w-4 h-4 ${baixandoId === r.id ? "animate-pulse" : ""}`} />
                    </Button>
                    {r.status === "rascunho" && (
                      <Button
                        variant="ghost" size="sm"
                        onClick={() => handleExcluir(r.id)}
                        disabled={excluindoId === r.id}
                        title="Excluir recibo"
                      >
                        <Trash2 className="w-4 h-4 text-red-600" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={showNew} onOpenChange={setShowNew}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Novo Recibo</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Nome do destinatário *</Label>
              <Input
                placeholder="Nome completo"
                value={form.destinatario_nome}
                onChange={(e) => setForm({ ...form, destinatario_nome: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>CPF/CNPJ *</Label>
                <Input
                  placeholder="000.000.000-00"
                  value={form.destinatario_documento}
                  onChange={(e) => setForm({ ...form, destinatario_documento: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Telefone (WhatsApp) *</Label>
                <Input
                  placeholder="(00) 00000-0000"
                  value={form.destinatario_telefone}
                  onChange={(e) => setForm({ ...form, destinatario_telefone: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Objeto (referente a) *</Label>
              <Input
                placeholder="Ex: Diária de trator, serviço de frete..."
                value={form.objeto}
                onChange={(e) => setForm({ ...form, objeto: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Valor (R$) *</Label>
              <Input
                type="number"
                step="0.01"
                placeholder="0,00"
                value={form.valor}
                onChange={(e) => setForm({ ...form, valor: e.target.value })}
              />
            </div>
            <p className="text-[11px] text-muted-foreground">
              Ao ser assinado, este recibo criará automaticamente um lançamento de despesa no valor informado.
            </p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowNew(false)}>Cancelar</Button>
            <Button onClick={handleCreate} disabled={saving} style={{ background: "oklch(0.42 0.14 145)" }}>
              {saving ? "Salvando..." : "Criar Recibo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
