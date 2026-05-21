"use client";
import { useState, useEffect } from "react";

const API = "https://ruralcaixa-mvp-production.up.railway.app";
const PRODUTOR_ID = 1; // TODO: pegar do contexto/auth

type Lancamento = {
  id: number;
  descricao: string;
  tipo: string;
  valor: number;
  data_lancamento: string;
  confirmado: boolean;
  conta_codigo: string;
  produto: string | null;
  atividade: string | null;
};

export default function Home() {
  const [aba, setAba] = useState("dashboard");
  const [descricao, setDescricao] = useState("");
  const [valor, setValor] = useState("");
  const [data, setData] = useState(new Date().toISOString().slice(0, 10));
  const [classificando, setClassificando] = useState(false);
  const [resultado, setResultado] = useState<any>(null);
  const [salvando, setSalvando] = useState(false);
  const [atividade, setAtividade] = useState("rural");
  const [participacao, setParticipacao] = useState("100");
  const [salvo, setSalvo] = useState(false);
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([]);
  const [loadingLanc, setLoadingLanc] = useState(true);
  const [resumo, setResumo] = useState({ receita: 0, despesa: 0 });

  useEffect(() => {
    fetch(`${API}/produtores/${PRODUTOR_ID}/lancamentos`)
      .then(r => r.json())
      .then(data => { setLancamentos(data); setLoadingLanc(false); })
      .catch(() => setLoadingLanc(false));

    fetch(`${API}/produtores`)
      .then(r => r.json())
      .then(prods => {
        const p = prods.find((x: any) => x.id === PRODUTOR_ID);
        if (p) setResumo({ receita: p.receita, despesa: p.despesa });
      })
      .catch(() => {});
  }, [salvo]);

  const saldo = resumo.receita - resumo.despesa;

  async function classificar() {
    if (!descricao) return alert("Digite uma descricao");
    setClassificando(true);
    setResultado(null);
    try {
      const res = await fetch(`${API}/classificar-texto`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texto: descricao }),
      });
      const data = await res.json();
      setResultado(data);
      if (data.atividade) setAtividade(data.atividade);
    } catch {
      alert("Erro ao classificar. Tente novamente.");
    } finally {
      setClassificando(false);
    }
  }

  async function salvarLancamento() {
    if (!resultado) return;
    setSalvando(true);
    try {
      const res = await fetch(`${API}/lancamentos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          produtor_id: PRODUTOR_ID,
          conta_codigo: resultado.conta,
          tipo: resultado.tipo,
          descricao: descricao,
          valor: parseFloat(valor) || resultado.valor,
          data_lancamento: data,
          origem: "manual",
          confirmado: true,
          atividade: atividade,
          "perc_participacao": parseFloat(participacao),
        }),
      });
      if (res.ok) {
        setSalvo(true);
        setDescricao("");
        setValor("");
        setResultado(null);
        setAtividade("rural");
        setTimeout(() => { setSalvo(false); setAba("dashboard"); }, 2000);
      } else {
        alert("Erro ao salvar");
      }
    } catch {
      alert("Erro de conexao");
    } finally {
      setSalvando(false);
    }
  }

  const fmt = (v: number) => `R$ ${v.toLocaleString("pt-BR")}`;

  return (
    <div className="min-h-screen bg-gray-50 max-w-md mx-auto">
      <div className="bg-green-800 text-white px-4 py-4">
        <div className="text-xs opacity-70">Rural Caixa PF</div>
        <div className="text-lg font-medium">Joao Batista Neves</div>
        <div className="text-xs opacity-70 mt-1">{new Date().toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}</div>
      </div>

      {aba === "dashboard" && (
        <div className="p-4 space-y-4 pb-24">
          <div className="bg-white rounded-xl p-4 shadow-sm">
            <div className="text-xs text-gray-500 uppercase tracking-wide">Saldo do periodo</div>
            <div className={`text-3xl font-semibold mt-1 ${saldo >= 0 ? "text-green-700" : "text-red-600"}`}>
              {fmt(saldo)}
            </div>
            <div className="flex gap-3 mt-3">
              <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">+ {fmt(resumo.receita)}</span>
              <span className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded-full">- {fmt(resumo.despesa)}</span>
            </div>
          </div>

          <button onClick={() => setAba("novo")} className="w-full bg-green-800 text-white py-4 rounded-xl text-lg font-medium flex items-center justify-center gap-2">
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
            <a href="/relatorio" className="bg-white rounded-xl py-4 flex flex-col items-center gap-1 shadow-sm text-center">
              <span className="text-2xl">📄</span>
              <span className="text-xs text-gray-600">Relatorio</span>
            </a>
          </div>

          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b text-xs font-medium text-gray-500 uppercase tracking-wide">
              Ultimos lancamentos
            </div>
            {loadingLanc ? (
              <div className="text-center text-gray-400 py-6 text-sm">Carregando...</div>
            ) : lancamentos.length === 0 ? (
              <div className="text-center text-gray-400 py-6 text-sm">Nenhum lançamento este mês</div>
            ) : (
              lancamentos.slice(0, 5).map(l => (
                <div key={l.id} className="flex items-center gap-3 px-4 py-3 border-b last:border-0">
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center text-lg ${
                    l.tipo === "receita" ? "bg-green-100" :
                    l.tipo === "despesa" ? "bg-red-100" : "bg-blue-100"
                  }`}>
                    {l.tipo === "receita" ? "🐄" : l.tipo === "despesa" ? "⛽" : "🚜"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{l.descricao || l.produto || l.conta_codigo}</div>
                    <div className="text-xs text-gray-400 mt-0.5">
                      {l.data_lancamento ? l.data_lancamento.slice(0,10).split("-").reverse().join("/") : ""} ·{" "}
                      <span className="text-green-600">
                        {"RURAL" === l.atividade ? "rural" : l.atividade || ""}
                      </span>
                      {l.atividade && l.atividade !== "rural" && (
                        <span className="ml-1 text-purple-500">· {l.atividade}</span>
                      )}
                    </div>
                  </div>
                  <div className={`text-sm font-medium ${
                    l.tipo === "receita" ? "text-green-700" :
                    l.tipo === "despesa" ? "text-red-600" : "text-blue-700"
                  }`}>
                    {l.tipo === "receita" ? "+" : l.tipo === "despesa" ? "-" : ""}
                    {fmt(l.valor)}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {aba === "novo" && (
        <div className="p-4 space-y-4 pb-24">
          <div className="flex items-center gap-3">
            <button onClick={() => { setAba("dashboard"); setResultado(null); }} className="text-green-800 font-medium">← Voltar</button>
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

          {salvo && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center text-green-700 text-sm font-medium">
              ✅ Lancamento salvo com sucesso!
            </div>
          )}

          <div className="bg-white rounded-xl p-4 shadow-sm space-y-3">
            <div className="text-sm font-medium text-gray-600">Lancamento manual</div>
            <div>
              <label className="text-xs text-gray-500">Descricao *</label>
              <input
                className="w-full border border-gray-200 rounded-lg px-3 py-2 mt-1 text-sm"
                placeholder="Ex: vendi 5 bois por 10000 reais"
                value={descricao}
                onChange={e => { setDescricao(e.target.value); setResultado(null); }}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500">Valor</label>
                <input
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 mt-1 text-sm"
                  placeholder="R$ 0,00"
                  value={valor}
                  onChange={e => setValor(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs text-gray-500">Data</label>
                <input
                  type="date"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 mt-1 text-sm"
                  value={data}
                  onChange={e => setData(e.target.value)}
                />
              </div>
            </div>

            <div>
              <label className="text-xs text-gray-500">Tipo de atividade</label>
              <select
                className="w-full border border-gray-200 rounded-lg px-3 py-2 mt-1 text-sm"
                value={atividade}
                onChange={e => setAtividade(e.target.value)}
              >
                <option value="rural">Atividade Rural (LCDPR)</option>
                <option value="intermediacao">Intermediação / Corretagem</option>
                <option value="servico">Prestação de Serviços</option>
              </select>
            </div>

            <div>
              <label className="text-xs text-gray-500">Sua participação (%)</label>
              <input
                type="number"
                min="1"
                max="100"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 mt-1 text-sm"
                value={participacao}
                onChange={e => setParticipacao(e.target.value)}
              />
              {parseFloat(participacao) < 100 && valor && (
                <div className="text-xs text-green-700 mt-1">
                  Valor proporcional: R$ {(parseFloat(valor) * parseFloat(participacao) / 100).toLocaleString("pt-BR")}
                </div>
              )}
            </div>

            {resultado && (
              <div className="bg-gray-50 rounded-lg p-3 space-y-1 text-sm border border-gray-200">
                <div className="font-medium text-gray-700">Classificacao sugerida:</div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Tipo</span>
                  <span className={resultado.tipo === "receita" ? "text-green-700 font-medium" : resultado.tipo === "despesa" ? "text-red-600 font-medium" : "text-blue-700 font-medium"}>
                    {resultado.tipo?.toUpperCase()}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Conta</span>
                  <span className="font-medium">{resultado.conta}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Valor</span>
                  <span className="font-medium">R$ {resultado.valor?.toLocaleString("pt-BR")}</span>
                </div>
                {resultado.produto && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Produto</span>
                    <span className="font-medium">{resultado.produto}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-gray-500">Atividade</span>
                  <span className={`font-medium ${atividade === "rural" ? "text-green-700" : "text-purple-600"}`}>
                    {atividade === "rural" ? "Rural (LCDPR)" : atividade === "intermediacao" ? "Intermediação" : "Serviço"}
                  </span>
                </div>
              </div>
            )}

            {!resultado ? (
              <button
                onClick={classificar}
                disabled={classificando || !descricao}
                className="w-full bg-green-800 text-white py-3 rounded-lg text-sm font-medium disabled:bg-gray-300"
              >
                {classificando ? "Classificando..." : "Classificar"}
              </button>
            ) : (
              <div className="flex gap-3">
                <button onClick={() => setResultado(null)} className="flex-1 py-3 rounded-lg text-sm border border-gray-200">Corrigir</button>
                <button onClick={salvarLancamento} disabled={salvando} className="flex-1 py-3 rounded-lg text-sm font-medium text-white bg-green-800 disabled:bg-gray-400">
                  {salvando ? "Salvando..." : "Confirmar"}
                </button>
              </div>
            )}
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
              <div className="flex items-center gap-3"><span className="text-xl">➕</span><span className="text-sm text-gray-700">Cadastrar novo produtor</span></div>
              <span className="text-gray-400">→</span>
            </a>
            <a href="/cadastro" className="flex items-center justify-between px-4 py-3 border-b hover:bg-gray-50">
              <div className="flex items-center gap-3"><span className="text-xl">🌾</span><span className="text-sm text-gray-700">Cadastrar imovel rural</span></div>
              <span className="text-gray-400">→</span>
            </a>
            <a href="/contador" className="flex items-center justify-between px-4 py-3 border-b hover:bg-gray-50">
              <div className="flex items-center gap-3"><span className="text-xl">🧮</span><span className="text-sm text-gray-700">Cadastrar contador</span></div>
              <span className="text-gray-400">→</span>
            </a>
            <a href="/contador" className="flex items-center justify-between px-4 py-3 border-b hover:bg-gray-50">
              <div className="flex items-center gap-3"><span className="text-xl">📊</span><span className="text-sm text-gray-700">Painel do contador</span></div>
              <span className="text-gray-400">→</span>
            </a>
            <a href="/relatorio" className="flex items-center justify-between px-4 py-3 hover:bg-gray-50">
              <div className="flex items-center gap-3"><span className="text-xl">📄</span><span className="text-sm text-gray-700">Relatorio LCDPR</span></div>
              <span className="text-gray-400">→</span>
            </a>
          </div>
          <a href="/cadastro" className="w-full bg-green-800 text-white py-4 rounded-xl text-sm font-medium flex items-center justify-center gap-2 block text-center">
            ➕ Cadastrar novo produtor
          </a>
        </div>
      )}

      {/* Bottom nav */}
      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-white border-t flex">
        {[
          { id: "dashboard", icon: "🏠", label: "Inicio" },
          { id: "novo", icon: "➕", label: "Lancar" },
          { id: "relatorio", icon: "📊", label: "Relatorio", href: "/relatorio" },
          { id: "perfil", icon: "👤", label: "Perfil" },
        ].map(n => (
          (n as any).href ? (
            <a key={n.id} href={(n as any).href} className="flex-1 py-3 flex flex-col items-center gap-1 text-gray-400">
              <span className="text-xl">{n.icon}</span>
              <span className="text-xs">{n.label}</span>
            </a>
          ) : (
            <button key={n.id} onClick={() => setAba(n.id)} className={`flex-1 py-3 flex flex-col items-center gap-1 ${aba === n.id ? "text-green-800" : "text-gray-400"}`}>
              <span className="text-xl">{n.icon}</span>
              <span className="text-xs">{n.label}</span>
            </button>
          )
        ))}
      </div>
    </div>
  );
}
// rebuild
