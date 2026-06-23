"use client";
import { useState, useEffect, useCallback } from "react";

const API = process.env.NEXT_PUBLIC_API_URL || "https://ruralcaixa-mvp-production.up.railway.app";
const IMOVEL_ID = 1;

type Apuracao = {
  ano_base: number; regime: string;
  receita_bruta: number; despesas_reais: number; resultado_real: number;
  base_presumida_20pct: number; base_tributavel: number;
  total_deducoes_pessoais: number; base_calculo_irpf: number;
  aliquota_efetiva_pct: number; imposto_bruto: number;
  irrf_retido_total: number; imposto_a_pagar: number; imposto_a_restituir: number;
  acertos_valor_bruto: number; acertos_funrural_retido: number; acertos_senar_retido: number;
  deducoes: Record<string,number>;
  comparativo: { presumido_base:number; real_base:number; economia_regime_real:number; recomendacao:string };
};

function fmt(v: number) {
  return new Intl.NumberFormat("pt-BR", { style:"currency", currency:"BRL" }).format(v||0);
}
function fmtPct(v: number) { return `${v.toFixed(2)}%`; }

export default function DirpfPage() {
  const [anoBase, setAnoBase] = useState(2024);
  const [regime, setRegime] = useState("presumido_20pct");
  const [apuracao, setApuracao] = useState<Apuracao|null>(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{tipo:"ok"|"err";texto:string}|null>(null);
  const [aba, setAba] = useState<"apuracao"|"config"|"guia">("apuracao");

  const [config, setConfig] = useState({
    dependentes: "0", deducao_inss: "", deducao_previdencia_privada: "",
    deducao_educacao: "", deducao_saude: "", deducao_pensao_alimenticia: "",
    irrf_retido_fonte: "", irrf_carnê_leão: "", observacoes: ""
  });

  const showMsg = (tipo:"ok"|"err", texto:string) => {
    setMsg({tipo,texto}); setTimeout(()=>setMsg(null),5000);
  };

  const loadApuracao = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/dirpf/apuracao/${IMOVEL_ID}/${anoBase}?regime=${regime}`);
      setApuracao(await r.json());
    } catch { setApuracao(null); }
    setLoading(false);
  }, [anoBase, regime]);

  const loadConfig = useCallback(async () => {
    try {
      const r = await fetch(`${API}/dirpf/config/${IMOVEL_ID}/${anoBase}`);
      const d = await r.json();
      if (d.id) {
        setConfig({
          dependentes: d.dependentes?.toString()||"0",
          deducao_inss: d.deducao_inss?.toString()||"",
          deducao_previdencia_privada: d.deducao_previdencia_privada?.toString()||"",
          deducao_educacao: d.deducao_educacao?.toString()||"",
          deducao_saude: d.deducao_saude?.toString()||"",
          deducao_pensao_alimenticia: d.deducao_pensao_alimenticia?.toString()||"",
          irrf_retido_fonte: d.irrf_retido_fonte?.toString()||"",
          "irrf_carnê_leão": d["irrf_carnê_leão"]?.toString()||"",
          observacoes: d.observacoes||""
        });
        setRegime(d.regime||"presumido_20pct");
      }
    } catch {}
  }, [anoBase]);

  useEffect(() => { loadApuracao(); loadConfig(); }, [loadApuracao, loadConfig]);

  const salvarConfig = async () => {
    const body = {
      imovel_id: IMOVEL_ID, ano_base: anoBase, regime,
      dependentes: parseInt(config.dependentes)||0,
      deducao_inss: parseFloat(config.deducao_inss)||0,
      deducao_previdencia_privada: parseFloat(config.deducao_previdencia_privada)||0,
      deducao_educacao: parseFloat(config.deducao_educacao)||0,
      deducao_saude: parseFloat(config.deducao_saude)||0,
      deducao_pensao_alimenticia: parseFloat(config.deducao_pensao_alimenticia)||0,
      irrf_retido_fonte: parseFloat(config.irrf_retido_fonte)||0,
      "irrf_carnê_leão": parseFloat(config["irrf_carnê_leão"])||0,
      observacoes: config.observacoes||null
    };
    const r = await fetch(`${API}/dirpf/config`, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(body) });
    if (r.ok) { showMsg("ok","Configuração salva. Recalculando..."); loadApuracao(); }
    else showMsg("err","Erro ao salvar configuração");
  };

  const s: Record<string,React.CSSProperties> = {
    page: { minHeight:"100vh", background:"#f8fafc", fontFamily:"'Inter',sans-serif", padding:"24px" },
    header: { display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:20 },
    title: { fontSize:22, fontWeight:700, color:"#1e293b", margin:0 },
    subtitle: { fontSize:13, color:"#64748b", marginTop:2 },
    tabs: { display:"flex", gap:4, marginBottom:20, background:"#fff", borderRadius:10, padding:4, boxShadow:"0 1px 4px rgba(0,0,0,.06)", width:"fit-content" },
    tab: (a:boolean) => ({ padding:"8px 16px", borderRadius:7, border:"none", cursor:"pointer", fontSize:13, fontWeight:500, background:a?"#1e40af":"transparent", color:a?"#fff":"#64748b" }),
    card: { background:"#fff", borderRadius:12, boxShadow:"0 1px 4px rgba(0,0,0,.06)", overflow:"hidden" },
    grid2: { display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 },
    grid3: { display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12 },
    row: { display:"flex", justifyContent:"space-between", padding:"9px 0", borderBottom:"1px solid #f1f5f9", fontSize:13 },
    rowLabel: { color:"#64748b" },
    rowVal: (c?:string) => ({ fontWeight:600, color:c||"#1e293b" }),
    rowTotal: { display:"flex", justifyContent:"space-between", padding:"10px 0 0", marginTop:4, borderTop:"2px solid #e2e8f0", fontWeight:800, fontSize:15 },
    input: { width:"100%", padding:"8px 12px", border:"1.5px solid #e2e8f0", borderRadius:8, fontSize:13, outline:"none", boxSizing:"border-box" as const },
    label: { fontSize:12, fontWeight:600, color:"#475569", marginBottom:4, display:"block" },
    btn: (c:string,o?:boolean) => ({ padding:"8px 16px", borderRadius:8, border:o?`1.5px solid ${c}`:"none", background:o?"transparent":c, color:o?c:"#fff", cursor:"pointer", fontSize:13, fontWeight:600 }),
    alert: (t:"ok"|"err") => ({ padding:"12px 16px", borderRadius:8, marginBottom:16, fontSize:13, background:t==="ok"?"#dcfce7":"#fee2e2", color:t==="ok"?"#166534":"#991b1b", fontWeight:500 }),
    highlight: (c:string) => ({ background:c+"11", border:`2px solid ${c}44`, borderRadius:12, padding:"20px 24px" }),
    emptyState: { textAlign:"center" as const, padding:"40px 20px", color:"#94a3b8" },
    sectionTitle: { fontSize:13, fontWeight:700, color:"#334155", marginBottom:10, paddingBottom:6, borderBottom:"1.5px solid #f1f5f9" },
  };

  return (
    <div style={s.page}>
      {msg && <div style={s.alert(msg.tipo)}>{msg.texto}</div>}

      <div style={s.header}>
        <div>
          <h1 style={s.title}>🧾 DIRPF — Atividade Rural</h1>
          <p style={s.subtitle}>Apuração anual do IRPF — Ficha Atividade Rural (RIR/2018 arts. 58-71)</p>
        </div>
        <div style={{ display:"flex", gap:8, alignItems:"center" }}>
          <select value={anoBase} onChange={e=>{ setAnoBase(parseInt(e.target.value)); }}
            style={{ ...s.input, width:90 }}>
            {[2022,2023,2024,2025].map(y=><option key={y}>{y}</option>)}
          </select>
          <select value={regime} onChange={e=>setRegime(e.target.value)}
            style={{ ...s.input, width:180 }}>
            <option value="presumido_20pct">Base Presumida 20%</option>
            <option value="resultado_real">Resultado Real</option>
          </select>
          <button style={s.btn("#1e40af")} onClick={loadApuracao}>Calcular</button>
        </div>
      </div>

      <div style={s.tabs}>
        {([["apuracao","📊 Apuração"],["config","⚙️ Deduções"],["guia","📋 Guia DIRPF"]] as [string,string][]).map(([id,label])=>(
          <button key={id} style={s.tab(aba===id)} onClick={()=>setAba(id as typeof aba)}>{label}</button>
        ))}
      </div>

      {/* ── APURAÇÃO ── */}
      {aba==="apuracao" && (
        loading ? <div style={s.emptyState}>Calculando...</div> :
        !apuracao ? <div style={s.emptyState}>Nenhum dado encontrado. Verifique o Livro Caixa.</div> :
        <div>
          {/* Resultado principal */}
          <div style={{ ...s.grid2, marginBottom:20 }}>
            <div style={s.highlight(apuracao.imposto_a_pagar > 0 ? "#ef4444" : "#10b981")}>
              <div style={{ fontSize:12, color:"#64748b", textTransform:"uppercase" as const, marginBottom:6, letterSpacing:.5 }}>
                {apuracao.imposto_a_pagar > 0 ? "IRPF a Pagar" : "IRPF a Restituir"}
              </div>
              <div style={{ fontSize:32, fontWeight:900, color: apuracao.imposto_a_pagar > 0 ? "#ef4444" : "#10b981" }}>
                {fmt(apuracao.imposto_a_pagar > 0 ? apuracao.imposto_a_pagar : apuracao.imposto_a_restituir)}
              </div>
              <div style={{ fontSize:12, color:"#64748b", marginTop:6 }}>
                Alíquota efetiva: {fmtPct(apuracao.aliquota_efetiva_pct)} — Base: {fmt(apuracao.base_calculo_irpf)}
              </div>
            </div>

            <div style={{ ...s.card, padding:"20px 24px" }}>
              <div style={s.sectionTitle}>Comparativo de Regimes</div>
              <div style={s.row}>
                <span style={s.rowLabel}>Base Presumida (20%)</span>
                <span style={s.rowVal()}>{fmt(apuracao.comparativo.presumido_base)}</span>
              </div>
              <div style={s.row}>
                <span style={s.rowLabel}>Resultado Real</span>
                <span style={s.rowVal()}>{fmt(apuracao.comparativo.real_base)}</span>
              </div>
              {apuracao.comparativo.economia_regime_real > 0 && (
                <div style={{ background:"#f0fdf4", borderRadius:8, padding:"10px 14px", marginTop:10, fontSize:12, color:"#166534" }}>
                  💡 Regime real economiza <strong>{fmt(apuracao.comparativo.economia_regime_real)}</strong> de base tributável
                </div>
              )}
              <div style={{ marginTop:10, padding:"10px 14px", background:"#eff6ff", borderRadius:8, fontSize:12, color:"#1e40af" }}>
                <strong>Regime atual:</strong> {regime === "presumido_20pct" ? "Base Presumida 20%" : "Resultado Real"}<br/>
                <strong>Recomendação:</strong> {apuracao.comparativo.recomendacao === "resultado_real" ? "Resultado Real (menor base)" : "Base Presumida 20%"}
              </div>
            </div>
          </div>

          {/* Detalhamento */}
          <div style={s.grid2}>
            <div style={{ ...s.card, padding:"20px 24px" }}>
              <div style={s.sectionTitle}>📒 Livro Caixa — {anoBase}</div>
              <div style={s.row}><span style={s.rowLabel}>Receita Bruta</span><span style={s.rowVal("#10b981")}>{fmt(apuracao.receita_bruta)}</span></div>
              <div style={s.row}><span style={s.rowLabel}>Despesas Dedutíveis</span><span style={s.rowVal("#ef4444")}>-{fmt(apuracao.despesas_reais)}</span></div>
              <div style={{ ...s.row, borderBottom:"none" }}><span style={{ ...s.rowLabel, fontWeight:700 }}>Resultado Real</span><span style={s.rowVal(apuracao.resultado_real>=0?"#10b981":"#ef4444")}>{fmt(apuracao.resultado_real)}</span></div>
              <div style={{ borderTop:"2px solid #e2e8f0", paddingTop:10, marginTop:4 }}>
                <div style={s.row}><span style={s.rowLabel}>Base Presumida (20%)</span><span style={s.rowVal("#8b5cf6")}>{fmt(apuracao.base_presumida_20pct)}</span></div>
                <div style={{ ...s.row, borderBottom:"none" }}><span style={{ ...s.rowLabel, fontWeight:700, color:"#1e40af" }}>Base Tributável ({regime==="presumido_20pct"?"20%":"real"})</span><span style={s.rowVal("#1e40af")}>{fmt(apuracao.base_tributavel)}</span></div>
              </div>
            </div>

            <div style={{ ...s.card, padding:"20px 24px" }}>
              <div style={s.sectionTitle}>🧮 Cálculo do IRPF</div>
              <div style={s.row}><span style={s.rowLabel}>Base Tributável</span><span style={s.rowVal()}>{fmt(apuracao.base_tributavel)}</span></div>
              <div style={s.row}><span style={s.rowLabel}>(-) Deduções Pessoais</span><span style={s.rowVal("#10b981")}>-{fmt(apuracao.total_deducoes_pessoais)}</span></div>
              <div style={s.row}><span style={s.rowLabel}>Base de Cálculo IRPF</span><span style={s.rowVal("#1e40af")}>{fmt(apuracao.base_calculo_irpf)}</span></div>
              <div style={s.row}><span style={s.rowLabel}>Alíquota Efetiva</span><span style={s.rowVal()}>{fmtPct(apuracao.aliquota_efetiva_pct)}</span></div>
              <div style={s.row}><span style={s.rowLabel}>Imposto Bruto</span><span style={s.rowVal()}>{fmt(apuracao.imposto_bruto)}</span></div>
              <div style={s.row}><span style={s.rowLabel}>(-) IRRF Retido</span><span style={s.rowVal("#10b981")}>-{fmt(apuracao.irrf_retido_total)}</span></div>
              <div style={s.rowTotal}>
                <span style={{ color: apuracao.imposto_a_pagar > 0 ? "#ef4444" : "#10b981" }}>
                  {apuracao.imposto_a_pagar > 0 ? "IRPF a Pagar" : "IRPF a Restituir"}
                </span>
                <span style={{ color: apuracao.imposto_a_pagar > 0 ? "#ef4444" : "#10b981" }}>
                  {fmt(apuracao.imposto_a_pagar > 0 ? apuracao.imposto_a_pagar : apuracao.imposto_a_restituir)}
                </span>
              </div>
            </div>
          </div>

          {/* Cross-check acertos */}
          {apuracao.acertos_valor_bruto > 0 && (
            <div style={{ ...s.card, padding:"20px 24px", marginTop:16 }}>
              <div style={s.sectionTitle}>🌾 Cross-check — Acertos de Contrato</div>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:12 }}>
                {[
                  ["Receita Bruta (acertos)", fmt(apuracao.acertos_valor_bruto), "#10b981"],
                  ["FUNRURAL Retido", fmt(apuracao.acertos_funrural_retido), "#f59e0b"],
                  ["SENAR Retido", fmt(apuracao.acertos_senar_retido), "#f59e0b"],
                ].map(([l,v,c])=>(
                  <div key={l} style={{ background:"#f8fafc", borderRadius:8, padding:"12px 16px" }}>
                    <div style={{ fontSize:11, color:"#94a3b8", textTransform:"uppercase" as const, marginBottom:4 }}>{l}</div>
                    <div style={{ fontSize:16, fontWeight:700, color:c }}>{v}</div>
                  </div>
                ))}
              </div>
              {Math.abs(apuracao.acertos_valor_bruto - apuracao.receita_bruta) > 1 && (
                <div style={{ background:"#fffbeb", border:"1px solid #fde68a", borderRadius:8, padding:"10px 14px", marginTop:12, fontSize:12, color:"#92400e" }}>
                  ⚠️ Divergência detectada: acertos somam {fmt(apuracao.acertos_valor_bruto)} mas Livro Caixa tem {fmt(apuracao.receita_bruta)} em receitas. Verifique se todos os acertos foram lançados no Livro Caixa.
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── CONFIGURAÇÃO / DEDUÇÕES ── */}
      {aba==="config" && (
        <div style={{ ...s.card, padding:"20px 24px" }}>
          <div style={s.sectionTitle}>⚙️ Deduções e IRRF — Ano-base {anoBase}</div>
          <div style={s.grid3}>
            <div>
              <label style={s.label}>Regime de Apuração</label>
              <select style={s.input} value={regime} onChange={e=>setRegime(e.target.value)}>
                <option value="presumido_20pct">Base Presumida 20% (art. 59 RIR)</option>
                <option value="resultado_real">Resultado Real (Livro Caixa)</option>
              </select>
            </div>
            <div>
              <label style={s.label}>Dependentes</label>
              <input type="number" min="0" style={s.input} value={config.dependentes}
                onChange={e=>setConfig(c=>({...c,dependentes:e.target.value}))} />
              <div style={{ fontSize:11, color:"#94a3b8", marginTop:3 }}>R$ 2.275,08/dependente/ano (2024)</div>
            </div>
            <div>
              <label style={s.label}>INSS Pago (R$)</label>
              <input type="number" step="0.01" style={s.input} value={config.deducao_inss}
                onChange={e=>setConfig(c=>({...c,deducao_inss:e.target.value}))} />
            </div>
            <div>
              <label style={s.label}>Previdência Privada (R$)</label>
              <input type="number" step="0.01" style={s.input} value={config.deducao_previdencia_privada}
                onChange={e=>setConfig(c=>({...c,deducao_previdencia_privada:e.target.value}))} />
              <div style={{ fontSize:11, color:"#94a3b8", marginTop:3 }}>Limite: 12% da renda tributável</div>
            </div>
            <div>
              <label style={s.label}>Educação (R$)</label>
              <input type="number" step="0.01" style={s.input} value={config.deducao_educacao}
                onChange={e=>setConfig(c=>({...c,deducao_educacao:e.target.value}))} />
              <div style={{ fontSize:11, color:"#94a3b8", marginTop:3 }}>Limite: R$ 3.561,50/ano (2024)</div>
            </div>
            <div>
              <label style={s.label}>Saúde (R$)</label>
              <input type="number" step="0.01" style={s.input} value={config.deducao_saude}
                onChange={e=>setConfig(c=>({...c,deducao_saude:e.target.value}))} />
              <div style={{ fontSize:11, color:"#94a3b8", marginTop:3 }}>Sem limite</div>
            </div>
            <div>
              <label style={s.label}>Pensão Alimentícia (R$)</label>
              <input type="number" step="0.01" style={s.input} value={config.deducao_pensao_alimenticia}
                onChange={e=>setConfig(c=>({...c,deducao_pensao_alimenticia:e.target.value}))} />
            </div>
            <div>
              <label style={s.label}>IRRF Retido na Fonte (R$)</label>
              <input type="number" step="0.01" style={s.input} value={config.irrf_retido_fonte}
                onChange={e=>setConfig(c=>({...c,irrf_retido_fonte:e.target.value}))} />
            </div>
            <div>
              <label style={s.label}>Carnê-Leão Pago (R$)</label>
              <input type="number" step="0.01" style={s.input} value={config["irrf_carnê_leão"]}
                onChange={e=>setConfig(c=>({...c,"irrf_carnê_leão":e.target.value}))} />
            </div>
          </div>
          <div style={{ marginTop:12 }}>
            <label style={s.label}>Observações</label>
            <textarea style={{ ...s.input, height:60, resize:"vertical" as const }} value={config.observacoes}
              onChange={e=>setConfig(c=>({...c,observacoes:e.target.value}))} />
          </div>
          <div style={{ display:"flex", gap:8, marginTop:16 }}>
            <button style={s.btn("#1e40af")} onClick={salvarConfig}>Salvar e Recalcular</button>
            <button style={s.btn("#64748b",true)} onClick={()=>setAba("apuracao")}>Ver Apuração</button>
          </div>
        </div>
      )}

      {/* ── GUIA DIRPF ── */}
      {aba==="guia" && (
        <div style={{ ...s.card, padding:"24px" }}>
          <div style={s.sectionTitle}>📋 Guia de Preenchimento — DIRPF Atividade Rural</div>
          {[
            {
              titulo: "1. Ficha Atividade Rural — Receitas",
              cor: "#10b981",
              itens: [
                "Informe a receita bruta total no campo 'Receita Bruta'",
                "Inclua todas as vendas de produção: soja, milho, gado, etc.",
                "Arrendamentos recebidos em produto entram como receita pelo valor em dinheiro",
                "Subvenções e incentivos governamentais também são receita",
              ]
            },
            {
              titulo: "2. Ficha Atividade Rural — Despesas",
              cor: "#ef4444",
              itens: [
                "Informe as despesas do Livro Caixa: insumos, mão de obra, combustível",
                "FUNRURAL e SENAR retidos pelo adquirente são despesas dedutíveis",
                "Desconto PROD (comercialização) é despesa dedutível",
                "Investimentos (máquinas, benfeitorias) podem ser deduzidos integralmente no ano",
              ]
            },
            {
              titulo: "3. Regime de Apuração",
              cor: "#8b5cf6",
              itens: [
                "Base Presumida 20%: mais simples, não precisa comprovar despesas",
                "Resultado Real: exige Livro Caixa completo, mas pode ser menor",
                "Compare os dois regimes antes de declarar",
                "O regime escolhido vale para o ano inteiro — não pode mudar depois",
              ]
            },
            {
              titulo: "4. FUNRURAL na DIRPF",
              cor: "#f59e0b",
              itens: [
                "FUNRURAL retido pelo adquirente: informe como despesa no Livro Caixa",
                "Se você recolheu FUNRURAL diretamente (DARF): também é despesa",
                "O valor do FUNRURAL NÃO é deduzido da receita bruta — é despesa separada",
                "Guarde os comprovantes de retenção emitidos pelo adquirente",
              ]
            },
            {
              titulo: "5. Prazos e Multas",
              cor: "#1e40af",
              itens: [
                "Prazo de entrega: último dia útil de abril do ano seguinte",
                "Multa por atraso: 1% ao mês sobre o imposto devido, mínimo R$ 165,74",
                "Multa por omissão de receita: 75% do imposto + juros SELIC",
                "Declaração retificadora: pode ser enviada a qualquer momento antes da fiscalização",
              ]
            },
          ].map(sec=>(
            <div key={sec.titulo} style={{ marginBottom:20 }}>
              <div style={{ fontSize:14, fontWeight:700, color:sec.cor, marginBottom:8 }}>{sec.titulo}</div>
              <ul style={{ margin:0, paddingLeft:20 }}>
                {sec.itens.map((item,i)=>(
                  <li key={i} style={{ fontSize:13, color:"#475569", marginBottom:4, lineHeight:1.6 }}>{item}</li>
                ))}
              </ul>
            </div>
          ))}
          <div style={{ background:"#eff6ff", borderRadius:10, padding:"16px 20px", marginTop:8 }}>
            <div style={{ fontSize:13, fontWeight:700, color:"#1e40af", marginBottom:6 }}>⚖️ Base Legal</div>
            <div style={{ fontSize:12, color:"#1e40af", lineHeight:1.8 }}>
              RIR/2018 arts. 58-71 • Lei 9.250/1995 art. 18 • IN RFB 2.178/2024 (DIRPF 2025)
              • Tabela progressiva IRPF 2024: isenção até R$ 27.110,40/ano
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
