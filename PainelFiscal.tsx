import { useState, useEffect } from "react";
import {
  FileText,
  Users,
  Receipt,
  Landmark,
  BookOpen,
  Calculator,
  ChevronDown,
  CalendarDays,
  ShieldCheck,
  UserCheck,
  ExternalLink,
} from "lucide-react";

// ---- Mock data — substituir por dados reais via tRPC (server/routers/railway.ts) ----
const OBRIGACOES = [
  {
    id: "nfe",
    nome: "NF-e Produtor",
    icon: FileText,
    status: "em_dia",
    destaque: "23 notas emitidas no mês",
    detalhes: [
      { label: "Última emissão", valor: "16/07/2026" },
      { label: "Série ativa", valor: "001" },
      { label: "Total emitido (mês)", valor: "R$ 41.230,00" },
    ],
    acoes: ["Emitir NF-e", "Ver histórico"],
    href: "/nfe",
  },
  {
    id: "esocial",
    nome: "eSocial Rural",
    icon: Users,
    status: "pendente",
    destaque: "Vence em 2 dias",
    detalhes: [
      { label: "Evento pendente", valor: "S-1260 — Comercialização" },
      { label: "Vencimento", valor: "20/07/2026" },
      { label: "Competência", valor: "06/2026" },
    ],
    acoes: ["Gerar evento", "Ver pendências"],
    href: "/esocial",
  },
  {
    id: "efdreinf",
    nome: "EFD-Reinf / DARF",
    icon: Receipt,
    status: "atrasado",
    destaque: "Multa estimada R$ 62,00",
    detalhes: [
      { label: "Competência em atraso", valor: "05/2026" },
      { label: "Vencimento original", valor: "15/06/2026" },
      { label: "Dias em atraso", valor: "33 dias" },
    ],
    acoes: ["Regularizar agora", "Gerar DARF"],
    href: "/efdreinf",
  },
  {
    id: "dctfweb",
    nome: "DCTFWeb",
    icon: Landmark,
    status: "em_dia",
    destaque: "Próximo: 15/08",
    detalhes: [
      { label: "Última transmissão", valor: "15/07/2026" },
      { label: "Situação", valor: "Aceita sem pendências" },
      { label: "Próxima competência", valor: "07/2026" },
    ],
    acoes: ["Ver recibo", "Transmitir"],
    href: "/dctfweb",
  },
  {
    id: "livrocaixa",
    nome: "Livro Caixa",
    icon: BookOpen,
    status: "em_dia",
    destaque: "Saldo: -R$ 69.815,43",
    detalhes: [
      { label: "Último lançamento", valor: "17/07/2026" },
      { label: "Receitas (ano)", valor: "R$ 128.400,00" },
      { label: "Despesas (ano)", valor: "R$ 198.215,43" },
    ],
    acoes: ["Novo lançamento", "Exportar"],
    href: "/livro-caixa",
  },
  {
    id: "simulador",
    nome: "Simulador Tributário",
    icon: Calculator,
    status: "disponivel",
    destaque: "Comparativo de regimes",
    detalhes: [
      { label: "Regime atual", valor: "Pessoa Física" },
      { label: "Economia potencial", valor: "A calcular" },
      { label: "Última simulação", valor: "—" },
    ],
    acoes: ["Simular agora"],
    href: "/simulador-regime",
  },
];

const CALENDARIO = [
  { data: "19/07", evento: "eSocial S-1260", tipo: "pendente" },
  { data: "20/07", evento: "Vencimento eSocial", tipo: "pendente" },
  { data: "15/08", evento: "DCTFWeb — próxima transmissão", tipo: "em_dia" },
  { data: "31/08", evento: "Livro Caixa — fechamento mensal", tipo: "em_dia" },
];

const CONTADORES = [
  { nome: "Fernando Loyo Cadette", papel: "Contador responsável" },
  { nome: "Geodilson Alves Lima", papel: "Contador auxiliar" },
];

const CERTIDOES = [
  { nome: "Certidão Federal", situacao: "Válida", validade: "12/2026" },
  { nome: "Certidão Estadual", situacao: "Válida", validade: "09/2026" },
];

