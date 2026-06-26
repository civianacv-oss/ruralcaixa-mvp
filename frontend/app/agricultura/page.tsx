"use client";
import { apiFetch } from "@/lib/api";
// app/agricultura/page.tsx  (ou pages/agricultura/index.tsx)
// Menu "Agricultura" no sidebar -- lista todas as safras por imovel


import ImportarModal from "@/components/ImportarModal";
import { useState, useEffect } from 'react';
import Link from 'next/link';

const API = process.env.NEXT_PUBLIC_API_URL;

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  planejada:    { label: 'Planejada',    bg: 'bg-gray-100',   text: 'text-gray-600' },
  em_andamento: { label: 'Em andamento', bg: 'bg-blue-100',   text: 'text-blue-700' },
  colhida:      { label: 'Colhida',      bg: 'bg-green-100',  text: 'text-green-700' },
  encerrada:    { label: 'Encerrada',    bg: 'bg-gray-800',   text: 'text-white' },
};

type Safra = {
  id: number;
  imovel_id: number;
  cultura: string;
  ano_safra: string;
  area_ha: number;
  status: string;
  tipo_gestao: string;
  data_plantio?: string;
  data_colheita_prevista?: string;
  producao_total_kg: number;
  receita_total: number;
  custo_total: number;
  margem_bruta: number;
  produtividade_kg_ha?: number;
};

