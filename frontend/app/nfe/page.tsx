"use client";
import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";

const API = "https://ruralcaixa-mvp-production.up.railway.app";
const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

type Produto = { id: number; codigo: string; descricao: string; ncm: string; cfop: string; unidade: string; preco_unitario: number };
type Destinatario = { id: number; razao_social: string; documento: string; municipio: string; uf: string; tipo_doc: string };
type Item = { produto_id?: number; descricao: string; ncm: string; cfop: string; unidade: string; quantidade: number; valor_unitario: number; valor_desconto: number };
type Nota = { id: number; numero: number; valor_total: number; valor_funrural: number; valor_senar: number; status: string; data_emissao: string; destinatario_nome?: string };

function StepIndicator({ step, current }: { step: number; current: number }) {
  const labels = ["Configurar", "Destinatario", "Itens", "Emitir"];
  return (
    <div className="flex items-center gap-0 mb-6">
      {labels.map((l, i) => (
        <div key={i} className="flex items-center flex-1 last:flex-none">
          <div className="flex flex-col items-center">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
              i + 1 < current ? "bg-green-700 text-white" :
              i + 1 === current ? "bg-green-800 text-white ring-2 ring-green-300" :
              "bg-gray-200 text-gray-400"
            }`}>
              {i + 1 < current ? "✓" : i + 1}
            </div>
            <span className={`text-xs mt-1 ${i + 1 === current ? "text-green-800 font-medium" : "text-gray-400"}`}>{l}</span>
          </div>
          {i < labels.length - 1 && (
            <div className={`flex-1 h-0.5 mx-1 mb-4 ${i + 1 < current ? "bg-green-600" : "bg-gray-200"}`} />
          )}
        </div>
      ))}
    </div>
  );
}

function NFeContent() {
  const searchParams = useSearchParams();
  const produtorId = searchParams.get("produtor_id") || "1";

  const [step, setStep] = useState(1);
  const [aba, setAba] = useState<"emitir" | "historico">("emitir");

  // Dados
  const [config, setConfig] = useState<any>(null);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [destinatarios, setDestinatarios] = useState<Destinatario[]>([]);
  const [notas, setNotas] = useState<Nota[]>([]);
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);

  // Step 1: Config fiscal
  const [ie, setIe] = useState("");
  const [caepf, setCaepf] = useState("");
  const [municipio, setMunicipio] = useState("");
  const [uf, setUf] = useState("MA");
  const [endereco, setEndereco] = useState("");
  const [numero, setNumero] = useState("");
  const [bairro, setBairro] = useState("");
  const [cep, setCep] = useState("");

  // Step 2: Destinatário
  const [destSelecionado, setDestSelecionado] = useState<number | null>(null);
  const [showNovoDestinatario, setShowNovoDestinatario] = useState(false);
  const [novoDestForm, setNovoDestForm] = useState({ tipo_doc: "J", documento: "", razao_social: "", ie: "", municipio: "", uf: "MA", cep: "", endereco: "", numero: "", bairro: "" });

  // Step 3: Itens
  const [itens, setItens] = useState<Item[]>([]);
  const [aliqFunrural, setAliqFunrural] = useState(1.50);
  const [aliqSenar, setAliqSenar] = useState(0.20);
  const [natureza, setNatureza] = useState("Venda de Producao do Estabelecimento");
  const [infoAdicionais, setInfoAdicionais] = useState("");

  // Step 4: Resultado
  const [notaEmitida, setNotaEmitida] = useState<any>(null);
  const [baixandoPdf, setBaixandoPdf] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch(`${API}/produtores/${produtorId}/nfe/config`).then(r => r.json()),
      fetch(`${API}/produtores/${produtorId}/nfe/produtos`).then(r => r.json()),
      fetch(`${API}/produtores/${produtorId}/nfe/destinatarios`).then(r => r.json()),
      fetch(`${API}/produtores/${produtorId}/nfe/notas`).then(r => r.json()),
    ]).then(([cfg, prods, dests, nts]) => {
      setConfig(cfg);
      setProdutos(prods);
      setDestinatarios(dests);
      setNotas(nts);
      // Preenche campos com dados existentes
      const p = cfg.produtor;
      if (p.inscricao_estadual) setIe(p.inscricao_estadual);
      if (p.caepf) setCaepf(p.caepf);
      if (p.municipio) setMunicipio(p.municipio);
      if (p.uf) setUf(p.uf);
      if (p.endereco) setEndereco(p.endereco);
      if (p.numero) setNumero(p.numero);
      if (p.bairro) setBairro(p.bairro);
      if (p.cep) setCep(p.cep);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [produtorId]);

  async function salvarConfig() {
    setSalvando(true);
    await fetch(`${API}/produtores/${produtorId}/nfe/config`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inscricao_estadual: ie, caepf, municipio, uf, endereco, numero, bairro, cep }),
    });
    setSalvando(false);
    setStep(2);
  }

  async function adicionarDestinatario() {
    setSalvando(true);
    const res = await fetch(`${API}/produtores/${produtorId}/nfe/destinatarios`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(novoDestForm),
    });
    const data = await res.json();
    const dests = await fetch(`${API}/produtores/${produtorId}/nfe/destinatarios`).then(r => r.json());
    setDestinatarios(dests);
    setDestSelecionado(data.id);
    setShowNovoDestinatario(false);
    setSalvando(false);
  }

  function adicionarItem(prod?: Produto) {
    if (prod) {
      setItens([...itens, {
        produto_id: prod.id,
        descricao: prod.descricao,
        ncm: prod.ncm,
        cfop: prod.cfop,
        unidade: prod.unidade,
        quantidade: 1,
        valor_unitario: prod.preco_unitario || 0,
        valor_desconto: 0,
      }]);
    } else {
      setItens([...itens, { descricao: "", ncm: "", cfop: "5101", unidade: "KG", quantidade: 1, valor_unitario: 0, valor_desconto: 0 }]);
    }
  }

  function removerItem(i: number) {
    setItens((Array.isArray(itens) ? itens : []).filter((_, idx) => idx !== i));
  }

  function atualizarItem(i: number, campo: string, valor: any) {
    setItens(itens.map((item, idx) => idx === i ? { ...item, [campo]: valor } : item));
  }

  const totalProdutos = itens.reduce((s, item) => s + (item.quantidade * item.valor_unitario - item.valor_desconto), 0);
  const totalFunrural = totalProdutos * aliqFunrural / 100;
  const totalSenar = totalProdutos * aliqSenar / 100;

  async function emitirNota() {
    if (!destSelecionado || itens.length === 0) return;
    setSalvando(true);
    try {
      const res = await fetch(`${API}/produtores/${produtorId}/nfe/notas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          destinatario_id: destSelecionado,
          natureza_operacao: natureza,
          cfop: "5101",
          aliquota_funrural: aliqFunrural,
          aliquota_senar: aliqSenar,
          informacoes_adicionais: infoAdicionais || null,
          itens: itens.map(item => ({
            produto_id: item.produto_id || null,
            descricao: item.descricao,
            ncm: item.ncm,
            cfop: item.cfop,
            unidade: item.unidade,
            quantidade: parseFloat(String(item.quantidade)),
            valor_unitario: parseFloat(String(item.valor_unitario)),
            valor_desconto: parseFloat(String(item.valor_desconto)),
          })),
        }),
      });
      const data = await res.json();
      setNotaEmitida(data);
      setStep(4);
      // Atualiza lista de notas
      fetch(`${API}/produtores/${produtorId}/nfe/notas`).then(r => r.json()).then(setNotas);
    } catch (e) {
      alert("Erro ao emitir nota");
    } finally {
      setSalvando(false);
    }
  }

  async function baixarPdf(notaId: number, numero: number) {
    setBaixandoPdf(true);
    try {
      const res = await fetch(`${API}/nfe/notas/${notaId}/pdf`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `nfe_${String(numero).padStart(6, "0")}.pdf`;
      a.click();
    } finally {
      setBaixandoPdf(false);
    }
  }

  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-gray-400 text-sm">Carregando...</div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 max-w-md mx-auto pb-10">

      {/* Header */}
      <div className="bg-green-800 text-white px-4 py-4">
        <a href={`/contador?produtor_id=${produtorId}`} className="text-xs opacity-70">← Voltar</a>
        <div className="text-lg font-medium mt-1">NF-e Produtor Rural</div>
        <div className="text-xs opacity-70">{config?.produtor?.nome}</div>
      </div>

      <div className="p-4 space-y-4">

        {/* Abas */}
        <div className="flex gap-2">
          {[{ id: "emitir", label: "Emitir NF-e" }, { id: "historico", label: `Historico (${notas.length})` }].map(a => (
            <button key={a.id} onClick={() => { setAba(a.id as any); setStep(1); setNotaEmitida(null); }}
              className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors ${
                aba === a.id ? "bg-green-800 text-white" : "bg-white text-gray-600 border border-gray-200"
              }`}>
              {a.label}
            </button>
          ))}
        </div>

        {/* ── ABA: EMITIR ── */}
        {aba === "emitir" && (
          <>
            <StepIndicator step={step} current={step} />

            {/* Step 1: Dados fiscais */}
            {step === 1 && (
              <div className="bg-white rounded-xl p-4 shadow-sm space-y-3">
                <div className="text-sm font-semibold text-gray-800">Dados Fiscais do Emitente</div>
                <p className="text-xs text-gray-400">Esses dados aparecem no cabeçalho da NF-e.</p>

                {[
                  { label: "Inscrição Estadual (IE)", value: ie, set: setIe, placeholder: "Ex: 123456789" },
                  { label: "CAEPF", value: caepf, set: setCaepf, placeholder: "Ex: 123.456.789-0001-00" },
                  { label: "Município", value: municipio, set: setMunicipio, placeholder: "Ex: Sao Luis" },
                  { label: "Endereço", value: endereco, set: setEndereco, placeholder: "Ex: Sitio Boa Esperanca" },
                  { label: "Número", value: numero, set: setNumero, placeholder: "S/N" },
                  { label: "Bairro/Zona", value: bairro, set: setBairro, placeholder: "Ex: Zona Rural" },
                  { label: "CEP", value: cep, set: setCep, placeholder: "Ex: 65000-000" },
                ].map(f => (
                  <div key={f.label}>
                    <label className="text-xs text-gray-500">{f.label}</label>
                    <input value={f.value} onChange={e => f.set(e.target.value)}
                      placeholder={f.placeholder}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 mt-1 text-sm" />
                  </div>
                ))}

                <div>
                  <label className="text-xs text-gray-500">UF</label>
                  <select value={uf} onChange={e => setUf(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 mt-1 text-sm">
                    {["MA","PA","TO","PI","CE","RN","PB","PE","AL","SE","BA","MG","ES","RJ","SP","PR","SC","RS","MS","MT","GO","DF","AC","AM","RR","AP","RO"].map(u => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                  </select>
                </div>

                <button onClick={salvarConfig} disabled={salvando}
                  className="w-full py-3 rounded-xl text-sm font-medium text-white bg-green-800 disabled:bg-gray-400">
                  {salvando ? "Salvando..." : "Salvar e continuar →"}
                </button>
              </div>
            )}

            {/* Step 2: Destinatário */}
            {step === 2 && (
              <div className="space-y-3">
                <div className="bg-white rounded-xl p-4 shadow-sm space-y-3">
                  <div className="text-sm font-semibold text-gray-800">Selecionar Destinatário</div>

                  {destinatarios.length === 0 ? (
                    <div className="text-center text-gray-400 py-4 text-sm">Nenhum destinatário cadastrado</div>
                  ) : (
                    destinatarios.map(d => (
                      <button key={d.id} onClick={() => setDestSelecionado(d.id)}
                        className={`w-full text-left p-3 rounded-xl border-2 transition-colors ${
                          destSelecionado === d.id ? "border-green-600 bg-green-50" : "border-gray-200 bg-gray-50"
                        }`}>
                        <div className="text-sm font-medium">{d.razao_social}</div>
                        <div className="text-xs text-gray-400">{d.tipo_doc === "J" ? "CNPJ" : "CPF"}: {d.documento} · {d.municipio}-{d.uf}</div>
                      </button>
                    ))
                  )}

                  {!showNovoDestinatario ? (
                    <button onClick={() => setShowNovoDestinatario(true)}
                      className="w-full py-2 rounded-xl border border-dashed border-gray-300 text-sm text-gray-500">
                      + Novo destinatário
                    </button>
                  ) : (
                    <div className="border border-gray-200 rounded-xl p-3 space-y-2">
                      <div className="text-xs font-medium text-gray-600">Novo Destinatário</div>
                      <div className="flex gap-2">
                        {[{v:"J",l:"CNPJ"},{v:"F",l:"CPF"}].map(t => (
                          <button key={t.v} onClick={() => setNovoDestForm({...novoDestForm, tipo_doc: t.v})}
                            className={`flex-1 py-1.5 rounded-lg text-xs font-medium ${novoDestForm.tipo_doc === t.v ? "bg-green-800 text-white" : "bg-gray-100 text-gray-600"}`}>
                            {t.l}
                          </button>
                        ))}
                      </div>
                      {[
                        { label: novoDestForm.tipo_doc === "J" ? "CNPJ *" : "CPF *", field: "documento", placeholder: novoDestForm.tipo_doc === "J" ? "00.000.000/0001-00" : "000.000.000-00" },
                        { label: novoDestForm.tipo_doc === "J" ? "Razão Social *" : "Nome *", field: "razao_social", placeholder: "Nome completo" },
                        { label: "IE", field: "ie", placeholder: "Inscrição Estadual" },
                        { label: "Município", field: "municipio", placeholder: "Cidade" },
                        { label: "Endereço", field: "endereco", placeholder: "Rua/Av" },
                        { label: "Número", field: "numero", placeholder: "100" },
                        { label: "CEP", field: "cep", placeholder: "00000-000" },
                      ].map(f => (
                        <div key={f.field}>
                          <label className="text-xs text-gray-500">{f.label}</label>
                          <input value={(novoDestForm as any)[f.field]}
                            onChange={e => setNovoDestForm({...novoDestForm, [f.field]: e.target.value})}
                            placeholder={f.placeholder}
                            className="w-full border border-gray-200 rounded-lg px-3 py-2 mt-0.5 text-xs" />
                        </div>
                      ))}
                      <div>
                        <label className="text-xs text-gray-500">UF</label>
                        <select value={novoDestForm.uf} onChange={e => setNovoDestForm({...novoDestForm, uf: e.target.value})}
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 mt-0.5 text-xs">
                          {["MA","PA","TO","PI","CE","RN","PB","PE","AL","SE","BA","MG","ES","RJ","SP","PR","SC","RS","MS","MT","GO","DF"].map(u => (
                            <option key={u} value={u}>{u}</option>
                          ))}
                        </select>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => setShowNovoDestinatario(false)} className="flex-1 py-2 rounded-lg text-xs border border-gray-200">Cancelar</button>
                        <button onClick={adicionarDestinatario} disabled={salvando}
                          className="flex-1 py-2 rounded-lg text-xs font-medium text-white bg-green-800">
                          {salvando ? "..." : "Adicionar"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex gap-2">
                  <button onClick={() => setStep(1)} className="flex-1 py-3 rounded-xl text-sm border border-gray-200">← Voltar</button>
                  <button onClick={() => destSelecionado && setStep(3)} disabled={!destSelecionado}
                    className="flex-1 py-3 rounded-xl text-sm font-medium text-white bg-green-800 disabled:bg-gray-400">
                    Continuar →
                  </button>
                </div>
              </div>
            )}

            {/* Step 3: Itens */}
            {step === 3 && (
              <div className="space-y-3">
                <div className="bg-white rounded-xl p-4 shadow-sm space-y-3">
                  <div className="text-sm font-semibold text-gray-800">Itens da Nota</div>

                  {/* Produtos rápidos */}
                  <div>
                    <div className="text-xs text-gray-500 mb-2">Adicionar produto cadastrado:</div>
                    <div className="flex flex-wrap gap-2">
                      {produtos.map(p => (
                        <button key={p.id} onClick={() => adicionarItem(p)}
                          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-green-50 text-green-800 border border-green-200 hover:bg-green-100">
                          + {p.descricao}
                        </button>
                      ))}
                      <button onClick={() => adicionarItem()}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-50 text-gray-600 border border-gray-200">
                        + Item avulso
                      </button>
                    </div>
                  </div>

                  {/* Lista de itens */}
                  {itens.length === 0 ? (
                    <div className="text-center text-gray-400 py-4 text-sm">Nenhum item adicionado</div>
                  ) : (
                    itens.map((item, i) => (
                      <div key={i} className="border border-gray-200 rounded-xl p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-gray-600">Item {i + 1}</span>
                          <button onClick={() => removerItem(i)} className="text-red-400 text-xs">✕ remover</button>
                        </div>
                        <input value={item.descricao} onChange={e => atualizarItem(i, "descricao", e.target.value)}
                          placeholder="Descrição *"
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                        <div className="grid grid-cols-3 gap-2">
                          <div>
                            <label className="text-xs text-gray-400">Qtd</label>
                            <input type="number" value={item.quantidade} onChange={e => atualizarItem(i, "quantidade", e.target.value)}
                              className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm mt-0.5" />
                          </div>
                          <div>
                            <label className="text-xs text-gray-400">Vl Unit (R$)</label>
                            <input type="number" value={item.valor_unitario} onChange={e => atualizarItem(i, "valor_unitario", e.target.value)}
                              className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm mt-0.5" />
                          </div>
                          <div>
                            <label className="text-xs text-gray-400">UN</label>
                            <input value={item.unidade} onChange={e => atualizarItem(i, "unidade", e.target.value)}
                              className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm mt-0.5" />
                          </div>
                        </div>
                        <div className="text-right text-xs font-semibold text-green-700">
                          {fmt(item.quantidade * item.valor_unitario - item.valor_desconto)}
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* Impostos */}
                {itens.length > 0 && (
                  <div className="bg-white rounded-xl p-4 shadow-sm space-y-3">
                    <div className="text-sm font-semibold text-gray-800">Impostos Rurais</div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs text-gray-500">FUNRURAL (%)</label>
                        <input type="number" step="0.01" value={aliqFunrural} onChange={e => setAliqFunrural(parseFloat(e.target.value))}
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 mt-1 text-sm" />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500">SENAR (%)</label>
                        <input type="number" step="0.01" value={aliqSenar} onChange={e => setAliqSenar(parseFloat(e.target.value))}
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 mt-1 text-sm" />
                      </div>
                    </div>
                    <div className="bg-gray-50 rounded-xl p-3 space-y-1 text-xs">
                      <div className="flex justify-between"><span className="text-gray-500">Valor produtos</span><span className="font-medium">{fmt(totalProdutos)}</span></div>
                      <div className="flex justify-between"><span className="text-gray-500">FUNRURAL ({aliqFunrural}%)</span><span className="text-amber-600">{fmt(totalFunrural)}</span></div>
                      <div className="flex justify-between"><span className="text-gray-500">SENAR ({aliqSenar}%)</span><span className="text-amber-600">{fmt(totalSenar)}</span></div>
                      <div className="flex justify-between border-t border-gray-200 pt-1 mt-1">
                        <span className="font-semibold">Total da nota</span>
                        <span className="font-bold text-green-700 text-sm">{fmt(totalProdutos)}</span>
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">Informações adicionais</label>
                      <textarea value={infoAdicionais} onChange={e => setInfoAdicionais(e.target.value)}
                        rows={2} placeholder="Opcional..."
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 mt-1 text-sm resize-none" />
                    </div>
                  </div>
                )}

                <div className="flex gap-2">
                  <button onClick={() => setStep(2)} className="flex-1 py-3 rounded-xl text-sm border border-gray-200">← Voltar</button>
                  <button onClick={emitirNota} disabled={salvando || itens.length === 0}
                    className="flex-1 py-3 rounded-xl text-sm font-medium text-white bg-green-800 disabled:bg-gray-400">
                    {salvando ? "Emitindo..." : "Emitir NF-e →"}
                  </button>
                </div>
              </div>
            )}

            {/* Step 4: Sucesso */}
            {step === 4 && notaEmitida && (
              <div className="space-y-4">
                <div className="bg-green-50 border border-green-200 rounded-2xl p-6 text-center space-y-2">
                  <div className="text-4xl">✅</div>
                  <div className="text-lg font-bold text-green-800">NF-e Emitida!</div>
                  <div className="text-3xl font-bold text-green-700">
                    N° {String(notaEmitida.numero).padStart(6, "0")}
                  </div>
                  <div className="text-sm text-gray-600">Série 001 — Homologação</div>
                </div>

                <div className="bg-white rounded-xl p-4 shadow-sm space-y-2">
                  {[
                    ["Valor dos produtos", fmt(notaEmitida.valor_total)],
                    ["FUNRURAL", fmt(notaEmitida.valor_funrural)],
                    ["SENAR", fmt(notaEmitida.valor_senar)],
                    ["Total da nota", fmt(notaEmitida.valor_total)],
                  ].map(([l, v], i) => (
                    <div key={i} className={`flex justify-between text-sm ${i === 3 ? "border-t border-gray-100 pt-2 font-semibold" : ""}`}>
                      <span className="text-gray-500">{l}</span>
                      <span className={i === 3 ? "text-green-700" : ""}>{v}</span>
                    </div>
                  ))}
                </div>

                <button onClick={() => baixarPdf(notaEmitida.id, notaEmitida.numero)} disabled={baixandoPdf}
                  className="w-full py-3 rounded-xl text-sm font-medium text-white bg-green-800 disabled:bg-gray-400 flex items-center justify-center gap-2">
                  {baixandoPdf ? "Gerando PDF..." : "📄 Baixar DANFE PDF"}
                </button>

                <button onClick={() => { setStep(1); setItens([]); setDestSelecionado(null); setNotaEmitida(null); }}
                  className="w-full py-3 rounded-xl text-sm border border-gray-200 text-gray-600">
                  + Emitir nova NF-e
                </button>
              </div>
            )}
          </>
        )}

        {/* ── ABA: HISTÓRICO ── */}
        {aba === "historico" && (
          <div className="space-y-3">
            {notas.length === 0 ? (
              <div className="text-center text-gray-400 py-12 text-sm">Nenhuma NF-e emitida ainda</div>
            ) : (
              notas.map(n => (
                <div key={n.id} className="bg-white rounded-xl p-4 shadow-sm">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="text-sm font-semibold text-gray-800">
                        NF-e N° {String(n.numero).padStart(6, "0")}
                      </div>
                      <div className="text-xs text-gray-400 mt-0.5">{n.destinatario_nome}</div>
                      <div className="text-xs text-gray-400">{new Date(n.data_emissao).toLocaleDateString("pt-BR")}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-bold text-green-700">{fmt(n.valor_total)}</div>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        n.status === "emitida" ? "bg-green-100 text-green-700" :
                        n.status === "cancelada" ? "bg-red-100 text-red-600" :
                        "bg-gray-100 text-gray-500"
                      }`}>
                        {n.status}
                      </span>
                    </div>
                  </div>
                  <button onClick={() => baixarPdf(n.id, n.numero)} disabled={baixandoPdf}
                    className="w-full mt-3 py-2 rounded-lg text-xs font-medium border border-gray-200 text-gray-600 hover:bg-gray-50">
                    📄 Baixar DANFE
                  </button>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function NfePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-50 flex items-center justify-center"><div className="text-gray-400">Carregando...</div></div>}>
      <NFeContent />
    </Suspense>
  );
}
