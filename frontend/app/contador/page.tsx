"use client";
import { useState, useEffect } from "react";

const API = "https://ruralcaixa-mvp-production.up.railway.app";

type Produtor = {
  id: number; nome: string; cpf: string; telefone: string;
  municipio: string; uf: string; receita: number; despesa: number; pendentes: number;
};

type Lancamento = {
  id: number; tipo: string; conta_codigo: string; descricao: string;
  valor: number; data_lancamento: string; produto: string | null;
  documento_url: string | null; confirmado: boolean;
};

type Terceiro = {
  id: number; nome_contraparte: string; id_contraparte: string;
  tipo_contraparte: string; perc_contraparte: number;
  nome?: string; documento?: string; tipo?: string; percentual?: number;
};

type Alerta = {
  nivel: "erro" | "aviso";
  mensagem: string;
  detalhe?: string;
  acao?: { label: string; href: string };
};

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// Validacao CPF
function validarCPF(cpf: string): boolean {
  const c = cpf.replace(/\D/g, "");
  if (c.length !== 11 || /^(\d)\1+$/.test(c)) return false;
  let soma = 0;
  for (let i = 0; i < 9; i++) soma += parseInt(c[i]) * (10 - i);
  let resto = (soma * 10) % 11;
  if (resto === 10 || resto === 11) resto = 0;
  if (resto !== parseInt(c[9])) return false;
  soma = 0;
  for (let i = 0; i < 10; i++) soma += parseInt(c[i]) * (11 - i);
  resto = (soma * 10) % 11;
  if (resto === 10 || resto === 11) resto = 0;
  return resto === parseInt(c[10]);
}

function validarCNPJ(cnpj: string): boolean {
  const c = cnpj.replace(/\D/g, "");
  if (c.length !== 14 || /^(\d)\1+$/.test(c)) return false;
  const calc = (s: string, p: number[]) => {
    const soma = s.split("").reduce((acc, d, i) => acc + parseInt(d) * p[i], 0);
    const r = soma % 11;
    return r < 2 ? 0 : 11 - r;
  };
  const p1 = [5,4,3,2,9,8,7,6,5,4,3,2];
  const p2 = [6,5,4,3,2,9,8,7,6,5,4,3,2];
  return calc(c.slice(0,12), p1) === parseInt(c[12]) &&
         calc(c.slice(0,13), p2) === parseInt(c[13]);
}

function validarDocumento(doc: string): { valido: boolean; tipo: string } {
  const limpo = doc.replace(/\D/g, "");
  if (limpo.length === 11) return { valido: validarCPF(limpo), tipo: "CPF" };
  if (limpo.length === 14) return { valido: validarCNPJ(limpo), tipo: "CNPJ" };
  if (limpo.length === 0) return { valido: false, tipo: "ausente" };
  return { valido: false, tipo: "invalido" };
}

// Badge de alerta
function AlertaBadge({ alertas }: { alertas: Alerta[] }) {
  const erros = alertas.filter(a => a.nivel === "erro").length;
  const avisos = alertas.filter(a => a.nivel === "aviso").length;
  if (alertas.length === 0) return null;
  return (
    <div className="flex gap-1.5">
      {erros > 0 && (
        <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium">
          {erros} erro{erros > 1 ? "s" : ""}
        </span>
      )}
      {avisos > 0 && (
        <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">
          {avisos} aviso{avisos > 1 ? "s" : ""}
        </span>
      )}
    </div>
  );
}

