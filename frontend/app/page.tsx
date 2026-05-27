"use client";
import { useState, useEffect } from "react";

const API = "https://ruralcaixa-mvp-production.up.railway.app";

function fmtBRL(v: number): string {
  return "R$ " + v.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

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

type Participante = {
  produtor_id: number;
  nome: string;
  perc_rateio: number;
  papel: string;
  receita_cota: number;
  despesa_cota: number;
  cotas_importadas: number;
};

type Consorcio = {
  id: string;
  nome: string;
  safra: string | null;
  cultura: string | null;
  status: string;
  imovel_nome?: string;
  total_participantes?: number;
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
  participantes: Participante[];
};

type RateioItem = { produtor_id: number; perc_rateio: number };


const CONTAS: Record<string, string> = {
  "1.1":    "Receita Rural",
  "1.1.1":  "Venda de Producao Vegetal",
  "1.1.2":  "Venda de Producao Animal",
  "3.1.1":  "Insumos (sementes/adubos)",
  "3.1.2":  "Combustivel",
  "3.1.3":  "Sanidade Animal",
  "3.1.4":  "Mao de Obra",
  "3.1.5":  "Manutencao e Reparos",
  "3.1.6":  "Energia Eletrica",
  "3.1.7":  "Arrendamento",
  "3.9":    "Outras Despesas",
  "5.1":    "Maquinas e Equipamentos",
  "5.2":    "Obras e Benfeitorias",
  "5.3":    "Animais para Investimento",
};

function nomeConta(codigo: string): string {
  return CONTAS[codigo] || codigo;
}

const CORES = [
  "bg-green-100 text-green-800",
  "bg-blue-100 text-blue-800",
  "bg-amber-100 text-amber-800",
  "bg-purple-100 text-purple-800",
  "bg-rose-100 text-rose-800"
];

export default function Home() {
  const [aba, setAba] = useState("dashboard");

  // Dashboard
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([]);
  const [loadingLanc, setLoadingLanc] = useState(true);
  const [resumo, setResumo] = useState({ receita: 0, despesa: 0 });

  // Consorcio lista
  const [consorcios, setConsorcios] = useState<Consorcio[]>([]);
  const [loadingCons, setLoadingCons] = useState(true);

  // Consorcio detalhe
  const [consorcioSel, setConsorcioSel] = useState<ConsorcioResumo | null>(null);
  const [loadingResumo, setLoadingResumo] = useState(false);

  // Consorcio lancamento
  const [membroLancando, setMembroLancando] = useState<Participante | null>(null);
  const [formTipo, setFormTipo] = useState("DESPESA");
  const [formDesc, setFormDesc] = useState("");
  const [formValor, setFormValor] = useState("");
  const [formData, setFormData] = useState(new Date().toISOString().slice(0, 10));
  const [formCategoria, setFormCategoria] = useState("");
  const [formObs, setFormObs] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [lancamentoOk, setLancamentoOk] = useState(false);
  const [classificandoCons, setClassificandoCons] = useState(false);
  const [classificacaoCons, setClassificacaoCons] = useState<any>(null);

  // Lancamento individual
  const [descricao, setDescricao] = useState("");
  const [valor, setValor] = useState("");
  const [data, setData] = useState(new Date().toISOString().slice(0, 10));
  const [classificando, setClassificando] = useState(false);
  const [resultado, setResultado] = useState<any>(null);
  const [salvando, setSalvando] = useState(false);
  const [atividade, setAtividade] = useState("rural");
  const [participacao, setParticipacao] = useState("100");
  const [salvo, setSalvo] = useState(false);

  useEffect(() => {
    fetch(API + "/produtores/1/lancamentos")
      .then(r => r.json())
      .then(d => { setLancamentos(d); setLoadingLanc(false); })
      .catch(() => setLoadingLanc(false));
    fetch(API + "/produtores")
      .then(r => r.json())
      .then(prods => {
        const p = prods.find((x: any) => x.id === 1);
        if (p) setResumo({ receita: p.receita, despesa: p.despesa });
      }).catch(() => {});
  }, [salvo, lancamentoOk]);

  useEffect(() => {
    if (aba === "consorcio") {
      setLoadingCons(true);
      fetch(API + "/consorcios")
        .then(r => r.json())
        .then(d => { setConsorcios(d); setLoadingCons(false); })
        .catch(() => setLoadingCons(false));
    }
  }, [aba]);

  useEffect(() => {
    if (!formDesc || formDesc.length < 5) {
      setClassificacaoCons(null);
      return;
    }
    const timer = setTimeout(() => {
      setClassificandoCons(true);
      fetch(API + "/classificar-texto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texto: formDesc }),
      }).then(r => r.json()).then(d => {
        setClassificacaoCons(d);
        if (d.tipo) setFormTipo(d.tipo.toUpperCase() === "RECEITA" ? "RECEITA" : "DESPESA");
        if (d.conta) setFormCategoria(d.conta);
      }).catch(() => {})
        .finally(() => setClassificandoCons(false));
    }, 800);
    return () => clearTimeout(timer);
  }, [formDesc]);

  function abrirConsorcio(id: string) {
    setLoadingResumo(true);
    setConsorcioSel(null);
    fetch(API + "/consorcios/" + id + "/resumo")
      .then(r => r.json())
      .then(d => { setConsorcioSel(d); setLoadingResumo(false); })
      .catch(() => setLoadingResumo(false));
  }

  function enviarLancamento() {
    if (!membroLancando || !consorcioSel) return;
    if (!formDesc.trim()) { alert("Informe a descricao"); return; }
    if (!formValor || parseFloat(formValor) <= 0) { alert("Informe o valor"); return; }

    setEnviando(true);
    const rateio: RateioItem[] = consorcioSel.participantes.map(p => ({
      produtor_id: p.produtor_id,
      perc_rateio: p.perc_rateio,
    }));
    const cid = consorcioSel.consorcio.id;
    const pid = membroLancando.produtor_id;

    fetch(API + "/consorcios/" + cid + "/lancamentos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tipo: formTipo,
        descricao: formDesc,
        valor: parseFloat(formValor),
        data_lancamento: formData,
        categoria: formCategoria || undefined,
        observacao: formObs || undefined,
        lancado_por: pid,
        rateio: rateio,
      }),
    }).then(function(res) {
      if (res.ok) {
        setLancamentoOk(true);
        setFormDesc(""); setFormValor(""); setFormCategoria(""); setFormObs("");
        setMembroLancando(null);
        abrirConsorcio(cid);
        setTimeout(function() { setLancamentoOk(false); }, 3000);
      } else {
        res.json().then(function(e) { alert(e.detail || "Erro ao lancar"); });
      }
      setEnviando(false);
    }).catch(function() {
      alert("Erro de conexao");
      setEnviando(false);
    });
  }

  const saldo = resumo.receita - resumo.despesa;

  return (
    <div className="min-h-screen bg-gray-50 max-w-md mx-auto">
      <div className="bg-green-800 text-white px-4 py-4">
        <div className="text-xs opacity-70">Rural Caixa PF</div>
        <div className="text-lg font-medium">Cicero Viana de Souza</div>
        <div className="text-xs opacity-70 mt-1">
          {new Date().toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}
        </div>
      </div>

      {aba === "dashboard" && (
        <div className="p-4 space-y-4 pb-32">
          <div className="bg-white rounded-xl p-4 shadow-sm">
            <div className="text-xs text-gray-500 uppercase tracking-wide">Saldo do periodo</div>
            <div className={"text-3xl font-semibold mt-1 " + (saldo >= 0 ? "text-green-700" : "text-red-600")}>
              {fmtBRL(saldo)}
            </div>
            <div className="flex gap-3 mt-3">
              <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">+ {fmtBRL(resumo.receita)}</span>
              <span className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded-full">- {fmtBRL(resumo.despesa)}</span>
            </div>
          </div>

          <button onClick={() => setAba("novo")}
            className="w-full bg-green-800 text-white py-4 rounded-xl text-lg font-medium flex items-center justify-center gap-2">
            + Novo lancamento
          </button>

          <div className="grid grid-cols-3 gap-3">
            <button onClick={() => setAba("novo")} className="bg-white rounded-xl py-4 flex flex-col items-center gap-1 shadow-sm">
              <span className="text-2xl">{"\uD83C\uDF99"}</span>
              <span className="text-xs text-gray-600">Audio</span>
            </button>
            <button onClick={() => setAba("novo")} className="bg-white rounded-xl py-4 flex flex-col items-center gap-1 shadow-sm">
              <span className="text-xs text-gray-600">Foto NF</span>
            </button>
            <a href="/relatorio" className="bg-white rounded-xl py-4 flex flex-col items-center gap-1 shadow-sm text-center">
              <span className="text-xs text-gray-600">Relatorio</span>
            </a>
          </div>

          <button onClick={() => setAba("consorcio")}
            className="w-full bg-white rounded-xl p-4 shadow-sm flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center text-xl">C</div>
              <div className="text-left">
                <div className="text-sm font-medium text-gray-800">Consorcios Rurais</div>
                <div className="text-xs text-gray-400">Lancamentos coletivos e rateio</div>
              </div>
            </div>
            <span className="text-gray-400 text-lg">&gt;</span>
          </button>

          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b text-xs font-medium text-gray-500 uppercase tracking-wide">Ultimos lancamentos</div>
            {loadingLanc ? (
              <div className="text-center text-gray-400 py-6 text-sm">Carregando...</div>
            ) : lancamentos.length === 0 ? (
              <div className="text-center text-gray-400 py-6 text-sm">Nenhum lancamento este mes</div>
            ) : lancamentos.slice(0, 5).map(l => (
              <div key={l.id} className="flex items-center gap-3 px-4 py-3 border-b last:border-0">
                <div className={"w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold " +
                  (l.tipo === "receita" ? "bg-green-100 text-green-700" : l.tipo === "despesa" ? "bg-red-100 text-red-700" : "bg-blue-100 text-blue-700")}>
                  {l.tipo === "receita" ? "R" : l.tipo === "despesa" ? "D" : "I"}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{l.descricao || l.produto || l.conta_codigo}</div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    {l.data_lancamento ? l.data_lancamento.slice(0,10).split("-").reverse().join("/") : ""}
                  </div>
                </div>
                <div className={"text-sm font-medium " +
                  (l.tipo === "receita" ? "text-green-700" : l.tipo === "despesa" ? "text-red-600" : "text-blue-700")}>
                  {l.tipo === "receita" ? "+" : "-"}{fmtBRL(l.valor)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {aba === "consorcio" && !consorcioSel && !loadingResumo && (
        <div className="p-4 space-y-4 pb-32">
          <div className="flex items-center gap-3">
            <button onClick={() => setAba("dashboard")} className="text-green-800 font-medium">Voltar</button>
            <div className="text-lg font-medium">Consorcios Rurais</div>
          </div>
          {loadingCons ? (
            <div className="text-center text-gray-400 py-10">Carregando...</div>
          ) : consorcios.length === 0 ? (
            <div className="bg-white rounded-xl p-8 shadow-sm text-center">
              <div className="text-gray-500 text-sm">Nenhum consorcio encontrado</div>
            </div>
          ) : consorcios.map(c => (
            <button key={c.id} onClick={() => abrirConsorcio(c.id)}
              className="w-full bg-white rounded-xl p-4 shadow-sm text-left">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-medium text-gray-800">{c.nome}</div>
                  {c.cultura && <div className="text-xs text-green-700 mt-0.5">{c.cultura}{c.safra ? " - Safra " + c.safra : ""}</div>}
                  {c.imovel_nome && <div className="text-xs text-gray-400 mt-0.5">{c.imovel_nome}</div>}
                </div>
                <span className={"text-xs px-2 py-0.5 rounded-full " + (c.status === "ativo" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500")}>
                  {c.status}
                </span>
              </div>
              {c.total_participantes !== undefined && (
                <div className="mt-2 text-xs text-gray-400">{c.total_participantes} participantes</div>
              )}
            </button>
          ))}
        </div>
      )}

      {aba === "consorcio" && loadingResumo && (
        <div className="p-4 text-center text-gray-400 py-20">Carregando consorcio...</div>
      )}

      {aba === "consorcio" && consorcioSel && !membroLancando && !loadingResumo && (
        <div className="p-4 space-y-4 pb-32">
          <div className="flex items-center gap-3">
            <button onClick={() => setConsorcioSel(null)} className="text-green-800 font-medium">Voltar</button>
            <div className="text-lg font-medium truncate">{consorcioSel.consorcio.nome}</div>
          </div>

          {lancamentoOk && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-center text-green-700 text-sm font-medium">
              Lancamento enviado para votacao!
            </div>
          )}

          <div className="grid grid-cols-3 gap-2">
            <div className="bg-white rounded-xl p-3 shadow-sm text-center">
              <div className="text-xs text-gray-400">Receita</div>
              <div className="text-sm font-semibold text-green-700 mt-1">{fmtBRL(consorcioSel.lancamentos.receita)}</div>
            </div>
            <div className="bg-white rounded-xl p-3 shadow-sm text-center">
              <div className="text-xs text-gray-400">Despesa</div>
              <div className="text-sm font-semibold text-red-600 mt-1">{fmtBRL(consorcioSel.lancamentos.despesa)}</div>
            </div>
            <div className="bg-white rounded-xl p-3 shadow-sm text-center">
              <div className="text-xs text-gray-400">Saldo</div>
              <div className={"text-sm font-semibold mt-1 " + (consorcioSel.lancamentos.saldo >= 0 ? "text-green-700" : "text-red-600")}>
                {fmtBRL(consorcioSel.lancamentos.saldo)}
              </div>
            </div>
          </div>

          {consorcioSel.lancamentos.pendentes > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-center gap-2">
              <span>...</span>
              <div className="text-sm text-amber-800">
                {consorcioSel.lancamentos.pendentes} lancamento(s) aguardando aprovacao
              </div>
            </div>
          )}

          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b">
              <div className="text-sm font-semibold text-gray-700">Membros do consorcio</div>
              <div className="text-xs text-gray-400 mt-0.5">Toque no seu nome para lancar</div>
            </div>
            {consorcioSel.participantes.map((p, i) => {
              const cor = CORES[i % CORES.length];
              const resultado = p.receita_cota - p.despesa_cota;
              return (
                <button key={p.produtor_id} onClick={() => setMembroLancando(p)}
                  className="w-full px-4 py-4 border-b last:border-0 flex items-center gap-4 hover:bg-gray-50 text-left">
                  <div className={"w-12 h-12 rounded-full flex items-center justify-center text-xl font-bold flex-shrink-0 " + cor}>
                    {p.nome.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900">{p.nome}</span>
                      {p.papel === "administrador" && (
                        <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">admin</span>
                      )}
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">{p.perc_rateio}% do rateio</div>
                    <div className="flex gap-2 mt-1">
                      {p.receita_cota > 0 && <span className="text-xs text-green-700">+{fmtBRL(p.receita_cota)}</span>}
                      {p.despesa_cota > 0 && <span className="text-xs text-red-600">-{fmtBRL(p.despesa_cota)}</span>}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className={"text-sm font-semibold " + (resultado >= 0 ? "text-green-700" : "text-red-600")}>
                      {resultado !== 0 ? fmtBRL(Math.abs(resultado)) : "--"}
                    </div>
                    <div className="text-xs text-green-700 mt-1">+ Lancar</div>
                  </div>
                </button>
              );
            })}
          </div>

          {(consorcioSel.consorcio.cultura || consorcioSel.consorcio.safra) && (
            <div className="bg-white rounded-xl p-4 shadow-sm flex items-center gap-3">
              <div>
                {consorcioSel.consorcio.cultura && <div className="text-sm font-medium text-gray-800">{consorcioSel.consorcio.cultura}</div>}
                {consorcioSel.consorcio.safra && <div className="text-xs text-gray-400">Safra {consorcioSel.consorcio.safra}</div>}
              </div>
            </div>
          )}
        </div>
      )}

      {aba === "consorcio" && consorcioSel && membroLancando && (
        <div className="p-4 space-y-4 pb-32">
          <div className="flex items-center gap-3">
            <button onClick={() => setMembroLancando(null)} className="text-green-800 font-medium">Voltar</button>
            <div className="text-lg font-medium">Novo lancamento</div>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-center gap-3">
            <div className={"w-10 h-10 rounded-full flex items-center justify-center font-bold " +
              CORES[consorcioSel.participantes.findIndex(p => p.produtor_id === membroLancando.produtor_id) % CORES.length]}>
              {membroLancando.nome.charAt(0)}
            </div>
            <div>
              <div className="text-sm font-medium text-amber-900">{membroLancando.nome}</div>
              <div className="text-xs text-amber-700">{consorcioSel.consorcio.nome}</div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => setFormTipo("DESPESA")}
              className={"py-3 rounded-xl text-sm font-medium border-2 " +
                (formTipo === "DESPESA" ? "border-red-500 bg-red-50 text-red-700" : "border-gray-200 text-gray-400")}>
              Despesa
            </button>
            <button onClick={() => setFormTipo("RECEITA")}
              className={"py-3 rounded-xl text-sm font-medium border-2 " +
                (formTipo === "RECEITA" ? "border-green-500 bg-green-50 text-green-700" : "border-gray-200 text-gray-400")}>
              Receita
            </button>
          </div>

          <div className="bg-white rounded-xl p-4 shadow-sm space-y-3">
            <div>
              <label className="text-xs text-gray-500">Descricao *</label>
              <input className="w-full border border-gray-200 rounded-lg px-3 py-2 mt-1 text-sm"
                placeholder="Ex: Compra de adubo NPK"
                value={formDesc}
                onChange={e => { setFormDesc(e.target.value); setClassificacaoCons(null); }}
              />
              {classificandoCons && <div className="text-xs text-gray-400 mt-1">Classificando...</div>}
              {classificacaoCons && !classificandoCons && (
                <div className="mt-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2 flex items-center justify-between">
                  <div className="text-xs text-green-700">
                    Sugestao: <span className="font-medium">{formTipo === "RECEITA" ? "Receita" : "Despesa"}</span>
                    {classificacaoCons.conta ? " - " + nomeConta(classificacaoCons.conta) : ""}
                  </div>
                  <button onClick={() => setClassificacaoCons(null)} className="text-xs text-gray-400">ajustar</button>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500">Valor *</label>
                <input type="number" className="w-full border border-gray-200 rounded-lg px-3 py-2 mt-1 text-sm"
                  placeholder="0,00" value={formValor} onChange={e => setFormValor(e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-gray-500">Data</label>
                <input type="date" className="w-full border border-gray-200 rounded-lg px-3 py-2 mt-1 text-sm"
                  value={formData} onChange={e => setFormData(e.target.value)} />
              </div>
            </div>

            <div>
              <label className="text-xs text-gray-500">
                Categoria
                {classificandoCons && <span className="ml-2 text-gray-400">classificando...</span>}
                {classificacaoCons && !classificandoCons && <span className="ml-2 text-green-600">sugerida pela IA</span>}
              </label>
              <input className="w-full border border-gray-200 rounded-lg px-3 py-2 mt-1 text-sm"
                placeholder="Ex: Insumos, Combustivel..."
                value={formCategoria} onChange={e => setFormCategoria(e.target.value)} />
            </div>

            <div>
              <label className="text-xs text-gray-500">Observacao</label>
              <input className="w-full border border-gray-200 rounded-lg px-3 py-2 mt-1 text-sm"
                placeholder="Opcional" value={formObs} onChange={e => setFormObs(e.target.value)} />
            </div>
          </div>

          <div className="bg-white rounded-xl p-4 shadow-sm">
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-2">Rateio previsto</div>
            {formValor && parseFloat(formValor) > 0 ? (
              <div className="space-y-1.5">
                {consorcioSel.participantes.map(p => (
                  <div key={p.produtor_id} className="flex justify-between text-sm">
                    <span className={"font-medium " + (p.produtor_id === membroLancando.produtor_id ? "text-green-800" : "text-gray-600")}>
                      {p.nome.split(" ")[0]}
                    </span>
                    <span className="text-gray-500">
                      {p.perc_rateio}% - {fmtBRL(parseFloat(formValor) * p.perc_rateio / 100)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-xs text-gray-400">Informe o valor para ver o rateio</div>
            )}
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-700">
            Este lancamento sera enviado para aprovacao dos demais participantes (maioria simples)
          </div>

          <button onClick={enviarLancamento} disabled={enviando || !formDesc || !formValor}
            className="w-full bg-green-800 text-white py-4 rounded-xl text-sm font-medium disabled:bg-gray-300">
            {enviando ? "Enviando..." : "Enviar para votacao"}
          </button>
        </div>
      )}

      {aba === "novo" && (
        <div className="p-4 space-y-4 pb-32">
          <div className="flex items-center gap-3">
            <button onClick={() => { setAba("dashboard"); setResultado(null); }} className="text-green-800 font-medium">Voltar</button>
            <div className="text-lg font-medium">Novo lancamento</div>
          </div>
          {salvo && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center text-green-700 text-sm font-medium">
              Lancamento salvo!
            </div>
          )}
          <div className="bg-white rounded-xl p-4 shadow-sm space-y-3">
            <div className="text-sm font-medium text-gray-600">Lancamento manual</div>
            <div>
              <label className="text-xs text-gray-500">Descricao *</label>
              <input className="w-full border border-gray-200 rounded-lg px-3 py-2 mt-1 text-sm"
                placeholder="Ex: vendi 5 bois por 10000 reais"
                value={descricao} onChange={e => { setDescricao(e.target.value); setResultado(null); }} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500">Valor</label>
                <input className="w-full border border-gray-200 rounded-lg px-3 py-2 mt-1 text-sm"
                  placeholder="0,00" value={valor} onChange={e => setValor(e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-gray-500">Data</label>
                <input type="date" className="w-full border border-gray-200 rounded-lg px-3 py-2 mt-1 text-sm"
                  value={data} onChange={e => setData(e.target.value)} />
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-500">Tipo de atividade</label>
              <select className="w-full border border-gray-200 rounded-lg px-3 py-2 mt-1 text-sm"
                value={atividade} onChange={e => setAtividade(e.target.value)}>
                <option value="rural">Atividade Rural (LCDPR)</option>
                <option value="intermediacao">Intermediacao / Corretagem</option>
                <option value="servico">Prestacao de Servicos</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500">Sua participacao (%)</label>
              <input type="number" min="1" max="100"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 mt-1 text-sm"
                value={participacao} onChange={e => setParticipacao(e.target.value)} />
            </div>
            {resultado && (
              <div className="bg-gray-50 rounded-lg p-3 space-y-1 text-sm border border-gray-200">
                <div className="font-medium text-gray-700">Classificacao sugerida:</div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Tipo</span>
                  <span className={"font-medium " + (resultado.tipo === "receita" ? "text-green-700" : "text-red-600")}>
                    {resultado.tipo ? resultado.tipo.toUpperCase() : ""}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Conta</span>
                  <span className="font-medium">{resultado.conta}</span>
                </div>
              </div>
            )}
            {!resultado ? (
              <button onClick={() => {
                if (!descricao) { alert("Digite uma descricao"); return; }
                setClassificando(true);
                fetch(API + "/classificar-texto", {
                  method: "POST", headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ texto: descricao }),
                }).then(r => r.json()).then(d => setResultado(d))
                  .catch(() => alert("Erro ao classificar"))
                  .finally(() => setClassificando(false));
              }} disabled={classificando || !descricao}
                className="w-full bg-green-800 text-white py-3 rounded-lg text-sm font-medium disabled:bg-gray-300">
                {classificando ? "Classificando..." : "Classificar"}
              </button>
            ) : (
              <div className="flex gap-3">
                <button onClick={() => setResultado(null)} className="flex-1 py-3 rounded-lg text-sm border border-gray-200">Corrigir</button>
                <button onClick={() => {
                  setSalvando(true);
                  fetch(API + "/lancamentos", {
                    method: "POST", headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      produtor_id: 1, conta_codigo: resultado.conta,
                      tipo: resultado.tipo, descricao: descricao,
                      valor: parseFloat(valor) || resultado.valor,
                      data_lancamento: data, origem: "manual", confirmado: true,
                      atividade: atividade, perc_participacao: parseFloat(participacao),
                    }),
                  }).then(res => {
                    if (res.ok) {
                      setSalvo(true); setDescricao(""); setValor(""); setResultado(null);
                      setTimeout(() => { setSalvo(false); setAba("dashboard"); }, 2000);
                    } else { alert("Erro ao salvar"); }
                  }).catch(() => alert("Erro de conexao"))
                    .finally(() => setSalvando(false));
                }} disabled={salvando}
                  className="flex-1 py-3 rounded-lg text-sm font-medium text-white bg-green-800 disabled:bg-gray-400">
                  {salvando ? "Salvando..." : "Confirmar"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {aba === "perfil" && (
        <div className="p-4 space-y-4 pb-32">
          <div className="text-lg font-medium text-gray-700 px-1">Perfil</div>
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            <div className="px-4 py-4 border-b flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center text-2xl font-bold text-green-800">J</div>
              <div>
                <div className="font-medium text-gray-800">Cicero Viana de Souza</div>
                <div className="text-xs text-gray-400">Produtor rural</div>
              </div>
            </div>
            <a href="/cadastro" className="flex items-center justify-between px-4 py-3 border-b hover:bg-gray-50">
              <span className="text-sm text-gray-700">Cadastrar novo produtor</span>
              <span className="text-gray-400">&gt;</span>
            </a>
            <a href="/contador" className="flex items-center justify-between px-4 py-3 border-b hover:bg-gray-50">
              <span className="text-sm text-gray-700">Painel do contador</span>
              <span className="text-gray-400">&gt;</span>
            </a>
            <a href="/relatorio" className="flex items-center justify-between px-4 py-3 hover:bg-gray-50">
              <span className="text-sm text-gray-700">Relatorio LCDPR</span>
              <span className="text-gray-400">&gt;</span>
            </a>
          </div>
        </div>
      )}

      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-white border-t flex">
        {[
          { id: "dashboard", label: "Inicio" },
          { id: "novo", label: "Lancar" },
          { id: "consorcio", label: "Consorcio" },
          { id: "perfil", label: "Perfil" },
        ].map(n => (
          <button key={n.id}
            onClick={() => { setAba(n.id); setConsorcioSel(null); setMembroLancando(null); }}
            className={"flex-1 py-3 flex flex-col items-center gap-1 " + (aba === n.id ? "text-green-800" : "text-gray-400")}>
            <span className="text-xs">{n.label}</span>
          </button>
        ))}
        <a href="/relatorio" className="flex-1 py-3 flex flex-col items-center gap-1 text-gray-400">
          <span className="text-xs">Relatorio</span>
        </a>
      </div>
    </div>
  );
}