const STATUS_MAP = {
  em_dia: { label: "Em dia", bar: "#0F6D66", bg: "#ECF7F5", text: "#0F6D66", dot: "#0F6D66" },
  pendente: { label: "Pendente", bar: "#D97706", bg: "#FEF6E7", text: "#B45309", dot: "#D97706" },
  atrasado: { label: "Atrasado", bar: "#DC2626", bg: "#FDECEC", text: "#B91C1C", dot: "#DC2626" },
  disponivel: { label: "Disponível", bar: "#2563AF", bg: "#EAF1FB", text: "#1D4E8F", dot: "#2563AF" },
};

function StatusBadge({ status }) {
  const s = STATUS_MAP[status];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold"
      style={{ backgroundColor: s.bg, color: s.text }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: s.dot }} />
      {s.label}
    </span>
  );
}

function ResumoDonut({ contagem }) {
  const ordem = ["em_dia", "pendente", "atrasado", "disponivel"];
  const total = ordem.reduce((sum, k) => sum + (contagem[k] || 0), 0) || 1;

  const raio = 40;
  const circunferencia = 2 * Math.PI * raio;
  let acumulado = 0;

  const segmentos = ordem
    .filter((k) => contagem[k])
    .map((k) => {
      const valor = contagem[k];
      const fracao = valor / total;
      const comprimento = fracao * circunferencia;
      const offset = circunferencia - acumulado;
      acumulado += comprimento;
      return {
        key: k,
        cor: STATUS_MAP[k].dot,
        label: STATUS_MAP[k].label,
        valor,
        strokeDasharray: `${comprimento} ${circunferencia - comprimento}`,
        strokeDashoffset: offset,
      };
    });

  return (
    <div className="flex items-center gap-4">
      <svg width="96" height="96" viewBox="0 0 96 96" className="shrink-0 -rotate-90">
        <circle cx="48" cy="48" r={raio} fill="none" stroke="#E2E8F0" strokeWidth="10" />
        {segmentos.map((s) => (
          <circle
            key={s.key}
            cx="48"
            cy="48"
            r={raio}
            fill="none"
            stroke={s.cor}
            strokeWidth="10"
            strokeDasharray={s.strokeDasharray}
            strokeDashoffset={s.strokeDashoffset}
            strokeLinecap="butt"
          />
        ))}
        <text
          x="48"
          y="48"
          transform="rotate(90 48 48)"
          textAnchor="middle"
          dominantBaseline="central"
          className="fill-slate-700 font-bold"
          style={{ fontSize: 20 }}
        >
          {total}
        </text>
      </svg>
      <ul className="flex flex-col gap-1.5">
        {ordem
          .filter((k) => contagem[k])
          .map((k) => (
            <li key={k} className="flex items-center gap-2 text-sm">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: STATUS_MAP[k].dot }} />
              <span className="text-slate-600">{STATUS_MAP[k].label}</span>
              <span className="ml-auto font-semibold text-slate-700 tabular-nums">{contagem[k]}</span>
            </li>
          ))}
      </ul>
    </div>
  );
}

