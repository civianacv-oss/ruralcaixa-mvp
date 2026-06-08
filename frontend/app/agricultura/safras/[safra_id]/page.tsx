// app/agricultura/safras/[safra_id]/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell
} from 'recharts';

const API = process.env.NEXT_PUBLIC_API_URL;

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  planejada:    { label: 'Planejada',    bg: 'bg-gray-100',  text: 'text-gray-600' },
  em_andamento: { label: 'Em andamento', bg: 'bg-blue-100',  text: 'text-blue-700' },
  colhida:      { label: 'Colhida',      bg: 'bg-green-100', text: 'text-green-700' },
  encerrada:    { label: 'Encerrada',    bg: 'bg-gray-800',  text: 'text-white' },
};

const DESTINO_LABEL: Record<string, string> = {
  venda: 'Venda', consumo_proprio: 'Consumo próprio', estoque: 'Estoque'
};

function fmt(v: number | null | undefined, dec = 2) {
  if (v == null) return '--';
  return Number(v).toLocaleString('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}
function fmtBRL(v: number | null | undefined) {
  if (v == null) return '--';
  return 'R$ ' + fmt(v);
}
function fmtDate(d: string | null | undefined) {
  if (!d) return '--';
  return new Date(d).toLocaleDateString('pt-BR');
}

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.planejada;
  return (
    <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${cfg.bg} ${cfg.text}`}>
      {cfg.label}
    </span>
  );
}

function MetricCard({ label, value, sub, color = 'text-gray-900' }: {
  label: string; value: string; sub?: string; color?: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">{label}</p>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

// ─── Tabs ────────────────────────────────────────────────────────────────────

function TabDRE({ dre, safra }: { dre: any; safra: any }) {
  const chartData = [
    {
      name: 'Producao (t)',
      Estimado: dre.estimativa_producao_kg ? dre.estimativa_producao_kg / 1000 : 0,
      Real: dre.producao_total_kg / 1000,
    },
    {
      name: 'Custo (R$k)',
      Estimado: dre.custo_estimado ? dre.custo_estimado / 1000 : 0,
      Real: dre.custo_total / 1000,
    },
    {
      name: 'Receita (R$k)',
      Estimado: 0,
      Real: dre.receita_total / 1000,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Metricas principais */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard
          label="Receita Total"
          value={fmtBRL(dre.receita_total)}
          color="text-green-700"
        />
        <MetricCard
          label="Custo Total"
          value={fmtBRL(dre.custo_total)}
          color="text-red-600"
        />
        <MetricCard
          label="Margem Bruta"
          value={fmtBRL(dre.margem_bruta)}
          sub={dre.margem_percentual != null ? `${fmt(dre.margem_percentual, 1)}%` : undefined}
          color={dre.margem_bruta >= 0 ? 'text-green-700' : 'text-red-600'}
        />
        <MetricCard
          label="Produtividade"
          value={dre.produtividade_kg_ha > 0 ? `${fmt(dre.produtividade_kg_ha, 0)} kg/ha` : '--'}
          sub={`${fmt(dre.producao_total_kg, 0)} kg total`}
        />
      </div>

      {/* Metricas por ha */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <MetricCard label="Receita / ha"  value={fmtBRL(dre.receita_por_ha)} />
        <MetricCard label="Custo / ha"    value={fmtBRL(dre.custo_por_ha)} />
        <MetricCard
          label="Desvio Producao"
          value={dre.desvio_producao_percentual != null ? `${fmt(dre.desvio_producao_percentual, 1)}%` : '--'}
          sub="real vs estimado"
          color={
            dre.desvio_producao_percentual == null ? 'text-gray-500' :
            dre.desvio_producao_percentual >= 0 ? 'text-green-700' : 'text-orange-600'
          }
        />
      </div>

      {/* Grafico orcado vs real */}
      {(dre.estimativa_producao_kg || dre.custo_estimado) && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Orçado vs Realizado</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData} barCategoryGap="30%">
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v) => v != null ? Number(v).toFixed(2) : ""} />
              <Bar dataKey="Estimado" fill="#d1fae5" stroke="#6ee7b7" />
              <Bar dataKey="Real" fill="#059669" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Breakdown de custos */}
      {dre.breakdown_custos?.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Breakdown de Custos</h3>
          <div className="space-y-2">
            {dre.breakdown_custos.map((b: any) => (
              <div key={b.tipo} className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
                <span className="text-sm text-gray-600">{b.tipo}</span>
                <span className="text-sm font-semibold text-gray-800">{fmtBRL(b.total)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function TabLancamentos({ safraId, imovelId }: { safraId: number; imovelId: number }) {
  const [lancamentos, setLancamentos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  function loadLancamentos() {
    setLoading(true);
    fetch(`${API}/agricultura/safras/${safraId}/lancamentos`)
      .then(r => r.json())
      .then(data => { setLancamentos(Array.isArray(data) ? data : []); setLoading(false); });
  }

  useEffect(() => { loadLancamentos(); }, [safraId]);

  if (loading) return <div className="py-8 text-center text-gray-400">Carregando...</div>;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          onClick={() => setShowModal(true)}
          className="bg-green-600 hover:bg-green-700 text-white px-4 py-1.5 rounded-lg text-sm font-medium flex items-center gap-2"
        >
          + Novo Lançamento
        </button>
      </div>
      {showModal && (
        <ModalNovoLancamento
          safraId={safraId}
          imovelId={imovelId}
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); loadLancamentos(); }}
        />
      )}
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {lancamentos.length === 0 ? (
        <div className="py-12 text-center text-gray-400">
          <p>Nenhum lançamento ainda.</p>
          <p className="text-sm mt-1">Clique em "+ Novo Lançamento" para registrar despesas ou receitas.</p>
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Data</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tipo</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Descricao</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Valor</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {lancamentos.map(l => (
              <tr key={l.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-gray-600">{fmtDate(l.data_lancamento)}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    l.tipo === 'receita' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                  }`}>
                    {l.tipo}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-700">{l.descricao}</td>
                <td className={`px-4 py-3 text-right font-semibold ${
                  l.tipo === 'receita' ? 'text-green-700' : 'text-red-600'
                }`}>
                  {fmtBRL(l.valor)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
    </div>
  );
}

function TabColheita({ safraId, safraStatus, onRegistrar }: {
  safraId: number; safraStatus: string; onRegistrar: () => void;
}) {
  const [producoes, setProducoes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    fetch(`${API}/agricultura/safras/${safraId}/producao`)
      .then(r => r.json())
      .then(data => { setProducoes(data); setLoading(false); });
  }, [safraId]);

  const totalKg = producoes.reduce((s, p) => s + Number(p.quantidade_kg || 0), 0);
  const totalReceita = producoes
    .filter(p => p.destino === 'venda')
    .reduce((s, p) => s + Number(p.quantidade_kg || 0) * Number(p.preco_venda_kg || 0), 0);

  if (loading) return <div className="py-8 text-center text-gray-400">Carregando...</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex gap-4 text-sm">
          <span className="text-gray-500">Total produzido: <strong>{fmt(totalKg, 0)} kg</strong></span>
          {totalReceita > 0 && (
            <span className="text-gray-500">Receita gerada: <strong className="text-green-700">{fmtBRL(totalReceita)}</strong></span>
          )}
        </div>
        {safraStatus !== 'encerrada' && (
          <button
            onClick={() => setShowModal(true)}
            className="bg-green-600 hover:bg-green-700 text-white px-4 py-1.5 rounded-lg text-sm font-medium"
          >
            + Registrar Colheita
          </button>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {producoes.length === 0 ? (
          <div className="py-12 text-center text-gray-400">
            Nenhum registro de colheita ainda.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Data</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Quantidade</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Umidade</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Destino</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Preco/kg</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Receita</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {producoes.map(p => (
                <tr key={p.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">{fmtDate(p.data_colheita)}</td>
                  <td className="px-4 py-3 text-right font-medium">{fmt(p.quantidade_kg, 0)} kg</td>
                  <td className="px-4 py-3 text-right text-gray-500">
                    {p.umidade_percentual != null ? `${p.umidade_percentual}%` : '--'}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      p.destino === 'venda'          ? 'bg-green-100 text-green-700' :
                      p.destino === 'consumo_proprio' ? 'bg-yellow-100 text-yellow-700' :
                      'bg-blue-100 text-blue-700'
                    }`}>
                      {DESTINO_LABEL[p.destino]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">{p.preco_venda_kg ? `R$ ${fmt(p.preco_venda_kg, 4)}` : '--'}</td>
                  <td className="px-4 py-3 text-right font-semibold text-green-700">
                    {p.destino === 'venda' && p.preco_venda_kg
                      ? fmtBRL(p.quantidade_kg * p.preco_venda_kg)
                      : '--'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showModal && (
        <ModalColheita
          safraId={safraId}
          onClose={() => setShowModal(false)}
          onSaved={() => {
            setShowModal(false);
            setLoading(true);
            fetch(`${API}/agricultura/safras/${safraId}/producao`)
              .then(r => r.json())
              .then(data => { setProducoes(data); setLoading(false); });
            onRegistrar();
          }}
        />
      )}
    </div>
  );
}

// ─── Modal Colheita ──────────────────────────────────────────────────────────

function ModalColheita({ safraId, onClose, onSaved }: {
  safraId: number; onClose: () => void; onSaved: () => void;
}) {
  const [form, setForm] = useState({
    data_colheita: new Date().toISOString().slice(0, 10),
    quantidade_kg: '',
    umidade_percentual: '',
    qualidade: '',
    preco_venda_kg: '',
    destino: 'venda',
    observacoes: '',
  });
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState('');

  const receitaCalculada =
    form.destino === 'venda' && form.quantidade_kg && form.preco_venda_kg
      ? parseFloat(form.quantidade_kg) * parseFloat(form.preco_venda_kg)
      : null;

  async function salvar() {
    if (!form.data_colheita || !form.quantidade_kg) {
      setErro('Preencha data e quantidade.');
      return;
    }
    setSaving(true);
    setErro('');
    try {
      const res = await fetch(`${API}/agricultura/safras/${safraId}/producao`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data_colheita: form.data_colheita,
          quantidade_kg: parseFloat(form.quantidade_kg),
          umidade_percentual: form.umidade_percentual ? parseFloat(form.umidade_percentual) : null,
          qualidade: form.qualidade || null,
          preco_venda_kg: form.preco_venda_kg ? parseFloat(form.preco_venda_kg) : null,
          destino: form.destino,
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
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="border-b border-gray-100 px-6 py-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">Registrar Colheita</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">x</button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {erro && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{erro}</div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Data Colheita *</label>
              <input type="date" value={form.data_colheita}
                onChange={e => setForm({ ...form, data_colheita: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Quantidade (kg) *</label>
              <input type="number" min="0.01" step="0.01" value={form.quantidade_kg}
                onChange={e => setForm({ ...form, quantidade_kg: e.target.value })}
                placeholder="0"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Umidade (%)</label>
              <input type="number" step="0.1" value={form.umidade_percentual}
                onChange={e => setForm({ ...form, umidade_percentual: e.target.value })}
                placeholder="14,0"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Qualidade</label>
              <input value={form.qualidade}
                onChange={e => setForm({ ...form, qualidade: e.target.value })}
                placeholder="tipo_1, peneira 13..."
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Destino</label>
            <div className="flex gap-4">
              {[
                { v: 'venda',           l: 'Venda' },
                { v: 'estoque',         l: 'Estoque' },
                { v: 'consumo_proprio', l: 'Consumo próprio' },
              ].map(opt => (
                <label key={opt.v} className="flex items-center gap-1.5 cursor-pointer">
                  <input type="radio" value={opt.v} checked={form.destino === opt.v}
                    onChange={e => setForm({ ...form, destino: e.target.value })}
                    className="accent-green-600"
                  />
                  <span className="text-sm text-gray-700">{opt.l}</span>
                </label>
              ))}
            </div>
          </div>

          {form.destino === 'consumo_proprio' && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-2 text-xs text-yellow-700">
              Consumo próprio não gera lançamento de receita no LCDPR.
            </div>
          )}

          {form.destino === 'venda' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Preço/kg (R$)</label>
              <input type="number" step="0.0001" value={form.preco_venda_kg}
                onChange={e => setForm({ ...form, preco_venda_kg: e.target.value })}
                placeholder="0,0000"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500"
              />
              {receitaCalculada != null && (
                <p className="text-xs text-green-700 mt-1 font-medium">
                  Receita calculada: R$ {receitaCalculada.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </p>
              )}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Observações</label>
            <textarea rows={2} value={form.observacoes}
              onChange={e => setForm({ ...form, observacoes: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500"
            />
          </div>
        </div>

        <div className="border-t border-gray-100 px-6 py-4 flex gap-3 justify-end">
          <button onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">
            Cancelar
          </button>
          <button onClick={salvar} disabled={saving}
            className="px-6 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg disabled:opacity-50">
            {saving ? 'Salvando...' : 'Registrar'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Pagina Principal ────────────────────────────────────────────────────────


// ─── Modal Novo Lançamento ───────────────────────────────────────────────────

function ModalNovoLancamento({ safraId, imovelId, onClose, onSaved }: {
  safraId: number; imovelId: number; onClose: () => void; onSaved: () => void;
}) {
  const [form, setForm] = useState({
    descricao: '',
    valor: '',
    data: new Date().toISOString().slice(0, 10),
    tipo: 'despesa',
  });
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState('');

  async function salvar() {
    if (!form.descricao || !form.valor || !form.data) {
      setErro('Preencha descrição, valor e data.');
      return;
    }
    setSaving(true);
    setErro('');
    try {
      // Buscar produtor_id do imovel
      const resProdutor = await fetch(`${API}/participacoes/${imovelId}`).catch(() => null);
      let produtor_id = 1; // fallback
      if (resProdutor && resProdutor.ok) {
        const participacoes = await resProdutor.json();
        if (Array.isArray(participacoes) && participacoes.length > 0) {
          produtor_id = participacoes[0].produtor_id;
        }
      }

      const valorAbs = Math.abs(parseFloat(form.valor));
      const valorFinal = form.tipo === 'despesa' ? -valorAbs : valorAbs;

      // Conta LCDPR por tipo
      const contaCodigo = form.tipo === 'despesa' ? '4.1'
        : form.tipo === 'receita' ? '1.1'
        : '5.3'; // investimento

      const res = await fetch(`${API}/lancamentos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          produtor_id,
          conta_codigo: contaCodigo,
          tipo: form.tipo,
          descricao: form.descricao,
          valor: valorFinal,
          data_lancamento: form.data,
          origem: 'agricultura',
          confirmado: true,
          atividade: 'rural',
          safra_id: safraId,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setErro(err.detail ?? `Erro ao salvar: ${res.status}`);
        return;
      }
      onSaved();
    } catch(e) {
      setErro('Erro de conexão');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="border-b border-gray-100 px-6 py-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">Novo Lançamento</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {erro && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{erro}</div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
            <div className="flex gap-4">
              {[
                { v: 'despesa',  l: 'Despesa',  color: 'text-red-600' },
                { v: 'receita',  l: 'Receita',  color: 'text-green-600' },
                { v: 'investimento', l: 'Investimento', color: 'text-blue-600' },
              ].map(opt => (
                <label key={opt.v} className="flex items-center gap-1.5 cursor-pointer">
                  <input type="radio" value={opt.v} checked={form.tipo === opt.v}
                    onChange={e => setForm({ ...form, tipo: e.target.value })}
                    className="accent-green-600"
                  />
                  <span className={`text-sm font-medium ${opt.color}`}>{opt.l}</span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Descrição *</label>
            <input
              value={form.descricao}
              onChange={e => setForm({ ...form, descricao: e.target.value })}
              placeholder="Ex: Sementes, Fertilizante, Colheita terceirizada..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Valor (R$) *</label>
              <input
                type="number" step="0.01" min="0.01"
                value={form.valor}
                onChange={e => setForm({ ...form, valor: e.target.value })}
                placeholder="0,00"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Data *</label>
              <input
                type="date"
                value={form.data}
                onChange={e => setForm({ ...form, data: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500"
              />
            </div>
          </div>

          <div className="bg-gray-50 rounded-lg px-4 py-3 text-sm text-gray-500">
            {form.tipo === 'despesa' && <span>💸 Será registrado como <strong className="text-red-600">-R$ {form.valor || '0,00'}</strong> no LCDPR</span>}
            {form.tipo === 'receita' && <span>💰 Será registrado como <strong className="text-green-600">+R$ {form.valor || '0,00'}</strong> no LCDPR</span>}
            {form.tipo === 'investimento' && <span>🏗️ Investimento — depreciável, conta separada no LCDPR</span>}
          </div>
        </div>

        <div className="border-t border-gray-100 px-6 py-4 flex gap-3 justify-end">
          <button onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">
            Cancelar
          </button>
          <button onClick={salvar} disabled={saving}
            className="px-6 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg disabled:opacity-50">
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function SafraDetailPage() {
  const params = useParams();
  const router = useRouter();
  const safraId = Number(params?.safra_id);

  const [safra, setSafra] = useState<any>(null);
  const [dre, setDre] = useState<any>(null);
  const [tab, setTab] = useState<'dre' | 'lancamentos' | 'colheita'>('dre');
  const [loading, setLoading] = useState(true);

  async function fetchData() {
    const [resSafra, resDre] = await Promise.all([
      fetch(`${API}/agricultura/safras/${safraId}`),
      fetch(`${API}/agricultura/safras/${safraId}/dre`),
    ]);
    if (resSafra.ok) setSafra(await resSafra.json());
    if (resDre.ok) setDre(await resDre.json());
    setLoading(false);
  }

  useEffect(() => { fetchData(); }, [safraId]);

  if (loading) return <div className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-400">Carregando...</div>;
  if (!safra)  return <div className="p-8 text-red-600">Safra não encontrada.</div>;

  const cfg = STATUS_CONFIG[safra.status] ?? STATUS_CONFIG.planejada;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-6xl mx-auto">
          <button
            onClick={() => router.push('/agricultura')}
            className="text-sm text-gray-400 hover:text-gray-600 mb-3 flex items-center gap-1"
          >
            &larr; Agricultura
          </button>

          <div className="flex items-start justify-between flex-wrap gap-4">
            <div>
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-2xl font-bold text-gray-900">{safra.cultura}</h1>
                <StatusBadge status={safra.status} />
                <span className="text-sm text-gray-400 bg-gray-100 px-2.5 py-0.5 rounded-full">
                  Safra {safra.ano_safra}
                </span>
              </div>
              <div className="flex gap-4 mt-2 text-sm text-gray-500 flex-wrap">
                <span>{fmt(safra.area_ha, 1)} ha</span>
                <span>Gestao: {safra.tipo_gestao}</span>
                {safra.data_plantio && <span>Plantio: {fmtDate(safra.data_plantio)}</span>}
                {safra.data_colheita_prevista && <span>Colheita prev.: {fmtDate(safra.data_colheita_prevista)}</span>}
                {safra.data_colheita_real && <span className="text-green-600 font-medium">Colheita real: {fmtDate(safra.data_colheita_real)}</span>}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b border-gray-200 px-6">
        <div className="max-w-6xl mx-auto flex gap-1">
          {([
            { k: 'dre',         l: 'DRE / Resultados' },
            { k: 'lancamentos', l: 'Lançamentos' },
            { k: 'colheita',    l: 'Colheita' },
          ] as const).map(t => (
            <button
              key={t.k}
              onClick={() => setTab(t.k)}
              className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
                tab === t.k
                  ? 'border-green-600 text-green-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {t.l}
            </button>
          ))}
        </div>
      </div>

      {/* Conteudo */}
      <div className="max-w-6xl mx-auto px-6 py-6">
        {tab === 'dre' && dre && <TabDRE dre={dre} safra={safra} />}
        {tab === 'lancamentos' && <TabLancamentos safraId={safraId} imovelId={safra?.imovel_id ?? 1} />}
        {tab === 'colheita' && (
          <TabColheita
            safraId={safraId}
            safraStatus={safra.status}
            onRegistrar={fetchData}
          />
        )}
      </div>
    </div>
  );
}
