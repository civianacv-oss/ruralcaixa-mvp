"use client";
import { useState, useEffect } from "react";
import BannerOrientacao from "@/components/BannerOrientacao";

const API = "https://ruralcaixa-mvp-production.up.railway.app";
const PRODUTOR_ID = 1;

function fmtBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtDate(s: string) {
  if (!s) return "-";
  return new Date(s + "T00:00:00").toLocaleDateString("pt-BR");
}

type Lancamento = {
  id: string | number;
  tipo: string;
  descricao: string;
  valor: number;
  data_lancamento: string;
  produto: string | null;
  atividade: string | null;
  documento_url: string | null;
  confirmado: boolean;
};

type FormState = {
  tipo: string;
  descricao: string;
  valor: string;
  data: string;
  atividade: string;
};

const SUGESTOES_RECEITA = [
  "Venda de bovinos", "Venda de ovinos", "Venda de suÃ­nos",
  "Venda de produtos agrÃ­colas", "ServiÃ§os prestados",
  "Arrendamento recebido", "Outras receitas",
];
const SUGESTOES_DESPESA = [
  "Custeio agrÃ­cola", "CombustÃ­veis", "MÃ£o de obra", "ManutenÃ§Ã£o",
  "Energia elÃ©trica", "Arrendamento pago", "Medicamentos / Sanidade",
  "AlimentaÃ§Ã£o animal", "Outras despesas",
];

const IconEdit = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
  </svg>
);
const IconPlus = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
  </svg>
);
const IconBack = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="15 18 9 12 15 6"/>
  </svg>
);
const IconUpload = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
    <polyline points="17 8 12 3 7 8"/>
    <line x1="12" y1="3" x2="12" y2="15"/>
  </svg>
);
const IconDoc = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
    <polyline points="14 2 14 8 20 8"/>
  </svg>
);