function DetalheModal({ obrigacao, onClose }) {
  const [linhas, setLinhas] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(null);

  useEffect(() => {
    let cancelado = false;

    async function carregar() {
      try {
        // TODO: mesmo padrão do useFiscalResumo — trocar pelo client tRPC
        // real quando o procedure railway.fiscalHistorico existir.
        const res = await fetch(
          `/api/trpc/railway.fiscalHistorico?input=${encodeURIComponent(
            JSON.stringify({ modulo: obrigacao.id, imovelId: 1 })
          )}`
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        const data = json?.result?.data ?? json;
        if (!cancelado) setLinhas(data.linhas);
      } catch (e) {
        if (!cancelado) {
          setErro(e.message);
          // fallback: mostra os "detalhes" que já vieram no card, pra não
          // abrir um modal vazio enquanto o endpoint de histórico não existe
          setLinhas(obrigacao.detalhes.map((d) => ({ label: d.label, valor: d.valor })));
        }
      } finally {
        if (!cancelado) setCarregando(false);
      }
    }

    carregar();
    return () => {
      cancelado = true;
    };
  }, [obrigacao.id]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-xl bg-white shadow-xl max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h3 className="font-semibold text-[#0F2942]">{obrigacao.nome} — histórico</h3>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 text-sm"
          >
            Fechar
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-4">
          {carregando && <p className="text-sm text-slate-400">Carregando histórico…</p>}
          {erro && (
            <p className="mb-3 text-xs text-amber-600">
              Endpoint de histórico ainda não disponível — mostrando os dados do card.
            </p>
          )}
          {linhas && linhas.length === 0 && (
            <p className="text-sm text-slate-400">Nenhum registro encontrado.</p>
          )}
          {linhas && linhas.length > 0 && (
            <ul className="flex flex-col divide-y divide-slate-100">
              {linhas.map((l, i) => (
                <li key={i} className="flex items-center justify-between py-2.5 text-sm">
                  <span className="text-slate-500">{l.label}</span>
                  <span className="font-medium text-slate-700 tabular-nums">{l.valor}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function ObrigacaoCard({ obrigacao, onAbrirDetalhe }) {
  const [aberto, setAberto] = useState(false);
  const s = STATUS_MAP[obrigacao.status];
  const Icon = obrigacao.icon;

  return (
    <div
      className="rounded-xl bg-white shadow-sm border border-slate-200 overflow-hidden transition-shadow hover:shadow-md"
      style={{ borderLeftWidth: 4, borderLeftColor: s.bar }}
    >
      <button
        onClick={() => setAberto(!aberto)}
        className="w-full flex items-center justify-between gap-3 px-4 py-4 text-left"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
            style={{ backgroundColor: s.bg, color: s.text }}
          >
            <Icon size={18} />
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-slate-800 truncate">{obrigacao.nome}</p>
            <p className="text-sm text-slate-500 truncate">{obrigacao.destaque}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <StatusBadge status={obrigacao.status} />
          <ChevronDown
            size={18}
            className="text-slate-400 transition-transform"
            style={{ transform: aberto ? "rotate(180deg)" : "rotate(0deg)" }}
          />
        </div>
      </button>

      {aberto && (
        <div className="border-t border-slate-100 px-4 py-4 bg-slate-50/60">
          <dl className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
            {obrigacao.detalhes.map((d) => (
              <div key={d.label}>
                <dt className="text-xs uppercase tracking-wide text-slate-400">{d.label}</dt>
                <dd className="text-sm font-medium text-slate-700 tabular-nums">{d.valor}</dd>
              </div>
            ))}
          </dl>
          <div className="flex flex-wrap gap-2">
            {obrigacao.acoes.map((acao) => (
              <button
                key={acao}
                onClick={() => acao.toLowerCase().includes("ver") && onAbrirDetalhe(obrigacao)}
                className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:border-slate-400 hover:text-slate-800 transition-colors"
              >
                {acao}
              </button>
            ))}
            <a
              href={obrigacao.href}
              className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-[#0F2942] hover:underline"
            >
              Abrir módulo <ExternalLink size={12} />
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

// Ícones por id — o backend devolve texto, não componente, então mapeamos aqui
const ICONES = {
  nfe: FileText,
  esocial: Users,
  efdreinf: Receipt,
  dctfweb: Landmark,
  livrocaixa: BookOpen,
  simulador: Calculator,
};

// TODO: ajustar o caminho de import pro seu client tRPC real, ex:
//   import { trpc } from "../utils/trpc";
// Deixe comentado enquanto o procedure railway.fiscalResumo não estiver
// deployado, pra não quebrar o build.
//
// import { trpc } from "../utils/trpc";

function useFiscalResumo(imovelId) {
  const [obrigacoes, setObrigacoes] = useState(OBRIGACOES); // começa com mock
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(null);

  useEffect(() => {
    let cancelado = false;

    async function carregar() {
      try {
        // Opção A (preferida): usando tRPC já configurado no projeto
        //   const data = await trpc.railway.fiscalResumo.query({ imovelId });

        // Opção B: fetch direto no proxy tRPC via HTTP, sem client tipado
        const res = await fetch(
          `/api/trpc/railway.fiscalResumo?input=${encodeURIComponent(
            JSON.stringify({ imovelId })
          )}`
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        const data = json?.result?.data ?? json; // formato de resposta do tRPC

        if (!cancelado) {
          setObrigacoes(data.obrigacoes);
          setErro(null);
        }
      } catch (e) {
        if (!cancelado) {
          // Mantém o mock na tela e só avisa o erro — painel nunca fica vazio
          setErro(e.message);
        }
      } finally {
        if (!cancelado) setCarregando(false);
      }
    }

    carregar();
    return () => {
      cancelado = true;
    };
  }, [imovelId]);

  return { obrigacoes, carregando, erro };
}

export default function PainelFiscal({ imovelId = 1 }) {
  const { obrigacoes, carregando, erro } = useFiscalResumo(imovelId);
  const [detalheAberto, setDetalheAberto] = useState(null);

  const contagem = obrigacoes.reduce(
    (acc, o) => {
      acc[o.status] = (acc[o.status] || 0) + 1;
      return acc;
    },
    {}
  );

  return (
    <div className="min-h-screen bg-[#F7F5F0] p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-6xl">
        {/* Header */}
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[#0F2942]">Painel Fiscal</h1>
            <p className="text-sm text-slate-500">Situação consolidada das obrigações do período</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full bg-white border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600">
              {contagem.em_dia || 0} em dia
            </span>
            <span className="rounded-full bg-white border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600">
              {contagem.pendente || 0} pendente
            </span>
            <span className="rounded-full bg-white border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600">
              {contagem.atrasado || 0} atrasado
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6">
          {/* Cards de obrigações */}
          <div className="flex flex-col gap-3">
            {carregando && <p className="text-sm text-slate-400">Carregando painel fiscal…</p>}
            {erro && <p className="text-sm text-red-600">Erro ao carregar: {erro}</p>}
            {obrigacoes.map((o) => (
              <ObrigacaoCard
                key={o.id}
                obrigacao={{ ...o, icon: o.icon || ICONES[o.id] }}
                onAbrirDetalhe={setDetalheAberto}
              />
            ))}
          </div>

          {/* Sidebar */}
          <div className="flex flex-col gap-4">
            {/* Resumo do período */}
            <div className="rounded-xl bg-white shadow-sm border border-slate-200 p-4">
              <h2 className="mb-3 text-sm font-semibold text-[#0F2942]">Resumo do período</h2>
              <ResumoDonut contagem={contagem} />
            </div>

            {/* Calendário fiscal */}
            <div className="rounded-xl bg-white shadow-sm border border-slate-200 p-4">
              <div className="mb-3 flex items-center gap-2 text-[#0F2942]">
                <CalendarDays size={16} />
                <h2 className="text-sm font-semibold">Calendário fiscal</h2>
              </div>
              <ul className="flex flex-col gap-2.5">
                {CALENDARIO.map((c) => (
                  <li key={c.evento} className="flex items-start gap-2 text-sm">
                    <span
                      className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ backgroundColor: STATUS_MAP[c.tipo].dot }}
                    />
                    <div>
                      <p className="font-medium text-slate-700 tabular-nums">{c.data}</p>
                      <p className="text-slate-500 leading-tight">{c.evento}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            {/* Meus contadores */}
            <div className="rounded-xl bg-white shadow-sm border border-slate-200 p-4">
              <div className="mb-3 flex items-center gap-2 text-[#0F2942]">
                <UserCheck size={16} />
                <h2 className="text-sm font-semibold">Meus contadores</h2>
              </div>
              <ul className="flex flex-col gap-2">
                {CONTADORES.map((c) => (
                  <li key={c.nome} className="text-sm">
                    <p className="font-medium text-slate-700">{c.nome}</p>
                    <p className="text-slate-400 text-xs">{c.papel}</p>
                  </li>
                ))}
              </ul>
            </div>

            {/* Certidões negativas */}
            <div className="rounded-xl bg-white shadow-sm border border-slate-200 p-4">
              <div className="mb-3 flex items-center gap-2 text-[#0F2942]">
                <ShieldCheck size={16} />
                <h2 className="text-sm font-semibold">Certidões negativas</h2>
              </div>
              <ul className="flex flex-col gap-2.5">
                {CERTIDOES.map((c) => (
                  <li key={c.nome} className="flex items-center justify-between text-sm">
                    <div>
                      <p className="font-medium text-slate-700">{c.nome}</p>
                      <p className="text-slate-400 text-xs">Válida até {c.validade}</p>
                    </div>
                    <StatusBadge status="em_dia" />
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>

      {detalheAberto && (
        <DetalheModal obrigacao={detalheAberto} onClose={() => setDetalheAberto(null)} />
      )}
    </div>
  );
}
