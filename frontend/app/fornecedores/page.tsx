"use client";
import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api";

const API = process.env.NEXT_PUBLIC_API_URL || "https://ruralcaixa-mvp-production.up.railway.app";

interface Fornecedor {
  id: number;
  nome: string;
  cnpj_cpf: string | null;
  whatsapp: string | null;
  telegram: string | null;
  email: string | null;
  endereco: string | null;
  prazo_entrega_dias: number;
  forma_pagamento: string;
  observacoes: string | null;
  total_pedidos?: number;
}

const PAGAMENTO_LABEL: Record<string,string> = {
  a_vista:"À vista", "30_dias":"30 dias", "60_dias":"60 dias",
  "90_dias":"90 dias", consignacao:"Consignação",
};

const green = "#2a5a2a";
const INP: React.CSSProperties = {
  width:"100%", padding:"9px 12px", borderRadius:8,
  border:"1.5px solid #d8d0c0", fontSize:13,
  background:"#faf8f4", color:"#1a2e1a", boxSizing:"border-box",
};

const emptyForm = {
  nome:"", cnpj_cpf:"", whatsapp:"", telegram:"", email:"",
  endereco:"", prazo_entrega_dias:7, forma_pagamento:"a_vista", observacoes:"",
};

export default function FornecedoresPage() {
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  const [loading, setLoading]           = useState(true);
  const [modal, setModal]               = useState(false);
  const [form, setForm]                 = useState(emptyForm);
  const [salvando, setSalvando]         = useState(false);
  const [modalImport, setModalImport]   = useState(false);
  const [importando, setImportando]     = useState(false);
  const [importResult, setImportResult] = useState<{importados:number;erros:any[];total_linhas:number}|null>(null);
  const [busca, setBusca]               = useState("");

  useEffect(() => { carregar(); }, []);

  async function carregar() {
    setLoading(true);
    const r = await apiFetch(`${API}/fornecedores/`).then(r => r.json()).catch(() => ({ data: [] }));
    setFornecedores(r.data || []);
    setLoading(false);
  }

  async function importarFornecedores(file: File) {
    setImportando(true);
    const fd = new FormData();
    fd.append('arquivo', file);
    try {
      const r = await apiFetch(`${API}/importacao/fornecedores`, { method:'POST', body:fd });
      const data = await r.json();
      setImportResult(data);
      if (data.importados > 0) carregar();
    } catch { alert('Erro ao importar'); }
    setImportando(false);
  }

  async function salvar() {
    setSalvando(true);
    await apiFetch(`${API}/fornecedores/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        prazo_entrega_dias: Number(form.prazo_entrega_dias),
        cnpj_cpf: form.cnpj_cpf || null,
        whatsapp: form.whatsapp || null,
        telegram: form.telegram || null,
        email: form.email || null,
        endereco: form.endereco || null,
        observacoes: form.observacoes || null,
      }),
    });
    setSalvando(false);
    setModal(false);
    setForm(emptyForm);
    carregar();
  }

  const lista = fornecedores.filter(f =>
    !busca || f.nome.toLowerCase().includes(busca.toLowerCase())
  );

  const s = {
    page: { maxWidth:860, margin:"0 auto", padding:"24px 16px" } as React.CSSProperties,
    header: { display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 } as React.CSSProperties,
    h1: { fontSize:20, fontWeight:700, color:"#1a2e1a" } as React.CSSProperties,
    btnPrimary: { padding:"9px 18px", borderRadius:10, border:"none", background:green, color:"#fff", fontSize:13, fontWeight:600, cursor:"pointer" } as React.CSSProperties,
    card: { background:"#fff", border:"1px solid #e8e0d0", borderRadius:12, padding:"16px 20px", marginBottom:10 } as React.CSSProperties,
    overlay: { position:"fixed" as const, inset:0, background:"rgba(0,0,0,0.5)", zIndex:1000, display:"flex", alignItems:"center", justifyContent:"center", padding:20 },
    modal: { background:"#fff", borderRadius:16, width:"100%", maxWidth:520, maxHeight:"90vh", overflow:"auto", boxShadow:"0 20px 60px rgba(0,0,0,0.25)" } as React.CSSProperties,
    label: { fontSize:12, fontWeight:600, color:"#5a6a5a", display:"block", marginBottom:4 } as React.CSSProperties,
    grid2: { display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:12 } as React.CSSProperties,
    info: { fontSize:12, color:"#6a7a6a" } as React.CSSProperties,
  };

  return (
    <div style={s.page}>
      <div style={s.header}>
        <div>
          <h1 style={s.h1}>🏭 Fornecedores</h1>
          <div style={{ fontSize:13, color:"#6a7a6a" }}>{fornecedores.length} fornecedores cadastrados</div>
        </div>
        <div style={{display:"flex",gap:8}}>
          <button onClick={() => setModalImport(true)} style={{...s.btnPrimary, background:"#2a4a8a"}}>📂 Importar planilha</button>
          <button style={s.btnPrimary} onClick={() => setModal(true)}>+ Novo fornecedor</button>
        </div>
      </div>

      <div style={{ marginBottom:16 }}>
        <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar fornecedor..." style={{ ...INP, maxWidth:300 }} />
      </div>

      {loading ? (
        <div style={{ textAlign:"center", padding:40, color:"#8a9a8a" }}>Carregando...</div>
      ) : lista.length === 0 ? (
        <div style={{ textAlign:"center", padding:40, color:"#8a9a8a" }}>
          <div style={{ fontSize:32, marginBottom:8 }}>🏭</div>
          Nenhum fornecedor cadastrado.
          <br /><button onClick={() => setModal(true)} style={{ marginTop:12, ...s.btnPrimary }}>Cadastrar primeiro fornecedor</button>
        </div>
      ) : (
        lista.map(f => (
          <div key={f.id} style={s.card}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
              <div style={{ flex:1 }}>
                <div style={{ fontWeight:600, fontSize:15, color:"#1a2e1a", marginBottom:4 }}>{f.nome}</div>
                <div style={{ display:"flex", gap:16, flexWrap:"wrap" }}>
                  {f.cnpj_cpf && <span style={s.info}>📄 {f.cnpj_cpf}</span>}
                  {f.whatsapp && (
                    <a href={`https://wa.me/${f.whatsapp}`} target="_blank" rel="noopener noreferrer" style={{ ...s.info, color:"#25D366", textDecoration:"none" }}>
                      💬 {f.whatsapp}
                    </a>
                  )}
                  {f.telegram && <span style={s.info}>✈️ {f.telegram}</span>}
                  {f.email && <span style={s.info}>📧 {f.email}</span>}
                  {f.endereco && <span style={s.info}>📍 {f.endereco}</span>}
                </div>
              </div>
              <div style={{ display:"flex", gap:12, alignItems:"center", flexShrink:0, marginLeft:16 }}>
                <div style={{ textAlign:"center" }}>
                  <div style={{ fontSize:10, color:"#8a9a8a" }}>PRAZO</div>
                  <div style={{ fontSize:14, fontWeight:700, color:"#1a2e1a" }}>{f.prazo_entrega_dias}d</div>
                </div>
                <div style={{ textAlign:"center" }}>
                  <div style={{ fontSize:10, color:"#8a9a8a" }}>PAGAMENTO</div>
                  <div style={{ fontSize:12, fontWeight:600, color:green }}>{PAGAMENTO_LABEL[f.forma_pagamento] || f.forma_pagamento}</div>
                </div>
                {f.total_pedidos !== undefined && (
                  <div style={{ textAlign:"center" }}>
                    <div style={{ fontSize:10, color:"#8a9a8a" }}>PEDIDOS</div>
                    <div style={{ fontSize:14, fontWeight:700, color:"#1a2e1a" }}>{f.total_pedidos}</div>
                  </div>
                )}
              </div>
            </div>
            {f.observacoes && (
              <div style={{ marginTop:8, fontSize:12, color:"#6a7a6a", background:"#faf8f4", borderRadius:6, padding:"6px 10px" }}>
                {f.observacoes}
              </div>
            )}
            {f.whatsapp && (
              <div style={{ marginTop:10 }}>
                <a href={`https://wa.me/${f.whatsapp}`} target="_blank" rel="noopener noreferrer"
                  style={{ display:"inline-block", background:"#25D366", color:"#fff", textDecoration:"none", padding:"6px 14px", borderRadius:8, fontSize:12, fontWeight:600 }}>
                  📲 Abrir WhatsApp
                </a>
              </div>
            )}
          </div>
        ))
      )}

      {modalImport && (
        <div style={s.overlay} onClick={e => { if (e.target===e.currentTarget) { setModalImport(false); setImportResult(null); } }}>
          <div style={{...s.modal, maxWidth:440}}>
            <div style={{padding:'20px 24px 0',display:'flex',justifyContent:'space-between'}}>
              <div style={{fontSize:16,fontWeight:700,color:'#1a2e1a'}}>📂 Importar fornecedores</div>
              <button onClick={() => {setModalImport(false);setImportResult(null);}} style={{background:'none',border:'none',fontSize:22,cursor:'pointer',color:'#8a9a8a'}}>×</button>
            </div>
            <div style={{padding:'16px 24px 24px'}}>
              {!importResult ? (
                <>
                  <div style={{background:'#f0f8ea',borderRadius:8,padding:'12px 14px',marginBottom:16,fontSize:13,color:'#2a5a2a'}}>
                    <strong>Colunas esperadas:</strong><br/>
                    nome, cnpj, whatsapp, email, endereco, prazo_entrega, forma_pagamento, observacao
                  </div>
                  <div style={{border:'2px dashed #c8d8c0',borderRadius:10,padding:28,textAlign:'center',cursor:'pointer',background:'#faf8f4'}}
                    onClick={() => document.getElementById('imp-forn-input')?.click()}>
                    <div style={{fontSize:32,marginBottom:8}}>📄</div>
                    <div style={{fontSize:14,fontWeight:600,color:'#2a5a2a',marginBottom:4}}>
                      {importando ? 'Importando...' : 'Clique para selecionar'}
                    </div>
                    <div style={{fontSize:12,color:'#8a9a8a'}}>Excel (.xlsx) ou CSV</div>
                    <input id='imp-forn-input' type='file' accept='.xlsx,.xls,.csv' style={{display:'none'}}
                      onChange={e => { if (e.target.files?.[0]) importarFornecedores(e.target.files[0]); }} />
                  </div>
                </>
              ) : (
                <div style={{textAlign:'center',padding:'16px 0'}}>
                  <div style={{fontSize:44,marginBottom:12}}>{importResult.erros.length===0?'✅':'⚠️'}</div>
                  <div style={{fontSize:18,fontWeight:700,color:'#1a2e1a',marginBottom:4}}>{importResult.importados} fornecedores importados</div>
                  <div style={{fontSize:13,color:'#6a7a6a',marginBottom:16}}>de {importResult.total_linhas} linhas · {importResult.erros.length} erros</div>
                  {importResult.erros.slice(0,3).map((e:any,i:number) => (
                    <div key={i} style={{fontSize:12,color:'#8a2a2a',marginBottom:4}}>Linha {e.linha}: {e.msg}</div>
                  ))}
                  <button onClick={() => {setModalImport(false);setImportResult(null);}} style={{marginTop:12,padding:'9px 20px',borderRadius:10,border:'none',background:'#2a5a2a',color:'#fff',fontSize:13,fontWeight:600,cursor:'pointer'}}>Fechar</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal novo fornecedor */}
      {modal && (
        <div style={s.overlay} onClick={e => { if (e.target===e.currentTarget) setModal(false); }}>
          <div style={s.modal}>
            <div style={{ padding:"20px 24px 0", display:"flex", justifyContent:"space-between" }}>
              <div style={{ fontSize:16, fontWeight:700, color:"#1a2e1a" }}>🏭 Novo fornecedor</div>
              <button onClick={() => setModal(false)} style={{ background:"none", border:"none", fontSize:22, cursor:"pointer", color:"#8a9a8a" }}>×</button>
            </div>
            <div style={{ padding:"16px 24px 24px" }}>
              <div style={{ marginBottom:12 }}>
                <label style={s.label}>Nome *</label>
                <input style={INP} value={form.nome} onChange={e => setForm(f => ({...f, nome:e.target.value}))} placeholder="Ex: Cooperativa Agrícola ABC" />
              </div>
              <div style={s.grid2}>
                <div>
                  <label style={s.label}>CPF / CNPJ</label>
                  <input style={INP} value={form.cnpj_cpf} onChange={e => setForm(f => ({...f, cnpj_cpf:e.target.value}))} placeholder="00.000.000/0001-00" />
                </div>
                <div>
                  <label style={s.label}>WhatsApp</label>
                  <input style={INP} value={form.whatsapp} onChange={e => setForm(f => ({...f, whatsapp:e.target.value}))} placeholder="5598999999999" />
                </div>
              </div>
              <div style={s.grid2}>
                <div>
                  <label style={s.label}>Telegram</label>
                  <input style={INP} value={form.telegram} onChange={e => setForm(f => ({...f, telegram:e.target.value}))} placeholder="@fornecedor" />
                </div>
                <div>
                  <label style={s.label}>Email</label>
                  <input style={INP} value={form.email} onChange={e => setForm(f => ({...f, email:e.target.value}))} placeholder="contato@fornecedor.com" />
                </div>
              </div>
              <div style={{ marginBottom:12 }}>
                <label style={s.label}>Endereço</label>
                <input style={INP} value={form.endereco} onChange={e => setForm(f => ({...f, endereco:e.target.value}))} placeholder="Rua, cidade, estado" />
              </div>
              <div style={s.grid2}>
                <div>
                  <label style={s.label}>Prazo de entrega (dias)</label>
                  <input style={INP} type="number" value={form.prazo_entrega_dias} onChange={e => setForm(f => ({...f, prazo_entrega_dias:parseInt(e.target.value)||7}))} />
                </div>
                <div>
                  <label style={s.label}>Forma de pagamento</label>
                  <select style={INP} value={form.forma_pagamento} onChange={e => setForm(f => ({...f, forma_pagamento:e.target.value}))}>
                    {Object.entries(PAGAMENTO_LABEL).map(([v,l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ marginBottom:16 }}>
                <label style={s.label}>Observações</label>
                <textarea style={{ ...INP, minHeight:60, resize:"vertical", fontFamily:"inherit" } as React.CSSProperties}
                  value={form.observacoes} onChange={e => setForm(f => ({...f, observacoes:e.target.value}))}
                  placeholder="Produtos que vende, condições especiais..." />
              </div>
              <div style={{ display:"flex", gap:10, justifyContent:"flex-end" }}>
                <button onClick={() => setModal(false)} style={{ padding:"9px 18px", borderRadius:10, border:"1.5px solid #d8d0c0", background:"transparent", color:"#5a6a5a", fontSize:13, cursor:"pointer" }}>Cancelar</button>
                <button onClick={salvar} disabled={!form.nome || salvando} style={{ padding:"9px 18px", borderRadius:10, border:"none", background:form.nome&&!salvando?green:"#a0b890", color:"#fff", fontSize:13, fontWeight:600, cursor:form.nome&&!salvando?"pointer":"not-allowed" }}>
                  {salvando ? "Salvando..." : "Salvar fornecedor"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
