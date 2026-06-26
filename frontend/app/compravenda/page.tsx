"use client";
import { apiFetch } from "@/lib/api";
import { useState, useEffect } from "react";
import BannerOrientacao from "@/components/BannerOrientacao";

const API = "https://ruralcaixa-mvp-production.up.railway.app";
const IMOVEL_ID = 1;

// ── helpers ────────────────────────────────────────────────────
function fmtBRL(v: number | null | undefined) {
  if (v == null) return "—";
  return "R$ " + Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtDate(s: string | null | undefined) {
  if (!s) return "—";
  return new Date(s + "T00:00:00").toLocaleDateString("pt-BR");
}
function fmtPct(v: number | null | undefined) {
  if (v == null) return "—";
  return Number(v).toFixed(2) + "%";
}

// ── types ──────────────────────────────────────────────────────
type Produto = {
  id: number; nome: string; descricao: string | null; unidade: string;
  especie: string | null; custo_medio: number | null;
  total_comprado: number; total_vendido: number;
  estoque_atual: number; custo_medio_calc: number | null;
};
type Compra = {
  id: number; produto_id: number; produto_nome: string; unidade: string;
  especie: string | null; data_compra: string; quantidade: number;
  valor_unitario: number; valor_total: number; fornecedor: string | null;
  nota_fiscal: string | null; observacoes: string | null;
  regime: "pasto" | "confinamento";
};
type Venda = {
  id: number; produto_id: number; produto_nome: string; unidade: string;
  especie: string | null; data_venda: string; quantidade: number;
  valor_unitario: number; valor_total: number; custo_total: number;
  lucro_bruto: number; margem_pct: number; comprador: string | null;
  nota_fiscal: string | null;
};
type FluxoMes = {
  mes: string; entradas: number; saidas_compras: number;
  saidas_despesas: number; saidas_total: number;
  saldo_mes: number; saldo_acumulado: number;
};
type Dashboard = {
  resumo: {
    receita_bruta: number; cmv: number; lucro_bruto: number;
    margem_bruta_pct: number; despesas_operacionais: number;
    lucro_liquido: number; margem_liquida_pct: number;
    total_investido_compras: number; valor_estoque_atual: number;
    total_vendas: number; total_compras: number;
  };
  margem_por_produto: {
    nome: string; especie: string | null; unidade: string;
    qtd_vendida: number; receita: number; custo: number;
    lucro: number; margem_pct: number;
  }[];
};
type DRE = {
  ano: number; receita_bruta: number; cmv: number; lucro_bruto: number;
  margem_bruta_pct: number; despesas: Record<string, number>;
  total_despesas: number; lucro_operacional: number; margem_operacional_pct: number;
};
type Despesa = {
  id: number; descricao: string; categoria: string;
  data_lancamento: string; valor: number;
};
type AlertaFiscal = {
  id: number; produto_id: number; produto_nome: string;
  especie: string | null; unidade: string;
  data_compra: string; quantidade: number; valor_total: number;
  regime: "pasto" | "confinamento"; fornecedor: string | null;
  dias_em_estoque: number; prazo_max: number;
  dias_restantes: number; pct_prazo: number;
  nivel: "critico" | "urgente" | "atencao";
  mensagem: string;
};
type AlertasResponse = {
  total_alertas: number; criticos: number; urgentes: number; atencao: number;
  dias_aviso: number; alertas: AlertaFiscal[];
};

const especieLabel: Record<string, string> = {
  bovino: "🐄 Bovino", suino: "🐖 Suíno", ovino: "🐑 Ovino",
  caprino: "🐐 Caprino", outro: "📦 Outro",
};
const categoriaLabel: Record<string, string> = {
  operacional: "Operacional", logistica: "Logística",
  administrativa: "Administrativa", financeira: "Financeira",
};

const COR = "#1a5c2e";
const COR_LIGHT = "#f0f7f2";
const COR_BORDER = "#c8e6d0";

// ── Regra Receita Federal — RIR/2018, art. 2º, §2º ──────────────
// Animais adquiridos de terceiros que permanecerem em poder do produtor por
// tempo IGUAL OU SUPERIOR aos prazos abaixo passam a ser tratados como
// atividade rural (não mais comercial).
const PRAZO_CONFINAMENTO_DIAS = 52;   // regime de confinamento
const PRAZO_PASTO_DIAS        = 138;  // demais regimes (pasto, semi-confinamento)

function calcularStatusFiscal(
  dataCompra: string,
  regime: "confinamento" | "pasto"
): { diasDecorridos: number; prazoMax: number; status: "comercial" | "rural" | "alerta" } {
  const hoje = new Date();
  const compra = new Date(dataCompra + "T00:00:00");
  const dias = Math.floor((hoje.getTime() - compra.getTime()) / 86_400_000);
  const prazo = regime === "confinamento" ? PRAZO_CONFINAMENTO_DIAS : PRAZO_PASTO_DIAS;
  const status = dias >= prazo ? "rural" : dias >= prazo * 0.75 ? "alerta" : "comercial";
  return { diasDecorridos: dias, prazoMax: prazo, status };
}

export default function CompraVendaPage() {
  const [aba, setAba] = useState<"estoque" | "compras" | "vendas" | "fluxo" | "dre" | "alertas">("estoque");
  const [loading, setLoading] = useState(true);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [compras, setCompras] = useState<Compra[]>([]);
  const [vendas, setVendas] = useState<Venda[]>([]);
  const [fluxo, setFluxo] = useState<FluxoMes[]>([]);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [dre, setDre] = useState<DRE | null>(null);
  const [despesas, setDespesas] = useState<Despesa[]>([]);
  const [alertasFiscais, setAlertasFiscais] = useState<AlertasResponse | null>(null);

  // forms
  const [novoProduto, setNovoProduto] = useState({ nome: "", especie: "bovino", unidade: "cab", descricao: "", custo_medio: "" });
  const [novaCompraRegime, setNovaCompraRegime] = useState<"confinamento" | "pasto">("pasto");
  const [novaCompra, setNovaCompra] = useState({ produto_id: "", quantidade: "", valor_unitario: "", fornecedor: "", nota_fiscal: "", data_compra: new Date().toISOString().slice(0, 10) });
  const [novaVenda, setNovaVenda] = useState({ produto_id: "", quantidade: "", valor_unitario: "", comprador: "", nota_fiscal: "", data_venda: new Date().toISOString().slice(0, 10) });
  const [novaDespesa, setNovaDespesa] = useState({ descricao: "", categoria: "operacional", valor: "", data_lancamento: new Date().toISOString().slice(0, 10) });

  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  useEffect(() => { carregarTudo(); }, []);

  async function carregarTudo() {
    setLoading(true);
    try {
      const [prodRes, compRes, vendRes, fluxRes, dashRes, dreRes, despRes] = await Promise.allSettled([
        apiFetch(`${API}/compravenda/produtos?imovel_id=${IMOVEL_ID}`).then(r => r.ok ? r.json() : []),
        apiFetch(`${API}/compravenda/compras?imovel_id=${IMOVEL_ID}`).then(r => r.ok ? r.json() : []),
        apiFetch(`${API}/compravenda/vendas?imovel_id=${IMOVEL_ID}`).then(r => r.ok ? r.json() : []),
        apiFetch(`${API}/compravenda/fluxo-caixa/${IMOVEL_ID}`).then(r => r.ok ? r.json() : []),
        apiFetch(`${API}/compravenda/dashboard/${IMOVEL_ID}`).then(r => r.ok ? r.json() : null),
        apiFetch(`${API}/compravenda/dre/${IMOVEL_ID}`).then(r => r.ok ? r.json() : null),
        apiFetch(`${API}/compravenda/despesas?imovel_id=${IMOVEL_ID}`).then(r => r.ok ? r.json() : []),
        apiFetch(`${API}/compravenda/alertas-fiscais/${IMOVEL_ID}?dias_aviso=10`).then(r => r.ok ? r.json() : null),
      ]);
      if (prodRes.status === "fulfilled") setProdutos(prodRes.value || []);
      if (compRes.status === "fulfilled") setCompras(compRes.value || []);
      if (vendRes.status === "fulfilled") setVendas(vendRes.value || []);
      if (fluxRes.status === "fulfilled") setFluxo(fluxRes.value || []);
      if (dashRes.status === "fulfilled") setDashboard(dashRes.value);
      if (dreRes.status === "fulfilled") setDre(dreRes.value);
      if (despRes.status === "fulfilled") setDespesas(despRes.value || []);
      const alertRes = [prodRes, compRes, vendRes, fluxRes, dashRes, dreRes, despRes][7] as PromiseSettledResult<AlertasResponse | null> | undefined;
      // fetch alertas separately since it's the 8th item
      try {
        const ar = await apiFetch(`${API}/compravenda/alertas-fiscais/${IMOVEL_ID}?dias_aviso=10`);
        if (ar.ok) setAlertasFiscais(await ar.json());
      } catch {}
    } catch (e) { console.error(e); }
    setLoading(false);
  }

  function showMsg(text: string, ok: boolean) {
    setMsg({ text, ok });
    setTimeout(() => setMsg(null), 3500);
  }

  async function cadastrarProduto() {
    if (!novoProduto.nome) return;
    setSalvando(true);
    try {
      const r = await apiFetch(`${API}/compravenda/produtos`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imovel_id: IMOVEL_ID, nome: novoProduto.nome, especie: novoProduto.especie,
          unidade: novoProduto.unidade, descricao: novoProduto.descricao || null,
          custo_medio: novoProduto.custo_medio ? Number(novoProduto.custo_medio) : null,
        }),
      });
      if (r.ok) {
        showMsg("Produto cadastrado!", true);
        setNovoProduto({ nome: "", especie: "bovino", unidade: "cab", descricao: "", custo_medio: "" });
        carregarTudo();
      } else { const e = await r.json(); showMsg(e.detail || "Erro.", false); }
    } catch { showMsg("Erro de conexão.", false); }
    setSalvando(false);
  }

  async function registrarCompra() {
    if (!novaCompra.produto_id || !novaCompra.quantidade || !novaCompra.valor_unitario) return;
    setSalvando(true);
    try {
      const r = await apiFetch(`${API}/compravenda/compras`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imovel_id: IMOVEL_ID, produto_id: Number(novaCompra.produto_id),
          quantidade: Number(novaCompra.quantidade), valor_unitario: Number(novaCompra.valor_unitario),
          fornecedor: novaCompra.fornecedor || null, nota_fiscal: novaCompra.nota_fiscal || null,
          data_compra: novaCompra.data_compra, regime: novaCompraRegime,
        }),
      });
      if (r.ok) {
        const res = await r.json();
        showMsg(`Compra registrada! Total: ${fmtBRL(res.valor_total)}`, true);
        setNovaCompra({ produto_id: "", quantidade: "", valor_unitario: "", fornecedor: "", nota_fiscal: "", data_compra: new Date().toISOString().slice(0, 10) });
        carregarTudo();
      } else { const e = await r.json(); showMsg(e.detail || "Erro.", false); }
    } catch { showMsg("Erro de conexão.", false); }
    setSalvando(false);
  }

  async function registrarVenda() {
    if (!novaVenda.produto_id || !novaVenda.quantidade || !novaVenda.valor_unitario) return;
    setSalvando(true);
    try {
      const r = await apiFetch(`${API}/compravenda/vendas`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imovel_id: IMOVEL_ID, produto_id: Number(novaVenda.produto_id),
          quantidade: Number(novaVenda.quantidade), valor_unitario: Number(novaVenda.valor_unitario),
          comprador: novaVenda.comprador || null, nota_fiscal: novaVenda.nota_fiscal || null,
          data_venda: novaVenda.data_venda,
        }),
      });
      if (r.ok) {
        const res = await r.json();
        showMsg(`Venda registrada! Lucro: ${fmtBRL(res.lucro_bruto)} (${fmtPct(res.margem_pct)})`, true);
        setNovaVenda({ produto_id: "", quantidade: "", valor_unitario: "", comprador: "", nota_fiscal: "", data_venda: new Date().toISOString().slice(0, 10) });
        carregarTudo();
      } else { const e = await r.json(); showMsg(e.detail || "Erro.", false); }
    } catch { showMsg("Erro de conexão.", false); }
    setSalvando(false);
  }

  async function registrarDespesa() {
    if (!novaDespesa.descricao || !novaDespesa.valor) return;
    setSalvando(true);
    try {
      const r = await apiFetch(`${API}/compravenda/despesas`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imovel_id: IMOVEL_ID, descricao: novaDespesa.descricao,
          categoria: novaDespesa.categoria, valor: Number(novaDespesa.valor),
          data_lancamento: novaDespesa.data_lancamento,
        }),
      });
      if (r.ok) {
        showMsg("Despesa registrada!", true);
        setNovaDespesa({ descricao: "", categoria: "operacional", valor: "", data_lancamento: new Date().toISOString().slice(0, 10) });
        carregarTudo();
      } else { const e = await r.json(); showMsg(e.detail || "Erro.", false); }
    } catch { showMsg("Erro de conexão.", false); }
    setSalvando(false);
  }

  const totalAlertas = alertasFiscais ? alertasFiscais.total_alertas : 0;
  const abas = [
    { id: "estoque", label: "📦 Estoque" },
    { id: "compras", label: "🛒 Compras" },
    { id: "vendas",  label: "💰 Vendas" },
    { id: "fluxo",   label: "📈 Fluxo de Caixa" },
    { id: "dre",     label: "📊 DRE" },
    { id: "alertas", label: totalAlertas > 0 ? `🔔 Alertas (${totalAlertas})` : "🔔 Alertas" },
  ] as const;

  if (loading) return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "60vh", color: "#6b7280", fontSize: 16 }}>
      Carregando módulo Compra e Venda...
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: "#f5f0e8", fontFamily: "system-ui, sans-serif" }}>

      {/* Header */}
      <div style={{ background: COR, color: "white", padding: "16px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <a href="/" style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.3)", color: "white", fontSize: 13, fontWeight: 600, textDecoration: "none", borderRadius: 8, padding: "6px 14px" }}>🏠 Painel Principal</a>
          <button onClick={() => window.history.back()} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.3)", color: "white", fontSize: 13, fontWeight: 600, cursor: "pointer", borderRadius: 8, padding: "6px 14px" }}>← Voltar</button>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 28 }}>🤝</span>
          <div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>Compra e Venda de Animais</div>
            <div style={{ fontSize: 12, opacity: 0.8 }}>Atividade comercial — Imóvel #{IMOVEL_ID}</div>
          </div>
        </div>
        <div style={{ width: 180 }} />
      </div>

      <div style={{ padding: "16px", maxWidth: 1000, margin: "0 auto" }}>

        {/* ── ALERTA FISCAL PERMANENTE ── */}
        <div style={{ background: "#fffbeb", border: "1px solid #fcd34d", borderRadius: 10, padding: "14px 18px", marginBottom: 16, display: "flex", gap: 12, alignItems: "flex-start" }}>
          <span style={{ fontSize: 22, flexShrink: 0 }}>⚠️</span>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, color: "#92400e", marginBottom: 4 }}>
              Atividade Comercial — Não compõe a Produção Rural
            </div>
            <div style={{ fontSize: 13, color: "#78350f", lineHeight: 1.6 }}>
              As operações registradas aqui são de <strong>compra e revenda de animais</strong> e, por isso, são tributadas como <strong>atividade comercial</strong> (não rural).
              Contudo, conforme o <strong>RIR/2018 (Decreto nº 9.580/2018)</strong>, se o animal permanecer em poder do produtor por tempo igual ou superior ao prazo mínimo da Receita Federal, ele <strong>passa a ser enquadrado como atividade rural</strong>:
            </div>
            <div style={{ display: "flex", gap: 20, marginTop: 10 }}>
              <div style={{ background: "#fef3c7", border: "1px solid #fde68a", borderRadius: 8, padding: "8px 14px", fontSize: 13 }}>
                <div style={{ fontWeight: 700, color: "#92400e" }}>🏠 Confinamento</div>
                <div style={{ color: "#78350f", marginTop: 2 }}>≥ <strong>{PRAZO_CONFINAMENTO_DIAS} dias</strong> → vira atividade rural</div>
              </div>
              <div style={{ background: "#fef3c7", border: "1px solid #fde68a", borderRadius: 8, padding: "8px 14px", fontSize: 13 }}>
                <div style={{ fontWeight: 700, color: "#92400e" }}>🌿 Pasto / Outros</div>
                <div style={{ color: "#78350f", marginTop: 2 }}>≥ <strong>{PRAZO_PASTO_DIAS} dias</strong> → vira atividade rural</div>
              </div>
            </div>
          </div>
        </div>

        <BannerOrientacao
          modulo="compravenda"
          titulo="Como usar o módulo de Compra e Venda"
          descricao="Este módulo é para quem compra animais para revender sem criar. O fluxo é simples: cadastre o animal no Estoque, registre a Compra com o valor pago, e quando vender registre a Venda. O sistema calcula o lucro e a margem automaticamente."
          passos={[
            { icone: "📦", texto: "1. Estoque: cadastre o tipo de animal" },
            { icone: "🛒", texto: "2. Compras: registre o que comprou e quanto pagou" },
            { icone: "💰", texto: "3. Vendas: registre a venda e veja o lucro" },
            { icone: "🚨", texto: "4. Alertas: acompanhe os prazos fiscais" },
          ]}
          corFundo="#fffbf0"
          corBorda="#fcd34d"
          corTexto="#92400e"
        />
        {/* KPI Cards */}
        {dashboard && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginBottom: 20 }}>
            {[
              { label: "Receita Bruta", value: fmtBRL(dashboard.resumo.receita_bruta), icon: "💵", color: COR },
              { label: "Lucro Bruto", value: fmtBRL(dashboard.resumo.lucro_bruto), icon: "📈", color: dashboard.resumo.lucro_bruto >= 0 ? "#16a34a" : "#dc2626" },
              { label: "Margem Bruta", value: fmtPct(dashboard.resumo.margem_bruta_pct), icon: "📊", color: "#0284c7" },
              { label: "Lucro Líquido", value: fmtBRL(dashboard.resumo.lucro_liquido), icon: "💰", color: dashboard.resumo.lucro_liquido >= 0 ? "#16a34a" : "#dc2626" },
              { label: "Estoque (valor)", value: fmtBRL(dashboard.resumo.valor_estoque_atual), icon: "📦", color: "#7c3aed" },
            ].map(k => (
              <div key={k.label} style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: "14px 12px", textAlign: "center" }}>
                <div style={{ fontSize: 20 }}>{k.icon}</div>
                <div style={{ fontSize: 17, fontWeight: 700, color: k.color, marginTop: 4 }}>{k.value}</div>
                <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>{k.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Toast */}
        {msg && (
          <div style={{ background: msg.ok ? "#f0fdf4" : "#fef2f2", border: `1px solid ${msg.ok ? "#bbf7d0" : "#fecaca"}`, borderRadius: 8, padding: "10px 16px", marginBottom: 16, color: msg.ok ? "#16a34a" : "#dc2626", fontWeight: 600, fontSize: 14 }}>
            {msg.ok ? "✓ " : "✗ "}{msg.text}
          </div>
        )}

        {/* Tabs */}
        <div style={{ display: "flex", gap: 4, marginBottom: 16, background: "#fff", borderRadius: 10, padding: 6, border: "1px solid #e5e7eb", overflowX: "auto" }}>
          {abas.map(a => (
            <button key={a.id} onClick={() => setAba(a.id)}
              style={{ padding: "8px 16px", borderRadius: 7, border: "none", cursor: "pointer", fontWeight: 600, fontSize: 13, whiteSpace: "nowrap",
                background: aba === a.id ? COR : "transparent",
                color: aba === a.id ? "#fff" : "#6b7280",
              }}>
              {a.label}
            </button>
          ))}
        </div>

        {/* ── ABA ESTOQUE ── */}
        {aba === "estoque" && (
          <div>
            {/* Formulário de cadastro de produto */}
            <div style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 10, padding: 16, marginBottom: 16 }}>
              <h3 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 600, color: "#374151" }}>+ Cadastrar Produto / Animal</h3>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: "#6b7280" }}>Nome *</label>
                  <input placeholder="Ex: Novilho Nelore" value={novoProduto.nome} onChange={e => setNovoProduto(p => ({ ...p, nome: e.target.value }))}
                    style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 14, width: 200 }} />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: "#6b7280" }}>Espécie</label>
                  <select value={novoProduto.especie} onChange={e => setNovoProduto(p => ({ ...p, especie: e.target.value }))}
                    style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 14 }}>
                    <option value="bovino">🐄 Bovino</option>
                    <option value="suino">🐖 Suíno</option>
                    <option value="ovino">🐑 Ovino</option>
                    <option value="caprino">🐐 Caprino</option>
                    <option value="outro">📦 Outro</option>
                  </select>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: "#6b7280" }}>Unidade</label>
                  <select value={novoProduto.unidade} onChange={e => setNovoProduto(p => ({ ...p, unidade: e.target.value }))}
                    style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 14 }}>
                    <option value="cab">Cabeça</option>
                    <option value="kg">Kg</option>
                    <option value="arroba">Arroba</option>
                    <option value="saca">Saca</option>
                    <option value="un">Unidade</option>
                  </select>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: "#6b7280" }}>Custo Médio (R$)</label>
                  <input type="number" placeholder="0,00" value={novoProduto.custo_medio} onChange={e => setNovoProduto(p => ({ ...p, custo_medio: e.target.value }))}
                    style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 14, width: 120 }} />
                </div>
                <button onClick={cadastrarProduto} disabled={salvando || !novoProduto.nome}
                  style={{ padding: "8px 18px", background: COR, color: "#fff", border: "none", borderRadius: 6, fontWeight: 600, cursor: "pointer", fontSize: 14, opacity: salvando || !novoProduto.nome ? 0.6 : 1, alignSelf: "flex-end" }}>
                  {salvando ? "..." : "✚ Cadastrar"}
                </button>
              </div>
            </div>

            {/* Tabela de estoque */}
            <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "#f9fafb", borderBottom: "1px solid #e5e7eb" }}>
                    {["Produto", "Espécie", "Unidade", "Comprado", "Vendido", "Estoque", "Custo Médio", "Valor em Estoque"].map(h => (
                      <th key={h} style={{ padding: "10px 12px", textAlign: "left", fontWeight: 600, color: "#374151", fontSize: 12 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {produtos.length === 0 ? (
                    <tr><td colSpan={8} style={{ padding: 32, textAlign: "center", color: "#9ca3af" }}>Nenhum produto cadastrado.</td></tr>
                  ) : produtos.map((p, i) => {
                    const valorEstoque = (p.estoque_atual || 0) * (p.custo_medio_calc || 0);
                    return (
                      <tr key={p.id} style={{ borderBottom: "1px solid #f3f4f6", background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                        <td style={{ padding: "10px 12px", fontWeight: 700, color: "#111827" }}>{p.nome}</td>
                        <td style={{ padding: "10px 12px" }}><span style={{ background: COR_LIGHT, color: COR, borderRadius: 4, padding: "2px 8px", fontSize: 11, fontWeight: 600 }}>{especieLabel[p.especie || ""] || p.especie || "—"}</span></td>
                        <td style={{ padding: "10px 12px", color: "#6b7280" }}>{p.unidade}</td>
                        <td style={{ padding: "10px 12px", textAlign: "center" }}>{Number(p.total_comprado).toFixed(2)}</td>
                        <td style={{ padding: "10px 12px", textAlign: "center" }}>{Number(p.total_vendido).toFixed(2)}</td>
                        <td style={{ padding: "10px 12px", textAlign: "center" }}>
                          <span style={{ fontWeight: 700, color: Number(p.estoque_atual) > 0 ? COR : "#dc2626", fontSize: 15 }}>
                            {Number(p.estoque_atual).toFixed(2)}
                          </span>
                        </td>
                        <td style={{ padding: "10px 12px" }}>{fmtBRL(p.custo_medio_calc)}</td>
                        <td style={{ padding: "10px 12px", fontWeight: 600, color: COR }}>{fmtBRL(valorEstoque)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Margem por produto */}
            {dashboard && dashboard.margem_por_produto.length > 0 && (
              <div style={{ marginTop: 16, background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, overflow: "hidden" }}>
                <div style={{ padding: "12px 16px", borderBottom: "1px solid #e5e7eb", fontWeight: 600, fontSize: 14, color: "#374151" }}>📊 Margem por Produto</div>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: "#f9fafb", borderBottom: "1px solid #e5e7eb" }}>
                      {["Produto", "Qtd Vendida", "Receita", "Custo", "Lucro Bruto", "Margem %"].map(h => (
                        <th key={h} style={{ padding: "10px 12px", textAlign: "left", fontWeight: 600, color: "#374151", fontSize: 12 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {dashboard.margem_por_produto.map((m, i) => (
                      <tr key={i} style={{ borderBottom: "1px solid #f3f4f6", background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                        <td style={{ padding: "10px 12px", fontWeight: 600, color: "#111827" }}>{m.nome}</td>
                        <td style={{ padding: "10px 12px", textAlign: "center" }}>{Number(m.qtd_vendida).toFixed(2)} {m.unidade}</td>
                        <td style={{ padding: "10px 12px" }}>{fmtBRL(m.receita)}</td>
                        <td style={{ padding: "10px 12px" }}>{fmtBRL(m.custo)}</td>
                        <td style={{ padding: "10px 12px", fontWeight: 600, color: Number(m.lucro) >= 0 ? "#16a34a" : "#dc2626" }}>{fmtBRL(m.lucro)}</td>
                        <td style={{ padding: "10px 12px" }}>
                          <span style={{ background: Number(m.margem_pct) >= 15 ? "#f0fdf4" : Number(m.margem_pct) >= 0 ? "#fffbeb" : "#fef2f2", color: Number(m.margem_pct) >= 15 ? "#16a34a" : Number(m.margem_pct) >= 0 ? "#d97706" : "#dc2626", borderRadius: 4, padding: "2px 8px", fontWeight: 700, fontSize: 12 }}>
                            {fmtPct(m.margem_pct)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── ABA COMPRAS ── */}
        {aba === "compras" && (
          <div>
            {/* Alerta de itens próximos/acima do prazo fiscal */}
            {compras.length > 0 && (() => {
              const alertas = compras.filter(c => {
                    const { status } = calcularStatusFiscal(c.data_compra, c.regime || "pasto");
                    return status === "rural" || status === "alerta";
                  });
                  if (alertas.length === 0) return null;
                  return (
                    <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10, padding: "12px 16px", marginBottom: 14 }}>
                      <div style={{ fontWeight: 700, color: "#991b1b", fontSize: 13, marginBottom: 6 }}>🔴 {alertas.length} compra(s) atingiram ou estão próximas do prazo de reclassificação fiscal</div>
                      {alertas.map(c => {
                        const { diasDecorridos, prazoMax, status } = calcularStatusFiscal(c.data_compra, c.regime || "pasto");
                    return (
                      <div key={c.id} style={{ fontSize: 12, color: status === "rural" ? "#991b1b" : "#92400e", marginBottom: 3 }}>
                        {status === "rural" ? "🔴" : "🟡"} <strong>{c.produto_nome}</strong> — {diasDecorridos} dias em estoque
                        {status === "rural" ? " → RECLASSIFICADO como Atividade Rural" : ` → faltam ${prazoMax - diasDecorridos} dias para reclassificação`}
                      </div>
                    );
                  })}
                </div>
              );
            })()}
            <div style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 10, padding: 16, marginBottom: 16 }}>
              <h3 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 600, color: "#374151" }}>🛒 Registrar Compra</h3>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: "#6b7280" }}>Produto *</label>
                  <select value={novaCompra.produto_id} onChange={e => setNovaCompra(p => ({ ...p, produto_id: e.target.value }))}
                    style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 14, width: 200 }}>
                    <option value="">Selecione...</option>
                    {produtos.map(p => <option key={p.id} value={p.id}>{p.nome} ({p.unidade})</option>)}
                  </select>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: "#6b7280" }}>Quantidade *</label>
                  <input type="number" placeholder="0" value={novaCompra.quantidade} onChange={e => setNovaCompra(p => ({ ...p, quantidade: e.target.value }))}
                    style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 14, width: 100 }} />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: "#6b7280" }}>Valor Unit. (R$) *</label>
                  <input type="number" placeholder="0,00" value={novaCompra.valor_unitario} onChange={e => setNovaCompra(p => ({ ...p, valor_unitario: e.target.value }))}
                    style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 14, width: 120 }} />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: "#6b7280" }}>Data</label>
                  <input type="date" value={novaCompra.data_compra} onChange={e => setNovaCompra(p => ({ ...p, data_compra: e.target.value }))}
                    style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 14 }} />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: "#6b7280" }}>Fornecedor</label>
                  <input placeholder="Nome do fornecedor" value={novaCompra.fornecedor} onChange={e => setNovaCompra(p => ({ ...p, fornecedor: e.target.value }))}
                    style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 14, width: 160 }} />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: "#6b7280" }}>Nota Fiscal</label>
                  <input placeholder="NF-e / número" value={novaCompra.nota_fiscal} onChange={e => setNovaCompra(p => ({ ...p, nota_fiscal: e.target.value }))}
                    style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 14, width: 120 }} />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: "#6b7280" }}>Regime de Criação</label>
                  <select value={novaCompraRegime} onChange={e => setNovaCompraRegime(e.target.value as "confinamento" | "pasto")}
                    style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid #fcd34d", fontSize: 14, background: "#fffbeb" }}>
                    <option value="pasto">🌿 Pasto / Outros (138 dias)</option>
                    <option value="confinamento">🏠 Confinamento (52 dias)</option>
                  </select>
                </div>
                <button onClick={registrarCompra} disabled={salvando || !novaCompra.produto_id || !novaCompra.quantidade || !novaCompra.valor_unitario}
                  style={{ padding: "8px 18px", background: COR, color: "#fff", border: "none", borderRadius: 6, fontWeight: 600, cursor: "pointer", fontSize: 14, opacity: salvando ? 0.6 : 1, alignSelf: "flex-end" }}>
                  {salvando ? "..." : "✚ Registrar"}
                </button>
              </div>
              {novaCompra.quantidade && novaCompra.valor_unitario && (
                <div style={{ marginTop: 8, fontSize: 13, color: COR, fontWeight: 600 }}>
                  Total estimado: {fmtBRL(Number(novaCompra.quantidade) * Number(novaCompra.valor_unitario))}
                </div>
              )}
            </div>

            <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "#f9fafb", borderBottom: "1px solid #e5e7eb" }}>
                    {["Data", "Produto", "Espécie", "Qtd", "Valor Unit.", "Total", "Fornecedor", "NF", "Dias em Estoque", "Status Fiscal"].map(h => (
                      <th key={h} style={{ padding: "10px 12px", textAlign: "left", fontWeight: 600, color: "#374151", fontSize: 12 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {compras.length === 0 ? (
                    <tr><td colSpan={8} style={{ padding: 32, textAlign: "center", color: "#9ca3af" }}>Nenhuma compra registrada.</td></tr>
                  ) : compras.map((c, i) => {
                    const fiscal = calcularStatusFiscal(c.data_compra, c.regime || "pasto");
                    const rowBg = fiscal.status === "rural" ? "#fef2f2" : fiscal.status === "alerta" ? "#fffbeb" : i % 2 === 0 ? "#fff" : "#fafafa";
                    return (
                    <tr key={c.id} style={{ borderBottom: "1px solid #f3f4f6", background: rowBg }}>
                      <td style={{ padding: "10px 12px", color: "#6b7280" }}>{fmtDate(c.data_compra)}</td>
                      <td style={{ padding: "10px 12px", fontWeight: 600, color: "#111827" }}>{c.produto_nome}</td>
                      <td style={{ padding: "10px 12px" }}><span style={{ background: COR_LIGHT, color: COR, borderRadius: 4, padding: "2px 8px", fontSize: 11, fontWeight: 600 }}>{especieLabel[c.especie || ""] || c.especie || "—"}</span></td>
                      <td style={{ padding: "10px 12px", textAlign: "center" }}>{Number(c.quantidade).toFixed(2)} {c.unidade}</td>
                      <td style={{ padding: "10px 12px" }}>{fmtBRL(c.valor_unitario)}</td>
                      <td style={{ padding: "10px 12px", fontWeight: 600, color: COR }}>{fmtBRL(c.valor_total)}</td>
                      <td style={{ padding: "10px 12px", color: "#6b7280" }}>{c.fornecedor || "—"}</td>
                      <td style={{ padding: "10px 12px", color: "#6b7280", fontSize: 12 }}>{c.nota_fiscal || "—"}</td>
                      <td style={{ padding: "10px 12px", textAlign: "center", fontWeight: 600, color: fiscal.status === "rural" ? "#991b1b" : fiscal.status === "alerta" ? "#92400e" : "#6b7280" }}>
                        {fiscal.diasDecorridos}d / {fiscal.prazoMax}d
                      </td>
                      <td style={{ padding: "10px 12px" }}>
                        {fiscal.status === "rural" && (
                          <span style={{ background: "#fef2f2", color: "#991b1b", border: "1px solid #fecaca", borderRadius: 4, padding: "3px 8px", fontSize: 11, fontWeight: 700 }}>🔴 Atividade Rural</span>
                        )}
                        {fiscal.status === "alerta" && (
                          <span style={{ background: "#fffbeb", color: "#92400e", border: "1px solid #fcd34d", borderRadius: 4, padding: "3px 8px", fontSize: 11, fontWeight: 700 }}>🟡 Atenção</span>
                        )}
                        {fiscal.status === "comercial" && (
                          <span style={{ background: "#f0fdf4", color: "#16a34a", border: "1px solid #bbf7d0", borderRadius: 4, padding: "3px 8px", fontSize: 11, fontWeight: 700 }}>🟢 Comercial</span>
                        )}
                      </td>
                    </tr>
                  );})}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── ABA VENDAS ── */}
        {aba === "vendas" && (
          <div>
            <div style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 10, padding: 16, marginBottom: 16 }}>
              <h3 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 600, color: "#374151" }}>💰 Registrar Venda</h3>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: "#6b7280" }}>Produto *</label>
                  <select value={novaVenda.produto_id} onChange={e => setNovaVenda(p => ({ ...p, produto_id: e.target.value }))}
                    style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 14, width: 200 }}>
                    <option value="">Selecione...</option>
                    {produtos.filter(p => Number(p.estoque_atual) > 0).map(p => (
                      <option key={p.id} value={p.id}>{p.nome} — estoque: {Number(p.estoque_atual).toFixed(2)} {p.unidade}</option>
                    ))}
                  </select>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: "#6b7280" }}>Quantidade *</label>
                  <input type="number" placeholder="0" value={novaVenda.quantidade} onChange={e => setNovaVenda(p => ({ ...p, quantidade: e.target.value }))}
                    style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 14, width: 100 }} />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: "#6b7280" }}>Valor Unit. (R$) *</label>
                  <input type="number" placeholder="0,00" value={novaVenda.valor_unitario} onChange={e => setNovaVenda(p => ({ ...p, valor_unitario: e.target.value }))}
                    style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 14, width: 120 }} />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: "#6b7280" }}>Data</label>
                  <input type="date" value={novaVenda.data_venda} onChange={e => setNovaVenda(p => ({ ...p, data_venda: e.target.value }))}
                    style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 14 }} />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: "#6b7280" }}>Comprador</label>
                  <input placeholder="Nome do comprador" value={novaVenda.comprador} onChange={e => setNovaVenda(p => ({ ...p, comprador: e.target.value }))}
                    style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 14, width: 160 }} />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: "#6b7280" }}>Nota Fiscal</label>
                  <input placeholder="NF-e / número" value={novaVenda.nota_fiscal} onChange={e => setNovaVenda(p => ({ ...p, nota_fiscal: e.target.value }))}
                    style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 14, width: 120 }} />
                </div>
                <button onClick={registrarVenda} disabled={salvando || !novaVenda.produto_id || !novaVenda.quantidade || !novaVenda.valor_unitario}
                  style={{ padding: "8px 18px", background: "#16a34a", color: "#fff", border: "none", borderRadius: 6, fontWeight: 600, cursor: "pointer", fontSize: 14, opacity: salvando ? 0.6 : 1, alignSelf: "flex-end" }}>
                  {salvando ? "..." : "✚ Registrar"}
                </button>
              </div>
              {novaVenda.quantidade && novaVenda.valor_unitario && (
                <div style={{ marginTop: 8, fontSize: 13, color: "#16a34a", fontWeight: 600 }}>
                  Total estimado: {fmtBRL(Number(novaVenda.quantidade) * Number(novaVenda.valor_unitario))}
                </div>
              )}
            </div>

            <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "#f9fafb", borderBottom: "1px solid #e5e7eb" }}>
                    {["Data", "Produto", "Qtd", "Valor Unit.", "Total", "Custo", "Lucro Bruto", "Margem", "Comprador"].map(h => (
                      <th key={h} style={{ padding: "10px 12px", textAlign: "left", fontWeight: 600, color: "#374151", fontSize: 12 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {vendas.length === 0 ? (
                    <tr><td colSpan={9} style={{ padding: 32, textAlign: "center", color: "#9ca3af" }}>Nenhuma venda registrada.</td></tr>
                  ) : vendas.map((v, i) => (
                    <tr key={v.id} style={{ borderBottom: "1px solid #f3f4f6", background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                      <td style={{ padding: "10px 12px", color: "#6b7280" }}>{fmtDate(v.data_venda)}</td>
                      <td style={{ padding: "10px 12px", fontWeight: 600, color: "#111827" }}>{v.produto_nome}</td>
                      <td style={{ padding: "10px 12px", textAlign: "center" }}>{Number(v.quantidade).toFixed(2)} {v.unidade}</td>
                      <td style={{ padding: "10px 12px" }}>{fmtBRL(v.valor_unitario)}</td>
                      <td style={{ padding: "10px 12px", fontWeight: 600, color: COR }}>{fmtBRL(v.valor_total)}</td>
                      <td style={{ padding: "10px 12px", color: "#6b7280" }}>{fmtBRL(v.custo_total)}</td>
                      <td style={{ padding: "10px 12px", fontWeight: 600, color: Number(v.lucro_bruto) >= 0 ? "#16a34a" : "#dc2626" }}>{fmtBRL(v.lucro_bruto)}</td>
                      <td style={{ padding: "10px 12px" }}>
                        <span style={{ background: Number(v.margem_pct) >= 15 ? "#f0fdf4" : Number(v.margem_pct) >= 0 ? "#fffbeb" : "#fef2f2", color: Number(v.margem_pct) >= 15 ? "#16a34a" : Number(v.margem_pct) >= 0 ? "#d97706" : "#dc2626", borderRadius: 4, padding: "2px 8px", fontWeight: 700, fontSize: 12 }}>
                          {fmtPct(v.margem_pct)}
                        </span>
                      </td>
                      <td style={{ padding: "10px 12px", color: "#6b7280" }}>{v.comprador || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── ABA FLUXO DE CAIXA ── */}
        {aba === "fluxo" && (
          <div>
            {/* Formulário de despesa */}
            <div style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 10, padding: 16, marginBottom: 16 }}>
              <h3 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 600, color: "#374151" }}>+ Registrar Despesa Operacional</h3>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: "#6b7280" }}>Descrição *</label>
                  <input placeholder="Ex: Frete, comissão, veterinário..." value={novaDespesa.descricao} onChange={e => setNovaDespesa(p => ({ ...p, descricao: e.target.value }))}
                    style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 14, width: 220 }} />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: "#6b7280" }}>Categoria</label>
                  <select value={novaDespesa.categoria} onChange={e => setNovaDespesa(p => ({ ...p, categoria: e.target.value }))}
                    style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 14 }}>
                    <option value="operacional">Operacional</option>
                    <option value="logistica">Logística</option>
                    <option value="administrativa">Administrativa</option>
                    <option value="financeira">Financeira</option>
                  </select>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: "#6b7280" }}>Valor (R$) *</label>
                  <input type="number" placeholder="0,00" value={novaDespesa.valor} onChange={e => setNovaDespesa(p => ({ ...p, valor: e.target.value }))}
                    style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 14, width: 120 }} />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: "#6b7280" }}>Data</label>
                  <input type="date" value={novaDespesa.data_lancamento} onChange={e => setNovaDespesa(p => ({ ...p, data_lancamento: e.target.value }))}
                    style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 14 }} />
                </div>
                <button onClick={registrarDespesa} disabled={salvando || !novaDespesa.descricao || !novaDespesa.valor}
                  style={{ padding: "8px 18px", background: "#dc2626", color: "#fff", border: "none", borderRadius: 6, fontWeight: 600, cursor: "pointer", fontSize: 14, opacity: salvando ? 0.6 : 1, alignSelf: "flex-end" }}>
                  {salvando ? "..." : "✚ Registrar"}
                </button>
              </div>
            </div>

            {/* Tabela fluxo de caixa */}
            {fluxo.length === 0 ? (
              <div style={{ padding: 32, textAlign: "center", color: "#9ca3af", background: "#fff", borderRadius: 10, border: "1px solid #e5e7eb" }}>
                Nenhum movimento registrado ainda.
              </div>
            ) : (
              <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, overflow: "hidden" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: "#f9fafb", borderBottom: "1px solid #e5e7eb" }}>
                      {["Mês", "Entradas (Vendas)", "Saídas (Compras)", "Despesas Op.", "Total Saídas", "Saldo do Mês", "Saldo Acumulado"].map(h => (
                        <th key={h} style={{ padding: "10px 12px", textAlign: "left", fontWeight: 600, color: "#374151", fontSize: 12 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {fluxo.map((f, i) => (
                      <tr key={f.mes} style={{ borderBottom: "1px solid #f3f4f6", background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                        <td style={{ padding: "10px 12px", fontWeight: 600, color: "#374151" }}>{f.mes}</td>
                        <td style={{ padding: "10px 12px", color: "#16a34a", fontWeight: 600 }}>{fmtBRL(f.entradas)}</td>
                        <td style={{ padding: "10px 12px", color: "#dc2626" }}>{fmtBRL(f.saidas_compras)}</td>
                        <td style={{ padding: "10px 12px", color: "#d97706" }}>{fmtBRL(f.saidas_despesas)}</td>
                        <td style={{ padding: "10px 12px", color: "#dc2626", fontWeight: 600 }}>{fmtBRL(f.saidas_total)}</td>
                        <td style={{ padding: "10px 12px", fontWeight: 700, color: f.saldo_mes >= 0 ? "#16a34a" : "#dc2626" }}>{fmtBRL(f.saldo_mes)}</td>
                        <td style={{ padding: "10px 12px", fontWeight: 700, color: f.saldo_acumulado >= 0 ? COR : "#dc2626" }}>{fmtBRL(f.saldo_acumulado)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Histórico de despesas */}
            {despesas.length > 0 && (
              <div style={{ marginTop: 16, background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, overflow: "hidden" }}>
                <div style={{ padding: "12px 16px", borderBottom: "1px solid #e5e7eb", fontWeight: 600, fontSize: 14, color: "#374151" }}>📋 Histórico de Despesas</div>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: "#f9fafb", borderBottom: "1px solid #e5e7eb" }}>
                      {["Data", "Descrição", "Categoria", "Valor"].map(h => (
                        <th key={h} style={{ padding: "10px 12px", textAlign: "left", fontWeight: 600, color: "#374151", fontSize: 12 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {despesas.map((d, i) => (
                      <tr key={d.id} style={{ borderBottom: "1px solid #f3f4f6", background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                        <td style={{ padding: "10px 12px", color: "#6b7280" }}>{fmtDate(d.data_lancamento)}</td>
                        <td style={{ padding: "10px 12px", color: "#374151" }}>{d.descricao}</td>
                        <td style={{ padding: "10px 12px" }}><span style={{ background: "#fef3c7", color: "#d97706", borderRadius: 4, padding: "2px 8px", fontSize: 11, fontWeight: 600 }}>{categoriaLabel[d.categoria] || d.categoria}</span></td>
                        <td style={{ padding: "10px 12px", fontWeight: 600, color: "#dc2626" }}>{fmtBRL(d.valor)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── ABA ALERTAS FISCAIS ── */}
        {aba === "alertas" && (
          <div>
            {!alertasFiscais || alertasFiscais.total_alertas === 0 ? (
              <div style={{ padding: 48, textAlign: "center", background: "#f0fdf4", borderRadius: 12, border: "1px solid #bbf7d0" }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
                <div style={{ fontWeight: 700, color: "#16a34a", fontSize: 16 }}>Nenhum alerta fiscal no momento</div>
                <div style={{ color: "#4b7c59", fontSize: 13, marginTop: 6 }}>Todos os animais estão dentro do prazo comercial permitido pelo RIR/2018.</div>
              </div>
            ) : (
              <div>
                {/* Resumo de contadores */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 20 }}>
                  {[
                    { label: "🔴 Críticos", desc: "Prazo atingido — já é Atividade Rural", count: alertasFiscais.criticos, bg: "#fef2f2", border: "#fecaca", color: "#dc2626" },
                    { label: "🟠 Urgentes", desc: `Faltam ≤ ${alertasFiscais.dias_aviso} dias para reclassificação`, count: alertasFiscais.urgentes, bg: "#fff7ed", border: "#fed7aa", color: "#ea580c" },
                    { label: "🟡 Atenção", desc: "Entre 75% e 90% do prazo consumido", count: alertasFiscais.atencao, bg: "#fefce8", border: "#fde68a", color: "#ca8a04" },
                  ].map(c => (
                    <div key={c.label} style={{ background: c.bg, border: `1px solid ${c.border}`, borderRadius: 10, padding: "16px 14px", textAlign: "center" }}>
                      <div style={{ fontSize: 28, fontWeight: 800, color: c.color }}>{c.count}</div>
                      <div style={{ fontWeight: 700, color: c.color, fontSize: 13, marginTop: 2 }}>{c.label}</div>
                      <div style={{ fontSize: 11, color: "#6b7280", marginTop: 4 }}>{c.desc}</div>
                    </div>
                  ))}
                </div>

                {/* Tabela de alertas */}
                <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, overflow: "hidden" }}>
                  <div style={{ padding: "12px 16px", borderBottom: "1px solid #e5e7eb", fontWeight: 700, fontSize: 14, color: "#374151", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span>Animais com Alerta Fiscal</span>
                    <span style={{ fontSize: 12, color: "#6b7280", fontWeight: 400 }}>Atualizado automaticamente a cada carregamento da página</span>
                  </div>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: "#f9fafb", borderBottom: "1px solid #e5e7eb" }}>
                        {["Nível", "Animal / Produto", "Espécie", "Regime", "Data Compra", "Dias em Estoque", "Prazo Máx.", "Dias Restantes", "% do Prazo", "Situação"].map(h => (
                          <th key={h} style={{ padding: "10px 12px", textAlign: "left", fontWeight: 600, color: "#374151", fontSize: 11, whiteSpace: "nowrap" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {alertasFiscais.alertas.map((a, i) => {
                        const nivelCor = a.nivel === "critico" ? { bg: "#fef2f2", text: "#dc2626", badge: "#fee2e2", badgeText: "#991b1b" }
                          : a.nivel === "urgente" ? { bg: "#fff7ed", text: "#ea580c", badge: "#ffedd5", badgeText: "#9a3412" }
                          : { bg: "#fefce8", text: "#ca8a04", badge: "#fef9c3", badgeText: "#854d0e" };
                        const nivelLabel = a.nivel === "critico" ? "🔴 Crítico" : a.nivel === "urgente" ? "🟠 Urgente" : "🟡 Atenção";
                        const barWidth = Math.min(a.pct_prazo, 100);
                        const barColor = a.nivel === "critico" ? "#dc2626" : a.nivel === "urgente" ? "#ea580c" : "#ca8a04";
                        return (
                          <tr key={a.id} style={{ borderBottom: "1px solid #f3f4f6", background: i % 2 === 0 ? nivelCor.bg : nivelCor.bg }}>
                            <td style={{ padding: "10px 12px" }}>
                              <span style={{ background: nivelCor.badge, color: nivelCor.badgeText, borderRadius: 5, padding: "3px 8px", fontSize: 11, fontWeight: 700, whiteSpace: "nowrap" }}>{nivelLabel}</span>
                            </td>
                            <td style={{ padding: "10px 12px", fontWeight: 600, color: "#111827" }}>{a.produto_nome}</td>
                            <td style={{ padding: "10px 12px", color: "#6b7280" }}>{especieLabel[a.especie || ""] || a.especie || "—"}</td>
                            <td style={{ padding: "10px 12px" }}>
                              <span style={{ background: a.regime === "confinamento" ? "#ede9fe" : "#dcfce7", color: a.regime === "confinamento" ? "#6d28d9" : "#15803d", borderRadius: 4, padding: "2px 7px", fontSize: 11, fontWeight: 600 }}>
                                {a.regime === "confinamento" ? "🏠 Confinamento" : "🌿 Pasto"}
                              </span>
                            </td>
                            <td style={{ padding: "10px 12px", color: "#6b7280" }}>{fmtDate(a.data_compra)}</td>
                            <td style={{ padding: "10px 12px", fontWeight: 700, color: nivelCor.text }}>{a.dias_em_estoque} dias</td>
                            <td style={{ padding: "10px 12px", color: "#6b7280" }}>{a.prazo_max} dias</td>
                            <td style={{ padding: "10px 12px", fontWeight: 700, color: a.dias_restantes <= 0 ? "#dc2626" : nivelCor.text }}>
                              {a.dias_restantes <= 0 ? `+${Math.abs(a.dias_restantes)} dias excedido` : `${a.dias_restantes} dias`}
                            </td>
                            <td style={{ padding: "10px 12px", minWidth: 100 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <div style={{ flex: 1, background: "#e5e7eb", borderRadius: 4, height: 6, overflow: "hidden" }}>
                                  <div style={{ width: `${barWidth}%`, background: barColor, height: "100%", borderRadius: 4, transition: "width 0.3s" }} />
                                </div>
                                <span style={{ fontSize: 11, fontWeight: 600, color: nivelCor.text, whiteSpace: "nowrap" }}>{a.pct_prazo}%</span>
                              </div>
                            </td>
                            <td style={{ padding: "10px 12px", fontSize: 12, color: nivelCor.text, maxWidth: 240 }}>{a.mensagem}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Nota de rodapé */}
                <div style={{ marginTop: 12, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "#64748b" }}>
                  ⚖️ <strong>Base legal:</strong> Decreto nº 9.580/2018 (RIR/2018) — animais adquiridos de terceiros que permanecerem em poder do produtor por prazo igual ou superior ao limite definido passam a ser tratados como <strong>atividade rural</strong> e devem ser registrados no Livro Caixa / LCDPR.
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── ABA DRE ── */}
        {aba === "dre" && (
          <div>
            {!dre ? (
              <div style={{ padding: 32, textAlign: "center", color: "#9ca3af", background: "#fff", borderRadius: 10, border: "1px solid #e5e7eb" }}>
                Nenhum dado disponível para o DRE. Registre compras e vendas primeiro.
              </div>
            ) : (
              <>
                <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, overflow: "hidden", marginBottom: 16 }}>
                  <div style={{ padding: "14px 20px", background: COR, color: "#fff", fontWeight: 700, fontSize: 15 }}>
                    📊 DRE — Demonstração do Resultado — Ano {dre.ano}
                  </div>
                  <div style={{ padding: 20 }}>
                    {[
                      { label: "Receita Bruta de Vendas", value: dre.receita_bruta, indent: 0, bold: true, color: COR },
                      { label: "(-) Custo das Mercadorias Vendidas (CMV)", value: -dre.cmv, indent: 1, bold: false, color: "#dc2626" },
                      { label: "= Lucro Bruto", value: dre.lucro_bruto, indent: 0, bold: true, color: dre.lucro_bruto >= 0 ? "#16a34a" : "#dc2626", separator: true },
                      { label: `    Margem Bruta: ${fmtPct(dre.margem_bruta_pct)}`, value: null, indent: 1, bold: false, color: "#6b7280" },
                    ].map((row, i) => (
                      <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderTop: row.separator ? "2px solid #e5e7eb" : "1px solid #f3f4f6", paddingLeft: row.indent * 24 }}>
                        <span style={{ fontSize: 14, color: row.color, fontWeight: row.bold ? 700 : 400 }}>{row.label}</span>
                        {row.value != null && <span style={{ fontSize: 15, fontWeight: 700, color: row.color }}>{fmtBRL(Math.abs(row.value))}{row.value < 0 ? " (saída)" : ""}</span>}
                      </div>
                    ))}

                    {/* Despesas por categoria */}
                    <div style={{ padding: "10px 0", borderTop: "1px solid #f3f4f6" }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: "#374151", marginBottom: 8 }}>(-) Despesas Operacionais</div>
                      {Object.entries(dre.despesas).map(([cat, val]) => (
                        <div key={cat} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0 6px 24px" }}>
                          <span style={{ fontSize: 13, color: "#6b7280" }}>{categoriaLabel[cat] || cat}</span>
                          <span style={{ fontSize: 13, color: "#dc2626" }}>{fmtBRL(val)}</span>
                        </div>
                      ))}
                      <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0 6px 24px", borderTop: "1px dashed #e5e7eb", marginTop: 4 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>Total Despesas</span>
                        <span style={{ fontSize: 13, fontWeight: 600, color: "#dc2626" }}>{fmtBRL(dre.total_despesas)}</span>
                      </div>
                    </div>

                    {/* Lucro operacional */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 0", borderTop: "2px solid #e5e7eb", marginTop: 4 }}>
                      <span style={{ fontSize: 16, fontWeight: 700, color: "#111827" }}>= Lucro Operacional (EBIT)</span>
                      <span style={{ fontSize: 18, fontWeight: 800, color: dre.lucro_operacional >= 0 ? "#16a34a" : "#dc2626" }}>{fmtBRL(dre.lucro_operacional)}</span>
                    </div>
                    <div style={{ padding: "6px 0", color: "#6b7280", fontSize: 13 }}>
                      Margem Operacional: <strong style={{ color: dre.margem_operacional_pct >= 0 ? COR : "#dc2626" }}>{fmtPct(dre.margem_operacional_pct)}</strong>
                    </div>
                  </div>
                </div>

                {/* KPIs do DRE */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
                  {[
                    { label: "Receita Bruta", value: fmtBRL(dre.receita_bruta), color: COR },
                    { label: "CMV", value: fmtBRL(dre.cmv), color: "#dc2626" },
                    { label: "Margem Bruta", value: fmtPct(dre.margem_bruta_pct), color: "#0284c7" },
                    { label: "Margem Operacional", value: fmtPct(dre.margem_operacional_pct), color: dre.margem_operacional_pct >= 0 ? "#16a34a" : "#dc2626" },
                  ].map(k => (
                    <div key={k.label} style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: "16px 14px", textAlign: "center" }}>
                      <div style={{ fontSize: 22, fontWeight: 700, color: k.color }}>{k.value}</div>
                      <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>{k.label}</div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
