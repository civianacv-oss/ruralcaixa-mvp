import { useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

interface CustoChartProps {
  movimentacoes: any[];
  insumoId?: number;
  periodo?: "7d" | "30d" | "90d" | "12m";
}

const fmtBRL = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const fmtData = (d: string) => {
  const [y, m, dia] = d.split("-");
  return `${dia}/${m}/${y.slice(2)}`;
};

export function CustoChart({ movimentacoes, insumoId, periodo = "30d" }: CustoChartProps) {
  const dados = useMemo(() => {
    let lista = movimentacoes.filter(
      (m) => m.tipo === "compra" && m.valor_unitario != null
    );
    if (insumoId) lista = lista.filter((m) => m.insumo_id === insumoId);

    // Agrupar por data e calcular média do valor unitário
    const agrupado: Record<string, { soma: number; count: number }> = {};
    lista.forEach((m) => {
      const data = (m.created_at as string).split("T")[0];
      if (!agrupado[data]) agrupado[data] = { soma: 0, count: 0 };
      agrupado[data].soma += m.valor_unitario as number;
      agrupado[data].count += 1;
    });

    const limite =
      periodo === "7d" ? 7 : periodo === "30d" ? 30 : periodo === "90d" ? 90 : 365;

    return Object.keys(agrupado)
      .sort()
      .slice(-limite)
      .map((data) => ({
        data,
        label: fmtData(data),
        custoMedio: agrupado[data].soma / agrupado[data].count,
      }));
  }, [movimentacoes, insumoId, periodo]);

  if (dados.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-sm text-muted-foreground">
        Nenhuma compra registrada no período
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={dados} margin={{ top: 8, right: 16, left: 8, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 10, fill: "#6b7280" }}
          tickLine={false}
        />
        <YAxis
          tickFormatter={(v) => `R$${Number(v).toFixed(0)}`}
          tick={{ fontSize: 10, fill: "#6b7280" }}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip
          formatter={(value: number) => [fmtBRL(value), "Custo Médio"]}
          labelFormatter={(label) => `Data: ${label}`}
          contentStyle={{ fontSize: 12, borderRadius: 8 }}
        />
        <Legend
          wrapperStyle={{ fontSize: 12 }}
          formatter={() => "Custo Médio por Compra (R$)"}
        />
        <Line
          type="monotone"
          dataKey="custoMedio"
          stroke="#16a34a"
          strokeWidth={2}
          dot={{ r: 3, fill: "#16a34a" }}
          activeDot={{ r: 5 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
