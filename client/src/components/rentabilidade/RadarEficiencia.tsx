import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from "recharts";

export interface DadoRadar {
  indicador: string;
  atual: number;      // 0-100 (normalizado)
  referencia: number; // 0-100 (benchmark Embrapa)
}

interface RadarEficienciaProps {
  dados: DadoRadar[];
  titulo?: string;
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-border rounded-lg shadow p-2 text-xs">
      <p className="font-semibold mb-1">{label}</p>
      {payload.map((p: any, i: number) => (
        <div key={i} className="flex justify-between gap-3">
          <span style={{ color: p.color }}>{p.name}:</span>
          <span className="font-bold">{p.value.toFixed(0)}%</span>
        </div>
      ))}
    </div>
  );
};

export function RadarEficiencia({ dados, titulo = "Perfil de Eficiência" }: RadarEficienciaProps) {
  if (dados.length === 0) return null;

  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold text-foreground">{titulo}</p>
      <ResponsiveContainer width="100%" height={240}>
        <RadarChart data={dados} margin={{ top: 8, right: 24, bottom: 8, left: 24 }}>
          <PolarGrid stroke="rgba(0,0,0,0.1)" />
          <PolarAngleAxis
            dataKey="indicador"
            tick={{ fontSize: 10, fill: "#6b7280" }}
          />
          <PolarRadiusAxis
            angle={90}
            domain={[0, 100]}
            tick={{ fontSize: 9, fill: "#9ca3af" }}
            tickCount={4}
          />
          <Radar
            name="Referência Embrapa"
            dataKey="referencia"
            stroke="#86efac"
            fill="#86efac"
            fillOpacity={0.25}
            strokeWidth={1.5}
            strokeDasharray="5 3"
          />
          <Radar
            name="Sua operação"
            dataKey="atual"
            stroke="#2563eb"
            fill="#2563eb"
            fillOpacity={0.3}
            strokeWidth={2}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
        </RadarChart>
      </ResponsiveContainer>
      <p className="text-xs text-muted-foreground text-center">
        Valores normalizados 0–100% em relação ao benchmark técnico Embrapa
      </p>
    </div>
  );
}
