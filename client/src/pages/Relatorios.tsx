import { useState } from "react";
import { BarChart3, FileDown, RefreshCw, TrendingUp, PawPrint, Leaf, Receipt, FileText, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { API_BASE, getImovelId, getProdutorId } from "@/lib/api";
import { trpc } from "@/lib/trpc";

/**
 * Alertas de margem/tendencia do IOFC, calculados em cima dos meses ja
 * buscados (sem chamada extra ao backend). Janela de analise: ultimos 3
 * meses com dado (ou menos, se nao houver 3).
 */
function calcularAlertasIOFC(meses: any[]): string[] {
  const alertas: string[] = [];
  if (!meses || meses.length === 0) return alertas;

  const janela = meses.slice(-3);

  const negativos = janela.filter((m) => (m.iofc ?? 0) < 0).length;
  if (negativos >= 2) {
    alertas.push(
      `IOFC negativo em ${negativos} dos últimos ${janela.length} meses. ` +
      `Recomendação: revisar dieta ou preço de venda do leite.`
    );
  }

  const primeiro = janela[0];
  const ultimo = janela[janela.length - 1];
  if (janela.length >= 2 && primeiro.custo_racao_leite > 0) {
    const pctCusto = ((ultimo.custo_racao_leite - primeiro.custo_racao_leite) / primeiro.custo_racao_leite) * 100;
    const receitaPrimeiro = primeiro.receita_leite_final ?? primeiro.receita_real ?? 0;
    const receitaUltimo = ultimo.receita_leite_final ?? ultimo.receita_real ?? 0;
    const pctReceita = receitaPrimeiro > 0 ? ((receitaUltimo - receitaPrimeiro) / receitaPrimeiro) * 100 : 0;
    if (pctCusto - pctReceita > 15) {
      alertas.push(
        `Custo de ração subiu ${pctCusto.toFixed(0)}% (R$ ${primeiro.custo_racao_leite.toFixed(2)} → ` +
        `R$ ${ultimo.custo_racao_leite.toFixed(2)}) enquanto a receita variou ${pctReceita.toFixed(0)}% no mesmo período.`
      );
    }
  }

  if (janela.length >= 2 && primeiro.volume_l > 0 && ultimo.volume_l > 0) {
    const cupPrimeiro = primeiro.custo_racao_leite / primeiro.volume_l;
    const cupUltimo = ultimo.custo_racao_leite / ultimo.volume_l;
    if (cupPrimeiro > 0 && cupUltimo > cupPrimeiro * 1.2) {
      const variacao = ((cupUltimo - cupPrimeiro) / cupPrimeiro) * 100;
      alertas.push(
        `Custo de ração por litro (CUP) subiu de R$ ${cupPrimeiro.toFixed(2)} para R$ ${cupUltimo.toFixed(2)} ` +
        `(+${variacao.toFixed(0)}%) — a margem por litro está encolhendo.`
      );
    }
  }

  return alertas;
}

interface Relatorio {
  id: string;
  titulo: string;
  descricao: string;
  endpoint: string;
  icone: React.ReactNode;
  categoria: string;
  // Enquanto nem todo relatorio tem backend pronto, marcamos explicitamente
  // quais ja funcionam -- evita botao "Gerar" quebrado silenciosamente.
  implementado?: boolean;
}

const RELATORIOS: Relatorio[] = [
  {
    id: "rebanho-geral",
    titulo: "Rebanho Geral",
    descricao: "Resumo do rebanho por espécie com totais e categorias",
    endpoint: "/relatorios/rebanho",
    icone: <PawPrint className="w-5 h-5" />,
    categoria: "Rebanho",
    implementado: true,
  },
  {
    id: "iofc",
    titulo: "IOFC — Margem Leiteira",
    descricao: "Receita de leite menos custo de ração, mês a mês",
    endpoint: "/bovino/leiteiro/iofc",
    icone: <TrendingUp className="w-5 h-5" />,
    categoria: "Rebanho",
    implementado: true,
  },
  {
    id: "eficiencia-alimentar",
    titulo: "Eficiência Alimentar (Peso)",
    descricao: "Custo de ração por kg de peso ganho — corte, ovino, caprino e suíno",
    endpoint: "/relatorios/eficiencia-alimentar",
    icone: <TrendingUp className="w-5 h-5" />,
    categoria: "Rebanho",
    implementado: true,
  },
  {
    id: "financeiro",
    titulo: "Financeiro",
    descricao: "Receitas, despesas e resultado por período",
    endpoint: "/relatorios/financeiro",
    icone: <TrendingUp className="w-5 h-5" />,
    categoria: "Financeiro",
  },
  {
    id: "lancamentos",
    titulo: "Lançamentos",
    descricao: "Todos os lançamentos financeiros do período",
    endpoint: "/relatorios/lancamentos",
    icone: <Receipt className="w-5 h-5" />,
    categoria: "Financeiro",
  },
  {
    id: "saude-animal",
    titulo: "Saúde Animal",
    descricao: "Eventos sanitários, vacinações e tratamentos",
    endpoint: "/relatorios/saude",
    icone: <FileText className="w-5 h-5" />,
    categoria: "Rebanho",
  },
  {
    id: "agricultura",
    titulo: "Agricultura",
    descricao: "Safras, produção e insumos agrícolas",
    endpoint: "/relatorios/agricultura",
    icone: <Leaf className="w-5 h-5" />,
    categoria: "Agricultura",
  },
  {
    id: "compra-venda",
    titulo: "Compra e Venda",
    descricao: "Operações de compra e venda do período",
    endpoint: "/relatorios/compravenda",
    icone: <BarChart3 className="w-5 h-5" />,
    categoria: "Financeiro",
  },
];

const CATEGORIAS = ["Todos", "Rebanho", "Financeiro", "Agricultura"];

export default function Relatorios() {
  const [categoria, setCategoria] = useState("Todos");
  const [dataInicio, setDataInicio] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().split("T")[0];
  });
  const [dataFim, setDataFim] = useState(() => new Date().toISOString().split("T")[0]);
  const [loading, setLoading] = useState<string | null>(null);
  const [resultado, setResultado] = useState<
    | { tipo: "rebanho-geral"; data: any }
    | { tipo: "iofc"; data: any[] }
    | { tipo: "eficiencia-alimentar"; data: any }
    | null
  >(null);
  const imovelId = getImovelId();
  const produtorId = getProdutorId();

  const filtered = RELATORIOS.filter((r) => categoria === "Todos" || r.categoria === categoria);

  const utils = trpc.useUtils();

  const handleGerar = async (rel: Relatorio) => {
    if (!imovelId) { toast.error("Selecione uma propriedade"); return; }
    if (!rel.implementado) {
      toast.info(`"${rel.titulo}" ainda não está disponível — em desenvolvimento.`);
      return;
    }
    setLoading(rel.id);
    try {
      if (rel.id === "rebanho-geral") {
        const data = await utils.railway.relatorioRebanho.fetch({
          imovelId, dataInicio, dataFim,
        });
        setResultado({ tipo: "rebanho-geral", data });
      } else if (rel.id === "iofc") {
        if (!produtorId) { toast.error("Produtor não identificado"); return; }
        const data = await utils.railway.iofcMensal.fetch({ produtorId, meses: 12 });
        if (!data.length) { toast.info("Sem dados de IOFC para o período."); return; }
        setResultado({ tipo: "iofc", data });
      } else if (rel.id === "eficiencia-alimentar") {
        const data = await utils.railway.relatorioEficienciaAlimentar.fetch({ imovelId });
        if (!Object.keys(data.rebanhos).length) {
          toast.info("Sem rebanhos com peso/dados suficientes para calcular.");
          return;
        }
        setResultado({ tipo: "eficiencia-alimentar", data });
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Não foi possível gerar o relatório. Tente novamente.");
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "oklch(0.22 0.06 145)" }}>Relatórios</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Gere e exporte relatórios da propriedade</p>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Período e Filtros</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label>Data Início</Label>
              <Input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Data Fim</Label>
              <Input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Categoria</Label>
              <Select value={categoria} onValueChange={setCategoria}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIAS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Reports grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filtered.map((rel) => (
          <Card key={rel.id} className="hover:shadow-md transition-shadow">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: "oklch(0.92 0.04 145)" }}>
                  <span style={{ color: "oklch(0.42 0.14 145)" }}>{rel.icone}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm">{rel.titulo}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{rel.descricao}</p>
                  <div className="flex items-center justify-between mt-3">
                    <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full" style={{ background: "oklch(0.92 0.04 145)", color: "oklch(0.42 0.14 145)" }}>
                      {rel.categoria}
                    </span>
                    {rel.implementado ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleGerar(rel)}
                        disabled={loading === rel.id}
                        className="h-7 text-xs"
                      >
                        {loading === rel.id ? (
                          <RefreshCw className="w-3 h-3 mr-1.5 animate-spin" />
                        ) : (
                          <FileDown className="w-3 h-3 mr-1.5" />
                        )}
                        {loading === rel.id ? "Gerando..." : "Gerar"}
                      </Button>
                    ) : (
                      <span className="text-[10px] text-muted-foreground italic">Em breve</span>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Modal com o relatório completo */}
      <Dialog open={resultado !== null} onOpenChange={(o) => { if (!o) setResultado(null); }}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          {resultado?.tipo === "rebanho-geral" && (
            <>
              <DialogHeader>
                <DialogTitle>Rebanho Geral</DialogTitle>
              </DialogHeader>
              <div className="space-y-5 text-sm">
                {Object.entries(resultado.data.especies).map(([especie, info]: [string, any]) => (
                  <div key={especie} className="border rounded-lg p-3">
                    <p className="font-semibold capitalize mb-2">{especie}</p>
                    <div className="flex gap-4 text-xs text-muted-foreground mb-2">
                      <span>Total: <b className="text-foreground">{info.totais.total ?? info.totais.ativos}</b></span>
                      <span>Ativos: <b className="text-foreground">{info.totais.ativos}</b></span>
                      {info.peso_medio_kg != null && (
                        <span>Peso médio: <b className="text-foreground">{info.peso_medio_kg} kg</b></span>
                      )}
                    </div>
                    {info.por_categoria?.length > 0 && (
                      <table className="w-full text-xs">
                        <tbody>
                          {info.por_categoria.map((c: any) => (
                            <tr key={c.categoria} className="border-t">
                              <td className="py-1 capitalize">{c.categoria ?? "—"}</td>
                              <td className="py-1 text-right font-medium">{c.qtd}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}

          {resultado?.tipo === "iofc" && (
            <>
              <DialogHeader>
                <DialogTitle>IOFC — Margem Leiteira (últimos {resultado.data.length} meses)</DialogTitle>
              </DialogHeader>
              {calcularAlertasIOFC(resultado.data).map((msg, i) => (
                <div
                  key={i}
                  className="flex items-start gap-2 rounded-lg p-2.5 text-xs"
                  style={{ background: "oklch(0.96 0.05 60)", color: "oklch(0.4 0.15 50)" }}
                >
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>{msg}</span>
                </div>
              ))}
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-muted-foreground border-b">
                    <th className="py-1.5">Mês</th>
                    <th className="py-1.5 text-right">Receita</th>
                    <th className="py-1.5 text-right">Custo Ração</th>
                    <th className="py-1.5 text-right">IOFC</th>
                  </tr>
                </thead>
                <tbody>
                  {resultado.data.map((m: any) => (
                    <tr key={m.mes} className="border-b last:border-0">
                      <td className="py-1.5">{m.mes}</td>
                      <td className="py-1.5 text-right">
                        {m.receita_leite_final != null ? `R$ ${m.receita_leite_final.toFixed(2)}` : "—"}
                      </td>
                      <td className="py-1.5 text-right">
                        {m.custo_racao_leite != null ? `R$ ${m.custo_racao_leite.toFixed(2)}` : "R$ 0,00"}
                      </td>
                      <td
                        className="py-1.5 text-right font-semibold"
                        style={{ color: (m.iofc ?? 0) >= 0 ? "oklch(0.42 0.14 145)" : "oklch(0.5 0.2 25)" }}
                      >
                        {m.iofc != null ? `R$ ${m.iofc.toFixed(2)}` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
          {resultado?.tipo === "eficiencia-alimentar" && (
            <>
              <DialogHeader>
                <DialogTitle>Eficiência Alimentar — Custo por kg de Peso Ganho</DialogTitle>
              </DialogHeader>
              <p className="text-xs text-muted-foreground -mt-2">{resultado.data.aviso}</p>
              <table className="w-full text-xs mt-2">
                <thead>
                  <tr className="text-left text-muted-foreground border-b">
                    <th className="py-1.5">Rebanho</th>
                    <th className="py-1.5 text-right">Cabeças</th>
                    <th className="py-1.5 text-right">Peso médio</th>
                    <th className="py-1.5 text-right">GPD</th>
                    <th className="py-1.5 text-right">Ração alocada/mês</th>
                    <th className="py-1.5 text-right">Custo/kg ganho/dia</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(resultado.data.rebanhos).map(([nome, r]: [string, any]) => (
                    <tr key={nome} className="border-b last:border-0">
                      <td className="py-1.5 capitalize">{nome.replace("_", " ")}</td>
                      <td className="py-1.5 text-right">{r.cabecas_ativas}</td>
                      <td className="py-1.5 text-right">{r.peso_medio_kg != null ? `${r.peso_medio_kg} kg` : "—"}</td>
                      <td className="py-1.5 text-right">
                        {r.gpd_medio_kg_dia != null ? `${r.gpd_medio_kg_dia} kg/dia` : "sem dado"}
                      </td>
                      <td className="py-1.5 text-right">
                        R$ {r.custo_racao_alocado_mensal.toFixed(2)}
                        <span className="text-muted-foreground"> ({(r.proporcao_cabecas * 100).toFixed(0)}%)</span>
                      </td>
                      <td className="py-1.5 text-right font-semibold">
                        {r.custo_por_kg_ganho != null ? `R$ ${r.custo_por_kg_ganho.toFixed(4)}` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-[10px] text-muted-foreground mt-2">
                Ração/mês da fazenda toda: R$ {resultado.data.custo_racao_mensal_medio_fazenda.toFixed(2)}
                {" "}(média dos últimos 3 meses) · {resultado.data.cabecas_totais_fazenda} cabeças no total.
              </p>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
