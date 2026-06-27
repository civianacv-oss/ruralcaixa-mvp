"use client";
import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api";

const API = process.env.NEXT_PUBLIC_API_URL || "https://ruralcaixa-mvp-production.up.railway.app";

type Origem = "comprado" | "proprio" | "doacao";
type Modo = "automatico" | "manual";

interface Insumo {
  id: number;
  nome: string;
  categoria: string;
  unidade: string;
  origem: Origem;
  estoque_atual: number;
  estoque_minimo: number;
  estoque_ideal: number;
  preco_estimado: number | null;
  fornecedor_id: number | null;
  fornecedor_nome: string | null;
  reposicao_modo: Modo;
  lead_time_dias: number;
  status_estoque?: string;
}

interface Fornecedor { id: number; nome: string; whatsapp: string | null; }

const CATEGORIAS = [
  "sementes","adubos","defensivos","racao","sal_mineral",
  "vacinas","medicamentos","combustivel","pecas_maquinas","silagem","feno","outros"
];
const UNIDADES = ["kg","saco","litro","unidade","fardo","dose","hora_maquina","m3"];
const CAT_LABEL: Record<string,string> = {
  sementes:"🌱 Sementes", adubos:"🧪 Adubos", defensivos:"🛡️ Defensivos",
  racao:"🌾 Ração", sal_mineral:"🧂 Sal Mineral", vacinas:"💉 Vacinas",
  medicamentos:"💊 Medicamentos", combustivel:"⛽ Combustível",
  pecas_maquinas:"🔧 Peças/Máquinas", silagem:"🌿 Silagem",
  feno:"🌾 Feno", outros:"📦 Outros",
};
const STATUS_COLOR: Record<string,string> = {
  critico:"#8a2a2a", baixo:"#7a5a00", atencao:"#5a5a00", ok:"#2a5a2a"
};
const STATUS_BG: Record<string,string> = {
  critico:"#fce8e8", baixo:"#fff8e1", atencao:"#fffff0", ok:"#e8f5e8"
};
const STATUS_LABEL: Record<string,string> = {
  critico:"🔴 Crítico", baixo:"🟡 Baixo", atencao:"🟠 Atenção", ok:"🟢 OK"
};

const green = "#2a5a2a";

const INP: React.CSSProperties = {
  width:"100%", padding:"9px 12px", borderRadius:8,
  border:"1.5px solid #d8d0c0", fontSize:13,
  background:"#faf8f4", color:"#1a2e1a", boxSizing:"border-box",
};

const emptyForm = {
  nome:"", categoria:"outros", unidade:"saco", origem:"comprado" as Origem,
  estoque_atual:0, estoque_minimo:0, estoque_ideal:0,
  preco_estimado:"", fornecedor_id:"", reposicao_modo:"manual" as Modo, lead_time_dias:7,
};

