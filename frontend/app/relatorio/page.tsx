"use client";

const dados = {
  mes: "Maio 2025",
  produtor: "Joao Batista Neves",
  receitas: [
    { conta: "1.1.1", desc: "Venda de produtos agricolas", valor: 8200 },
    { conta: "1.1.2", desc: "Venda de produtos pecuarios", valor: 34100 },
  ],
  despesas: [
    { conta: "3.1.1", desc: "Custeio agricola", valor: 4800 },
    { conta: "3.1.2", desc: "Combustiveis", valor: 3240 },
    { conta: "3.1.3", desc: "Pecuaria", valor: 6910 },
    { conta: "3.1.4", desc: "Mao de obra", valor: 5200 },
    { conta: "3.1.5", desc: "Manutencao", valor: 3700 },
  ],
  investimentos: [
    { conta: "5.1", desc: "Maquinas e equipamentos", valor: 45000 },
  ],
};

export default function Relatorio() {
  const totalReceitas = dados.receitas.reduce((s, r) => s + r.valor, 0);
  const totalDespesas = dados.despesas.reduce((s, d) => s + d.valor, 0);
  const totalInvest = dados.investimentos.reduce((s, i) => s + i.valor, 0);
  const resultado = totalReceitas - totalDespesas;

  const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  return (
    <div className="min-h-screen bg-gray-50 max-w-md mx-auto pb-20">
      {/* Header */}
      <div className="bg-green-800 text-white px-4 py-4">
        <a href="/" className="text-xs opacity-70">← Voltar</a>
        <div className="text-lg font-medium mt-1">LCDPR — {dados.mes}</div>
        <div className="text-xs opacity-70">{dados.produtor}</div>
      </div>

      <div className="p-4 space-y-4">
        {/* Resumo */}
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: "Receitas", valor: totalReceitas, cor: "text-green-700", bg: "bg-green-50" },
            { label: "Despesas", valor: totalDespesas, cor: "text-red-600", bg: "bg-red-50" },
            { label: "Investimentos", valor: totalInvest, cor: "text-blue-700", bg: "bg-blue-50" },
            { label: "Resultado", valor: resultado, cor: "text-green-800", bg: "bg-green-100" },
          ].map(m => (
            <div key={m.label} className={`${m.bg} rounded-xl p-3`}>
              <div className="text-xs text-gray-500">{m.label}</div>
              <div className={`text-base font-semibold ${m.cor} mt-1`}>{fmt(m.valor)}</div>
            </div>
          ))}
        </div>

        {/* Receitas */}
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="px-4 py-3 bg-green-50 border-b">
            <div className="text-sm font-medium text-green-800">Receitas da atividade rural</div>
          </div>
          {dados.receitas.map(r => (
            <div key={r.conta} className="flex justify-between px-4 py-3 border-b last:border-0 text-sm">
              <div>
                <span className="text-xs text-gray-400 mr-2">{r.conta}</span>
                {r.desc}
              </div>
              <div className="text-green-700 font-medium">{fmt(r.valor)}</div>
            </div>
          ))}
          <div className="flex justify-between px-4 py-3 bg-green-50 text-sm font-semibold">
            <div>Total receitas</div>
            <div className="text-green-700">{fmt(totalReceitas)}</div>
          </div>
        </div>

        {/* Despesas */}
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="px-4 py-3 bg-red-50 border-b">
            <div className="text-sm font-medium text-red-800">Despesas da atividade rural</div>
          </div>
          {dados.despesas.map(d => (
            <div key={d.conta} className="flex justify-between px-4 py-3 border-b last:border-0 text-sm">
              <div>
                <span className="text-xs text-gray-400 mr-2">{d.conta}</span>
                {d.desc}
              </div>
              <div className="text-red-600 font-medium">{fmt(d.valor)}</div>
            </div>
          ))}
          <div className="flex justify-between px-4 py-3 bg-red-50 text-sm font-semibold">
            <div>Total despesas</div>
            <div className="text-red-600">{fmt(totalDespesas)}</div>
          </div>
        </div>

        {/* Investimentos */}
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="px-4 py-3 bg-blue-50 border-b">
            <div className="text-sm font-medium text-blue-800">Investimentos</div>
          </div>
          {dados.investimentos.map(i => (
            <div key={i.conta} className="flex justify-between px-4 py-3 border-b last:border-0 text-sm">
              <div>
                <span className="text-xs text-gray-400 mr-2">{i.conta}</span>
                {i.desc}
              </div>
              <div className="text-blue-700 font-medium">{fmt(i.valor)}</div>
            </div>
          ))}
        </div>

        {/* Resultado */}
        <div className="bg-green-800 text-white rounded-xl p-4">
          <div className="flex justify-between items-center">
            <div>
              <div className="text-sm opacity-80">Resultado do periodo</div>
              <div className="text-xs opacity-60 mt-0.5">Receitas menos Despesas</div>
            </div>
            <div className="text-2xl font-semibold">{fmt(resultado)}</div>
          </div>
        </div>

        {/* Botoes */}
        <div className="grid grid-cols-2 gap-3">
          <button className="bg-white border border-gray-200 rounded-xl py-3 text-sm font-medium text-gray-700 flex items-center justify-center gap-2">
            📄 Exportar PDF
          </button>
          <button className="bg-white border border-gray-200 rounded-xl py-3 text-sm font-medium text-gray-700 flex items-center justify-center gap-2">
            📊 Exportar CSV
          </button>
        </div>

        {/* Status fechamento */}
        <div className="bg-white rounded-xl p-4 shadow-sm space-y-2">
          <div className="text-sm font-medium text-gray-600">Status do fechamento</div>
          {[
            { label: "Lancamentos capturados", ok: true },
            { label: "Classificacao aplicada", ok: true },
            { label: "Confirmacao do produtor", ok: false },
            { label: "Revisao do contador", ok: false },
            { label: "Fechamento LCDPR", ok: false },
          ].map(s => (
            <div key={s.label} className="flex items-center gap-2 text-sm">
              <span>{s.ok ? "✅" : "⏳"}</span>
              <span className={s.ok ? "text-gray-700" : "text-gray-400"}>{s.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
