"use client";
// frontend/components/ImportarModal.tsx
// Modal de importação universal — rebanho (bovino/ovino/caprino/suíno) e culturas (açaí/agricultura)

import { useState, useCallback } from "react";

const API = process.env.NEXT_PUBLIC_API_URL || "https://ruralcaixa-mvp-production.up.railway.app";

export type ModuloImport =
  | "bovino" | "ovino" | "caprino" | "suino"
  | "acai" | "agricultura" | "lancamentos";

interface Erro { linha: number; campo?: string; msg: string; }

const MODULOS: Record<ModuloImport, { label: string; icon: string; endpoint: string; tipo: "rebanho" | "lancamentos"; especie?: string; }> = {
  bovino:      { label: "Bovino",      icon: "🐄", endpoint: "/importacao/rebanho",     tipo: "rebanho",     especie: "bovino"      },
  ovino:       { label: "Ovino",       icon: "🐑", endpoint: "/importacao/rebanho",     tipo: "rebanho",     especie: "ovino"       },
  caprino:     { label: "Caprino",     icon: "🐐", endpoint: "/importacao/rebanho",     tipo: "rebanho",     especie: "caprino"     },
  suino:       { label: "Suíno",       icon: "🐖", endpoint: "/importacao/rebanho",     tipo: "rebanho",     especie: "suino"       },
  acai:        { label: "Açaí",        icon: "🌴", endpoint: "/importacao/lancamentos", tipo: "lancamentos"                         },
  agricultura: { label: "Agricultura", icon: "🌾", endpoint: "/importacao/lancamentos", tipo: "lancamentos"                         },
  lancamentos: { label: "Lançamentos", icon: "💰", endpoint: "/importacao/lancamentos", tipo: "lancamentos"                         },
};

const COLUNAS_REBANHO = ["brinco", "nome", "sexo", "raca", "peso", "data_nascimento", "categoria"];
const COLUNAS_LANC    = ["data", "descricao", "valor", "tipo"];

function getToken() {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("rc_token") || sessionStorage.getItem("rc_token") || "";
}

interface Props {
  modulo: ModuloImport;
  onClose: () => void;
  onSuccess?: (qtd: number) => void;
}