export default function InsumosPage() {
  const [insumos, setInsumos]         = useState<Insumo[]>([]);
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  const [alertas, setAlertas]         = useState<Insumo[]>([]);
  const [loading, setLoading]         = useState(true);
  const [modal, setModal]             = useState(false);
  const [modalMov, setModalMov]       = useState<Insumo | null>(null);
  const [form, setForm]               = useState(emptyForm);
  const [movForm, setMovForm]         = useState({ tipo:"uso", quantidade:"", observacao:"" });
  const [salvando, setSalvando]       = useState(false);
  const [filtro, setFiltro]           = useState("todos");
  const [busca, setBusca]             = useState("");

  useEffect(() => { carregar(); }, []);

  async function carregar() {
    setLoading(true);
    const [ins, forn, al] = await Promise.all([
      apiFetch(`${API}/insumos/`).then(r => r.json()).catch(() => ({ data: [] })),
      apiFetch(`${API}/fornecedores/`).then(r => r.json()).catch(() => ({ data: [] })),
      apiFetch(`${API}/insumos/alertas`).then(r => r.json()).catch(() => ({ data: [] })),
    ]);
    setInsumos(ins.data || []);
    setFornecedores(forn.data || []);
    setAlertas(al.data || []);
    setLoading(false);
  }

  async function salvarInsumo() {
    setSalvando(true);
    await apiFetch(`${API}/insumos/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        preco_estimado: form.preco_estimado ? parseFloat(String(form.preco_estimado)) : null,
        fornecedor_id: form.fornecedor_id ? parseInt(String(form.fornecedor_id)) : null,
      }),
    });
    setSalvando(false);
    setModal(false);
    setForm(emptyForm);
    carregar();
  }

  async function salvarMovimentacao() {
    if (!modalMov) return;
    setSalvando(true);
    await apiFetch(`${API}/insumos/${modalMov.id}/movimentar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tipo: movForm.tipo,
        quantidade: parseFloat(movForm.quantidade),
        observacao: movForm.observacao || null,
      }),
    });
    setSalvando(false);
    setModalMov(null);
    setMovForm({ tipo:"uso", quantidade:"", observacao:"" });
    carregar();
  }

  const insumosFiltrados = insumos.filter(i => {
    if (filtro !== "todos" && i.status_estoque !== filtro) return false;
    if (busca && !i.nome.toLowerCase().includes(busca.toLowerCase())) return false;
    return true;
  });

  const s = {
    page: { maxWidth:900, margin:"0 auto", padding:"24px 16px" } as React.CSSProperties,
    header: { display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 } as React.CSSProperties,
    h1: { fontSize:20, fontWeight:700, color:"#1a2e1a" } as React.CSSProperties,
    btnPrimary: { padding:"9px 18px", borderRadius:10, border:"none", background:green, color:"#fff", fontSize:13, fontWeight:600, cursor:"pointer" } as React.CSSProperties,
    card: { background:"#fff", border:"1px solid #e8e0d0", borderRadius:12, padding:"14px 16px", marginBottom:10 } as React.CSSProperties,
    alertCard: (status: string): React.CSSProperties => ({
      background: STATUS_BG[status] || "#fff", border:`1px solid ${STATUS_COLOR[status]}44`,
      borderRadius:10, padding:"12px 16px", marginBottom:8,
      display:"flex", justifyContent:"space-between", alignItems:"center",
    }),
    badge: (status: string): React.CSSProperties => ({
      background: STATUS_BG[status], color: STATUS_COLOR[status],
      padding:"2px 8px", borderRadius:20, fontSize:11, fontWeight:600,
    }),
    overlay: { position:"fixed" as const, inset:0, background:"rgba(0,0,0,0.5)", zIndex:1000, display:"flex", alignItems:"center", justifyContent:"center", padding:20 },
    modal: { background:"#fff", borderRadius:16, width:"100%", maxWidth:520, maxHeight:"90vh", overflow:"auto", boxShadow:"0 20px 60px rgba(0,0,0,0.25)" } as React.CSSProperties,
    label: { fontSize:12, fontWeight:600, color:"#5a6a5a", display:"block", marginBottom:4 } as React.CSSProperties,
    grid2: { display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:12 } as React.CSSProperties,
  };

  return (
    <div style={s.page}>
      {/* Header */}
      <div style={s.header}>
        <div>
          <h1 style={s.h1}>📦 Gestão de Insumos</h1>
          <div style={{ fontSize:13, color:"#6a7a6a" }}>{insumos.length} insumos cadastrados · {alertas.length} alertas</div>
        </div>
        <button style={s.btnPrimary} onClick={() => setModal(true)}>+ Novo insumo</button>
      </div>

      {/* Alertas */}
      {alertas.length > 0 && (
        <div style={{ marginBottom:20 }}>
          <div style={{ fontSize:12, fontWeight:600, color:"#8a9a8a", marginBottom:8, letterSpacing:"0.06em" }}>⚠️ ALERTAS DE ESTOQUE</div>
          {alertas.map(a => (
            <div key={a.id} style={s.alertCard(a.status_estoque || "ok")}>
              <div>
                <div style={{ fontWeight:600, fontSize:14, color:"#1a2e1a" }}>{a.nome}</div>
                <div style={{ fontSize:12, color:"#6a7a6a" }}>
                  Atual: {a.estoque_atual} {a.unidade} · Mínimo: {a.estoque_minimo} · Ideal: {a.estoque_ideal}
                  {a.fornecedor_nome && ` · ${a.fornecedor_nome}`}
                </div>
              </div>
              <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                <span style={s.badge(a.status_estoque || "ok")}>{STATUS_LABEL[a.status_estoque || "ok"]}</span>
                <button onClick={() => setModalMov(a)} style={{ padding:"5px 12px", borderRadius:8, border:`1px solid ${green}`, background:"transparent", color:green, fontSize:12, fontWeight:600, cursor:"pointer" }}>
                  Movimentar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Filtros */}
      <div style={{ display:"flex", gap:8, marginBottom:16, flexWrap:"wrap" }}>
        <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar insumo..." style={{ ...INP, width:200 }} />
        {["todos","critico","baixo","atencao","ok"].map(f => (
          <button key={f} onClick={() => setFiltro(f)} style={{
            padding:"6px 14px", borderRadius:8, fontSize:12, fontWeight:600, cursor:"pointer",
            border:`1.5px solid ${filtro===f ? green : "#ddd"}`,
            background: filtro===f ? "#f0f8ea" : "#fff",
            color: filtro===f ? green : "#6a7a6a",
          }}>
            {f === "todos" ? "Todos" : STATUS_LABEL[f]}
          </button>
        ))}
      </div>

      {/* Lista */}
      {loading ? (
        <div style={{ textAlign:"center", padding:40, color:"#8a9a8a" }}>Carregando...</div>
      ) : insumosFiltrados.length === 0 ? (
        <div style={{ textAlign:"center", padding:40, color:"#8a9a8a" }}>
          <div style={{ fontSize:32, marginBottom:8 }}>📦</div>
          Nenhum insumo encontrado.
          <br /><button onClick={() => setModal(true)} style={{ marginTop:12, ...s.btnPrimary }}>Cadastrar primeiro insumo</button>
        </div>
      ) : (
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))", gap:12 }}>
          {insumosFiltrados.map(i => (
            <div key={i.id} style={s.card}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:8 }}>
                <div>
                  <div style={{ fontWeight:600, fontSize:14, color:"#1a2e1a" }}>{i.nome}</div>
                  <div style={{ fontSize:11, color:"#8a9a8a" }}>{CAT_LABEL[i.categoria] || i.categoria} · {i.origem}</div>
                </div>
                <span style={s.badge(i.status_estoque || "ok")}>{STATUS_LABEL[i.status_estoque || "ok"]}</span>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:6, marginBottom:10 }}>
                {[
                  { label:"Atual", val:`${i.estoque_atual} ${i.unidade}`, color: STATUS_COLOR[i.status_estoque||"ok"] },
                  { label:"Mínimo", val:`${i.estoque_minimo}` },
                  { label:"Ideal", val:`${i.estoque_ideal}` },
                ].map(item => (
                  <div key={item.label} style={{ background:"#f5f0e8", borderRadius:6, padding:"6px 8px", textAlign:"center" }}>
                    <div style={{ fontSize:10, color:"#8a9a8a" }}>{item.label}</div>
                    <div style={{ fontSize:13, fontWeight:700, color: item.color || "#1a2e1a" }}>{item.val}</div>
                  </div>
                ))}
              </div>
              {i.fornecedor_nome && <div style={{ fontSize:11, color:"#6a7a6a", marginBottom:8 }}>🏭 {i.fornecedor_nome}</div>}
              {i.preco_estimado && <div style={{ fontSize:11, color:"#6a7a6a", marginBottom:8 }}>💰 R$ {i.preco_estimado.toFixed(2)}/{i.unidade}</div>}
              <button onClick={() => setModalMov(i)} style={{ width:"100%", padding:"7px", borderRadius:8, border:`1px solid ${green}`, background:"transparent", color:green, fontSize:12, fontWeight:600, cursor:"pointer" }}>
                Registrar movimentação
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Modal novo insumo */}
      {modal && (
        <div style={s.overlay} onClick={e => { if (e.target===e.currentTarget) setModal(false); }}>
          <div style={s.modal}>
            <div style={{ padding:"20px 24px 0", display:"flex", justifyContent:"space-between" }}>
              <div style={{ fontSize:16, fontWeight:700, color:"#1a2e1a" }}>📦 Novo insumo</div>
              <button onClick={() => setModal(false)} style={{ background:"none", border:"none", fontSize:22, cursor:"pointer", color:"#8a9a8a" }}>×</button>
            </div>
            <div style={{ padding:"16px 24px 24px" }}>
              <div style={{ marginBottom:12 }}>
                <label style={s.label}>Nome *</label>
                <input style={INP} value={form.nome} onChange={e => setForm(f => ({...f, nome:e.target.value}))} placeholder="Ex: Saca de Soja 50kg" />
              </div>
              <div style={s.grid2}>
                <div>
                  <label style={s.label}>Categoria</label>
                  <select style={INP} value={form.categoria} onChange={e => setForm(f => ({...f, categoria:e.target.value}))}>
                    {CATEGORIAS.map(c => <option key={c} value={c}>{CAT_LABEL[c]}</option>)}
                  </select>
                </div>
                <div>
                  <label style={s.label}>Unidade</label>
                  <select style={INP} value={form.unidade} onChange={e => setForm(f => ({...f, unidade:e.target.value}))}>
                    {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
              </div>
              <div style={s.grid2}>
                <div>
                  <label style={s.label}>Origem</label>
                  <select style={INP} value={form.origem} onChange={e => setForm(f => ({...f, origem:e.target.value as Origem}))}>
                    <option value="comprado">Comprado</option>
                    <option value="proprio">Produção própria</option>
                    <option value="doacao">Doação/Troca</option>
                  </select>
                </div>
                <div>
                  <label style={s.label}>Reposição</label>
                  <select style={INP} value={form.reposicao_modo} onChange={e => setForm(f => ({...f, reposicao_modo:e.target.value as Modo}))}>
                    <option value="manual">Manual</option>
                    <option value="automatico">Automático</option>
                  </select>
                </div>
              </div>
              <div style={s.grid2}>
                <div>
                  <label style={s.label}>Estoque atual</label>
                  <input style={INP} type="number" value={form.estoque_atual} onChange={e => setForm(f => ({...f, estoque_atual:parseFloat(e.target.value)||0}))} />
                </div>
                <div>
                  <label style={s.label}>Estoque mínimo</label>
                  <input style={INP} type="number" value={form.estoque_minimo} onChange={e => setForm(f => ({...f, estoque_minimo:parseFloat(e.target.value)||0}))} />
                </div>
              </div>
              <div style={s.grid2}>
                <div>
                  <label style={s.label}>Estoque ideal</label>
                  <input style={INP} type="number" value={form.estoque_ideal} onChange={e => setForm(f => ({...f, estoque_ideal:parseFloat(e.target.value)||0}))} />
                </div>
                <div>
                  <label style={s.label}>Preço estimado (R$)</label>
                  <input style={INP} type="number" value={form.preco_estimado} onChange={e => setForm(f => ({...f, preco_estimado:e.target.value}))} placeholder="0,00" />
                </div>
              </div>
              <div style={{ marginBottom:12 }}>
                <label style={s.label}>Fornecedor</label>
                <select style={INP} value={form.fornecedor_id} onChange={e => setForm(f => ({...f, fornecedor_id:e.target.value}))}>
                  <option value="">— Selecione —</option>
                  {fornecedores.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
                </select>
              </div>
              <div style={{ display:"flex", gap:10, justifyContent:"flex-end", marginTop:16 }}>
                <button onClick={() => setModal(false)} style={{ padding:"9px 18px", borderRadius:10, border:"1.5px solid #d8d0c0", background:"transparent", color:"#5a6a5a", fontSize:13, cursor:"pointer" }}>Cancelar</button>
                <button onClick={salvarInsumo} disabled={!form.nome || salvando} style={{ padding:"9px 18px", borderRadius:10, border:"none", background:form.nome&&!salvando ? green:"#a0b890", color:"#fff", fontSize:13, fontWeight:600, cursor:form.nome&&!salvando?"pointer":"not-allowed" }}>
                  {salvando ? "Salvando..." : "Salvar insumo"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal movimentação */}
      {modalMov && (
        <div style={s.overlay} onClick={e => { if (e.target===e.currentTarget) setModalMov(null); }}>
          <div style={{ ...s.modal, maxWidth:420 }}>
            <div style={{ padding:"20px 24px 0", display:"flex", justifyContent:"space-between" }}>
              <div style={{ fontSize:16, fontWeight:700, color:"#1a2e1a" }}>📊 {modalMov.nome}</div>
              <button onClick={() => setModalMov(null)} style={{ background:"none", border:"none", fontSize:22, cursor:"pointer", color:"#8a9a8a" }}>×</button>
            </div>
            <div style={{ padding:"16px 24px 24px" }}>
              <div style={{ background:"#f0f8ea", borderRadius:8, padding:"10px 14px", marginBottom:16, fontSize:13, color:"#2a5a2a" }}>
                Estoque atual: <strong>{modalMov.estoque_atual} {modalMov.unidade}</strong>
              </div>
              <div style={{ marginBottom:12 }}>
                <label style={s.label}>Tipo de movimentação</label>
                <select style={INP} value={movForm.tipo} onChange={e => setMovForm(f => ({...f, tipo:e.target.value}))}>
                  <optgroup label="Entradas">
                    <option value="compra">Compra</option>
                    <option value="producao_propria">Produção própria</option>
                    <option value="doacao">Doação/Troca</option>
                    <option value="ajuste_positivo">Ajuste positivo</option>
                  </optgroup>
                  <optgroup label="Saídas">
                    <option value="uso">Uso/Consumo</option>
                    <option value="venda">Venda</option>
                    <option value="perda">Perda/Descarte</option>
                    <option value="ajuste_negativo">Ajuste negativo</option>
                  </optgroup>
                </select>
              </div>
              <div style={{ marginBottom:12 }}>
                <label style={s.label}>Quantidade ({modalMov.unidade})</label>
                <input style={INP} type="number" value={movForm.quantidade} onChange={e => setMovForm(f => ({...f, quantidade:e.target.value}))} placeholder="0" />
              </div>
              <div style={{ marginBottom:16 }}>
                <label style={s.label}>Observação (opcional)</label>
                <input style={INP} value={movForm.observacao} onChange={e => setMovForm(f => ({...f, observacao:e.target.value}))} placeholder="Ex: Plantio área A" />
              </div>
              <div style={{ display:"flex", gap:10, justifyContent:"flex-end" }}>
                <button onClick={() => setModalMov(null)} style={{ padding:"9px 18px", borderRadius:10, border:"1.5px solid #d8d0c0", background:"transparent", color:"#5a6a5a", fontSize:13, cursor:"pointer" }}>Cancelar</button>
                <button onClick={salvarMovimentacao} disabled={!movForm.quantidade || salvando} style={{ padding:"9px 18px", borderRadius:10, border:"none", background:movForm.quantidade&&!salvando ? green:"#a0b890", color:"#fff", fontSize:13, fontWeight:600, cursor:movForm.quantidade&&!salvando?"pointer":"not-allowed" }}>
                  {salvando ? "Salvando..." : "Registrar"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