function ModalLancamento({
  titulo,
  form,
  setForm,
  onSalvar,
  onFechar,
  onExcluir,
  saving,
}: {
  titulo: string;
  form: FormState;
  setForm: (f: FormState | ((prev: FormState) => FormState)) => void;
  onSalvar: () => void;
  onFechar: () => void;
  onExcluir?: () => void;
  saving: boolean;
}) {
  const sugestoes = form.tipo === "receita" ? SUGESTOES_RECEITA : SUGESTOES_DESPESA;
  const canSave = form.descricao.trim() && form.valor && form.data;

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000,
      display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
    }}>
      <div style={{
        background: "#fff", borderRadius: 16, padding: "28px 32px", width: "100%", maxWidth: 480,
        boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
      }}>
        <div style={{ display: "flex", alignItems: "center", marginBottom: 24 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#1a2e1a" }}>{titulo}</h2>
          <button onClick={onFechar} style={{ marginLeft: "auto", background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "#9a9a8a", lineHeight: 1 }}>Ã—</button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Tipo */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: "#7a8a6a", display: "block", marginBottom: 6, letterSpacing: "0.5px" }}>TIPO</label>
            <div style={{ display: "flex", gap: 8 }}>
              {["receita", "despesa", "investimento"].map(t => (
                <button key={t} onClick={() => setForm(f => ({ ...f, tipo: t }))} style={{
                  flex: 1, padding: "8px 0", borderRadius: 8, border: "1.5px solid",
                  borderColor: form.tipo === t ? "#3a6a2a" : "#e0dbd0",
                  background: form.tipo === t ? "#3a6a2a" : "#fff",
                  color: form.tipo === t ? "#fff" : "#5a6a5a",
                  fontSize: 12, fontWeight: 600, cursor: "pointer",
                }}>
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* DescriÃ§Ã£o */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: "#7a8a6a", display: "block", marginBottom: 6, letterSpacing: "0.5px" }}>
              DESCRIÃ‡ÃƒO
              <span style={{ fontWeight: 400, marginLeft: 6, color: "#aaa" }}>â€” a conta serÃ¡ classificada automaticamente</span>
            </label>
            <input
              list="sugestoes-lista"
              value={form.descricao}
              onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))}
              placeholder="Ex: venda de 3 bois, compra de raÃ§Ã£o..."
              style={{ width: "100%", border: "1.5px solid #e0dbd0", borderRadius: 8, padding: "9px 12px", fontSize: 13, color: "#1a2e1a", boxSizing: "border-box", outline: "none" }}
            />
            <datalist id="sugestoes-lista">
              {sugestoes.map(c => <option key={c} value={c} />)}
            </datalist>
          </div>

          {/* Valor */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: "#7a8a6a", display: "block", marginBottom: 6, letterSpacing: "0.5px" }}>VALOR (R$)</label>
            <input
              type="number" min="0" step="0.01"
              value={form.valor}
              onChange={e => setForm(f => ({ ...f, valor: e.target.value }))}
              placeholder="0,00"
              style={{ width: "100%", border: "1.5px solid #e0dbd0", borderRadius: 8, padding: "9px 12px", fontSize: 13, color: "#1a2e1a", boxSizing: "border-box", outline: "none" }}
            />
          </div>

          {/* Data */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: "#7a8a6a", display: "block", marginBottom: 6, letterSpacing: "0.5px" }}>DATA</label>
            <input
              type="date"
              value={form.data}
              onChange={e => setForm(f => ({ ...f, data: e.target.value }))}
              style={{ width: "100%", border: "1.5px solid #e0dbd0", borderRadius: 8, padding: "9px 12px", fontSize: 13, color: "#1a2e1a", boxSizing: "border-box", outline: "none" }}
            />
          </div>

          {/* Atividade */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: "#7a8a6a", display: "block", marginBottom: 6, letterSpacing: "0.5px" }}>ATIVIDADE</label>
            <select
              value={form.atividade}
              onChange={e => setForm(f => ({ ...f, atividade: e.target.value }))}
              style={{ width: "100%", border: "1.5px solid #e0dbd0", borderRadius: 8, padding: "9px 12px", fontSize: 13, color: "#1a2e1a", boxSizing: "border-box", background: "#fff" }}
            >
              <option value="rural">Rural</option>
              <option value="pecuaria">PecuÃ¡ria</option>
              <option value="agricultura">Agricultura</option>
              <option value="investimento">Investimento</option>
            </select>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 24 }}>
          {onExcluir && (
            <button onClick={() => { if (window.confirm("Excluir este lancamento?")) onExcluir!(); }} style={{
              padding: "10px 0", borderRadius: 8, border: "1.5px solid #fecaca",
              background: "#fff5f5", color: "#dc2626", fontSize: 13, fontWeight: 600, cursor: "pointer",
            }}>Excluir lancamento</button>
          )}
          <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onFechar} style={{
            flex: 1, padding: "10px 0", borderRadius: 8, border: "1.5px solid #e0dbd0",
            background: "#fff", color: "#5a6a5a", fontSize: 13, fontWeight: 600, cursor: "pointer",
          }}>
            Cancelar
          </button>
          <button
            onClick={onSalvar}
            disabled={saving || !canSave}
            style={{
              flex: 2, padding: "10px 0", borderRadius: 8, border: "none",
              background: saving || !canSave ? "#8ab88a" : "#3a6a2a", color: "#fff",
              fontSize: 13, fontWeight: 700, cursor: saving || !canSave ? "not-allowed" : "pointer",
            }}
          >
            {saving ? "Salvando..." : "Salvar LanÃ§amento"}
          </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const FORM_VAZIO: FormState = {
  tipo: "despesa", descricao: "", valor: "", data: new Date().toISOString().slice(0, 10), atividade: "rural",
};

