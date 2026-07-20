import { useState } from "react";
import { BarChart3, FileDown, RefreshCw, TrendingUp, PawPrint, Leaf, Receipt, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { API_BASE, getImovelId, getProdutorId } from "@/lib/api";
import { trpc } from "@/lib/trpc";

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
        const b = data.especies.bovino;
        const partes = [
          `Bovino: ${b.totais.ativos} ativos (${b.totais.leite_ativos} leite, ${b.totais.corte_ativos} corte)` +
          (b.peso_medio_kg ? ` · ${b.peso_medio_kg} kg médio` : ""),
        ];
        if (data.especies.ovino) partes.push(`Ovino: ${data.especies.ovino.totais.ativos} ativos`);
        if (data.especies.suino) partes.push(`Suíno: ${data.especies.suino.totais.ativos} ativos`);
        toast.success(partes.join(" · "), { duration: 8000 });
      } else if (rel.id === "iofc") {
        if (!produtorId) { toast.error("Produtor não identificado"); return; }
        const data = await utils.railway.iofcMensal.fetch({ produtorId, meses: 3 });
        const ultimo = data[data.length - 1];
        if (!ultimo) { toast.info("Sem dados de IOFC para o período."); return; }
        toast.success(
          `IOFC (${ultimo.mes}): receita R$ ${ultimo.receita_leite_final?.toFixed(2) ?? "—"} ` +
          `− ração R$ ${ultimo.custo_racao_leite?.toFixed(2) ?? "0.00"} ` +
          `= R$ ${ultimo.iofc?.toFixed(2) ?? "—"}`,
          { duration: 8000 },
        );
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
    </div>
  );
}
