"use client";
// build-20260712131406
import { useState, useEffect, useRef } from "react";
import { Plus, FileSignature, Search, RefreshCw, Trash2, Download, Sparkles, ArrowLeft, AlertTriangle, CheckCircle2, Upload, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { API_BASE, getImovelId, getApiToken } from "@/lib/api";

interface ContratoRural {
  id: string;
  tipo: string;
  descricao?: string;
  valor?: number;
  data_inicio?: string;
  data_fim?: string;
  status?: string;
  imovel_id?: number;
  criado_em?: string;
  outorgante_nome?: string;
  outorgado_nome?: string;
  percentual_outorgante?: number;
  percentual_outorgado?: number;
  area_parceria_hectares?: number;
}

interface Condomino {
  nome: string;
  documento: string;
  telefone: string;
  area_ha: string;          // string no form, convertido pra number no envio
  papel: "administrador" | "condomino" | "inventariante";
}

interface TipoAssistente {
  slug: string;
  nome: string;
  emoji?: string;
  score: number;
  clausulas?: { titulo: string; descricao?: string; obrigatoria: boolean }[];
  alertas?: { texto: string; nivel: string }[];
}

interface RespostasAssistente {
  vinculo?: string;
  relacao?: string;
  remuneracao?: string;
  atividade?: string;
  prazo?: string;
  risco?: string;
  infraestrutura?: string;
}

interface ResultadoAssistente {
  recomendado: TipoAssistente | null;
  alerta_vinculo: string | null;
  alternativas: TipoAssistente[];
  alertas_inconsistencia?: string[];
  justificativa: string | null;
}

const PERGUNTAS_ASSISTENTE: {
  campo: keyof RespostasAssistente;
  pergunta: string;
  dica?: string;
  opcoes: { value: string; label: string }[];
  mostrar?: (r: RespostasAssistente) => boolean;
}[] = [
  {
    campo: "vinculo",
    pergunta: "Como é o vínculo entre as partes?",
    opcoes: [
      { value: "autonomo", label: "Cada parte age com autonomia, sem subordinação" },
      { value: "subordinado_remuneracao_fixa", label: "Uma parte trabalha sob ordens diretas, com remuneração fixa periódica" },
    ],
  },
  {
    campo: "relacao",
    pergunta: "Sobre ESSE contrato específico que você está criando agora:",
    dica: "Já são condôminos/sócios de uma área maior, mas isso aqui é um acordo à parte pra uma atividade específica (ex: dois de vários condôminos vão criar animais juntos)? A resposta certa é a primeira opção — o fato de já serem condôminos de outra coisa não muda a natureza DESSE contrato.",
    opcoes: [
      { value: "cede_uso", label: "Uma parte está usando/explorando a área ou bem da outra (mesmo que já sejam sócios/condôminos de algo maior), dividindo resultado, pagando aluguel, ou outro acordo" },
      { value: "co_propriedade", label: "Vocês estão formalizando uma propriedade NOVA em conjunto (comprando junto, ou registrando uma copropriedade que ainda não existe)" },
      { value: "transferencia_definitiva", label: "Uma parte está vendendo/transferindo definitivamente pra outra" },
    ],
  },
  {
    campo: "remuneracao",
    pergunta: "Como funciona o pagamento?",
    opcoes: [
      { value: "divisao_resultado", label: "Divisão do resultado da produção (lucro e prejuízo compartilhados)" },
      { value: "valor_fixo", label: "Valor fixo combinado, independente do resultado" },
      { value: "gratuito", label: "Não há cobrança nenhuma" },
      { value: "rateio_cotas", label: "Cada um paga/recebe proporcional à cota de propriedade" },
      { value: "preco_unico", label: "Um preço único pela transferência definitiva" },
      { value: "por_servico_executado", label: "Pagamento por um serviço específico executado" },
    ],
  },
  {
    campo: "atividade",
    pergunta: "Qual a atividade principal?",
    opcoes: [
      { value: "agricola", label: "🌱 Agrícola (lavoura)" },
      { value: "pecuaria", label: "🐄 Pecuária" },
      { value: "agroindustrial", label: "🏭 Agroindustrial" },
      { value: "extrativa", label: "🌲 Extrativa" },
    ],
    mostrar: (r) => r.remuneracao === "divisao_resultado",
  },
  {
    campo: "prazo",
    pergunta: "Qual o prazo pretendido?",
    opcoes: [
      { value: "curto", label: "Curto (menos de 1 ano / 1 safra)" },
      { value: "medio", label: "Médio (1 a 3 anos)" },
      { value: "longo", label: "Longo (mais de 3 anos)" },
      { value: "indeterminado", label: "Prazo indeterminado" },
    ],
  },
  {
    campo: "risco",
    pergunta: "Quem assume o risco (clima, mercado, perdas)?",
    opcoes: [
      { value: "proprietario", label: "Só o proprietário" },
      { value: "terceiro", label: "Só o terceiro/parceiro" },
      { value: "dividido", label: "Dividido entre as partes" },
    ],
  },
  {
    campo: "infraestrutura",
    pergunta: "Quem fornece a infraestrutura (máquinas, insumos, benfeitorias)?",
    opcoes: [
      { value: "proprietario", label: "Só o proprietário" },
      { value: "terceiro", label: "Só o terceiro/parceiro" },
      { value: "ambos", label: "Os dois contribuem" },
    ],
  },
];

function authHeaders(): Record<string, string> {
  const token = getApiToken();
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { ...authHeaders(), ...(options?.headers ?? {}) },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    const msg = typeof err.detail === "string" ? err.detail
      : Array.isArray(err.detail) ? err.detail.map((d: {msg?: string}) => d.msg).join("; ")
      : `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return res.json();
}

const TIPO_LABELS: Record<string, string> = {
  arrendamento:      "Arrendamento",
  parceria:          "Parceria",
  agricola:          "Parceria Agrícola",
  pecuaria:          "Parceria Pecuária",
  agroindustrial:    "Parceria Agroindustrial",
  extrativa:         "Parceria Extrativa",
  condominio_rural:  "Condomínio Rural",
  comodato:          "Comodato",
  prestacao_servico: "Prestação de Serviço",
  compra_venda:      "Compra e Venda",
};

const TIPO_ICONS: Record<string, string> = {
  agricola: "🌾", pecuaria: "🐄", agroindustrial: "🏭",
  extrativa: "🌲", condominio_rural: "🤝", arrendamento: "📋",
  parceria: "🤝", comodato: "🏠", compra_venda: "💰",
};

const STATUS_COLORS: Record<string, string> = {
  ativo:                  "bg-emerald-100 text-emerald-700",
  encerrado:              "bg-gray-100 text-gray-600",
  pendente:               "bg-yellow-100 text-yellow-700",
  vencido:                "bg-red-100 text-red-700",
  rascunho:               "bg-blue-100 text-blue-700",
  aguardando_assinaturas: "bg-purple-100 text-purple-700",
};

const TIPOS_FORM = [
  { value: "agricola",       label: "Parceria Agrícola" },
  { value: "pecuaria",       label: "Parceria Pecuária" },
  { value: "agroindustrial", label: "Parceria Agroindustrial" },
  { value: "extrativa",      label: "Parceria Extrativa" },
  { value: "condominio_rural", label: "Condomínio Rural" },
  { value: "arrendamento",   label: "Arrendamento" },
  { value: "comodato",       label: "Comodato" },
  { value: "compra_venda",   label: "Compra e Venda" },
];

// Tipos que NÃO usam outorgante/outorgado
const TIPOS_SEM_PARTES = ["condominio_rural"];

// Tipos de parceria (usados pra decidir quando pré-preencher a cláusula
// padrão de rateio de custos — não faz sentido pra arrendamento/comodato/
// compra_venda, que têm lógica de custo diferente)
const TIPOS_PARCERIA = ["agricola", "pecuaria", "agroindustrial", "extrativa"];

function fmtDate(s?: string) {
  if (!s) return null;
  return new Date(s + "T00:00:00").toLocaleDateString("pt-BR");
}

export default function ContratosRurais() {
  const [contratos, setContratos] = useState<ContratoRural[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [modoNovo, setModoNovo] = useState<"seletor" | "assistente" | "form">("seletor");
  const [respostasAssist, setRespostasAssist] = useState<RespostasAssistente>({});
  const [ordemRespondida, setOrdemRespondida] = useState<(keyof RespostasAssistente)[]>([]);
  const [resultadoAssist, setResultadoAssist] = useState<ResultadoAssistente | null>(null);
  const [enviandoAssist, setEnviandoAssist] = useState(false);
  const [form, setForm] = useState({
    tipo: "", descricao: "", valor: "",
    data_inicio: "", data_fim: "",
    percentual_outorgante: "50",
    quantidade_animais: "",
    valor_investido_outorgante: "",
    valor_investido_outorgado: "",
    modalidade_parceria: "",
    especie_raca: "",
    peso_medio_entrada: "",
    outorgante_nome: "",
    outorgante_documento: "",
    outorgante_telefone: "",
    outorgado_nome: "",
    outorgado_documento: "",
    outorgado_telefone: "",
    frequencia_pagamento: "safra",
    clausula_denuncia_dias: "",
    responsabilidade_custos: "",
    responsabilidade_riscos: "",
  });
  const imovelId = getImovelId();

  const semPartes = TIPOS_SEM_PARTES.includes(form.tipo);
  const ehPecuaria = form.tipo === "pecuaria";
  const ehCondominio = form.tipo === "condominio_rural";

  const [condominos, setCondominos] = useState<Condomino[]>([
    { nome: "", documento: "", telefone: "", area_ha: "", papel: "administrador" },
    { nome: "", documento: "", telefone: "", area_ha: "", papel: "condomino" },
  ]);

  const adicionarCondomino = () => {
    setCondominos((prev) => [
      ...prev,
      { nome: "", documento: "", telefone: "", area_ha: "", papel: "condomino" },
    ]);
  };

  const removerCondomino = (index: number) => {
    if (condominos.length <= 2) {
      toast.error("Um condomínio precisa de no mínimo 2 condôminos.");
      return;
    }
    setCondominos((prev) => prev.filter((_, i) => i !== index));
  };

  const atualizarCondomino = (index: number, campo: keyof Condomino, valor: string) => {
    setCondominos((prev) =>
      prev.map((c, i) => (i === index ? { ...c, [campo]: valor } : c))
    );
  };

  const somaAreaCondominos = condominos.reduce(
    (soma, c) => soma + (Number(c.area_ha) || 0), 0
  );
  const areaTotalCondominio = Number(form.valor) || 0;

  const load = async () => {
    setLoading(true);
    try {
      // /contratos-rurais consulta uma tabela legada (contratos_rurais) que não
      // recebe gravações da criação atual — a fonte real é /contratos/, que
      // consulta a tabela "contratos" (onde tudo é criado, inclusive Condomínio Rural).
      const r2 = await apiFetch<{ data: ContratoRural[] }>(`/contratos/?fazenda_id=${imovelId}`);
      setContratos(Array.isArray(r2.data) ? r2.data : []);
    } catch {
      toast.error("Não foi possível carregar os contratos");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filtered = contratos.filter((c) =>
    (TIPO_LABELS[c.tipo] ?? c.tipo)?.toLowerCase().includes(search.toLowerCase()) ||
    c.descricao?.toLowerCase().includes(search.toLowerCase()) ||
    c.outorgante_nome?.toLowerCase().includes(search.toLowerCase()) ||
    c.outorgado_nome?.toLowerCase().includes(search.toLowerCase())
  );

  const handleCreate = async () => {
    if (!form.tipo) { toast.error("Selecione o tipo de contrato"); return; }
    if (form.data_inicio && form.data_fim && form.data_fim < form.data_inicio) {
      toast.error("Data Fim não pode ser anterior à Data Início");
      return;
    }
    if (!semPartes) {
      if (!form.outorgante_nome.trim()) { toast.error("Informe o nome do Outorgante"); return; }
      if (!form.outorgante_telefone.trim()) {
        toast.error("Informe o telefone (WhatsApp) do Outorgante — é necessário para enviar o código de assinatura.");
        return;
      }
      if (!form.outorgado_nome.trim()) { toast.error("Informe o nome do Outorgado"); return; }
      if (!form.outorgado_telefone.trim()) {
        toast.error("Informe o telefone (WhatsApp) do Outorgado — é necessário para enviar o código de assinatura.");
        return;
      }
    }
    if (ehCondominio) {
      if (!form.data_fim) {
        toast.error("Condomínio Rural exige Data Fim (não aceita prazo indeterminado).");
        return;
      }
      if (!areaTotalCondominio || areaTotalCondominio <= 0) {
        toast.error("Informe a Área total (hectares) do condomínio.");
        return;
      }
      if (condominos.length < 2) {
        toast.error("Um condomínio precisa de no mínimo 2 condôminos.");
        return;
      }
      for (const c of condominos) {
        if (!c.nome.trim()) { toast.error("Preencha o nome de todos os condôminos."); return; }
        if (!c.telefone.trim()) {
          toast.error(`Informe o telefone (WhatsApp) do condômino "${c.nome || "sem nome"}" — é necessário para enviar o código de assinatura.`);
          return;
        }
        if (!c.area_ha || Number(c.area_ha) <= 0) {
          toast.error(`Informe a área (ha) do condômino "${c.nome || "sem nome"}".`);
          return;
        }
      }
      if (somaAreaCondominos > areaTotalCondominio + 0.01) {
        toast.error(
          `A soma das áreas dos condôminos (${somaAreaCondominos.toFixed(2)} ha) ` +
          `excede a área total do imóvel (${areaTotalCondominio.toFixed(2)} ha).`
        );
        return;
      }
    }

    if (!form.data_fim && !form.clausula_denuncia_dias) {
      toast.error("Prazo indeterminado precisa do aviso prévio de rescisão (em dias) — sem data fim, isso é obrigatório");
      return;
    }
    setSaving(true);
    try {
      const percOut = Number(form.percentual_outorgante) || 50;
      const tipoDocumento = (doc: string) => doc.replace(/\D/g, "").length > 11 ? "CNPJ" : "CPF";
      const body: Record<string, unknown> = {
        fazenda_id: imovelId,
        tipo: form.tipo,
        data_inicio: form.data_inicio || undefined,
        data_fim: form.data_fim || undefined,
        percentual_outorgante: semPartes ? 0 : percOut,
        percentual_outorgado:  semPartes ? 0 : 100 - percOut,
        frequencia_pagamento: form.frequencia_pagamento,
        area_parceria_hectares: form.valor ? Number(form.valor) : undefined,
        outorgante_externo: !semPartes && form.outorgante_nome
          ? { nome: form.outorgante_nome, tipo_documento: tipoDocumento(form.outorgante_documento), documento: form.outorgante_documento || "não informado", telefone: form.outorgante_telefone }
          : undefined,
        outorgado_externo: !semPartes && form.outorgado_nome
          ? { nome: form.outorgado_nome, tipo_documento: tipoDocumento(form.outorgado_documento), documento: form.outorgado_documento || "não informado", telefone: form.outorgado_telefone }
          : undefined,
        clausulas_adicionais: {
          ...(ehPecuaria ? {
            quantidade_animais: form.quantidade_animais ? Number(form.quantidade_animais) : undefined,
            valor_investido_outorgante: form.valor_investido_outorgante ? Number(form.valor_investido_outorgante) : undefined,
            valor_investido_outorgado: form.valor_investido_outorgado ? Number(form.valor_investido_outorgado) : undefined,
            modalidade_parceria: form.modalidade_parceria || undefined,
            especie_raca: form.especie_raca || undefined,
            peso_medio_entrada_kg: form.peso_medio_entrada ? Number(form.peso_medio_entrada) : undefined,
          } : {}),
          ...(form.clausula_denuncia_dias ? { aviso_previo_rescisao_dias: Number(form.clausula_denuncia_dias) } : {}),
          ...(!semPartes && form.responsabilidade_custos ? { responsabilidade_custos: form.responsabilidade_custos } : {}),
          ...(!semPartes && form.responsabilidade_riscos ? { responsabilidade_riscos: form.responsabilidade_riscos } : {}),
        },
      };
      const endpoint = ehCondominio ? "/condominio/" : "/contratos/";
      const bodyFinal = ehCondominio
        ? {
            fazenda_id: imovelId,
            imovel_id: imovelId,
            area_total_ha: areaTotalCondominio,
            data_inicio: form.data_inicio,
            data_fim: form.data_fim,
            frequencia_pagamento: form.frequencia_pagamento,
            clausulas_adicionais: {},
            condominos: condominos.map((c) => ({
              area_ha: Number(c.area_ha),
              papel: c.papel,
              parceiro_externo: {
                nome: c.nome,
                tipo_documento: c.documento.replace(/\D/g, "").length > 11 ? "CNPJ" : "CPF",
                documento: c.documento || "não informado",
                telefone: c.telefone,
              },
            })),
          }
        : body;
      await apiFetch<{ data: ContratoRural }>(endpoint, {
        method: "POST",
        body: JSON.stringify(bodyFinal),
      });

      // Recarrega do servidor em vez de inserir localmente — evita qualquer
      // chance do card novo ficar com dado desatualizado/id errado.
      await load();
      setShowNew(false);
      setForm({
        tipo: "", descricao: "", valor: "", data_inicio: "", data_fim: "",
        percentual_outorgante: "50", quantidade_animais: "",
        valor_investido_outorgante: "", valor_investido_outorgado: "",
        modalidade_parceria: "", especie_raca: "", peso_medio_entrada: "",
        outorgante_nome: "", outorgante_documento: "", outorgante_telefone: "",
        outorgado_nome: "", outorgado_documento: "", outorgado_telefone: "",
        frequencia_pagamento: "safra", clausula_denuncia_dias: "",
        responsabilidade_custos: "", responsabilidade_riscos: "",
      });
      setCondominos([
        { nome: "", documento: "", telefone: "", area_ha: "", papel: "administrador" },
        { nome: "", documento: "", telefone: "", area_ha: "", papel: "condomino" },
      ]);
      toast.success("Contrato criado com sucesso");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao criar contrato");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Excluir este contrato?")) return;
    try {
      await apiFetch(`/contratos/${id}`, { method: "DELETE" });
      setContratos((prev) => prev.filter((c) => c.id !== id));
      toast.success("Contrato excluído");
    } catch {
      toast.error("Erro ao excluir contrato");
    }
  };

  const abrirNovoContrato = () => {
    setModoNovo("seletor");
    setRespostasAssist({});
    setOrdemRespondida([]);
    setResultadoAssist(null);
    setShowNew(true);
  };

  // Lista de perguntas que se aplicam ao estado atual das respostas
  // (a pergunta "atividade" só entra se remuneracao === "divisao_resultado").
  const perguntasAtivas = PERGUNTAS_ASSISTENTE.filter(
    (p) => !p.mostrar || p.mostrar(respostasAssist)
  );

  // A pergunta a exibir é sempre derivada diretamente das respostas já
  // dadas — a primeira pergunta ativa que ainda não tem resposta. Isso evita
  // qualquer dessincronia entre "que número de pergunta estou" e "qual
  // pergunta esse número aponta", que existia com um índice numérico
  // separado quando a lista de perguntas ativas muda de tamanho (pergunta
  // condicional de atividade).
  const perguntaAtual = perguntasAtivas.find(
    (p) => respostasAssist[p.campo] === undefined
  );
  const posicaoAtual = ordemRespondida.length + 1;

  const responderPergunta = (campo: keyof RespostasAssistente, valor: string) => {
    const novasRespostas = { ...respostasAssist, [campo]: valor };
    const novaOrdem = [...ordemRespondida, campo];
    setRespostasAssist(novasRespostas);
    setOrdemRespondida(novaOrdem);

    const ativasDepois = PERGUNTAS_ASSISTENTE.filter(
      (p) => !p.mostrar || p.mostrar(novasRespostas)
    );
    const proximaPendente = ativasDepois.find(
      (p) => novasRespostas[p.campo] === undefined
    );

    if (!proximaPendente) {
      enviarAssistente(novasRespostas);
    }
  };

  const enviarAssistente = async (respostas: RespostasAssistente) => {
    setEnviandoAssist(true);
    try {
      const resultado = await apiFetch<ResultadoAssistente>("/contratos-assistente/recomendar", {
        method: "POST",
        body: JSON.stringify({ respostas, imovel_id: imovelId }),
      });
      setResultadoAssist(resultado);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao consultar o assistente");
      setModoNovo("seletor");
    } finally {
      setEnviandoAssist(false);
    }
  };

  const voltarPergunta = () => {
    if (ordemRespondida.length === 0) {
      setModoNovo("seletor");
      return;
    }
    const campoRemovido = ordemRespondida[ordemRespondida.length - 1];
    const novasRespostas = { ...respostasAssist };
    delete novasRespostas[campoRemovido];
    setRespostasAssist(novasRespostas);
    setOrdemRespondida(ordemRespondida.slice(0, -1));
  };

  const CLAUSULA_CUSTOS_PADRAO_PARCERIA =
    "Os custos operacionais serão rateados entre as partes na mesma proporção " +
    "do percentual de divisão estabelecido neste contrato. Caso uma das partes " +
    "desembolse valor superior à sua cota-parte, mediante comprovação por nota " +
    "fiscal ou recibo, o valor excedente será reembolsado pela outra parte " +
    "antes da apuração do lucro a ser dividido.";

  const CLAUSULA_RISCOS_PADRAO_PARCERIA =
    "Os riscos inerentes à atividade serão suportados proporcionalmente pelas " +
    "partes, na mesma proporção do percentual de divisão estabelecido neste " +
    "contrato, observado o seguinte: (i) morte de animal por causa natural ou " +
    "acidente — mediante comunicação imediata à outra parte e, quando " +
    "possível, laudo veterinário; (ii) roubo ou furto — mediante boletim de " +
    "ocorrência registrado em até 48 (quarenta e oito) horas; (iii) doenças de " +
    "notificação obrigatória — o descumprimento do protocolo sanitário " +
    "combinado entre as partes transfere à parte que descumpriu a " +
    "responsabilidade integral pelo prejuízo decorrente.";

  const escolherTipo = (tipoValue: string) => {
    const ehParceria = TIPOS_PARCERIA.includes(tipoValue);
    setForm((prev) => ({
      ...prev,
      tipo: tipoValue,
      responsabilidade_custos:
        ehParceria && !prev.responsabilidade_custos
          ? CLAUSULA_CUSTOS_PADRAO_PARCERIA
          : prev.responsabilidade_custos,
      responsabilidade_riscos:
        ehParceria && !prev.responsabilidade_riscos
          ? CLAUSULA_RISCOS_PADRAO_PARCERIA
          : prev.responsabilidade_riscos,
    }));
  };

  const usarRecomendacao = (slug: string) => {
    escolherTipo(slug);
    setModoNovo("form");
  };

  const recomecarAssistente = () => {
    setRespostasAssist({});
    setOrdemRespondida([]);
    setResultadoAssist(null);
  };

  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const handleDownload = async (c: ContratoRural) => {
    setDownloadingId(c.id);
    try {
      const res = await fetch(`${API_BASE}/contratos/${c.id}/documento`, {
        headers: authHeaders(),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        const msg = typeof err.detail === "string" ? err.detail : `HTTP ${res.status}`;
        throw new Error(msg);
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `contrato_${TIPO_LABELS[c.tipo] ?? c.tipo}_${c.id}.docx`.replace(/\s+/g, "_");
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao gerar documento");
    } finally {
      setDownloadingId(null);
    }
  };

  const [uploadingFinalId, setUploadingFinalId] = useState<string | null>(null);
  const [contratoAlvoUpload, setContratoAlvoUpload] = useState<string | null>(null);
  const fileInputFinalRef = useRef<HTMLInputElement>(null);

  const abrirSeletorDocxCorrigido = (contratoId: string) => {
    setContratoAlvoUpload(contratoId);
    fileInputFinalRef.current?.click();
  };

  const handleArquivoDocxCorrigidoSelecionado = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const contratoId = contratoAlvoUpload;
    e.target.value = "";
    if (!file || !contratoId) return;

    if (!file.name.toLowerCase().endsWith(".docx")) {
      toast.error("Envie um arquivo .docx (o mesmo baixado, editado no Word)");
      return;
    }

    setUploadingFinalId(contratoId);
    try {
      const formData = new FormData();
      formData.append("arquivo", file, file.name);
      const token = getApiToken();
      const res = await fetch(`${API_BASE}/contratos/${contratoId}/documento-final`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        const msg = typeof err.detail === "string" ? err.detail : `HTTP ${res.status}`;
        throw new Error(msg);
      }
      toast.success("Documento final gerado — já pode enviar para assinatura");
      load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao processar documento final");
    } finally {
      setUploadingFinalId(null);
      setContratoAlvoUpload(null);
    }
  };

  const [enviandoAssinaturaId, setEnviandoAssinaturaId] = useState<string | null>(null);

  const handleEnviarParaAssinatura = async (contratoId: string, tipo: string) => {
    if (!confirm("Enviar este contrato para assinatura? Cada parte receberá um código por WhatsApp.")) return;
    setEnviandoAssinaturaId(contratoId);
    try {
      let partesNotificadas: { nome: string; whatsapp_enviado: boolean }[] = [];

      if (tipo === "condominio_rural") {
        // Condomínio Rural tem N condôminos (não 2 partes fixas) — a rota genérica
        // /contratos/{id}/enviar não sabe lidar com isso. Busca os condôminos e
        // envia o OTP individualmente para cada um via a rota dedicada.
        const detalhe = await apiFetch<{ condominos: { id: number; nome: string }[] }>(
          `/condominio/${contratoId}`
        );
        for (const cond of detalhe.condominos) {
          try {
            const r = await apiFetch<{ enviado_whatsapp?: boolean }>(
              `/condominio/${contratoId}/condominos/${cond.id}/enviar-assinatura`,
              { method: "POST" }
            );
            partesNotificadas.push({ nome: cond.nome, whatsapp_enviado: !!r.enviado_whatsapp });
          } catch {
            partesNotificadas.push({ nome: cond.nome, whatsapp_enviado: false });
          }
        }
      } else {
        const resultado = await apiFetch<{ partes_notificadas: { nome: string; whatsapp_enviado: boolean }[] }>(
          `/contratos/${contratoId}/enviar`,
          { method: "POST" }
        );
        partesNotificadas = resultado.partes_notificadas;
      }

      const semWhatsapp = partesNotificadas.filter((p) => !p.whatsapp_enviado);
      if (semWhatsapp.length > 0) {
        toast.warning(`Envio falhou ou sem telefone cadastrado para: ${semWhatsapp.map((p) => p.nome).join(", ")}`);
      } else {
        toast.success("Enviado para assinatura! Cada parte recebeu um código por WhatsApp.");
      }
      load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao enviar para assinatura");
    } finally {
      setEnviandoAssinaturaId(null);
    }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "oklch(0.22 0.06 145)" }}>Contratos Rurais</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Arrendamentos, parcerias e condomínio rural</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
          <Button size="sm" onClick={abrirNovoContrato} style={{ background: "oklch(0.42 0.14 145)" }}>
            <Plus className="w-4 h-4 mr-2" />
            Novo Contrato
          </Button>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="Buscar por tipo, parte ou descrição..." value={search}
          onChange={(e) => setSearch(e.target.value)} className="pl-9" />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total",    value: contratos.length },
          { label: "Ativos",   value: contratos.filter((c) => c.status === "ativo").length },
          { label: "Pendentes",value: contratos.filter((c) => c.status === "pendente" || c.status === "rascunho").length },
          { label: "Vencidos", value: contratos.filter((c) => c.status === "vencido" || c.status === "encerrado").length },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">{s.label}</p>
              <p className="text-2xl font-bold mt-1" style={{ color: "oklch(0.35 0.12 145)" }}>
                {loading ? "—" : s.value}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 rounded-xl" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <FileSignature className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">Nenhum contrato encontrado</p>
          <p className="text-sm mt-1">Clique em "Novo Contrato" para cadastrar</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((c) => (
            <Card key={c.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-xl"
                      style={{ background: "oklch(0.92 0.04 145)" }}>
                      {TIPO_ICONS[c.tipo] ?? "📄"}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-sm">{TIPO_LABELS[c.tipo] ?? c.tipo}</p>
                        {c.status && (
                          <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${STATUS_COLORS[c.status] ?? "bg-gray-100 text-gray-600"}`}>
                            {c.status.replace(/_/g, " ")}
                          </span>
                        )}
                      </div>
                      {(c.outorgante_nome || c.outorgado_nome) && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {c.outorgante_nome ?? "—"} → {c.outorgado_nome ?? "—"}
                          {c.percentual_outorgante != null && (
                            <span className="ml-2 text-[10px] font-medium">
                              ({c.percentual_outorgante}% / {c.percentual_outorgado}%)
                            </span>
                          )}
                        </p>
                      )}
                      {c.descricao && <p className="text-xs text-muted-foreground mt-0.5 truncate">{c.descricao}</p>}
                      <div className="flex gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                        {c.data_inicio && <span>📅 {fmtDate(c.data_inicio)} → {fmtDate(c.data_fim) ?? "—"}</span>}
                        {c.area_parceria_hectares != null && <span>🌱 {c.area_parceria_hectares} ha</span>}
                        {c.criado_em && (
                          <span title={c.id}>
                            🕒 Criado em {new Date(c.criado_em).toLocaleString("pt-BR")}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDownload(c)}
                      disabled={downloadingId === c.id}
                      title="Baixar contrato em Word"
                    >
                      <Download className={`w-4 h-4 ${downloadingId === c.id ? "animate-pulse" : ""}`} />
                    </Button>
                    {(!c.status || c.status === "rascunho") && (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => abrirSeletorDocxCorrigido(c.id)}
                          disabled={uploadingFinalId === c.id}
                          title="Enviar .docx corrigido (gera o PDF final)"
                        >
                          <Upload className={`w-4 h-4 ${uploadingFinalId === c.id ? "animate-pulse" : ""}`} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEnviarParaAssinatura(c.id, c.tipo)}
                          disabled={enviandoAssinaturaId === c.id}
                          title="Enviar para assinatura (código por WhatsApp)"
                          className="text-emerald-600 hover:text-emerald-700"
                        >
                          <Send className={`w-4 h-4 ${enviandoAssinaturaId === c.id ? "animate-pulse" : ""}`} />
                        </Button>
                      </>
                    )}
                    <Button variant="ghost" size="sm" onClick={() => handleDelete(c.id)}
                      className="text-red-500 hover:text-red-700">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      <input
        ref={fileInputFinalRef}
        type="file"
        accept=".docx"
        className="hidden"
        onChange={handleArquivoDocxCorrigidoSelecionado}
      />

      <Dialog open={showNew} onOpenChange={setShowNew}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto" style={{overflowY: "auto"}}>

          {/* ── MODO SELETOR: grade rápida + CTA do assistente ── */}
          {modoNovo === "seletor" && (
            <>
              <DialogHeader><DialogTitle>Novo Contrato Rural</DialogTitle></DialogHeader>
              <p className="text-sm text-muted-foreground -mt-2">
                Escolha o tipo ou use o assistente pra descobrir o mais adequado.
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 py-2">
                {TIPOS_FORM.map(({ value, label }) => (
                  <button
                    key={value}
                    onClick={() => { escolherTipo(value); setModoNovo("form"); }}
                    className="p-3 rounded-lg border text-left hover:border-emerald-500 hover:bg-emerald-50 transition-colors"
                  >
                    <div className="text-xl mb-1">{TIPO_ICONS[value] ?? "📄"}</div>
                    <div className="text-[11px] font-medium leading-tight">{label}</div>
                  </button>
                ))}
              </div>
              <div className="relative py-1">
                <div className="absolute inset-0 flex items-center"><div className="w-full border-t" /></div>
                <div className="relative flex justify-center">
                  <span className="bg-background px-3 text-[10px] text-muted-foreground uppercase tracking-wide">ou</span>
                </div>
              </div>
              <button
                onClick={() => { recomecarAssistente(); setModoNovo("assistente"); }}
                className="w-full p-4 rounded-lg border-2 border-dashed hover:border-emerald-500 hover:bg-emerald-50 transition-colors text-left flex items-center gap-3"
              >
                <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center shrink-0">
                  <Sparkles className="w-5 h-5 text-emerald-700" />
                </div>
                <div>
                  <div className="text-sm font-semibold">Não sabe qual escolher?</div>
                  <div className="text-xs text-muted-foreground">Responda 7 perguntas e descubra o contrato mais adequado</div>
                </div>
              </button>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowNew(false)}>Cancelar</Button>
              </DialogFooter>
            </>
          )}

          {/* ── MODO ASSISTENTE: questionário ou resultado ── */}
          {modoNovo === "assistente" && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-emerald-600" />
                  Assistente Inteligente
                </DialogTitle>
              </DialogHeader>

              {enviandoAssist && (
                <div className="py-10 text-center text-sm text-muted-foreground">Analisando suas respostas...</div>
              )}

              {!enviandoAssist && !resultadoAssist && perguntaAtual && (
                <div className="space-y-4 py-2">
                  <p className="text-[11px] text-muted-foreground uppercase tracking-wide">
                    Pergunta {posicaoAtual} de {perguntasAtivas.length}
                  </p>
                  <p className="text-sm font-medium">{perguntaAtual.pergunta}</p>
                  {perguntaAtual.dica && (
                    <p className="text-xs text-muted-foreground bg-muted/50 rounded-md p-2.5">
                      💡 {perguntaAtual.dica}
                    </p>
                  )}
                  <div className="space-y-2">
                    {perguntaAtual.opcoes.map((op) => (
                      <button
                        key={op.value}
                        onClick={() => responderPergunta(perguntaAtual.campo, op.value)}
                        className="w-full p-3 rounded-lg border text-left text-sm hover:border-emerald-500 hover:bg-emerald-50 transition-colors"
                      >
                        {op.label}
                      </button>
                    ))}
                  </div>
                  <Button variant="ghost" size="sm" onClick={voltarPergunta}>
                    <ArrowLeft className="w-3.5 h-3.5 mr-1" /> Voltar
                  </Button>
                </div>
              )}

              {!enviandoAssist && resultadoAssist?.alerta_vinculo && (
                <div className="py-2 space-y-4">
                  <div className="flex gap-3 p-4 rounded-lg bg-amber-50 border border-amber-200">
                    <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                    <p className="text-sm text-amber-900">{resultadoAssist.alerta_vinculo}</p>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setModoNovo("seletor")}>Escolher manualmente</Button>
                    <Button onClick={recomecarAssistente} style={{ background: "oklch(0.42 0.14 145)" }}>
                      Refazer perguntas
                    </Button>
                  </DialogFooter>
                </div>
              )}

              {!enviandoAssist && resultadoAssist?.recomendado && (
                <div className="py-2 space-y-4 max-h-[60vh] overflow-y-auto pr-1">
                  <div className="p-4 rounded-lg bg-emerald-50 border border-emerald-200">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-5 h-5 text-emerald-700 shrink-0" />
                      <span className="font-semibold text-emerald-900">
                        {resultadoAssist.recomendado.emoji} {resultadoAssist.recomendado.nome}
                      </span>
                    </div>
                    {resultadoAssist.justificativa && (
                      <p className="text-xs text-emerald-800 mt-1.5">{resultadoAssist.justificativa}</p>
                    )}
                  </div>

                  {resultadoAssist.alertas_inconsistencia && resultadoAssist.alertas_inconsistencia.length > 0 && (
                    <div className="space-y-1.5">
                      {resultadoAssist.alertas_inconsistencia.map((a, i) => (
                        <div key={i} className="flex gap-2 p-2.5 rounded-md bg-amber-50 border border-amber-200">
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                          <p className="text-xs text-amber-900">{a}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {resultadoAssist.recomendado.alertas && resultadoAssist.recomendado.alertas.length > 0 && (
                    <div className="space-y-1.5">
                      {resultadoAssist.recomendado.alertas.map((a, i) => (
                        <div key={i} className={`flex gap-2 p-2.5 rounded-md border ${
                          a.nivel === "proibicao" ? "bg-red-50 border-red-200" : "bg-blue-50 border-blue-200"
                        }`}>
                          <AlertTriangle className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${a.nivel === "proibicao" ? "text-red-600" : "text-blue-600"}`} />
                          <p className={`text-xs ${a.nivel === "proibicao" ? "text-red-900" : "text-blue-900"}`}>{a.texto}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {resultadoAssist.recomendado.clausulas && resultadoAssist.recomendado.clausulas.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Cláusulas essenciais</p>
                      <ul className="space-y-1">
                        {resultadoAssist.recomendado.clausulas.map((c, i) => (
                          <li key={i} className="text-xs">
                            <span className="font-medium">{c.titulo}</span>
                            {c.descricao && <span className="text-muted-foreground"> — {c.descricao}</span>}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {resultadoAssist.alternativas.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Alternativas</p>
                      <div className="flex flex-wrap gap-1.5">
                        {resultadoAssist.alternativas.map((a) => (
                          <button
                            key={a.slug}
                            onClick={() => usarRecomendacao(a.slug)}
                            className="text-xs px-2.5 py-1 rounded-full border hover:border-emerald-500 hover:bg-emerald-50"
                          >
                            {a.emoji} {a.nome}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <DialogFooter>
                    <Button variant="outline" onClick={recomecarAssistente}>Refazer</Button>
                    <Button onClick={() => usarRecomendacao(resultadoAssist.recomendado!.slug)}
                      style={{ background: "oklch(0.42 0.14 145)" }}>
                      Usar este tipo
                    </Button>
                  </DialogFooter>
                </div>
              )}
            </>
          )}

          {/* ── MODO FORM: formulário de criação (existente) ── */}
          {modoNovo === "form" && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <button onClick={() => setModoNovo("seletor")} className="text-muted-foreground hover:text-foreground">
                    <ArrowLeft className="w-4 h-4" />
                  </button>
                  Novo Contrato Rural
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-1.5">
                  <Label>Tipo *</Label>
                  <Select value={form.tipo} onValueChange={escolherTipo} >
                    <SelectTrigger><SelectValue placeholder="Selecione o tipo" /></SelectTrigger>
                    <SelectContent>
                      {TIPOS_FORM.map(({ value, label }) => (
                        <SelectItem key={value} value={value}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Descrição</Label>
                  <Input placeholder="Descrição do contrato" value={form.descricao}
                    onChange={(e) => setForm({ ...form, descricao: e.target.value })} />
                </div>
                {!semPartes && (
                  <div className="space-y-3">
                    {ehPecuaria && (
                      <p className="text-xs text-muted-foreground bg-muted/50 rounded-md p-2.5">
                        💡 Em parceria pecuária, "outorgante" e "outorgado" não têm papel fixo —
                        pode ser quem tem as instalações (curral, infraestrutura), quem cede a
                        área de pastagem, ou qualquer outra combinação. Defina os percentuais
                        conforme o que cada lado realmente está contribuindo.
                      </p>
                    )}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label>Outorgante *</Label>
                        <Input placeholder="Nome completo" value={form.outorgante_nome}
                          onChange={(e) => setForm({ ...form, outorgante_nome: e.target.value })} />
                      </div>
                      <div className="space-y-1.5">
                        <Label>CPF/CNPJ do Outorgante</Label>
                        <Input placeholder="000.000.000-00" value={form.outorgante_documento}
                          onChange={(e) => setForm({ ...form, outorgante_documento: e.target.value })} />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Telefone (WhatsApp) do Outorgante *</Label>
                      <Input placeholder="(00) 00000-0000" value={form.outorgante_telefone}
                        onChange={(e) => setForm({ ...form, outorgante_telefone: e.target.value })} />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label>Outorgado *</Label>
                        <Input placeholder="Nome completo" value={form.outorgado_nome}
                          onChange={(e) => setForm({ ...form, outorgado_nome: e.target.value })} />
                      </div>
                      <div className="space-y-1.5">
                        <Label>CPF/CNPJ do Outorgado</Label>
                        <Input placeholder="000.000.000-00" value={form.outorgado_documento}
                          onChange={(e) => setForm({ ...form, outorgado_documento: e.target.value })} />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Telefone (WhatsApp) do Outorgado *</Label>
                      <Input placeholder="(00) 00000-0000" value={form.outorgado_telefone}
                        onChange={(e) => setForm({ ...form, outorgado_telefone: e.target.value })} />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label>% Outorgante</Label>
                        <Input type="number" min={0} max={100} value={form.percentual_outorgante}
                          onChange={(e) => setForm({ ...form, percentual_outorgante: e.target.value })} />
                      </div>
                      <div className="space-y-1.5">
                        <Label>% Outorgado</Label>
                        <Input disabled value={100 - (Number(form.percentual_outorgante) || 50)} />
                      </div>
                    </div>
                  </div>
                )}
                {ehPecuaria && (
                  <div className="space-y-3 border rounded-lg p-3 bg-muted/20">
                    <p className="text-xs font-medium text-muted-foreground">Detalhes da parceria pecuária</p>
                    <div className="space-y-1.5">
                      <Label>Modalidade</Label>
                      <Select value={form.modalidade_parceria} onValueChange={(v) => setForm({ ...form, modalidade_parceria: v })}>
                        <SelectTrigger><SelectValue placeholder="Selecione a modalidade" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pastagem">Parceria de pastagem (só área)</SelectItem>
                          <SelectItem value="confinamento">Confinamento (só instalação)</SelectItem>
                          <SelectItem value="integracao">Integração (área + instalação + animais)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs">Espécie / Raça</Label>
                        <Input placeholder="Ex: Bovino Nelore" value={form.especie_raca}
                          onChange={(e) => setForm({ ...form, especie_raca: e.target.value })} />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Peso médio de entrada (kg)</Label>
                        <Input type="number" min={0} placeholder="Ex: 220" value={form.peso_medio_entrada}
                          onChange={(e) => setForm({ ...form, peso_medio_entrada: e.target.value })} />
                      </div>
                    </div>
                  </div>
                )}
                {ehPecuaria && (
                  <div className="space-y-3 border rounded-lg p-3 bg-muted/20">
                    <p className="text-xs font-medium text-muted-foreground">Aquisição do plantel inicial</p>
                    <div className="space-y-1.5">
                      <Label>Quantidade de animais</Label>
                      <Input type="number" min={0} placeholder="Ex: 30" value={form.quantidade_animais}
                        onChange={(e) => setForm({ ...form, quantidade_animais: e.target.value })} />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs">Valor investido — Outorgante</Label>
                        <Input type="number" min={0} placeholder="R$ 0,00" value={form.valor_investido_outorgante}
                          onChange={(e) => setForm({ ...form, valor_investido_outorgante: e.target.value })} />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Valor investido — Outorgado</Label>
                        <Input type="number" min={0} placeholder="R$ 0,00" value={form.valor_investido_outorgado}
                          onChange={(e) => setForm({ ...form, valor_investido_outorgado: e.target.value })} />
                      </div>
                    </div>
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label>Área (hectares){ehCondominio ? " total do condomínio" : ""}</Label>
                  <Input type="number" placeholder="0,00" value={form.valor}
                    onChange={(e) => setForm({ ...form, valor: e.target.value })} />
                </div>

                {ehCondominio && (
                  <div className="space-y-3 border rounded-lg p-3 bg-muted/20">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-medium text-muted-foreground">
                        Condôminos ({condominos.length})
                      </p>
                      <button
                        type="button"
                        onClick={adicionarCondomino}
                        className="text-xs font-medium text-emerald-700 hover:underline"
                      >
                        + Adicionar condômino
                      </button>
                    </div>

                    {condominos.map((c, i) => (
                      <div key={i} className="space-y-2 border-t pt-2 first:border-t-0 first:pt-0">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold">Condômino {i + 1}</span>
                          {condominos.length > 2 && (
                            <button
                              type="button"
                              onClick={() => removerCondomino(i)}
                              className="text-xs text-red-600 hover:underline"
                            >
                              Remover
                            </button>
                          )}
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <Input
                            placeholder="Nome completo"
                            value={c.nome}
                            onChange={(e) => atualizarCondomino(i, "nome", e.target.value)}
                          />
                          <Input
                            placeholder="CPF/CNPJ"
                            value={c.documento}
                            onChange={(e) => atualizarCondomino(i, "documento", e.target.value)}
                          />
                        </div>
                        <Input
                          placeholder="Telefone (WhatsApp) — com DDD"
                          value={c.telefone}
                          onChange={(e) => atualizarCondomino(i, "telefone", e.target.value)}
                        />
                        <div className="grid grid-cols-2 gap-2">
                          <Input
                            type="number"
                            min={0}
                            placeholder="Área (ha)"
                            value={c.area_ha}
                            onChange={(e) => atualizarCondomino(i, "area_ha", e.target.value)}
                          />
                          <Select
                            value={c.papel}
                            onValueChange={(v) => atualizarCondomino(i, "papel", v)}
                          >
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="administrador">Administrador</SelectItem>
                              <SelectItem value="condomino">Condômino</SelectItem>
                              <SelectItem value="inventariante">Inventariante</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        {c.area_ha && areaTotalCondominio > 0 && (
                          <p className="text-[11px] text-muted-foreground">
                            ≈ {((Number(c.area_ha) / areaTotalCondominio) * 100).toFixed(1)}% de participação
                          </p>
                        )}
                      </div>
                    ))}

                    <p className={`text-xs font-medium ${
                      somaAreaCondominos > areaTotalCondominio + 0.01
                        ? "text-red-600"
                        : "text-muted-foreground"
                    }`}>
                      Soma das áreas: {somaAreaCondominos.toFixed(2)} ha
                      {areaTotalCondominio > 0 && ` de ${areaTotalCondominio.toFixed(2)} ha total`}
                    </p>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Data Início</Label>
                    <Input type="date" value={form.data_inicio}
                      onChange={(e) => setForm({ ...form, data_inicio: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Data Fim</Label>
                    <Input type="date" value={form.data_fim}
                      onChange={(e) => setForm({ ...form, data_fim: e.target.value })} />
                  </div>
                </div>
                {!form.data_fim && (
                  <div className="space-y-1.5">
                    <Label>Aviso prévio de rescisão (dias) *</Label>
                    <Input type="number" min={1} placeholder="Ex: 90" value={form.clausula_denuncia_dias}
                      onChange={(e) => setForm({ ...form, clausula_denuncia_dias: e.target.value })} />
                    <p className="text-xs text-muted-foreground">
                      Sem data fim (prazo indeterminado), é obrigatório definir com quantos dias de
                      antecedência qualquer parte pode encerrar o contrato.
                    </p>
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label>Frequência de pagamento</Label>
                  <Select value={form.frequencia_pagamento} onValueChange={(v) => setForm({ ...form, frequencia_pagamento: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ehPecuaria ? (
                        <>
                          <SelectItem value="apos_abate">Após abate</SelectItem>
                          <SelectItem value="mensal">Mensal</SelectItem>
                          <SelectItem value="semestral">Semestral</SelectItem>
                          <SelectItem value="ao_termino">Ao término do contrato</SelectItem>
                        </>
                      ) : (
                        <>
                          <SelectItem value="safra">Por safra</SelectItem>
                          <SelectItem value="mensal">Mensal</SelectItem>
                          <SelectItem value="anual">Anual</SelectItem>
                          <SelectItem value="ao_termino">Ao término do contrato</SelectItem>
                        </>
                      )}
                    </SelectContent>
                  </Select>
                </div>
                {!semPartes && (
                  <>
                    <div className="space-y-1.5">
                      <Label>Responsabilidade por custos operacionais</Label>
                      <textarea
                        className="w-full min-h-[70px] rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        placeholder="Ex: Os custos operacionais serão rateados entre as partes na mesma proporção do percentual de divisão estabelecido neste contrato. Caso uma das partes desembolse valor superior à sua cota-parte, mediante comprovação por nota fiscal ou recibo, o valor excedente será reembolsado pela outra parte antes da apuração do lucro a ser dividido."
                        value={form.responsabilidade_custos}
                        onChange={(e) => setForm({ ...form, responsabilidade_custos: e.target.value })}
                      />
                      <p className="text-xs text-muted-foreground">
                        Quem paga ração, vacina, mão de obra, instalações — e se isso é deduzido antes de dividir o resultado.
                      </p>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Responsabilidade por riscos e perdas</Label>
                      <textarea
                        className="w-full min-h-[70px] rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        placeholder="Ex: Morte por causa natural — prejuízo dividido proporcionalmente. Roubo/furto — comunicação imediata e boletim de ocorrência, prejuízo dividido. Doenças de notificação obrigatória — responsabilidade de quem descumprir o protocolo sanitário combinado."
                        value={form.responsabilidade_riscos}
                        onChange={(e) => setForm({ ...form, responsabilidade_riscos: e.target.value })}
                      />
                      <p className="text-xs text-muted-foreground">
                        Um dos pontos mais litigiosos em parceria pecuária — quem assume morte, roubo ou doença do rebanho.
                      </p>
                    </div>
                  </>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowNew(false)}>Cancelar</Button>
                <Button onClick={handleCreate} disabled={saving}
                  style={{ background: "oklch(0.42 0.14 145)" }}>
                  {saving ? "Salvando..." : "Criar Contrato"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}


