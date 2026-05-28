"use client";
import { useState, useEffect } from "react";

const API = "https://ruralcaixa-mvp-production.up.railway.app";
const IMOVEL_ID = 1;

type Animal = {
  id: number;
  brinco: string;
  sexo: string;
  raca: string | null;
  status: string;
  lote_nome: string | null;
  ultimo_peso: number | null;
  data_ultimo_peso: string | null;
  data_nascimento: string | null;
};

type Lote = {
  id: number;
  nome: string;
  fase: string;
  total_animais: number;
};

type Dashboard = {
  rebanho: { total_ativo: number; matrizes: number; reprodutores: number };
  abates_30d: { total_abatidos: number; media_carcaca_kg: number | null; media_rendimento_pct: number | null; receita_total_rs: number | null };
  partos_30d: { total_partos: number; cordeiros_vivos: number | null; cordeiros_mortos: number | null };
  alertas_7d: { total_alertas: number };
};

type IndicadorLote = {
  lote_id: number;
  lote_nome: string;
  fase: string;
  animais_ativos: number;
  mortes: number;
  abates: number;
  peso_medio_atual: number | null;
  peso_medio_entrada: number | null;
  dias_medio_lote: number | null;
  gmd_kg_dia: number | null;
  variacao_peso_pct: number | null;
  taxa_mortalidade_pct: number | null;
  taxa_abate_pct: number | null;
  dias_projecao_abate_35kg: number | null;
};

type Insumo = {
  id: number;
  nome_comercial: string;
  principio_ativo: string | null;
  categoria: string;
  dose_padrao_ml: number | null;
  via_padrao: string | null;
  dias_carencia: number;
  dias_reforco: number | null;
};

type Carencia = {
  aplicacao_id: number;
  animal_brinco: string | null;
  lote_nome: string | null;
  nome_comercial: string;
  categoria: string;
  data_aplicacao: string;
  data_liberacao: string;
  dias_restantes: number;
};

type Tarefa = {
  id: number;
  tipo: string;
  titulo: string;
  data_prevista: string;
  data_vencimento: string;
  prioridade: string;
  status: string;
  animal_brinco: string | null;
  lote_nome: string | null;
  responsavel_nome: string | null;
  recorrencia_dias: number | null;
  origem: string;
};

type Alerta = {
  id: number;
  tipo_alerta: string;
  titulo: string;
  data_vencimento: string;
  prioridade: string;
  status: string;
  animal_brinco: string | null;
  lote_nome: string | null;
  origem_evento: string | null;
};

