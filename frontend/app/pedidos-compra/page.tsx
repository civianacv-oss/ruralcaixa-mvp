"use client";
import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api";

const API = process.env.NEXT_PUBLIC_API_URL || "https://ruralcaixa-mvp-production.up.railway.app";

interface Pedido {
  id: number;
  insumo_nome: string;
  unidade: string;
  fornecedor_nome: string | null;
  fornecedor_whatsapp: string | null;
  quantidade: number;
  preco_estimado: number | null;
  valor_total_estimado: number | null;
  status: string;
  modo_geracao: string;
  data_solicitacao: string;
  data_entrega_desejada: string | null;
  observacao: string | null;
}

interface Insumo { id: number; nome: string; unidade: string; }
interface Fornecedor { id: number; nome: string; }

const STATUS_COLOR: Record<string,string> = {
  pendente:"#7a5a00", aprovado:"#2a4a8a", enviado:"#1a6a4a",
  confirmado:"#2a5a2a", entregue:"#1a3a1a", cancelado:"#8a2a2a",
};
const STATUS_BG: Record<string,string> = {
  pendente:"#fff8e1", aprovado:"#e8eef8", enviado:"#e8f8f0",
  confirmado:"#e8f5e8", entregue:"#e0f0e0", cancelado:"#fce8e8",
};
const STATUS_LABEL: Record<string,string> = {
  pendente:"⏳ Pendente", aprovado:"✅ Aprovado", enviado:"📤 Enviado",
  confirmado:"✓ Confirmado", entregue:"📦 Entregue", cancelado:"❌ Cancelado",
};

const green = "#2a5a2a";
const INP: React.CSSProperties = {
  width:"100%", padding:"9px 12px", borderRadius:8,
  border:"1.5px solid #d8d0c0", fontSize:13,
  background:"#faf8f4", color:"#1a2e1a", boxSizing:"border-box",
};

