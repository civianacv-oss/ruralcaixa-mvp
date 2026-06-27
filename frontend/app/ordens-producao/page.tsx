"use client";
import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api";

const API = process.env.NEXT_PUBLIC_API_URL || "https://ruralcaixa-mvp-production.up.railway.app";

interface Insumo { id: number; nome: string; unidade: string; estoque_atual: number; origem: string; }
interface InsumoConsumo { insumo_id: number; quantidade: number; nome?: string; custo_unitario?: number; }
interface Ordem {
  id: number;
  produto_nome: string;
  produto_unidade: string;
  quantidade_produzida: number;
  custo_mao_obra: number;
  custo_insumos: number;
  custo_total: number;
  custo_unitario: number;
  status: string;
  data_inicio: string;
  data_conclusao: string | null;
  observacao: string | null;
}

const STATUS_COLOR: Record<string,string> = {
  planejada:"#2a4a8a", em_andamento:"#7a5a00", concluida:"#2a5a2a", cancelada:"#8a2a2a",
};
const STATUS_BG: Record<string,string> = {
  planejada:"#e8eef8", em_andamento:"#fff8e1", concluida:"#e8f5e8", cancelada:"#fce8e8",
};
const STATUS_LABEL: Record<string,string> = {
  planejada:"📋 Planejada", em_andamento:"⚙️ Em andamento", concluida:"✅ Concluída", cancelada:"❌ Cancelada",
};

const green = "#2a5a2a";
const INP: React.CSSProperties = {
  width:"100%", padding:"9px 12px", borderRadius:8,
  border:"1.5px solid #d8d0c0", fontSize:13,
  background:"#faf8f4", color:"#1a2e1a", boxSizing:"border-box",
};

