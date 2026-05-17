"use client";
import { useState } from "react";

const lancamentos = [
  { id: 1, desc: "Venda de gado", tipo: "receita", valor: 28500, data: "02/05", status: "confirmado", conta: "1.1.2" },
  { id: 2, desc: "Combustivel Posto Agro", tipo: "despesa", valor: 1240, data: "28/04", status: "confirmado", conta: "3.1.2" },
  { id: 3, desc: "Adubo NPK", tipo: "despesa", valor: 3800, data: "25/04", status: "pendente", conta: "3.1.1" },
  { id: 4, desc: "Trator leasing", tipo: "investimento", valor: 45000, data: "20/04", status: "confirmado", conta: "5.1" },
];

export default function Home() {
  const [aba, setAba] = useState("dashboard");

  const receitas = lancamentos.filter(l => l.tipo === "receita").reduce((s, l) => s + l.valor, 0);
  const despesas = lancamentos.filter(l => l.tipo === "despesa").reduce((s, l) => s + l.valor, 0);
  const saldo = receitas - despesas;

  return (
    <div className="min-h-screen bg-gray-50 max-w-md mx-auto">
      <div className="bg-green-800 text-white px-4 py-4">
        <div className="text-xs opacity-70">Rural Caixa PF</div>
        <div className="text-lg font-medium">Joao Batista Neves</div>
        <div className="text-xs opacity-70 mt-1">Maio 2025</div>
      </div>

      {aba === "dashboard" && (
        <div className="p-4 space-y-4 pb-24">
          <div className="bg-white rounded-xl p-4 shadow-sm">
            <div className="text-xs text-gray-500 uppercase tracking-wide">Saldo do periodo</div>
            <div className="text-3xl font-semibold text-green-700 mt-1">
              R$ {saldo.toLocaleString("pt-BR")}
            </div>
            <div className="flex gap-3 mt-3">
              <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">
                + R$ {receitas.toLocaleString("pt-BR")}
              </span>
              <span className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded-full">
                - R$ {despesas.toLocaleString("pt-BR")}
              </span>
            </div>
          </div>

          <button
            onClick={() => setAba("novo")}
            className="w-full bg-green-800 text-white py-4 rounded-xl text-lg font-medium flex items-center justify-center gap-2"
          >
            <span className="text-2xl">+</span> Novo lancamento
          </button>

          <div className="grid grid-cols-3 gap-3">
            <button onClick={() => setAba("novo")} className="bg-white rounded-xl py-4 flex flex-col items-center gap-1 shadow-sm">
              <span className="text-2xl">🎤</span>
              <span className="text-xs text-gray-600">Audio</span>
            </button>
            <button onClick={() => setAba("novo")} className="bg-white rounded-xl py-4 flex flex-col items-center gap-1 shadow-sm">
              <span className="text-2xl">📷</span>
              <span className="text-xs text-gray-600">Foto NF</span>
            </button>
            <a href="/relatorio" className="bg-white rounded-xl py-4 flex flex-col items-center gap-1 shadow-sm">
              <span className="text-2xl">📄</span>
              <span className="text-xs text-gray-600">Relatorio</span>
            </a>
          </div>

          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b text-xs font-medium text-gray-500 uppercase tracking-wide">
              Ultimos lancamentos
            </div>
            {lancamentos.map(l => (
              <div key={l.id} className="flex items-center gap-3 px-4 py-3 border-b last:border-0">
                <div className={`w-9 h-9 rounded-full flex items-center justify-center text-lg ${
                  l.tipo === "receita" ? "bg-green-100" :
                  l.tipo === "despesa" ? "bg-red-100" : "bg-blue-100"
                }`}>
                  {l.tipo === "receita" ? "🐄" : l.tipo === "despesa" ? "⛽" : "🚜"}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{l.desc}</div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    {l.data} · {l.conta} ·{" "}
                    <span className={l.status === "pendente" ? "text-orange-500" : "text-green-600"}>
                      {l.status}
                    </span>
                  </div>
                </div>
                <div className={`text-sm font-medium ${
                  l.tipo === "receita" ? "text-green-700" :
                  l.tipo === "despesa" ? "text-red-600" : "text-blue-700"
                }`}>
                  {l.tipo === "receita" ? "+" : l.tipo === "despesa" ? "-" : ""}
                  R$ {l.valor.toLocaleString("pt-BR")}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {aba === "novo" && (
        <div className="p-4 space-y-4 pb-24">
          <div className="flex items-center gap-3">
            <button onClick={() => setAba("dashboard")} className="text-green-800 font-medium">← Voltar</button>
            <div className="text-lg font-medium">Novo lancamento</div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {[
              { icon: "🎤", label: "Gravar audio", sub: "Fale o que aconteceu" },
              { icon: "📷", label: "Foto da nota", sub: "Tire foto da NF" },
              { icon: "⌨️", label: "Digitar", sub: "Lancamento manual" },
              { icon: "📄", label: "Upload arquivo", sub: "PDF ou imagem" },
            ].map(m => (
              <button key={m.label} className="bg-white border border-gray-200 rounded-xl p-5 flex flex-col items-center gap-2 shadow-sm opacity-60">
                <span className="text-3xl">{m.icon}</span>
                <span className="text-sm font-medium text-center">{m.label}</span>
                <span className="text-xs text-gray-400 text-center">{m.sub}</span>
                <span className="text-xs text-orange-400">Via WhatsApp</span>
              </button>
            ))}
          </div>

          <div className="bg-white rounded-xl p-4 shadow-sm space-y-3">
            <div className="text-sm font-medium text-gray-600">Lancamento manual</div>
            <div>
              <label className="text-xs text-gray-500">Descricao</label>
              <input className="w-full border border-gray-200 rounded-lg px-3 py-2 mt-1 text-sm" placeholder="Ex: vendi 5 bois por 10000 reais" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500">Valor</label>
                <input className="w-full border border-gray-200 rounded-lg px-3 py-2 mt-1 text-sm" placeholder="R$ 0,00" />
              </div>
              <div>
                <label className="text-xs text-gray-500">Data</label>
                <input type="date" className="w-full border border-gray-200 rounded-lg px-3 py-2 mt-1 text-sm" />
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-500">Imovel</label>
              <select className="w-full border border-gray-200 rounded-lg px-3 py-2 mt-1 text-sm">
                <option>Fazenda Boa Esperanca</option>
                <option>Sitio Santa Luzia</option>
              </select>
            </div>
            <button className="w-full bg-green-800 text-white py-3 rounded-lg text-sm font-medium">
              Classificar e confirmar
            </button>
          </div>
        </div>
      )}

      {aba === "perfil" && (
        <div className="p-4 space-y-4 pb-24">
          <div className="text-lg font-medium text-gray-700 px-1">Perfil</div>

          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            <div className="px-4 py-4 border-b flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center text-2xl">👤</div>
              <div>
                <div className="font-medium text-gray-800">Joao Batista Neves</div>
                <div className="text-xs text-gray-400">Produtor rural</div>
              </div>
            </div>

            <a href="/cadastro" className="flex items-center justify-between px-4 py-3 border-b hover:bg-gray-50">
              <div className="flex items-center gap-3">
                <span className="text-xl">➕</span>
                <span className="text-sm text-gray-700">Cadastrar novo produtor</span>
              </div>
              <span className="text-gray-400">→</span>
            </a>

            <a href="/cadastro" className="flex items-center justify-between px-4 py-3 border-b hover:bg-gray-50">
              <div className="flex items-center gap-3">
                <span className="text-xl">🌾</span>
                <span className="text-sm text-gray-700">Cadastrar imovel rural</span>
              </div>
              <span className="text-gray-400">→</span>
            </a>

            <a href="/contador" className="flex items-center justify-between px-4 py-3 border-b hover:bg-gray-50">
              <div className="flex items-center gap-3">
                <span className="text-xl">🧮</span>
                <span className="text-sm text-gray-700">Cadastrar contador</span>
              </div>
              <span className="text-gray-400">→</span>
            </a>

            <a href="/contador" className="flex items-center justify-between px-4 py-3 border-b hover:bg-gray-50">
              <div className="flex items-center gap-3">
                <span className="text-xl">📊</span>
                <span className="text-sm text-gray-700">Painel do contador</span>
              </div>
              <span className="text-gray-400">→</span>
            </a>

            <a href="/relatorio" className="flex items-center justify-between px-4 py-3 hover:bg-gray-50">
              <div className="flex items-center gap-3">
                <span className="text-xl">📄</span>
                <span className="text-sm text-gray-700">Relatorio LCDPR</span>
              </div>
              <span className="text-gray-400">→</span>
            </a>
          </div>

          <a
            href="/cadastro"
            className="w-full bg-green-800 text-white py-4 rounded-xl text-sm font-medium flex items-center justify-center gap-2 block text-center"
          >
            ➕ Cadastrar novo produtor
          </a>
        </div>
      )}

      {/* Bottom nav */}
      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-white border-t flex">
        {[
          { id: "dashboard", icon: "🏠", label: "Inicio" },
          { id: "novo", icon: "➕", label: "Lancar" },
          { id: "relatorio", icon: "📊", label: "Relatorio" },
          { id: "perfil", icon: "👤", label: "Perfil" },
        ].map(n => (
          <button
            key={n.id}
            onClick={() => setAba(n.id)}
            className={`flex-1 py-3 flex flex-col items-center gap-1 ${aba === n.id ? "text-green-800" : "text-gray-400"}`}
          >
            <span className="text-xl">{n.icon}</span>
            <span className="text-xs">{n.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
