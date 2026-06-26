"use client";
import { apiFetch } from "@/lib/api";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";

const API = "https://ruralcaixa-mvp-production.up.railway.app";

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const CONTAS: Record<string, string> = {
  "1.1.1": "Venda de produtos agricolas",
  "1.1.2": "Venda de produtos pecuarios",
  "1.2":   "Servicos prestados",
  "3.1.1": "Custeio agricola",
  "3.1.2": "Combustiveis",
  "3.1.3": "Pecuaria",
  "3.1.4": "Mao de obra",
  "3.1.5": "Manutencao",
  "3.1.6": "Energia eletrica",
  "3.1.7": "Arrendamento",
  "3.9":   "Outras despesas",
  "5.1":   "Maquinas e equipamentos",
  "5.2":   "Benfeitorias",
  "5.3":   "Animais",
};

function RelatorioContent() {
  const searchParams = useSearchParams();
  const produtorId = searchParams.get("produtor_id");
  const [lancamentos, setLancamentos] = useState<any[]>([]);
  const [produtor, setProdutor] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const mes = new Date().toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

  useEffect(() => {
    const pid = produtorId || "1";
    Promise.all([
      apiFetch(`${API}/produtores/${pid}/lancamentos?atividade=rural`).then(r => r.json()),
      apiFetch(`${API}/produtores`).then(r => r.json()),
    ]).then(([lancs, prods]) => {
      setLancamentos(lancs);
      setProdutor(prods.find((p: any) => p.id === parseInt(pid)) || prods[0]);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [produtorId]);

  const receitas = lancamentos.filter(l => l.tipo === "receita");
  const despesas = lancamentos.filter(l => l.tipo === "despesa");
  const investimentos = lancamentos.filter(l => l.tipo === "investimento");

  // Agrupar por conta
  const agrupar = (items: any[]) => {
    const grupos: Record<string, { conta: string; desc: string; valor: number }> = {};
    items.forEach(l => {
      const conta = l.conta_codigo || "3.9";
      if (!grupos[conta]) {
        grupos[conta] = { conta, desc: CONTAS[conta] || l.descricao || conta, valor: 0 };
      }
      grupos[conta].valor += l.valor;
    });
    return Object.values(grupos).sort((a, b) => a.conta.localeCompare(b.conta));
  };

  const grReceitas = agrupar(receitas);
  const grDespesas = agrupar(despesas);
  const grInvest = agrupar(investimentos);

  const totalReceitas = grReceitas.reduce((s, r) => s + r.valor, 0);
  const totalDespesas = grDespesas.reduce((s, d) => s + d.valor, 0);
  const totalInvest = grInvest.reduce((s, i) => s + i.valor, 0);
  const resultado = totalReceitas - totalDespesas;

  function exportarCSV() {
    const linhas = [
      ["Tipo", "Conta", "Descricao", "Valor"],
      ...grReceitas.map(r => ["Receita", r.conta, r.desc, r.valor.toFixed(2)]),
      ...grDespesas.map(d => ["Despesa", d.conta, d.desc, d.valor.toFixed(2)]),
      ...grInvest.map(i => ["Investimento", i.conta, i.desc, i.valor.toFixed(2)]),
      ["", "", "Total Receitas", totalReceitas.toFixed(2)],
      ["", "", "Total Despesas", totalDespesas.toFixed(2)],
      ["", "", "Resultado", resultado.toFixed(2)],
    ];
    const csv = linhas.map(l => l.join(";")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `LCDPR_${produtor?.nome || "relatorio"}_${new Date().toISOString().slice(0,7)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportarPDF() {
    window.print();
  }

  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-gray-400">Carregando...</div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 max-w-md mx-auto pb-20">
      <div className="bg-green-800 text-white px-4 py-4">
        <a href="/contador" className="text-xs opacity-70">← Voltar</a>
        <a href="/" className="text-xs opacity-70">← Inicio</a>
        <div className="text-lg font-medium mt-1">LCDPR — {mes}</div>
        <div className="text-xs opacity-70">{produtor?.nome || "Produtor"}</div>
      </div>

      <div className="p-4 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: "Receitas", valor: totalReceitas, cor: "text-green-700", bg: "bg-green-50" },
            { label: "Despesas", valor: totalDespesas, cor: "text-red-600", bg: "bg-red-50" },
            { label: "Investimentos", valor: totalInvest, cor: "text-blue-700", bg: "bg-blue-50" },
            { label: "Resultado", valor: resultado, cor: resultado >= 0 ? "text-green-800" : "text-red-700", bg: "bg-green-100" },
          ].map(m => (
            <div key={m.label} className={`${m.bg} rounded-xl p-3`}>
              <div className="text-xs text-gray-500">{m.label}</div>
              <div className={`text-base font-semibold ${m.cor} mt-1`}>{fmt(m.valor)}</div>
            </div>
          ))}
        </div>

        {grReceitas.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            <div className="px-4 py-3 bg-green-50 border-b">
              <div className="text-sm font-medium text-green-800">Receitas da atividade rural</div>
            </div>
            {grReceitas.map(r => (
              <div key={r.conta} className="flex justify-between px-4 py-3 border-b last:border-0 text-sm">
                <div><span className="text-xs text-gray-400 mr-2">{r.conta}</span>{r.desc}</div>
                <div className="text-green-700 font-medium">{fmt(r.valor)}</div>
              </div>
            ))}
            <div className="flex justify-between px-4 py-3 bg-green-50 text-sm font-semibold">
              <div>Total receitas</div>
              <div className="text-green-700">{fmt(totalReceitas)}</div>
            </div>
          </div>
        )}

        {grDespesas.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            <div className="px-4 py-3 bg-red-50 border-b">
              <div className="text-sm font-medium text-red-800">Despesas da atividade rural</div>
            </div>
            {grDespesas.map(d => (
              <div key={d.conta} className="flex justify-between px-4 py-3 border-b last:border-0 text-sm">
                <div><span className="text-xs text-gray-400 mr-2">{d.conta}</span>{d.desc}</div>
                <div className="text-red-600 font-medium">{fmt(d.valor)}</div>
              </div>
            ))}
            <div className="flex justify-between px-4 py-3 bg-red-50 text-sm font-semibold">
              <div>Total despesas</div>
              <div className="text-red-600">{fmt(totalDespesas)}</div>
            </div>
          </div>
        )}

        {grInvest.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            <div className="px-4 py-3 bg-blue-50 border-b">
              <div className="text-sm font-medium text-blue-800">Investimentos</div>
            </div>
            {grInvest.map(i => (
              <div key={i.conta} className="flex justify-between px-4 py-3 border-b last:border-0 text-sm">
                <div><span className="text-xs text-gray-400 mr-2">{i.conta}</span>{i.desc}</div>
                <div className="text-blue-700 font-medium">{fmt(i.valor)}</div>
              </div>
            ))}
          </div>
        )}

        {lancamentos.length === 0 && (
          <div className="bg-white rounded-xl p-8 text-center text-gray-400 shadow-sm">
            <div className="text-4xl mb-2">📄</div>
            <div>Nenhum lançamento este mês</div>
          </div>
        )}

        <div className="bg-green-800 text-white rounded-xl p-4">
          <div className="flex justify-between items-center">
            <div>
              <div className="text-sm opacity-80">Resultado do periodo</div>
              <div className="text-xs opacity-60 mt-0.5">Receitas menos Despesas</div>
            </div>
            <div className="text-2xl font-semibold">{fmt(resultado)}</div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={exportarPDF}
            className="bg-white border border-gray-200 rounded-xl py-3 text-sm font-medium text-gray-700 flex items-center justify-center gap-2 hover:bg-gray-50"
          >
            📄 Exportar PDF
          </button>
          <button
            onClick={exportarCSV}
            className="bg-white border border-gray-200 rounded-xl py-3 text-sm font-medium text-gray-700 flex items-center justify-center gap-2 hover:bg-gray-50"
          >
            📊 Exportar CSV
          </button>
        </div>

          <a href="/contador" className="block w-full py-3 rounded-xl text-sm font-medium text-white bg-green-800 text-center">
            ← Voltar ao painel
          </a>
      </div>
    </div>
  );
}

export default function Relatorio() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-50 flex items-center justify-center"><div className="text-gray-400">Carregando...</div></div>}>
      <RelatorioContent />
    </Suspense>
  );
}
