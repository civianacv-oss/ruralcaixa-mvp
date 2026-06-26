"use client";
import AuthGuard from "@/lib/AuthGuard";
import { apiFetch } from "@/lib/api";
import { useState, useCallback } from "react";

const API = "https://ruralcaixa-mvp-production.up.railway.app";

// ── Tipos ─────────────────────────────────────────────────────────────
type TipoImport = "lancamentos" | "rebanho" | null;
type Etapa = "tipo" | "upload" | "mapeamento" | "validacao" | "resultado";
type Especie = "bovino" | "ovino" | "caprino" | "suino";

interface PreviewItem { linha: number; data: string; valor: number; descricao: string; tipo: string; }
interface Erro { linha: number; campo?: string; msg: string; }

const INP: React.CSSProperties = {
  width: "100%", padding: "9px 12px", borderRadius: 8,
  border: "1.5px solid #d8d0c0", fontSize: 13,
  background: "#faf8f4", color: "#1a2e1a", boxSizing: "border-box",
};

const SEL: React.CSSProperties = { ...INP };

// ── Componente principal ──────────────────────────────────────────────
export default function ImportacaoPage() {
  const [etapa, setEtapa] = useState<Etapa>("tipo");
  const [tipo, setTipo] = useState<TipoImport>(null);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [especie, setEspecie] = useState<Especie>("bovino");
  const [produtorId, setProdutorId] = useState("");
  const [imovelId, setImovelId] = useState("1");
  const [headers, setHeaders] = useState<string[]>([]);
  const [preview, setPreview] = useState<PreviewItem[]>([]);
  const [erros, setErros] = useState<Erro[]>([]);
  const [avisos, setAvisos] = useState<Erro[]>([]);
  const [totalLinhas, setTotalLinhas] = useState(0);
  const [mapaCol, setMapaCol] = useState<Record<string, string>>({});
  const [carregando, setCarregando] = useState(false);
  const [resultado, setResultado] = useState<Record<string, number> | null>(null);
  const [progresso, setProgresso] = useState(0);

  // Drag & drop
  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f) setArquivo(f);
  }, []);

  async function fazerPreview() {
    if (!arquivo) return;
    setCarregando(true);
    const form = new FormData();
    form.append("arquivo", arquivo);
    form.append("tipo_importacao", tipo || "lancamentos");
    try {
      const r = await apiFetch(`${API}/importacao/preview`, { method: "POST", body: form });
      const data = await r.json();
      if (!r.ok) throw new Error(data.detail || "Erro no preview");
      setHeaders(data.headers || []);
      setPreview(data.preview || []);
      setErros(data.erros || []);
      setAvisos(data.avisos || []);
      setTotalLinhas(data.total_linhas || 0);
      setMapaCol(data.mapa_detectado || {});
      setEtapa("mapeamento");
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Erro no preview");
    } finally {
      setCarregando(false);
    }
  }

  async function importar() {
    if (!arquivo) return;
    setCarregando(true);
    setProgresso(0);
    const form = new FormData();
    form.append("arquivo", arquivo);
    form.append("produtor_id", produtorId || "1");
    form.append("imovel_id", imovelId);
    if (tipo === "rebanho") form.append("especie", especie);
    Object.entries(mapaCol).forEach(([k, v]) => form.append(`mapa_${k}`, v));

    const endpoint = tipo === "rebanho" ? "/importacao/rebanho" : "/importacao/lancamentos";

    // Simula progresso
    const timer = setInterval(() => setProgresso(p => Math.min(p + 10, 85)), 300);
    try {
      const r = await apiFetch(`${API}${endpoint}`, { method: "POST", body: form });
      const data = await r.json();
      clearInterval(timer);
      setProgresso(100);
      if (!r.ok) throw new Error(data.detail || JSON.stringify(data));
      setResultado(data);
      setEtapa("resultado");
    } catch (e: unknown) {
      clearInterval(timer);
      alert(e instanceof Error ? e.message : "Erro na importação");
    } finally {
      setCarregando(false);
    }
  }

  const camposLanc = ["data", "valor", "descricao", "tipo"];
  const camposRebanho = ["brinco", "raca", "peso", "nascimento", "categoria"];
  const campos = tipo === "rebanho" ? camposRebanho : camposLanc;

  return (
    <AuthGuard>
      <div style={{ minHeight: "100vh", background: "#f5f0e8", fontFamily: "'DM Sans',system-ui,sans-serif" }}>
        {/* Header */}
        <header style={{ background: "#1a2e1a", color: "#e8e0d0", padding: "16px 24px", display: "flex", alignItems: "center", gap: 12 }}>
          <a href="/" style={{ color: "#a0c890", fontSize: 13, textDecoration: "none" }}>← Painel</a>
          <div style={{ width: 1, height: 16, background: "#2d4a2d" }} />
          <div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>Importar dados</div>
            <div style={{ fontSize: 11, color: "#7a9a6a" }}>Excel, CSV, OFX — até 500 linhas</div>
          </div>
        </header>

        {/* Barra de etapas */}
        <div style={{ background: "#fff", borderBottom: "1px solid #e8e0d0", padding: "12px 24px", display: "flex", gap: 8 }}>
          {(["tipo", "upload", "mapeamento", "validacao", "resultado"] as Etapa[]).map((e, i) => {
            const labels = ["Tipo", "Upload", "Mapeamento", "Validação", "Resultado"];
            const idx = ["tipo","upload","mapeamento","validacao","resultado"].indexOf(etapa);
            const done = i < idx;
            const active = e === etapa;
            return (
              <div key={e} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <div style={{
                  width: 24, height: 24, borderRadius: "50%", fontSize: 11, fontWeight: 700,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  background: done ? "#4a7a3a" : active ? "#3a6a2a" : "#e8e0d0",
                  color: done || active ? "#fff" : "#8a9a8a",
                }}>{done ? "✓" : i + 1}</div>
                <span style={{ fontSize: 11, color: active ? "#1a2e1a" : "#8a9a8a", fontWeight: active ? 600 : 400 }}>{labels[i]}</span>
                {i < 4 && <div style={{ width: 20, height: 1, background: "#e8e0d0", margin: "0 2px" }} />}
              </div>
            );
          })}
        </div>

        <div style={{ maxWidth: 760, margin: "0 auto", padding: "24px 16px" }}>

          {/* ETAPA 1: Tipo */}
          {etapa === "tipo" && (
            <div style={{ background: "#fff", borderRadius: 14, padding: 28, border: "1px solid #e8e0d0" }}>
              <div style={{ fontWeight: 700, fontSize: 17, color: "#1a2e1a", marginBottom: 6 }}>O que deseja importar?</div>
              <div style={{ fontSize: 13, color: "#6a7a6a", marginBottom: 24 }}>Selecione o tipo de dado para configurar o mapeamento correto.</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 24 }}>
                {[
                  { v: "lancamentos", icon: "💰", titulo: "Lançamentos financeiros", desc: "Receitas e despesas de planilha Excel, CSV ou extrato OFX" },
                  { v: "rebanho", icon: "🐄", titulo: "Rebanho (animais)", desc: "Lista de animais com brinco, raça, peso e data de nascimento" },
                ].map(op => (
                  <button key={op.v} onClick={() => setTipo(op.v as TipoImport)} style={{
                    padding: 20, borderRadius: 12, border: "2px solid",
                    borderColor: tipo === op.v ? "#4a7a3a" : "#e8e0d0",
                    background: tipo === op.v ? "#f0f8ea" : "#faf8f4",
                    cursor: "pointer", textAlign: "left",
                  }}>
                    <div style={{ fontSize: 28, marginBottom: 8 }}>{op.icon}</div>
                    <div style={{ fontWeight: 600, fontSize: 14, color: "#1a2e1a", marginBottom: 4 }}>{op.titulo}</div>
                    <div style={{ fontSize: 12, color: "#6a7a6a" }}>{op.desc}</div>
                  </button>
                ))}
              </div>

              {tipo === "rebanho" && (
                <div style={{ marginBottom: 20 }}>
                  <label style={{ fontSize: 13, fontWeight: 600, color: "#3a4a3a", display: "block", marginBottom: 6 }}>Espécie</label>
                  <select value={especie} onChange={e => setEspecie(e.target.value as Especie)} style={{ ...SEL, maxWidth: 200 }}>
                    <option value="bovino">Bovino</option>
                    <option value="ovino">Ovino</option>
                    <option value="caprino">Caprino</option>
                    <option value="suino">Suíno</option>
                  </select>
                </div>
              )}

              <button onClick={() => tipo && setEtapa("upload")} disabled={!tipo} style={{
                padding: "12px 28px", borderRadius: 10, border: "none",
                background: tipo ? "#3a6a2a" : "#d0c8b8", color: "#fff",
                fontSize: 14, fontWeight: 700, cursor: tipo ? "pointer" : "not-allowed",
              }}>
                Próximo →
              </button>
            </div>
          )}

          {/* ETAPA 2: Upload */}
          {etapa === "upload" && (
            <div style={{ background: "#fff", borderRadius: 14, padding: 28, border: "1px solid #e8e0d0" }}>
              <div style={{ fontWeight: 700, fontSize: 17, color: "#1a2e1a", marginBottom: 20 }}>
                {tipo === "rebanho" ? "📋 Enviar planilha de rebanho" : "💰 Enviar planilha de lançamentos"}
              </div>

              {/* Drag & drop */}
              <div
                onDrop={onDrop}
                onDragOver={e => e.preventDefault()}
                onClick={() => document.getElementById("file-input")?.click()}
                style={{
                  border: "2px dashed", borderColor: arquivo ? "#4a7a3a" : "#c8d8b8",
                  borderRadius: 12, padding: "40px 20px", textAlign: "center",
                  background: arquivo ? "#f0f8ea" : "#faf8f4", cursor: "pointer",
                  marginBottom: 20,
                }}
              >
                <div style={{ fontSize: 40, marginBottom: 8 }}>{arquivo ? "✅" : "📂"}</div>
                <div style={{ fontWeight: 600, color: "#1a2e1a", marginBottom: 4 }}>
                  {arquivo ? arquivo.name : "Arraste o arquivo aqui ou clique para selecionar"}
                </div>
                <div style={{ fontSize: 12, color: "#8a9a8a" }}>
                  {arquivo ? `${(arquivo.size / 1024).toFixed(1)} KB` : "Excel (.xlsx, .xls), CSV, OFX — máx. 10MB"}
                </div>
                <input
                  id="file-input" type="file"
                  accept=".xlsx,.xls,.csv,.ofx,.ofc"
                  style={{ display: "none" }}
                  onChange={e => e.target.files?.[0] && setArquivo(e.target.files[0])}
                />
              </div>

              {/* Template de exemplo */}
              <div style={{ background: "#f0f8ea", border: "1px solid #c8e0b8", borderRadius: 10, padding: "12px 16px", marginBottom: 20, fontSize: 12, color: "#3a5a2a" }}>
                <strong>Colunas esperadas {tipo === "rebanho" ? "(rebanho)" : "(lançamentos)"}:</strong><br />
                {tipo === "rebanho"
                  ? "brinco | raça | peso_kg | data_nascimento | categoria"
                  : "data | valor | descrição | tipo (receita/despesa)"
                }
              </div>

              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={() => setEtapa("tipo")} style={{ padding: "10px 20px", borderRadius: 10, border: "1.5px solid #d8d0c0", background: "transparent", color: "#5a6a5a", fontSize: 13, cursor: "pointer" }}>← Voltar</button>
                <button onClick={fazerPreview} disabled={!arquivo || carregando} style={{
                  padding: "10px 24px", borderRadius: 10, border: "none",
                  background: arquivo && !carregando ? "#3a6a2a" : "#a0b890",
                  color: "#fff", fontSize: 13, fontWeight: 700,
                  cursor: arquivo && !carregando ? "pointer" : "not-allowed",
                }}>
                  {carregando ? "Analisando..." : "Analisar arquivo →"}
                </button>
              </div>
            </div>
          )}

          {/* ETAPA 3: Mapeamento */}
          {etapa === "mapeamento" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ background: "#fff", borderRadius: 14, padding: 24, border: "1px solid #e8e0d0" }}>
                <div style={{ fontWeight: 700, fontSize: 16, color: "#1a2e1a", marginBottom: 4 }}>Mapeamento de colunas</div>
                <div style={{ fontSize: 12, color: "#6a7a6a", marginBottom: 20 }}>
                  O sistema detectou {headers.length} colunas. Confirme ou ajuste o mapeamento.
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  {campos.map(campo => (
                    <div key={campo}>
                      <label style={{ fontSize: 12, fontWeight: 600, color: "#3a4a3a", display: "block", marginBottom: 4, textTransform: "capitalize" }}>
                        {campo} {["data","valor","brinco"].includes(campo) ? "*" : ""}
                      </label>
                      <select
                        value={mapaCol[campo] || ""}
                        onChange={e => setMapaCol(m => ({ ...m, [campo]: e.target.value }))}
                        style={SEL}
                      >
                        <option value="">— não mapear —</option>
                        {headers.map(h => <option key={h} value={h}>{h}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
              </div>

              {/* Preview */}
              {preview.length > 0 && (
                <div style={{ background: "#fff", borderRadius: 14, padding: 24, border: "1px solid #e8e0d0" }}>
                  <div style={{ fontWeight: 600, fontSize: 14, color: "#1a2e1a", marginBottom: 12 }}>
                    Pré-visualização (primeiras {preview.length} linhas)
                  </div>
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                      <thead>
                        <tr style={{ background: "#f5f0e8" }}>
                          {tipo !== "rebanho" && ["Data", "Valor", "Descrição", "Tipo"].map(h => (
                            <th key={h} style={{ padding: "8px 10px", textAlign: "left", color: "#5a6a5a", fontWeight: 600 }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {preview.map((row, i) => (
                          <tr key={i} style={{ borderBottom: "1px solid #f0e8d8" }}>
                            <td style={{ padding: "7px 10px" }}>{row.data}</td>
                            <td style={{ padding: "7px 10px", color: row.tipo === "receita" ? "#2a6a3a" : "#8a2a2a" }}>
                              R$ {Number(row.valor).toFixed(2)}
                            </td>
                            <td style={{ padding: "7px 10px", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.descricao}</td>
                            <td style={{ padding: "7px 10px" }}>
                              <span style={{
                                padding: "2px 8px", borderRadius: 20, fontSize: 11,
                                background: row.tipo === "receita" ? "#e8f5e9" : "#fce8e8",
                                color: row.tipo === "receita" ? "#2a6a3a" : "#8a2a2a",
                              }}>{row.tipo}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Resumo de erros/avisos */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                {[
                  { label: "Total de linhas", val: totalLinhas, color: "#1a2e1a" },
                  { label: "Com avisos", val: avisos.length, color: "#7a5a00" },
                  { label: "Com erros", val: erros.length, color: "#8a2a2a" },
                ].map(item => (
                  <div key={item.label} style={{ background: "#fff", borderRadius: 10, padding: "14px 16px", border: "1px solid #e8e0d0", textAlign: "center" }}>
                    <div style={{ fontSize: 22, fontWeight: 700, color: item.color }}>{item.val}</div>
                    <div style={{ fontSize: 11, color: "#6a7a6a" }}>{item.label}</div>
                  </div>
                ))}
              </div>

              {erros.length > 0 && (
                <div style={{ background: "#fce8e8", border: "1px solid #ef9a9a", borderRadius: 10, padding: 16 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, color: "#8a2a2a", marginBottom: 8 }}>⚠️ Erros encontrados</div>
                  {erros.slice(0, 5).map((e, i) => (
                    <div key={i} style={{ fontSize: 12, color: "#8a2a2a", marginBottom: 2 }}>
                      Linha {e.linha}: {e.msg}
                    </div>
                  ))}
                  {erros.length > 5 && <div style={{ fontSize: 12, color: "#8a2a2a" }}>... e mais {erros.length - 5} erros</div>}
                </div>
              )}

              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={() => setEtapa("upload")} style={{ padding: "10px 20px", borderRadius: 10, border: "1.5px solid #d8d0c0", background: "transparent", color: "#5a6a5a", fontSize: 13, cursor: "pointer" }}>← Voltar</button>
                <button onClick={importar} disabled={carregando || erros.length === totalLinhas} style={{
                  padding: "10px 28px", borderRadius: 10, border: "none",
                  background: carregando ? "#a0b890" : "#3a6a2a",
                  color: "#fff", fontSize: 13, fontWeight: 700,
                  cursor: carregando ? "not-allowed" : "pointer",
                  flex: 1,
                }}>
                  {carregando ? (
                    <span>Importando... {progresso}%</span>
                  ) : (
                    `Importar ${totalLinhas - erros.length} registro(s) →`
                  )}
                </button>
              </div>

              {carregando && (
                <div style={{ background: "#e8f0e8", borderRadius: 8, overflow: "hidden", height: 8 }}>
                  <div style={{ height: "100%", background: "#4a7a3a", width: `${progresso}%`, transition: "width 0.3s" }} />
                </div>
              )}
            </div>
          )}

          {/* ETAPA 5: Resultado */}
          {etapa === "resultado" && resultado && (
            <div style={{ background: "#fff", borderRadius: 14, padding: 32, border: "1px solid #e8e0d0", textAlign: "center" }}>
              <div style={{ fontSize: 52, marginBottom: 12 }}>🎉</div>
              <div style={{ fontWeight: 700, fontSize: 20, color: "#1a2e1a", marginBottom: 20 }}>Importação concluída!</div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 28 }}>
                {[
                  { label: "✅ Importados", val: resultado.importados, bg: "#e8f5e9", color: "#2a6a3a" },
                  { label: "⚠️ Com avisos", val: resultado.avisos || 0, bg: "#fff8e1", color: "#7a5a00" },
                  { label: "❌ Ignorados", val: resultado.ignorados || 0, bg: "#fce8e8", color: "#8a2a2a" },
                ].map(item => (
                  <div key={item.label} style={{ background: item.bg, borderRadius: 10, padding: 16 }}>
                    <div style={{ fontSize: 26, fontWeight: 700, color: item.color }}>{item.val}</div>
                    <div style={{ fontSize: 11, color: item.color }}>{item.label}</div>
                  </div>
                ))}
              </div>

              <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
                <button onClick={() => { setEtapa("tipo"); setArquivo(null); setResultado(null); setTipo(null); }}
                  style={{ padding: "10px 20px", borderRadius: 10, border: "1.5px solid #d8d0c0", background: "transparent", color: "#5a6a5a", fontSize: 13, cursor: "pointer" }}>
                  Importar mais
                </button>
                <a href="/" style={{ padding: "10px 24px", borderRadius: 10, background: "#3a6a2a", color: "#fff", fontSize: 13, fontWeight: 700, textDecoration: "none" }}>
                  Ir para o app →
                </a>
              </div>
            </div>
          )}

        </div>
      </div>
    </AuthGuard>
  );
}