type Imovel = {
  id: number;
  nome: string;
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.planejada;
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${cfg.bg} ${cfg.text}`}>
      {cfg.label}
    </span>
      {modalImportar && (
        <ImportarModal
          modulo="agricultura"
          onClose={() => setModalImportar(false)}
          onSuccess={(qtd) => { setModalImportar(false); }}
        />
      )}
  );
}

function fmt(v: number, decimais = 2) {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: decimais, maximumFractionDigits: decimais });
}

function fmtBRL(v: number) {
  return 'R$ ' + fmt(v);
}

export default function AgriculturaPage() {
  const [modalImportar, setModalImportar] = useState(false);
  const [imoveis, setImoveis] = useState<Imovel[]>([]);
  const [safras, setSafras] = useState<Safra[]>([]);
  const [filtroImovel, setFiltroImovel] = useState<string>('');
  const [filtroAno, setFiltroAno] = useState<string>('');
  const [filtroCultura, setFiltroCultura] = useState<string>('');
  const [filtroStatus, setFiltroStatus] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    fetchImoveis();
  }, []);

  useEffect(() => {
    fetchSafras();
  }, [filtroImovel, filtroAno, filtroCultura, filtroStatus]);

  async function fetchImoveis() {
    const res = await apiFetch(`${API}/imoveis/buscar?q=`);
    if (res.ok) { const d = await res.json(); setImoveis(Array.isArray(d) ? d : (d.imoveis || [])); }
  }

  async function fetchSafras() {
    setLoading(true);
    try {
      if (filtroImovel) {
        const params = new URLSearchParams();
        if (filtroAno)    params.append('ano_safra', filtroAno);
        if (filtroCultura) params.append('cultura', filtroCultura);
        if (filtroStatus) params.append('status', filtroStatus);
        const res = await apiFetch(`${API}/agricultura/imoveis/${filtroImovel}/safras?${params}`);
        if (res.ok) setSafras(await res.json());
      } else {
        // Busca safras de todos os imoveis
        const todas: Safra[] = [];
        const listaImoveis = imoveis.length > 0 ? imoveis : [{id:1},{id:5}];
        for (const im of listaImoveis) {
          const params = new URLSearchParams();
          if (filtroAno)    params.append('ano_safra', filtroAno);
          if (filtroCultura) params.append('cultura', filtroCultura);
          if (filtroStatus) params.append('status', filtroStatus);
          const res = await apiFetch(`${API}/agricultura/imoveis/${im.id}/safras?${params}`);
          if (res.ok) {
            const data = await res.json();
            todas.push(...data);
          }
        }
        setSafras(todas);
      }
    } finally {
      setLoading(false);
    }
  }

  // Agrupa por ano_safra para exibicao
  const por_ano = safras.reduce((acc, s) => {
    const key = s.ano_safra;
    if (!acc[key]) acc[key] = [];
    acc[key].push(s);
    return acc;
  }, {} as Record<string, Safra[]>);

  const anos = Object.keys(por_ano).sort((a, b) => b.localeCompare(a));

  const totalReceita = safras.reduce((s, r) => s + Number(r.receita_total || 0), 0);
  const totalCusto   = safras.reduce((s, r) => s + Number(r.custo_total || 0), 0);
  const totalArea    = safras.reduce((s, r) => s + Number(r.area_ha || 0), 0);

  return (
    <div className="min-h-screen bg-gray-50">
      <div style={{padding:"16px 24px 0"}}>
        <div style={{display:"flex",gap:8}}><a href="/" style={{display:"inline-flex",alignItems:"center",gap:6,fontSize:13,color:"#5a8a3a",fontWeight:600,padding:"6px 14px",background:"#fff",borderRadius:8,border:"1px solid #d0e8c0",boxShadow:"0 1px 3px rgba(0,0,0,0.06)",textDecoration:"none"}}>🏠 Painel Principal</a><button onClick={() => window.history.back()} style={{display:"inline-flex",alignItems:"center",gap:6,fontSize:13,color:"#5a8a3a",fontWeight:600,padding:"6px 14px",background:"#fff",borderRadius:8,border:"1px solid #d0e8c0",boxShadow:"0 1px 3px rgba(0,0,0,0.06)",cursor:"pointer"}}>← Voltar</button></div>
      </div>
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Agricultura</h1>
            <p className="text-sm text-gray-500 mt-0.5">Gestao de safras e producao agricola</p>
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors"
          >
            <span>+</span> Nova Safra
          </button>
          <button onClick={() => setModalImportar(true)} style={{ padding: "8px 16px", borderRadius: 8, border: "1.5px solid #c8d8c0", background: "#f0f8ea", color: "#2a5a2a", fontSize: 13, fontWeight: 600, cursor: "pointer", marginLeft: 8 }}>📂 Importar planilha</button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6">
        {/* Cards de resumo */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Total de Safras</p>
            <p className="text-3xl font-bold text-gray-900 mt-1">{safras.length}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Area Total</p>
            <p className="text-3xl font-bold text-gray-900 mt-1">{fmt(totalArea, 1)} <span className="text-base font-normal text-gray-500">ha</span></p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Receita Total</p>
            <p className="text-3xl font-bold text-green-700 mt-1">{fmtBRL(totalReceita)}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Margem Total</p>
            <p className={`text-3xl font-bold mt-1 ${totalReceita - totalCusto >= 0 ? 'text-green-700' : 'text-red-600'}`}>
              {fmtBRL(totalReceita - totalCusto)}
            </p>
          </div>
        </div>

        {/* Filtros */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <select
              value={filtroImovel}
              onChange={e => setFiltroImovel(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent"
            >
              <option value="">Todos os imóveis</option>
              {imoveis.map(im => (
                <option key={im.id} value={im.id}>{im.nome}</option>
              ))}
            </select>

            <input
              type="text"
              placeholder="Cultura..."
              value={filtroCultura}
              onChange={e => setFiltroCultura(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500"
            />

            <input
              type="text"
              placeholder="Ano-safra (ex: 2025/2026)"
              value={filtroAno}
              onChange={e => setFiltroAno(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500"
            />

            <select
              value={filtroStatus}
              onChange={e => setFiltroStatus(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500"
            >
              <option value="">Todos os status</option>
              <option value="planejada">Planejada</option>
              <option value="em_andamento">Em andamento</option>
              <option value="colhida">Colhida</option>
              <option value="encerrada">Encerrada</option>
            </select>
          </div>
        </div>

        {/* Listagem por ano */}
        {loading ? (
          <div className="text-center py-16 text-gray-400">Carregando safras...</div>
        ) : safras.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-gray-400 text-lg">Nenhuma safra encontrada</p>
            <button
              onClick={() => setShowModal(true)}
              className="mt-4 text-green-600 hover:underline text-sm"
            >
              Cadastrar primeira safra
            </button>
          </div>
        ) : (
          anos.map(ano => (
            <div key={ano} className="mb-8">
              <h2 className="text-lg font-semibold text-gray-700 mb-3 flex items-center gap-2">
                <span className="bg-green-100 text-green-800 text-sm px-2.5 py-0.5 rounded-full font-bold">
                  Safra {ano}
                </span>
                <span className="text-sm font-normal text-gray-400">
                  {por_ano[ano].length} cultura{por_ano[ano].length > 1 ? 's' : ''}
                </span>
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {por_ano[ano].map(s => {
                  const margem = Number(s.margem_bruta || 0);
                  const imovelNome = imoveis.find(i => i.id === s.imovel_id)?.nome ?? `Imóvel ${s.imovel_id}`;

                  return (
                    <Link
                      key={s.id}
                      href={`/agricultura/safras/${s.id}`}
                      className="bg-white rounded-xl border border-gray-200 hover:border-green-400 hover:shadow-md transition-all p-5 block"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <p className="font-bold text-gray-900 text-lg leading-tight">{s.cultura}</p>
                          <p className="text-xs text-gray-500 mt-0.5">{imovelNome}</p>
                        </div>
                        <StatusBadge status={s.status} />
                      </div>

                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <p className="text-gray-400 text-xs">Area</p>
                          <p className="font-semibold text-gray-700">{fmt(s.area_ha, 1)} ha</p>
                        </div>
                        <div>
                          <p className="text-gray-400 text-xs">Producao</p>
                          <p className="font-semibold text-gray-700">
                            {s.producao_total_kg > 0 ? `${fmt(s.producao_total_kg, 0)} kg` : '--'}
                          </p>
                        </div>
                        <div>
                          <p className="text-gray-400 text-xs">Receita</p>
                          <p className="font-semibold text-green-700">
                            {s.receita_total > 0 ? fmtBRL(Number(s.receita_total)) : '--'}
                          </p>
                        </div>
                        <div>
                          <p className="text-gray-400 text-xs">Margem</p>
                          <p className={`font-semibold ${margem >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                            {s.receita_total > 0 ? fmtBRL(margem) : '--'}
                          </p>
                        </div>
                      </div>

                      {s.produtividade_kg_ha && s.produtividade_kg_ha > 0 && (
                        <div className="mt-3 pt-3 border-t border-gray-100 text-xs text-gray-500">
                          {fmt(s.produtividade_kg_ha, 0)} kg/ha
                        </div>
                      )}

                      {s.data_plantio && (
                        <div className="mt-1 text-xs text-gray-400">
                          Plantio: {new Date(s.data_plantio).toLocaleDateString('pt-BR')}
                          {s.data_colheita_prevista && (
                            <> &bull; Colheita prev.: {new Date(s.data_colheita_prevista).toLocaleDateString('pt-BR')}</>
                          )}
                        </div>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>

      {showModal && (
        <NovaSafraModal
          imoveis={imoveis}
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); fetchSafras(); }}
        />
      )}
    </div>
  );
}

