"use client";
import { useState, useEffect, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from "recharts";

const API = "https://ruralcaixa-mvp-production.up.railway.app";
const fmt = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtK = (v: number) =>
  Math.abs(v) >= 1000 ? `R$ ${(v / 1000).toFixed(0)}k` : `R$ ${v}`;

const CONTAS: Record<string, string> = {
  "1.1.1": "Agricola", "1.1.2": "Pecuaria", "1.2": "Servicos",
  "3.1.1": "Custeio Agricola", "3.1.2": "Combustivel", "3.1.3": "Pecuaria",
  "3.1.4": "Mao de Obra", "3.1.5": "Manutencao", "3.1.6": "Energia",
  "3.1.7": "Arrendamento", "5.1": "Maquinas", "5.2": "Benfeitorias", "5.3": "Animais",
};

const safrasDisponiveis = Array.from({ length: 5 }, (_, i) => {
  const ano = new Date().getFullYear() - 2 + i;
  return { label: `${ano}/${ano + 1}`, value: ano };
});

// ── Componentes auxiliares ────────────────────────────────────────────────────

function MetricCard({
  label, value, variant = "default", sub
}: { label: string; value: string; variant?: string; sub?: string }) {
  const colors: Record<string, string> = {
    default: "text-gray-900",
    success: "text-green-700",
    danger: "text-red-600",
    blue: "text-blue-700",
    amber: "text-amber-600",
  };
  return (
    <div className="bg-white rounded-xl p-3 shadow-sm space-y-0.5">
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`text-sm font-bold ${colors[variant]}`}>{value}</div>
      {sub && <div className="text-xs text-gray-400">{sub}</div>}
    </div>
  );
}

function ToggleVisao({
  viewType, onChange
}: { viewType: string; onChange: (v: string) => void }) {
  return (
    <div className="flex rounded-xl border border-gray-200 overflow-hidden">
      {[
        { key: "managerial", icon: "🌾", label: "Safra" },
        { key: "fiscal", icon: "📋", label: "Fiscal" },
      ].map(v => (
        <button key={v.key} onClick={() => onChange(v.key)}
          className={`flex-1 py-2 text-xs font-medium transition-colors ${
            viewType === v.key ? "bg-green-800 text-white" : "bg-white text-gray-600"
          }`}>
          {v.icon} {v.label}
        </button>
      ))}
    </div>
  );
}

function BadgeParticipacao({ imovel, perc }: { imovel: string; perc: number }) {
  return (
    <div className="flex items-center gap-1.5 text-xs bg-green-50 border border-green-200 rounded-lg px-3 py-1.5">
      <span className="w-2 h-2 rounded-full bg-green-600 flex-shrink-0" />
      <span className="text-green-800 font-medium">
        {perc.toFixed(0)}% em {imovel}
      </span>
    </div>
  );
}

// Linha do DRE expansível
function LinhaAccordion({
  label, valor, percentualReceita, isNegativo = false, nivel = 0, filhos = [],
}: {
  label: string; valor: number; percentualReceita: number;
  isNegativo?: boolean; nivel?: number; filhos?: { label: string; valor: number }[];
}) {
  const [aberto, setAberto] = useState(false);
  const temFilhos = filhos.length > 0;
  const indent = nivel === 0 ? "" : "pl-4";
  const textSize = nivel === 0 ? "text-sm font-semibold" : "text-xs font-medium";

  return (
    <>
      <div
        onClick={() => temFilhos && setAberto(o => !o)}
        className={`flex items-center justify-between py-2.5 border-b border-gray-50
          ${indent} ${temFilhos ? "cursor-pointer hover:bg-gray-50" : ""}`}>
        <div className="flex items-center gap-2 min-w-0">
          {temFilhos && (
            <svg className={`w-3 h-3 text-gray-400 flex-shrink-0 transition-transform ${aberto ? "rotate-90" : ""}`}
              fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          )}
          {!temFilhos && <span className="w-3 flex-shrink-0" />}
          <span className={`${textSize} text-gray-700 truncate`}>{label}</span>
        </div>
        <div className="text-right flex-shrink-0 ml-3">
          <div className={`${textSize} ${isNegativo ? "text-red-600" : "text-green-700"}`}>
            {isNegativo ? `(${fmt(valor)})` : fmt(valor)}
          </div>
          <div className="text-xs text-gray-400">{percentualReceita.toFixed(1)}%</div>
        </div>
      </div>
      {aberto && filhos.map((f, i) => (
        <div key={i} className="flex items-center justify-between py-2 border-b border-gray-50 pl-8 bg-gray-50/50">
          <span className="text-xs text-gray-500 truncate">{f.label}</span>
          <span className={`text-xs font-medium flex-shrink-0 ml-2 ${isNegativo ? "text-red-500" : "text-green-600"}`}>
            {fmt(f.valor)}
          </span>
        </div>
      ))}
    </>
  );
}

