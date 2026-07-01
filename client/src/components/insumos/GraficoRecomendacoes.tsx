import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import type { RecomendacaoInsumo } from "@/lib/recomendacaoInsumos";
import { fmtBRL } from "@/lib/custoCalculo";

interface GraficoRecomendacoesProps {
  recomendacoes: RecomendacaoInsumo[];
  /** Máximo de itens a exibir (padrão: 10) */
  limite?: number;
}

const STATUS_COLORS: Record<string, string> = {
  ok: "#16a34a",
  atencao: "#d97706",
  critico: "#dc2626",
};

const CustomTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const rec = payload[0]?.payload as RecomendacaoInsumo & { nomeAbrev: string; cobertura: number };
  return (
    <div className="bg-white border border-border rounded-lg shadow-lg p-3 text-xs max-w-xs">
      <p className="font-semibold text-sm mb-1.5">{rec.nome}</p>
      <div className="space-y-0.5">
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">Estoque atual:</span>
          <span className="font-medium">
            {rec.quantidadeAtual.toFixed(1)} {rec.unidade}
          </span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">Recomendado:</span>
          <span className="font-medium text-green-700">
            {rec.quantidadeIdeal.toFixed(1)} {rec.unidade}
          </span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">Mínimo:</span>
          <span className="font-medium text-amber-600">
            {rec.quantidadeMinima.toFixed(1)} {rec.unidade}
          </span>
        </div>
        {rec.custoEstimado > 0 && (
          <div className="flex justify-between gap-4 pt-1 border-t border-border/50">
            <span className="text-muted-foreground">Custo estimado:</span>
            <span className="font-bold">{fmtBRL(rec.custoEstimado)}</span>
          </div>
        )}
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">Cobertura:</span>
          <span
            className={`font-bold ${
              rec.status === "ok"
                ? "text-green-700"
                : rec.status === "atencao"
                ? "text-amber-600"
                : "text-red-700"
            }`}
          >
            {(rec.percentualCobertura * 100).toFixed(0)}%
          </span>
        </div>
      </div>
    </div>
  );
};

export function GraficoRecomendacoes({
  recomendacoes,
  limite = 12,
}: GraficoRecomendacoesProps) {
  if (recomendacoes.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-sm text-muted-foreground">
        Nenhuma recomendação calculada. Configure o rebanho acima.
      </div>
    );
  }

  // Ordenar por cobertura (mais críticos primeiro) e limitar
  const dados = [...recomendacoes]
    .sort((a, b) => a.percentualCobertura - b.percentualCobertura)
    .slice(0, limite)
    .map((r) => ({
      ...r,
      nomeAbrev: r.nome.length > 16 ? r.nome.slice(0, 14) + "…" : r.nome,
      cobertura: Math.min(r.percentualCobertura * 100, 150),
    }));

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart
        data={dados}
        margin={{ top: 8, right: 40, left: 0, bottom: 60 }}
        barCategoryGap="30%"
      >
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" vertical={false} />
        <XAxis
          dataKey="nomeAbrev"
          tick={{ fontSize: 10, fill: "#6b7280" }}
          tickLine={false}
          angle={-35}
          textAnchor="end"
          interval={0}
        />
        <YAxis
          tickFormatter={(v) => `${v}%`}
          tick={{ fontSize: 10, fill: "#6b7280" }}
          tickLine={false}
          axisLine={false}
          domain={[0, 150]}
        />
        <Tooltip content={<CustomTooltip />} />
        <Legend
          wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
          formatter={() => "Cobertura atual (%)"}
        />
        {/* Linha de 100% = quantidade ideal */}
        <ReferenceLine
          y={100}
          stroke="#16a34a"
          strokeDasharray="6 3"
          strokeWidth={1.5}
          label={{ value: "Ideal", position: "insideRight", fontSize: 10, fill: "#16a34a" }}
        />
        {/* Linha de 70% = mínimo recomendado */}
        <ReferenceLine
          y={70}
          stroke="#d97706"
          strokeDasharray="4 3"
          strokeWidth={1.5}
          label={{ value: "Mín.", position: "insideRight", fontSize: 10, fill: "#d97706" }}
        />
        <Bar dataKey="cobertura" name="cobertura" radius={[4, 4, 0, 0]}>
          {dados.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={STATUS_COLORS[entry.status]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