export default function PedidosCompraPage() {
  const [pedidos, setPedidos]         = useState<Pedido[]>([]);
  const [insumos, setInsumos]         = useState<Insumo[]>([]);
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  const [loading, setLoading]         = useState(true);
  const [modal, setModal]             = useState(false);
  const [enviando, setEnviando]       = useState<number | null>(null);
  const [salvando, setSalvando]       = useState(false);
  const [filtroStatus, setFiltroStatus] = useState("todos");
  const [form, setForm]               = useState({
    insumo_id:"", fornecedor_id:"", quantidade:"",
    preco_estimado:"", data_entrega_desejada:"", observacao:"",
  });

  useEffect(() => { carregar(); }, []);

  async function carregar() {
    setLoading(true);
    const [ped, ins, forn] = await Promise.all([
      apiFetch(`${API}/pedidos-compra/`).then(r => r.json()).catch(() => ({ data: [] })),
      apiFetch(`${API}/insumos/`).then(r => r.json()).catch(() => ({ data: [] })),
      apiFetch(`${API}/fornecedores/`).then(r => r.json()).catch(() => ({ data: [] })),
    ]);
    setPedidos(ped.data || []);
    setInsumos(ins.data || []);
    setFornecedores(forn.data || []);
    setLoading(false);
  }

  async function salvar() {
    setSalvando(true);
    await apiFetch(`${API}/pedidos-compra/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        insumo_id: parseInt(form.insumo_id),
        fornecedor_id: form.fornecedor_id ? parseInt(form.fornecedor_id) : null,
        quantidade: parseFloat(form.quantidade),
        preco_estimado: form.preco_estimado ? parseFloat(form.preco_estimado) : null,
        data_entrega_desejada: form.data_entrega_desejada || null,
        observacao: form.observacao || null,
      }),
    });
    setSalvando(false);
    setModal(false);
    carregar();
  }

  async function aprovar(id: number) {
    await apiFetch(`${API}/pedidos-compra/${id}/aprovar`, { method:"PUT" });
    carregar();
  }

  async function enviar(id: number) {
    setEnviando(id);
    await apiFetch(`${API}/pedidos-compra/${id}/enviar`, { method:"POST" });
    setEnviando(null);
    carregar();
  }

  const lista = pedidos.filter(p => filtroStatus === "todos" || p.status === filtroStatus);

  const resumo = {
    pendentes: pedidos.filter(p => p.status === "pendente").length,
    aprovados: pedidos.filter(p => p.status === "aprovado").length,
    enviados: pedidos.filter(p => p.status === "enviado").length,
    valor: pedidos.filter(p => !["cancelado","entregue"].includes(p.status))
      .reduce((s, p) => s + (p.valor_total_estimado || 0), 0),
  };

  const s = {
    page: { maxWidth:900, margin:"0 auto", padding:"24px 16px" } as React.CSSProperties,
    header: { display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 } as React.CSSProperties,
    h1: { fontSize:20, fontWeight:700, color:"#1a2e1a" } as React.CSSProperties,
    btnPrimary: { padding:"9px 18px", borderRadius:10, border:"none", background:green, color:"#fff", fontSize:13, fontWeight:600, cursor:"pointer" } as React.CSSProperties,
    card: { background:"#fff", border:"1px solid #e8e0d0", borderRadius:12, padding:"16px 20px", marginBottom:10 } as React.CSSProperties,
    overlay: { position:"fixed" as const, inset:0, background:"rgba(0,0,0,0.5)", zIndex:1000, display:"flex", alignItems:"center", justifyContent:"center", padding:20 },
    modal: { background:"#fff", borderRadius:16, width:"100%", maxWidth:480, maxHeight:"90vh", overflow:"auto", boxShadow:"0 20px 60px rgba(0,0,0,0.25)" } as React.CSSProperties,
    label: { fontSize:12, fontWeight:600, color:"#5a6a5a", display:"block", marginBottom:4 } as React.CSSProperties,
    grid2: { display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:12 } as React.CSSProperties,
    badge: (status: string): React.CSSProperties => ({
      background: STATUS_BG[status]||"#f0f0f0", color: STATUS_COLOR[status]||"#333",
      padding:"3px 10px", borderRadius:20, fontSize:11, fontWeight:600, whiteSpace:"nowrap",
    }),
    kpi: { background:"#fff", border:"1px solid #e8e0d0", borderRadius:12, padding:"14px 20px", textAlign:"center" as const },
  };

  return (
    <div style={s.page}>
      <div style={s.header}>
        <div>
          <h1 style={s.h1}>🛒 Pedidos de Compra</h1>
          <div style={{ fontSize:13, color:"#6a7a6a" }}>{pedidos.length} pedidos no total</div>
        </div>
        <button style={s.btnPrimary} onClick={() => setModal(true)}>+ Novo pedido</button>
      </div>

      {/* KPIs */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10, marginBottom:20 }}>
        {[
          { label:"Pendentes", val:resumo.pendentes, color:"#7a5a00" },
          { label:"Aprovados", val:resumo.aprovados, color:"#2a4a8a" },
          { label:"Enviados", val:resumo.enviados, color:"#1a6a4a" },
          { label:"Valor em aberto", val:`R$ ${resumo.valor.toLocaleString("pt-BR",{minimumFractionDigits:2})}`, color:green },
        ].map(k => (
          <div key={k.label} style={s.kpi}>
            <div style={{ fontSize:11, color:"#8a9a8a", marginBottom:4 }}>{k.label}</div>
            <div style={{ fontSize:18, fontWeight:700, color:k.color }}>{k.val}</div>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div style={{ display:"flex", gap:8, marginBottom:16, flexWrap:"wrap" }}>
        {["todos","pendente","aprovado","enviado","confirmado","entregue","cancelado"].map(s => (
          <button key={s} onClick={() => setFiltroStatus(s)} style={{
            padding:"6px 12px", borderRadius:8, fontSize:12, fontWeight:600, cursor:"pointer",
            border:`1.5px solid ${filtroStatus===s ? green:"#ddd"}`,
            background: filtroStatus===s ? "#f0f8ea":"#fff",
            color: filtroStatus===s ? green:"#6a7a6a",
          }}>
            {s === "todos" ? "Todos" : STATUS_LABEL[s]}
          </button>
        ))}
      </div>

      {/* Lista */}
      {loading ? (
        <div style={{ textAlign:"center", padding:40, color:"#8a9a8a" }}>Carregando...</div>
      ) : lista.length === 0 ? (
        <div style={{ textAlign:"center", padding:40, color:"#8a9a8a" }}>
          <div style={{ fontSize:32, marginBottom:8 }}>🛒</div>
          Nenhum pedido encontrado.
          <br /><button onClick={() => setModal(true)} style={{ marginTop:12, ...s.btnPrimary }}>Criar primeiro pedido</button>
        </div>
      ) : (
        lista.map(p => (
          <div key={p.id} style={s.card}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:10 }}>
              <div>
                <div style={{ fontWeight:600, fontSize:15, color:"#1a2e1a" }}>{p.insumo_nome}</div>
                <div style={{ fontSize:12, color:"#6a7a6a", marginTop:2 }}>
                  {p.fornecedor_nome || "Sem fornecedor"} · {p.modo_geracao === "automatico" ? "🤖 Automático" : "👤 Manual"}
                </div>
              </div>
              <span style={s.badge(p.status)}>{STATUS_LABEL[p.status]}</span>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:8, marginBottom:12 }}>
              {[
                { label:"Quantidade", val:`${p.quantidade} ${p.unidade}` },
                { label:"Preço unit.", val:p.preco_estimado ? `R$ ${p.preco_estimado.toFixed(2)}` : "—" },
                { label:"Total estimado", val:p.valor_total_estimado ? `R$ ${p.valor_total_estimado.toLocaleString("pt-BR",{minimumFractionDigits:2})}` : "—" },
                { label:"Entrega desejada", val:p.data_entrega_desejada ? new Date(p.data_entrega_desejada).toLocaleDateString("pt-BR") : "—" },
              ].map(item => (
                <div key={item.label} style={{ background:"#f5f0e8", borderRadius:6, padding:"6px 10px" }}>
                  <div style={{ fontSize:10, color:"#8a9a8a" }}>{item.label}</div>
                  <div style={{ fontSize:13, fontWeight:600, color:"#1a2e1a" }}>{item.val}</div>
                </div>
              ))}
            </div>
            {p.observacao && <div style={{ fontSize:12, color:"#6a7a6a", marginBottom:10 }}>{p.observacao}</div>}
            <div style={{ display:"flex", gap:8 }}>
              {p.status === "pendente" && (
                <button onClick={() => aprovar(p.id)} style={{ padding:"6px 14px", borderRadius:8, border:"none", background:"#2a4a8a", color:"#fff", fontSize:12, fontWeight:600, cursor:"pointer" }}>
                  ✅ Aprovar
                </button>
              )}
              {p.status === "aprovado" && (
                <button onClick={() => enviar(p.id)} disabled={enviando===p.id} style={{ padding:"6px 14px", borderRadius:8, border:"none", background:green, color:"#fff", fontSize:12, fontWeight:600, cursor:enviando===p.id?"not-allowed":"pointer" }}>
                  {enviando===p.id ? "Enviando..." : "📤 Enviar ao fornecedor"}
                </button>
              )}
              {p.fornecedor_whatsapp && (
                <a href={`https://wa.me/${p.fornecedor_whatsapp}?text=Pedido+de+${p.quantidade}+${p.unidade}+de+${encodeURIComponent(p.insumo_nome)}`}
                  target="_blank" rel="noopener noreferrer"
                  style={{ padding:"6px 14px", borderRadius:8, background:"#25D366", color:"#fff", textDecoration:"none", fontSize:12, fontWeight:600 }}>
                  💬 WhatsApp
                </a>
              )}
            </div>
          </div>
        ))
      )}

      {/* Modal novo pedido */}
      {modal && (
        <div style={s.overlay} onClick={e => { if (e.target===e.currentTarget) setModal(false); }}>
          <div style={s.modal}>
            <div style={{ padding:"20px 24px 0", display:"flex", justifyContent:"space-between" }}>
              <div style={{ fontSize:16, fontWeight:700, color:"#1a2e1a" }}>🛒 Novo pedido de compra</div>
              <button onClick={() => setModal(false)} style={{ background:"none", border:"none", fontSize:22, cursor:"pointer", color:"#8a9a8a" }}>×</button>
            </div>
            <div style={{ padding:"16px 24px 24px" }}>
              <div style={{ marginBottom:12 }}>
                <label style={s.label}>Insumo *</label>
                <select style={INP} value={form.insumo_id} onChange={e => setForm(f => ({...f, insumo_id:e.target.value}))}>
                  <option value="">— Selecione o insumo —</option>
                  {insumos.map(i => <option key={i.id} value={i.id}>{i.nome}</option>)}
                </select>
              </div>
              <div style={{ marginBottom:12 }}>
                <label style={s.label}>Fornecedor</label>
                <select style={INP} value={form.fornecedor_id} onChange={e => setForm(f => ({...f, fornecedor_id:e.target.value}))}>
                  <option value="">— Selecione o fornecedor —</option>
                  {fornecedores.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
                </select>
              </div>
              <div style={s.grid2}>
                <div>
                  <label style={s.label}>Quantidade *</label>
                  <input style={INP} type="number" value={form.quantidade} onChange={e => setForm(f => ({...f, quantidade:e.target.value}))} placeholder="0" />
                </div>
                <div>
                  <label style={s.label}>Preço unitário (R$)</label>
                  <input style={INP} type="number" value={form.preco_estimado} onChange={e => setForm(f => ({...f, preco_estimado:e.target.value}))} placeholder="0,00" />
                </div>
              </div>
              <div style={{ marginBottom:12 }}>
                <label style={s.label}>Entrega desejada</label>
                <input style={INP} type="date" value={form.data_entrega_desejada} onChange={e => setForm(f => ({...f, data_entrega_desejada:e.target.value}))} />
              </div>
              <div style={{ marginBottom:16 }}>
                <label style={s.label}>Observação</label>
                <input style={INP} value={form.observacao} onChange={e => setForm(f => ({...f, observacao:e.target.value}))} placeholder="Informações adicionais..." />
              </div>
              <div style={{ display:"flex", gap:10, justifyContent:"flex-end" }}>
                <button onClick={() => setModal(false)} style={{ padding:"9px 18px", borderRadius:10, border:"1.5px solid #d8d0c0", background:"transparent", color:"#5a6a5a", fontSize:13, cursor:"pointer" }}>Cancelar</button>
                <button onClick={salvar} disabled={!form.insumo_id||!form.quantidade||salvando} style={{ padding:"9px 18px", borderRadius:10, border:"none", background:form.insumo_id&&form.quantidade&&!salvando?green:"#a0b890", color:"#fff", fontSize:13, fontWeight:600, cursor:form.insumo_id&&form.quantidade&&!salvando?"pointer":"not-allowed" }}>
                  {salvando ? "Salvando..." : "Criar pedido"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