export default function ImportarModal({ modulo: moduloInicial, onClose, onSuccess }: Props) {
  const [modulo, setModulo]       = useState<ModuloImport>(moduloInicial);
  const [etapa, setEtapa]         = useState<"upload" | "mapeamento" | "resultado">("upload");
  const [drag, setDrag]           = useState(false);
  const [arquivo, setArquivo]     = useState<File | null>(null);
  const [preview, setPreview]     = useState<Record<string, unknown>[]>([]);
  const [colunas, setColunas]     = useState<string[]>([]);
  const [mapeamento, setMapeamento] = useState<Record<string, string>>({});
  const [enviando, setEnviando]   = useState(false);
  const [resultado, setResultado] = useState<{ importados: number; erros: Erro[]; avisos: string[] } | null>(null);
  const [erro, setErro]           = useState("");

  const cfg = MODULOS[modulo];
  const camposEsperados = cfg.tipo === "rebanho" ? COLUNAS_REBANHO : COLUNAS_LANC;

  const handleFile = useCallback(async (file: File) => {
    setArquivo(file); setErro("");
    const fd = new FormData();
    fd.append("arquivo", file);
    fd.append("tipo", cfg.tipo);
    try {
      const r = await fetch(`${API}/importacao/preview`, {
        method: "POST", body: fd,
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await r.json();
      if (!r.ok) { setErro(data.detail || "Erro ao ler arquivo"); return; }
      setPreview(data.preview || []);
      setColunas(data.colunas || []);
      setMapeamento(data.mapeamento_sugerido || {});
      setEtapa("mapeamento");
    } catch { setErro("Erro ao enviar arquivo."); }
  }, [cfg.tipo]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDrag(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  async function importar() {
    if (!arquivo) return;
    setEnviando(true); setErro("");
    const fd = new FormData();
    fd.append("arquivo", arquivo);
    if (cfg.especie) fd.append("especie", cfg.especie);
    fd.append("mapeamento", JSON.stringify(mapeamento));
    if (cfg.tipo === "lancamentos") fd.append("categoria", modulo);
    try {
      const r = await fetch(`${API}${cfg.endpoint}`, {
        method: "POST", body: fd,
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await r.json();
      if (!r.ok) { setErro(data.detail || "Erro na importação"); setEnviando(false); return; }
      setResultado({ importados: data.importados || 0, erros: data.erros || [], avisos: data.avisos || [] });
      setEtapa("resultado");
      if (onSuccess) onSuccess(data.importados || 0);
    } catch { setErro("Erro ao importar."); }
    setEnviando(false);
  }

  const green = "#2a5a2a";

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 580, maxHeight: "90vh", overflow: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.25)" }}>

        {/* Header */}
        <div style={{ padding: "20px 24px 0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: "#1a2e1a" }}>
            {cfg.icon} Importar {cfg.label}
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "#8a9a8a" }}>×</button>
        </div>

        <div style={{ padding: "16px 24px 24px" }}>

          {/* Seletor de módulo */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: "#8a9a8a", display: "block", marginBottom: 6 }}>MÓDULO</label>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {(Object.keys(MODULOS) as ModuloImport[]).map(m => (
                <button key={m} onClick={() => { setModulo(m); setEtapa("upload"); setArquivo(null); setPreview([]); setErro(""); }}
                  style={{ padding: "5px 12px", borderRadius: 8, border: `1.5px solid ${modulo === m ? green : "#ddd"}`, background: modulo === m ? "#f0f8ea" : "#fff", color: modulo === m ? green : "#6a7a6a", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                  {MODULOS[m].icon} {MODULOS[m].label}
                </button>
              ))}
            </div>
          </div>

          {/* ETAPA: Upload */}
          {etapa === "upload" && (
            <>
              <div
                style={{ border: `2px dashed ${drag ? green : "#c8d8c0"}`, borderRadius: 12, padding: 32, textAlign: "center", background: drag ? "#f0f8ea" : "#faf8f4", cursor: "pointer" }}
                onDragOver={e => { e.preventDefault(); setDrag(true); }}
                onDragLeave={() => setDrag(false)}
                onDrop={handleDrop}
                onClick={() => document.getElementById("rc-imp-input")?.click()}
              >
                <div style={{ fontSize: 36, marginBottom: 8 }}>📄</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: green, marginBottom: 4 }}>Arraste a planilha aqui</div>
                <div style={{ fontSize: 12, color: "#8a9a8a" }}>Excel (.xlsx), CSV • Máx. 10 MB</div>
                <input id="rc-imp-input" type="file" accept=".xlsx,.xls,.csv" style={{ display: "none" }}
                  onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }} />
              </div>

              <div style={{ marginTop: 12, background: "#f0f8ea", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "#3a5a2a" }}>
                <strong>Colunas esperadas:</strong> {camposEsperados.join(", ")}
                {cfg.tipo === "rebanho" && " — brinco é obrigatório"}
              </div>

              {erro && <div style={{ marginTop: 10, color: "#8a2a2a", fontSize: 13 }}>❌ {erro}</div>}
            </>
          )}

          {/* ETAPA: Mapeamento */}
          {etapa === "mapeamento" && (
            <>
              <div style={{ fontSize: 13, color: "#5a6a5a", marginBottom: 14 }}>
                <strong>{arquivo?.name}</strong> — {preview.length} registros detectados
              </div>

              <div style={{ fontSize: 13, fontWeight: 600, color: "#3a4a3a", marginBottom: 8 }}>Mapeamento de colunas</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
                {camposEsperados.map(campo => (
                  <div key={campo}>
                    <label style={{ fontSize: 12, fontWeight: 600, color: "#5a6a5a", display: "block", marginBottom: 3 }}>{campo}</label>
                    <select
                      style={{ width: "100%", padding: "7px 10px", borderRadius: 8, border: "1.5px solid #d8d0c0", fontSize: 12, background: "#faf8f4", color: "#1a2e1a" }}
                      value={mapeamento[campo] || ""}
                      onChange={e => setMapeamento(prev => ({ ...prev, [campo]: e.target.value }))}
                    >
                      <option value="">— ignorar —</option>
                      {colunas.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                ))}
              </div>

              {preview.length > 0 && (
                <div style={{ marginBottom: 16, overflowX: "auto" }}>
                  <div style={{ fontSize: 11, color: "#8a9a8a", marginBottom: 4 }}>Preview (5 primeiros registros):</div>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                    <thead>
                      <tr>{Object.keys(preview[0]).slice(0, 6).map(k => <th key={k} style={{ background: "#f0f4f0", padding: "5px 8px", textAlign: "left", fontWeight: 600, color: "#3a4a3a", borderBottom: "1px solid #e0e8e0" }}>{k}</th>)}</tr>
                    </thead>
                    <tbody>
                      {preview.slice(0, 5).map((row, i) => (
                        <tr key={i}>{Object.values(row).slice(0, 6).map((v, j) => <td key={j} style={{ padding: "5px 8px", borderBottom: "1px solid #f0f0f0", color: "#3a4a3a" }}>{String(v ?? "—")}</td>)}</tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {erro && <div style={{ marginBottom: 10, color: "#8a2a2a", fontSize: 13 }}>❌ {erro}</div>}

              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                <button onClick={() => setEtapa("upload")} style={{ padding: "10px 20px", borderRadius: 10, border: "1.5px solid #d8d0c0", background: "transparent", color: "#5a6a5a", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>← Voltar</button>
                <button onClick={importar} disabled={enviando} style={{ padding: "10px 20px", borderRadius: 10, border: "none", background: enviando ? "#a0b890" : green, color: "#fff", fontSize: 13, fontWeight: 600, cursor: enviando ? "not-allowed" : "pointer" }}>
                  {enviando ? "Importando..." : `Importar ${preview.length} registros →`}
                </button>
              </div>
            </>
          )}

          {/* ETAPA: Resultado */}
          {etapa === "resultado" && resultado && (
            <>
              <div style={{ textAlign: "center", padding: "16px 0 20px" }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>{resultado.erros.length === 0 ? "✅" : "⚠️"}</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: "#1a2e1a", marginBottom: 4 }}>{resultado.importados} registros importados</div>
                {resultado.avisos.length > 0 && <div style={{ fontSize: 13, color: "#7a5a00" }}>{resultado.avisos.length} avisos</div>}
              </div>

              {resultado.erros.length > 0 && (
                <div style={{ marginBottom: 16, background: "#fce8e8", borderRadius: 8, padding: "12px 16px" }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#8a2a2a", marginBottom: 6 }}>{resultado.erros.length} erros:</div>
                  {resultado.erros.slice(0, 5).map((e, i) => <div key={i} style={{ fontSize: 12, color: "#8a2a2a", marginBottom: 3 }}>Linha {e.linha}: {e.msg}</div>)}
                </div>
              )}

              <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
                <button onClick={() => { setEtapa("upload"); setArquivo(null); setResultado(null); }} style={{ padding: "10px 20px", borderRadius: 10, border: "1.5px solid #d8d0c0", background: "transparent", color: "#5a6a5a", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Importar outro</button>
                <button onClick={onClose} style={{ padding: "10px 20px", borderRadius: 10, border: "none", background: green, color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Fechar</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
