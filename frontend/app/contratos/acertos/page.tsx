"use client";
import AuthGuard from "@/lib/AuthGuard";
import { apiFetch } from "@/lib/api";
import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";

const API = process.env.NEXT_PUBLIC_API_URL || "https://ruralcaixa-mvp-production.up.railway.app";

type Acerto = {
  id: number; imovel_id: number; safra: string; produto: string;
  qtd_sacas: number; valor_por_saca: number; valor_bruto: number;
  perc_desconto_prod: number; valor_desconto_prod: number;
  desconto_frete: number; outros_descontos: number; valor_liquido: number;
  funrural_retido: number; senar_retido: number;
  base_tributavel_irpf: number; status: string;
  numero_nf?: string; data_nf?: string;
  comprovante_funrural?: string; data_acerto?: string;
  criado_em: string;
};

function fmt(v: number) {
  return new Intl.NumberFormat("pt-BR", { style:"currency", currency:"BRL" }).format(v||0);
}
function fmtNum(v: number) {
  return new Intl.NumberFormat("pt-BR", { minimumFractionDigits:0 }).format(v||0);
}

const STATUS_COLORS: Record<string, string> = {
  registrado: "#f59e0b", conferido: "#3b82f6",
  lancado_livro_caixa: "#8b5cf6", declarado_dirpf: "#10b981"
};
const STATUS_LABELS: Record<string, string> = {
  registrado: "Registrado", conferido: "Conferido",
  lancado_livro_caixa: "No Livro Caixa", declarado_dirpf: "Declarado DIRPF"
};

