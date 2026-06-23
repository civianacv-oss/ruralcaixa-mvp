"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

const API = process.env.NEXT_PUBLIC_API_URL || "https://ruralcaixa-mvp-production.up.railway.app";
const IMOVEL_ID = 1;

type Lancamento = {
  id: number; ano_base: number; data_lancamento: string;
  tipo: "receita"|"despesa"; categoria: string; descricao: string;
  valor: number; origem: string; origem_id?: number;
  deducao_irpf: boolean; natureza_fiscal?: string; documento?: string;
};
type Apuracao = {
  ano_base: number; receita_bruta: number; despesas_dedutiveis: number;
  resultado_real: number; base_presumida_20pct: number;
  por_categoria: {tipo:string;categoria:string;total:number}[];
  mensal: {mes:number;receita:number;despesa:number}[];
  recomendacao_regime: string; economia_regime_real: number;
};

const CATEGORIAS_RECEITA = ["venda_producao","arrendamento","subsidio","outras_receitas"];
const CATEGORIAS_DESPESA = ["insumos","mao_de_obra","funrural","senar","desconto_prod","maquinario","arrendamento_pago","combustivel","manutencao","assistencia_tecnica","outras_despesas"];
const MESES = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

function fmt(v: number) {
  return new Intl.NumberFormat("pt-BR", { style:"currency", currency:"BRL" }).format(v||0);
}