export default function OrdensProducaoPage() {
  const [ordens, setOrdens]     = useState<Ordem[]>([]);
  const [insumos, setInsumos]   = useState<Insumo[]>([]);
  const [loading, setLoading]   = useState(true);
  const [modal, setModal]       = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [executando, setExecutando] = useState<number | null>(null);
  const [form, setForm] = useState({
    insumo_produto_id: "",
    quantidade_produzida: "",
    custo_mao_obra: "0",
    observacao: "",
    data_inicio: new Date().toISOString().slice(0, 10),
  });
  const [consumidos, setConsumidos] = useState<InsumoConsumo[]>([]);
  const [detalhes, setDetalhes] = useState<Ordem | null>(null);

  useEffect(() => { carregar(); }, []);

  async function carregar() {
    setLoading(true);
    const [ord, ins] = await Promise.all([
      apiFetch(`${API}/ordens-producao/`).then(r => r.json()).catch(() => ({ data: [] })),
      apiFetch(`${API}/insumos/`).then(r => r.json()).catch(() => ({ data: [] })),
    ]);
    setOrdens(ord.data || []);
    setInsumos(ins.data || []);
    setLoading(false);
  }

  function addConsumo() {
    setConsumidos(c => [...c, { insumo_id: 0, quantidade: 0 }]);
  }

  function updateConsumo(idx: number, field: keyof InsumoConsumo, val: string | number) {
    setConsumidos(c => c.map((item, i) => i === idx ? { ...item, [field]: field === "insumo_id" ? parseInt(String(val)) : parseFloat(String(val)) || 0 } : item));
  }

  function removeConsumo(idx: number) {
    setConsumidos(c => c.filter((_, i) => i !== idx));
  }

  // Calcula custo estimado
  const custoInsumos = consumidos.reduce((total, c) => {
    const ins = insumos.find(i => i.id === c.insumo_id);
    const preco = (ins as any)?.preco_estimado || 0;
    return total + preco * c.quantidade;
  }, 0);
  const custoTotal = custoInsumos + parseFloat(form.custo_mao_obra || "0");
  const qtdProd = parseFloat(form.quantidade_produzida || "0");
  const custoUnit = qtdProd > 0 ? custoTotal / qtdProd : 0;

  async function salvar() {
    if (!form.insumo_produto_id || !form.quantidade_produzida) return;
    setSalvando(true);
    const r = await apiFetch(`${API}/ordens-producao/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        insumo_produto_id: parseInt(form.insumo_produto_id),
        quantidade_produzida: parseFloat(form.quantidade_produzida),
        custo_mao_obra: parseFloat(form.custo_mao_obra) || 0,
        observacao: form.observacao || null,
        data_inicio: form.data_inicio,
        insumos_consumidos: consumidos.filter(c => c.insumo_id && c.quantidade > 0),
      }),
    });
    setSalvando(false);
    if (r.ok) {
      setModal(false);
      setForm({ insumo_produto_id:"", quantidade_produzida:"", custo_mao_obra:"0", observacao:"", data_inicio: new Date().toISOString().slice(0,10) });
      setConsumidos([]);
      carregar();
    }
  }

  async function executar(id: number) {
    if (!confirm("Confirma a execução? Isso vai baixar os insumos do estoque e dar entrada no produto.")) return;
    setExecutando(id);
    const r = await apiFetch(`${API}/ordens-producao/${id}/executar`, { method: "POST" });
    setExecutando(null);
    if (r.ok) {
      const data = await r.json();
      alert(`✅ Produção concluída!\n${data.produto}: +${data.quantidade_produzida} ${data.produto_unidade || ""}\nCusto unitário: R$ ${data.custo_unitario?.toFixed(4)}/un`);
      carregar();
    } else {
      const err = await r.json();
      alert(`❌ Erro: ${err.detail}`);
    }
  }

  const s = {
    page: { maxWidth:900, margin:"0 auto", padding:"24px 16px" } as React.CSSProperties,
    header: { display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 } as React.CSSProperties,
    h1: { fontSize:20, fontWeight:700, color:"#1a2e1a" } as React.CSSProperties,
    btnPrimary: { padding:"9px 18px", borderRadius:10, border:"none", background:green, color:"#fff", fontSize:13, fontWeight:600, cursor:"pointer" } as React.CSSProperties,
    card: { background:"#fff", border:"1px solid #e8e0d0", borderRadius:12, padding:"16px 20px", marginBottom:10 } as React.CSSProperties,
    overlay: { position:"fixed" as const, inset:0, background:"rgba(0,0,0,0.5)", zIndex:1000, display:"flex", alignItems:"center", justifyContent:"center", padding:20 },
    modal: { background:"#fff", borderRadius:16, width:"100%", maxWidth:580, maxHeight:"90vh", overflow:"auto", boxShadow:"0 20px 60px rgba(0,0,0,0.25)" } as React.CSSProperties,
    label: { fontSize:12, fontWeight:600, color:"#5a6a5a", display:"block", marginBottom:4 } as React.CSSProperties,
    grid2: { display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:12 } as React.CSSProperties,
    badge: (status: string): React.CSSProperties => ({
      background: STATUS_BG[status]||"#f0f0f0", color: STATUS_COLOR[status]||"#333",
      padding:"3px 10px", borderRadius:20, fontSize:11, fontWeight:600,
    }),
    kpi: { background:"#f5f0e8", borderRadius:8, padding:"8px 12px", textAlign:"center" as const, fontSize:11 },
  };

  return (
    <div style={s.page}>
      <div style={s.header}>
        <div>
          <h1 style={s.h1}>🏭 Ordens de Produção</h1>
          <div style={{ fontSize:13, color:"#6a7a6a" }}>{ordens.length} ordens · silagem, ração, mudas e outros</div>
        </div>
        <button style={s.btnPrimary} onClick={() => setModal(true)}>+ Nova ordem</button>
      </div>

      {loading ? (
        <div style={{ textAlign:"center", padding:40, color:"#8a9a8a" }}>Carregando...</div>
      ) : ordens.length === 0 ? (
        <div style={{ textAlign:"center", padding:40, color:"#8a9a8a" }}>
          <div style={{ fontSize:36, marginBottom:8 }}>🏭</div>
          Nenhuma ordem de produção.
          <br /><button onClick={() => setModal(true)} style={{ marginTop:12, ...s.btnPrimary }}>Criar primeira ordem</button>
        </div>
      ) : (
        ordens.map(o => (
          <div key={o.id} style={s.card}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:12 }}>
              <div>
                <div style={{ fontWeight:600, fontSize:15, color:"#1a2e1a" }}>{o.produto_nome}</div>
                <div style={{ fontSize:12, color:"#6a7a6a" }}>
                  {new Date(o.data_inicio).toLocaleDateString("pt-BR")}
                  {o.data_conclusao && ` → ${new Date(o.data_conclusao).toLocaleDateString("pt-BR")}`}
                  {o.observacao && ` · ${o.observacao}`}
                </div>
              </div>
              <span style={s.badge(o.status)}>{STATUS_LABEL[o.status]}</span>
            </div>

            <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:8, marginBottom:12 }}>
              {[
                { label:"Quantidade", val:`${o.quantidade_produzida} ${o.produto_unidade}` },
                { label:"Custo insumos", val:`R$ ${o.custo_insumos?.toFixed(2)||"0,00"}` },
                { label:"Mão de obra", val:`R$ ${o.custo_mao_obra?.toFixed(2)||"0,00"}` },
                { label:"Custo total", val:`R$ ${o.custo_total?.toFixed(2)||"0,00"}`, bold:true },
                { label:"Custo/un", val:`R$ ${o.custo_unitario?.toFixed(4)||"0,00"}`, color:green },
              ].map(item => (
                <div key={item.label} style={s.kpi}>
                  <div style={{ color:"#8a9a8a", marginBottom:2 }}>{item.label}</div>
                  <div style={{ fontWeight: item.bold ? 700:600, color: item.color||"#1a2e1a", fontSize:13 }}>{item.val}</div>
                </div>
              ))}
            </div>

            {o.status === "planejada" && (
              <button
                onClick={() => executar(o.id)}
                disabled={executando === o.id}
                style={{ padding:"7px 16px", borderRadius:8, border:"none", background: executando===o.id?"#a0b890":green, color:"#fff", fontSize:12, fontWeight:600, cursor: executando===o.id?"not-allowed":"pointer" }}
              >
                {executando === o.id ? "Executando..." : "⚙️ Executar produção"}
              </button>
            )}
          </div>
        ))
      )}

      {/* Modal nova ordem */}
      {modal && (
        <div style={s.overlay} onClick={e => { if (e.target===e.currentTarget) setModal(false); }}>
          <div style={s.modal}>
            <div style={{ padding:"20px 24px 0", display:"flex", justifyContent:"space-between" }}>
              <div style={{ fontSize:16, fontWeight:700, color:"#1a2e1a" }}>🏭 Nova ordem de produção</div>
              <button onClick={() => setModal(false)} style={{ background:"none", border:"none", fontSize:22, cursor:"pointer", color:"#8a9a8a" }}>×</button>
            </div>
            <div style={{ padding:"16px 24px 24px" }}>

              {/* Produto a produzir */}
              <div style={{ marginBottom:12 }}>
                <label style={s.label}>Produto a produzir *</label>
                <select style={INP} value={form.insumo_produto_id} onChange={e => setForm(f => ({...f, insumo_produto_id:e.target.value}))}>
                  <option value="">— Selecione o insumo que será produzido —</option>
                  {insumos.filter(i => i.origem === "proprio").map(i => (
                    <option key={i.id} value={i.id}>{i.nome} (estoque: {i.estoque_atual} {i.unidade})</option>
                  ))}
                  <optgroup label="── Outros insumos ──">
                    {insumos.filter(i => i.origem !== "proprio").map(i => (
                      <option key={i.id} value={i.id}>{i.nome}</option>
                    ))}
                  </optgroup>
                </select>
              </div>

              <div style={s.grid2}>
                <div>
                  <label style={s.label}>Quantidade a produzir *</label>
                  <input style={INP} type="number" value={form.quantidade_produzida} onChange={e => setForm(f => ({...f, quantidade_produzida:e.target.value}))} placeholder="0" />
                </div>
                <div>
                  <label style={s.label}>Data de início</label>
                  <input style={INP} type="date" value={form.data_inicio} onChange={e => setForm(f => ({...f, data_inicio:e.target.value}))} />
                </div>
              </div>

              {/* Insumos consumidos */}
              <div style={{ marginBottom:12 }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
                  <label style={s.label}>Insumos consumidos</label>
                  <button onClick={addConsumo} style={{ padding:"4px 10px", borderRadius:6, border:`1px solid ${green}`, background:"transparent", color:green, fontSize:12, fontWeight:600, cursor:"pointer" }}>+ Adicionar</button>
                </div>
                {consumidos.map((c, idx) => {
                  const ins = insumos.find(i => i.id === c.insumo_id);
                  const preco = (ins as any)?.preco_estimado || 0;
                  const subtotal = preco * c.quantidade;
                  return (
                    <div key={idx} style={{ display:"grid", gridTemplateColumns:"2fr 1fr auto", gap:8, marginBottom:6, alignItems:"center" }}>
                      <select style={INP} value={c.insumo_id || ""} onChange={e => updateConsumo(idx, "insumo_id", e.target.value)}>
                        <option value="">— Insumo —</option>
                        {insumos.map(i => <option key={i.id} value={i.id}>{i.nome} ({i.estoque_atual} {i.unidade})</option>)}
                      </select>
                      <input style={INP} type="number" placeholder="Qtd" value={c.quantidade || ""} onChange={e => updateConsumo(idx, "quantidade", e.target.value)} />
                      <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                        {subtotal > 0 && <span style={{ fontSize:11, color:"#6a7a6a", whiteSpace:"nowrap" }}>R$ {subtotal.toFixed(2)}</span>}
                        <button onClick={() => removeConsumo(idx)} style={{ background:"none", border:"none", color:"#8a2a2a", fontSize:16, cursor:"pointer", padding:"0 4px" }}>×</button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Mão de obra */}
              <div style={s.grid2}>
                <div>
                  <label style={s.label}>Mão de obra (R$)</label>
                  <input style={INP} type="number" value={form.custo_mao_obra} onChange={e => setForm(f => ({...f, custo_mao_obra:e.target.value}))} placeholder="0,00" />
                </div>
                <div>
                  <label style={s.label}>Observação</label>
                  <input style={INP} value={form.observacao} onChange={e => setForm(f => ({...f, observacao:e.target.value}))} placeholder="Ex: Silagem safra 2026" />
                </div>
              </div>

              {/* Resumo de custo */}
              {(custoTotal > 0 || qtdProd > 0) && (
                <div style={{ background:"#f0f8ea", border:"1px solid #c8e0b8", borderRadius:10, padding:"12px 16px", marginBottom:16 }}>
                  <div style={{ fontSize:12, fontWeight:600, color:"#2a5a2a", marginBottom:6 }}>📊 Estimativa de custo</div>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8 }}>
                    {[
                      { label:"Custo insumos", val:`R$ ${custoInsumos.toFixed(2)}` },
                      { label:"Custo total", val:`R$ ${custoTotal.toFixed(2)}` },
                      { label:"Custo/unidade", val: qtdProd > 0 ? `R$ ${custoUnit.toFixed(4)}` : "—" },
                    ].map(item => (
                      <div key={item.label} style={{ textAlign:"center" }}>
                        <div style={{ fontSize:10, color:"#5a7a5a" }}>{item.label}</div>
                        <div style={{ fontSize:14, fontWeight:700, color:"#1a3a1a" }}>{item.val}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ display:"flex", gap:10, justifyContent:"flex-end" }}>
                <button onClick={() => setModal(false)} style={{ padding:"9px 18px", borderRadius:10, border:"1.5px solid #d8d0c0", background:"transparent", color:"#5a6a5a", fontSize:13, cursor:"pointer" }}>Cancelar</button>
                <button onClick={salvar} disabled={!form.insumo_produto_id||!form.quantidade_produzida||salvando} style={{ padding:"9px 18px", borderRadius:10, border:"none", background:form.insumo_produto_id&&form.quantidade_produzida&&!salvando?green:"#a0b890", color:"#fff", fontSize:13, fontWeight:600, cursor:form.insumo_produto_id&&form.quantidade_produzida&&!salvando?"pointer":"not-allowed" }}>
                  {salvando ? "Salvando..." : "Criar ordem de produção"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