export default function OvinoDashboard() {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [animais, setAnimais] = useState<Animal[]>([]);
  const [lotes, setLotes] = useState<Lote[]>([]);
  const [alertas, setAlertas] = useState<Alerta[]>([]);
  const [tarefas, setTarefas] = useState<Tarefa[]>([]);
  const [resumoTarefas, setResumoTarefas] = useState<any>(null);
  const [aba, setAba] = useState<"rebanho" | "lotes" | "alertas">("rebanho");
  const [loading, setLoading] = useState(true);
  const [filtroStatus, setFiltroStatus] = useState("ativo");
  const [novoAnimal, setNovoAnimal] = useState({ brinco: "", sexo: "F", raca: "" });
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState("");
  const [reclassificando, setReclassificando] = useState(false);
  const [insumos, setInsumos] = useState<Insumo[]>([]);
  const [indicadores, setIndicadores] = useState<{consolidado:any, por_lote:IndicadorLote[]} | null>(null);
  const [carencias, setCarencias] = useState<Carencia[]>([]);
  const [novaAplic, setNovaAplic] = useState({ insumo_id: 0, animal_id: "", lote_id: "", dose_ml: "", via: "", lote_produto: "", responsavel_nome: "" });
  const [salvandoAplic, setSalvandoAplic] = useState(false);
  const [msgAplic, setMsgAplic] = useState("");
  const [resultadoReclass, setResultadoReclass] = useState<{movidos:number,total:number,detalhes:any[]} | null>(null);

  useEffect(() => {
    carregarTudo();
  }, []);

  async function carregarTudo() {
    setLoading(true);
    try {
      const [dash, anim, lots, alert, ins, indic, car, taref, resumoT] = await Promise.all([
        fetch(`${API}/ovino/dashboard/${IMOVEL_ID}`).then(r => r.json()),
        fetch(`${API}/ovino/animais?imovel_id=${IMOVEL_ID}&status=ativo`).then(r => r.json()),
        fetch(`${API}/ovino/lotes?imovel_id=${IMOVEL_ID}`).then(r => r.json()),
        fetch(`${API}/ovino/alertas?imovel_id=${IMOVEL_ID}&dias_proximos=14`).then(r => r.json()),
        fetch(`${API}/ovino/tarefas?imovel_id=${IMOVEL_ID}&dias_proximos=30`).then(r => r.json()),
        fetch(`${API}/ovino/tarefas/resumo/${IMOVEL_ID}`).then(r => r.json()),
      ]);
      setDashboard(dash);
      setAnimais(anim);
      setLotes(lots);
      setAlertas(alert);
      setTarefas(Array.isArray(taref) ? taref : []);
      setResumoTarefas(resumoT);
      setInsumos(Array.isArray(ins) ? ins : []);
      if (indic && indic.por_lote) setIndicadores(indic);
      setCarencias(Array.isArray(car) ? car : []);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }

  async function reclassificarRebanho(dryRun = false) {
    setReclassificando(true);
    setResultadoReclass(null);
    try {
      const r = await fetch(`${API}/ovino/animais/reclassificar?imovel_id=${IMOVEL_ID}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dry_run: dryRun }),
      });
      const data = await r.json();
      setResultadoReclass(data);
      if (!dryRun) carregarTudo();
    } catch {
      setMsg("Erro ao reclassificar.");
    }
    setReclassificando(false);
  }

  async function cadastrarAnimal() {
    if (!novoAnimal.brinco) return;
    setSalvando(true);
    try {
      const r = await fetch(`${API}/ovino/animais`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imovel_id: IMOVEL_ID, brinco: novoAnimal.brinco, sexo: novoAnimal.sexo, raca: novoAnimal.raca || null }),
      });
      if (r.ok) {
        setMsg("Animal cadastrado com sucesso!");
        setNovoAnimal({ brinco: "", sexo: "F", raca: "" });
        carregarTudo();
      } else {
        const e = await r.json();
        setMsg(e.detail || "Erro ao cadastrar.");
      }
    } catch {
      setMsg("Erro de conexão.");
    }
    setSalvando(false);
    setTimeout(() => setMsg(""), 3000);
  }

  const tipoTarefaIcon: Record<string, string> = {
    pesagem: "⚖️", vacina: "💉", vermifugacao: "🧪",
    reproducao: "❤️", operacional: "🔧", outro: "📋",
  };

  const faseLabel: Record<string, string> = {
    cria: "🐑 Cria", recria: "📈 Recria", engorda: "💪 Engorda",
    reprodução: "❤️ Reprodução", descarte: "⚠️ Descarte",
  };

  const tipoLabel: Record<string, string> = {
    vacinacao: "💉 Vacinação", vermifugacao: "🧪 Vermifugação",
    famacha: "👁️ FAMACHA", tratamento: "🏥 Tratamento",
  };

  if (loading) return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "60vh", color: "#6b7280", fontSize: 16 }}>
      Carregando módulo ovino...
    </div>
  );

  return (
    <div style={{ padding: "16px", maxWidth: 900, margin: "0 auto", fontFamily: "system-ui, sans-serif" }}>

      {/* Header */}
      <div style={{ marginBottom: 20, borderBottom: "2px solid #16a34a", paddingBottom: 12 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "#15803d", margin: 0 }}>🐑 Ovino de Corte</h1>
        <p style={{ margin: "4px 0 0", color: "#6b7280", fontSize: 13 }}>Fazenda Boa Esperança — Imóvel #{IMOVEL_ID}</p>
      </div>

      {/* KPI Cards */}
      {dashboard && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
          {[
            { label: "Rebanho Ativo", value: dashboard.rebanho.total_ativo, icon: "🐑", color: "#16a34a" },
            { label: "Matrizes", value: dashboard.rebanho.matrizes, icon: "♀️", color: "#9333ea" },
            { label: "Partos 30d", value: dashboard.partos_30d.total_partos, icon: "🍼", color: "#ea580c" },
            { label: "Alertas", value: dashboard.alertas_7d.total_alertas, icon: "⚠️", color: dashboard.alertas_7d.total_alertas > 0 ? "#dc2626" : "#16a34a" },
          ].map(k => (
            <div key={k.label} style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: "14px 16px", textAlign: "center" }}>
              <div style={{ fontSize: 24 }}>{k.icon}</div>
              <div style={{ fontSize: 26, fontWeight: 700, color: k.color }}>{k.value}</div>
              <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>{k.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Abates 30d */}
      {dashboard && dashboard.abates_30d.total_abatidos > 0 && (
        <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 10, padding: "12px 16px", marginBottom: 20, display: "flex", gap: 24 }}>
          <div><span style={{ fontWeight: 600, color: "#15803d" }}>Abates (30d): </span>{dashboard.abates_30d.total_abatidos}</div>
          {dashboard.abates_30d.media_rendimento_pct && <div><span style={{ fontWeight: 600, color: "#15803d" }}>Rendimento médio: </span>{dashboard.abates_30d.media_rendimento_pct}%</div>}
          {dashboard.abates_30d.receita_total_rs && <div><span style={{ fontWeight: 600, color: "#15803d" }}>Receita: </span>R$ {Number(dashboard.abates_30d.receita_total_rs).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</div>}
        </div>
      )}

      {/* Abas */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {(["rebanho", "lotes", "indicadores", "agenda", "sanitario", "alertas"] as const).map(a => (
          <button key={a} onClick={() => setAba(a)} style={{
            padding: "8px 18px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 600, fontSize: 14,
            background: aba === a ? "#16a34a" : "#f3f4f6", color: aba === a ? "#fff" : "#374151",
          }}>
            {a === "rebanho" ? "🐑 Rebanho" : a === "lotes" ? "📦 Lotes" : a === "indicadores" ? "📊 Indicadores" : a === "agenda" ? `📅 Agenda${tarefas.filter(t=>t.status==="pendente").length > 0 ? ` (${tarefas.filter(t=>t.status==="pendente").length})` : ""}` : a === "sanitario" ? `💉 Sanitário${carencias.length > 0 ? ` (${carencias.length}🚫)` : ""}` : `⚠️ Alertas${alertas.length > 0 ? ` (${alertas.length})` : ""}`}
          </button>
        ))}
      </div>

      {/* Aba Rebanho */}
      {aba === "rebanho" && (
        <div>
          {/* Cadastro rápido */}
          <div style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 10, padding: 16, marginBottom: 16 }}>
            <h3 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 600, color: "#374151" }}>+ Cadastrar Animal</h3>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <input placeholder="Brinco *" value={novoAnimal.brinco} onChange={e => setNovoAnimal(p => ({ ...p, brinco: e.target.value }))}
                style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 14, width: 100 }} />
              <select value={novoAnimal.sexo} onChange={e => setNovoAnimal(p => ({ ...p, sexo: e.target.value }))}
                style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 14 }}>
                <option value="F">Fêmea</option>
                <option value="M">Macho</option>
              </select>
              <input placeholder="Raça" value={novoAnimal.raca} onChange={e => setNovoAnimal(p => ({ ...p, raca: e.target.value }))}
                style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 14, width: 140 }} />
              <button onClick={cadastrarAnimal} disabled={salvando || !novoAnimal.brinco}
                style={{ padding: "8px 18px", background: "#16a34a", color: "#fff", border: "none", borderRadius: 6, fontWeight: 600, cursor: "pointer", fontSize: 14 }}>
                {salvando ? "..." : "Cadastrar"}
              </button>
              {msg && <span style={{ alignSelf: "center", fontSize: 13, color: msg.includes("sucesso") ? "#16a34a" : "#dc2626" }}>{msg}</span>}
            </div>
          </div>

          {/* Reclassificação automática */}
          <div style={{ marginBottom: 16, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <button onClick={() => reclassificarRebanho(true)} disabled={reclassificando}
              style={{ padding: "8px 16px", background: "#f3f4f6", color: "#374151", border: "1px solid #d1d5db", borderRadius: 6, fontWeight: 600, cursor: "pointer", fontSize: 13 }}>
              {reclassificando ? "..." : "🔍 Simular Classificação"}
            </button>
            <button onClick={() => reclassificarRebanho(false)} disabled={reclassificando}
              style={{ padding: "8px 16px", background: "#16a34a", color: "#fff", border: "none", borderRadius: 6, fontWeight: 600, cursor: "pointer", fontSize: 13 }}>
              {reclassificando ? "..." : "⚡ Classificar Rebanho"}
            </button>
            {resultadoReclass && (
              <span style={{ fontSize: 13, color: "#374151" }}>
                {resultadoReclass.dry_run ? "Simulação: " : ""}
                <strong>{resultadoReclass.movidos}</strong> movidos de <strong>{resultadoReclass.total}</strong> animais
              </span>
            )}
          </div>
          {resultadoReclass && resultadoReclass.detalhes.filter((d:any) => d.acao !== "sem_alteracao").length > 0 && (
            <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, padding: 12, marginBottom: 12, fontSize: 13 }}>
              <strong style={{ display: "block", marginBottom: 6, color: "#15803d" }}>
                {resultadoReclass.dry_run ? "Seria movido:" : "Movido:"}
              </strong>
              {resultadoReclass.detalhes.filter((d:any) => d.acao !== "sem_alteracao").map((d:any, i:number) => (
                <div key={i} style={{ marginBottom: 2 }}>
                  <span style={{ fontWeight: 600, color: "#15803d" }}>{d.brinco}</span>
                  {" → "}<span style={{ fontWeight: 600 }}>{d.fase}</span>
                  {d.motivo && <span style={{ color: "#6b7280" }}> ({d.motivo})</span>}
                </div>
              ))}
            </div>
          )}
          {/* Lista de animais */}
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr style={{ background: "#f3f4f6", textAlign: "left" }}>
                  {["Brinco", "Sexo", "Raça", "Lote", "Último Peso", "Data Peso", "Status"].map(h => (
                    <th key={h} style={{ padding: "10px 12px", fontWeight: 600, color: "#374151", borderBottom: "1px solid #e5e7eb" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {animais.map(a => (
                  <tr key={a.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                    <td style={{ padding: "10px 12px", fontWeight: 600, color: "#15803d" }}>{a.brinco}</td>
                    <td style={{ padding: "10px 12px" }}>{a.sexo === "F" ? "♀️ Fêmea" : "♂️ Macho"}</td>
                    <td style={{ padding: "10px 12px", color: "#6b7280" }}>{a.raca || "—"}</td>
                    <td style={{ padding: "10px 12px", color: "#6b7280" }}>{a.lote_nome || "—"}</td>
                    <td style={{ padding: "10px 12px" }}>{a.ultimo_peso ? `${a.ultimo_peso} kg` : "—"}</td>
                    <td style={{ padding: "10px 12px", color: "#6b7280", fontSize: 12 }}>{a.data_ultimo_peso ? new Date(a.data_ultimo_peso).toLocaleDateString("pt-BR") : "—"}</td>
                    <td style={{ padding: "10px 12px" }}>
                      <span style={{ padding: "2px 8px", borderRadius: 12, fontSize: 12, fontWeight: 600, background: a.status === "ativo" ? "#dcfce7" : "#fee2e2", color: a.status === "ativo" ? "#15803d" : "#dc2626" }}>
                        {a.status}
                      </span>
                    </td>
                  </tr>
                ))}
                {animais.length === 0 && (
                  <tr><td colSpan={7} style={{ padding: 24, textAlign: "center", color: "#9ca3af" }}>Nenhum animal cadastrado.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Aba Lotes */}
      {aba === "lotes" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
          {lotes.map(l => (
            <div key={l.id} style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: 16 }}>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>{l.nome}</div>
              <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 8 }}>{faseLabel[l.fase] || l.fase}</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: "#16a34a" }}>{l.total_animais}</div>
              <div style={{ fontSize: 12, color: "#9ca3af" }}>animais ativos</div>
            </div>
          ))}
          {lotes.length === 0 && <p style={{ color: "#9ca3af", gridColumn: "1/-1" }}>Nenhum lote cadastrado.</p>}
        </div>
      )}

      {/* Aba Indicadores */}
      {aba === "indicadores" && (
        <div>
          {/* Consolidado */}
          {indicadores?.consolidado && (
            <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:10, marginBottom:16 }}>
              {[
                { label:"GMD Médio", value: indicadores.consolidado.gmd_medio ? `${indicadores.consolidado.gmd_medio} kg/d` : "—", color:"#16a34a" },
                { label:"Peso Médio", value: indicadores.consolidado.peso_medio_geral ? `${indicadores.consolidado.peso_medio_geral} kg` : "—", color:"#2563eb" },
                { label:"Mortalidade", value: indicadores.consolidado.taxa_mortalidade_media ? `${indicadores.consolidado.taxa_mortalidade_media}%` : "0%", color: Number(indicadores.consolidado.taxa_mortalidade_media) > 3 ? "#dc2626" : "#16a34a" },
              ].map(k => (
                <div key={k.label} style={{ background:"#fff", border:"1px solid #e5e7eb", borderRadius:10, padding:"12px 14px", textAlign:"center" }}>
                  <div style={{ fontSize:22, fontWeight:700, color:k.color }}>{k.value}</div>
                  <div style={{ fontSize:12, color:"#6b7280", marginTop:2 }}>{k.label}</div>
                </div>
              ))}
            </div>
          )}

          {/* Tabela por lote */}
          {indicadores?.por_lote && indicadores.por_lote.length > 0 ? (
            <div style={{ overflowX:"auto" }}>
              <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
                <thead>
                  <tr style={{ background:"#f3f4f6" }}>
                    {["Lote","Fase","Animais","Peso Médio","GMD","Variação","Dias Lote","Mortalidade","Projeção 35kg"].map(h=>(
                      <th key={h} style={{ padding:"9px 10px", textAlign:"left", fontWeight:600, color:"#374151", borderBottom:"1px solid #e5e7eb", whiteSpace:"nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {indicadores.por_lote.map(l => (
                    <tr key={l.lote_id} style={{ borderBottom:"1px solid #f3f4f6" }}>
                      <td style={{ padding:"9px 10px", fontWeight:600, color:"#15803d" }}>{l.lote_nome}</td>
                      <td style={{ padding:"9px 10px" }}>
                        <span style={{ padding:"2px 8px", borderRadius:12, fontSize:11, fontWeight:600, background:"#dcfce7", color:"#15803d" }}>
                          {l.fase}
                        </span>
                      </td>
                      <td style={{ padding:"9px 10px", textAlign:"center" }}>{l.animais_ativos}</td>
                      <td style={{ padding:"9px 10px" }}>{l.peso_medio_atual ? `${l.peso_medio_atual} kg` : "—"}</td>
                      <td style={{ padding:"9px 10px" }}>
                        {l.gmd_kg_dia ? (
                          <span style={{ color: Number(l.gmd_kg_dia) >= 0.2 ? "#16a34a" : "#d97706", fontWeight:600 }}>
                            {l.gmd_kg_dia} kg/d
                          </span>
                        ) : "—"}
                      </td>
                      <td style={{ padding:"9px 10px" }}>
                        {l.variacao_peso_pct !== null ? (
                          <span style={{ color: Number(l.variacao_peso_pct) >= 0 ? "#16a34a" : "#dc2626", fontWeight:600 }}>
                            {Number(l.variacao_peso_pct) >= 0 ? "+" : ""}{l.variacao_peso_pct}%
                          </span>
                        ) : "—"}
                      </td>
                      <td style={{ padding:"9px 10px", color:"#6b7280" }}>{l.dias_medio_lote ? `${l.dias_medio_lote}d` : "—"}</td>
                      <td style={{ padding:"9px 10px" }}>
                        {l.taxa_mortalidade_pct !== null ? (
                          <span style={{ color: Number(l.taxa_mortalidade_pct) > 3 ? "#dc2626" : "#16a34a" }}>
                            {l.taxa_mortalidade_pct}%
                          </span>
                        ) : "0%"}
                      </td>
                      <td style={{ padding:"9px 10px" }}>
                        {l.dias_projecao_abate_35kg === 0 ? (
                          <span style={{ color:"#16a34a", fontWeight:700 }}>✅ Pronto</span>
                        ) : l.dias_projecao_abate_35kg ? (
                          <span style={{ color:"#2563eb" }}>{l.dias_projecao_abate_35kg}d</span>
                        ) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ textAlign:"center", padding:40, color:"#9ca3af" }}>
              Nenhum dado de pesagem disponível para calcular indicadores.<br/>
              <span style={{ fontSize:13 }}>Registre pesagens via WhatsApp ou pelo endpoint /ovino/pesagens</span>
            </div>
          )}
        </div>
      )}

      {/* Aba Agenda */}
      {aba === "agenda" && (
        <div>
          {/* Resumo KPIs */}
          {resumoTarefas && (
            <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
              {resumoTarefas.por_prioridade?.map((p: any) => (
                <div key={p.prioridade} style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, padding: "10px 14px", minWidth: 120 }}>
                  <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 4 }}>
                    {p.prioridade === "alta" ? "🔴" : p.prioridade === "media" ? "🟡" : "🟢"} {p.prioridade}
                  </div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: p.atrasadas > 0 ? "#dc2626" : "#374151" }}>
                    {p.pendentes}
                  </div>
                  {p.atrasadas > 0 && <div style={{ fontSize: 11, color: "#dc2626" }}>{p.atrasadas} atrasada(s)</div>}
                  {p.esta_semana > 0 && <div style={{ fontSize: 11, color: "#d97706" }}>{p.esta_semana} esta semana</div>}
                </div>
              ))}
            </div>
          )}

          {/* Lista de tarefas */}
          {tarefas.filter(t => t.status === "pendente").length === 0 ? (
            <div style={{ textAlign: "center", padding: 40, color: "#16a34a" }}>
              ✅ Nenhuma tarefa pendente nos próximos 30 dias.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {["alta","media","baixa"].map(prio => {
                const grupo = tarefas.filter(t => t.prioridade === prio && t.status === "pendente");
                if (!grupo.length) return null;
                const cores: Record<string,any> = {
                  alta:  {badge:"#dc2626", label:"🔴 Alta"},
                  media: {badge:"#d97706", label:"🟡 Média"},
                  baixa: {badge:"#16a34a", label:"🟢 Baixa"},
                };
                return (
                  <div key={prio}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: cores[prio].badge, marginBottom: 4, marginTop: 8 }}>
                      {cores[prio].label} ({grupo.length})
                    </div>
                    {grupo.map(t => {
                      const vencida = new Date(t.data_vencimento + "T00:00:00") < new Date();
                      return (
                        <div key={t.id} style={{
                          background: vencida ? "#fff1f2" : "#fff",
                          border: `1px solid ${vencida ? "#fecdd3" : "#e5e7eb"}`,
                          borderRadius: 8, padding: "10px 14px", marginBottom: 4,
                          display: "flex", justifyContent: "space-between", alignItems: "center"
                        }}>
                          <div>
                            <div style={{ fontWeight: 600, fontSize: 14 }}>
                              {tipoTarefaIcon[t.tipo] || "📋"} {t.titulo}
                            </div>
                            <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
                              {t.animal_brinco ? `🐑 ${t.animal_brinco}` : t.lote_nome ? `📦 ${t.lote_nome}` : "Fazenda"}
                              {t.responsavel_nome && ` • 👤 ${t.responsavel_nome}`}
                              {t.recorrencia_dias && ` • 🔄 ${t.recorrencia_dias}d`}
                            </div>
                          </div>
                          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                            <div style={{ textAlign: "right" }}>
                              <div style={{ fontSize: 13, fontWeight: 700, color: vencida ? "#dc2626" : "#374151" }}>
                                {new Date(t.data_prevista + "T00:00:00").toLocaleDateString("pt-BR")}
                              </div>
                              {vencida && <div style={{ fontSize: 11, color: "#dc2626" }}>atrasada</div>}
                            </div>
                            <button onClick={async () => {
                              await fetch(`${API}/ovino/tarefas/${t.id}/concluir?executado_por=usuario`, {method:"POST"});
                              carregarTudo();
                            }} style={{ padding:"4px 10px", background:"#16a34a", color:"#fff", border:"none", borderRadius:6, fontSize:13, cursor:"pointer", fontWeight:700 }}>
                              ✓
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Aba Sanitário */}
      {aba === "sanitario" && (
        <div>
          {/* Carências ativas */}
          {carencias.length > 0 && (
            <div style={{ background:"#fff1f2", border:"1px solid #fecdd3", borderRadius:10, padding:14, marginBottom:16 }}>
              <div style={{ fontWeight:700, color:"#dc2626", marginBottom:8 }}>🚫 Animais em carência ({carencias.length})</div>
              {carencias.map(c => (
                <div key={c.aplicacao_id} style={{ fontSize:13, marginBottom:4, display:"flex", justifyContent:"space-between" }}>
                  <span>
                    <strong>{c.animal_brinco || c.lote_nome || "Lote"}</strong> — {c.nome_comercial}
                  </span>
                  <span style={{ color:"#dc2626", fontWeight:600 }}>
                    Libera {new Date(c.data_liberacao+"T00:00:00").toLocaleDateString("pt-BR")} ({c.dias_restantes}d)
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Formulário de aplicação */}
          <div style={{ background:"#f9fafb", border:"1px solid #e5e7eb", borderRadius:10, padding:16, marginBottom:16 }}>
            <h3 style={{ margin:"0 0 12px", fontSize:14, fontWeight:600 }}>💉 Registrar Aplicação</h3>
            <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
              <select value={novaAplic.insumo_id} onChange={e => setNovaAplic(p=>({...p,insumo_id:Number(e.target.value)}))}
                style={{ padding:"8px 10px", borderRadius:6, border:"1px solid #d1d5db", fontSize:13, minWidth:160 }}>
                <option value={0}>Selecione insumo *</option>
                {["vacina","vermifugo","medicamento"].map(cat => (
                  <optgroup key={cat} label={cat.charAt(0).toUpperCase()+cat.slice(1)}>
                    {insumos.filter(i=>i.categoria===cat).map(i => (
                      <option key={i.id} value={i.id}>{i.nome_comercial}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <input placeholder="Brinco animal" value={novaAplic.animal_id}
                onChange={e=>setNovaAplic(p=>({...p,animal_id:e.target.value}))}
                style={{ padding:"8px 10px", borderRadius:6, border:"1px solid #d1d5db", fontSize:13, width:100 }} />
              <input placeholder="Dose (ml)" value={novaAplic.dose_ml}
                onChange={e=>setNovaAplic(p=>({...p,dose_ml:e.target.value}))}
                style={{ padding:"8px 10px", borderRadius:6, border:"1px solid #d1d5db", fontSize:13, width:80 }} />
              <input placeholder="Lote produto" value={novaAplic.lote_produto}
                onChange={e=>setNovaAplic(p=>({...p,lote_produto:e.target.value}))}
                style={{ padding:"8px 10px", borderRadius:6, border:"1px solid #d1d5db", fontSize:13, width:110 }} />
              <button onClick={async () => {
                if (!novaAplic.insumo_id) return;
                setSalvandoAplic(true);
                // Busca animal por brinco se informado
                let animal_id = null;
                if (novaAplic.animal_id) {
                  const ar = await fetch(`${API}/ovino/animais?imovel_id=${IMOVEL_ID}`).then(r=>r.json());
                  const found = ar.find((a:any) => a.brinco.toLowerCase() === novaAplic.animal_id.toLowerCase());
                  if (found) animal_id = found.id;
                }
                const r = await fetch(`${API}/ovino/sanitario/aplicar`, {
                  method:"POST", headers:{"Content-Type":"application/json"},
                  body: JSON.stringify({
                    imovel_id: IMOVEL_ID,
                    insumo_id: novaAplic.insumo_id,
                    animal_id,
                    dose_ml: novaAplic.dose_ml ? Number(novaAplic.dose_ml) : null,
                    lote_produto: novaAplic.lote_produto || null,
                    responsavel_nome: novaAplic.responsavel_nome || null,
                  })
                });
                const data = await r.json();
                if (r.ok) {
                  setMsgAplic(`✅ ${data.aplicacoes_criadas} aplicação(ões) registrada(s). Carência: ${data.dias_carencia}d. ${data.tarefas_reforco_criadas > 0 ? "Reforço agendado." : ""}`);
                  setNovaAplic({ insumo_id:0, animal_id:"", lote_id:"", dose_ml:"", via:"", lote_produto:"", responsavel_nome:"" });
                  carregarTudo();
                } else {
                  setMsgAplic(`❌ ${data.detail || "Erro."}`);
                }
                setSalvandoAplic(false);
                setTimeout(()=>setMsgAplic(""),5000);
              }} disabled={salvandoAplic || !novaAplic.insumo_id}
                style={{ padding:"8px 16px", background:"#16a34a", color:"#fff", border:"none", borderRadius:6, fontWeight:600, cursor:"pointer", fontSize:13 }}>
                {salvandoAplic ? "..." : "Registrar"}
              </button>
            </div>
            {msgAplic && <div style={{ marginTop:8, fontSize:13, color: msgAplic.startsWith("✅") ? "#16a34a" : "#dc2626" }}>{msgAplic}</div>}
          </div>

          {/* Lista de insumos cadastrados */}
          <div style={{ overflowX:"auto" }}>
            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
              <thead>
                <tr style={{ background:"#f3f4f6" }}>
                  {["Produto","Categoria","Princípio Ativo","Dose","Via","Carência","Reforço"].map(h=>(
                    <th key={h} style={{ padding:"8px 10px", textAlign:"left", fontWeight:600, color:"#374151", borderBottom:"1px solid #e5e7eb" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {insumos.map(i=>(
                  <tr key={i.id} style={{ borderBottom:"1px solid #f3f4f6" }}>
                    <td style={{ padding:"8px 10px", fontWeight:600 }}>{i.nome_comercial}</td>
                    <td style={{ padding:"8px 10px" }}>
                      <span style={{ padding:"2px 8px", borderRadius:12, fontSize:11, fontWeight:600,
                        background: i.categoria==="vacina"?"#dbeafe":i.categoria==="vermifugo"?"#dcfce7":"#fef3c7",
                        color: i.categoria==="vacina"?"#1d4ed8":i.categoria==="vermifugo"?"#15803d":"#92400e" }}>
                        {i.categoria}
                      </span>
                    </td>
                    <td style={{ padding:"8px 10px", color:"#6b7280" }}>{i.principio_ativo || "—"}</td>
                    <td style={{ padding:"8px 10px" }}>{i.dose_padrao_ml ? `${i.dose_padrao_ml}ml` : "—"}</td>
                    <td style={{ padding:"8px 10px", color:"#6b7280" }}>{i.via_padrao || "—"}</td>
                    <td style={{ padding:"8px 10px" }}>{i.dias_carencia > 0 ? <span style={{ color:"#dc2626", fontWeight:600 }}>{i.dias_carencia}d</span> : "Sem"}</td>
                    <td style={{ padding:"8px 10px" }}>{i.dias_reforco ? `${i.dias_reforco}d` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Aba Alertas */}
      {aba === "alertas" && (
        <div>
          {alertas.length === 0 ? (
            <div style={{ textAlign: "center", padding: 40, color: "#16a34a", fontSize: 15 }}>
              ✅ Nenhum alerta pendente nos próximos 14 dias.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {["alta","media","baixa"].map(prio => {
                const grupo = alertas.filter(a => a.prioridade === prio && a.status === "pendente");
                if (!grupo.length) return null;
                const cores: Record<string,{bg:string,border:string,badge:string,text:string}> = {
                  alta:  {bg:"#fff1f2",border:"#fecdd3",badge:"#dc2626",text:"🔴 Alta prioridade"},
                  media: {bg:"#fffbeb",border:"#fde68a",badge:"#d97706",text:"🟡 Média prioridade"},
                  baixa: {bg:"#f0fdf4",border:"#bbf7d0",badge:"#16a34a",text:"🟢 Baixa prioridade"},
                };
                const c = cores[prio];
                return (
                  <div key={prio}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: c.badge, marginBottom: 6, marginTop: 8 }}>
                      {c.text} ({grupo.length})
                    </div>
                    {grupo.map(a => (
                      <div key={a.id} style={{ background: c.bg, border: `1px solid ${c.border}`, borderRadius: 8, padding: "10px 14px", marginBottom: 6, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 14 }}>{a.titulo}</div>
                          <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
                            {a.animal_brinco ? `Animal: ${a.animal_brinco}` : a.lote_nome ? `Lote: ${a.lote_nome}` : "Rebanho"}
                            {a.origem_evento && <span style={{ marginLeft: 6, opacity: 0.6 }}>• {a.origem_evento}</span>}
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          <div style={{ textAlign: "right" }}>
                            <div style={{ fontWeight: 700, fontSize: 13, color: c.badge }}>
                              {new Date(a.data_vencimento + "T00:00:00").toLocaleDateString("pt-BR")}
                            </div>
                          </div>
                          <button onClick={async () => {
                            await fetch(`${API}/ovino/alertas/${a.id}/status?novo_status=concluido`, {method:"PATCH"});
                            carregarTudo();
                          }} style={{ padding:"4px 10px", background:"#16a34a", color:"#fff", border:"none", borderRadius:6, fontSize:12, cursor:"pointer", fontWeight:600 }}>
                            ✓
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
