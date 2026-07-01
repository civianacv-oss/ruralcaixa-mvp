/**
 * GaugeIndicador — velocímetro semicircular para exibir um indicador
 * com zonas de cor (vermelho / amarelo / verde).
 * Implementado com PieChart do Recharts (técnica de gauge via donut).
 */
import { PieChart, Pie, Cell } from "recharts";

interface GaugeIndicadorProps {
  valor: number;       // valor atual (ex: 18.5)
  min?: number;        // mínimo da escala (padrão: 0)
  max?: number;        // máximo da escala (padrão: 100)
  label: string;       // rótulo abaixo do valor
  unidade?: string;    // ex: "%" ou "R$/@"
  critico?: number;    // limite inferior zona crítica (padrão: 33% do max)
  atencao?: number;    // limite inferior zona atenção (padrão: 66% do max)
  formatarValor?: (v: number) => string;
}

const RADIAN = Math.PI / 180;

export function GaugeIndicador({
  valor,
  min = 0,
  max = 100,
  label,
  unidade = "%",
  critico,
  atencao,
  formatarValor,
}: GaugeIndicadorProps) {
  const limCritico = critico ?? max * 0.33;
  const limAtencao = atencao ?? max * 0.66;

  // Normalizar valor para 0-180 graus
  const clampedValor = Math.max(min, Math.min(max, valor));
  const angulo = 180 - ((clampedValor - min) / (max - min)) * 180;

  // Zonas: crítico (vermelho), atenção (amarelo), ok (verde)
  const zonaCritico = ((limCritico - min) / (max - min)) * 100;
  const zonaAtencao = ((limAtencao - limCritico) / (max - min)) * 100;
  const zonaOk = 100 - zonaCritico - zonaAtencao;

  const data = [
    { value: zonaCritico, color: "#ef4444" },
    { value: zonaAtencao, color: "#f59e0b" },
    { value: zonaOk, color: "#22c55e" },
    { value: 100, color: "transparent" }, // metade inferior invisível
  ];

  // Cor do ponteiro baseada no valor
  const corValor =
    clampedValor < limCritico
      ? "#ef4444"
      : clampedValor < limAtencao
      ? "#f59e0b"
      : "#22c55e";

  const cx = 80;
  const cy = 80;
  const r = 60;

  // Posição da ponta do ponteiro
  const px = cx + r * Math.cos(angulo * RADIAN);
  const py = cy - r * Math.sin(angulo * RADIAN);

  const valorFormatado = formatarValor
    ? formatarValor(valor)
    : `${valor.toFixed(1)}${unidade}`;

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative" style={{ width: 160, height: 90 }}>
        <PieChart width={160} height={160} style={{ position: "absolute", top: -70 }}>
          <Pie
            data={data}
            cx={cx}
            cy={cy}
            startAngle={180}
            endAngle={0}
            innerRadius={44}
            outerRadius={60}
            dataKey="value"
            stroke="none"
            isAnimationActive={false}
          >
            {data.map((entry, i) => (
              <Cell key={i} fill={entry.color} />
            ))}
          </Pie>
        </PieChart>
        {/* Ponteiro */}
        <svg
          style={{ position: "absolute", top: -70, left: 0 }}
          width={160}
          height={160}
        >
          <line
            x1={cx}
            y1={cy}
            x2={px}
            y2={py}
            stroke={corValor}
            strokeWidth={2.5}
            strokeLinecap="round"
          />
          <circle cx={cx} cy={cy} r={4} fill={corValor} />
        </svg>
        {/* Valor central */}
        <div
          className="absolute flex flex-col items-center"
          style={{ bottom: 0, left: 0, right: 0 }}
        >
          <span className="text-lg font-bold leading-none" style={{ color: corValor }}>
            {valorFormatado}
          </span>
        </div>
      </div>
      <span className="text-xs text-muted-foreground text-center leading-tight">{label}</span>
    </div>
  );
}
