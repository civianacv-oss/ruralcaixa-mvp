"use client";
import { apiFetch } from "@/lib/api";
import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";

const API = "https://ruralcaixa-mvp-production.up.railway.app";
const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtPer = (p: string) => {
  const [y, m] = p.split("-");
  const meses = ["","Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
  return `${meses[parseInt(m)]}/${y}`;
};

type Resumo = {
  per_apur: string;
  s1260: { qtd: number; vr_bruto: number; vr_rat: number; vr_senar: number };
  s1200: { qtd: number; vr_salarios: number; vr_inss: number; vr_liquido: number };
  trabalhadores_ativos: number;
};

type S1260 = { id: number; per_apur: string; nif_adquirente: string; nome_adquirente: string; vr_bruto_comerc: number; vr_rat: number; vr_senar: number; status: string };
type S1200 = { id: number; per_apur: string; nome: string; cpf: string; vr_salario: number; vr_desconto_inss: number; vr_liquido: number; qtd_dias_trab: number; status: string };
type Trabalhador = { id: number; nome: string; cpf: string; cargo: string; data_admissao: string; data_demissao: string | null; ativo: boolean; categoria: string; municipio: string; uf: string };

function StatusBadge({ status }: { status: string }) {
  const cores: Record<string, string> = {
    pendente: "bg-amber-100 text-amber-700",
    enviado: "bg-blue-100 text-blue-700",
    processado: "bg-green-100 text-green-700",
    erro: "bg-red-100 text-red-700",
  };
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cores[status] || "bg-gray-100 text-gray-600"}`}>{status}</span>;
}

function ESocialContent() {
  const searchParams = useSearchParams();
  const produtorId = searchParams.get("produtor_id") || "1";

  const [aba, setAba] = useState<"resumo" | "s1260" | "s1200" | "trabalhadores">("resumo");
  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [s1260, setS1260] = useState<S1260[]>([]);
  const [s1200, setS1200] = useState<S1200[]>([]);
  const [trabalhadores, setTrabalhadores] = useState<Trabalhador[]>([]);
  const [loading, setLoading] = useState(true);
  const [produtor, setProdutor] = useState<any>(null);

  // Form novo trabalhador
  const [showForm, setShowForm] = useState(false);
  const [formTrab, setFormTrab] = useState({ cpf: "", nome: "", data_admissao: "", cargo: "Trabalhador Rural", municipio: "", uf: "SP", categoria: "701" });
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    Promise.all([
      apiFetch(`${API}/produtores/${produtorId}/esocial/resumo`).then(r => r.json()),
      apiFetch(`${API}/produtores/${produtorId}/esocial/s1260`).then(r => r.json()),
      apiFetch(`${API}/produtores/${produtorId}/esocial/s1200`).then(r => r.json()),
      apiFetch(`${API}/produtores/${produtorId}/esocial/trabalhadores`).then(r => r.json()),
      apiFetch(`${API}/produtores/${produtorId}/esocial/config`).then(r => r.json()),
    ]).then(([res, s26, s12, trab, cfg]) => {
      setResumo(res);
      setS1260(s26);
      setS1200(s12);
      setTrabalhadores(trab);
      setProdutor(cfg.produtor);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [produtorId]);

  async function adicionarTrabalhador() {
    setSalvando(true);
    await apiFetch(`${API}/produtores/${produtorId}/esocial/trabalhadores`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(formTrab),
    });
    const trab = await apiFetch(`${API}/produtores/${produtorId}/esocial/trabalhadores`).then(r => r.json());
    setTrabalhadores(trab);
    setShowForm(false);
    setSalvando(false);
  }

  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-gray-400 text-sm">Carregando eSocial...</div>
    </div>
  );

  // Calcula DRE integrado
  const vr_bruto = resumo?.s1260.vr_bruto || 0;
  const vr_rat = resumo?.s1260.vr_rat || 0;
  const vr_senar = resumo?.s1260.vr_senar || 0;
  const total_impostos = vr_rat + vr_senar;
  const receita_liquida = vr_bruto - total_impostos;
  const folha = resumo?.s1200.vr_salarios || 0;
  const inss_folha = resumo?.s1200.vr_inss || 0;
  const resultado = receita_liquida - folha;
  const margem = vr_bruto > 0 ? (resultado / vr_bruto * 100) : 0;

  const abas = [
    { id: "resumo", label: "Resumo" },
    { id: "s1260", label: `S-1260 (${s1260.length})` },
    { id: "s1200", label: `S-1200 (${s1200.length})` },
    { id: "trabalhadores", label: `Trabalhadores (${trabalhadores.length})` },
  ];

  return (
    <div className="min-h-screen bg-gray-50 max-w-md mx-auto pb-10">

      {/* Header */}
      <div className="bg-green-800 text-white px-4 py-4">
        <a href={`/contador?produtor_id=${produtorId}`} className="text-xs opacity-70">← Voltar</a>
        <div className="text-lg font-medium mt-1">eSocial Rural</div>
        <div className="text-xs opacity-70">{produtor?.nome} · Homologação S-1.3</div>
      </div>

      {/* Abas */}
      <div className="bg-white border-b border-gray-200 px-2 flex gap-1 overflow-x-auto">
        {abas.map(a => (
          <button key={a.id} onClick={() => setAba(a.id as any)}
            className={`px-3 py-3 text-xs font-medium whitespace-nowrap border-b-2 transition-colors ${
              aba === a.id ? "border-green-700 text-green-800" : "border-transparent text-gray-500"
            }`}>
            {a.label}
          </button>
        ))}
      </div>

      <div className="p-4 space-y-4">

        {/* ── ABA RESUMO ── */}
        {aba === "resumo" && resumo && (
          <>
            {/* Cards principais */}
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "Comercializações", value: resumo.s1260.qtd, sub: "registros S-1260", color: "text-green-700" },
                { label: "Trabalhadores", value: resumo.trabalhadores_ativos, sub: "ativos", color: "text-blue-700" },
              ].map((c, i) => (
                <div key={i} className="bg-white rounded-xl p-4 shadow-sm">
                  <div className={`text-2xl font-bold ${c.color}`}>{c.value}</div>
                  <div className="text-xs text-gray-500 mt-1">{c.label}</div>
                  <div className="text-xs text-gray-400">{c.sub}</div>
                </div>
              ))}
            </div>

            {/* DRE Integrado eSocial */}
            <div className="bg-white rounded-xl p-4 shadow-sm space-y-3">
              <div className="text-sm font-semibold text-gray-800 flex items-center gap-2">
                📊 DRE Integrado eSocial
                <span className="text-xs font-normal text-gray-400">— impacto previdenciário</span>
              </div>

              <div className="space-y-2">
                {/* Receita bruta */}
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Receita bruta (S-1260)</span>
                  <span className="font-semibold text-green-700">{fmt(vr_bruto)}</span>
                </div>

                {/* Deduções */}
                <div className="bg-amber-50 rounded-lg p-3 space-y-1.5">
                  <div className="text-xs font-medium text-amber-700 mb-1">Deduções previdenciárias</div>
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-500">FUNRURAL / RAT (1,5%)</span>
                    <span className="text-amber-600">— {fmt(vr_rat)}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-500">SENAR (0,2%)</span>
                    <span className="text-amber-600">— {fmt(vr_senar)}</span>
                  </div>
                  <div className="flex justify-between text-xs font-medium border-t border-amber-200 pt-1.5">
                    <span>Total encargos s/ comercialização</span>
                    <span className="text-amber-700">— {fmt(total_impostos)}</span>
                  </div>
                </div>

                {/* Receita líquida */}
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Receita líquida</span>
                  <span className="font-medium">{fmt(receita_liquida)}</span>
                </div>

                {/* Folha */}
                <div className="bg-blue-50 rounded-lg p-3 space-y-1.5">
                  <div className="text-xs font-medium text-blue-700 mb-1">Custo de pessoal (S-1200)</div>
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-500">Salários brutos</span>
                    <span className="text-blue-600">— {fmt(folha)}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-500">INSS retido trabalhadores</span>
                    <span className="text-blue-600">({fmt(inss_folha)})</span>
                  </div>
                </div>

                {/* Resultado */}
                <div className={`flex justify-between items-center p-3 rounded-xl ${resultado >= 0 ? "bg-green-50" : "bg-red-50"}`}>
                  <div>
                    <div className="text-sm font-semibold">Resultado líquido</div>
                    <div className="text-xs text-gray-400">Margem {margem.toFixed(1)}%</div>
                  </div>
                  <div className={`text-lg font-bold ${resultado >= 0 ? "text-green-700" : "text-red-600"}`}>
                    {fmt(resultado)}
                  </div>
                </div>
              </div>
            </div>

            {/* Cards S-1260 e S-1200 */}
            <div className="bg-white rounded-xl p-4 shadow-sm">
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">S-1260 — Comercialização</div>
              <div className="grid grid-cols-3 gap-2 text-center">
                {[
                  { label: "Bruto", value: fmt(vr_bruto), color: "text-green-700" },
                  { label: "FUNRURAL", value: fmt(vr_rat), color: "text-amber-600" },
                  { label: "SENAR", value: fmt(vr_senar), color: "text-amber-600" },
                ].map((c, i) => (
                  <div key={i} className="bg-gray-50 rounded-lg p-2">
                    <div className={`text-sm font-bold ${c.color}`}>{c.value}</div>
                    <div className="text-xs text-gray-400 mt-0.5">{c.label}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-xl p-4 shadow-sm">
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">S-1200 — Folha de Pagamento</div>
              <div className="grid grid-cols-3 gap-2 text-center">
                {[
                  { label: "Salários", value: fmt(folha), color: "text-blue-700" },
                  { label: "INSS", value: fmt(inss_folha), color: "text-amber-600" },
                  { label: "Líquido", value: fmt(resumo.s1200.vr_liquido), color: "text-green-700" },
                ].map((c, i) => (
                  <div key={i} className="bg-gray-50 rounded-lg p-2">
                    <div className={`text-sm font-bold ${c.color}`}>{c.value}</div>
                    <div className="text-xs text-gray-400 mt-0.5">{c.label}</div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* ── ABA S-1260 ── */}
        {aba === "s1260" && (
          <div className="space-y-3">
            <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-xs text-green-800">
              <strong>S-1260</strong> — Comercialização da Produção Rural PF. Registra cada venda e calcula automaticamente FUNRURAL (1,5%) e SENAR (0,2%).
            </div>
            {s1260.length === 0 ? (
              <div className="text-center text-gray-400 py-8 text-sm">Nenhuma comercialização registrada</div>
            ) : (
              s1260.map(r => (
                <div key={r.id} className="bg-white rounded-xl p-4 shadow-sm">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <div className="text-sm font-semibold">{fmtPer(r.per_apur)}</div>
                      <div className="text-xs text-gray-400">{r.nome_adquirente || r.nif_adquirente}</div>
                    </div>
                    <StatusBadge status={r.status} />
                  </div>
                  <div className="grid grid-cols-3 gap-2 mt-3">
                    <div className="bg-gray-50 rounded-lg p-2 text-center">
                      <div className="text-sm font-bold text-green-700">{fmt(r.vr_bruto_comerc)}</div>
                      <div className="text-xs text-gray-400">Bruto</div>
                    </div>
                    <div className="bg-amber-50 rounded-lg p-2 text-center">
                      <div className="text-sm font-bold text-amber-600">{fmt(r.vr_rat)}</div>
                      <div className="text-xs text-gray-400">FUNRURAL</div>
                    </div>
                    <div className="bg-amber-50 rounded-lg p-2 text-center">
                      <div className="text-sm font-bold text-amber-600">{fmt(r.vr_senar)}</div>
                      <div className="text-xs text-gray-400">SENAR</div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* ── ABA S-1200 ── */}
        {aba === "s1200" && (
          <div className="space-y-3">
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-800">
              <strong>S-1200</strong> — Remuneração do Trabalhador Rural. Registra salários, descontos de INSS e dias trabalhados por período.
            </div>
            {s1200.length === 0 ? (
              <div className="text-center text-gray-400 py-8 text-sm">Nenhuma remuneração registrada</div>
            ) : (
              s1200.map(r => (
                <div key={r.id} className="bg-white rounded-xl p-4 shadow-sm">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <div className="text-sm font-semibold">{r.nome}</div>
                      <div className="text-xs text-gray-400">CPF: {r.cpf} · {fmtPer(r.per_apur)} · {r.qtd_dias_trab}d</div>
                    </div>
                    <StatusBadge status={r.status} />
                  </div>
                  <div className="grid grid-cols-3 gap-2 mt-3">
                    <div className="bg-gray-50 rounded-lg p-2 text-center">
                      <div className="text-sm font-bold text-blue-700">{fmt(r.vr_salario)}</div>
                      <div className="text-xs text-gray-400">Salário</div>
                    </div>
                    <div className="bg-amber-50 rounded-lg p-2 text-center">
                      <div className="text-sm font-bold text-amber-600">— {fmt(r.vr_desconto_inss)}</div>
                      <div className="text-xs text-gray-400">INSS</div>
                    </div>
                    <div className="bg-green-50 rounded-lg p-2 text-center">
                      <div className="text-sm font-bold text-green-700">{fmt(r.vr_liquido)}</div>
                      <div className="text-xs text-gray-400">Líquido</div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* ── ABA TRABALHADORES ── */}
        {aba === "trabalhadores" && (
          <div className="space-y-3">
            {trabalhadores.map(t => (
              <div key={t.id} className="bg-white rounded-xl p-4 shadow-sm">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-sm font-semibold">{t.nome}</div>
                    <div className="text-xs text-gray-400">CPF: {t.cpf}</div>
                    <div className="text-xs text-gray-400">{t.cargo} · CBO {t.categoria}</div>
                    <div className="text-xs text-gray-400">Admissão: {new Date(t.data_admissao).toLocaleDateString("pt-BR")}</div>
                    {t.municipio && <div className="text-xs text-gray-400">{t.municipio}-{t.uf}</div>}
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${t.ativo ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                    {t.ativo ? "Ativo" : "Inativo"}
                  </span>
                </div>
              </div>
            ))}

            {!showForm ? (
              <button onClick={() => setShowForm(true)}
                className="w-full py-3 rounded-xl border border-dashed border-gray-300 text-sm text-gray-500">
                + Adicionar trabalhador
              </button>
            ) : (
              <div className="bg-white rounded-xl p-4 shadow-sm space-y-3">
                <div className="text-sm font-semibold text-gray-800">Novo Trabalhador</div>
                {[
                  { label: "CPF *", field: "cpf", placeholder: "000.000.000-00" },
                  { label: "Nome completo *", field: "nome", placeholder: "Nome do trabalhador" },
                  { label: "Data de admissão *", field: "data_admissao", placeholder: "YYYY-MM-DD" },
                  { label: "Cargo", field: "cargo", placeholder: "Trabalhador Rural" },
                  { label: "Município", field: "municipio", placeholder: "Cidade" },
                ].map(f => (
                  <div key={f.field}>
                    <label className="text-xs text-gray-500">{f.label}</label>
                    <input value={(formTrab as any)[f.field]}
                      onChange={e => setFormTrab({ ...formTrab, [f.field]: e.target.value })}
                      placeholder={f.placeholder}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 mt-0.5 text-sm" />
                  </div>
                ))}
                <div>
                  <label className="text-xs text-gray-500">UF</label>
                  <select value={formTrab.uf} onChange={e => setFormTrab({ ...formTrab, uf: e.target.value })}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 mt-0.5 text-sm">
                    {["SP","MG","GO","MT","MS","BA","PR","RS","SC","MA","PA","TO"].map(u => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                  </select>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setShowForm(false)} className="flex-1 py-2 rounded-lg border border-gray-200 text-sm">Cancelar</button>
                  <button onClick={adicionarTrabalhador} disabled={salvando}
                    className="flex-1 py-2 rounded-lg text-sm font-medium text-white bg-green-800 disabled:bg-gray-400">
                    {salvando ? "..." : "Adicionar"}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}

export default function ESocialPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-50 flex items-center justify-center"><div className="text-gray-400">Carregando...</div></div>}>
      <ESocialContent />
    </Suspense>
  );
}