export default function LivroCaixaPage() {
  const [aba, setAba] = useState<"lancamentos"|"apuracao"|"novo">("lancamentos");
  const [anoBase, setAnoBase] = useState(new Date().getFullYear());
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([]);
  const [apuracao, setApuracao] = useState<Apuracao|null>(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{tipo:"ok"|"err";texto:string}|null>(null);
  const [filtroTipo, setFiltroTipo] = useState("");

  const [form, setForm] = useState({
    data_lancamento: new Date().toISOString().split("T")[0],
    tipo: "receita", categoria: "venda_producao",
    descricao: "", valor: "", documento: "", observacoes: ""
  });

  const showMsg = (tipo:"ok"|"err", texto:string) => {
    setMsg({tipo,texto}); setTimeout(()=>setMsg(null),4000);
  };

  const loadLancamentos = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ ano_base: anoBase.toString() });
      if (filtroTipo) params.append("tipo", filtroTipo);
      const r = await fetch(`${API}/livro-caixa/${IMOVEL_ID}?${params}`);
      setLancamentos(await r.json());
    } catch { setLancamentos([]); }
    setLoading(false);
  }, [anoBase, filtroTipo]);

  const loadApuracao = useCallback(async () => {
    try {
      const r = await fetch(`${API}/livro-caixa/${IMOVEL_ID}/apuracao/${anoBase}`);
      setApuracao(await r.json());
    } catch { setApuracao(null); }
  }, [anoBase]);

  useEffect(() => {
    if (aba === "lancamentos") loadLancamentos();
    if (aba === "apuracao") loadApuracao();
  }, [aba, loadLancamentos, loadApuracao]);

  const salvar = async () => {
    if (!form.descricao || !form.valor) { showMsg("err","Preencha descrição e valor"); return; }
    const body = {
      imovel_id: IMOVEL_ID, ano_base: anoBase,
      ...form, valor: parseFloat(form.valor),
      deducao_irpf: true,
      natureza_fiscal: form.tipo === "receita" ? "receita_bruta" : "despesa_custeio"
    };
    const r = await fetch(`${API}/livro-caixa/`, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(body) });
    const d = await r.json();
    if (!r.ok) { showMsg("err", d.detail||"Erro ao salvar"); return; }
    showMsg("ok","Lançamento registrado com sucesso");
    setForm({ data_lancamento:new Date().toISOString().split("T")[0], tipo:"receita", categoria:"venda_producao", descricao:"", valor:"", documento:"", observacoes:"" });
    setAba("lancamentos");
    loadLancamentos();
  };

  const excluir = async (id:number) => {
    if (!confirm("Excluir este lançamento?")) return;
    await fetch(`${API}/livro-caixa/${id}`, { method:"DELETE" });
    loadLancamentos();
  };

  const totalReceitas = lancamentos.filter(l=>l.tipo==="receita").reduce((s,l)=>s+l.valor,0);
  const totalDespesas = lancamentos.filter(l=>l.tipo==="despesa").reduce((s,l)=>s+l.valor,0);
  const saldo = totalReceitas - totalDespesas;

  const s: Record<string,React.CSSProperties> = {
    page: { minHeight:"100vh", background:"#f8fafc", fontFamily:"'Inter',sans-serif", padding:"24px" },
    header: { display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:20 },
    title: { fontSize:22, fontWeight:700, color:"#1e293b", margin:0 },
    subtitle: { fontSize:13, color:"#64748b", marginTop:2 },
    kpiGrid: { display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))", gap:12, marginBottom:20 },
    kpi: { background:"#fff", borderRadius:10, padding:"14px 18px", boxShadow:"0 1px 4px rgba(0,0,0,.06)" },
    kpiVal: { fontSize:18, fontWeight:700, color:"#1e293b", marginBottom:2 },
    kpiLabel: { fontSize:11, color:"#94a3b8", textTransform:"uppercase" as const, letterSpacing:.5 },
    tabs: { display:"flex", gap:4, marginBottom:20, background:"#fff", borderRadius:10, padding:4, boxShadow:"0 1px 4px rgba(0,0,0,.06)", width:"fit-content" },
    tab: (a:boolean) => ({ padding:"8px 16px", borderRadius:7, border:"none", cursor:"pointer", fontSize:13, fontWeight:500, background:a?"#1e40af":"transparent", color:a?"#fff":"#64748b" }),
    card: { background:"#fff", borderRadius:12, boxShadow:"0 1px 4px rgba(0,0,0,.06)", overflow:"hidden" },
    table: { width:"100%", borderCollapse:"collapse" as const, fontSize:13 },
    th: { textAlign:"left" as const, padding:"10px 12px", background:"#f8fafc", color:"#64748b", fontSize:11, fontWeight:600, textTransform:"uppercase" as const, letterSpacing:.4 },
    td: { padding:"11px 12px", borderBottom:"1px solid #f1f5f9", color:"#334155" },
    badge: (c:string) => ({ display:"inline-block", padding:"2px 8px", borderRadius:20, fontSize:11, fontWeight:600, background:c+"22", color:c }),
    btn: (c:string,o?:boolean) => ({ padding:"7px 14px", borderRadius:7, border:o?`1.5px solid ${c}`:"none", background:o?"transparent":c, color:o?c:"#fff", cursor:"pointer", fontSize:12, fontWeight:600 }),
    input: { width:"100%", padding:"8px 12px", border:"1.5px solid #e2e8f0", borderRadius:8, fontSize:13, outline:"none", boxSizing:"border-box" as const },
    label: { fontSize:12, fontWeight:600, color:"#475569", marginBottom:4, display:"block" },
    grid2: { display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 },
    grid3: { display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12 },
    alert: (t:"ok"|"err") => ({ padding:"12px 16px", borderRadius:8, marginBottom:16, fontSize:13, background:t==="ok"?"#dcfce7":"#fee2e2", color:t==="ok"?"#166534":"#991b1b", fontWeight:500 }),
    emptyState: { textAlign:"center" as const, padding:"40px 20px", color:"#94a3b8" },
  };

  return (
    <div style={s.page}>
      {msg && <div style={s.alert(msg.tipo)}>{msg.texto}</div>}

      <div style={s.header}>
        <div>
          <h1 style={s.title}>📒 Livro Caixa Rural</h1>
          <p style={s.subtitle}>Escrituração da atividade rural — base para DIRPF (art. 18 Lei 9.250/1995)</p>
        </div>
        <div style={{ display:"flex", gap:8, alignItems:"center" }}>
          <select value={anoBase} onChange={e=>setAnoBase(parseInt(e.target.value))}
            style={{ ...s.input, width:90 }}>
            {[2022,2023,2024,2025,2026].map(y=><option key={y}>{y}</option>)}
          </select>
          <button style={s.btn("#1e40af")} onClick={()=>setAba("novo")}>+ Lançamento</button>
        </div>
      </div>

      {/* KPIs */}
      <div style={s.kpiGrid}>
        {[
          ["Receitas", fmt(totalReceitas), "#10b981"],
          ["Despesas", fmt(totalDespesas), "#ef4444"],
          ["Resultado Real", fmt(saldo), saldo>=0?"#10b981":"#ef4444"],
          ["Base Presumida (20%)", fmt(totalReceitas*0.2), "#8b5cf6"],
          ["Lançamentos", lancamentos.length.toString(), "#0ea5e9"],
        ].map(([l,v,c])=>(
          <div key={l} style={s.kpi}>
            <div style={{...s.kpiVal,color:c}}>{v}</div>
            <div style={s.kpiLabel}>{l}</div>
          </div>
        ))}
      </div>

      <div style={s.tabs}>
        {([["lancamentos","📋 Lançamentos"],["apuracao","📊 Apuração Anual"],["novo","➕ Novo"]] as [string,string][]).map(([id,label])=>(
          <button key={id} style={s.tab(aba===id)} onClick={()=>setAba(id as typeof aba)}>{label}</button>
        ))}
      </div>

      {/* ── LANÇAMENTOS ── */}
      {aba==="lancamentos" && (
        <div>
          <div style={{ display:"flex", gap:10, marginBottom:12 }}>
            <select style={{ ...s.input, width:140 }} value={filtroTipo} onChange={e=>setFiltroTipo(e.target.value)}>
              <option value="">Todos</option>
              <option value="receita">Receitas</option>
              <option value="despesa">Despesas</option>
            </select>
            <button style={s.btn("#64748b",true)} onClick={loadLancamentos}>🔄</button>
          </div>
          <div style={s.card}>
            {loading ? (
              <div style={s.emptyState}>Carregando...</div>
            ) : lancamentos.length===0 ? (
              <div style={s.emptyState}>
                <div style={{fontSize:40,marginBottom:12}}>📒</div>
                <div style={{fontWeight:600,marginBottom:4}}>Livro Caixa vazio para {anoBase}</div>
                <div style={{fontSize:12,marginBottom:16}}>Registre lançamentos manualmente ou importe de acertos de contrato.</div>
                <button style={s.btn("#1e40af")} onClick={()=>setAba("novo")}>+ Primeiro Lançamento</button>
              </div>
            ) : (
              <table style={s.table}>
                <thead><tr>
                  {["Data","Tipo","Categoria","Descrição","Valor","Documento","Origem","Ações"].map(h=><th key={h} style={s.th}>{h}</th>)}
                </tr></thead>
                <tbody>
                  {lancamentos.map(l=>(
                    <tr key={l.id}>
                      <td style={s.td}>{new Date(l.data_lancamento).toLocaleDateString("pt-BR")}</td>
                      <td style={s.td}>
                        <span style={s.badge(l.tipo==="receita"?"#10b981":"#ef4444")}>
                          {l.tipo==="receita"?"+ Receita":"− Despesa"}
                        </span>
                      </td>
                      <td style={s.td}>{l.categoria.replace(/_/g," ")}</td>
                      <td style={{...s.td,maxWidth:220,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{l.descricao}</td>
                      <td style={{...s.td,fontWeight:700,color:l.tipo==="receita"?"#10b981":"#ef4444"}}>
                        {l.tipo==="receita"?"+":"-"}{fmt(l.valor)}
                      </td>
                      <td style={s.td}>{l.documento||"—"}</td>
                      <td style={s.td}>
                        {l.origem==="manual"?(
                          <span style={s.badge("#94a3b8")}>manual</span>
                        ):(
                          <span style={s.badge("#3b82f6")}>{l.origem.replace(/_/g," ")}</span>
                        )}
                      </td>
                      <td style={s.td}>
                        {l.origem==="manual" && (
                          <button style={{...s.btn("#ef4444",true),padding:"4px 10px"}} onClick={()=>excluir(l.id)}>🗑</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ── APURAÇÃO ANUAL ── */}
      {aba==="apuracao" && (
        <div>
          {!apuracao ? (
            <div style={s.emptyState}>Carregando apuração...</div>
          ) : (
            <>
              {/* Resumo */}
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:20 }}>
                <div style={{ ...s.card, padding:"20px 24px" }}>
                  <div style={{ fontSize:13, fontWeight:700, color:"#334155", marginBottom:16 }}>📊 Resultado Anual {anoBase}</div>
                  {[
                    ["Receita Bruta", fmt(apuracao.receita_bruta), "#10b981"],
                    ["Despesas Dedutíveis", fmt(apuracao.despesas_dedutiveis), "#ef4444"],
                    ["Resultado Real", fmt(apuracao.resultado_real), apuracao.resultado_real>=0?"#10b981":"#ef4444"],
                  ].map(([k,v,c])=>(
                    <div key={k} style={{ display:"flex", justifyContent:"space-between", padding:"8px 0", borderBottom:"1px solid #f1f5f9" }}>
                      <span style={{ color:"#64748b", fontSize:13 }}>{k}</span>
                      <span style={{ fontWeight:700, color:c, fontSize:14 }}>{v}</span>
                    </div>
                  ))}
                </div>

                <div style={{ ...s.card, padding:"20px 24px" }}>
                  <div style={{ fontSize:13, fontWeight:700, color:"#334155", marginBottom:16 }}>🧮 Base Tributável IRPF</div>
                  <div style={{ background:"#eff6ff", borderRadius:10, padding:"16px", marginBottom:12 }}>
                    <div style={{ fontSize:11, color:"#64748b", textTransform:"uppercase" as const, marginBottom:4 }}>Base Presumida (20%)</div>
                    <div style={{ fontSize:22, fontWeight:800, color:"#1e40af" }}>{fmt(apuracao.base_presumida_20pct)}</div>
                    <div style={{ fontSize:11, color:"#64748b", marginTop:4 }}>art. 59 RIR/2018 — 20% de {fmt(apuracao.receita_bruta)}</div>
                  </div>
                  <div style={{ background:"#f0fdf4", borderRadius:10, padding:"16px" }}>
                    <div style={{ fontSize:11, color:"#64748b", textTransform:"uppercase" as const, marginBottom:4 }}>Resultado Real</div>
                    <div style={{ fontSize:22, fontWeight:800, color:"#10b981" }}>{fmt(apuracao.resultado_real)}</div>
                    <div style={{ fontSize:11, color:"#64748b", marginTop:4 }}>Receita − Despesas dedutíveis</div>
                  </div>
                  {apuracao.economia_regime_real > 0 && (
                    <div style={{ background:"#fef9c3", borderRadius:8, padding:"10px 14px", marginTop:10, fontSize:12, color:"#854d0e" }}>
                      💡 Regime real economiza <strong>{fmt(apuracao.economia_regime_real)}</strong> de base tributável
                    </div>
                  )}
                  <div style={{ marginTop:12, padding:"10px 14px", background:"#f8fafc", borderRadius:8, fontSize:12, color:"#475569" }}>
                    <strong>Recomendação:</strong> {apuracao.recomendacao_regime === "resultado_real" ? "Use o resultado real — menor base tributável" : "Use a base presumida de 20%"}
                  </div>
                </div>
              </div>

              {/* Mensal */}
              <div style={s.card}>
                <div style={{ padding:"14px 18px", borderBottom:"1px solid #f1f5f9" }}>
                  <strong style={{ fontSize:14 }}>Fluxo Mensal {anoBase}</strong>
                </div>
                <table style={s.table}>
                  <thead><tr>
                    {["Mês","Receitas","Despesas","Saldo Mês","Saldo Acumulado"].map(h=><th key={h} style={s.th}>{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {(() => {
                      let acum = 0;
                      return apuracao.mensal.map(m=>{
                        const saldoM = (m.receita||0)-(m.despesa||0);
                        acum += saldoM;
                        return (
                          <tr key={m.mes}>
                            <td style={{...s.td,fontWeight:600}}>{MESES[m.mes-1]}</td>
                            <td style={{...s.td,color:"#10b981"}}>{fmt(m.receita||0)}</td>
                            <td style={{...s.td,color:"#ef4444"}}>{fmt(m.despesa||0)}</td>
                            <td style={{...s.td,fontWeight:600,color:saldoM>=0?"#10b981":"#ef4444"}}>{fmt(saldoM)}</td>
                            <td style={{...s.td,fontWeight:700,color:acum>=0?"#10b981":"#ef4444"}}>{fmt(acum)}</td>
                          </tr>
                        );
                      });
                    })()}
                  </tbody>
                </table>
              </div>

              {/* Por categoria */}
              <div style={{ ...s.card, marginTop:16 }}>
                <div style={{ padding:"14px 18px", borderBottom:"1px solid #f1f5f9" }}>
                  <strong style={{ fontSize:14 }}>Por Categoria</strong>
                </div>
                <table style={s.table}>
                  <thead><tr>
                    {["Tipo","Categoria","Total"].map(h=><th key={h} style={s.th}>{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {apuracao.por_categoria.map((c,i)=>(
                      <tr key={i}>
                        <td style={s.td}><span style={s.badge(c.tipo==="receita"?"#10b981":"#ef4444")}>{c.tipo}</span></td>
                        <td style={s.td}>{c.categoria.replace(/_/g," ")}</td>
                        <td style={{...s.td,fontWeight:700,color:c.tipo==="receita"?"#10b981":"#ef4444"}}>{fmt(c.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── NOVO LANÇAMENTO ── */}
      {aba==="novo" && (
        <div style={s.card}>
          <div style={{ padding:"14px 18px", borderBottom:"1px solid #f1f5f9" }}>
            <strong style={{ fontSize:14 }}>Novo Lançamento — Livro Caixa {anoBase}</strong>
          </div>
          <div style={{ padding:"16px 18px" }}>
            <div style={s.grid3}>
              <div>
                <label style={s.label}>Data *</label>
                <input type="date" style={s.input} value={form.data_lancamento}
                  onChange={e=>setForm(f=>({...f,data_lancamento:e.target.value}))} />
              </div>
              <div>
                <label style={s.label}>Tipo *</label>
                <select style={s.input} value={form.tipo} onChange={e=>setForm(f=>({...f,tipo:e.target.value,categoria:e.target.value==="receita"?"venda_producao":"insumos"}))}>
                  <option value="receita">+ Receita</option>
                  <option value="despesa">− Despesa</option>
                </select>
              </div>
              <div>
                <label style={s.label}>Categoria *</label>
                <select style={s.input} value={form.categoria} onChange={e=>setForm(f=>({...f,categoria:e.target.value}))}>
                  {(form.tipo==="receita"?CATEGORIAS_RECEITA:CATEGORIAS_DESPESA).map(c=>(
                    <option key={c} value={c}>{c.replace(/_/g," ")}</option>
                  ))}
                </select>
              </div>
            </div>
            <div style={{ marginTop:12 }}>
              <label style={s.label}>Descrição *</label>
              <input type="text" style={s.input} value={form.descricao}
                onChange={e=>setForm(f=>({...f,descricao:e.target.value}))}
                placeholder="Ex: Venda de soja safra 25/26 — 500 sacas" />
            </div>
            <div style={{ ...s.grid2, marginTop:12 }}>
              <div>
                <label style={s.label}>Valor (R$) *</label>
                <input type="number" step="0.01" style={s.input} value={form.valor}
                  onChange={e=>setForm(f=>({...f,valor:e.target.value}))} />
              </div>
              <div>
                <label style={s.label}>Documento (NF, recibo)</label>
                <input type="text" style={s.input} value={form.documento}
                  onChange={e=>setForm(f=>({...f,documento:e.target.value}))} />
              </div>
            </div>
            <div style={{ marginTop:12 }}>
              <label style={s.label}>Observações</label>
              <textarea style={{ ...s.input, height:60, resize:"vertical" as const }} value={form.observacoes}
                onChange={e=>setForm(f=>({...f,observacoes:e.target.value}))} />
            </div>
            <div style={{ display:"flex", gap:8, marginTop:16 }}>
              <button style={s.btn("#1e40af")} onClick={salvar}>Salvar Lançamento</button>
              <button style={s.btn("#6b7280",true)} onClick={()=>setAba("lancamentos")}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
