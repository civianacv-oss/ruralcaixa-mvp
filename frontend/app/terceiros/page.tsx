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

const TIPOS_CONTRAPARTE = [
  "Condômino", "Arrendador", "Parceiro", "Comodante", "Outros"
];

function TerceirosContent() {
  const searchParams = useSearchParams();
  const imovelId = parseInt(searchParams.get("imovel_id") || "0");
  const produtorId = searchParams.get("produtor_id");

  const [imovel, setImovel] = useState<any>(null);
  const [terceiros, setTerceiros] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [tipoExploracao, setTipoExploracao] = useState(1);
  const [participacao, setParticipacao] = useState("100");
  const [showForm, setShowForm] = useState(false);
  const [novo, setNovo] = useState({
    tipo_contraparte: "Condômino",
    id_contraparte: "",
    nome_contraparte: "",
    perc_contraparte: "",
  });

  useEffect(() => {
    if (!imovelId) return;
    Promise.all([
      fetch(`${API}/imoveis/${imovelId}/terceiros`).then(r => r.json()),
    ]).then(([terc]) => {
      setTerceiros(terc);
      setLoading(false);
    }).catch(() => setLoading(false));

    // Buscar dados do imóvel
    if (produtorId) {
      fetch(`${API}/produtores`)
        .then(r => r.json())
        .then(prods => {
          const p = prods.find((x: any) => x.id === parseInt(produtorId));
          if (p) {
            fetch(`${API}/produtor/imoveis?cpf=${p.cpf?.replace(/\D/g,"")}`)
              .then(r => r.json())
              .then(imoveis => {
                const im = imoveis.find((x: any) => x.id === imovelId);
                if (im) {
                  setImovel(im);
                  setTipoExploracao(im.tipo_exploracao || 1);
                  setParticipacao(String(im.participacao || 100));
                }
              });
          }
        });
    }
  }, [imovelId, produtorId]);

  async function salvarTipoExploracao() {
    setSalvando(true);
    try {
      await fetch(`${API}/imoveis/${imovelId}/tipo-exploracao?tipo=${tipoExploracao}&participacao=${participacao}`, {
        method: "PUT",
      });
      alert("Tipo de exploração atualizado!");
    } catch {
      alert("Erro ao salvar");
    } finally {
      setSalvando(false);
    }
  }

  async function adicionarTerceiro() {
    if (!novo.id_contraparte || !novo.nome_contraparte || !novo.perc_contraparte) {
      return alert("Preencha todos os campos");
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
          perc_contraparte: parseFloat(novo.perc_contraparte),
        }),
      });
      const data = await res.json();
      setTerceiros([...terceiros, { id: data.id, ...novo, perc_contraparte: parseFloat(novo.perc_contraparte) }]);
      setNovo({ tipo_contraparte: "Condômino", id_contraparte: "", nome_contraparte: "", perc_contraparte: "" });
      setShowForm(false);
    } catch {
      alert("Erro ao adicionar");
    } finally {
      setSalvando(false);
    }
  }

  async function excluirTerceiro(id: number) {
    if (!confirm("Excluir este parceiro?")) return;
    await fetch(`${API}/terceiros/${id}`, { method: "DELETE" });
    setTerceiros(terceiros.filter(t => t.id !== id));
  }

  const totalPerc = terceiros.reduce((s, t) => s + parseFloat(t.perc_contraparte), 0);

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
            <input
              type="number"
              min="0"
              max="100"
              step="0.01"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 mt-1 text-sm"
              value={participacao}
              onChange={e => setParticipacao(e.target.value)}
            />
          </div>
          <button
            onClick={salvarTipoExploracao}
            disabled={salvando}
            className="w-full py-2 rounded-lg text-sm font-medium text-white bg-green-800 disabled:bg-gray-400"
          >
            {salvando ? "Salvando..." : "Salvar tipo de exploração"}
          </button>
        </div>

        {/* Lista de terceiros */}
        {tipoExploracao > 1 && (
          <div className="bg-white rounded-xl p-4 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium text-gray-700">
                {TIPOS_EXPLORACAO.find(t => t.id === tipoExploracao)?.label}
              </div>
              <div className="text-xs text-gray-500">
                Total: {totalPerc.toFixed(1)}% + {parseFloat(participacao).toFixed(1)}% = {(totalPerc + parseFloat(participacao || "0")).toFixed(1)}%
              </div>
            </div>

            {terceiros.length === 0 ? (
              <div className="text-center text-gray-400 py-4 text-sm">Nenhum parceiro cadastrado</div>
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
                    className="text-red-400 text-xs hover:text-red-600 ml-2"
                  >
                    🗑️
                  </button>
                </div>
              ))
            )}

            {!showForm ? (
              <button
                onClick={() => setShowForm(true)}
                className="w-full py-2 rounded-lg border border-dashed border-gray-300 text-sm text-gray-500"
              >
                + Adicionar parceiro
              </button>
            ) : (
              <div className="space-y-3 border border-gray-200 rounded-lg p-3">
                <div className="text-xs font-medium text-gray-600">Novo parceiro</div>
                <div>
                  <label className="text-xs text-gray-500">Tipo</label>
                  <select
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 mt-1 text-sm"
                    value={novo.tipo_contraparte}
                    onChange={e => setNovo({...novo, tipo_contraparte: e.target.value})}
                  >
                    {TIPOS_CONTRAPARTE.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500">CPF/CNPJ *</label>
                  <input
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 mt-1 text-sm"
                    placeholder="000.000.000-00"
                    value={novo.id_contraparte}
                    onChange={e => setNovo({...novo, id_contraparte: e.target.value})}
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
                  <label className="text-xs text-gray-500">Participação (%) *</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 mt-1 text-sm"
                    placeholder="50.00"
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

        <div className="bg-blue-50 rounded-xl p-4 text-xs text-blue-700 space-y-1">
          <div className="font-medium">📋 Registro 0045 — LCDPR</div>
          <div>Em explorações conjuntas, cada produtor deve escriturar apenas sua parcela proporcional das receitas e despesas.</div>
          <div className="mt-1 font-medium">Sua participação: {participacao}%</div>
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