// ─── Modal Nova Safra ────────────────────────────────────────────────────

function NovaSafraModal({
  imoveis,
  onClose,
  onSaved,
}: {
  imoveis: Imovel[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    imovel_id: imoveis[0]?.id?.toString() ?? '',
    cultura: '',
    ano_safra: '',
    area_ha: '',
    data_plantio: '',
    data_colheita_prevista: '',
    estimativa_producao_kg: '',
    custo_estimado: '',
    tipo_gestao: 'propria',
    status: 'planejada',
    observacoes: '',
  });
  const [culturas, setCulturas] = useState<string[]>([]);
  const [sugestoes, setSugestoes] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    apiFetch(`${API}/agricultura/culturas`)
      .then(r => r.json())
      .then(data => setCulturas(data.map((c: { nome: string }) => c.nome)));
  }, []);

  function filtrarSugestoes(q: string) {
    if (!q) { setSugestoes([]); return; }
    setSugestoes(culturas.filter(c => c.toLowerCase().includes(q.toLowerCase())).slice(0, 8));
  }

  async function salvar() {
    if (!form.imovel_id || !form.cultura || !form.ano_safra || !form.area_ha) {
      setErro('Preencha: imóvel, cultura, ano-safra e área.');
      return;
    }
    setSaving(true);
    setErro('');
    try {
      const res = await apiFetch(`${API}/agricultura/imoveis/${form.imovel_id}/safras`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cultura: form.cultura,
          ano_safra: form.ano_safra,
          area_ha: parseFloat(form.area_ha),
          data_plantio: form.data_plantio || null,
          data_colheita_prevista: form.data_colheita_prevista || null,
          estimativa_producao_kg: form.estimativa_producao_kg ? parseFloat(form.estimativa_producao_kg) : null,
          custo_estimado: form.custo_estimado ? parseFloat(form.custo_estimado) : null,
          tipo_gestao: form.tipo_gestao,
          status: form.status,
          observacoes: form.observacoes || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        setErro(err.detail ?? 'Erro ao salvar');
        return;
      }
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between rounded-t-2xl">
          <h2 className="text-lg font-bold text-gray-900">Nova Safra</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">x</button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {erro && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{erro}</div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Imóvel *</label>
            <select
              value={form.imovel_id}
              onChange={e => setForm({ ...form, imovel_id: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500"
            >
              {imoveis.map(im => <option key={im.id} value={im.id}>{im.nome}</option>)}
            </select>
          </div>

          <div className="relative">
            <label className="block text-sm font-medium text-gray-700 mb-1">Cultura *</label>
            <input
              value={form.cultura}
              onChange={e => { setForm({ ...form, cultura: e.target.value }); filtrarSugestoes(e.target.value); }}
              placeholder="Ex: Soja, Milho Safrinha..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500"
            />
            {sugestoes.length > 0 && (
              <ul className="absolute z-10 w-full bg-white border border-gray-200 rounded-lg mt-1 shadow-lg max-h-40 overflow-y-auto">
                {sugestoes.map(s => (
                  <li
                    key={s}
                    onClick={() => { setForm({ ...form, cultura: s }); setSugestoes([]); }}
                    className="px-4 py-2 text-sm hover:bg-green-50 cursor-pointer"
                  >
                    {s}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Ano-Safra *</label>
              <input
                value={form.ano_safra}
                onChange={e => setForm({ ...form, ano_safra: e.target.value })}
                placeholder="2025/2026"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Área (ha) *</label>
              <input
                type="number" step="0.01" min="0.01"
                value={form.area_ha}
                onChange={e => setForm({ ...form, area_ha: e.target.value })}
                placeholder="0,00"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Data Plantio</label>
              <input
                type="date"
                value={form.data_plantio}
                onChange={e => setForm({ ...form, data_plantio: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Colheita Prevista</label>
              <input
                type="date"
                value={form.data_colheita_prevista}
                onChange={e => setForm({ ...form, data_colheita_prevista: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Estim. Produção (kg)</label>
              <input
                type="number"
                value={form.estimativa_producao_kg}
                onChange={e => setForm({ ...form, estimativa_producao_kg: e.target.value })}
                placeholder="Opcional"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Custo Estimado (R$)</label>
              <input
                type="number"
                value={form.custo_estimado}
                onChange={e => setForm({ ...form, custo_estimado: e.target.value })}
                placeholder="Opcional"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Tipo de Gestão
              <span className="ml-1 text-xs text-gray-400 font-normal">(impacta LCDPR)</span>
            </label>
            <div className="flex gap-3">
              {[
                { v: 'propria',   l: 'Própria' },
                { v: 'arrendada', l: 'Arrendada' },
                { v: 'parceria',  l: 'Parceria' },
              ].map(opt => (
                <label key={opt.v} className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    value={opt.v}
                    checked={form.tipo_gestao === opt.v}
                    onChange={e => setForm({ ...form, tipo_gestao: e.target.value })}
                    className="accent-green-600"
                  />
                  <span className="text-sm text-gray-700">{opt.l}</span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Status Inicial</label>
            <select
              value={form.status}
              onChange={e => setForm({ ...form, status: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500"
            >
              <option value="planejada">Planejada</option>
              <option value="em_andamento">Em andamento</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Observações</label>
            <textarea
              rows={2}
              value={form.observacoes}
              onChange={e => setForm({ ...form, observacoes: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500"
            />
          </div>
        </div>

        <div className="sticky bottom-0 bg-white border-t border-gray-100 px-6 py-4 flex gap-3 justify-end rounded-b-2xl">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Cancelar
          </button>
          <button
            onClick={salvar}
            disabled={saving}
            className="px-6 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg disabled:opacity-50 transition-colors"
          >
            {saving ? 'Salvando...' : 'Salvar Safra'}
          </button>
        </div>
      </div>
    </div>
  );
}
