"use client";
import { useState, useEffect } from "react";

const API = "https://ruralcaixa-mvp-production.up.railway.app";

type Produtor = {
  id: number;
  nome: string;
  cpf: string;
  telefone: string;
  municipio: string;
  uf: string;
  receita: number;
  despesa: number;
  pendentes: number;
};

type Lancamento = {
  id: number;
  tipo: string;
  conta_codigo: string;
  descricao: string;
  valor: number;
  data_lancamento: string;
  produto: string | null;
  documento_url: string | null;
  confirmado: boolean;
};

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function Contador() {
  const [produtores, setProdutores] = useState<Produtor[]>([]);
  const [selecionado, setSelecionado] = useState<number | null>(null);
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingLanc, setLoadingLanc] = useState(false);
  const [fechando, setFechando] = useState(false);
  const [abaDetalhe, setAbaDetalhe] = useState<"lancamentos" | "acoes">("lancamentos");

  const produtor = produtores.find(p => p.id === selecionado);

  useEffect(() => {
    fetch(`${API}/produtores`)
      .then(r => r.json())
      .then(data => { setProdutores(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selecionado) return;
    setLoadingLanc(true);
    fetch(`${API}/produtores/${selecionado}/lancamentos`)
      .then(r => r.json())
      .then(data => { setLancamentos(data); setLoadingLanc(false); })
      .catch(() => setLoadingLanc(false));
  }, [selecionado]);

  async function fecharMes() {
    if (!selecionado) return;
    if (!confirm("Confirma o fechamento do mês?")) return;
    setFechando(true);
    await fetch(`${API}/produtores/${selecionado}/fechar-mes`, { method: "POST" });
    const updated = await fetch(`${API}/produtores`).then(r => r.json());
    setProdutores(updated);
    setFechando(false);
    alert("Mês fechado com sucesso!");
  }

  const totalReceita = produtores.reduce((s, p) => s + p.receita, 0);
  const totalDespesa = produtores.reduce((s, p) => s + p.despesa, 0);
  const totalPendentes = produtores.reduce((s, p) => s + p.pendentes, 0);

  return (
    <div className="min-h-screen bg-gray-50 max-w-md mx-auto pb-6">
      <div className="bg-green-800 text-white px-4 py-4">
        <a href="/" className="text-xs opacity-70">← Voltar</a>
        <div className="text-lg font-medium mt-1">Painel do Contador</div>
        <div className="text-xs opacity-70">RuralCaixa</div>
      </div>

      {!selecionado ? (
        <div className="p-4 space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white rounded-xl p-3 text-center shadow-sm">
              <div className="text-xs text-gray-500">Produtores</div>
              <div className="text-2xl font-semibold mt-1 text-gray-800">{produtores.length}</div>
            </div>
            <div className="bg-white rounded-xl p-3 text-center shadow-sm">
              <div className="text-xs text-gray-500">Pendentes</div>
              <div className="text-2xl font-semibold mt-1 text-orange-500">{totalPendentes}</div>
            </div>
            <div className="bg-white rounded-xl p-3 text-center shadow-sm">
              <div className="text-xs text-gray-500">Saldo</div>
              <div className={`text-sm font-semibold mt-1 ${totalReceita - totalDespesa >= 0 ? "text-green-700" : "text-red-600"}`}>
                {fmt(totalReceita - totalDespesa)}
              </div>
            </div>
          </div>

          <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            Clientes — {new Date().toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}
          </div>

          {loading ? (
            <div className="text-center text-gray-400 py-8">Carregando...</div>
          ) : produtores.length === 0 ? (
            <div className="text-center text-gray-400 py-8">
              <div className="text-4xl mb-2">👨‍🌾</div>
              <div>Nenhum produtor cadastrado</div>
              <a href="/cadastro" className="text-green-700 text-sm mt-2 block">+ Cadastrar produtor</a>
            </div>
          ) : (
            produtores.map(p => (
              <button
                key={p.id}
                onClick={() => { setSelecionado(p.id); setAbaDetalhe("lancamentos"); }}
                className="w-full bg-white rounded-xl p-4 shadow-sm text-left flex items-center justify-between"
              >
                <div>
                  <div className="text-sm font-medium">{p.nome}</div>
                  <div className="text-xs text-gray-400 mt-0.5">{p.cpf} · {p.municipio}-{p.uf}</div>
                  <div className="flex gap-3 mt-1">
                    <span className="text-xs text-green-700">↑ {fmt(p.receita)}</span>
                    <span className="text-xs text-red-500">↓ {fmt(p.despesa)}</span>
                  </div>
                </div>
                <div className="text-right">
                  {p.pendentes > 0 ? (
                    <span className="text-xs px-2 py-1 rounded-full bg-orange-100 text-orange-700">
                      {p.pendentes} pend.
                    </span>
                  ) : (
                    <span className="text-xs px-2 py-1 rounded-full bg-green-100 text-green-700">Ok</span>
                  )}
                  <div className="text-gray-400 mt-1">›</div>
                </div>
              </button>
            ))
          )}

          <a href="/cadastro" className="block w-full py-3 rounded-xl text-sm font-medium text-white bg-green-800 text-center">
            + Cadastrar novo produtor
          </a>
        </div>
      ) : (
        <div className="p-4 space-y-4">
          <button onClick={() => setSelecionado(null)} className="text-green-800 text-sm font-medium">
            ← Todos os produtores
          </button>

          {produtor && (
            <>
              <div className="bg-white rounded-xl p-4 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center text-xl">👨‍🌾</div>
                  <div>
                    <div className="font-medium">{produtor.nome}</div>
                    <div className="text-xs text-gray-400">{produtor.cpf}</div>
                    <div className="text-xs text-gray-400">{produtor.municipio}-{produtor.uf}</div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 mt-4">
                  <div className="bg-green-50 rounded-lg p-3">
                    <div className="text-xs text-gray-500">Receitas</div>
                    <div className="text-sm font-semibold text-green-700 mt-1">{fmt(produtor.receita)}</div>
                  </div>
                  <div className="bg-red-50 rounded-lg p-3">
                    <div className="text-xs text-gray-500">Despesas</div>
                    <div className="text-sm font-semibold text-red-600 mt-1">{fmt(produtor.despesa)}</div>
                  </div>
                </div>
              </div>

              {/* Abas */}
              <div className="flex gap-2">
                <button
                  onClick={() => setAbaDetalhe("lancamentos")}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium ${abaDetalhe === "lancamentos" ? "bg-green-800 text-white" : "bg-white text-gray-600 border"}`}
                >
                  Lançamentos
                </button>
                <button
                  onClick={() => setAbaDetalhe("acoes")}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium ${abaDetalhe === "acoes" ? "bg-green-800 text-white" : "bg-white text-gray-600 border"}`}
                >
                  Ações
                </button>
              </div>

              {abaDetalhe === "lancamentos" && (
                <div className="bg-white rounded-xl p-4 shadow-sm space-y-2">
                  <div className="text-sm font-medium text-gray-600 mb-3">Lançamentos do mês</div>
                  {loadingLanc ? (
                    <div className="text-gray-400 text-sm text-center py-4">Carregando...</div>
                  ) : lancamentos.length === 0 ? (
                    <div className="text-gray-400 text-sm text-center py-4">Nenhum lançamento este mês</div>
                  ) : (
                    lancamentos.map(l => (
                      <div key={l.id} className="flex items-center justify-between py-2 border-b last:border-0">
                        <div>
                          <div className="text-xs font-medium">{l.descricao || l.produto || l.conta_codigo}</div>
                          <div className="text-xs text-gray-400">{new Date(l.data_lancamento).toLocaleDateString("pt-BR")} · {l.conta_codigo}</div>
                          {l.documento_url && (
                            <a href={l.documento_url} target="_blank" className="text-xs text-blue-500">📎 Ver doc</a>
                          )}
                        </div>
                        <div className={`text-sm font-medium ${l.tipo === "receita" ? "text-green-700" : "text-red-500"}`}>
                          {l.tipo === "receita" ? "+" : "-"}{fmt(l.valor)}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {abaDetalhe === "acoes" && (
                <div className="bg-white rounded-xl p-4 shadow-sm space-y-1">
                  <div className="text-sm font-medium text-gray-600 mb-3">Ações do contador</div>

                  <a href={`/analytics?produtor_id=${produtor.id}`}
                  
                    className="w-full flex items-center gap-3 py-3 border-b text-sm hover:bg-gray-50"
                  >
                    <span className="text-lg">📈</span>
                    <span>Relatórios analíticos</span>
                    <span className="ml-auto text-gray-400">›</span>
                  </a>
                  <a
                    href={`/relatorio?produtor_id=${produtor.id}`}
                    className="w-full flex items-center gap-3 py-3 border-b text-sm hover:bg-gray-50"
                  >
                    
                    <span className="text-lg">📄</span>
                    <span>Gerar LCDPR PDF</span>
                    <span className="ml-auto text-gray-400">›</span>
                  </a>

                  <a
                    href={`/cadastro`}
                    className="w-full flex items-center gap-3 py-3 border-b text-sm hover:bg-gray-50"
                  >
                    <span className="text-lg">✏️</span>
                    <span>Editar cadastro</span>
                    <span className="ml-auto text-gray-400">›</span>
                  </a>

                  <button
                    onClick={fecharMes}
                    disabled={fechando}
                    className="w-full flex items-center gap-3 py-3 text-sm hover:bg-gray-50"
                  >
                    <span className="text-lg">✅</span>
                    <span>{fechando ? "Fechando..." : "Fechar mês"}</span>
                    <span className="ml-auto text-gray-400">›</span>
                  </button>

                  <button
                    onClick={fecharMes}
                    disabled={fechando}
                    className="w-full flex items-center gap-3 py-3 border-b text-sm hover:bg-gray-50"
                  >
                    <span className="text-lg">✅</span>
                    <span>{fechando ? "Fechando..." : "Fechar mês"}</span>
                    <span className="ml-auto text-gray-400">›</span>
                  </button>

                  <button
                    onClick={async () => {
                      if (!confirm(`Excluir ${produtor.nome}? Esta ação não pode ser desfeita.`)) return;
                      await fetch(`${API}/produtores/${produtor.id}`, { method: "DELETE" });
                      setSelecionado(null);
                      const updated = await fetch(`${API}/produtores`).then(r => r.json());
                      setProdutores(updated);
                    }}
                    className="w-full flex items-center gap-3 py-3 text-sm hover:bg-red-50 text-red-600"
                  >
                    <span className="text-lg">🗑️</span>
                    <span>Excluir produtor</span>
                    <span className="ml-auto text-gray-400">›</span>
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
