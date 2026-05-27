"use client";
import { useState, useEffect } from "react";

const API = "https://ruralcaixa-mvp-production.up.railway.app";
const PRODUTOR_ID = 1;

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

type Consorcio = {
  id: string;
  nome: string;
  safra: string | null;
  cultura: string | null;
  status: string;
  imovel_nome?: string;
  total_participantes?: number;
  total_lancamentos?: number;
};

type ConsorcioResumo = {
  consorcio: Consorcio;
  lancamentos: {
    pendentes: number;
    aprovados: number;
    receita: number;
    despesa: number;
    saldo: number;
  };
  participantes: {
    produtor_id: number;
    nome: string;
    perc_rateio: number;
    receita_cota: number;
    despesa_cota: number;
    cotas_importadas: number;
  }[];
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

  // Consórcio
  const [consorcios, setConsorcios] = useState<Consorcio[]>([]);
  const [loadingCons, setLoadingCons] = useState(true);
  const [consorcioSel, setConsorcioSel] = useState<ConsorcioResumo | null>(null);
  const [loadingResumo, setLoadingResumo] = useState(false);

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

  useEffect(() => {
    if (aba === "consorcio") {
      setLoadingCons(true);
      fetch(`${API}/consorcios`)
        .then(r => r.json())
        .then(data => { setConsorcios(data); setLoadingCons(false); })
        .catch(() => setLoadingCons(false));
    }
  }, [aba]);

  async function abrirConsorcio(id: string) {
    setLoadingResumo(true);
    try {
      const r = await fetch(`${API}/consorcios/${id}/resumo`);
      const data = await r.json();
      setConsorcioSel(data);
    } catch {}
    setLoadingResumo(false);
  }

  async function importarCota(consorcioId: string, lancamentoId: string) {
    const r = await fetch(
      `${API}/consorcios/${consorcioId}/lancamentos/${lancamentoId}/importar-dre`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ produtor_id: PRODUTOR_ID }),
      }
    );
    if (r.ok) {
      alert("Cota importada para o DRE!");
      if (consorcioSel) abrirConsorcio(consorcioSel.consorcio.id);
    } else {
      const e = await r.json();
      alert(e.detail || "Erro ao importar");
    }
  }

  const saldo = resumo.receita - resumo.despesa;
  const fmt = (v: number) => `R$ ${v.toLocaleString("pt-BR")}`;

  return (
    <div className="min-h-screen bg-gray-50 max-w-md mx-auto">
      <div className="bg-green-800 text-white px-4 py-4">
        <div className="text-xs opacity-70">Rural Caixa PF</div>
        <div className="text-lg font-medium">Joao Batista Neves</div>
        <div className="text-xs opacity-70 mt-1">{new Date().toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}</div>
      </div>

      {/* ── DASHBOARD ── */}
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

          {/* Card de consórcios ativos */}
          <button
            onClick={() => setAba("consorcio")}
            className="w-full bg-white rounded-xl p-4 shadow-sm flex items-center justify-between"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center text-xl">🤝</div>
              <div className="text-left">
                <div className="text-sm font-medium text-gray-800">Consórcios Rurais</div>
                <div className="text-xs text-gray-400">Lançamentos coletivos e rateio</div>
              </div>
            </div>
            <span className="text-gray-400 text-lg">→</span>
          </button>

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
                      {l.data_lancamento ? l.data_lancamento.slice(0,10).split("-").reverse().join("/") : ""}
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

      {/* ── CONSÓRCIO ── */}
      {aba === "consorcio" && !consorcioSel && (
        <div className="p-4 space-y-4 pb-24">
          <div className="flex items-center gap-3">
            <button onClick={() => setAba("dashboard")} className="text-green-800 font-medium">← Voltar</button>
            <div className="text-lg font-medium">Consórcios Rurais</div>
          </div>

          {loadingCons ? (
            <div className="text-center text-gray-400 py-10 text-sm">Carregando...</div>
          ) : consorcios.length === 0 ? (
            <div className="bg-white rounded-xl p-8 shadow-sm text-center">
              <div className="text-4xl mb-3">🤝</div>
              <div className="text-gray-500 text-sm">Nenhum consórcio encontrado</div>
              <div className="text-gray-400 text-xs mt-1">Os consórcios são criados pelo administrador</div>
            </div>
          ) : (
            <div className="space-y-3">
              {consorcios.map(c => (
                <button
                  key={c.id}
                  onClick={() => abrirConsorcio(c.id)}
                  className="w-full bg-white rounded-xl p-4 shadow-sm text-left"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="font-medium text-gray-800">{c.nome}</div>
                      {c.cultura && (
                        <div className="text-xs text-green-700 mt-0.5">{c.cultura} {c.safra && `· Safra ${c.safra}`}</div>
                      )}
                      {c.imovel_nome && (
                        <div className="text-xs text-gray-400 mt-0.5">📍 {c.imovel_nome}</div>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        c.status === "ativo" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
                      }`}>
                        {c.status}
                      </span>
                      {c.total_participantes !== undefined && (
                        <span className="text-xs text-gray-400">{c.total_participantes} participantes</span>
                      )}
                    </div>
                  </div>
                  {c.total_lancamentos !== undefined && (
                    <div className="mt-2 text-xs text-gray-400">
                      {c.total_lancamentos} lançamento{c.total_lancamentos !== 1 ? "s" : ""}
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── RESUMO DO CONSÓRCIO ── */}
      {aba === "consorcio" && consorcioSel && (
        <div className="p-4 space-y-4 pb-24">
          <div className="flex items-center gap-3">
            <button onClick={() => setConsorcioSel(null)} className="text-green-800 font-medium">← Voltar</button>
            <div className="text-lg font-medium truncate">{consorcioSel.consorcio.nome}</div>
          </div>

          {loadingResumo ? (
            <div className="text-center text-gray-400 py-10">Carregando...</div>
          ) : (
            <>
              {/* Cards de totais */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-white rounded-xl p-3 shadow-sm text-center">
                  <div className="text-xs text-gray-400">Receita</div>
                  <div className="text-sm font-semibold text-green-700 mt-1">
                    {fmt(consorcioSel.lancamentos.receita)}
                  </div>
                </div>
                <div className="bg-white rounded-xl p-3 shadow-sm text-center">
                  <div className="text-xs text-gray-400">Despesa</div>
                  <div className="text-sm font-semibold text-red-600 mt-1">
                    {fmt(consorcioSel.lancamentos.despesa)}
                  </div>
                </div>
                <div className="bg-white rounded-xl p-3 shadow-sm text-center">
                  <div className="text-xs text-gray-400">Saldo</div>
                  <div className={`text-sm font-semibold mt-1 ${
                    consorcioSel.lancamentos.saldo >= 0 ? "text-green-700" : "text-red-600"
                  }`}>
                    {fmt(consorcioSel.lancamentos.saldo)}
                  </div>
                </div>
              </div>

              {/* Pendentes */}
              {consorcioSel.lancamentos.pendentes > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-center gap-2">
                  <span className="text-lg">⏳</span>
                  <div>
                    <div className="text-sm font-medium text-amber-800">
                      {consorcioSel.lancamentos.pendentes} lançamento{consorcioSel.lancamentos.pendentes > 1 ? "s" : ""} aguardando aprovação
                    </div>
                    <div className="text-xs text-amber-600">Acesse o Swagger para votar</div>
                  </div>
                </div>
              )}

              {/* Participantes e cotas */}
              <div className="bg-white rounded-xl shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b text-xs font-medium text-gray-500 uppercase tracking-wide">
                  Participantes e cotas
                </div>
                {consorcioSel.participantes.map(p => (
                  <div key={p.produtor_id} className="px-4 py-3 border-b last:border-0">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center text-sm">
                          {p.nome.charAt(0)}
                        </div>
                        <div>
                          <div className="text-sm font-medium text-gray-800">{p.nome}</div>
                          <div className="text-xs text-gray-400">{p.perc_rateio}% do rateio</div>
                        </div>
                      </div>
                      <div className="text-right">
                        {p.despesa_cota > 0 && (
                          <div className="text-sm text-red-600">-{fmt(p.despesa_cota)}</div>
                        )}
                        {p.receita_cota > 0 && (
                          <div className="text-sm text-green-700">+{fmt(p.receita_cota)}</div>
                        )}
                        {p.cotas_importadas > 0 && (
                          <div className="text-xs text-gray-400 mt-0.5">✅ importado DRE</div>
                        )}
                      </div>
                    </div>

                    {/* Botão importar para DRE — só para o produtor logado com cota não importada */}
                    {p.produtor_id === PRODUTOR_ID && p.cotas_importadas === 0 &&
                      (p.despesa_cota > 0 || p.receita_cota > 0) && (
                      <button
                        onClick={async () => {
                          // Busca lançamentos aprovados para importar
                          const r = await fetch(
                            `${API}/consorcios/${consorcioSel.consorcio.id}/lancamentos?status=aprovado`
                          );
                          const lancs = await r.json();
                          if (lancs.length > 0) {
                            await importarCota(consorcioSel.consorcio.id, lancs[0].id);
                          }
                        }}
                        className="mt-2 w-full text-xs bg-green-50 border border-green-200 text-green-700 py-1.5 rounded-lg"
                      >
                        Importar minha cota para o DRE
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {/* Info do consórcio */}
              <div className="bg-white rounded-xl p-4 shadow-sm">
                <div className="text-xs text-gray-500 uppercase tracking-wide mb-2">Detalhes</div>
                <div className="space-y-1.5">
                  {consorcioSel.consorcio.cultura && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Cultura</span>
                      <span className="font-medium">{consorcioSel.consorcio.cultura}</span>
                    </div>
                  )}
                  {consorcioSel.consorcio.safra && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Safra</span>
                      <span className="font-medium">{consorcioSel.consorcio.safra}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Aprovados</span>
                    <span className="font-medium text-green-700">{consorcioSel.lancamentos.aprovados}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Pendentes</span>
                    <span className={`font-medium ${consorcioSel.lancamentos.pendentes > 0 ? "text-amber-600" : "text-gray-400"}`}>
                      {consorcioSel.lancamentos.pendentes}
                    </span>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── NOVO LANÇAMENTO ── */}
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
                type="number" min="1" max="100"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 mt-1 text-sm"
                value={participacao}
                onChange={e => setParticipacao(e.target.value)}
              />
            </div>

            {resultado && (
              <div className="bg-gray-50 rounded-lg p-3 space-y-1 text-sm border border-gray-200">
                <div className="font-medium text-gray-700">Classificacao sugerida:</div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Tipo</span>
                  <span className={resultado.tipo === "receita" ? "text-green-700 font-medium" : "text-red-600 font-medium"}>
                    {resultado.tipo?.toUpperCase()}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Conta</span>
                  <span className="font-medium">{resultado.conta}</span>
                </div>
              </div>
            )}

            {!resultado ? (
              <button
                onClick={async () => {
                  if (!descricao) return alert("Digite uma descricao");
                  setClassificando(true);
                  try {
                    const res = await fetch(`${API}/classificar-texto`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ texto: descricao }),
                    });
                    setResultado(await res.json());
                  } catch { alert("Erro ao classificar"); }
                  finally { setClassificando(false); }
                }}
                disabled={classificando || !descricao}
                className="w-full bg-green-800 text-white py-3 rounded-lg text-sm font-medium disabled:bg-gray-300"
              >
                {classificando ? "Classificando..." : "Classificar"}
              </button>
            ) : (
              <div className="flex gap-3">
                <button onClick={() => setResultado(null)} className="flex-1 py-3 rounded-lg text-sm border border-gray-200">Corrigir</button>
                <button
                  onClick={async () => {
                    setSalvando(true);
                    try {
                      const res = await fetch(`${API}/lancamentos`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          produtor_id: PRODUTOR_ID,
                          conta_codigo: resultado.conta,
                          tipo: resultado.tipo,
                          descricao,
                          valor: parseFloat(valor) || resultado.valor,
                          data_lancamento: data,
                          origem: "manual",
                          confirmado: true,
                          atividade,
                          perc_participacao: parseFloat(participacao),
                        }),
                      });
                      if (res.ok) {
                        setSalvo(true);
                        setDescricao(""); setValor(""); setResultado(null);
                        setTimeout(() => { setSalvo(false); setAba("dashboard"); }, 2000);
                      } else { alert("Erro ao salvar"); }
                    } catch { alert("Erro de conexao"); }
                    finally { setSalvando(false); }
                  }}
                  disabled={salvando}
                  className="flex-1 py-3 rounded-lg text-sm font-medium text-white bg-green-800 disabled:bg-gray-400"
                >
                  {salvando ? "Salvando..." : "Confirmar"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── PERFIL ── */}
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
              <div className="flex items-center gap-3"><span className="text-xl">🧮</span><span className="text-sm text-gray-700">Painel do contador</span></div>
              <span className="text-gray-400">→</span>
            </a>
            <a href="/relatorio" className="flex items-center justify-between px-4 py-3 hover:bg-gray-50">
              <div className="flex items-center gap-3"><span className="text-xl">📄</span><span className="text-sm text-gray-700">Relatorio LCDPR</span></div>
              <span className="text-gray-400">→</span>
            </a>
          </div>
        </div>
      )}

      {/* ── BOTTOM NAV ── */}
      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-white border-t flex">
        {[
          { id: "dashboard", icon: "🏠", label: "Inicio" },
          { id: "novo", icon: "➕", label: "Lancar" },
          { id: "consorcio", icon: "🤝", label: "Consórcio" },
          { id: "relatorio", icon: "📊", label: "Relatorio", href: "/relatorio" },
          { id: "perfil", icon: "👤", label: "Perfil" },
        ].map(n => (
          (n as any).href ? (
            <a key={n.id} href={(n as any).href} className="flex-1 py-3 flex flex-col items-center gap-1 text-gray-400">
              <span className="text-xl">{n.icon}</span>
              <span className="text-xs">{n.label}</span>
            </a>
          ) : (
            <button key={n.id} onClick={() => { setAba(n.id); setConsorcioSel(null); }}
              className={`flex-1 py-3 flex flex-col items-center gap-1 ${aba === n.id ? "text-green-800" : "text-gray-400"}`}>
              <span className="text-xl">{n.icon}</span>
              <span className="text-xs">{n.label}</span>
            </button>
          )
        ))}
      </div>
    </div>
  );
}
