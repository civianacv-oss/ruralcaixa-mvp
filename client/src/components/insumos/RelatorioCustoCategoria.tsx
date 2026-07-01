import { useMemo } from "react";

interface RelatorioCustoCategoriaProps {
  insumos: any[];
}

const CAT_LABEL: Record<string, string> = {
  sementes: "🌱 Sementes",
  adubos: "🧪 Adubos",
  defensivos: "🛡️ Defensivos",
  racao: "🌾 Ração",
  sal_mineral: "🧂 Sal Mineral",
  vacinas: "💉 Vacinas",
  medicamentos: "💊 Medicamentos",
  combustivel: "⛽ Combustível",
  pecas_maquinas: "🔧 Peças/Máquinas",
  silagem: "🌿 Silagem",
  feno: "🌾 Feno",
  outros: "📦 Outros",
};

const fmtBRL = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function RelatorioCustoCategoria({ insumos }: RelatorioCustoCategoriaProps) {
  const dadosCategoria = useMemo(() => {
    const cats: Record<
      string,
      { itens: number; quantidade: number; valorTotal: number; somaCusto: number; countCusto: number }
    > = {};

    insumos.forEach((i) => {
      const cat = i.categoria || "outros";
      if (!cats[cat]) cats[cat] = { itens: 0, quantidade: 0, valorTotal: 0, somaCusto: 0, countCusto: 0 };
      cats[cat].itens += 1;
      cats[cat].quantidade += i.estoque_atual || 0;
      cats[cat].valorTotal += i.valor_total_estoque || 0;
      if (i.custo_medio) {
        cats[cat].somaCusto += i.custo_medio;
        cats[cat].countCusto += 1;
      }
    });

    return Object.entries(cats)
      .map(([categoria, d]) => ({
        categoria,
        label: CAT_LABEL[categoria] || categoria,
        itens: d.itens,
        quantidade: d.quantidade,
        valorTotal: d.valorTotal,
        custoMedio: d.countCusto > 0 ? d.somaCusto / d.countCusto : 0,
      }))
      .sort((a, b) => b.valorTotal - a.valorTotal);
  }, [insumos]);

  const totalGeral = dadosCategoria.reduce((acc, d) => acc + d.valorTotal, 0);

  if (dadosCategoria.length === 0) {
    return (
      <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
        Nenhum dado de custo disponível
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b-2 border-border">
            <th className="py-2.5 px-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Categoria
            </th>
            <th className="py-2.5 px-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Itens
            </th>
            <th className="py-2.5 px-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden sm:table-cell">
              Custo Médio
            </th>
            <th className="py-2.5 px-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Valor Total
            </th>
            <th className="py-2.5 px-3 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden md:table-cell">
              % do Total
            </th>
          </tr>
        </thead>
        <tbody>
          {dadosCategoria.map((d) => {
            const pct = totalGeral > 0 ? (d.valorTotal / totalGeral) * 100 : 0;
            return (
              <tr key={d.categoria} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                <td className="py-2.5 px-3 font-medium">{d.label}</td>
                <td className="py-2.5 px-3 text-right text-muted-foreground">{d.itens}</td>
                <td className="py-2.5 px-3 text-right font-medium hidden sm:table-cell">
                  {d.custoMedio > 0 ? fmtBRL(d.custoMedio) : "—"}
                </td>
                <td className="py-2.5 px-3 text-right font-bold text-blue-700">
                  {fmtBRL(d.valorTotal)}
                </td>
                <td className="py-2.5 px-3 hidden md:table-cell">
                  <div className="flex items-center gap-2 justify-center">
                    <div className="w-20 h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-green-600 rounded-full transition-all duration-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-xs text-muted-foreground w-10 text-right">
                      {pct.toFixed(1)}%
                    </span>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-border font-bold">
            <td className="py-3 px-3">TOTAL</td>
            <td className="py-3 px-3 text-right">{dadosCategoria.reduce((a, d) => a + d.itens, 0)}</td>
            <td className="py-3 px-3 hidden sm:table-cell" />
            <td className="py-3 px-3 text-right text-blue-700">{fmtBRL(totalGeral)}</td>
            <td className="py-3 px-3 text-center hidden md:table-cell text-muted-foreground text-xs">100%</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
