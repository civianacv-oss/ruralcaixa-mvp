import { useState } from "react";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  Sector,
} from "recharts";
import type { DetalheInsumo } from "@/lib/rentabilidadeInsumos";
import { fmtBRL } from "@/lib/custoCalculo";

interface PizzaCustosProps {
  detalheInsumos: DetalheInsumo[];
  outrosCustos: number;
  titulo?: string;
}

const CORES = [
  "#2563eb", "#16a34a", "#d97706", "#dc2626", "#7c3aed",
  "#0891b2", "#be185d", "#65a30d", "#ea580c", "#6366f1",
];

const renderActiveShape = (props: any) => {
  const {
    cx, cy, innerRadius, outerRadius, startAngle, endAngle,
    fill, payload, percent, value,
  } = props;
  return (
    <g>
      <text x={cx} y={cy - 12} textAnchor="middle" fill={fill} className="text-sm font-semibold" fontSize={12}>
        {payload.nome.length > 16 ? payload.nome.slice(0, 14) + "…" : payload.nome}
      </text>
      <text x={cx} y={cy + 8} textAnchor="middle" fill="#374151" fontSize={13} fontWeight="bold">
        {fmtBRL(value)}
      </text>
      <text x={cx} y={cy + 24} textAnchor="middle" fill="#6b7280" fontSize={11}>
        {(percent * 100).toFixed(1)}%
      </text>
      <Sector
        cx={cx} cy={cy}
        innerRadius={innerRadius}
        outerRadius={outerRadius + 8}
        startAngle={startAngle}
        endAngle={endAngle}
        fill={fill}
      />
      <Sector
        cx={cx} cy={cy}
        innerRadius={outerRadius + 12}
        outerRadius={outerRadius + 16}
        startAngle={startAngle}
        endAngle={endAngle}
        fill={fill}
      />
    </g>
  );
};

export function PizzaCustos({
  detalheInsumos,
  outrosCustos,
  titulo = "Composição dos Custos",
}: PizzaCustosProps) {
  const [activeIndex, setActiveIndex] = useState(0);

  // Agrupar insumos menores (< 3%) em "Outros insumos"
  const total = detalheInsumos.reduce((s, d) => s + d.custoTotal, 0) + outrosCustos;
  const principais = detalheInsumos.filter((d) => (d.custoTotal / total) >= 0.03);
  const menores = detalheInsumos.filter((d) => (d.custoTotal / total) < 0.03);
  const totalMenores = menores.reduce((s, d) => s + d.custoTotal, 0);

  const dados = [
    ...principais.map((d) => ({
      nome: d.nome,
      value: d.custoTotal,
      categoria: d.categoria,
    })),
    ...(totalMenores > 0
      ? [{ nome: "Outros insumos", value: totalMenores, categoria: "outros" }]
      : []),
    ...(outrosCustos > 0
      ? [{ nome: "Outros custos", value: outrosCustos, categoria: "operacional" }]
      : []),
  ];

  if (dados.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-sm text-muted-foreground">
        Nenhum custo registrado.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm font-semibold text-foreground">{titulo}</p>
      <ResponsiveContainer width="100%" height={240}>
        <PieChart>
          <Pie
            activeIndex={activeIndex}
            activeShape={renderActiveShape}
            data={dados}
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={90}
            dataKey="value"
            onMouseEnter={(_, index) => setActiveIndex(index)}
          >
            {dados.map((_, i) => (
              <Cell key={i} fill={CORES[i % CORES.length]} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      {/* Legenda */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
        {dados.map((d, i) => (
          <div
            key={i}
            className="flex items-center gap-1.5 text-xs cursor-pointer"
            onMouseEnter={() => setActiveIndex(i)}
          >
            <span
              className="inline-block w-2.5 h-2.5 rounded-sm shrink-0"
              style={{ backgroundColor: CORES[i % CORES.length] }}
            />
            <span className="text-muted-foreground truncate" title={d.nome}>
              {d.nome.length > 18 ? d.nome.slice(0, 16) + "…" : d.nome}
            </span>
            <span className="ml-auto font-medium shrink-0">
              {((d.value / total) * 100).toFixed(0)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
