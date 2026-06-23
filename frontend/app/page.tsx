"use client";
import { useState, useEffect } from "react";
import GuiaInicio from "@/components/GuiaInicio";

const API = "https://ruralcaixa-mvp-production.up.railway.app";
const IMOVEL_ID = 1;

// ── tipos ─────────────────────────────────────────────────────
type Lancamento = {
  id: number; descricao: string; tipo: string; valor: number;
  data_lancamento: string; confirmado: boolean; conta_codigo: string;
  produto: string | null; atividade: string | null;
};

// ── helpers ───────────────────────────────────────────────────
function fmtBRL(v: number) {
  return "R$ " + v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtDate(s: string) {
  return new Date(s + "T00:00:00").toLocaleDateString("pt-BR");
}

// ── icones SVG inline ─────────────────────────────────────────
const Icons = {
  crops: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2a10 10 0 0 1 10 10"/><path d="M12 2a10 10 0 0 0-10 10"/><path d="M12 12v10"/><path d="M12 12c0-4 2-7 5-9"/><path d="M12 12c0-4-2-7-5-9"/></svg>,
  dashboard: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>,
  property:  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>,
  animals:   <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>,
  health:    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>,
  reproduce: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22V12m0 0C12 7 7 4 3 6m9 6c0-5 5-8 9-6"/></svg>,
  financial: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>,
  reports:   <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>,
  contracts: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>,
  users:     <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  settings:  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14"/></svg>,
  plus:      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  trend_up:  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>,
  trend_dn:  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/></svg>,
  sheep:     <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><ellipse cx="12" cy="11" rx="6" ry="5"/><circle cx="8" cy="8" r="2.5"/><circle cx="16" cy="8" r="2.5"/><circle cx="12" cy="6" r="2"/><line x1="9" y1="16" x2="8" y2="20"/><line x1="15" y1="16" x2="16" y2="20"/></svg>,
  menu:      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>,
  plant:     <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22V12"/><path d="M12 12C12 7 7 4 3 6"/><path d="M12 12c0-5 5-8 9-6"/><path d="M5 20c2-2 4-3 7-3s5 1 7 3"/></svg>,
  document:  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="15" y2="17"/><line x1="9" y1="9" x2="11" y2="9"/></svg>,
};

// ── componente principal ──────────────────────────────────────
export default function Dashboard() {
  const [activeMenu, setActiveMenu] = useState("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([]);
  const [animaisAtivos, setAnimaisAtivos] = useState(0);
  const [showEspecieModal, setShowEspecieModal] = useState(false);
  const [totalAnimaisEspecie, setTotalAnimaisEspecie] = useState({ovino:0,bovino:0,caprino:0,suino:0});
  const [financeiro, setFinanceiro] = useState({receitas:0,despesas:0,saldo:0});
  const [loading, setLoading] = useState(true);
  const [safrasAtivas, setSafrasAtivas] = useState(0);
  const [safrasResumo, setSafrasResumo] = useState<any[]>([]);
  const [novoLanc, setNovoLanc] = useState({tipo:"despesa",valor:"",descricao:"",conta:"2.1"});
  const [salvando, setSalvando] = useState(false);

  useEffect(() => { carregarDados(); }, []);

  async function carregarDados() {
    setLoading(true);
    try {
      const [lancs, animais] = await Promise.all([
        fetch(`${API}/produtores/1/lancamentos`).then(r => r.json()).catch(() => []),
        fetch(`${API}/ovino/animais?imovel_id=${IMOVEL_ID}&status=ativo`).then(r => r.json()).catch(() => []),
      ]);
      const ls = Array.isArray(lancs) ? lancs : [];
      setLancamentos(ls);
      const rec = ls.filter((l:Lancamento) => l.tipo==="receita").reduce((s:number,l:Lancamento)=>s+l.valor,0);
      const desp = ls.filter((l:Lancamento) => l.tipo==="despesa").reduce((s:number,l:Lancamento)=>s+l.valor,0);
      setFinanceiro({receitas:rec,despesas:desp,saldo:rec-desp});
      const anim = Array.isArray(animais) ? animais : [];
      fetch(`${API}/bovino/animais/1?status=ativo`).then(r=>r.json()).catch(()=>[]).then(bov=>{
        const bovCount = Array.isArray(bov) ? bov.length : 0;
        setAnimaisAtivos(anim.length + bovCount);
        setTotalAnimaisEspecie({ovino:anim.length,bovino:bovCount,caprino:0,suino:0});
      });
    } catch(e) { console.error(e); }
    // Buscar safras ativas
    try {
      const resSafras = await fetch(`${API}/agricultura/imoveis/1/safras/resumo`);
      if (resSafras.ok) {
        const dataSafras = await resSafras.json();
        const arr = Array.isArray(dataSafras) ? dataSafras : [];
        setSafrasResumo(arr);
        setSafrasAtivas(arr.filter((s: any) => ['em_andamento','colhida','planejada'].includes(s.status)).length);
      }
    } catch(e) { console.error('safras', e); }
    setLoading(false);
  }

  // ── sidebar nav ──────────────────────────────────────────────
  const navGestao = [
    {id:"dashboard",   label:"Painel Principal",        icon:Icons.dashboard,  href:"/"},
    {id:"propriedades",label:"Propriedades",      icon:Icons.property,   href:"/cadastro"},
    {id:"contratos",   label:"Contratos Rurais",  icon:Icons.contracts,  href:"/contratos"},
    {id:"lancamentos", label:"Lançamentos",        icon:Icons.financial,  href:"/lancamentos"},
    {id:"rebanhos",    label:"Rebanhos",          icon:Icons.animals,    href:"/rebanho"},
    {id:"agricultura", label:"Agricultura",        icon:Icons.crops,      href:"/agricultura"},
    {id:"saude",       label:"Saúde Animal",      icon:Icons.health,     href:"/bovino"},
    {id:"reproducao",  label:"Reprodução",        icon:Icons.reproduce,  href:"/bovino"},
    {id:"financeiro",  label:"Financeiro",        icon:Icons.financial,  href:"/relatorio"},
    {id:"relatorios",  label:"Relatórios",        icon:Icons.reports,    href:"/relatorio"},
    {id:"nfe",         label:"NF-e Produtor",      icon:Icons.financial,  href:"/nfe"},
    {id:"esocial",     label:"eSocial Rural",      icon:Icons.users,      href:"/esocial"},
    {id:"compravenda", label:"Compra e Venda",       icon:Icons.financial,  href:"/compravenda"},
    {id:"acai",         label:"Cultivo de Açaí",       icon:Icons.plant,      href:"/acai"},
    {id:"efdreinf",     label:"EFD-Reinf / DARF",       icon:Icons.document,   href:"/efdreinf"},
  ];
  const navAdmin = [
    {id:"usuarios",     label:"Usuários",        icon:Icons.users,     href:"/terceiros"},
    {id:"configuracoes",label:"Configurações",   icon:Icons.settings,  href:"/"},
  ];

  const especieBar = [
    {label:"Bovinos",  key:"bovino",  color:"#7c9e6b", icon:"🐄"},
    {label:"Suínos",   key:"suino",   color:"#c49a6c", icon:"🐖"},
    {label:"Ovinos",   key:"ovino",   color:"#8faa7d", icon:"🐑"},
    {label:"Caprinos", key:"caprino", color:"#b5a87d", icon:"🐐"},
  ];
  const maxEspecie = Math.max(...Object.values(totalAnimaisEspecie), 1);

  return (
    <div style={{display:"flex",height:"100vh",fontFamily:"'DM Sans',system-ui,sans-serif",background:"#f5f0e8",overflow:"hidden"}}>
      <GuiaInicio />

      {/* ── SIDEBAR ──────────────────────────────────────────── */}
      <aside style={{
        width: sidebarOpen ? 220 : 0,
        minWidth: sidebarOpen ? 220 : 0,
        background:"#1a2e1a",
        color:"#e8e0d0",
        display:"flex",
        flexDirection:"column",
        transition:"all 0.3s ease",
        overflow:"hidden",
        flexShrink:0,
      }}>
        {/* logo */}
        <div style={{padding:"20px 20px 8px",borderBottom:"1px solid #2d4a2d"}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <div style={{background:"#5a8a3a",borderRadius:8,width:34,height:34,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18}}>🌿</div>
            <div>
              <div style={{fontWeight:700,fontSize:15,color:"#e8e0d0",letterSpacing:"-0.3px"}}>RuralCaixa</div>
              <div style={{fontSize:10,color:"#7a9a6a",letterSpacing:"2px",textTransform:"uppercase"}}>Rural</div>
            </div>
          </div>
        </div>

        {/* nav gestão */}
        <div style={{padding:"16px 8px 8px",flex:1,overflowY:"auto"}}>
          <div style={{fontSize:10,color:"#5a7a5a",letterSpacing:"2px",textTransform:"uppercase",padding:"0 12px",marginBottom:8}}>Gestão</div>
          {navGestao.map(item => (
            <a key={item.id} href={item.href || "#"}
              onClick={() => setActiveMenu(item.id)}
              style={{
                display:"flex",alignItems:"center",gap:10,
                padding:"9px 12px",borderRadius:8,marginBottom:2,
                color: activeMenu===item.id ? "#c8e6b0" : "#a0b890",
                background: activeMenu===item.id ? "#2d4a2d" : "transparent",
                textDecoration:"none",fontSize:13.5,fontWeight:activeMenu===item.id?600:400,
                cursor:"pointer",transition:"all 0.15s",
              }}>
              <span style={{opacity:activeMenu===item.id?1:0.7}}>{item.icon}</span>
              {item.label}
              {activeMenu===item.id && <div style={{marginLeft:"auto",width:6,height:6,borderRadius:"50%",background:"#7ac05a"}}/>}
            </a>
          ))}

          <div style={{fontSize:10,color:"#5a7a5a",letterSpacing:"2px",textTransform:"uppercase",padding:"16px 12px 8px",marginTop:8}}>Administração</div>
          {navAdmin.map(item => (
            <a key={item.id} href="#"
              onClick={e => {e.preventDefault();setActiveMenu(item.id);}}
              style={{
                display:"flex",alignItems:"center",gap:10,
                padding:"9px 12px",borderRadius:8,marginBottom:2,
                color: activeMenu===item.id ? "#c8e6b0" : "#a0b890",
                background: activeMenu===item.id ? "#2d4a2d" : "transparent",
                textDecoration:"none",fontSize:13.5,cursor:"pointer",transition:"all 0.15s",
              }}>
              <span style={{opacity:0.7}}>{item.icon}</span>
              {item.label}
            </a>
          ))}
        </div>

        {/* fazenda */}
        <div style={{padding:"12px 16px",borderTop:"1px solid #2d4a2d",fontSize:12,color:"#7a9a6a"}}>
          <div style={{fontWeight:600,color:"#a8c890",marginBottom:2}}>Fazenda Boa Esperança</div>
          <div>Imóvel #1 · Maranhão</div>
        </div>
      </aside>

      {/* ── MAIN ─────────────────────────────────────────────── */}
      <main style={{flex:1,overflowY:"auto",display:"flex",flexDirection:"column"}}>

        {/* topbar */}
        <header style={{
          background:"#f5f0e8",
          borderBottom:"1px solid #e0d8c8",
          padding:"14px 28px",
          display:"flex",alignItems:"center",gap:16,
          position:"sticky",top:0,zIndex:10,
        }}>
          <button onClick={()=>setSidebarOpen(!sidebarOpen)}
            style={{background:"none",border:"none",cursor:"pointer",color:"#4a6a3a",padding:4}}>
            {Icons.menu}
          </button>
          <div>
            <h1 style={{margin:0,fontSize:22,fontWeight:700,color:"#1a2e1a",letterSpacing:"-0.5px"}}>Painel Principal</h1>
            <p style={{margin:0,fontSize:13,color:"#7a8a6a"}}>Visão geral da sua operação agropecuária</p>
          </div>
          <div style={{marginLeft:"auto",display:"flex",gap:8}}>
            <a href="/lancamentos" style={{
              background:"#3a6a2a",color:"#fff",border:"none",
              padding:"8px 16px",borderRadius:8,fontSize:13,fontWeight:600,
              textDecoration:"none",display:"flex",alignItems:"center",gap:6,cursor:"pointer",
            }}>
              {Icons.plus} Novo Lançamento
            </a>
          </div>
        </header>

        <div style={{padding:"24px 28px",flex:1}}>

          {/* ── KPI CARDS ──────────────────────────────────── */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:16,marginBottom:24}}>
            {[
              {label:"Propriedades",    value:"1",          sub:"Imóveis cadastrados",  icon:"📍", color:"#4a6a3a"},
              {label:"Animais Ativos",  value:String(animaisAtivos), sub:"Rebanho total",icon:"🐑", color:"#5a7a4a"},
              {label:"Saldo do Ano",    value:fmtBRL(financeiro.saldo), sub:`Receitas: ${fmtBRL(financeiro.receitas)}`, icon:"💰", color:financeiro.saldo>=0?"#3a6a4a":"#8a3a3a", trend:financeiro.saldo>=0?"up":"down"},
              {label:"Lançamentos",     value:String(lancamentos.length), sub:"Registros financeiros", icon:"📋", color:"#4a5a7a"},
              {label:"Safras Ativas",    value:String(safrasAtivas), sub:"Ano-safra atual", icon:"🌾", color:"#6a7a2a"},
            ].map(k => (
              <div key={k.label} style={{
                background:"#fff",borderRadius:14,padding:"20px 22px",
                boxShadow:"0 1px 3px rgba(0,0,0,0.06)",border:"1px solid #e8e0d0",
              }}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12}}>
                  <span style={{fontSize:24}}>{k.icon}</span>
                  {k.trend && <span style={{fontSize:11,color:k.trend==="up"?"#3a8a4a":"#8a3a3a",display:"flex",alignItems:"center",gap:3,background:k.trend==="up"?"#e8f5e9":"#fce8e8",padding:"3px 8px",borderRadius:20}}>
                    {k.trend==="up" ? Icons.trend_up : Icons.trend_dn}
                    {k.trend==="up"?"Positivo":"Negativo"}
                  </span>}
                </div>
                <div style={{fontSize:28,fontWeight:700,color:k.color,letterSpacing:"-1px",lineHeight:1}}>{k.value}</div>
                <div style={{fontSize:13,color:"#4a5a4a",fontWeight:500,marginTop:4}}>{k.label}</div>
                <div style={{fontSize:12,color:"#8a9a8a",marginTop:2}}>{k.sub}</div>
              </div>
            ))}
          </div>

          {/* ── LINHA 2: Rebanho | Financeiro | Saúde ────── */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:16,marginBottom:24}}>

            {/* Rebanho por espécie */}
            <div style={{background:"#fff",borderRadius:14,padding:"20px 22px",border:"1px solid #e8e0d0",boxShadow:"0 1px 3px rgba(0,0,0,0.06)"}}>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:16}}>
                <span style={{fontSize:16}}>🐄</span>
                <span style={{fontWeight:600,fontSize:14,color:"#1a2e1a"}}>Rebanho por Espécie</span>
              </div>
              {especieBar.map(e => {
                const val = totalAnimaisEspecie[e.key as keyof typeof totalAnimaisEspecie];
                const pct = Math.round((val/maxEspecie)*100);
                return (
                  <div key={e.key} style={{marginBottom:12}}>
                    <div style={{display:"flex",justifyContent:"space-between",fontSize:13,color:"#3a4a3a",marginBottom:4}}>
                      <span>{e.icon} {e.label}</span>
                      <span style={{fontWeight:600}}>{val}</span>
                    </div>
                    <div style={{background:"#eee8d8",borderRadius:4,height:6,overflow:"hidden"}}>
                      <div style={{width:`${pct}%`,height:"100%",background:e.color,borderRadius:4,transition:"width 0.5s ease"}}/>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Financeiro ano atual */}
            <div style={{background:"#fff",borderRadius:14,padding:"20px 22px",border:"1px solid #e8e0d0",boxShadow:"0 1px 3px rgba(0,0,0,0.06)"}}>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:16}}>
                <span style={{fontSize:16}}>📊</span>
                <span style={{fontWeight:600,fontSize:14,color:"#1a2e1a"}}>Financeiro — Ano Atual</span>
              </div>
              <div style={{background:"#f0faf0",borderRadius:10,padding:"12px 16px",marginBottom:8,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <span style={{fontSize:13,color:"#3a5a3a",display:"flex",alignItems:"center",gap:6}}>{Icons.trend_up} Receitas</span>
                <span style={{fontWeight:700,color:"#2a6a3a",fontSize:14}}>{fmtBRL(financeiro.receitas)}</span>
              </div>
              <div style={{background:"#fdf0f0",borderRadius:10,padding:"12px 16px",marginBottom:8,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <span style={{fontSize:13,color:"#5a3a3a",display:"flex",alignItems:"center",gap:6}}>{Icons.trend_dn} Despesas</span>
                <span style={{fontWeight:700,color:"#8a2a2a",fontSize:14}}>{fmtBRL(financeiro.despesas)}</span>
              </div>
              <div style={{borderTop:"1px solid #e8e0d0",paddingTop:10,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <span style={{fontSize:13,fontWeight:600,color:"#1a2e1a"}}>Saldo</span>
                <span style={{fontWeight:700,fontSize:16,color:financeiro.saldo>=0?"#2a6a3a":"#8a2a2a"}}>{fmtBRL(financeiro.saldo)}</span>
              </div>
            </div>

            {/* Agricultura — Safras Ativas */}
            <div style={{background:"#fff",borderRadius:14,padding:"20px 22px",border:"1px solid #e8e0d0",boxShadow:"0 1px 3px rgba(0,0,0,0.06)"}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <span style={{fontSize:16}}>🌾</span>
                  <span style={{fontWeight:600,fontSize:14,color:"#1a2e1a"}}>Agricultura</span>
                </div>
                <a href="/agricultura" style={{fontSize:12,color:"#5a8a3a",textDecoration:"none",fontWeight:600}}>Ver todas →</a>
              </div>
              {safrasResumo.length === 0 ? (
                <div style={{textAlign:"center",padding:"20px 0",color:"#8a9a8a",fontSize:13}}>
                  <div style={{fontSize:28,marginBottom:8}}>🌱</div>
                  <div>Nenhuma safra ativa</div>
                  <a href="/agricultura" style={{color:"#5a8a3a",fontSize:12,textDecoration:"none",fontWeight:600}}>Cadastrar safra →</a>
                </div>
              ) : safrasResumo.slice(0,3).map((s: any) => (
                <a key={s.id} href={`/agricultura/safras/${s.id}`} style={{textDecoration:"none"}}>
                  <div style={{background:"#f4f8ee",borderRadius:10,padding:"10px 14px",marginBottom:8,cursor:"pointer"}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                      <span style={{fontSize:13,fontWeight:600,color:"#2a4a1a"}}>{s.cultura}</span>
                      <span style={{fontSize:11,padding:"2px 8px",borderRadius:20,
                        background: s.status==="em_andamento"?"#dbeafe": s.status==="colhida"?"#dcfce7":"#f3f4f6",
                        color: s.status==="em_andamento"?"#1d4ed8": s.status==="colhida"?"#15803d":"#6b7280",
                        fontWeight:600}}>
                        {s.status==="em_andamento"?"Em andamento": s.status==="colhida"?"Colhida": s.status==="planejada"?"Planejada":"Encerrada"}
                      </span>
                    </div>
                    <div style={{fontSize:12,color:"#5a6a4a"}}>{s.ano_safra} · {Number(s.area_ha).toFixed(1)} ha</div>
                    {Number(s.margem_bruta) !== 0 && (
                      <div style={{fontSize:12,color:Number(s.margem_bruta)>=0?"#2a6a3a":"#8a2a2a",fontWeight:600,marginTop:2}}>
                        Margem: R$ {Number(s.margem_bruta).toLocaleString("pt-BR",{minimumFractionDigits:2})}
                      </div>
                    )}
                  </div>
                </a>
              ))}
            </div>
          </div>

          {/* ── ACESSO RÁPIDO ─────────────────────────────── */}
          <div style={{background:"#fff",borderRadius:14,padding:"20px 22px",border:"1px solid #e8e0d0",boxShadow:"0 1px 3px rgba(0,0,0,0.06)",marginBottom:24}}>
            <div style={{fontWeight:600,fontSize:14,color:"#1a2e1a",marginBottom:16}}>Acesso Rápido</div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12}}>
              {[
                {label:"Nova Propriedade",   icon:"📍", href:"/cadastro"},
                {label:"Cadastrar Animal",   icon:"🐑", href:"/rebanho"},
                {label:"Nova Safra",          icon:"🌾", href:"/agricultura"},
                {label:"Lançamento Financeiro", icon:"💰", href:"/lancamentos"},
              ].map(item => (
                <a key={item.label} href={item.href} 
                  style={{
                    display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
                    gap:8,padding:"18px 12px",borderRadius:12,border:"1.5px dashed #d0c8b8",
                    textDecoration:"none",color:"#4a5a4a",fontSize:13,
                    background:"#faf8f4",cursor:"pointer",transition:"all 0.15s",
                  }}
                  onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.borderColor="#5a8a3a";(e.currentTarget as HTMLElement).style.background="#f0f5eb";}}
                  onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.borderColor="#d0c8b8";(e.currentTarget as HTMLElement).style.background="#faf8f4";}}>
                  <span style={{fontSize:24}}>{item.icon}</span>
                  <span style={{textAlign:"center",lineHeight:1.3}}>{item.label}</span>
                </a>
              ))}
            </div>
          </div>

          {/* ── LANÇAMENTOS RECENTES ──────────────────────── */}
          <div style={{background:"#fff",borderRadius:14,padding:"20px 22px",border:"1px solid #e8e0d0",boxShadow:"0 1px 3px rgba(0,0,0,0.06)"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
              <span style={{fontWeight:600,fontSize:14,color:"#1a2e1a"}}>Lançamentos Recentes</span>
              <a href="/relatorio" style={{fontSize:12,color:"#5a8a3a",textDecoration:"none",fontWeight:600}}>Ver todos →</a>
            </div>
            {loading ? (
              <div style={{textAlign:"center",padding:24,color:"#8a9a8a",fontSize:13}}>Carregando...</div>
            ) : lancamentos.length === 0 ? (
              <div style={{textAlign:"center",padding:24,color:"#8a9a8a",fontSize:13}}>Nenhum lançamento registrado.</div>
            ) : (
              <div>
                {lancamentos.slice(0,6).map(l => (
                  <div key={l.id} style={{
                    display:"flex",justifyContent:"space-between",alignItems:"center",
                    padding:"10px 0",borderBottom:"1px solid #f0e8d8",
                  }}>
                    <div style={{display:"flex",alignItems:"center",gap:10}}>
                      <div style={{
                        width:8,height:8,borderRadius:"50%",flexShrink:0,
                        background:l.tipo==="receita"?"#3a8a4a":"#8a3a3a",
                      }}/>
                      <div>
                        <div style={{fontSize:13,fontWeight:500,color:"#1a2e1a"}}>{l.descricao || l.conta_codigo}</div>
                        <div style={{fontSize:11,color:"#8a9a8a"}}>{fmtDate(l.data_lancamento)}</div>
                      </div>
                    </div>
                    <div style={{
                      fontWeight:600,fontSize:14,
                      color:l.tipo==="receita"?"#2a6a3a":"#8a2a2a",
                    }}>
                      {l.tipo==="receita"?"+":"-"}{fmtBRL(Math.abs(l.valor))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      </main>
    </div>
  );
}