// Painel de alertas
function PainelAlertas({ alertas, produtorId }: { alertas: Alerta[]; produtorId: number }) {
  const [expandido, setExpandido] = useState(true);
  if (alertas.length === 0) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-center gap-3">
        <span className="text-green-600 text-lg">&#10003;</span>
        <div>
          <div className="text-sm font-medium text-green-800">Conformidade OK</div>
          <div className="text-xs text-green-600">Nenhuma pendencia para o Registro 0045</div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm overflow-hidden">
      <button onClick={() => setExpandido(e => !e)}
        className="w-full flex items-center justify-between px-4 py-3 bg-amber-50 border-l-4 border-amber-400">
        <div className="flex items-center gap-2">
          <span className="text-amber-600">&#9888;</span>
          <span className="text-sm font-semibold text-amber-800">
            Alertas de Conformidade &mdash; Reg. 0045
          </span>
        </div>
        <div className="flex items-center gap-2">
          <AlertaBadge alertas={alertas} />
          <svg className={`w-4 h-4 text-gray-400 transition-transform ${expandido ? "rotate-90" : ""}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </div>
      </button>

      {expandido && (
        <div className="divide-y divide-gray-50">
          {alertas.map((a, i) => (
            <div key={i} className={`px-4 py-3 flex items-start gap-3 ${
              a.nivel === "erro" ? "bg-red-50/50" : "bg-amber-50/30"
            }`}>
              <span className={`text-base mt-0.5 flex-shrink-0 ${
                a.nivel === "erro" ? "text-red-500" : "text-amber-500"
              }`}>
                {a.nivel === "erro" ? "✕;" : "!"}
              </span>
              <div className="flex-1 min-w-0">
                <div className={`text-xs font-semibold ${
                  a.nivel === "erro" ? "text-red-700" : "text-amber-700"
                }`}>
                  {a.mensagem}
                </div>
                {a.detalhe && (
                  <div className="text-xs text-gray-500 mt-0.5">{a.detalhe}</div>
                )}
                {a.acao && (
                  <a href={a.acao.href}
                    className="inline-block mt-1.5 text-xs text-blue-600 underline underline-offset-2">
                    {a.acao.label} &rarr;
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="px-4 py-2.5 bg-gray-50 border-t border-gray-100">
        <p className="text-xs text-gray-400">
          O Registro 0045 do LCDPR exige CPF/CNPJ valido de todos os participantes em condominios e parcerias.
        </p>
      </div>
    </div>
  );
}

// Componente principal
export default function Contador() {
  const [produtores, setProdutores] = useState<Produtor[]>([]);
  const [selecionado, setSelecionado] = useState<number | null>(null);
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([]);
  const [terceiros, setTerceiros] = useState<Terceiro[]>([]);
  const [alertas, setAlertas] = useState<Alerta[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingLanc, setLoadingLanc] = useState(false);
  const [fechando, setFechando] = useState(false);
  const [abaDetalhe, setAbaDetalhe] = useState<"lancamentos" | "acoes" | "conformidade">("lancamentos");

  const produtor = produtores.find(p => p.id === selecionado);

  useEffect(() => {
    fetch(`${API}/produtores`)
      .then(r => r.json())
      .then(data => { setProdutores(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selecionado) return;
    setLoadingLanc(true);
    Promise.all([
      fetch(`${API}/produtores/${selecionado}/lancamentos`).then(r => r.json()),
      fetch(`${API}/produtor/imoveis?cpf=${produtores.find(p => p.id === selecionado)?.cpf?.replace(/\D/g,"") || ""}`).then(r => r.json()).catch(() => []),
    ]).then(async ([lancs, imoveis]) => {
      setLancamentos(lancs);

      const todosImoveis = Array.isArray(imoveis) ? imoveis : [];
      const validacaoPromises = todosImoveis.map((im: { id: number }) =>
        fetch(`${API}/imoveis/${im.id}/terceiros/validacao`).then(r => r.json()).catch(() => null)
      );
      const validacoes = (await Promise.all(validacaoPromises)).filter(Boolean);
      const todosTerceiros = validacoes.flatMap((v: { terceiros?: unknown[] }) => v.terceiros || []);
      setTerceiros(todosTerceiros as Terceiro[]);

      const novosAlertas: Alerta[] = [];

      todosTerceiros.forEach((t: unknown) => {
        const terceiro = t as { documento?: string; id_contraparte?: string; nome?: string; nome_contraparte?: string; tipo?: string; tipo_contraparte?: string; percentual?: number; perc_contraparte?: number };
        const doc = (terceiro.documento || terceiro.id_contraparte || "").replace(/\D/g, "");
        const { valido, tipo } = validarDocumento(doc);

        if (tipo === "ausente") {
          novosAlertas.push({
            nivel: "erro",
            mensagem: `${terceiro.nome || terceiro.nome_contraparte}: CPF/CNPJ ausente`,
            detalhe: `${terceiro.tipo || terceiro.tipo_contraparte} com ${terceiro.percentual || terceiro.perc_contraparte}% - obrigatorio para o Registro 0045`,
            acao: { label: "Corrigir participante", href: `/terceiros?imovel_id=${todosImoveis[0]?.id || 1}&produtor_id=${selecionado}` },
          });
        } else if (!valido) {
          novosAlertas.push({
            nivel: "erro",
            mensagem: `${terceiro.nome || terceiro.nome_contraparte}: ${tipo} invalido (${doc})`,
            detalhe: `Digito verificador incorreto - Registro 0045 sera rejeitado pela Receita Federal`,
            acao: { label: "Corrigir participante", href: `/terceiros?imovel_id=${todosImoveis[0]?.id || 1}&produtor_id=${selecionado}` },
          });
        }
      });

      const semImovel = (lancs as Lancamento[]).filter((l) => !(l as unknown as { imovel_id?: number }).imovel_id && l.confirmado);
      if (semImovel.length > 0) {
        novosAlertas.push({
          nivel: "aviso",
          mensagem: `${semImovel.length} lancamento(s) sem imovel vinculado`,
          detalhe: "O LCDPR exige que cada lancamento esteja associado a um imovel rural (Registro 0040)",
          acao: { label: "Ver lancamentos", href: `/cadastro?produtor_id=${selecionado}` },
        });
      }

      for (const v of validacoes as { total_geral?: number; total_ok?: boolean; terceiros?: unknown[] }[]) {
        const totalGeral = v.total_geral ?? 0;
        if (!v.total_ok) {
          novosAlertas.push({
            nivel: "erro",
            mensagem: `Total de participacoes = ${totalGeral.toFixed(1)}% (deveria ser 100%)`,
            detalhe: "Distribuicao inconsistente invalida o Registro 0045",
            acao: { label: "Corrigir participacoes", href: `/terceiros?imovel_id=${todosImoveis[0]?.id || 1}&produtor_id=${selecionado}` },
          });
        }
      }

      setAlertas(novosAlertas);
      setLoadingLanc(false);
    }).catch(() => setLoadingLanc(false));
  }, [selecionado]);

  async function fecharMes() {
    if (!selecionado) return;
    if (!confirm("Confirma o fechamento do mes?")) return;
    setFechando(true);
    await fetch(`${API}/produtores/${selecionado}/fechar-mes`, { method: "POST" });
    const updated = await fetch(`${API}/produtores`).then(r => r.json());
    setProdutores(updated);
    setFechando(false);
    alert("Mes fechado com sucesso!");
  }

  const totalReceita = produtores.reduce((s, p) => s + p.receita, 0);
  const totalDespesa = produtores.reduce((s, p) => s + p.despesa, 0);
  const totalPendentes = produtores.reduce((s, p) => s + p.pendentes, 0);
  const errosCount = alertas.filter(a => a.nivel === "erro").length;

  return (
    <div className="min-h-screen bg-gray-50 max-w-md mx-auto pb-6">
      <div className="bg-green-800 text-white px-4 py-4">
        <a href="/" className="text-xs opacity-70">&larr; Voltar</a>
        <div className="text-lg font-medium mt-1">Painel do Contador</div>
        <div className="text-xs opacity-70">RuralCaixa</div>
      </div>

      {!selecionado ? (
        <div className="p-4 space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white rounded-xl p-3 text-center shadow-sm">
              <div className="text-xs text-gray-500">Produtores</div>
              <div className="text-2xl font-semibold mt-1 text-gray-800">{produtores.length}</div>
            </div>
            <div className="bg-white rounded-xl p-3 text-center shadow-sm">
              <div className="text-xs text-gray-500">Pendentes</div>
              <div className="text-2xl font-semibold mt-1 text-orange-500">{totalPendentes}</div>
            </div>
            <div className="bg-white rounded-xl p-3 text-center shadow-sm">
              <div className="text-xs text-gray-500">Saldo</div>
              <div className={`text-sm font-semibold mt-1 ${totalReceita - totalDespesa >= 0 ? "text-green-700" : "text-red-600"}`}>
                {fmt(totalReceita - totalDespesa)}
              </div>
            </div>
          </div>

          <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            Clientes &mdash; {new Date().toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}
          </div>

          {loading ? (
            <div className="text-center text-gray-400 py-8">Carregando...</div>
          ) : produtores.length === 0 ? (
            <div className="text-center text-gray-400 py-8">
              <div className="text-4xl mb-2">&#128104;&#8205;&#127806;</div>
              <div>Nenhum produtor cadastrado</div>
              <a href="/cadastro" className="text-green-700 text-sm mt-2 block">+ Cadastrar produtor</a>
            </div>
          ) : (
            produtores.map(p => (
              <button key={p.id}
                onClick={() => { setSelecionado(p.id); setAbaDetalhe("lancamentos"); }}
                className="w-full bg-white rounded-xl p-4 shadow-sm text-left flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium">{p.nome}</div>
                  <div className="text-xs text-gray-400 mt-0.5">{p.cpf} &middot; {p.municipio}-{p.uf}</div>
                  <div className="flex gap-3 mt-1">
                    <span className="text-xs text-green-700">+ {fmt(p.receita)}</span>
                    <span className="text-xs text-red-500">- {fmt(p.despesa)}</span>
                  </div>
                </div>
                <div className="text-right">
                  {p.pendentes > 0 ? (
                    <span className="text-xs px-2 py-1 rounded-full bg-orange-100 text-orange-700">
                      {p.pendentes} pend.
                    </span>
                  ) : (
                    <span className="text-xs px-2 py-1 rounded-full bg-green-100 text-green-700">Ok</span>
                  )}
                  <div className="text-gray-400 mt-1">&rsaquo;</div>
                </div>
              </button>
            ))
          )}

          <a href="/cadastro" className="block w-full py-3 rounded-xl text-sm font-medium text-white bg-green-800 text-center">
            + Cadastrar novo produtor
          </a>
        </div>
      ) : (
        <div className="p-4 space-y-4">
          <button onClick={() => setSelecionado(null)} className="text-green-800 text-sm font-medium">
            &larr; Todos os produtores
          </button>

          {produtor && (
            <>
              <div className="bg-white rounded-xl p-4 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center text-xl">&#127807;</div>
                  <div className="flex-1">
                    <div className="font-medium">{produtor.nome}</div>
                    <div className="text-xs text-gray-400">{produtor.cpf}</div>
                    <div className="text-xs text-gray-400">{produtor.municipio}-{produtor.uf}</div>
                  </div>
                  {alertas.length > 0 && <AlertaBadge alertas={alertas} />}
                </div>
                <div className="grid grid-cols-2 gap-3 mt-4">
                  <div className="bg-green-50 rounded-lg p-3">
                    <div className="text-xs text-gray-500">Receitas</div>
                    <div className="text-sm font-semibold text-green-700 mt-1">{fmt(produtor.receita)}</div>
                  </div>
                  <div className="bg-red-50 rounded-lg p-3">
                    <div className="text-xs text-gray-500">Despesas</div>
                    <div className="text-sm font-semibold text-red-600 mt-1">{fmt(produtor.despesa)}</div>
                  </div>
                </div>
              </div>

              <div className="flex gap-2">
                {[
                  { id: "lancamentos", label: "Lancamentos" },
                  { id: "conformidade", label: `Reg. 0045${errosCount > 0 ? ` (${errosCount})` : ""}` },
                  { id: "acoes", label: "Acoes" },
                ].map(a => (
                  <button key={a.id} onClick={() => setAbaDetalhe(a.id as "lancamentos" | "acoes" | "conformidade")}
                    className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors ${
                      abaDetalhe === a.id
                        ? "bg-green-800 text-white"
                        : a.id === "conformidade" && errosCount > 0
                          ? "bg-red-50 text-red-700 border border-red-200"
                          : "bg-white text-gray-600 border"
                    }`}>
                    {a.label}
                  </button>
                ))}
              </div>

              {abaDetalhe === "lancamentos" && (
                <div className="bg-white rounded-xl p-4 shadow-sm space-y-2">
                  <div className="text-sm font-medium text-gray-600 mb-3">Lancamentos do mes</div>
                  {loadingLanc ? (
                    <div className="text-gray-400 text-sm text-center py-4">Carregando...</div>
                  ) : lancamentos.length === 0 ? (
                    <div className="text-gray-400 text-sm text-center py-4">Nenhum lancamento este mes</div>
                  ) : (
                    lancamentos.map(l => (
                      <div key={l.id} className="flex items-center justify-between py-2 border-b last:border-0">
                        <div>
                          <div className="text-xs font-medium">{l.descricao || l.produto || l.conta_codigo}</div>
                          <div className="text-xs text-gray-400">
                            {l.data_lancamento ? l.data_lancamento.slice(0,10).split("-").reverse().join("/") : ""} &middot; {l.descricao || ""}
                          </div>
                          {l.documento_url && (
                            <a href={l.documento_url} target="_blank" className="text-xs text-blue-500">&#128270; Ver doc</a>
                          )}
                        </div>
                        <div className={`text-sm font-medium ${l.tipo === "receita" ? "text-green-700" : "text-red-500"}`}>
                          {l.tipo === "receita" ? "+" : "-"}{fmt(l.valor)}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {abaDetalhe === "conformidade" && (
                <div className="space-y-3">
                  <PainelAlertas alertas={alertas} produtorId={selecionado} />
                  {terceiros.length > 0 && (
                    <div className="bg-white rounded-xl p-4 shadow-sm">
                      <div className="text-sm font-medium text-gray-700 mb-3">Participantes cadastrados</div>
                      {terceiros.map((t, i) => {
                        const doc = (t.documento || t.id_contraparte || "");
                        const { valido, tipo } = validarDocumento(doc);
                        return (
                          <div key={i} className="flex items-start justify-between py-2.5 border-b last:border-0">
                            <div className="flex items-start gap-2">
                              <span className={`mt-0.5 text-sm flex-shrink-0 ${valido ? "text-green-500" : "text-red-500"}`}>
                                {valido ? "&#10003;" : "✕;"}
                              </span>
                              <div>
                                <div className="text-xs font-medium">{t.nome || t.nome_contraparte}</div>
                                <div className="text-xs text-gray-400">
                                  {t.tipo || t.tipo_contraparte} &middot; {parseFloat(String(t.percentual || t.perc_contraparte || 0)).toFixed(1)}%
                                </div>
                                <div className={`text-xs mt-0.5 ${valido ? "text-gray-400" : "text-red-500"}`}>
                                  {tipo === "ausente" ? "CPF/CNPJ ausente" : !valido ? `${tipo} invalido` : doc}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {abaDetalhe === "acoes" && (
                <div className="bg-white rounded-xl p-4 shadow-sm space-y-1">
                  <div className="text-sm font-medium text-gray-600 mb-3">Acoes do contador</div>
                  <a href={`/analytics?produtor_id=${produtor.id}`}
                    className="w-full flex items-center gap-3 py-3 border-b text-sm hover:bg-gray-50">
                    <span className="text-lg">&#128200;</span>
                    <span>Relatorios analiticos</span>
                    <span className="ml-auto text-gray-400">&rsaquo;</span>
                  </a>
                  <a href={`/esocial?produtor_id=${produtor.id}`} className="w-full flex items-center gap-3 py-3 border-b text-sm hover:bg-gray-50">
                    <span className="text-lg">ES</span><span>eSocial Rural</span><span className="ml-auto text-gray-400">&rsaquo;</span>
                  </a>
                  <a href={`/nfe?produtor_id=${produtor.id}`} className="w-full flex items-center gap-3 py-3 border-b text-sm hover:bg-gray-50">
                    <span className="text-lg">NF</span><span>Emitir NF-e</span><span className="ml-auto text-gray-400">&rsaquo;</span>
                  </a>
                  <a href={`/relatorio?produtor_id=${produtor.id}`}
                    className="w-full flex items-center gap-3 py-3 border-b text-sm hover:bg-gray-50">
                    <span className="text-lg">&#128196;</span>
                    <span>Gerar LCDPR PDF</span>
                    {errosCount > 0 && (
                      <span className="ml-2 text-xs text-red-500">({errosCount} erro{errosCount > 1 ? "s" : ""})</span>
                    )}
                    <span className="ml-auto text-gray-400">&rsaquo;</span>
                  </a>
                  <a href={`/cadastro?produtor_id=${produtor.id}`}
                    className="w-full flex items-center gap-3 py-3 border-b text-sm hover:bg-gray-50">
                    <span className="text-lg">&#9998;&#65039;</span>
                    <span>Editar cadastro</span>
                    <span className="ml-auto text-gray-400">&rsaquo;</span>
                  </a>
                  <button onClick={fecharMes} disabled={fechando}
                    className="w-full flex items-center gap-3 py-3 border-b text-sm hover:bg-gray-50">
                    <span className="text-lg">&#9989;</span>
                    <span>{fechando ? "Fechando..." : "Fechar mes"}</span>
                    <span className="ml-auto text-gray-400">&rsaquo;</span>
                  </button>
                  <button
                    onClick={async () => {
                      if (!confirm(`Excluir ${produtor.nome}? Esta acao nao pode ser desfeita.`)) return;
                      await fetch(`${API}/produtores/${produtor.id}`, { method: "DELETE" });
                      setSelecionado(null);
                      const updated = await fetch(`${API}/produtores`).then(r => r.json());
                      setProdutores(updated);
                    }}
                    className="w-full flex items-center gap-3 py-3 text-sm hover:bg-red-50 text-red-600">
                    <span className="text-lg">&#128465;&#65039;</span>
                    <span>Excluir produtor</span>
                    <span className="ml-auto text-gray-400">&rsaquo;</span>
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
