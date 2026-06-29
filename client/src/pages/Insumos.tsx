import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useRuralAuth } from "@/hooks/useRuralAuth";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  Package,
  AlertTriangle,
  Plus,
  ArrowDown,
  ArrowUp,
  ShoppingCart,
  Truck,
  CheckCircle,
  Send,
  Users,
} from "lucide-react";

const STATUS_COLORS: Record<string, string> = {
  critico: "bg-red-100 text-red-700 border-red-200",
  baixo: "bg-orange-100 text-orange-700 border-orange-200",
  atencao: "bg-yellow-100 text-yellow-700 border-yellow-200",
  ok: "bg-green-100 text-green-700 border-green-200",
};

const STATUS_LABELS: Record<string, string> = {
  critico: "Crítico",
  baixo: "Baixo",
  atencao: "Atenção",
  ok: "OK",
};

const PEDIDO_STATUS_COLORS: Record<string, string> = {
  pendente: "bg-yellow-100 text-yellow-700",
  aprovado: "bg-blue-100 text-blue-700",
  enviado: "bg-purple-100 text-purple-700",
  recebido: "bg-green-100 text-green-700",
  cancelado: "bg-gray-100 text-gray-500",
};

const TIPO_MOVIM_LABELS: Record<string, string> = {
  compra: "Compra",
  producao_propria: "Produção própria",
  doacao: "Doação",
  ajuste_positivo: "Ajuste +",
  uso: "Uso",
  venda: "Venda",
  perda: "Perda",
  ajuste_negativo: "Ajuste -",
};

