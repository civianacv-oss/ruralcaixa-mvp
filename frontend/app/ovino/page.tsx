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

type Piquete = {
  piquete_id: number;
  piquete_nome: string;
  area_ha: number;
  forrageira: string | null;
  status: string;
  lote_nome: string | null;
  dias_ocupacao_atual: number | null;
  dias_ocupacao_padrao: number;
  dias_descanso_padrao: number;
  animais_no_piquete: number;
  ua_atual: number;
  capacidade_total_ua: number;
  pressao_pct: number | null;
  data_saida_prevista: string | null;
  data_liberacao_descanso: string | null;
  dias_para_liberar: number | null;
};

type MorteEvento = {
  id: number;
  brinco: string;
  data_morte: string;
  causa_categoria: string;
  causa_subcategoria: string | null;
  diagnostico: string | null;
  faixa_etaria: string;
  lote_nome: string | null;
};

type RacaoLote = {
  lote_nome: string;
  fase: string;
  fase_racao: string;
  animais: number;
  peso_medio: number | null;
  pct_ms_usado: number;
  ms_dia: number;
  racao_dia_kg: number;
  racao_7d_kg: number;
  racao_15d_kg: number;
  racao_30d_kg: number;
  custo_dia_rs: number | null;
  custo_30d_rs: number | null;
};