export default function AcertosListaPage() {
  const [acertos, setAcertos] = useState<Acerto[]>([]);
  const [loading, setLoading] = useState(false);
  const [filtroSafra, setFiltroSafra] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("");
  const [filtroProduto, setFiltroProduto] = useState("");

  const safrasDisponiveis = [...new Set(acertos.map(a => a.safra))].sort().reverse();
  const produtosDisponiveis = [...new Set(acertos.map(a => a.produto))].sort();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ imovel_id: "1" });
      if (filtroSafra) params.append("safra", filtroSafra);
      if (filtroStatus) params.append("status", filtroStatus);
      const r = await apiFetch(`${API}/acertos-contrato?${params}`);
      const d = await r.json();
      setAcertos(Array.isArray(d) ? d : []);
    } catch { setAcertos([]); }
    setLoading(false);
  }, [filtroSafra, filtroStatus]);

  useEffect(() => { load(); }, [load]);

  const acertosFiltrados = acertos.filter(a =>
    !filtroProduto || a.produto === filtroProduto
  );

  // KPIs
  const totalBruto  = acertosFiltrados.reduce((s, a) => s + (a.valor_bruto||0), 0);
  const totalLiquid = acertosFiltrados.reduce((s, a) => s + (a.valor_liquido||0), 0);
  const totalBase   = acertosFiltrados.reduce((s, a) => s + (a.base_tributavel_irpf||0), 0);
  const totalFunrur = acertosFiltrados.reduce((s, a) => s + (a.funrural_retido||0), 0);

  const s: Record<string, React.CSSProperties> = {
    page: { minHeight:"100vh", background:"#f8fafc", fontFamily:"'Inter',sans-serif", padding:"24px" },
    header: { display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:20 },
    title: { fontSize:22, fontWeight:700, color:"#1e293b", margin:0 },
    subtitle: { fontSize:13, color:"#64748b", marginTop:2 },
    kpiGrid: { display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))", gap:12, marginBottom:20 },
    kpi: { background:"#fff", borderRadius:10, padding:"14px 18px", boxShadow:"0 1px 4px rgba(0,0,0,.06)" },
    kpiVal: { fontSize:18, fontWeight:700, color:"#1e293b", marginBottom:2 },
    kpiLabel: { fontSize:11, color:"#94a3b8", textTransform:"uppercase" as const, letterSpacing:.5 },
    filters: { display:"flex", gap:10, marginBottom:16, flexWrap:"wrap" as const },
    input: { padding:"8px 12px", border:"1.5px solid #e2e8f0", borderRadius:8, fontSize:13, outline:"none" },
    card: { background:"#fff", borderRadius:12, boxShadow:"0 1px 4px rgba(0,0,0,.06)", overflow:"hidden" },
    table: { width:"100%", borderCollapse:"collapse" as const, fontSize:13 },
    th: { textAlign:"left" as const, padding:"10px 12px", background:"#f8fafc", color:"#64748b", fontSize:11, fontWeight:600, textTransform:"uppercase" as const, letterSpacing:.4 },
    td: { padding:"12px 12px", borderBottom:"1px solid #f1f5f9", color:"#334155" },
    emptyState: { textAlign:"center" as const, padding:"48px 20px", color:"#94a3b8" },
  };
  const badge = (cor: string) => ({ display:"inline-block", padding:"2px 8px", borderRadius:20, fontSize:11, fontWeight:600, background:cor+"22", color:cor });
  const btn = (color: string, outline?: boolean): React.CSSProperties => ({ padding:"7px 14px", borderRadius:7, border: outline ? `1.5px solid ${color}` : "none", background: outline ? "transparent" : color, color: outline ? color : "#fff", cursor:"pointer", fontSize:12, fontWeight:600, textDecoration:"none", display:"inline-block" });

  return (

    <AuthGuard>
    <div style={s.page}>
      <div style={s.header}>
        <div>
          <h1 style={s.title}>🌾 Acertos de Contrato</h1>
          <p style={s.subtitle}>Histórico de acertos de arrendamento rural por safra e produto</p>
        </div>
        <Link href="/contratos/acerto" style={btn("#1e40af")}>+ Novo Acerto</Link>
      </div>

      {/* KPIs */}
      <div style={s.kpiGrid}>
        {[
          ["Receita Bruta", fmt(totalBruto), "#1e40af"],
          ["Valor Líquido", fmt(totalLiquid), "#10b981"],
          ["Base IRPF (20%)", fmt(totalBase), "#8b5cf6"],
          ["FUNRURAL Retido", fmt(totalFunrur), "#f59e0b"],
          ["Acertos", acertosFiltrados.length.toString(), "#0ea5e9"],
        ].map(([label, val, cor]) => (
          <div key={label} style={s.kpi}>
            <div style={{ ...s.kpiVal, color: cor }}>{val}</div>
            <div style={s.kpiLabel}>{label}</div>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div style={s.filters}>
        <select style={s.input} value={filtroSafra} onChange={e => setFiltroSafra(e.target.value)}>
          <option value="">Todas as safras</option>
          {safrasDisponiveis.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select style={s.input} value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)}>
          <option value="">Todos os status</option>
          <option value="registrado">Registrado</option>
          <option value="conferido">Conferido</option>
          <option value="lancado_livro_caixa">No Livro Caixa</option>
          <option value="declarado_dirpf">Declarado DIRPF</option>
        </select>
        <select style={s.input} value={filtroProduto} onChange={e => setFiltroProduto(e.target.value)}>
          <option value="">Todos os produtos</option>
          {produtosDisponiveis.map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase()+p.slice(1)}</option>)}
        </select>
        <button style={btn("#64748b", true)} onClick={load}>🔄 Atualizar</button>
      </div>

      {/* Tabela */}
      <div style={s.card}>
        {loading ? (
          <div style={s.emptyState}>Carregando acertos...</div>
        ) : acertosFiltrados.length === 0 ? (
          <div style={s.emptyState}>
            <div style={{ fontSize:40, marginBottom:12 }}>🌾</div>
            <div style={{ fontWeight:600, marginBottom:4 }}>Nenhum acerto encontrado</div>
            <div style={{ fontSize:12, marginBottom:16 }}>Registre o primeiro acerto de contrato da safra.</div>
            <Link href="/contratos/acerto" style={btn("#1e40af")}>+ Registrar Acerto</Link>
          </div>
        ) : (
          <table style={s.table}>
            <thead>
              <tr>
                {["Safra","Produto","Sacas","Valor/Sc","Bruto","Desc. PROD","Líquido","FUNRURAL","Base IRPF","NF","Status","Ações"].map(h => (
                  <th key={h} style={s.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {acertosFiltrados.map(a => (
                <tr key={a.id}>
                  <td style={{ ...s.td, fontWeight:600 }}>{a.safra}</td>
                  <td style={s.td}>{a.produto?.charAt(0).toUpperCase()+(a.produto?.slice(1)||"")}</td>
                  <td style={s.td}>{fmtNum(a.qtd_sacas)} sc</td>
                  <td style={s.td}>{fmt(a.valor_por_saca)}</td>
                  <td style={{ ...s.td, fontWeight:600 }}>{fmt(a.valor_bruto)}</td>
                  <td style={{ ...s.td, color:"#ef4444" }}>-{fmt(a.valor_desconto_prod)}</td>
                  <td style={{ ...s.td, fontWeight:700, color:"#10b981" }}>{fmt(a.valor_liquido)}</td>
                  <td style={s.td}>{fmt(a.funrural_retido)}</td>
                  <td style={{ ...s.td, color:"#8b5cf6" }}>{fmt(a.base_tributavel_irpf)}</td>
                  <td style={s.td}>
                    {a.numero_nf ? (
                      <span style={{ color:"#10b981", fontWeight:600 }}>✓ {a.numero_nf}</span>
                    ) : (
                      <span style={{ color:"#f59e0b" }}>Pendente</span>
                    )}
                  </td>
                  <td style={s.td}>
                    <span style={badge(STATUS_COLORS[a.status]||"#6b7280")}>
                      {STATUS_LABELS[a.status]||a.status}
                    </span>
                  </td>
                  <td style={s.td}>
                    <Link href={`/contratos/acerto?id=${a.id}`} style={btn("#1e40af", true)}>
                      Ver
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Resumo fiscal */}
      {acertosFiltrados.length > 0 && (
        <div style={{ background:"#fff", borderRadius:12, padding:"16px 20px", marginTop:16, boxShadow:"0 1px 4px rgba(0,0,0,.06)" }}>
          <div style={{ fontSize:13, fontWeight:700, color:"#334155", marginBottom:12 }}>📊 Resumo Fiscal {filtroSafra || "— Todas as Safras"}</div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))", gap:12 }}>
            <div style={{ background:"#f8fafc", borderRadius:8, padding:"12px 16px" }}>
              <div style={{ fontSize:11, color:"#94a3b8", textTransform:"uppercase" as const, marginBottom:4 }}>Receita Bruta Total</div>
              <div style={{ fontSize:16, fontWeight:700 }}>{fmt(totalBruto)}</div>
              <div style={{ fontSize:11, color:"#64748b", marginTop:2 }}>Lançar no Livro Caixa como receita</div>
            </div>
            <div style={{ background:"#f8fafc", borderRadius:8, padding:"12px 16px" }}>
              <div style={{ fontSize:11, color:"#94a3b8", textTransform:"uppercase" as const, marginBottom:4 }}>Base Tributável IRPF</div>
              <div style={{ fontSize:16, fontWeight:700, color:"#8b5cf6" }}>{fmt(totalBase)}</div>
              <div style={{ fontSize:11, color:"#64748b", marginTop:2 }}>20% da receita bruta (art. 59 RIR/2018)</div>
            </div>
            <div style={{ background:"#f8fafc", borderRadius:8, padding:"12px 16px" }}>
              <div style={{ fontSize:11, color:"#94a3b8", textTransform:"uppercase" as const, marginBottom:4 }}>FUNRURAL + SENAR Retido</div>
              <div style={{ fontSize:16, fontWeight:700, color:"#f59e0b" }}>{fmt(totalFunrur + acertosFiltrados.reduce((s,a) => s+(a.senar_retido||0),0))}</div>
              <div style={{ fontSize:11, color:"#64748b", marginTop:2 }}>Dedutível no Livro Caixa</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