// Seção do DRE (Receitas / Despesas / Intermediação)
function SecaoDRE({
  titulo, tipo, total, subcontas, totalReceitas
}: {
  titulo: string; tipo: string; total: number;
  subcontas: Record<string, number>; totalReceitas: number;
}) {
  const [aberta, setAberta] = useState(true);
  const isNegativo = tipo === "DESPESA" || tipo === "INVESTIMENTO";
  const borderColor = tipo === "RECEITA" ? "border-green-500"
    : tipo === "INTERMEDIACAO" ? "border-blue-400"
    : "border-red-400";
  const bgHeader = tipo === "RECEITA" ? "bg-green-50"
    : tipo === "INTERMEDIACAO" ? "bg-blue-50"
    : "bg-red-50";
  const textColor = tipo === "RECEITA" ? "text-green-800"
    : tipo === "INTERMEDIACAO" ? "text-blue-700"
    : "text-red-700";

  return (
    <div className={`bg-white rounded-xl shadow-sm overflow-hidden border-l-4 ${borderColor}`}>
      <button onClick={() => setAberta(o => !o)}
        className={`w-full flex items-center justify-between px-4 py-3 ${bgHeader}`}>
        <div className="flex items-center gap-2">
          <svg className={`w-3.5 h-3.5 text-gray-500 transition-transform ${aberta ? "rotate-90" : ""}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <span className={`text-sm font-semibold ${textColor}`}>{titulo}</span>
        </div>
        <span className={`text-sm font-bold ${isNegativo ? "text-red-600" : textColor}`}>
          {isNegativo ? `(${fmt(total)})` : fmt(total)}
        </span>
      </button>

      {aberta && (
        <div className="px-4 pb-2">
          {Object.entries(subcontas).length === 0 ? (
            <div className="text-xs text-gray-400 py-3 text-center">Sem lancamentos</div>
          ) : (
            Object.entries(subcontas).map(([subconta, valor], i) => (
              <LinhaAccordion
                key={i}
                label={subconta}
                valor={valor as number}
                percentualReceita={totalReceitas > 0 ? ((valor as number) / totalReceitas) * 100 : 0}
                isNegativo={isNegativo}
                nivel={1}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────

function AnalyticsContent() {
  const searchParams = useSearchParams();
  const produtorId = searchParams.get("produtor_id") || "1";

  const [aba, setAba] = useState<"dre" | "grafico" | "evolucao">("dre");
  const [viewType, setViewType] = useState("managerial");
  const [yearSafra, setYearSafra] = useState(
    new Date().getMonth() >= 6 ? new Date().getFullYear() : new Date().getFullYear() - 1
  );
  const [visaoIntegral, setVisaoIntegral] = useState(false);

  const [dreData, setDreData] = useState<any>(null);
  const [analyticsData, setAnalyticsData] = useState<any>(null);
  const [produtor, setProdutor] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDados = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [dre, analytics, prods] = await Promise.all([
        fetch(`${API}/produtores/${produtorId}/dre?view_type=${viewType}&year=${yearSafra}&visao_integral=${visaoIntegral}`)
          .then(r => r.json()),
        fetch(`${API}/produtores/${produtorId}/analytics`).then(r => r.json()),
        fetch(`${API}/produtores`).then(r => r.json()),
      ]);
      setDreData(dre);
      setAnalyticsData(analytics);
      setProdutor(prods.find((p: any) => p.id === parseInt(produtorId)) || prods[0]);
    } catch (e) {
      setError("Erro ao carregar dados");
    } finally {
      setLoading(false);
    }
  }, [produtorId, viewType, yearSafra, visaoIntegral]);

  useEffect(() => { fetchDados(); }, [fetchDados]);

  // Métricas derivadas do DRE
  const totalRec = dreData?.total_receitas ?? 0;
  const totalDesp = dreData?.total_despesas ?? 0;
  const resultado = dreData?.total_geral ?? 0;
  const margem = totalRec > 0 ? ((resultado / totalRec) * 100).toFixed(1) : "0";
  const pontoEquilibrio = totalRec > 0 ? ((totalDesp / totalRec) * 100).toFixed(1) : "0";

  // Participação no primeiro imóvel
  const primeiroImovel = dreData?.detalhamento_por_imovel?.[0];
  const percParticipacao = primeiroImovel?.tipo_sociedade?.match(/\((\d+)%\)/)?.[1] ?? "100";

  // Dados para gráfico de barras do DRE
  const dreBarData = dreData?.detalhamento_por_imovel?.map((im: any) => ({
    name: im.nome_imovel,
    Receitas: im.total_receitas,
    Despesas: im.total_despesas,
  })) ?? [];

  // Evolução mensal (analytics antigo)
  const meses = analyticsData
    ? ([...new Set(analyticsData.evolucao_mensal.map((e: any) => e.mes as string))] as string[]).sort()
    : [];
  const evolucaoData = meses.map((mes: string) => {
    const rec = analyticsData.evolucao_mensal.find((e: any) => e.mes === mes && e.tipo === "receita");
    const desp = analyticsData.evolucao_mensal.find((e: any) => e.mes === mes && e.tipo === "despesa");
    return { mes: mes.slice(5), Receitas: rec?.total ?? 0, Despesas: desp?.total ?? 0 };
  });

  // Monta seções do DRE a partir do detalhamento por imóvel
  const subcontasAgregadas = { receitas: {} as any, despesas: {} as any, intermediacao: {} as any };
  dreData?.detalhamento_por_imovel?.forEach((im: any) => {
    Object.entries(im.subcontas?.receitas ?? {}).forEach(([k, v]) => {
      subcontasAgregadas.receitas[k] = (subcontasAgregadas.receitas[k] ?? 0) + (v as number);
    });
    Object.entries(im.subcontas?.despesas ?? {}).forEach(([k, v]) => {
      subcontasAgregadas.despesas[k] = (subcontasAgregadas.despesas[k] ?? 0) + (v as number);
    });
    Object.entries(im.subcontas?.intermediacao ?? {}).forEach(([k, v]) => {
      subcontasAgregadas.intermediacao[k] = (subcontasAgregadas.intermediacao[k] ?? 0) + (v as number);
    });
  });
  const totalIntermed = Object.values(subcontasAgregadas.intermediacao).reduce((s: any, v: any) => s + v, 0) as number;

  return (
    <div className="min-h-screen bg-gray-50 max-w-md mx-auto pb-20">

      {/* Header */}
      <div className="bg-green-800 text-white px-4 py-4">
        <a href="/contador" className="text-xs opacity-70">← Voltar</a>
        <div className="text-lg font-medium mt-1">DRE Analitico</div>
        <div className="text-xs opacity-70">{produtor?.nome || "Produtor"}</div>
      </div>

      <div className="p-4 space-y-4">

        {/* ── Filtros ── */}
        <div className="bg-white rounded-xl p-4 shadow-sm space-y-3">
          <ToggleVisao viewType={viewType} onChange={setViewType} />

          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500 whitespace-nowrap">
              {viewType === "managerial" ? "Safra:" : "Ano:"}
            </label>
            <select value={yearSafra} onChange={e => setYearSafra(Number(e.target.value))}
              className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-xs bg-white">
              {safrasDisponiveis.map(s => (
                <option key={s.value} value={s.value}>
                  {viewType === "managerial" ? s.label : s.value}
                </option>
              ))}
            </select>
          </div>

          {viewType === "managerial" && (
            <label className="flex items-center gap-2 cursor-pointer">
              <div onClick={() => setVisaoIntegral(v => !v)}
                className={`relative w-9 h-5 rounded-full transition-colors ${visaoIntegral ? "bg-green-600" : "bg-gray-300"}`}>
                <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${visaoIntegral ? "translate-x-4" : ""}`} />
              </div>
              <span className="text-xs text-gray-600">
                {visaoIntegral ? "Visao integral da fazenda (100%)" : "Visao proporcional (minha cota)"}
              </span>
            </label>
          )}

          {primeiroImovel && !visaoIntegral && (
            <BadgeParticipacao
              imovel={primeiroImovel.nome_imovel}
              perc={parseFloat(percParticipacao)}
            />
          )}
        </div>

        {loading && (
          <div className="flex items-center justify-center py-12 text-gray-400 text-sm gap-2">
            <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Calculando DRE...
          </div>
        )}

        {error && (
          <div className="bg-red-50 text-red-600 text-sm rounded-xl px-4 py-3">{error}</div>
        )}

        {!loading && dreData && (
          <>
            {/* ── Cards de métricas ── */}
            <div className="grid grid-cols-2 gap-3">
              <MetricCard label="Receita total" value={fmt(totalRec)} variant="success"
                sub={dreData.periodo} />
              <MetricCard label="Despesa total" value={fmt(totalDesp)} variant="danger" />
              <MetricCard label="Resultado liquido" value={fmt(resultado)}
                variant={resultado >= 0 ? "success" : "danger"}
                sub={`Margem ${margem}%`} />
              <MetricCard label="Ponto de equilibrio" value={`${pontoEquilibrio}%`}
                variant={parseFloat(pontoEquilibrio) <= 100 ? "amber" : "danger"}
                sub="desp / receita" />
            </div>

            {/* ── Abas ── */}
            <div className="flex gap-2">
              {[
                { id: "dre", label: "DRE" },
                { id: "grafico", label: "Graficos" },
                { id: "evolucao", label: "Evolucao" },
              ].map(a => (
                <button key={a.id} onClick={() => setAba(a.id as any)}
                  className={`flex-1 py-2 rounded-xl text-xs font-medium transition-colors ${
                    aba === a.id ? "bg-green-800 text-white" : "bg-white text-gray-600 border border-gray-200"
                  }`}>
                  {a.label}
                </button>
              ))}
            </div>

            {/* ── ABA: DRE ── */}
            {aba === "dre" && (
              <div className="space-y-3">

                {/* Linha de Receita Bruta */}
                <div className="bg-white rounded-xl shadow-sm border-l-4 border-green-500">
                  <SecaoDRE
                    titulo="Receitas da Atividade Rural"
                    tipo="RECEITA"
                    total={totalRec}
                    subcontas={subcontasAgregadas.receitas}
                    totalReceitas={totalRec}
                  />
                </div>

                {/* Despesas */}
                <SecaoDRE
                  titulo="Despesas Operacionais"
                  tipo="DESPESA"
                  total={totalDesp}
                  subcontas={subcontasAgregadas.despesas}
                  totalReceitas={totalRec}
                />

                {/* Resultado */}
                <div className={`rounded-xl px-4 py-3 ${resultado >= 0 ? "bg-green-800" : "bg-red-700"} text-white`}>
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-semibold">Resultado {dreData.periodo}</span>
                    <span className="text-lg font-bold">{fmt(resultado)}</span>
                  </div>
                  <div className="flex justify-between text-xs opacity-75 mt-1">
                    <span>Margem liquida</span>
                    <span>{margem}%</span>
                  </div>
                </div>

                {/* Intermediação (separada) */}
                {totalIntermed > 0 && (
                  <div className="space-y-1">
                    <div className="text-xs text-gray-400 px-1">
                      Intermediacao — nao entra no calculo do imposto rural
                    </div>
                    <SecaoDRE
                      titulo="Intermediacao (nao rural)"
                      tipo="INTERMEDIACAO"
                      total={totalIntermed}
                      subcontas={subcontasAgregadas.intermediacao}
                      totalReceitas={totalRec}
                    />
                  </div>
                )}

                {/* Detalhamento por imóvel */}
                {dreData.detalhamento_por_imovel.length > 1 && (
                  <div className="bg-white rounded-xl shadow-sm p-4 space-y-3">
                    <div className="text-sm font-semibold text-gray-700">Por imovel</div>
                    {dreData.detalhamento_por_imovel.map((im: any, i: number) => (
                      <div key={i} className="border-b last:border-0 pb-2 last:pb-0">
                        <div className="flex justify-between items-start">
                          <div>
                            <div className="text-xs font-medium text-gray-700">{im.nome_imovel}</div>
                            <div className="text-xs text-gray-400">{im.tipo_sociedade}</div>
                          </div>
                          <div className={`text-sm font-bold ${im.resultado_proporcional >= 0 ? "text-green-700" : "text-red-600"}`}>
                            {fmt(im.resultado_proporcional)}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── ABA: GRÁFICOS ── */}
            {aba === "grafico" && (
              <div className="space-y-4">
                <div className="bg-white rounded-xl p-4 shadow-sm">
                  <div className="text-sm font-medium text-gray-700 mb-3">Receita vs Despesa por Imovel</div>
                  {dreBarData.length === 0 ? (
                    <div className="text-center text-gray-400 py-8 text-sm">Sem dados</div>
                  ) : (
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={dreBarData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis dataKey="name" tick={{ fontSize: 9 }} />
                        <YAxis tickFormatter={fmtK} tick={{ fontSize: 9 }} />
                        <Tooltip formatter={(v: any) => fmt(v)} />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <Bar dataKey="Receitas" fill="#166534" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="Despesas" fill="#dc2626" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>

                {/* Composição de despesas */}
                {Object.keys(subcontasAgregadas.despesas).length > 0 && (
                  <div className="bg-white rounded-xl p-4 shadow-sm">
                    <div className="text-sm font-medium text-gray-700 mb-3">Composicao das Despesas</div>
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart
                        data={Object.entries(subcontasAgregadas.despesas).map(([k, v]) => ({ name: k, valor: v }))}
                        layout="vertical">
                        <XAxis type="number" tickFormatter={fmtK} tick={{ fontSize: 9 }} />
                        <YAxis type="category" dataKey="name" tick={{ fontSize: 9 }} width={110} />
                        <Tooltip formatter={(v: any) => fmt(v)} />
                        <Bar dataKey="valor" fill="#dc2626" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            )}

            {/* ── ABA: EVOLUÇÃO ── */}
            {aba === "evolucao" && (
              <div className="space-y-4">
                <div className="bg-white rounded-xl p-4 shadow-sm">
                  <div className="text-sm font-medium text-gray-700 mb-4">Evolucao Mensal (6 meses)</div>
                  {evolucaoData.length === 0 ? (
                    <div className="text-center text-gray-400 py-8 text-sm">Sem dados</div>
                  ) : (
                    <ResponsiveContainer width="100%" height={240}>
                      <BarChart data={evolucaoData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis dataKey="mes" tick={{ fontSize: 10 }} />
                        <YAxis tickFormatter={fmtK} tick={{ fontSize: 10 }} />
                        <Tooltip formatter={(v: any) => fmt(v)} />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <Bar dataKey="Receitas" fill="#166534" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="Despesas" fill="#dc2626" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>

                {/* Indicadores */}
                <div className="bg-green-800 text-white rounded-xl p-4 space-y-2">
                  <div className="text-sm font-semibold opacity-80 mb-3">Indicadores</div>
                  {[
                    ["Margem operacional", `${margem}%`],
                    ["Receita / Despesa", totalDesp > 0 ? `${(totalRec / totalDesp).toFixed(2)}x` : "—"],
                    ["Ponto de equilibrio", `${pontoEquilibrio}% da receita`],
                    ["Resultado liquido", fmt(resultado)],
                  ].map(([label, value], i) => (
                    <div key={i} className="flex justify-between text-sm">
                      <span className="opacity-75">{label}</span>
                      <span className="font-bold">{value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        <a href="/contador"
          className="block w-full py-3 rounded-xl text-sm font-medium text-white bg-green-800 text-center mt-4">
          ← Voltar ao painel
        </a>
      </div>
    </div>
  );
}

export default function Analytics() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-400 text-sm">Carregando...</div>
      </div>
    }>
      <AnalyticsContent />
    </Suspense>
  );
}
