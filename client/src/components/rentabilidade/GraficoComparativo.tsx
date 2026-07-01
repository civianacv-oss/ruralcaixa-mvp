import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { fmtBRL } from "@/lib/custoCalculo";

export interface PontoPeriodo {
  periodo: string;          // ex: "Jan/25", "Fev/25"
  custoTotal: number;       // R$
  receita: number;          // R$
  margemBruta: number;      // R$
  margemPerc: number;       // %
  indicadorPrincipal: number; // GMD ou L/vaca/dia
  labelIndicador: string;   // "GMD (kg/dia)" ou "L/vaca/dia"
}

interface GraficoComparativoProps {
  dados: PontoPeriodo[];
  sistema: "corte" | "leite";
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-border rounded-lg shadow-lg p-3 text-xs min-w-[180px]">
      <p className="font-semibold text-sm mb-2">{label}</p>
      {payload.map((p: any, i: number) => (
        <div key={i} className="flex justify-between gap-4 mb-0.5">
          <span style={{ color: p.color }}>{p.name}:</span>
          <span className="font-medium">
            {p.name.includes("Margem %")
              ? `${p.value.toFixed(1)}%`
              : p.name.includes("GMD") || p.name.includes("L/vaca")
              ? p.value.toFixed(2)
              : fmtBRL(p.value)}
          </span>
        </div>
      ))}
    </div>
  );
};

export function GraficoComparativo({ dados, sistema }: GraficoComparativoProps) {
  if (dados.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-sm text-muted-foreground">
        Adicione pelo menos 2 períodos para ver o comparativo.
      </div>
    );
  }

  const labelIndicador = sistema === "corte" ? "GMD (kg/dia)" : "L/vaca/dia";

  return (
    <ResponsiveContainer width="100%" height={280}>
      <ComposedChart data={dados} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" vertical={false} />
        <XAxis dataKey="periodo" tick={{ fontSize: 11, fill: "#6b7280" }} tickLine={false} />
        <YAxis
          yAxisId="left"
          tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`}
          tick={{ fontSize: 10, fill: "#6b7280" }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          yAxisId="right"
          orientation="right"
          tickFormatter={(v) => `${v.toFixed(1)}`}
          tick={{ fontSize: 10, fill: "#6b7280" }}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip content={<CustomTooltip />} />
        <Legend wrapperStyle={{ fontSize: 11, paddingTop: 4 }} />
        <ReferenceLine yAxisId="left" y={0} stroke="#6b7280" strokeWidth={1} />
        <Bar yAxisId="left" dataKey="receita" name="Receita" fill="#86efac" radius={[3, 3, 0, 0]} barSize={18} />
        <Bar yAxisId="left" dataKey="custoTotal" name="Custo Total" fill="#fca5a5" radius={[3, 3, 0, 0]} barSize={18} />
        <Line
          yAxisId="left"
          type="monotone"
          dataKey="margemBruta"
          name="Margem Bruta"
          stroke="#2563eb"
          strokeWidth={2}
          dot={{ r: 4, fill: "#2563eb" }}
          activeDot={{ r: 6 }}
        />
        <Line
          yAxisId="right"
          type="monotone"
          dataKey="indicadorPrincipal"
          name={labelIndicador}
          stroke="#d97706"
          strokeWidth={2}
          strokeDasharray="5 3"
          dot={{ r: 3, fill: "#d97706" }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
