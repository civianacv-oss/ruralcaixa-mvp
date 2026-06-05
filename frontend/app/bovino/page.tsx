"use client";
import { useState, useEffect } from "react";

const API = process.env.NEXT_PUBLIC_API_URL || "https://ruralcaixa-mvp-production.up.railway.app";

// ─── Types ───────────────────────────────────────────────────
type Aptidao = "corte" | "leite" | "todos";
type TabPrincipal = "rebanho" | "corte" | "leite" | "sanitario" | "reproducao";

interface Animal {
  id: number; brinco: string; nome?: string; sexo: string;
  aptidao_manejo: string; categoria: string; status: string;
  raca_nome?: string; lote_nome?: string;
  ultimo_peso?: number; data_ultimo_peso?: string;
}
interface Dashboard {
  rebanho_por_categoria: Array<{aptidao_manejo:string;categoria:string;sexo:string;qtd:number;peso_medio_kg:number}>;
  totais: { total_corte: number; total_leite: number; total_geral: number };
  leite_30d: { volume_l: number; receita: number };
  alertas: { reforcos_sanitarios: number; femeas_prenhas: number };
}

// ─── Componente principal ────────────────────────────────────
export default function BovinoPage() {
  const [imovelId] = useState<number>(1); // TODO: pegar do contexto do produtor
  const [tab, setTab] = useState<TabPrincipal>("rebanho");
  const [aptidaoFiltro, setAptidaoFiltro] = useState<Aptidao>("todos");
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [animais, setAnimais] = useState<Animal[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formTipo, setFormTipo] = useState<"animal"|"pesagem"|"leite"|"sanitario">("animal");

  // ── Fetch dashboard ──────────────────────────────────────
  useEffect(() => {
    fetch(`${API}/bovino/dashboard/${imovelId}`)
      .then(r => r.json())
      .then(setDashboard)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [imovelId]);

  // ── Fetch animais quando muda tab/filtro ─────────────────
  useEffect(() => {
    if (tab !== "rebanho" && tab !== "corte" && tab !== "leite") return;
    const ap = tab === "corte" ? "corte" : tab === "leite" ? "leite" : aptidaoFiltro === "todos" ? undefined : aptidaoFiltro;
    const qs = ap ? `?aptidao=${ap}` : "";
    fetch(`${API}/bovino/animais/${imovelId}${qs}`)
      .then(r => r.json())
      .then(setAnimais)
      .catch(console.error);
  }, [tab, aptidaoFiltro, imovelId]);

  // ─────────────────────────────────────────────────────────
  return (
    <div style={{ fontFamily: "'Nunito', sans-serif", minHeight: "100vh", background: "#f5f7f0", color: "#1a2e12" }}>
      {/* Header */}
      <div style={{ background: "linear-gradient(135deg, #1a5c0f 0%, #2d7a1a 50%, #3a8f22 100%)", padding: "16px 20px 0", color: "#fff" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 11, opacity: 0.7, letterSpacing: 2, textTransform: "uppercase" }}>RuralCaixa</div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: -0.5 }}>🐄 Módulo Bovino</h1>
          </div>
          <button
            onClick={() => { setShowForm(true); setFormTipo("animal"); }}
            style={{ background: "#fff", color: "#1a5c0f", border: "none", borderRadius: 20, padding: "8px 16px", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
            + Animal
          </button>
        </div>
        {/* Tabs */}
        <div style={{ display: "flex", gap: 4, overflowX: "auto", paddingBottom: 0 }}>
          {([
            { key: "rebanho", label: "Rebanho", emoji: "📊" },
            { key: "corte",   label: "Corte",   emoji: "🥩" },
            { key: "leite",   label: "Leite",   emoji: "🥛" },
            { key: "sanitario", label: "Saúde", emoji: "💉" },
            { key: "reproducao", label: "Reprodução", emoji: "🐮" },
          ] as {key:TabPrincipal;label:string;emoji:string}[]).map(t => (
            <button key={t.key} onClick={() => setTab(t.key)} style={{
              background: tab === t.key ? "#fff" : "transparent",
              color: tab === t.key ? "#1a5c0f" : "rgba(255,255,255,0.8)",
              border: "none", borderRadius: "8px 8px 0 0", padding: "8px 14px",
              fontWeight: 700, fontSize: 13, cursor: "pointer", whiteSpace: "nowrap",
              transition: "all 0.2s"
            }}>
              {t.emoji} {t.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding: "16px 16px 80px" }}>

        {/* ── TAB: REBANHO / DASHBOARD ── */}
        {tab === "rebanho" && (
          <div>
            {loading ? <Skeleton /> : dashboard && (
              <>
                {/* Cards de resumo */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
                  <Card cor="#1a5c0f" titulo="Total Rebanho" valor={dashboard.totais.total_geral} sub="animais ativos" emoji="🐄" />
                  <Card cor="#8B4513" titulo="Corte" valor={dashboard.totais.total_corte} sub="animais" emoji="🥩" />
                  <Card cor="#2563eb" titulo="Leite" valor={dashboard.totais.total_leite} sub="animais" emoji="🥛" />
                  <Card cor="#7c3aed" titulo="Fêmeas Prenhas" valor={dashboard.alertas.femeas_prenhas} sub="aguardando parto" emoji="🤰" />
                </div>

                {/* Leite 30 dias */}
                {dashboard.totais.total_leite > 0 && (
                  <div style={{ background: "#fff", borderRadius: 12, padding: 16, marginBottom: 12, border: "1px solid #e5e7eb" }}>
                    <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10, color: "#2563eb" }}>🥛 Produção de Leite — últimos 30 dias</div>
                    <div style={{ display: "flex", gap: 16 }}>
                      <div>
                        <div style={{ fontSize: 24, fontWeight: 800, color: "#1e40af" }}>{Number(dashboard.leite_30d.volume_l).toLocaleString("pt-BR", {maximumFractionDigits:0})} L</div>
                        <div style={{ fontSize: 11, color: "#6b7280" }}>volume produzido</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 24, fontWeight: 800, color: "#059669" }}>R$ {Number(dashboard.leite_30d.receita).toLocaleString("pt-BR", {minimumFractionDigits:2})}</div>
                        <div style={{ fontSize: 11, color: "#6b7280" }}>receita estimada</div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Alertas */}
                {dashboard.alertas.reforcos_sanitarios > 0 && (
                  <AlertBanner
                    texto={`${dashboard.alertas.reforcos_sanitarios} vacina(s)/reforço(s) nos próximos 30 dias`}
                    cor="#f59e0b"
                    emoji="💉"
                  />
                )}

                {/* Tabela rebanho por categoria */}
                <div style={{ background: "#fff", borderRadius: 12, overflow: "hidden", border: "1px solid #e5e7eb", marginTop: 12 }}>
                  <div style={{ padding: "12px 16px", fontWeight: 700, fontSize: 13, borderBottom: "1px solid #f3f4f6", background: "#f9fafb" }}>
                    Composição do Rebanho
                  </div>
                  {dashboard.rebanho_por_categoria.length === 0 ? (
                    <div style={{ padding: 20, textAlign: "center", color: "#9ca3af", fontSize: 13 }}>Nenhum animal cadastrado</div>
                  ) : (
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                      <thead>
                        <tr style={{ background: "#f9fafb" }}>
                          <th style={thStyle}>Categoria</th>
                          <th style={thStyle}>Aptidão</th>
                          <th style={thStyle}>Qtd</th>
                          <th style={thStyle}>Peso Médio</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dashboard.rebanho_por_categoria.map((r, i) => (
                          <tr key={i} style={{ borderTop: "1px solid #f3f4f6" }}>
                            <td style={tdStyle}>{capitalize(r.categoria)}</td>
                            <td style={tdStyle}>
                              <span style={{ background: r.aptidao_manejo === "leite" ? "#dbeafe" : "#fef3c7", color: r.aptidao_manejo === "leite" ? "#1d4ed8" : "#92400e", borderRadius: 6, padding: "2px 6px", fontSize: 11, fontWeight: 600 }}>
                                {r.aptidao_manejo.toUpperCase()}
                              </span>
                            </td>
                            <td style={{ ...tdStyle, fontWeight: 700 }}>{r.qtd}</td>
                            <td style={tdStyle}>{r.peso_medio_kg ? `${r.peso_medio_kg} kg` : "-"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* ── TAB: CORTE / LEITE / REBANHO (lista animais) ── */}
        {(tab === "corte" || tab === "leite") && (
          <div>
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <button onClick={() => { setShowForm(true); setFormTipo("animal"); }}
                style={{ background: "#1a5c0f", color: "#fff", border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                + Novo Animal
              </button>
              {tab === "leite" && (
                <button onClick={() => { setShowForm(true); setFormTipo("leite"); }}
                  style={{ background: "#2563eb", color: "#fff", border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                  + Produção
                </button>
              )}
              {tab === "corte" && (
                <button onClick={() => { setShowForm(true); setFormTipo("pesagem"); }}
                  style={{ background: "#8B4513", color: "#fff", border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                  + Pesagem
                </button>
              )}
            </div>

            {animais.length === 0 ? (
              <EmptyState aptidao={tab} />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {animais.map(a => <AnimalCard key={a.id} animal={a} />)}
              </div>
            )}
          </div>
        )}

        {/* ── TAB: SANITÁRIO ── */}
        {tab === "sanitario" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
              <div style={{ fontWeight: 700, fontSize: 15 }}>Controle Sanitário</div>
              <button onClick={() => { setShowForm(true); setFormTipo("sanitario"); }}
                style={{ background: "#7c3aed", color: "#fff", border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                + Evento
              </button>
            </div>
            <SanitarioTab imovelId={imovelId} />
          </div>
        )}

        {/* ── TAB: REPRODUÇÃO ── */}
        {tab === "reproducao" && (
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12 }}>Controle Reprodutivo</div>
            <ReproducaoTab imovelId={imovelId} />
          </div>
        )}
      </div>

      {/* Modal de Formulário */}
      {showForm && (
        <FormModal
          tipo={formTipo}
          imovelId={imovelId}
          onClose={() => setShowForm(false)}
          onSaved={() => {
            setShowForm(false);
            // Recarrega dados relevantes
            window.location.reload();
          }}
        />
      )}
    </div>
  );
}

// ─── Sub-componentes ─────────────────────────────────────────
function Card({ cor, titulo, valor, sub, emoji }: { cor:string;titulo:string;valor:number;sub:string;emoji:string }) {
  return (
    <div style={{ background: "#fff", borderRadius: 12, padding: "14px", border: `2px solid ${cor}20` }}>
      <div style={{ fontSize: 22 }}>{emoji}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: cor }}>{valor}</div>
      <div style={{ fontSize: 12, fontWeight: 700, color: "#374151" }}>{titulo}</div>
      <div style={{ fontSize: 11, color: "#9ca3af" }}>{sub}</div>
    </div>
  );
}

function AlertBanner({ texto, cor, emoji }: { texto:string;cor:string;emoji:string }) {
  return (
    <div style={{ background: `${cor}15`, border: `1px solid ${cor}40`, borderRadius: 10, padding: "10px 14px", display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}>
      <span style={{ fontSize: 18 }}>{emoji}</span>
      <span style={{ fontSize: 13, fontWeight: 600, color: "#92400e" }}>{texto}</span>
    </div>
  );
}

function AnimalCard({ animal }: { animal: Animal }) {
  const corAptidao = animal.aptidao_manejo === "leite" ? "#2563eb" : "#8B4513";
  const bgAptidao  = animal.aptidao_manejo === "leite" ? "#dbeafe"  : "#fef3c7";
  return (
    <div style={{ background: "#fff", borderRadius: 12, padding: 14, border: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <div>
        <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 4 }}>
          <span style={{ fontWeight: 800, fontSize: 15 }}>{animal.brinco}</span>
          {animal.nome && <span style={{ fontSize: 12, color: "#6b7280" }}>• {animal.nome}</span>}
          <span style={{ background: bgAptidao, color: corAptidao, fontSize: 10, fontWeight: 700, borderRadius: 4, padding: "1px 5px" }}>
            {animal.aptidao_manejo.toUpperCase()}
          </span>
        </div>
        <div style={{ fontSize: 12, color: "#6b7280" }}>
          {capitalize(animal.categoria)} • {animal.sexo === "M" ? "Macho" : "Fêmea"}
          {animal.raca_nome ? ` • ${animal.raca_nome}` : ""}
          {animal.lote_nome ? ` • Lote: ${animal.lote_nome}` : ""}
        </div>
      </div>
      <div style={{ textAlign: "right" }}>
        {animal.ultimo_peso && (
          <div style={{ fontWeight: 700, fontSize: 14, color: "#1a5c0f" }}>{animal.ultimo_peso} kg</div>
        )}
        {animal.data_ultimo_peso && (
          <div style={{ fontSize: 11, color: "#9ca3af" }}>{new Date(animal.data_ultimo_peso).toLocaleDateString("pt-BR")}</div>
        )}
      </div>
    </div>
  );
}

function SanitarioTab({ imovelId }: { imovelId: number }) {
  const [reforcos, setReforcos] = useState<any[]>([]);
  useEffect(() => {
    fetch(`${API}/bovino/sanitario/${imovelId}/proximos?dias=60`)
      .then(r => r.json()).then(setReforcos).catch(() => setReforcos([]));
  }, [imovelId]);

  return (
    <div>
      <div style={{ fontWeight: 600, fontSize: 13, color: "#6b7280", marginBottom: 8 }}>Reforços nos próximos 60 dias</div>
      {reforcos.length === 0 ? (
        <div style={{ background: "#f0fdf4", borderRadius: 10, padding: 20, textAlign: "center", color: "#166534", fontSize: 13 }}>
          ✅ Nenhum reforço previsto. Rebanho em dia!
        </div>
      ) : reforcos.map((r, i) => (
        <div key={i} style={{ background: "#fff", borderRadius: 10, padding: 12, marginBottom: 8, border: "1px solid #fbbf24" }}>
          <div style={{ fontWeight: 700, fontSize: 13 }}>{r.produto}</div>
          <div style={{ fontSize: 12, color: "#6b7280" }}>
            {r.animal_nome || r.lote_nome || "Lote"} • {r.tipo}
          </div>
          <div style={{ fontSize: 12, color: "#d97706", fontWeight: 600, marginTop: 4 }}>
            📅 Reforço: {new Date(r.data_reforco).toLocaleDateString("pt-BR")}
          </div>
        </div>
      ))}
    </div>
  );
}

function ReproducaoTab({ imovelId }: { imovelId: number }) {
  const [prenhas, setPrenhas] = useState<any[]>([]);
  useEffect(() => {
    fetch(`${API}/bovino/reproducao/${imovelId}/prenhas`)
      .then(r => r.json()).then(setPrenhas).catch(() => setPrenhas([]));
  }, [imovelId]);

  return (
    <div>
      <div style={{ fontWeight: 600, fontSize: 13, color: "#6b7280", marginBottom: 8 }}>Fêmeas Prenhas</div>
      {prenhas.length === 0 ? (
        <div style={{ background: "#faf5ff", borderRadius: 10, padding: 20, textAlign: "center", color: "#6d28d9", fontSize: 13 }}>
          Nenhuma fêmea prenha registrada
        </div>
      ) : prenhas.map((p, i) => (
        <div key={i} style={{ background: "#fff", borderRadius: 10, padding: 12, marginBottom: 8, border: "1px solid #c4b5fd" }}>
          <div style={{ fontWeight: 700 }}>{p.femea_nome || p.brinco}</div>
          <div style={{ fontSize: 12, color: "#6b7280" }}>{p.metodo?.replace("_", " ")}</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#7c3aed", marginTop: 4 }}>
            🐣 Parto previsto: {new Date(p.data_parto_prev).toLocaleDateString("pt-BR")}
            {p.dias_para_parto !== null && (
              <span style={{ marginLeft: 8, fontSize: 11, color: "#9ca3af" }}>({p.dias_para_parto} dias)</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState({ aptidao }: { aptidao: string }) {
  const emoji = aptidao === "leite" ? "🥛" : "🥩";
  const label = aptidao === "leite" ? "leite" : "corte";
  return (
    <div style={{ background: "#f9fafb", borderRadius: 14, padding: 32, textAlign: "center", border: "2px dashed #d1d5db" }}>
      <div style={{ fontSize: 40, marginBottom: 8 }}>{emoji}</div>
      <div style={{ fontWeight: 700, fontSize: 15, color: "#374151", marginBottom: 4 }}>
        Nenhum animal de {label} cadastrado
      </div>
      <div style={{ fontSize: 13, color: "#9ca3af" }}>Toque em "+ Novo Animal" para começar</div>
    </div>
  );
}

function Skeleton() {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
      {[1,2,3,4].map(i => (
        <div key={i} style={{ height: 90, background: "#e5e7eb", borderRadius: 12, animation: "pulse 1.5s ease-in-out infinite" }} />
      ))}
    </div>
  );
}

// ─── Modal formulário ────────────────────────────────────────
function FormModal({ tipo, imovelId, onClose, onSaved }: {
  tipo: "animal"|"pesagem"|"leite"|"sanitario";
  imovelId: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<Record<string,any>>({});
  const [racas, setRacas] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => {
    if (tipo === "animal") {
      fetch(`${API}/bovino/racas`).then(r => r.json()).then(setRacas).catch(() => {});
    }
  }, [tipo]);

  const set = (k: string, v: any) => setForm(prev => ({ ...prev, [k]: v }));

  async function salvar() {
    setSaving(true); setErro("");
    try {
      let url = "", body: any = {};
      if (tipo === "animal") {
        url = `${API}/bovino/animais`;
        body = { imovel_id: imovelId, ...form };
      } else if (tipo === "pesagem") {
        url = `${API}/bovino/pesagens`;
        body = { ...form, data: form.data || new Date().toISOString().slice(0,10) };
      } else if (tipo === "leite") {
        url = `${API}/bovino/leite/producao`;
        body = { imovel_id: imovelId, ...form, data: form.data || new Date().toISOString().slice(0,10) };
      } else if (tipo === "sanitario") {
        url = `${API}/bovino/sanitario`;
        body = { ...form, data_aplicacao: form.data_aplicacao || new Date().toISOString().slice(0,10) };
      }
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) { const e = await res.json(); throw new Error(e.detail || "Erro ao salvar"); }
      onSaved();
    } catch (e: any) {
      setErro(e.message || "Erro desconhecido");
    } finally { setSaving(false); }
  }

  const titulos: Record<string,string> = { animal: "🐄 Novo Animal", pesagem: "⚖️ Registrar Pesagem", leite: "🥛 Produção de Leite", sanitario: "💉 Evento Sanitário" };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", alignItems: "flex-end" }}>
      <div style={{ background: "#fff", borderRadius: "20px 20px 0 0", padding: "20px 20px 40px", width: "100%", maxHeight: "85vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
          <div style={{ fontWeight: 800, fontSize: 17 }}>{titulos[tipo]}</div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer" }}>✕</button>
        </div>

        {tipo === "animal" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Field label="Brinco / Nº *" value={form.brinco||""} onChange={v => set("brinco",v)} />
            <Field label="Nome (opcional)" value={form.nome||""} onChange={v => set("nome",v)} />
            <SelectField label="Aptidão de Manejo *" value={form.aptidao_manejo||""} onChange={v => set("aptidao_manejo",v)}
              options={[{value:"corte",label:"Corte 🥩"},{value:"leite",label:"Leite 🥛"}]} />
            <SelectField label="Categoria *" value={form.categoria||""} onChange={v => set("categoria",v)}
              options={["bezerro","bezerra","novilho","novilha","garrote","garrotas","touro","vaca","boi"].map(c => ({value:c,label:capitalize(c)}))} />
            <SelectField label="Sexo *" value={form.sexo||""} onChange={v => set("sexo",v)}
              options={[{value:"M",label:"Macho"},{value:"F",label:"Fêmea"}]} />
            <SelectField label="Raça" value={form.raca_id||""} onChange={v => set("raca_id", v ? Number(v) : undefined)}
              options={racas.map(r => ({value:String(r.id),label:`${r.nome} (${r.aptidao})`}))} />
            <SelectField label="Origem" value={form.origem||"nascimento"} onChange={v => set("origem",v)}
              options={[{value:"nascimento",label:"Nascimento"},{value:"compra",label:"Compra"},{value:"transferencia",label:"Transferência"}]} />
            <DateField label="Data de Entrada" value={form.data_entrada||""} onChange={v => set("data_entrada",v)} />
            {form.origem === "compra" && <NumField label="Valor de Aquisição (R$)" value={form.valor_aquisicao||""} onChange={v => set("valor_aquisicao",v)} />}
          </div>
        )}

        {tipo === "pesagem" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <NumField label="ID do Animal *" value={form.animal_id||""} onChange={v => set("animal_id", Number(v))} />
            <DateField label="Data *" value={form.data||""} onChange={v => set("data",v)} />
            <NumField label="Peso (kg) *" value={form.peso_kg||""} onChange={v => set("peso_kg",Number(v))} />
            <SelectField label="Motivo" value={form.motivo||"rotina"} onChange={v => set("motivo",v)}
              options={["nascimento","entrada","saida","rotina","desmame","outro"].map(m => ({value:m,label:capitalize(m)}))} />
          </div>
        )}

        {tipo === "leite" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <DateField label="Data *" value={form.data||""} onChange={v => set("data",v)} />
            <NumField label="Volume (litros) *" value={form.volume_l||""} onChange={v => set("volume_l",Number(v))} />
            <SelectField label="Turno" value={form.turno||"total"} onChange={v => set("turno",v)}
              options={[{value:"total",label:"Total do dia"},{value:"manha",label:"Manhã"},{value:"tarde",label:"Tarde"}]} />
            <SelectField label="Destinação" value={form.destinacao||"venda"} onChange={v => set("destinacao",v)}
              options={[{value:"venda",label:"Venda"},{value:"autoconsumo",label:"Autoconsumo"},{value:"bezerros",label:"Bezerros"},{value:"descarte",label:"Descarte"}]} />
            <NumField label="Preço por Litro (R$)" value={form.preco_litro||""} onChange={v => set("preco_litro",Number(v))} />
          </div>
        )}

        {tipo === "sanitario" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <NumField label="ID do Animal (ou deixe em branco para lote)" value={form.animal_id||""} onChange={v => set("animal_id", v ? Number(v) : undefined)} />
            <SelectField label="Tipo *" value={form.tipo||""} onChange={v => set("tipo",v)}
              options={["vacina","vermifugacao","carrapaticida","medicamento","exame","outro"].map(m => ({value:m,label:capitalize(m)}))} />
            <Field label="Produto *" value={form.produto||""} onChange={v => set("produto",v)} />
            <NumField label="Dose (ml)" value={form.dose_ml||""} onChange={v => set("dose_ml",Number(v))} />
            <DateField label="Data de Aplicação *" value={form.data_aplicacao||""} onChange={v => set("data_aplicacao",v)} />
            <DateField label="Data do Reforço" value={form.data_reforco||""} onChange={v => set("data_reforco",v)} />
            <NumField label="Custo Total (R$)" value={form.custo_total||""} onChange={v => set("custo_total",Number(v))} />
          </div>
        )}

        {erro && <div style={{ color: "#dc2626", fontSize: 13, marginTop: 10, padding: "8px 12px", background: "#fef2f2", borderRadius: 8 }}>{erro}</div>}

        <button onClick={salvar} disabled={saving}
          style={{ marginTop: 20, width: "100%", background: saving ? "#9ca3af" : "#1a5c0f", color: "#fff", border: "none", borderRadius: 12, padding: 14, fontWeight: 800, fontSize: 15, cursor: saving ? "default" : "pointer" }}>
          {saving ? "Salvando..." : "Salvar"}
        </button>
      </div>
    </div>
  );
}

// ─── Field helpers ───────────────────────────────────────────
const inputStyle: React.CSSProperties = { width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 14, boxSizing: "border-box", background: "#f9fafb" };
const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 4, display: "block" };

function Field({ label, value, onChange }: { label:string;value:string;onChange:(v:string)=>void }) {
  return <div><label style={labelStyle}>{label}</label><input style={inputStyle} value={value} onChange={e => onChange(e.target.value)} /></div>;
}
function NumField({ label, value, onChange }: { label:string;value:any;onChange:(v:string)=>void }) {
  return <div><label style={labelStyle}>{label}</label><input type="number" style={inputStyle} value={value} onChange={e => onChange(e.target.value)} /></div>;
}
function DateField({ label, value, onChange }: { label:string;value:string;onChange:(v:string)=>void }) {
  return <div><label style={labelStyle}>{label}</label><input type="date" style={inputStyle} value={value} onChange={e => onChange(e.target.value)} /></div>;
}
function SelectField({ label, value, onChange, options }: { label:string;value:string;onChange:(v:string)=>void;options:{value:string;label:string}[] }) {
  return (
    <div><label style={labelStyle}>{label}</label>
      <select style={inputStyle} value={value} onChange={e => onChange(e.target.value)}>
        <option value="">Selecione...</option>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

const thStyle: React.CSSProperties = { padding: "8px 12px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.5 };
const tdStyle: React.CSSProperties = { padding: "10px 12px", fontSize: 13 };
function capitalize(s: string) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : ""; }
