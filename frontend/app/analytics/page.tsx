"use client";
import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";

const API = "https://ruralcaixa-mvp-production.up.railway.app";
const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtK = (v: number) => v >= 1000 ? `R$ ${(v/1000).toFixed(0)}k` : `R$ ${v}`;

const CONTAS: Record<string, string> = {
  "1.1.1": "Agricola", "1.1.2": "Pecuaria", "1.2": "Servicos",
  "3.1.1": "Custeio", "3.1.2": "Combustivel", "3.1.3": "Pecuaria",
  "3.1.4": "Mao de obra", "3.1.5": "Manutencao", "3.1.6": "Energia",
  "3.1.7": "Arrendamento", "3.9": "Outras", "5.1": "Maquinas",
  "5.2": "Benfeitorias", "5.3": "Animais",
};

const CORES = ["#166534", "#16a34a", "#4ade80", "#86efac", "#dcfce7",
               "#991b1b", "#dc2626", "#f87171", "#fca5a5", "#fee2e2",
               "#1e3a8a", "#2563eb", "#60a5fa", "#93c5fd"];

function AnalyticsContent() {
  const searchParams = useSearchParams();
  const produtorId = searchParams.get("produtor_id") || "1";
  const [data, setData] = useState<any>(null);
  const [produtor, setProdutor] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [aba, setAba] = useState<"receitas" | "despesas" | "evolucao" | "rentabilidade">("receitas");

  useEffect(() => {
    Promise.all([
      fetch(`${API}/produtores/${produtorId}/analytics`).then(r => r.json()),
      fetch(`${API}/produtores`).then(r => r.json()),
    ]).then(([analytics, prods]) => {
      setData(analytics);
      setProdutor(prods.find((p: any) => p.id === parseInt(produtorId)) || prods[0]);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [produtorId]);

  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-gray-400">Carregando analytics...</div>
    </div>
  );

  if (!data) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-gray-400">Sem dados disponíveis</div>
    </div>
  );

  const totalReceitas = data.receitas_por_produto.reduce((s: number, r: any) => s + r.total, 0);
  const totalDespesas = data.despesas_por_categoria.reduce((s: number, d: any) => s + d.total, 0);
  const totalInvest = data.investimentos.reduce((s: number, i: any) => s + i.total, 0);
  const resultado = totalReceitas - totalDespesas;
  const margem = totalReceitas > 0 ? ((resultado / totalReceitas) * 100).toFixed(1) : "0";

  // Dados para gráfico de evolução mensal
  const meses = ([...new Set(data.evolucao_mensal.map((e: any) => e.mes as string))] as string[]).sort();
  const evolucaoData = meses.map((mes: string) => {
    const rec = data.evolucao_mensal.find((e: any) => e.mes === mes && e.tipo === "receita");
    const desp = data.evolucao_mensal.find((e: any) => e.mes === mes && e.tipo === "despesa");
    return {
      mes: mes.slice(5), // só MM
      Receitas: rec ? rec.total : 0,
      Despesas: desp ? desp.total : 0,
    };
  });

  // Rentabilidade: receita vs despesa por atividade
  const atividadesRec = data.receitas_por_produto.map((r: any) => ({
    name: r.label || CONTAS[r.conta] || r.conta,
    Receita: r.total,
  }));

  return (
    <div className="min-h-screen bg-gray-50 max-w-md mx-auto pb-20">
      <div className="bg-green-800 text-white px-4 py-4">
        <a href="/contador" className="text-xs opacity-70">← Voltar</a>
        <div className="text-lg font-medium mt-1">Analytics</div>
        <div className="text-xs opacity-70">{produtor?.nome || "Produtor"}</div>
      </div>

      {/* KPIs */}
      <div className="p-4 grid grid-cols-2 gap-3">
        <div className="bg-white rounded-xl p-3 shadow-sm">
          <div className="text-xs text-gray-500">Receita total</div>
          <div className="text-sm font-bold text-green-700 mt-1">{fmt(totalReceitas)}</div>
        </div>
        <div className="bg-white rounded-xl p-3 shadow-sm">
          <div className="text-xs text-gray-500">Despesa total</div>
          <div className="text-sm font-bold text-red-600 mt-1">{fmt(totalDespesas)}</div>
        </div>
        <div className="bg-white rounded-xl p-3 shadow-sm">
          <div className="text-xs text-gray-500">Resultado</div>
          <div className={`text-sm font-bold mt-1 ${resultado >= 0 ? "text-green-700" : "text-red-600"}`}>{fmt(resultado)}</div>
        </div>
        <div className="bg-white rounded-xl p-3 shadow-sm">
          <div className="text-xs text-gray-500">Margem</div>
          <div className={`text-sm font-bold mt-1 ${parseFloat(margem) >= 0 ? "text-green-700" : "text-red-600"}`}>{margem}%</div>
        </div>
      </div>

      {/* Abas */}
      <div className="px-4 flex gap-2 overflow-x-auto pb-2">
        {[
          { id: "receitas", label: "Receitas" },
          { id: "despesas", label: "Despesas" },
          { id: "evolucao", label: "Evolução" },
          { id: "rentabilidade", label: "Rentabilidade" },
        ].map(a => (
          <button
            key={a.id}
            onClick={() => setAba(a.id as any)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap ${
              aba === a.id ? "bg-green-800 text-white" : "bg-white text-gray-600 border"
            }`}
          >
            {a.label}
          </button>
        ))}
      </div>

      <div className="p-4 space-y-4">

        {/* RECEITAS POR PRODUTO */}
        {aba === "receitas" && (
          <>
            <div className="bg-white rounded-xl p-4 shadow-sm">
              <div className="text-sm font-medium text-gray-700 mb-4">Receitas por Produto/Cultura</div>
              {data.receitas_por_produto.length === 0 ? (
                <div className="text-center text-gray-400 py-8">Sem dados</div>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={data.receitas_por_produto.map((r: any) => ({
                    name: r.label || CONTAS[r.conta] || r.conta,
                    valor: r.total,
                  }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                    <YAxis tickFormatter={fmtK} tick={{ fontSize: 10 }} />
                    <Tooltip formatter={(v: any) => fmt(v)} />
                    <Bar dataKey="valor" fill="#166534" radius={[4,4,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="bg-white rounded-xl p-4 shadow-sm">
              <div className="text-sm font-medium text-gray-700 mb-3">Detalhamento</div>
              {data.receitas_por_produto.map((r: any, i: number) => (
                <div key={i} className="flex items-center justify-between py-2 border-b last:border-0">
                  <div>
                    <div className="text-sm font-medium">{r.label || CONTAS[r.conta] || r.conta}</div>
                    <div className="text-xs text-gray-400">Conta {r.conta}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold text-green-700">{fmt(r.total)}</div>
                    <div className="text-xs text-gray-400">{totalReceitas > 0 ? ((r.total/totalReceitas)*100).toFixed(1) : 0}%</div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* DESPESAS POR CATEGORIA */}
        {aba === "despesas" && (
          <>
            <div className="bg-white rounded-xl p-4 shadow-sm">
              <div className="text-sm font-medium text-gray-700 mb-4">Despesas por Categoria</div>
              {data.despesas_por_categoria.length === 0 ? (
                <div className="text-center text-gray-400 py-8">Sem dados</div>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={data.despesas_por_categoria.map((d: any) => ({
                    name: d.label || CONTAS[d.conta] || d.conta,
                    valor: d.total,
                  }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                    <YAxis tickFormatter={fmtK} tick={{ fontSize: 10 }} />
                    <Tooltip formatter={(v: any) => fmt(v)} />
                    <Bar dataKey="valor" fill="#dc2626" radius={[4,4,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="bg-white rounded-xl p-4 shadow-sm">
              <div className="text-sm font-medium text-gray-700 mb-3">Detalhamento</div>
              {data.despesas_por_categoria.map((d: any, i: number) => (
                <div key={i} className="flex items-center justify-between py-2 border-b last:border-0">
                  <div>
                    <div className="text-sm font-medium">{d.label || CONTAS[d.conta] || d.conta}</div>
                    <div className="text-xs text-gray-400">Conta {d.conta}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold text-red-600">{fmt(d.total)}</div>
                    <div className="text-xs text-gray-400">{totalDespesas > 0 ? ((d.total/totalDespesas)*100).toFixed(1) : 0}%</div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* EVOLUÇÃO MENSAL */}
        {aba === "evolucao" && (
          <div className="bg-white rounded-xl p-4 shadow-sm">
            <div className="text-sm font-medium text-gray-700 mb-4">Evolução Mensal (6 meses)</div>
            {evolucaoData.length === 0 ? (
              <div className="text-center text-gray-400 py-8">Sem dados</div>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={evolucaoData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="mes" tick={{ fontSize: 10 }} />
                  <YAxis tickFormatter={fmtK} tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(v: any) => fmt(v)} />
                  <Legend />
                  <Bar dataKey="Receitas" fill="#166534" radius={[4,4,0,0]} />
                  <Bar dataKey="Despesas" fill="#dc2626" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        )}

        {/* RENTABILIDADE */}
        {aba === "rentabilidade" && (
          <>
            <div className="bg-white rounded-xl p-4 shadow-sm">
              <div className="text-sm font-medium text-gray-700 mb-4">Receita por Atividade</div>
              {atividadesRec.length === 0 ? (
                <div className="text-center text-gray-400 py-8">Sem dados</div>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={atividadesRec}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                    <YAxis tickFormatter={fmtK} tick={{ fontSize: 10 }} />
                    <Tooltip formatter={(v: any) => fmt(v)} />
                    <Bar dataKey="Receita" fill="#166534" radius={[4,4,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            {totalInvest > 0 && (
              <div className="bg-white rounded-xl p-4 shadow-sm">
                <div className="text-sm font-medium text-gray-700 mb-3">Investimentos</div>
                {data.investimentos.map((inv: any, i: number) => (
                  <div key={i} className="flex items-center justify-between py-2 border-b last:border-0">
                    <div>
                      <div className="text-sm font-medium">{inv.label || CONTAS[inv.conta] || inv.conta}</div>
                      <div className="text-xs text-gray-400">Conta {inv.conta}</div>
                    </div>
                    <div className="text-sm font-semibold text-blue-700">{fmt(inv.total)}</div>
                  </div>
                ))}
                <div className="flex justify-between pt-2 text-sm font-semibold">
                  <span>Total investido</span>
                  <span className="text-blue-700">{fmt(totalInvest)}</span>
                </div>
              </div>
            )}

            <div className="bg-green-800 text-white rounded-xl p-4">
              <div className="text-sm opacity-80 mb-3">Indicadores de performance</div>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="opacity-80">Margem operacional</span>
                  <span className="font-bold">{margem}%</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="opacity-80">Receita / Despesa</span>
                  <span className="font-bold">{totalDespesas > 0 ? (totalReceitas/totalDespesas).toFixed(2) : "—"}x</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="opacity-80">Resultado líquido</span>
                  <span className="font-bold">{fmt(resultado)}</span>
                </div>
              </div>
            </div>
          </>
        )}

        <a href="/contador" className="block w-full py-3 rounded-xl text-sm font-medium text-white bg-green-800 text-center">
          ← Voltar ao painel
        </a>
      </div>
    </div>
  );
}

export default function Analytics() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-50 flex items-center justify-center"><div className="text-gray-400">Carregando...</div></div>}>
      <AnalyticsContent />
    </Suspense>
  );
}
