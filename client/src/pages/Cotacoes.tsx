import { useState } from "react";
import { Plus, FileText, Send, Check, X, Trophy, Ban, Loader2, PackageSearch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { getImovelId } from "@/lib/api";

const STATUS_LABEL: Record<string, { label: string; cor: string; bg: string }> = {
  aberta: { label: "Aguardando respostas", cor: "oklch(0.5 0.15 250)", bg: "oklch(0.95 0.05 250)" },
  respondida_parcial: { label: "Parcialmente respondida", cor: "oklch(0.55 0.16 70)", bg: "oklch(0.96 0.06 70)" },
  respondida_completa: { label: "Todos responderam", cor: "oklch(0.45 0.14 145)", bg: "oklch(0.94 0.05 145)" },
  fechada: { label: "Fechada", cor: "oklch(0.4 0.02 145)", bg: "oklch(0.94 0.01 145)" },
  cancelada: { label: "Cancelada", cor: "oklch(0.5 0.2 25)", bg: "oklch(0.95 0.05 25)" },
};

export default function Cotacoes() {
  const imovelId = getImovelId();
  const utils = trpc.useUtils();

  const [showNova, setShowNova] = useState(false);
  const [detalheId, setDetalheId] = useState<number | null>(null);
  const [respostaFornecedorId, setRespostaFornecedorId] = useState<number | null>(null);

  const [form, setForm] = useState({
    descricao_produto: "",
    quantidade: "",
    unidade: "kg",
    observacoes: "",
    data_limite_resposta: "",
    fornecedor_ids: [] as number[],
  });
  const [respostaForm, setRespostaForm] = useState({ preco_unitario: "", prazo_entrega_dias: "", observacao_resposta: "" });

  const cotacoesQuery = trpc.railway.listarCotacoes.useQuery({ imovelId: imovelId! }, { enabled: !!imovelId });
  const fornecedoresQuery = trpc.railway.fornecedores.useQuery({ imovelId: imovelId! }, { enabled: !!imovelId });
  const detalheQuery = trpc.railway.obterCotacao.useQuery(
    { imovelId: imovelId!, cotacaoId: detalheId ?? 0 },
    { enabled: !!imovelId && !!detalheId },
  );

  function invalidar() {
    utils.railway.listarCotacoes.invalidate({ imovelId: imovelId! });
    if (detalheId) utils.railway.obterCotacao.invalidate({ imovelId: imovelId!, cotacaoId: detalheId });
  }

  const criarMutation = trpc.railway.criarCotacao.useMutation({
    onSuccess: (r: any) => {
      const enviados = (r.fornecedores ?? []).filter((f: any) => f.enviado).length;
      toast.success(`Cotação criada — enviada a ${enviados} de ${r.fornecedores?.length ?? 0} fornecedor(es)`);
      setShowNova(false);
      setForm({ descricao_produto: "", quantidade: "", unidade: "kg", observacoes: "", data_limite_resposta: "", fornecedor_ids: [] });
      invalidar();
    },
    onError: (e) => toast.error(e.message ?? "Erro ao criar cotação"),
  });

  const responderMutation = trpc.railway.registrarRespostaCotacao.useMutation({
    onSuccess: () => {
      toast.success("Resposta registrada");
      setRespostaFornecedorId(null);
      setRespostaForm({ preco_unitario: "", prazo_entrega_dias: "", observacao_resposta: "" });
      invalidar();
    },
    onError: () => toast.error("Erro ao registrar resposta"),
  });

  const fecharMutation = trpc.railway.fecharCotacao.useMutation({
    onSuccess: (r: any) => {
      toast.success(r.pedido_compra_id ? "Cotação fechada e pedido de compra gerado!" : "Cotação fechada");
      invalidar();
    },
    onError: (e) => toast.error(e.message ?? "Erro ao fechar cotação"),
  });

  const cancelarMutation = trpc.railway.cancelarCotacao.useMutation({
    onSuccess: () => { toast.success("Cotação cancelada"); invalidar(); },
    onError: () => toast.error("Erro ao cancelar"),
  });

  const fmt = (v?: number | null) =>
    v == null ? "—" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const handleCriar = () => {
    if (!imovelId) return;
    if (!form.descricao_produto.trim()) { toast.error("Descreva o produto"); return; }
    if (!form.quantidade || Number(form.quantidade) <= 0) { toast.error("Informe a quantidade"); return; }
    if (form.fornecedor_ids.length === 0) { toast.error("Selecione ao menos um fornecedor"); return; }

    criarMutation.mutate({
      imovelId,
      descricaoProduto: form.descricao_produto,
      quantidade: Number(form.quantidade),
      unidade: form.unidade,
      observacoes: form.observacoes || undefined,
      fornecedorIds: form.fornecedor_ids,
      dataLimiteResposta: form.data_limite_resposta || undefined,
    });
  };

  const toggleFornecedor = (id: number) => {
    setForm((f) => ({
      ...f,
      fornecedor_ids: f.fornecedor_ids.includes(id)
        ? f.fornecedor_ids.filter((x) => x !== id)
        : [...f.fornecedor_ids, id],
    }));
  };

  const handleResponder = () => {
    if (!imovelId || !detalheId || !respostaFornecedorId) return;
    if (!respostaForm.preco_unitario || Number(respostaForm.preco_unitario) <= 0) {
      toast.error("Informe o preço unitário");
      return;
    }
    responderMutation.mutate({
      imovelId,
      cotacaoId: detalheId,
      fornecedorId: respostaFornecedorId,
      precoUnitario: Number(respostaForm.preco_unitario),
      prazoEntregaDias: respostaForm.prazo_entrega_dias ? Number(respostaForm.prazo_entrega_dias) : undefined,
      observacaoResposta: respostaForm.observacao_resposta || undefined,
    });
  };

  const cotacoes = cotacoesQuery.data ?? [];
  const fornecedores = fornecedoresQuery.data ?? [];

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "oklch(0.22 0.06 145)" }}>Cotações de Fornecedores</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Peça preço a um ou mais fornecedores antes de decidir a compra
          </p>
        </div>
        <Button onClick={() => setShowNova(true)} style={{ background: "oklch(0.42 0.14 145)" }}>
          <Plus className="w-4 h-4 mr-2" />
          Solicitar Cotação
        </Button>
      </div>

      {cotacoesQuery.isLoading ? (
        <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 rounded-xl" />)}</div>
      ) : cotacoes.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <PackageSearch className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">Nenhuma cotação solicitada ainda</p>
          <p className="text-sm mt-1">Clique em "Solicitar Cotação" pra pedir preço a fornecedores</p>
        </div>
      ) : (
        <div className="space-y-2">
          {cotacoes.map((c: any) => {
            const st = STATUS_LABEL[c.status] ?? STATUS_LABEL.aberta;
            return (
              <Card key={c.id} className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => setDetalheId(c.id)}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-sm">{c.descricao_produto}</p>
                        <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full" style={{ background: st.bg, color: st.cor }}>
                          {st.label}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {c.quantidade} {c.unidade} · {c.total_respondidos ?? 0}/{c.total_fornecedores ?? 0} fornecedor(es) responderam
                      </p>
                    </div>
                    {c.menor_preco != null && (
                      <div className="text-right shrink-0">
                        <p className="text-xs text-muted-foreground">Menor preço</p>
                        <p className="text-lg font-bold text-emerald-700">{fmt(c.menor_preco)}</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Modal: Nova cotação */}
      <Dialog open={showNova} onOpenChange={setShowNova}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Solicitar Cotação</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label>Produto *</Label>
              <Input placeholder="Ex: Farelo de soja" value={form.descricao_produto}
                onChange={(e) => setForm({ ...form, descricao_produto: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Quantidade *</Label>
                <Input type="number" min={0} value={form.quantidade}
                  onChange={(e) => setForm({ ...form, quantidade: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Unidade</Label>
                <Select value={form.unidade} onValueChange={(v) => setForm({ ...form, unidade: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="kg">kg</SelectItem>
                    <SelectItem value="saca">saca</SelectItem>
                    <SelectItem value="litro">litro</SelectItem>
                    <SelectItem value="unidade">unidade</SelectItem>
                    <SelectItem value="ton">ton</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Observações</Label>
              <Textarea placeholder="Detalhes adicionais (opcional)" value={form.observacoes}
                onChange={(e) => setForm({ ...form, observacoes: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Responder até</Label>
              <Input type="date" value={form.data_limite_resposta}
                onChange={(e) => setForm({ ...form, data_limite_resposta: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Fornecedores * (selecione um ou mais)</Label>
              <div className="max-h-40 overflow-y-auto space-y-1.5 border rounded-lg p-2">
                {fornecedores.length === 0 ? (
                  <p className="text-sm text-muted-foreground p-2">Nenhum fornecedor cadastrado ainda.</p>
                ) : (
                  fornecedores.map((f: any) => (
                    <label key={f.id} className="flex items-center gap-2 text-sm p-1.5 rounded hover:bg-muted/50 cursor-pointer">
                      <Checkbox checked={form.fornecedor_ids.includes(f.id)} onCheckedChange={() => toggleFornecedor(f.id)} />
                      <span>{f.nome}</span>
                      {(f.telegram || f.whatsapp) && <span className="text-xs text-muted-foreground ml-auto">📱 contato ok</span>}
                    </label>
                  ))
                )}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNova(false)}>Cancelar</Button>
            <Button onClick={handleCriar} disabled={criarMutation.isPending} style={{ background: "oklch(0.42 0.14 145)" }}>
              {criarMutation.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Enviando...</> : <><Send className="w-4 h-4 mr-2" />Enviar Cotação</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal: Detalhe da cotação */}
      <Dialog open={!!detalheId} onOpenChange={(o) => { if (!o) { setDetalheId(null); setRespostaFornecedorId(null); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{detalheQuery.data?.cotacao?.descricao_produto ?? "Cotação"}</DialogTitle>
          </DialogHeader>

          {detalheQuery.isLoading ? (
            <Skeleton className="h-32 rounded-lg" />
          ) : detalheQuery.data ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {detalheQuery.data.cotacao.quantidade} {detalheQuery.data.cotacao.unidade}
                {detalheQuery.data.cotacao.observacoes && ` · ${detalheQuery.data.cotacao.observacoes}`}
              </p>

              <div className="space-y-2 max-h-64 overflow-y-auto">
                {detalheQuery.data.fornecedores.map((f: any) => (
                  <div key={f.id} className="rounded-lg border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium text-sm">{f.fornecedor_nome}</p>
                      {f.preco_unitario != null ? (
                        <span className="font-bold text-emerald-700">{fmt(f.preco_unitario)}</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">Aguardando resposta</span>
                      )}
                    </div>
                    {f.prazo_entrega_dias != null && (
                      <p className="text-xs text-muted-foreground mt-0.5">Prazo: {f.prazo_entrega_dias} dias</p>
                    )}
                    {f.observacao_resposta && (
                      <p className="text-xs text-muted-foreground mt-0.5">"{f.observacao_resposta}"</p>
                    )}

                    <div className="flex gap-2 mt-2">
                      {f.preco_unitario == null && detalheQuery.data!.cotacao.status !== "fechada" && detalheQuery.data!.cotacao.status !== "cancelada" && (
                        respostaFornecedorId === f.fornecedor_id ? (
                          <div className="w-full space-y-2 pt-1">
                            <Input type="number" placeholder="Preço unitário (R$)" value={respostaForm.preco_unitario}
                              onChange={(e) => setRespostaForm({ ...respostaForm, preco_unitario: e.target.value })} />
                            <Input type="number" placeholder="Prazo de entrega (dias)" value={respostaForm.prazo_entrega_dias}
                              onChange={(e) => setRespostaForm({ ...respostaForm, prazo_entrega_dias: e.target.value })} />
                            <div className="flex gap-2">
                              <Button size="sm" onClick={handleResponder} disabled={responderMutation.isPending}>
                                <Check className="w-3.5 h-3.5 mr-1" />Salvar resposta
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => setRespostaFornecedorId(null)}>Cancelar</Button>
                            </div>
                          </div>
                        ) : (
                          <Button size="sm" variant="outline" onClick={() => setRespostaFornecedorId(f.fornecedor_id)}>
                            Registrar resposta
                          </Button>
                        )
                      )}
                      {f.preco_unitario != null && detalheQuery.data!.cotacao.status !== "fechada" && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-emerald-700 border-emerald-300"
                          onClick={() => detalheId && fecharMutation.mutate({ imovelId: imovelId!, cotacaoId: detalheId, fornecedorVencedorId: f.fornecedor_id, criarPedidoCompra: false })}
                          disabled={fecharMutation.isPending}
                        >
                          <Trophy className="w-3.5 h-3.5 mr-1" />Escolher vencedor
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <DialogFooter className="flex items-center justify-between sm:justify-between w-full">
            {detalheQuery.data?.cotacao?.status !== "fechada" && detalheQuery.data?.cotacao?.status !== "cancelada" && (
              <Button
                variant="ghost"
                className="text-red-500 hover:text-red-700"
                onClick={() => detalheId && cancelarMutation.mutate({ imovelId: imovelId!, cotacaoId: detalheId })}
              >
                <Ban className="w-4 h-4 mr-2" />Cancelar cotação
              </Button>
            )}
            <Button variant="outline" onClick={() => setDetalheId(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