export default function LancamentosPage() {
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroTipo, setFiltroTipo] = useState<"todos" | "receita" | "despesa" | "investimento">("todos");
  const [filtroMes, setFiltroMes] = useState("");

  // Modal criar
  const [showCriar, setShowCriar] = useState(false);
  const [formCriar, setFormCriar] = useState<FormState>(FORM_VAZIO);
  const [savingCriar, setSavingCriar] = useState(false);

  // Modal editar
  const [editando, setEditando] = useState<Lancamento | null>(null);
  const [formEditar, setFormEditar] = useState<FormState>(FORM_VAZIO);
  const [savingEditar, setSavingEditar] = useState(false);

  // Upload documento
  const [uploadingId, setUploadingId] = useState<string | null>(null);

  const [msg, setMsg] = useState<{ text: string; tipo: "ok" | "err" } | null>(null);

  function showMsg(text: string, tipo: "ok" | "err" = "ok") {
    setMsg({ text, tipo });
    setTimeout(() => setMsg(null), 3500);
  }

  function carregarLancamentos(mes?: string) {
    setLoading(true);
    const q = mes ? `?mes=${mes}` : "";
    fetch(`${API}/produtores/${PRODUTOR_ID}/lancamentos${q}`)
      .then(r => r.json())
      .then(data => { setLancamentos(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => setLoading(false));
  }

  useEffect(() => { carregarLancamentos(filtroMes || undefined); }, [filtroMes]);

  const filtrados = lancamentos.filter(l => filtroTipo === "todos" || l.tipo === filtroTipo);
  const totalReceitas = lancamentos.filter(l => l.tipo === "receita").reduce((s, l) => s + l.valor, 0);
  const totalDespesas = lancamentos.filter(l => l.tipo === "despesa").reduce((s, l) => s + l.valor, 0);
  const saldo = totalReceitas - totalDespesas;

  // â”€â”€ Criar â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  async function handleCriar() {
    setSavingCriar(true);
    try {
      const res = await fetch(`${API}/lancamentos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          produtor_id: PRODUTOR_ID,
          valor: parseFloat(formCriar.valor.replace(",", ".")),
          data: formCriar.data,
          origem: formCriar.atividade,
          tipo: formCriar.tipo,
          descricao: formCriar.descricao,
          confirmado: true,
          atividade: formCriar.atividade,
        }),
      });
      if (res.ok) {
        setShowCriar(false);
        setFormCriar(FORM_VAZIO);
        showMsg("LanÃ§amento criado com sucesso!");
        carregarLancamentos(filtroMes || undefined);
      } else {
        showMsg("Erro ao criar lanÃ§amento.", "err");
      }
    } finally { setSavingCriar(false); }
  }

  // â”€â”€ Editar â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  function abrirEditar(l: Lancamento) {
    setEditando(l);
    setFormEditar({
      tipo: l.tipo || "despesa",
      descricao: l.descricao || l.produto || "",
      valor: String(l.valor),
      data: l.data_lancamento || new Date().toISOString().slice(0, 10),
      atividade: (l.atividade || "rural").toLowerCase(),
    });
  }

  async function handleEditar() {
    if (!editando) return;
    setSavingEditar(true);
    try {
      const res = await fetch(`${API}/lancamentos/${editando.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          valor: parseFloat(formEditar.valor.replace(",", ".")),
          data: formEditar.data,
          descricao: formEditar.descricao,
          tipo: formEditar.tipo,
          atividade: formEditar.atividade,
        }),
      });
      if (res.ok) {
        setEditando(null);
        showMsg("LanÃ§amento atualizado!");
        carregarLancamentos(filtroMes || undefined);
      } else {
        showMsg("Erro ao atualizar.", "err");
      }
    } finally { setSavingEditar(false); }
  }

  // â”€â”€ Upload documento â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    async function handleExcluir() {
    if (!editando) return;
    try {
      const res = await fetch(`${API}/lancamentos/${editando.id}`, { method: "DELETE" });
      if (res.ok) { setEditando(null); showMsg("Lancamento excluido!"); carregarLancamentos(filtroMes || undefined); }
      else showMsg("Erro ao excluir.", "err");
    } catch { showMsg("Erro de conexao.", "err"); }
  }

  async function handleUpload(lancamentoId: string, file: File) {
    setUploadingId(lancamentoId);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`${API}/lancamentos/${lancamentoId}/documento`, {
        method: "POST",
        body: fd,
      });
      if (res.ok) {
        showMsg("Documento vinculado com sucesso!");
        carregarLancamentos(filtroMes || undefined);
      } else {
        showMsg("Erro ao enviar documento.", "err");
      }
    } catch {
      showMsg("Erro de conexÃ£o ao enviar documento.", "err");
    } finally {
      setUploadingId(null);
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "#f5f3ee", fontFamily: "system-ui, sans-serif" }}>
      {/* Header */}
      <div style={{ background: "#fff", borderBottom: "1px solid #e8e4dc", padding: "14px 28px", display: "flex", alignItems: "center", gap: 12 }}>
        <a href="/" style={{ color: "#5a8a3a", textDecoration: "none", fontSize: 13, display: "flex", alignItems: "center", gap: 4, padding: "4px 10px", background: "#fff", borderRadius: 8, border: "1px solid #d0e8c0" }}>ðŸ  Painel Principal</a>
        <button onClick={() => window.history.back()} style={{ color:"#5a8a3a", fontSize:13, display:"flex", alignItems:"center", gap:4, background:"#fff", border:"1px solid #d0e8c0", cursor:"pointer", fontWeight:600, borderRadius:8, padding:"4px 10px" }}>â† Voltar</button>
        <span style={{ color: "#ddd" }}>/</span>
        <h1 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "#1a2e1a" }}>LanÃ§amentos Financeiros</h1>
        <button
          onClick={() => { setFormCriar(FORM_VAZIO); setShowCriar(true); }}
          style={{
            marginLeft: "auto", background: "#3a6a2a", color: "#fff", border: "none",
            padding: "8px 18px", borderRadius: 8, fontSize: 13, fontWeight: 600,
            cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
          }}
        >
          <IconPlus /> Novo LanÃ§amento
        </button>
      </div>

      <div style={{ padding: "24px 28px" }}>
        <BannerOrientacao
          modulo="lancamentos"
          titulo="Como usar os LanÃ§amentos Financeiros"
          descricao="Aqui vocÃª registra toda entrada e saÃ­da de dinheiro da sua propriedade rural. Esses lanÃ§amentos formam a base do seu Livro Caixa Rural (LCDPR), exigido pela Receita Federal para produtores com receita acima de R$ 142.798,50/ano."
          passos={[
            { icone: "ðŸ“ˆ", texto: "Receita: venda de animais, leite, grÃ£os, etc." },
            { icone: "ðŸ“‰", texto: "Despesa: insumos, veterinÃ¡rio, combustÃ­vel, etc." },
            { icone: "ðŸ—ï¸", texto: "Investimento: mÃ¡quinas, benfeitorias, animais reprodutores" },
          ]}
          baseLegal="Base legal: InstruÃ§Ã£o Normativa RFB nÂº 1.848/2018 â€” Livro Caixa Digital do Produtor Rural (LCDPR)"
        />
        {/* Toast */}
        {msg && (
          <div style={{
            background: msg.tipo === "ok" ? "#d4edda" : "#f8d7da",
            border: `1px solid ${msg.tipo === "ok" ? "#c3e6cb" : "#f5c6cb"}`,
            color: msg.tipo === "ok" ? "#155724" : "#721c24",
            padding: "10px 16px", borderRadius: 8, marginBottom: 16, fontSize: 13,
          }}>
            {msg.tipo === "ok" ? "âœ…" : "âŒ"} {msg.text}
          </div>
        )}

        {/* KPI Cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 24 }}>
          {[
            { label: "Receitas", value: fmtBRL(totalReceitas), color: "#2d7a2d", bg: "#f0faf0", icon: "ðŸ“ˆ" },
            { label: "Despesas", value: fmtBRL(totalDespesas), color: "#c0392b", bg: "#fff5f5", icon: "ðŸ“‰" },
            { label: "Saldo", value: fmtBRL(saldo), color: saldo >= 0 ? "#2d7a2d" : "#c0392b", bg: saldo >= 0 ? "#f0faf0" : "#fff5f5", icon: "ðŸ’°" },
          ].map(k => (
            <div key={k.label} style={{ background: k.bg, border: `1px solid ${k.color}22`, borderRadius: 12, padding: "16px 20px" }}>
              <div style={{ fontSize: 12, color: "#7a8a6a", marginBottom: 4 }}>{k.icon} {k.label}</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: k.color }}>{k.value}</div>
            </div>
          ))}
        </div>

        {/* Filtros */}
        <div style={{ background: "#fff", borderRadius: 12, padding: "14px 20px", marginBottom: 16, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: 6 }}>
            {(["todos", "receita", "despesa", "investimento"] as const).map(t => (
              <button key={t} onClick={() => setFiltroTipo(t)} style={{
                padding: "5px 14px", borderRadius: 20, border: "1.5px solid",
                borderColor: filtroTipo === t ? "#3a6a2a" : "#e0dbd0",
                background: filtroTipo === t ? "#3a6a2a" : "#fff",
                color: filtroTipo === t ? "#fff" : "#5a6a5a",
                fontSize: 12, fontWeight: 600, cursor: "pointer",
              }}>
                {t === "todos" ? "Todos" : t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
            <label style={{ fontSize: 12, color: "#7a8a6a" }}>MÃªs:</label>
            <input type="month" value={filtroMes} onChange={e => setFiltroMes(e.target.value)}
              style={{ border: "1.5px solid #e0dbd0", borderRadius: 8, padding: "5px 10px", fontSize: 12, color: "#1a2e1a" }} />
            {filtroMes && (
              <button onClick={() => setFiltroMes("")} style={{ background: "none", border: "none", color: "#c0392b", cursor: "pointer", fontSize: 12 }}>
                Limpar
              </button>
            )}
          </div>
        </div>

        {/* Tabela */}
        <div style={{ background: "#fff", borderRadius: 12, overflow: "hidden", border: "1px solid #e8e4dc" }}>
          {loading ? (
            <div style={{ padding: 40, textAlign: "center", color: "#7a8a6a", fontSize: 14 }}>Carregando lanÃ§amentos...</div>
          ) : filtrados.length === 0 ? (
            <div style={{ padding: 48, textAlign: "center" }}>
              <div style={{ fontSize: 44, marginBottom: 12 }}>ðŸ’°</div>
              <div style={{ fontSize: 15, fontWeight: 600, color: "#1a2e1a", marginBottom: 8 }}>Nenhum lanÃ§amento registrado ainda</div>
              <div style={{ fontSize: 13, color: "#5a6a5a", lineHeight: 1.65, maxWidth: 420, margin: "0 auto", marginBottom: 20 }}>
                Comece registrando as receitas e despesas da sua propriedade. Exemplos: venda de animais (receita), compra de raÃ§Ã£o (despesa), aquisiÃ§Ã£o de trator (investimento).
              </div>
              <button onClick={() => { setFormCriar(FORM_VAZIO); setShowCriar(true); }} style={{
                background: "#3a6a2a", color: "#fff", border: "none",
                padding: "10px 20px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", marginBottom: 16,
              }}>
                + Registrar Primeiro LanÃ§amento
              </button>
              <div style={{ display: "inline-block", background: "#FFF8E1", border: "1px solid #FFE082", borderRadius: 8, padding: "8px 16px", fontSize: 12.5, color: "#5a4a10", maxWidth: 420 }}>
                ðŸ’¡ Guarde todas as notas fiscais de compra de insumos â€” elas sÃ£o dedutÃ­veis no cÃ¡lculo do imposto rural.
              </div>
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#f8f6f2", borderBottom: "1px solid #e8e4dc" }}>
                  {["Data", "DescriÃ§Ã£o", "Tipo", "Valor", "Atividade", "Doc", ""].map((h, i) => (
                    <th key={i} style={{ padding: "11px 16px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "#7a8a6a", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtrados.map((l, i) => (
                  <tr key={l.id} style={{ borderBottom: "1px solid #f0ece4", background: i % 2 === 0 ? "#fff" : "#fdfcfa" }}>
                    <td style={{ padding: "11px 16px", fontSize: 13, color: "#5a6a5a", whiteSpace: "nowrap" }}>
                      {fmtDate(l.data_lancamento)}
                    </td>
                    <td style={{ padding: "11px 16px", fontSize: 13, color: "#1a2e1a", maxWidth: 240 }}>
                      {l.descricao || l.produto || "-"}
                    </td>
                    <td style={{ padding: "11px 16px" }}>
                      <span style={{
                        display: "inline-block", padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700,
                        background: l.tipo === "receita" ? "#d4edda" : l.tipo === "despesa" ? "#f8d7da" : "#fff3cd",
                        color: l.tipo === "receita" ? "#155724" : l.tipo === "despesa" ? "#721c24" : "#856404",
                      }}>
                        {l.tipo?.toUpperCase() || "-"}
                      </span>
                    </td>
                    <td style={{ padding: "11px 16px", fontSize: 13, fontWeight: 600, color: l.tipo === "receita" ? "#2d7a2d" : "#c0392b", whiteSpace: "nowrap" }}>
                      {l.tipo === "receita" ? "+" : "-"}{fmtBRL(l.valor)}
                    </td>
                    <td style={{ padding: "11px 16px", fontSize: 12, color: "#7a8a6a" }}>
                      {(l.atividade || "rural").toUpperCase()}
                    </td>
                    {/* Coluna Doc: link se existir + botÃ£o upload */}
                    <td style={{ padding: "11px 16px", whiteSpace: "nowrap" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        {l.documento_url ? (
                          <a
                            href={l.documento_url}
                            target="_blank"
                            rel="noreferrer"
                            title="Ver documento"
                            style={{
                              display: "inline-flex", alignItems: "center", gap: 4,
                              color: "#3a6a2a", fontSize: 12, fontWeight: 600,
                              textDecoration: "none", background: "#f0faf0",
                              border: "1.5px solid #c8ddb8", borderRadius: 6, padding: "3px 8px",
                            }}
                          >
                            <IconDoc /> Ver
                          </a>
                        ) : (
                          <span style={{ color: "#ccc", fontSize: 12 }}>â€”</span>
                        )}
                        {/* BotÃ£o upload: input file oculto */}
                        <label
                          title={uploadingId === String(l.id) ? "Enviando..." : "Anexar documento"}
                          style={{
                            display: "inline-flex", alignItems: "center", gap: 4,
                            color: uploadingId === String(l.id) ? "#aaa" : "#7a8a6a",
                            fontSize: 12, cursor: uploadingId === String(l.id) ? "not-allowed" : "pointer",
                            background: "#f8f6f2", border: "1.5px solid #e0dbd0",
                            borderRadius: 6, padding: "3px 8px",
                          }}
                        >
                          <IconUpload />
                          {uploadingId === String(l.id) ? "..." : ""}
                          <input
                            type="file"
                            accept=".pdf,.jpg,.jpeg,.png,.webp"
                            style={{ display: "none" }}
                            disabled={uploadingId !== null}
                            onChange={e => {
                              const file = e.target.files?.[0];
                              if (file) handleUpload(String(l.id), file);
                              e.target.value = "";
                            }}
                          />
                        </label>
                      </div>
                    </td>
                    {/* BotÃ£o Editar */}
                    <td style={{ padding: "11px 12px", textAlign: "right" }}>
                      <button
                        onClick={() => abrirEditar(l)}
                        title="Editar lanÃ§amento"
                        style={{
                          background: "#f0f5eb", border: "1.5px solid #c8ddb8", color: "#3a6a2a",
                          borderRadius: 7, padding: "5px 10px", cursor: "pointer",
                          display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: 600,
                          transition: "all 0.15s",
                        }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "#3a6a2a"; (e.currentTarget as HTMLElement).style.color = "#fff"; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "#f0f5eb"; (e.currentTarget as HTMLElement).style.color = "#3a6a2a"; }}
                      >
                        <IconEdit /> Editar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div style={{ marginTop: 10, fontSize: 12, color: "#9a9a8a" }}>
          {filtrados.length} lanÃ§amento{filtrados.length !== 1 ? "s" : ""}{filtroMes ? ` em ${filtroMes}` : " no perÃ­odo"}
        </div>
      </div>

      {/* Modal Criar */}
      {showCriar && (
        <ModalLancamento
          titulo="Novo LanÃ§amento"
          form={formCriar}
          setForm={setFormCriar}
          onSalvar={handleCriar}
          onFechar={() => setShowCriar(false)}
          saving={savingCriar}
        />
      )}

      {/* Modal Editar */}
      {editando && (
        <ModalLancamento
          titulo="Editar LanÃ§amento"
          form={formEditar}
          setForm={setFormEditar}
          onSalvar={handleEditar}
          onFechar={() => setEditando(null)}
          saving={savingEditar}
          onExcluir={handleExcluir}
          onExcluir={handleExcluir}
        />
      )}
    </div>
  );
}



