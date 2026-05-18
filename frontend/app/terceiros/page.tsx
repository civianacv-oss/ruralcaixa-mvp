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
  2: "condômino", 3: "arrendador", 4: "parceiro", 5: "comodante", 6: "participante",
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

  // Dados do declarante para fórmula
  const [areaDeclarante, setAreaDeclarante] = useState("");
  const [invDeclarante, setInvDeclarante] = useState("");
  const [alfa, setAlfa] = useState(50); // % — alfa + beta = 100

  const [novo, setNovo] = useState({
    tipo_contraparte: "Condômino",
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
      // Primeiro salvar área e investimento do declarante
      await fetch(`${API}/imoveis/${imovelId}/tipo-exploracao?tipo=${tipoExploracao}&participacao=0`, { method: "PUT" });
      
      const res = await fetch(
        `${API}/imoveis/${imovelId}/recalcular-participacoes?alfa=${alfa/100}&beta=${(100-alfa)/100}`,
        { method: "POST" }
      );
      const data = await res.json();
      
      // Recarregar terceiros
      const terc = await fetch(`${API}/imoveis/${imovelId}/terceiros`).then(r => r.json());
      setTerceiros(terc);
      
      alert(`Recalculado!\nSua participação: ${data.declarante}%\nÁrea total: ${data.area_total} ha\nInvestimento total: ${fmt(data.inv_total)}`);
    } catch { alert("Erro ao recalcular"); }
    finally { setRecalculando(false); }
  }

  async function adicionarTerceiro() {
    if (!novo.id_contraparte || !novo.nome_contraparte) return alert("Preencha CPF e nome");
    if (abaCalculo === "manual" && !novo.perc_contraparte) return alert("Preencha a participação");
    if (abaCalculo === "formula" && !novo.area_ha && !novo.investimento) return alert("Preencha área ou investimento");

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
      if (novo.investimento) body.investimento = parseFloat(novo.investimento.replace(/\D/g,""));

      const res = await fetch(`${API}/imoveis/${imovelId}/terceiros`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      setTerceiros([...terceiros, { id: data.id, ...body }]);
      setNovo({ tipo_contraparte: "Condômino", id_contraparte: "", nome_contraparte: "", perc_contraparte: "", area_ha: "", investimento: "" });
      setShowForm(false);
    } catch { alert("Erro ao adicionar"); }
    finally { setSalvando(false); }
  }

  async function excluirTerceiro(id: number) {
    if (!confirm("Excluir este participante?")) return;
    await fetch(`${API}/terceiros/${id}`, { method: "DELETE" });
    setTerceiros(terceiros.filter(t => t.id !== id));
  }

  const totalPercManual = terceiros.reduce((s, t) => s + parseFloat(t.perc_contraparte || 0), 0);
  const minhaParticipacao = Math.max(0, 100 - totalPercManual);
  const totalOk = Math.abs(totalPercManual + minhaParticipacao - 100) < 0.01;

  // Cálculo preview da fórmula
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
        <div className="text-lg font-medium mt-1">Parceiros / Condôminos</div>
        <div className="text-xs opacity-70">{imovel?.nome || `Imóvel #${imovelId}`}</div>
      </div>

      <div className="p-4 space-y-4">

        {/* Tipo de exploração */}
        <div className="bg-white rounded-xl p-4 shadow-sm space-y-3">
          <div className="text-sm font-medium text-gray-700">Tipo de exploração</div>
          <select className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" value={tipoExploracao} onChange={e => setTipoExploracao(parseInt(e.target.value))}>
            {TIPOS_EXPLORACAO.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
          <div>
            <label className="text-xs text-gray-500">Sua participação (%)</label>
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
            {/* Método de cálculo */}
            <div className="bg-white rounded-xl p-4 shadow-sm space-y-3">
              <div className="text-sm font-medium text-gray-700">Método de participação</div>
              <div className="flex gap-2">
                <button onClick={() => setAbaCalculo("manual")} className={`flex-1 py-2 rounded-lg text-xs font-medium ${abaCalculo === "manual" ? "bg-green-800 text-white" : "bg-gray-100 text-gray-600"}`}>
                  Manual (%)
                </button>
                <button onClick={() => setAbaCalculo("formula")} className={`flex-1 py-2 rounded-lg text-xs font-medium ${abaCalculo === "formula" ? "bg-green-800 text-white" : "bg-gray-100 text-gray-600"}`}>
                  Fórmula (Terra + Capital)
                </button>
              </div>

              {abaCalculo === "formula" && (
                <div className="space-y-3">
                  <div className="text-xs text-gray-500 bg-gray-50 rounded-lg p-3">
                    <div className="font-medium mb-1">P = α·(Área/ÁreaTotal) + β·(Inv/InvTotal)</div>
                    <div>com α + β = 1</div>
                  </div>

                  <div>
                    <label className="text-xs text-gray-500">Peso Terra (α) = {alfa}% | Peso Capital (β) = {100-alfa}%</label>
                    <input type="range" min="0" max="100" step="5" value={alfa} onChange={e => setAlfa(parseInt(e.target.value))}
                      className="w-full mt-1" />
                    <div className="flex justify-between text-xs text-gray-400 mt-1">
                      <span>100% Terra</span><span>50/50</span><span>100% Capital</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-gray-500">Sua área (ha)</label>
                      <input type="number" className="w-full border border-gray-200 rounded-lg px-3 py-2 mt-1 text-sm" placeholder="0" value={areaDeclarante} onChange={e => setAreaDeclarante(e.target.value)} />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">Seu investimento (R$)</label>
                      <input type="number" className="w-full border border-gray-200 rounded-lg px-3 py-2 mt-1 text-sm" placeholder="0" value={invDeclarante} onChange={e => setInvDeclarante(e.target.value)} />
                    </div>
                  </div>

                  {/* Preview */}
                  {(parseFloat(areaDeclarante) > 0 || parseFloat(invDeclarante) > 0) && (
                    <div className="bg-green-50 rounded-lg p-3 text-xs space-y-1">
                      <div className="font-medium text-green-800">Preview das participações:</div>
                      <div className="flex justify-between">
                        <span>Você:</span>
                        <span className="font-medium">{calcParticipacao(parseFloat(areaDeclarante||"0"), parseFloat(invDeclarante||"0")).toFixed(1)}%</span>
                      </div>
                      {terceiros.map(t => (
                        <div key={t.id} className="flex justify-between">
                          <span>{t.nome_contraparte}:</span>
                          <span className="font-medium">{calcParticipacao(parseFloat(t.area_ha||"0"), parseFloat(t.investimento||"0")).toFixed(1)}%</span>
                        </div>
                      ))}
                      <div className="border-t pt-1 flex justify-between font-medium">
                        <span>Total:</span>
                        <span>{(calcParticipacao(parseFloat(areaDeclarante||"0"), parseFloat(invDeclarante||"0")) + terceiros.reduce((s,t) => s + calcParticipacao(parseFloat(t.area_ha||"0"), parseFloat(t.investimento||"0")), 0)).toFixed(1)}%</span>
                      </div>
                    </div>
                  )}

                  <button onClick={recalcularFormula} disabled={recalculando} className="w-full py-2 rounded-lg text-sm font-medium text-white bg-blue-700 disabled:bg-gray-400">
                    {recalculando ? "Recalculando..." : "🔄 Recalcular participações"}
                  </button>
                </div>
              )}
            </div>

            {/* Lista */}
            <div className="bg-white rounded-xl p-4 shadow-sm space-y-3">
              <div className="flex justify-between items-center">
                <div className="text-sm font-medium text-gray-700">{TIPOS_EXPLORACAO.find(t => t.id === tipoExploracao)?.label}</div>
                <div className={`text-xs font-medium ${totalOk ? "text-green-600" : "text-orange-500"}`}>
                  Total: {(totalPercManual + minhaParticipacao).toFixed(1)}%
                </div>
              </div>

              <div className="flex items-start justify-between py-2 border-b bg-green-50 rounded-lg px-2">
                <div>
                  <div className="text-sm font-medium text-green-800">{imovel?.nome_produtor || "Você (declarante)"}</div>
                  <div className="text-xs text-green-700 font-medium">{minhaParticipacao.toFixed(1)}%</div>
                  {areaDeclarante && <div className="text-xs text-gray-500">{areaDeclarante} ha</div>}
                  {invDeclarante && <div className="text-xs text-gray-500">{fmt(parseFloat(invDeclarante))}</div>}
                </div>
              </div>

              {terceiros.length === 0 ? (
                <div className="text-center text-gray-400 py-2 text-sm">Nenhum participante</div>
              terceiros.map(t => (
              <div key={t.id} className="py-3 border-b last:border-0">
                {editando === t.id ? (
                  <div className="space-y-2">
                    <div className="text-sm font-medium">{t.nome_contraparte}</div>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="text-xs text-gray-500">% part.</label>
                        <input type="number" className="w-full border rounded px-2 py-1 text-sm"
                          defaultValue={t.perc_contraparte}
                          id={`perc-${t.id}`} />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500">Área (ha)</label>
                        <input type="number" className="w-full border rounded px-2 py-1 text-sm"
                          defaultValue={t.area_ha || ""}
                          id={`area-${t.id}`} />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500">Inv. (R$)</label>
                        <input type="number" className="w-full border rounded px-2 py-1 text-sm"
                          defaultValue={t.investimento || ""}
                          id={`inv-${t.id}`} />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => setEditando(null)} className="flex-1 py-1 rounded text-xs border">Cancelar</button>
                      <button
                        onClick={async () => {
                          const perc = parseFloat((document.getElementById(`perc-${t.id}`) as HTMLInputElement).value);
                          const area = parseFloat((document.getElementById(`area-${t.id}`) as HTMLInputElement).value || "0");
                          const inv = parseFloat((document.getElementById(`inv-${t.id}`) as HTMLInputElement).value || "0");
                          await fetch(`${API}/terceiros/${t.id}`, {
                            method: "PUT",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ perc_contraparte: perc, area_ha: area, investimento: inv }),
                          });
                          setTerceiros(terceiros.map(x => x.id === t.id ? {...x, perc_contraparte: perc, area_ha: area, investimento: inv} : x));
                          setEditando(null);
                        }}
                        className="flex-1 py-1 rounded text-xs font-medium text-white bg-green-800"
                      >Salvar</button>
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
                    <div className="flex gap-2 ml-2">
                      <button onClick={() => setEditando(t.id)} className="text-blue-500 text-xs hover:text-blue-700 border border-blue-300 rounded px-1">editar</button>
                      <button onClick={() => excluirTerceiro(t.id)} className="text-red-400 text-xs hover:text-red-600">🗑️</button>
                    </div>
                  </div>
                )}
              </div>
            ))

              {!showForm ? (
                <button onClick={() => setShowForm(true)} disabled={minhaParticipacao <= 0 && abaCalculo === "manual"}
                  className="w-full py-2 rounded-lg border border-dashed border-gray-300 text-sm text-gray-500 disabled:opacity-40">
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
                      <label className="text-xs text-gray-500">Participação (%) — máx {(100 - totalPercManual).toFixed(1)}%</label>
                      <input type="number" min="0.01" max={100 - totalPercManual} step="0.01"
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 mt-1 text-sm"
                        value={novo.perc_contraparte} onChange={e => setNovo({...novo, perc_contraparte: e.target.value})} />
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs text-gray-500">Área (ha)</label>
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
          <div className="font-medium">📋 Registro 0045 — LCDPR</div>
          <div>Pi = α·(Área/ÁreaTotal) + β·(Inv/InvTotal), com α + β = 1</div>
          <div className="font-medium mt-1">Sua participação: {minhaParticipacao.toFixed(1)}%</div>
          {!totalOk && <div className="text-orange-600 font-medium">⚠️ Total diferente de 100%</div>}
        </div>

        <a href={`/cadastro?produtor_id=${produtorId}`} className="block w-full py-3 rounded-xl text-sm font-medium text-white bg-green-800 text-center">
          ← Voltar ao cadastro
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
