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

const TIPOS_CONTRAPARTE: Record<number, string[]> = {
  1: [],
  2: ["Condômino"],
  3: ["Arrendador"],
  4: ["Parceiro"],
  5: ["Comodante"],
  6: ["Outros"],
};

const LABEL_ADICIONAR: Record<number, string> = {
  2: "condômino",
  3: "arrendador",
  4: "parceiro",
  5: "comodante",
  6: "participante",
};

function TerceirosContent() {
  const searchParams = useSearchParams();
  const imovelId = parseInt(searchParams.get("imovel_id") || "0");
  const produtorId = searchParams.get("produtor_id");

  const [imovel, setImovel] = useState<any>(null);
  const [terceiros, setTerceiros] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [tipoExploracao, setTipoExploracao] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [editando, setEditando] = useState<number | null>(null);
  const [novo, setNovo] = useState({
    tipo_contraparte: "Condômino",
    id_contraparte: "",
    nome_contraparte: "",
    perc_contraparte: "",
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
          const p = prods.find((x: any) => x.id === parseInt(produtorId));
          if (!p) return;
          fetch(`${API}/produtor/imoveis?cpf=${p.cpf?.replace(/\D/g,"")}`)
            .then(r => r.json())
            .then(imoveis => {
              const im = imoveis.find((x: any) => x.id === imovelId);
              if (im) {
                setImovel(im);
                setTipoExploracao(im.tipo_exploracao || 1);
              }
            });
        });
    }
  }, [imovelId, produtorId]);

  // Atualiza tipo de contraparte quando muda o tipo de exploração
  useEffect(() => {
    const tipos = TIPOS_CONTRAPARTE[tipoExploracao];
    if (tipos && tipos.length > 0) {
      setNovo(n => ({ ...n, tipo_contraparte: tipos[0] }));
    }
  }, [tipoExploracao]);

  async function salvarTipoExploracao() {
    setSalvando(true);
    const minhaParticipacao = Math.max(0, 100 - totalPerc);
    try {
      await fetch(`${API}/imoveis/${imovelId}/tipo-exploracao?tipo=${tipoExploracao}&participacao=${minhaParticipacao}`, {
        method: "PUT",
      });
      alert("Tipo de exploração atualizado!");
    } catch {
      alert("Erro ao salvar");
    } finally {
      setSalvando(false);
    }
  }

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

  async function adicionarTerceiro() {
    if (!novo.id_contraparte || !novo.nome_contraparte || !novo.perc_contraparte) {
      return alert("Preencha todos os campos");
    }
    const perc = parseFloat(novo.perc_contraparte);
    if (perc + totalPerc > 100) {
      return alert(`Participação total não pode ultrapassar 100%. Disponível: ${(100 - totalPerc).toFixed(1)}%`);
    }
    setSalvando(true);
    try {
      const res = await fetch(`${API}/imoveis/${imovelId}/terceiros`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imovel_id: imovelId,
          tipo_contraparte: novo.tipo_contraparte,
          id_contraparte: novo.id_contraparte.replace(/\D/g, ""),
          nome_contraparte: novo.nome_contraparte,
          perc_contraparte: perc,
        }),
      });
      const data = await res.json();
      setTerceiros([...terceiros, { id: data.id, ...novo, id_contraparte: novo.id_contraparte.replace(/\D/g, ""), perc_contraparte: perc }]);
      setNovo({ tipo_contraparte: TIPOS_CONTRAPARTE[tipoExploracao]?.[0] || "Outros", id_contraparte: "", nome_contraparte: "", perc_contraparte: "" });
      setShowForm(false);
    } catch {
      alert("Erro ao adicionar");
    } finally {
      setSalvando(false);
    }
  }

  async function excluirTerceiro(id: number) {
    if (!confirm("Excluir este participante?")) return;
    await fetch(`${API}/terceiros/${id}`, { method: "DELETE" });
    setTerceiros(terceiros.filter(t => t.id !== id));
  }

  const totalPerc = terceiros.reduce((s, t) => s + parseFloat(t.perc_contraparte), 0);
  const minhaParticipacao = Math.max(0, 100 - totalPerc);
  const totalOk = Math.abs(totalPerc + minhaParticipacao - 100) < 0.01;

  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-gray-400">Carregando...</div>
    </div>
  );

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
          <div>
            <label className="text-xs text-gray-500">Como o imóvel é explorado</label>
            <select
              className="w-full border border-gray-200 rounded-lg px-3 py-2 mt-1 text-sm"
              value={tipoExploracao}
              onChange={e => setTipoExploracao(parseInt(e.target.value))}
            >
              {TIPOS_EXPLORACAO.map(t => (
                <option key={t.id} value={t.id}>{t.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs text-gray-500">Sua participação (%)</label>
            <div className={`w-full border rounded-lg px-3 py-2 mt-1 text-sm ${totalOk ? "border-green-300 bg-green-50 text-green-700" : "border-orange-300 bg-orange-50 text-orange-700"}`}>
              {minhaParticipacao.toFixed(1)}%
            </div>
            <div className="text-xs text-gray-400 mt-1">
              100% - {totalPerc.toFixed(1)}% (participantes) = {minhaParticipacao.toFixed(1)}%
            </div>
          </div>

          <button
            onClick={salvarTipoExploracao}
            disabled={salvando}
            className="w-full py-2 rounded-lg text-sm font-medium text-white bg-green-800 disabled:bg-gray-400"
          >
            {salvando ? "Salvando..." : "Salvar tipo de exploração"}
          </button>
        </div>

        {/* Lista de participantes */}
        {tipoExploracao > 1 && (
          <div className="bg-white rounded-xl p-4 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium text-gray-700">
                {TIPOS_EXPLORACAO.find(t => t.id === tipoExploracao)?.label}
              </div>
              <div className={`text-xs font-medium ${totalOk ? "text-green-600" : "text-orange-500"}`}>
                Total: {(totalPerc + minhaParticipacao).toFixed(1)}%
                {!totalOk && " ⚠️"}
              </div>
            </div>

            {/* Minha linha */}
            <div className="flex items-start justify-between py-2 border-b bg-green-50 rounded-lg px-2">
              <div>
                <div className="text-sm font-medium text-green-800">Você (declarante)</div>
                <div className="text-xs text-green-700 font-medium mt-0.5">{minhaParticipacao.toFixed(1)}% de participação</div>
              </div>
            </div>

            {terceiros.length === 0 ? (
              <div className="text-center text-gray-400 py-2 text-sm">Nenhum participante cadastrado</div>
            ) : (
              terceiros.map(t => (
                <div key={t.id} className="flex items-start justify-between py-3 border-b last:border-0">
                  <div>
                    <div className="text-sm font-medium">{t.nome_contraparte}</div>
                    <div className="text-xs text-gray-400">{t.tipo_contraparte} · {t.id_contraparte}</div>
                    <div className="text-xs text-green-700 font-medium mt-0.5">{t.perc_contraparte}% de participação</div>
                  </div>
                  <button
                    onClick={() => excluirTerceiro(t.id)}
                    className="text-red-400 text-xs hover:text-red-600 ml-2 mt-1"
                  >
                    🗑️
                  </button>
                </div>
              ))
            )}

            {!showForm ? (
              <button
                onClick={() => setShowForm(true)}
                disabled={minhaParticipacao <= 0}
                className="w-full py-2 rounded-lg border border-dashed border-gray-300 text-sm text-gray-500 disabled:opacity-40"
              >
                + Adicionar {LABEL_ADICIONAR[tipoExploracao] || "participante"}
              </button>
            ) : (
              <div className="space-y-3 border border-gray-200 rounded-lg p-3">
                <div className="text-xs font-medium text-gray-600">
                  Novo {LABEL_ADICIONAR[tipoExploracao] || "participante"}
                </div>
                <div>
                  <label className="text-xs text-gray-500">CPF/CNPJ *</label>
                  <input
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 mt-1 text-sm"
                    placeholder="000.000.000-00"
                    value={novo.id_contraparte}
                    onChange={async e => {
                      const cpf = e.target.value;
                      setNovo({...novo, id_contraparte: cpf});
                      await buscarProdutor(cpf);
                    }}
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500">Nome *</label>
                  <input
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 mt-1 text-sm"
                    placeholder="Nome completo"
                    value={novo.nome_contraparte}
                    onChange={e => setNovo({...novo, nome_contraparte: e.target.value})}
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500">Participação (%) * — máx {(100 - totalPerc).toFixed(1)}%</label>
                  <input
                    type="number"
                    min="0.01"
                    max={100 - totalPerc}
                    step="0.01"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 mt-1 text-sm"
                    placeholder={`máx ${(100 - totalPerc).toFixed(1)}`}
                    value={novo.perc_contraparte}
                    onChange={e => setNovo({...novo, perc_contraparte: e.target.value})}
                  />
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setShowForm(false)} className="flex-1 py-2 rounded-lg text-sm border border-gray-200">Cancelar</button>
                  <button onClick={adicionarTerceiro} disabled={salvando} className="flex-1 py-2 rounded-lg text-sm font-medium text-white bg-green-800 disabled:bg-gray-400">
                    {salvando ? "Salvando..." : "Adicionar"}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Info LCDPR */}
        <div className="bg-blue-50 rounded-xl p-4 text-xs text-blue-700 space-y-1">
          <div className="font-medium">📋 Registro 0045 — LCDPR</div>
          <div>Em explorações conjuntas, cada produtor deve escriturar apenas sua parcela proporcional das receitas e despesas.</div>
          <div className="mt-1 font-medium">Sua participação: {minhaParticipacao.toFixed(1)}%</div>
          {!totalOk && (
            <div className="text-orange-600 font-medium mt-1">⚠️ Total diferente de 100% — revise as participações</div>
          )}
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
