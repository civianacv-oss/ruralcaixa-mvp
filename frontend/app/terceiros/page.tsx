"use client";
import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";

const API = "https://ruralcaixa-mvp-production.up.railway.app";

const TIPOS_EXPLORACAO = [
  { id: 1, label: "Exploração individual" },
  { id: 2, label: "Condomínio" },
  { id: 3, label: "Imóvel arrendado" },
  { id: 4, label: "Parceria" },
  { id: 5, label: "Comodato" },
  { id: 6, label: "Outros" },
];

const LABEL_ADICIONAR: Record<number, string> = {
  2: "condomino", 3: "arrendador", 4: "parceiro", 5: "comodante", 6: "participante",
};

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function TerceirosContent() {
  const searchParams = useSearchParams();
  const imovelId = parseInt(searchParams.get("imovel_id") || "0");
  const produtorId = searchParams.get("produtor_id");

  const [imovel, setImovel] = useState<any>(null);
  const [terceiros, setTerceiros] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [recalculando, setRecalculando] = useState(false);
  const [tipoExploracao, setTipoExploracao] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [abaCalculo, setAbaCalculo] = useState<"manual" | "formula">("manual");
  const [editando, setEditando] = useState<number | null>(null);
  const [editValues, setEditValues] = useState<any>({});

  const [areaDeclarante, setAreaDeclarante] = useState("");
  const [invDeclarante, setInvDeclarante] = useState("");
  const [alfa, setAlfa] = useState(50);

  const [novo, setNovo] = useState({
    tipo_contraparte: "Condomino",
    id_contraparte: "",
    nome_contraparte: "",
    perc_contraparte: "",
    area_ha: "",
    investimento: "",
  });

  useEffect(() => {
    if (!imovelId) return;
    fetch(`${API}/imoveis/${imovelId}/terceiros`)
      .then(r => r.json())
      .then(terc => { setTerceiros(terc); setLoading(false); })
      .catch(() => setLoading(false));

    if (produtorId) {
      fetch(`${API}/produtores`)
        .then(r => r.json())
        .then(prods => {
          const p = prods.find((x: any) => x.id === parseInt(produtorId!));
          if (!p) return;
          fetch(`${API}/produtor/imoveis?cpf=${p.cpf?.replace(/\D/g,"")}`)
            .then(r => r.json())
            .then(imoveis => {
              const im = imoveis.find((x: any) => x.id === imovelId);
              if (im) {
                setImovel({...im, nome_produtor: p.nome});
                setTipoExploracao(im.tipo_exploracao || 1);
                setAreaDeclarante(String(im.area_declarante || im.area_ha || ""));
                setInvDeclarante(String(im.investimento_declarante || ""));
                if (im.alfa) setAlfa(Math.round(im.alfa * 100));
              }
            });
        });
    }
  }, [imovelId, produtorId]);

  async function buscarProdutor(cpf: string) {
    const cpfLimpo = cpf.replace(/\D/g, "");
    if (cpfLimpo.length === 11) {
      try {
        const res = await fetch(`${API}/produtores`);
        const prods = await res.json();
        const found = prods.find((p: any) => p.cpf.replace(/\D/g, "") === cpfLimpo);
        if (found) setNovo(n => ({ ...n, nome_contraparte: found.nome }));
      } catch {}
    }
  }

  async function salvarTipoExploracao() {
    setSalvando(true);
    const minhaParticipacao = Math.max(0, 100 - totalPercManual);
    try {
      await fetch(`${API}/imoveis/${imovelId}/tipo-exploracao?tipo=${tipoExploracao}&participacao=${minhaParticipacao}`, { method: "PUT" });
      alert("Salvo!");
    } catch { alert("Erro ao salvar"); }
    finally { setSalvando(false); }
  }

  async function recalcularFormula() {
    setRecalculando(true);
    try {
      const res = await fetch(
        `${API}/imoveis/${imovelId}/recalcular-participacoes?alfa=${alfa/100}&beta=${(100-alfa)/100}`,
        { method: "POST" }
      );
      const data = await res.json();
      const terc = await fetch(`${API}/imoveis/${imovelId}/terceiros`).then(r => r.json());
      setTerceiros(terc);
      alert(`Recalculado!\nSua participacao: ${data.declarante}%\nArea total: ${data.area_total} ha\nInvestimento total: ${fmt(data.inv_total)}`);
    } catch { alert("Erro ao recalcular"); }
    finally { setRecalculando(false); }
  }

  async function adicionarTerceiro() {
    if (!novo.id_contraparte || !novo.nome_contraparte) return alert("Preencha CPF e nome");
    if (abaCalculo === "manual" && !novo.perc_contraparte) return alert("Preencha a participacao");

    setSalvando(true);
    try {
      const body: any = {
        imovel_id: imovelId,
        tipo_contraparte: novo.tipo_contraparte,
        id_contraparte: novo.id_contraparte.replace(/\D/g, ""),
        nome_contraparte: novo.nome_contraparte,
        perc_contraparte: abaCalculo === "manual" ? parseFloat(novo.perc_contraparte) : 0,
      };
      if (novo.area_ha) body.area_ha = parseFloat(novo.area_ha);
      if (novo.investimento) body.investimento = parseFloat(novo.investimento);

      const res = await fetch(`${API}/imoveis/${imovelId}/terceiros`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      setTerceiros([...terceiros, { id: data.id, ...body }]);
      setNovo({ tipo_contraparte: "Condomino", id_contraparte: "", nome_contraparte: "", perc_contraparte: "", area_ha: "", investimento: "" });
      setShowForm(false);
    } catch { alert("Erro ao adicionar"); }
    finally { setSalvando(false); }
  }

  async function salvarEdicao(id: number) {
    try {
      await fetch(`${API}/terceiros/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          perc_contraparte: parseFloat(editValues.perc || 0),
          area_ha: parseFloat(editValues.area || 0),
          investimento: parseFloat(editValues.inv || 0),
        }),
      });
      setTerceiros(terceiros.map(x => x.id === id ? {
        ...x,
        perc_contraparte: parseFloat(editValues.perc || 0),
        area_ha: parseFloat(editValues.area || 0),
        investimento: parseFloat(editValues.inv || 0),
      } : x));
      setEditando(null);
    } catch { alert("Erro ao salvar"); }
  }

  async function excluirTerceiro(id: number) {
    if (!confirm("Excluir este participante?")) return;
    await fetch(`${API}/terceiros/${id}`, { method: "DELETE" });
    setTerceiros(terceiros.filter(t => t.id !== id));
  }

  const totalPercManual = terceiros.reduce((s, t) => s + parseFloat(t.perc_contraparte || 0), 0);
  const minhaParticipacao = Math.max(0, 100 - totalPercManual);
  const totalOk = Math.abs(totalPercManual + minhaParticipacao - 100) < 0.01;

  const areaTotal = parseFloat(areaDeclarante || "0") + terceiros.reduce((s, t) => s + parseFloat(t.area_ha || 0), 0);
  const invTotal = parseFloat(invDeclarante || "0") + terceiros.reduce((s, t) => s + parseFloat(t.investimento || 0), 0);

  const calcParticipacao = (area: number, inv: number) => {
    const cTerra = areaTotal > 0 ? area / areaTotal : 0;
    const cInv = invTotal > 0 ? inv / invTotal : 0;
    return ((alfa / 100) * cTerra + ((100 - alfa) / 100) * cInv) * 100;
  };

  if (loading) return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><div className="text-gray-400">Carregando...</div></div>;

  return (
    <div className="min-h-screen bg-gray-50 max-w-md mx-auto pb-10">
      <div className="bg-green-800 text-white px-4 py-4">
        <a href={`/cadastro?produtor_id=${produtorId}`} className="text-xs opacity-70">← Voltar</a>
        <div className="text-lg font-medium mt-1">Parceiros / Condominios</div>
        <div className="text-xs opacity-70">{imovel?.nome || `Imovel #${imovelId}`}</div>
      </div>

      <div className="p-4 space-y-4">

        <div className="bg-white rounded-xl p-4 shadow-sm space-y-3">
          <div className="text-sm font-medium text-gray-700">Tipo de exploracao</div>
          <select className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" value={tipoExploracao} onChange={e => setTipoExploracao(parseInt(e.target.value))}>
            {TIPOS_EXPLORACAO.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
          <div>
            <label className="text-xs text-gray-500">Sua participacao (%)</label>
            <div className={`w-full border rounded-lg px-3 py-2 mt-1 text-sm font-medium ${totalOk ? "border-green-300 bg-green-50 text-green-700" : "border-orange-300 bg-orange-50 text-orange-700"}`}>
              {minhaParticipacao.toFixed(1)}%
            </div>
          </div>
          <button onClick={salvarTipoExploracao} disabled={salvando} className="w-full py-2 rounded-lg text-sm font-medium text-white bg-green-800 disabled:bg-gray-400">
            {salvando ? "Salvando..." : "Salvar"}
          </button>
        </div>

        {tipoExploracao > 1 && (
          <>
            <div className="bg-white rounded-xl p-4 shadow-sm space-y-3">
              <div className="text-sm font-medium text-gray-700">Metodo de participacao</div>
              <div className="flex gap-2">
                <button onClick={() => setAbaCalculo("manual")} className={`flex-1 py-2 rounded-lg text-xs font-medium ${abaCalculo === "manual" ? "bg-green-800 text-white" : "bg-gray-100 text-gray-600"}`}>
                  Manual (%)
                </button>
                <button onClick={() => setAbaCalculo("formula")} className={`flex-1 py-2 rounded-lg text-xs font-medium ${abaCalculo === "formula" ? "bg-green-800 text-white" : "bg-gray-100 text-gray-600"}`}>
                  Formula (Terra + Capital)
                </button>
              </div>

              {abaCalculo === "formula" && (
                <div className="space-y-3">
                  <div className="text-xs text-gray-500 bg-gray-50 rounded-lg p-3">
                    <div className="font-medium mb-1">P = alfa x (Area/AreaTotal) + beta x (Inv/InvTotal)</div>
                    <div>com alfa + beta = 1</div>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">Peso Terra (alfa) = {alfa}% | Peso Capital (beta) = {100-alfa}%</label>
                    <input type="range" min="0" max="100" step="5" value={alfa} onChange={e => setAlfa(parseInt(e.target.value))} className="w-full mt-1" />
                    <div className="flex justify-between text-xs text-gray-400 mt-1">
                      <span>100% Terra</span><span>50/50</span><span>100% Capital</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-gray-500">Sua area (ha)</label>
                      <input type="number" className="w-full border border-gray-200 rounded-lg px-3 py-2 mt-1 text-sm" value={areaDeclarante} onChange={e => setAreaDeclarante(e.target.value)} />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">Seu investimento (R$)</label>
                      <input type="number" className="w-full border border-gray-200 rounded-lg px-3 py-2 mt-1 text-sm" value={invDeclarante} onChange={e => setInvDeclarante(e.target.value)} />
                    </div>
                  </div>
                  {(parseFloat(areaDeclarante) > 0 || parseFloat(invDeclarante) > 0) && (
                    <div className="bg-green-50 rounded-lg p-3 text-xs space-y-1">
                      <div className="font-medium text-green-800">Preview:</div>
                      <div className="flex justify-between">
                        <span>Voce:</span>
                        <span className="font-medium">{calcParticipacao(parseFloat(areaDeclarante||"0"), parseFloat(invDeclarante||"0")).toFixed(1)}%</span>
                      </div>
                      {terceiros.map(t => (
                        <div key={t.id} className="flex justify-between">
                          <span>{t.nome_contraparte}:</span>
                          <span className="font-medium">{calcParticipacao(parseFloat(t.area_ha||"0"), parseFloat(t.investimento||"0")).toFixed(1)}%</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <button onClick={recalcularFormula} disabled={recalculando} className="w-full py-2 rounded-lg text-sm font-medium text-white bg-blue-700 disabled:bg-gray-400">
                    {recalculando ? "Recalculando..." : "Recalcular participacoes"}
                  </button>
                </div>
              )}
            </div>

            <div className="bg-white rounded-xl p-4 shadow-sm space-y-3">
              <div className="flex justify-between items-center">
                <div className="text-sm font-medium text-gray-700">{TIPOS_EXPLORACAO.find(t => t.id === tipoExploracao)?.label}</div>
                <div className={`text-xs font-medium ${totalOk ? "text-green-600" : "text-orange-500"}`}>
                  Total: {(totalPercManual + minhaParticipacao).toFixed(1)}%
                </div>
              </div>

              <div className="flex items-start justify-between py-2 border-b bg-green-50 rounded-lg px-2">
                <div>
                  <div className="text-sm font-medium text-green-800">{imovel?.nome_produtor || "Voce (declarante)"}</div>
                  <div className="text-xs text-green-700 font-medium">{minhaParticipacao.toFixed(1)}%</div>
                  {areaDeclarante && <div className="text-xs text-gray-500">{areaDeclarante} ha</div>}
                  {invDeclarante && <div className="text-xs text-gray-500">{fmt(parseFloat(invDeclarante))}</div>}
                </div>
              </div>

              {terceiros.length === 0 ? (
                <div className="text-center text-gray-400 py-2 text-sm">Nenhum participante</div>
              ) : (
                terceiros.map(t => (
                  <div key={t.id} className="py-3 border-b last:border-0">
                    {editando === t.id ? (
                      <div className="space-y-2">
                        <div className="text-sm font-medium">{t.nome_contraparte}</div>
                        <div className="grid grid-cols-3 gap-2">
                          <div>
                            <label className="text-xs text-gray-500">% part.</label>
                            <input type="number" className="w-full border rounded px-2 py-1 text-sm"
                              value={editValues.perc ?? t.perc_contraparte}
                              onChange={e => setEditValues({...editValues, perc: e.target.value})} />
                          </div>
                          <div>
                            <label className="text-xs text-gray-500">Area (ha)</label>
                            <input type="number" className="w-full border rounded px-2 py-1 text-sm"
                              value={editValues.area ?? (t.area_ha || "")}
                              onChange={e => setEditValues({...editValues, area: e.target.value})} />
                          </div>
                          <div>
                            <label className="text-xs text-gray-500">Inv. (R$)</label>
                            <input type="number" className="w-full border rounded px-2 py-1 text-sm"
                              value={editValues.inv ?? (t.investimento || "")}
                              onChange={e => setEditValues({...editValues, inv: e.target.value})} />
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => setEditando(null)} className="flex-1 py-1 rounded text-xs border border-gray-200">Cancelar</button>
                          <button onClick={() => salvarEdicao(t.id)} className="flex-1 py-1 rounded text-xs font-medium text-white bg-green-800">Salvar</button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="text-sm font-medium">{t.nome_contraparte}</div>
                          <div className="text-xs text-gray-400">{t.tipo_contraparte} · {t.id_contraparte}</div>
                          <div className="text-xs text-green-700 font-medium">{parseFloat(t.perc_contraparte).toFixed(1)}%</div>
                          {t.area_ha > 0 && <div className="text-xs text-gray-500">{t.area_ha} ha</div>}
                          {t.investimento > 0 && <div className="text-xs text-gray-500">{fmt(t.investimento)}</div>}
                        </div>
                        <div className="flex gap-2 ml-2 mt-1">
                          <button onClick={() => { setEditando(t.id); setEditValues({ perc: t.perc_contraparte, area: t.area_ha || "", inv: t.investimento || "" }); }}
                            className="text-blue-500 text-xs border border-blue-300 rounded px-1 hover:bg-blue-50">editar</button>
                          <button onClick={() => excluirTerceiro(t.id)} className="text-red-400 text-xs border border-red-300 rounded px-1 hover:bg-red-50">excluir</button>
                        </div>
                      </div>
                    )}
                  </div>
                ))
              )}

              {!showForm ? (
                <button onClick={() => setShowForm(true)} className="w-full py-2 rounded-lg border border-dashed border-gray-300 text-sm text-gray-500">
                  + Adicionar {LABEL_ADICIONAR[tipoExploracao] || "participante"}
                </button>
              ) : (
                <div className="space-y-3 border border-gray-200 rounded-lg p-3">
                  <div className="text-xs font-medium text-gray-600">Novo {LABEL_ADICIONAR[tipoExploracao] || "participante"}</div>
                  <div>
                    <label className="text-xs text-gray-500">CPF/CNPJ *</label>
                    <input className="w-full border border-gray-200 rounded-lg px-3 py-2 mt-1 text-sm" placeholder="000.000.000-00"
                      value={novo.id_contraparte}
                      onChange={async e => { setNovo({...novo, id_contraparte: e.target.value}); await buscarProdutor(e.target.value); }} />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">Nome *</label>
                    <input className="w-full border border-gray-200 rounded-lg px-3 py-2 mt-1 text-sm" placeholder="Nome completo"
                      value={novo.nome_contraparte} onChange={e => setNovo({...novo, nome_contraparte: e.target.value})} />
                  </div>
                  {abaCalculo === "manual" ? (
                    <div>
                      <label className="text-xs text-gray-500">Participacao (%) *</label>
                      <input type="number" min="0.01" max={100 - totalPercManual} step="0.01"
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 mt-1 text-sm"
                        value={novo.perc_contraparte} onChange={e => setNovo({...novo, perc_contraparte: e.target.value})} />
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs text-gray-500">Area (ha)</label>
                        <input type="number" className="w-full border border-gray-200 rounded-lg px-3 py-2 mt-1 text-sm"
                          value={novo.area_ha} onChange={e => setNovo({...novo, area_ha: e.target.value})} />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500">Investimento (R$)</label>
                        <input type="number" className="w-full border border-gray-200 rounded-lg px-3 py-2 mt-1 text-sm"
                          value={novo.investimento} onChange={e => setNovo({...novo, investimento: e.target.value})} />
                      </div>
                    </div>
                  )}
                  <div className="flex gap-2">
                    <button onClick={() => setShowForm(false)} className="flex-1 py-2 rounded-lg text-sm border border-gray-200">Cancelar</button>
                    <button onClick={adicionarTerceiro} disabled={salvando} className="flex-1 py-2 rounded-lg text-sm font-medium text-white bg-green-800 disabled:bg-gray-400">
                      {salvando ? "Salvando..." : "Adicionar"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        <div className="bg-blue-50 rounded-xl p-4 text-xs text-blue-700 space-y-1">
          <div className="font-medium">Registro 0045 - LCDPR</div>
          <div>Pi = alfa x (Area/AreaTotal) + beta x (Inv/InvTotal), com alfa + beta = 1</div>
          <div className="font-medium mt-1">Sua participacao: {minhaParticipacao.toFixed(1)}%</div>
          {!totalOk && <div className="text-orange-600 font-medium">Total diferente de 100%</div>}
        </div>

        <a href={`/cadastro?produtor_id=${produtorId}`} className="block w-full py-3 rounded-xl text-sm font-medium text-white bg-green-800 text-center">
          Voltar ao cadastro
        </a>
      </div>
    </div>
  );
}

export default function Terceiros() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-50 flex items-center justify-center"><div className="text-gray-400">Carregando...</div></div>}>
      <TerceirosContent />
    </Suspense>
  );
}