export default function Insumos() {
  const { imovelId } = useRuralAuth();
  const utils = trpc.useUtils();

  // ── Queries ──────────────────────────────────────────────────────────────────
  const { data: insumos = [], isLoading: loadingInsumos } = trpc.railway.insumos.useQuery(
    { imovelId: imovelId! },
    { enabled: !!imovelId }
  );
  const { data: alertas = [], isLoading: loadingAlertas } = trpc.railway.insumosAlertas.useQuery(
    { imovelId: imovelId! },
    { enabled: !!imovelId }
  );
  const { data: fornecedores = [], isLoading: loadingFornecedores } = trpc.railway.fornecedores.useQuery(
    { imovelId: imovelId! },
    { enabled: !!imovelId }
  );
  const { data: pedidos = [], isLoading: loadingPedidos } = trpc.railway.pedidosCompra.useQuery(
    { imovelId: imovelId! },
    { enabled: !!imovelId }
  );

  // ── Mutations ────────────────────────────────────────────────────────────────
  const createInsumo = trpc.railway.createInsumo.useMutation({
    onSuccess: () => {
      toast.success("Insumo cadastrado com sucesso");
      utils.railway.insumos.invalidate();
      utils.railway.insumosAlertas.invalidate();
      setOpenNovoInsumo(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const movimentar = trpc.railway.movimentarInsumo.useMutation({
    onSuccess: () => {
      toast.success("Movimentação registrada");
      utils.railway.insumos.invalidate();
      utils.railway.insumosAlertas.invalidate();
      setOpenMovim(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const createFornecedor = trpc.railway.createFornecedor.useMutation({
    onSuccess: () => {
      toast.success("Fornecedor cadastrado");
      utils.railway.fornecedores.invalidate();
      setOpenNovoFornecedor(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const createPedido = trpc.railway.createPedidoCompra.useMutation({
    onSuccess: () => {
      toast.success("Pedido de compra criado");
      utils.railway.pedidosCompra.invalidate();
      setOpenNovoPedido(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const aprovarPedido = trpc.railway.aprovarPedidoCompra.useMutation({
    onSuccess: () => {
      toast.success("Pedido aprovado");
      utils.railway.pedidosCompra.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const enviarPedido = trpc.railway.enviarPedidoCompra.useMutation({
    onSuccess: (data) => {
      toast.success(data.enviado_telegram ? "Pedido enviado via Telegram" : "Pedido marcado como enviado");
      utils.railway.pedidosCompra.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  // ── Dialog states ────────────────────────────────────────────────────────────
  const [openNovoInsumo, setOpenNovoInsumo] = useState(false);
  const [openMovim, setOpenMovim] = useState(false);
  const [openNovoFornecedor, setOpenNovoFornecedor] = useState(false);
  const [openNovoPedido, setOpenNovoPedido] = useState(false);
  const [selectedInsumoId, setSelectedInsumoId] = useState<number | null>(null);

  // ── Form states ──────────────────────────────────────────────────────────────
  const [novoInsumo, setNovoInsumo] = useState({
    nome: "", categoria: "outros", unidade: "unidade", origem: "comprado" as "comprado" | "proprio" | "doacao",
    estoque_atual: 0, estoque_minimo: 0, estoque_ideal: 0, preco_estimado: "", lead_time_dias: 7,
    reposicao_modo: "manual" as "manual" | "automatico",
  });

  const [movimForm, setMovimForm] = useState({
    tipo: "uso" as "compra" | "producao_propria" | "doacao" | "ajuste_positivo" | "uso" | "venda" | "perda" | "ajuste_negativo",
    quantidade: 0, custo_unitario: "", observacao: "",
  });

  const [novoFornecedor, setNovoFornecedor] = useState({
    nome: "", cnpj_cpf: "", whatsapp: "", telegram: "", email: "",
    prazo_entrega_dias: 7, forma_pagamento: "a_vista",
  });

  const [novoPedido, setNovoPedido] = useState({
    insumo_id: 0, fornecedor_id: "", quantidade: 0, preco_estimado: "", data_entrega_desejada: "", observacao: "",
  });

  if (!imovelId) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        Selecione uma propriedade para ver os insumos.
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Insumos</h1>
          <p className="text-sm text-muted-foreground">Gestão de estoque, fornecedores e pedidos de compra</p>
        </div>
      </div>

      {/* Alertas de estoque */}
      {alertas.length > 0 && (
        <div className="rounded-lg border border-orange-200 bg-orange-50 p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="h-5 w-5 text-orange-600" />
            <span className="font-semibold text-orange-800">{alertas.length} insumo(s) com estoque baixo ou crítico</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {alertas.slice(0, 8).map((a: any) => (
              <span key={a.id} className={`text-xs px-2 py-1 rounded border font-medium ${STATUS_COLORS[a.status_estoque ?? "atencao"]}`}>
                {a.nome} — {STATUS_LABELS[a.status_estoque ?? "atencao"]}
              </span>
            ))}
            {alertas.length > 8 && <span className="text-xs text-muted-foreground">+{alertas.length - 8} mais</span>}
          </div>
        </div>
      )}

      <Tabs defaultValue="estoque">
        <TabsList className="mb-4">
          <TabsTrigger value="estoque" className="flex items-center gap-1">
            <Package className="h-4 w-4" /> Estoque
            {alertas.length > 0 && (
              <Badge variant="destructive" className="ml-1 h-5 min-w-5 text-xs">{alertas.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="fornecedores" className="flex items-center gap-1">
            <Users className="h-4 w-4" /> Fornecedores
          </TabsTrigger>
          <TabsTrigger value="pedidos" className="flex items-center gap-1">
            <ShoppingCart className="h-4 w-4" /> Pedidos de Compra
          </TabsTrigger>
        </TabsList>

        {/* ── ABA ESTOQUE ── */}
        <TabsContent value="estoque">
          <div className="flex justify-end mb-4">
            <Dialog open={openNovoInsumo} onOpenChange={setOpenNovoInsumo}>
              <DialogTrigger asChild>
                <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Novo Insumo</Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader><DialogTitle>Cadastrar Insumo</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div>
                    <Label>Nome *</Label>
                    <Input value={novoInsumo.nome} onChange={e => setNovoInsumo(p => ({ ...p, nome: e.target.value }))} placeholder="Ex: Ração ovinos" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Categoria</Label>
                      <Select value={novoInsumo.categoria} onValueChange={v => setNovoInsumo(p => ({ ...p, categoria: v }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {["racao", "vacina", "medicamento", "mineral", "semen", "equipamento", "outros"].map(c => (
                            <SelectItem key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Unidade</Label>
                      <Select value={novoInsumo.unidade} onValueChange={v => setNovoInsumo(p => ({ ...p, unidade: v }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {["kg", "g", "L", "mL", "unidade", "saco", "dose", "frasco"].map(u => (
                            <SelectItem key={u} value={u}>{u}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <Label>Estoque atual</Label>
                      <Input type="number" min="0" value={novoInsumo.estoque_atual} onChange={e => setNovoInsumo(p => ({ ...p, estoque_atual: Number(e.target.value) }))} />
                    </div>
                    <div>
                      <Label>Estoque mínimo</Label>
                      <Input type="number" min="0" value={novoInsumo.estoque_minimo} onChange={e => setNovoInsumo(p => ({ ...p, estoque_minimo: Number(e.target.value) }))} />
                    </div>
                    <div>
                      <Label>Estoque ideal</Label>
                      <Input type="number" min="0" value={novoInsumo.estoque_ideal} onChange={e => setNovoInsumo(p => ({ ...p, estoque_ideal: Number(e.target.value) }))} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Preço estimado (R$)</Label>
                      <Input type="number" min="0" step="0.01" value={novoInsumo.preco_estimado} onChange={e => setNovoInsumo(p => ({ ...p, preco_estimado: e.target.value }))} placeholder="0,00" />
                    </div>
                    <div>
                      <Label>Origem</Label>
                      <Select value={novoInsumo.origem} onValueChange={v => setNovoInsumo(p => ({ ...p, origem: v as any }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="comprado">Comprado</SelectItem>
                          <SelectItem value="proprio">Próprio</SelectItem>
                          <SelectItem value="doacao">Doação</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Reposição</Label>
                      <Select value={novoInsumo.reposicao_modo} onValueChange={v => setNovoInsumo(p => ({ ...p, reposicao_modo: v as any }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="manual">Manual</SelectItem>
                          <SelectItem value="automatico">Automático</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Lead time (dias)</Label>
                      <Input type="number" min="1" value={novoInsumo.lead_time_dias} onChange={e => setNovoInsumo(p => ({ ...p, lead_time_dias: Number(e.target.value) }))} />
                    </div>
                  </div>
                  <Button
                    className="w-full"
                    disabled={!novoInsumo.nome || createInsumo.isPending}
                    onClick={() => createInsumo.mutate({
                      imovelId: imovelId!,
                      nome: novoInsumo.nome,
                      categoria: novoInsumo.categoria,
                      unidade: novoInsumo.unidade,
                      origem: novoInsumo.origem,
                      estoque_atual: novoInsumo.estoque_atual,
                      estoque_minimo: novoInsumo.estoque_minimo,
                      estoque_ideal: novoInsumo.estoque_ideal,
                      preco_estimado: novoInsumo.preco_estimado ? Number(novoInsumo.preco_estimado) : undefined,
                      reposicao_modo: novoInsumo.reposicao_modo,
                      lead_time_dias: novoInsumo.lead_time_dias,
                    })}
                  >
                    {createInsumo.isPending ? "Salvando..." : "Cadastrar Insumo"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {loadingInsumos ? (
            <div className="space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : insumos.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <Package className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>Nenhum insumo cadastrado.</p>
            </div>
          ) : (
            <div className="rounded-lg border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Categoria</TableHead>
                    <TableHead>Estoque atual</TableHead>
                    <TableHead>Mínimo</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Fornecedor</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {insumos.map((ins: any) => (
                    <TableRow key={ins.id}>
                      <TableCell className="font-medium">{ins.nome}</TableCell>
                      <TableCell className="capitalize text-sm text-muted-foreground">{ins.categoria}</TableCell>
                      <TableCell>{ins.estoque_atual} {ins.unidade}</TableCell>
                      <TableCell className="text-muted-foreground">{ins.estoque_minimo} {ins.unidade}</TableCell>
                      <TableCell>
                        <span className={`text-xs px-2 py-0.5 rounded border font-medium ${STATUS_COLORS[ins.status_estoque ?? "ok"]}`}>
                          {STATUS_LABELS[ins.status_estoque ?? "ok"]}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{ins.fornecedor_nome ?? "—"}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => { setSelectedInsumoId(ins.id); setOpenMovim(true); }}
                        >
                          <ArrowDown className="h-3 w-3 mr-1" /> Movimentar
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Dialog movimentação */}
          <Dialog open={openMovim} onOpenChange={setOpenMovim}>
            <DialogContent className="max-w-sm">
              <DialogHeader><DialogTitle>Registrar Movimentação</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label>Tipo de movimentação</Label>
                  <Select value={movimForm.tipo} onValueChange={v => setMovimForm(p => ({ ...p, tipo: v as any }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(TIPO_MOVIM_LABELS).map(([k, v]) => (
                        <SelectItem key={k} value={k}>{v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Quantidade</Label>
                  <Input type="number" min="0.01" step="0.01" value={movimForm.quantidade} onChange={e => setMovimForm(p => ({ ...p, quantidade: Number(e.target.value) }))} />
                </div>
                <div>
                  <Label>Custo unitário (R$)</Label>
                  <Input type="number" min="0" step="0.01" value={movimForm.custo_unitario} onChange={e => setMovimForm(p => ({ ...p, custo_unitario: e.target.value }))} placeholder="Opcional" />
                </div>
                <div>
                  <Label>Observação</Label>
                  <Input value={movimForm.observacao} onChange={e => setMovimForm(p => ({ ...p, observacao: e.target.value }))} placeholder="Opcional" />
                </div>
                <Button
                  className="w-full"
                  disabled={!selectedInsumoId || movimForm.quantidade <= 0 || movimentar.isPending}
                  onClick={() => movimentar.mutate({
                    imovelId: imovelId!,
                    insumoId: selectedInsumoId!,
                    tipo: movimForm.tipo,
                    quantidade: movimForm.quantidade,
                    custo_unitario: movimForm.custo_unitario ? Number(movimForm.custo_unitario) : undefined,
                    observacao: movimForm.observacao || undefined,
                  })}
                >
                  {movimentar.isPending ? "Salvando..." : "Registrar"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </TabsContent>

        {/* ── ABA FORNECEDORES ── */}
        <TabsContent value="fornecedores">
          <div className="flex justify-end mb-4">
            <Dialog open={openNovoFornecedor} onOpenChange={setOpenNovoFornecedor}>
              <DialogTrigger asChild>
                <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Novo Fornecedor</Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader><DialogTitle>Cadastrar Fornecedor</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div>
                    <Label>Nome *</Label>
                    <Input value={novoFornecedor.nome} onChange={e => setNovoFornecedor(p => ({ ...p, nome: e.target.value }))} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>CNPJ/CPF</Label>
                      <Input value={novoFornecedor.cnpj_cpf} onChange={e => setNovoFornecedor(p => ({ ...p, cnpj_cpf: e.target.value }))} />
                    </div>
                    <div>
                      <Label>WhatsApp</Label>
                      <Input value={novoFornecedor.whatsapp} onChange={e => setNovoFornecedor(p => ({ ...p, whatsapp: e.target.value }))} placeholder="(99) 99999-9999" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Telegram (chat_id)</Label>
                      <Input value={novoFornecedor.telegram} onChange={e => setNovoFornecedor(p => ({ ...p, telegram: e.target.value }))} />
                    </div>
                    <div>
                      <Label>E-mail</Label>
                      <Input type="email" value={novoFornecedor.email} onChange={e => setNovoFornecedor(p => ({ ...p, email: e.target.value }))} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Prazo entrega (dias)</Label>
                      <Input type="number" min="1" value={novoFornecedor.prazo_entrega_dias} onChange={e => setNovoFornecedor(p => ({ ...p, prazo_entrega_dias: Number(e.target.value) }))} />
                    </div>
                    <div>
                      <Label>Forma de pagamento</Label>
                      <Select value={novoFornecedor.forma_pagamento} onValueChange={v => setNovoFornecedor(p => ({ ...p, forma_pagamento: v }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="a_vista">À vista</SelectItem>
                          <SelectItem value="boleto">Boleto</SelectItem>
                          <SelectItem value="pix">PIX</SelectItem>
                          <SelectItem value="prazo_30">30 dias</SelectItem>
                          <SelectItem value="prazo_60">60 dias</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <Button
                    className="w-full"
                    disabled={!novoFornecedor.nome || createFornecedor.isPending}
                    onClick={() => createFornecedor.mutate({
                      imovelId: imovelId!,
                      nome: novoFornecedor.nome,
                      cnpj_cpf: novoFornecedor.cnpj_cpf || undefined,
                      whatsapp: novoFornecedor.whatsapp || undefined,
                      telegram: novoFornecedor.telegram || undefined,
                      email: novoFornecedor.email || undefined,
                      prazo_entrega_dias: novoFornecedor.prazo_entrega_dias,
                      forma_pagamento: novoFornecedor.forma_pagamento,
                    })}
                  >
                    {createFornecedor.isPending ? "Salvando..." : "Cadastrar Fornecedor"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {loadingFornecedores ? (
            <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : fornecedores.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <Truck className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>Nenhum fornecedor cadastrado.</p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {fornecedores.map((f: any) => (
                <Card key={f.id}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">{f.nome}</CardTitle>
                    {f.cnpj_cpf && <p className="text-xs text-muted-foreground">{f.cnpj_cpf}</p>}
                  </CardHeader>
                  <CardContent className="space-y-1 text-sm">
                    {f.whatsapp && <p className="text-muted-foreground">📱 {f.whatsapp}</p>}
                    {f.email && <p className="text-muted-foreground">✉️ {f.email}</p>}
                    <p className="text-muted-foreground">Prazo: {f.prazo_entrega_dias} dias</p>
                    <p className="text-muted-foreground capitalize">Pagamento: {f.forma_pagamento.replace("_", " ")}</p>
                    {f.total_pedidos > 0 && (
                      <Badge variant="secondary" className="text-xs">{f.total_pedidos} pedido(s)</Badge>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── ABA PEDIDOS DE COMPRA ── */}
        <TabsContent value="pedidos">
          <div className="flex justify-end mb-4">
            <Dialog open={openNovoPedido} onOpenChange={setOpenNovoPedido}>
              <DialogTrigger asChild>
                <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Novo Pedido</Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader><DialogTitle>Criar Pedido de Compra</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div>
                    <Label>Insumo *</Label>
                    <Select value={String(novoPedido.insumo_id || "")} onValueChange={v => setNovoPedido(p => ({ ...p, insumo_id: Number(v) }))}>
                      <SelectTrigger><SelectValue placeholder="Selecione o insumo" /></SelectTrigger>
                      <SelectContent>
                        {insumos.map((ins: any) => (
                          <SelectItem key={ins.id} value={String(ins.id)}>{ins.nome} ({ins.estoque_atual} {ins.unidade})</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Fornecedor</Label>
                    <Select value={novoPedido.fornecedor_id} onValueChange={v => setNovoPedido(p => ({ ...p, fornecedor_id: v }))}>
                      <SelectTrigger><SelectValue placeholder="Opcional" /></SelectTrigger>
                      <SelectContent>
                        {fornecedores.map((f: any) => (
                          <SelectItem key={f.id} value={String(f.id)}>{f.nome}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Quantidade *</Label>
                      <Input type="number" min="0.01" step="0.01" value={novoPedido.quantidade} onChange={e => setNovoPedido(p => ({ ...p, quantidade: Number(e.target.value) }))} />
                    </div>
                    <div>
                      <Label>Preço unitário (R$)</Label>
                      <Input type="number" min="0" step="0.01" value={novoPedido.preco_estimado} onChange={e => setNovoPedido(p => ({ ...p, preco_estimado: e.target.value }))} placeholder="Opcional" />
                    </div>
                  </div>
                  <div>
                    <Label>Data de entrega desejada</Label>
                    <Input type="date" value={novoPedido.data_entrega_desejada} onChange={e => setNovoPedido(p => ({ ...p, data_entrega_desejada: e.target.value }))} />
                  </div>
                  <div>
                    <Label>Observação</Label>
                    <Input value={novoPedido.observacao} onChange={e => setNovoPedido(p => ({ ...p, observacao: e.target.value }))} placeholder="Opcional" />
                  </div>
                  <Button
                    className="w-full"
                    disabled={!novoPedido.insumo_id || novoPedido.quantidade <= 0 || createPedido.isPending}
                    onClick={() => createPedido.mutate({
                      imovelId: imovelId!,
                      insumo_id: novoPedido.insumo_id,
                      fornecedor_id: novoPedido.fornecedor_id ? Number(novoPedido.fornecedor_id) : undefined,
                      quantidade: novoPedido.quantidade,
                      preco_estimado: novoPedido.preco_estimado ? Number(novoPedido.preco_estimado) : undefined,
                      data_entrega_desejada: novoPedido.data_entrega_desejada || undefined,
                      observacao: novoPedido.observacao || undefined,
                    })}
                  >
                    {createPedido.isPending ? "Criando..." : "Criar Pedido"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {loadingPedidos ? (
            <div className="space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : pedidos.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <ShoppingCart className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>Nenhum pedido de compra registrado.</p>
            </div>
          ) : (
            <div className="rounded-lg border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Insumo</TableHead>
                    <TableHead>Fornecedor</TableHead>
                    <TableHead>Qtd</TableHead>
                    <TableHead>Valor total</TableHead>
                    <TableHead>Entrega</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pedidos.map((p: any) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.insumo_nome ?? `#${p.insumo_id}`}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{p.fornecedor_nome ?? "—"}</TableCell>
                      <TableCell>{p.quantidade} {p.unidade ?? ""}</TableCell>
                      <TableCell>
                        {p.valor_total_estimado != null
                          ? `R$ ${Number(p.valor_total_estimado).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
                          : "—"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {p.data_entrega_desejada ? new Date(p.data_entrega_desejada).toLocaleDateString("pt-BR") : "—"}
                      </TableCell>
                      <TableCell>
                        <span className={`text-xs px-2 py-0.5 rounded font-medium ${PEDIDO_STATUS_COLORS[p.status] ?? "bg-gray-100 text-gray-600"}`}>
                          {p.status}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex gap-1 justify-end">
                          {p.status === "pendente" && (
                            <Button
                              variant="outline" size="sm"
                              disabled={aprovarPedido.isPending}
                              onClick={() => aprovarPedido.mutate({ imovelId: imovelId!, pedidoId: p.id })}
                            >
                              <CheckCircle className="h-3 w-3 mr-1" /> Aprovar
                            </Button>
                          )}
                          {(p.status === "aprovado" || p.status === "pendente") && (
                            <Button
                              variant="outline" size="sm"
                              disabled={enviarPedido.isPending}
                              onClick={() => enviarPedido.mutate({ imovelId: imovelId!, pedidoId: p.id })}
                            >
                              <Send className="h-3 w-3 mr-1" /> Enviar
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