type RacaoPrevisao = {
  config: { pct_ms_racao: number; perda_cocho_pct: number; preco_racao_kg: number | null; estoque_atual_kg: number | null; margem_seguranca_dias: number };
  por_lote: RacaoLote[];
  totais: { animais_com_peso: number; animais_sem_peso: number; racao_dia_kg: number; racao_7d_kg: number; racao_15d_kg: number; racao_30d_kg: number; custo_dia_rs: number | null; custo_30d_rs: number | null; dias_estoque_restante: number | null };
  alerta_estoque: { severidade: string; mensagem: string; repor_kg: number; custo_reposicao_rs: number | null } | null;
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
  const [aba, setAba] = useState<"rebanho" | "lotes" | "indicadores" | "racao" | "mortalidade" | "pastagem" | "agenda" | "sanitario" | "alertas">("rebanho");
  const [loading, setLoading] = useState(true);
  const [filtroStatus, setFiltroStatus] = useState("ativo");
  const [novoAnimal, setNovoAnimal] = useState({ brinco: "", sexo: "F", raca: "" });
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState("");
  const [reclassificando, setReclassificando] = useState(false);
  const [insumos, setInsumos] = useState<Insumo[]>([]);
  const [racao, setRacao] = useState<RacaoPrevisao | null>(null);
  const [mortes, setMortes] = useState<MorteEvento[]>([]);
  const [piquetes, setPiquetes] = useState<Piquete[]>([]);
  const [alertasPastagem, setAlertasPastagem] = useState<any[]>([]);
  const [novoPiquete, setNovoPiquete] = useState({ nome: "", area_ha: "", forrageira: "", capacidade_suporte_ua_ha: "5", dias_ocupacao_padrao: "7", dias_descanso_padrao: "28" });
  const [salvandoPiquete, setSalvandoPiquete] = useState(false);
  const [msgPiquete, setMsgPiquete] = useState("");
  const [indicMortalidade, setIndicMortalidade] = useState<any>(null);
  const [novaMorte, setNovaMorte] = useState({ brinco: "", causa_categoria: "doenca", causa_subcategoria: "", observacoes: "" });
  const [salvandoMorte, setSalvandoMorte] = useState(false);
  const [msgMorte, setMsgMorte] = useState("");
  const [precoRacao, setPrecoRacao] = useState("");
  const [estoqueRacao, setEstoqueRacao] = useState("");
  const [salvandoRacao, setSalvandoRacao] = useState(false);
  const [indicadores, setIndicadores] = useState<{consolidado:any, por_lote:IndicadorLote[]} | null>(null);
  const [carencias, setCarencias] = useState<Carencia[]>([]);
  const [novaAplic, setNovaAplic] = useState({ insumo_id: 0, animal_id: "", lote_id: "", dose_ml: "", via: "", lote_produto: "", responsavel_nome: "" });
  const [salvandoAplic, setSalvandoAplic] = useState(false);
  const [msgAplic, setMsgAplic] = useState("");
  const [resultadoReclass, setResultadoReclass] = useState<{dry_run:boolean,movidos:number,total:number,detalhes:any[]} | null>(null);

  useEffect(() => {
    carregarTudo();
  }, []);

  async function carregarTudo() {
    setLoading(true);
    try {
      const [dash, anim, lots, alert, ins, indic, rac, mort, pastAlertas, indicMort, car, taref, resumoT] = await Promise.all([
        fetch(`${API}/ovino/dashboard/${IMOVEL_ID}`).then(r => r.json()),
        fetch(`${API}/ovino/animais?imovel_id=${IMOVEL_ID}&status=ativo`).then(r => r.json()),
        fetch(`${API}/ovino/lotes?imovel_id=${IMOVEL_ID}`).then(r => r.json()),
        fetch(`${API}/ovino/alertas?imovel_id=${IMOVEL_ID}&dias_proximos=14`).then(r => r.json()),
        fetch(`${API}/ovino/sanitario/insumos`).then(r => r.json()).catch(() => []),
        fetch(`${API}/ovino/indicadores/${IMOVEL_ID}`).then(r => r.json()).catch(() => null),
        fetch(`${API}/ovino/racao/previsao/${IMOVEL_ID}`).then(r => r.json()).catch(() => null),
        fetch(`${API}/ovino/mortalidade/${IMOVEL_ID}?dias=90`).then(r => r.json()).catch(() => []),
        fetch(`${API}/ovino/pastagem/alertas/${IMOVEL_ID}`).then(r => r.json()).catch(() => null),
        fetch(`${API}/ovino/mortalidade/indicadores/${IMOVEL_ID}`).then(r => r.json()).catch(() => null),
        fetch(`${API}/ovino/sanitario/carencias?imovel_id=${IMOVEL_ID}`).then(r => r.json()).catch(() => []),
        fetch(`${API}/ovino/tarefas?imovel_id=${IMOVEL_ID}&dias_proximos=30`).then(r => r.json()).catch(() => []),
        fetch(`${API}/ovino/tarefas/resumo/${IMOVEL_ID}`).then(r => r.json()).catch(() => null),
      ]);
      setDashboard(dash);
      setAnimais(anim);
      setLotes(lots);
      setAlertas(alert);
      setTarefas(Array.isArray(taref) ? taref : []);
      setResumoTarefas(resumoT);
      setInsumos(Array.isArray(ins) ? ins : []);
      if (indic && indic.por_lote) setIndicadores(indic);
      if (rac && rac.totais) setRacao(rac);
      setMortes(Array.isArray(mort) ? mort : []);
      if (pastAlertas) { setPiquetes(pastAlertas.piquetes || []); setAlertasPastagem(pastAlertas.alertas || []); }
      if (indicMort) setIndicMortalidade(indicMort);
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
        {(["rebanho", "lotes", "indicadores", "racao", "mortalidade", "pastagem", "agenda", "sanitario", "alertas"] as const).map(a => (
          <button key={a} onClick={() => setAba(a)} style={{
            padding: "8px 18px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 600, fontSize: 14,
            background: aba === a ? "#16a34a" : "#f3f4f6", color: aba === a ? "#fff" : "#374151",
          }}>
            {a === "rebanho" ? "🐑 Rebanho" : a === "lotes" ? "📦 Lotes" : a === "indicadores" ? "📊 Indicadores" : a === "racao" ? `🌾 Ração${racao?.alerta_estoque ? " ⚠️" : ""}` : a === "mortalidade" ? `💀 Mortalidade${mortes.length > 0 ? ` (${mortes.length})` : ""}` : a === "pastagem" ? `🌿 Pastagem${alertasPastagem.filter(a=>a.severidade==="alta").length > 0 ? " ⚠️" : ""}` : a === "agenda" ? `📅 Agenda${tarefas.filter(t=>t.status==="pendente").length > 0 ? ` (${tarefas.filter(t=>t.status==="pendente").length})` : ""}` : a === "sanitario" ? `💉 Sanitário${carencias.length > 0 ? ` (${carencias.length}🚫)` : ""}` : `⚠️ Alertas${alertas.length > 0 ? ` (${alertas.length})` : ""}`}
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

      {/* Aba Pastagem */}
      {aba === "pastagem" && (
        <div>
          {/* Alertas */}
          {alertasPastagem.filter(a=>a.severidade==="alta").length > 0 && (
            <div style={{ background:"#fff1f2", border:"1px solid #fecdd3", borderRadius:10, padding:"12px 16px", marginBottom:16 }}>
              <div style={{ fontWeight:700, color:"#dc2626", marginBottom:8 }}>🚨 Alertas de pastagem</div>
              {alertasPastagem.filter(a=>a.severidade==="alta").map((a:any,i:number) => (
                <div key={i} style={{ fontSize:13, marginBottom:4 }}>
                  <strong>{a.piquete}:</strong> {a.mensagem}
                </div>
              ))}
            </div>
          )}

          {/* Cadastrar piquete */}
          <div style={{ background:"#f9fafb", border:"1px solid #e5e7eb", borderRadius:10, padding:14, marginBottom:16 }}>
            <div style={{ fontWeight:600, fontSize:14, marginBottom:10 }}>+ Cadastrar Piquete</div>
            <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
              <input placeholder="Nome *" value={novoPiquete.nome} onChange={e=>setNovoPiquete(p=>({...p,nome:e.target.value}))}
                style={{ padding:"7px 10px", borderRadius:6, border:"1px solid #d1d5db", fontSize:13, width:120 }} />
              <input placeholder="Área (ha) *" type="number" step="0.1" value={novoPiquete.area_ha} onChange={e=>setNovoPiquete(p=>({...p,area_ha:e.target.value}))}
                style={{ padding:"7px 10px", borderRadius:6, border:"1px solid #d1d5db", fontSize:13, width:100 }} />
              <input placeholder="Forrageira" value={novoPiquete.forrageira} onChange={e=>setNovoPiquete(p=>({...p,forrageira:e.target.value}))}
                style={{ padding:"7px 10px", borderRadius:6, border:"1px solid #d1d5db", fontSize:13, width:120 }} />
              <input placeholder="UA/ha" type="number" step="0.5" value={novoPiquete.capacidade_suporte_ua_ha} onChange={e=>setNovoPiquete(p=>({...p,capacidade_suporte_ua_ha:e.target.value}))}
                style={{ padding:"7px 10px", borderRadius:6, border:"1px solid #d1d5db", fontSize:13, width:80 }} />
              <input placeholder="Dias ocup." type="number" value={novoPiquete.dias_ocupacao_padrao} onChange={e=>setNovoPiquete(p=>({...p,dias_ocupacao_padrao:e.target.value}))}
                style={{ padding:"7px 10px", borderRadius:6, border:"1px solid #d1d5db", fontSize:13, width:80 }} />
              <input placeholder="Dias desc." type="number" value={novoPiquete.dias_descanso_padrao} onChange={e=>setNovoPiquete(p=>({...p,dias_descanso_padrao:e.target.value}))}
                style={{ padding:"7px 10px", borderRadius:6, border:"1px solid #d1d5db", fontSize:13, width:80 }} />
              <button onClick={async () => {
                if (!novoPiquete.nome || !novoPiquete.area_ha) return;
                setSalvandoPiquete(true);
                const r = await fetch(`${API}/ovino/pastagem/piquetes`, {
                  method:"POST", headers:{"Content-Type":"application/json"},
                  body: JSON.stringify({ imovel_id: IMOVEL_ID, nome: novoPiquete.nome,
                    area_ha: Number(novoPiquete.area_ha), forrageira: novoPiquete.forrageira || null,
                    capacidade_suporte_ua_ha: Number(novoPiquete.capacidade_suporte_ua_ha),
                    dias_ocupacao_padrao: Number(novoPiquete.dias_ocupacao_padrao),
                    dias_descanso_padrao: Number(novoPiquete.dias_descanso_padrao) })
                });
                const data = await r.json();
                if (r.ok) { setMsgPiquete(`✅ Piquete "${data.nome}" cadastrado`); setNovoPiquete({nome:"",area_ha:"",forrageira:"",capacidade_suporte_ua_ha:"5",dias_ocupacao_padrao:"7",dias_descanso_padrao:"28"}); carregarTudo(); }
                else { setMsgPiquete(`❌ ${data.detail || "Erro."}`); }
                setSalvandoPiquete(false); setTimeout(()=>setMsgPiquete(""),4000);
              }} disabled={salvandoPiquete || !novoPiquete.nome || !novoPiquete.area_ha}
                style={{ padding:"7px 16px", background:"#16a34a", color:"#fff", border:"none", borderRadius:6, fontWeight:600, cursor:"pointer", fontSize:13 }}>
                {salvandoPiquete ? "..." : "Cadastrar"}
              </button>
            </div>
            {msgPiquete && <div style={{ marginTop:8, fontSize:13, color:msgPiquete.startsWith("✅")?"#16a34a":"#dc2626" }}>{msgPiquete}</div>}
          </div>

          {/* Cards de piquetes */}
          {piquetes.length === 0 ? (
            <div style={{ textAlign:"center", padding:40, color:"#9ca3af" }}>
              Nenhum piquete cadastrado.<br/><span style={{ fontSize:13 }}>Cadastre os piquetes da fazenda para controlar a rotação.</span>
            </div>
          ) : (
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))", gap:12 }}>
              {piquetes.map(p => {
                const pressao = Number(p.pressao_pct || 0);
                const statusCor: Record<string,string> = { ocupado:"#16a34a", descanso:"#d97706", recuperacao:"#dc2626", disponivel:"#6b7280", inativo:"#9ca3af" };
                const corStatus = statusCor[p.status] || "#6b7280";
                return (
                  <div key={p.piquete_id} style={{ background:"#fff", border:`1px solid ${pressao>110?"#fecdd3":"#e5e7eb"}`, borderRadius:10, padding:14 }}>
                    <div style={{ display:"flex", justifyContent:"space-between", marginBottom:8 }}>
                      <div style={{ fontWeight:700, fontSize:15 }}>{p.piquete_nome}</div>
                      <span style={{ padding:"2px 8px", borderRadius:12, fontSize:11, fontWeight:600, background:`${corStatus}22`, color:corStatus }}>{p.status}</span>
                    </div>
                    <div style={{ fontSize:12, color:"#6b7280", marginBottom:8 }}>
                      {p.area_ha} ha {p.forrageira && `· ${p.forrageira}`}
                    </div>
                    {p.status === "ocupado" && (
                      <div style={{ marginBottom:8 }}>
                        <div style={{ fontSize:13, marginBottom:4 }}>🐑 {p.lote_nome} · {p.animais_no_piquete} animais · {p.ua_atual} UA</div>
                        <div style={{ fontSize:12, color:"#6b7280", marginBottom:4 }}>Dia {p.dias_ocupacao_atual || 0} de {p.dias_ocupacao_padrao}</div>
                        <div style={{ background:"#f3f4f6", borderRadius:4, height:8, overflow:"hidden" }}>
                          <div style={{ height:"100%", width:`${Math.min(pressao,100)}%`, background:pressao>100?"#dc2626":pressao>80?"#d97706":"#16a34a", transition:"width 0.3s" }} />
                        </div>
                        <div style={{ fontSize:11, color:pressao>100?"#dc2626":pressao>80?"#d97706":"#16a34a", marginTop:2 }}>{pressao}% da capacidade</div>
                      </div>
                    )}
                    {p.status === "descanso" && p.dias_para_liberar !== null && (
                      <div style={{ fontSize:13, color:"#d97706" }}>
                        {p.dias_para_liberar <= 0 ? "✅ Pronto para reocupar" : `⏳ Libera em ${p.dias_para_liberar} dia(s)`}
                      </div>
                    )}
                    {p.status === "disponivel" && (
                      <div style={{ fontSize:13, color:"#16a34a" }}>✅ Disponível para uso</div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Alertas médios */}
          {alertasPastagem.filter(a=>a.severidade==="media").length > 0 && (
            <div style={{ marginTop:16 }}>
              <div style={{ fontWeight:600, fontSize:13, color:"#d97706", marginBottom:8 }}>🟡 Alertas médios</div>
              {alertasPastagem.filter(a=>a.severidade==="media").map((a:any,i:number) => (
                <div key={i} style={{ background:"#fffbeb", border:"1px solid #fde68a", borderRadius:8, padding:"8px 12px", marginBottom:6, fontSize:13 }}>
                  <strong>{a.piquete}:</strong> {a.mensagem}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Aba Mortalidade */}
      {aba === "mortalidade" && (
        <div>
          {/* Alertas de taxa alta */}
          {indicMortalidade?.alertas_taxa?.length > 0 && (
            <div style={{ background:"#fff1f2", border:"1px solid #fecdd3", borderRadius:10, padding:"12px 16px", marginBottom:16 }}>
              <div style={{ fontWeight:700, color:"#dc2626", marginBottom:8 }}>🚨 Alertas de mortalidade</div>
              {indicMortalidade.alertas_taxa.map((a:any, i:number) => (
                <div key={i} style={{ fontSize:13, marginBottom:4 }}>
                  <strong>{a.lote_nome}</strong>: {a.taxa}% em 30 dias ({a.mortes_30d} mortes)
                </div>
              ))}
            </div>
          )}

          {/* KPIs por causa */}
          {indicMortalidade?.por_causa?.length > 0 && (
            <div style={{ marginBottom:16 }}>
              <div style={{ fontWeight:600, fontSize:14, marginBottom:8 }}>Por causa (90 dias)</div>
              <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                {indicMortalidade.por_causa.map((c:any, i:number) => (
                  <div key={i} style={{ background:"#fff", border:"1px solid #e5e7eb", borderRadius:8, padding:"10px 14px", minWidth:120 }}>
                    <div style={{ fontSize:20, fontWeight:700, color:"#dc2626" }}>{c.total}</div>
                    <div style={{ fontSize:12, color:"#374151" }}>{c.causa_categoria}</div>
                    {c.causa_subcategoria && <div style={{ fontSize:11, color:"#9ca3af" }}>{c.causa_subcategoria}</div>}
                    <div style={{ fontSize:11, color:"#d97706", marginTop:2 }}>{c.ultimos_30d} nos últimos 30d</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Registrar morte */}
          <div style={{ background:"#f9fafb", border:"1px solid #e5e7eb", borderRadius:10, padding:14, marginBottom:16 }}>
            <div style={{ fontWeight:600, fontSize:14, marginBottom:10 }}>+ Registrar Morte</div>
            <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
              <input placeholder="Brinco *" value={novaMorte.brinco}
                onChange={e=>setNovaMorte(p=>({...p,brinco:e.target.value}))}
                style={{ padding:"7px 10px", borderRadius:6, border:"1px solid #d1d5db", fontSize:13, width:100 }} />
              <select value={novaMorte.causa_categoria}
                onChange={e=>setNovaMorte(p=>({...p,causa_categoria:e.target.value}))}
                style={{ padding:"7px 10px", borderRadius:6, border:"1px solid #d1d5db", fontSize:13 }}>
                {["doenca","acidente","predador","neonatal","descarte_sanitario","causa_desconhecida","outro"].map(c=>(
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              <input placeholder="Subcategoria" value={novaMorte.causa_subcategoria}
                onChange={e=>setNovaMorte(p=>({...p,causa_subcategoria:e.target.value}))}
                style={{ padding:"7px 10px", borderRadius:6, border:"1px solid #d1d5db", fontSize:13, width:130 }} />
              <input placeholder="Observações" value={novaMorte.observacoes}
                onChange={e=>setNovaMorte(p=>({...p,observacoes:e.target.value}))}
                style={{ padding:"7px 10px", borderRadius:6, border:"1px solid #d1d5db", fontSize:13, width:180 }} />
              <button onClick={async () => {
                if (!novaMorte.brinco) return;
                setSalvandoMorte(true);
                const ar = await fetch(`${API}/ovino/animais?imovel_id=${IMOVEL_ID}`).then(r=>r.json());
                const found = ar.find((a:any) => a.brinco.toLowerCase() === novaMorte.brinco.toLowerCase());
                if (!found) { setMsgMorte("Animal não encontrado."); setSalvandoMorte(false); return; }
                const r = await fetch(`${API}/ovino/mortalidade`, {
                  method:"POST", headers:{"Content-Type":"application/json"},
                  body: JSON.stringify({
                    imovel_id: IMOVEL_ID, animal_id: found.id,
                    causa_categoria: novaMorte.causa_categoria,
                    causa_subcategoria: novaMorte.causa_subcategoria || null,
                    observacoes: novaMorte.observacoes || null,
                    origem: "dashboard",
                  })
                });
                const data = await r.json();
                if (r.ok) {
                  setMsgMorte(`✅ Morte registrada — ${data.brinco}, ${data.faixa_etaria}${data.alerta_cluster ? " | " + data.alerta_cluster.mensagem : ""}`);
                  setNovaMorte({ brinco:"", causa_categoria:"doenca", causa_subcategoria:"", observacoes:"" });
                  carregarTudo();
                } else { setMsgMorte(`❌ ${data.detail || "Erro."}`); }
                setSalvandoMorte(false);
                setTimeout(()=>setMsgMorte(""),6000);
              }} disabled={salvandoMorte || !novaMorte.brinco}
                style={{ padding:"7px 16px", background:"#dc2626", color:"#fff", border:"none", borderRadius:6, fontWeight:600, cursor:"pointer", fontSize:13 }}>
                {salvandoMorte ? "..." : "Registrar"}
              </button>
            </div>
            {msgMorte && <div style={{ marginTop:8, fontSize:13, color: msgMorte.startsWith("✅") ? "#16a34a" : "#dc2626" }}>{msgMorte}</div>}
          </div>

          {/* Histórico */}
          {mortes.length === 0 ? (
            <div style={{ textAlign:"center", padding:30, color:"#9ca3af" }}>Nenhuma morte registrada nos últimos 90 dias.</div>
          ) : (
            <div style={{ overflowX:"auto" }}>
              <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
                <thead>
                  <tr style={{ background:"#f3f4f6" }}>
                    {["Brinco","Data","Causa","Subcausa","Faixa","Lote"].map(h=>(
                      <th key={h} style={{ padding:"8px 10px", textAlign:"left", fontWeight:600, color:"#374151", borderBottom:"1px solid #e5e7eb" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {mortes.map(m => (
                    <tr key={m.id} style={{ borderBottom:"1px solid #f3f4f6" }}>
                      <td style={{ padding:"8px 10px", fontWeight:600, color:"#dc2626" }}>{m.brinco}</td>
                      <td style={{ padding:"8px 10px", color:"#6b7280" }}>{new Date(m.data_morte+"T00:00:00").toLocaleDateString("pt-BR")}</td>
                      <td style={{ padding:"8px 10px" }}>{m.causa_categoria}</td>
                      <td style={{ padding:"8px 10px", color:"#6b7280" }}>{m.causa_subcategoria || "—"}</td>
                      <td style={{ padding:"8px 10px" }}>
                        <span style={{ padding:"2px 8px", borderRadius:12, fontSize:11, fontWeight:600,
                          background: m.faixa_etaria==="neonatal"?"#fef3c7":m.faixa_etaria==="jovem"?"#dbeafe":"#f3f4f6",
                          color: m.faixa_etaria==="neonatal"?"#92400e":m.faixa_etaria==="jovem"?"#1d4ed8":"#374151" }}>
                          {m.faixa_etaria}
                        </span>
                      </td>
                      <td style={{ padding:"8px 10px", color:"#6b7280" }}>{m.lote_nome || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Aba Ração */}
      {aba === "racao" && (
        <div>
          {/* Alerta de estoque */}
          {racao?.alerta_estoque && (
            <div style={{ background: racao.alerta_estoque.severidade === "alta" ? "#fff1f2" : "#fffbeb", border: `1px solid ${racao.alerta_estoque.severidade === "alta" ? "#fecdd3" : "#fde68a"}`, borderRadius:10, padding:"12px 16px", marginBottom:16 }}>
              <div style={{ fontWeight:700, color: racao.alerta_estoque.severidade === "alta" ? "#dc2626" : "#d97706" }}>
                ⚠️ {racao.alerta_estoque.mensagem}
              </div>
              <div style={{ fontSize:13, marginTop:4, color:"#374151" }}>
                Repor: <strong>{racao.alerta_estoque.repor_kg} kg</strong>
                {racao.alerta_estoque.custo_reposicao_rs && ` — R$ ${racao.alerta_estoque.custo_reposicao_rs.toLocaleString("pt-BR", {minimumFractionDigits:2})}`}
              </div>
            </div>
          )}

          {/* KPIs totais */}
          {racao?.totais && (
            <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10, marginBottom:16 }}>
              {[
                { label:"Ração/dia", value:`${racao.totais.racao_dia_kg} kg`, color:"#16a34a" },
                { label:"Ração 7 dias", value:`${racao.totais.racao_7d_kg} kg`, color:"#2563eb" },
                { label:"Ração 30 dias", value:`${racao.totais.racao_30d_kg} kg`, color:"#7c3aed" },
                { label:"Estoque", value: racao.totais.dias_estoque_restante ? `${racao.totais.dias_estoque_restante}d` : "—", color: racao.totais.dias_estoque_restante && racao.totais.dias_estoque_restante <= 7 ? "#dc2626" : "#16a34a" },
              ].map(k => (
                <div key={k.label} style={{ background:"#fff", border:"1px solid #e5e7eb", borderRadius:10, padding:"12px 14px", textAlign:"center" }}>
                  <div style={{ fontSize:20, fontWeight:700, color:k.color }}>{k.value}</div>
                  <div style={{ fontSize:12, color:"#6b7280", marginTop:2 }}>{k.label}</div>
                </div>
              ))}
            </div>
          )}

          {/* Configuração rápida */}
          <div style={{ background:"#f9fafb", border:"1px solid #e5e7eb", borderRadius:10, padding:14, marginBottom:16 }}>
            <div style={{ fontWeight:600, fontSize:14, marginBottom:10 }}>⚙️ Configuração</div>
            <div style={{ display:"flex", gap:8, flexWrap:"wrap", alignItems:"center" }}>
              <input placeholder="Preço ração (R$/kg)" value={precoRacao}
                onChange={e=>setPrecoRacao(e.target.value)} type="number" step="0.01"
                style={{ padding:"7px 10px", borderRadius:6, border:"1px solid #d1d5db", fontSize:13, width:160 }} />
              <input placeholder="Estoque atual (kg)" value={estoqueRacao}
                onChange={e=>setEstoqueRacao(e.target.value)} type="number"
                style={{ padding:"7px 10px", borderRadius:6, border:"1px solid #d1d5db", fontSize:13, width:150 }} />
              <button onClick={async () => {
                setSalvandoRacao(true);
                const body: any = {};
                if (precoRacao) body.preco_racao_kg = Number(precoRacao);
                if (estoqueRacao) body.estoque_atual_kg = Number(estoqueRacao);
                await fetch(`${API}/ovino/racao/config/${IMOVEL_ID}`, {
                  method:"PATCH", headers:{"Content-Type":"application/json"},
                  body: JSON.stringify(body)
                });
                setPrecoRacao(""); setEstoqueRacao("");
                setSalvandoRacao(false);
                carregarTudo();
              }} disabled={salvandoRacao || (!precoRacao && !estoqueRacao)}
                style={{ padding:"7px 16px", background:"#16a34a", color:"#fff", border:"none", borderRadius:6, fontWeight:600, cursor:"pointer", fontSize:13 }}>
                {salvandoRacao ? "..." : "Salvar"}
              </button>
              {racao?.config.preco_racao_kg && <span style={{ fontSize:12, color:"#6b7280" }}>Preço atual: R$ {racao.config.preco_racao_kg}/kg</span>}
            </div>
          </div>

          {/* Tabela por lote */}
          {racao?.por_lote && racao.por_lote.length > 0 ? (
            <div style={{ overflowX:"auto" }}>
              <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
                <thead>
                  <tr style={{ background:"#f3f4f6" }}>
                    {["Lote","Fase","Animais","Peso Médio","MS %PV","Ração/dia","7 dias","15 dias","30 dias","Custo/mês"].map(h=>(
                      <th key={h} style={{ padding:"9px 10px", textAlign:"left", fontWeight:600, color:"#374151", borderBottom:"1px solid #e5e7eb", whiteSpace:"nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {racao.por_lote.map((l,i) => (
                    <tr key={i} style={{ borderBottom:"1px solid #f3f4f6" }}>
                      <td style={{ padding:"9px 10px", fontWeight:600, color:"#15803d" }}>{l.lote_nome}</td>
                      <td style={{ padding:"9px 10px", fontSize:12, color:"#6b7280" }}>{l.fase_racao}</td>
                      <td style={{ padding:"9px 10px", textAlign:"center" }}>{l.animais}</td>
                      <td style={{ padding:"9px 10px" }}>{l.peso_medio ? `${l.peso_medio} kg` : "—"}</td>
                      <td style={{ padding:"9px 10px", color:"#6b7280" }}>{l.pct_ms_usado}%</td>
                      <td style={{ padding:"9px 10px", fontWeight:600, color:"#15803d" }}>{l.racao_dia_kg} kg</td>
                      <td style={{ padding:"9px 10px" }}>{l.racao_7d_kg} kg</td>
                      <td style={{ padding:"9px 10px" }}>{l.racao_15d_kg} kg</td>
                      <td style={{ padding:"9px 10px", fontWeight:600 }}>{l.racao_30d_kg} kg</td>
                      <td style={{ padding:"9px 10px", color: l.custo_30d_rs ? "#374151" : "#9ca3af" }}>
                        {l.custo_30d_rs ? `R$ ${l.custo_30d_rs.toLocaleString("pt-BR",{minimumFractionDigits:2})}` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {racao.totais.animais_sem_peso > 0 && (
                <div style={{ fontSize:12, color:"#9ca3af", marginTop:8 }}>
                  ⚠️ {racao.totais.animais_sem_peso} animal(is) sem pesagem — não incluído(s) no cálculo
                </div>
              )}
            </div>
          ) : (
            <div style={{ textAlign:"center", padding:40, color:"#9ca3af" }}>
              Nenhum animal com peso cadastrado.<br/>
              <span style={{ fontSize:13 }}>Registre pesagens para calcular a demanda de ração.</span>
            </div>
          )}
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

