"use client";
import { useState } from "react";
import { apiFetch } from "@/lib/api";
import { getImovelId } from "@/hooks/useImovel";

const API = process.env.NEXT_PUBLIC_API_URL || "https://ruralcaixa-mvp-production.up.railway.app";

interface ImportarModalProps {
  modulo: string;
  onClose: () => void;
  onSuccess: (qtd: number) => void;
}

interface ResultadoImportacao {
  criados: number;
  erros: number;
  total: number;
  mensagem?: string;
}

export default function ImportarModal({ modulo, onClose, onSuccess }: ImportarModalProps) {
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const [resultado, setResultado] = useState<ResultadoImportacao | null>(null);

  async function handleImportar() {
    if (!arquivo) {
      setErro("Selecione um arquivo .csv ou .xlsx");
      return;
    }
    setErro("");
    setEnviando(true);
    try {
      const produtorStr = typeof window !== "undefined" ? localStorage.getItem("rc_produtor_id") : null;
      const produtorId = produtorStr ? Number(produtorStr) : 1;
      const imovelId = getImovelId();

      const form = new FormData();
      form.append("arquivo", arquivo);
      form.append("produtor_id", String(produtorId));
      form.append("imovel_id", String(imovelId));

      const resp = await apiFetch(`${API}/importacao/lancamentos`, {
        method: "POST",
        body: form,
      });

      const data = await resp.json();
      if (!resp.ok) {
        setErro(data.detail || data.mensagem || "Erro ao importar arquivo.");
        return;
      }
      setResultado(data);
      if (data.criados > 0) {
        onSuccess(data.criados);
      }
    } catch (e) {
      setErro("Erro de conexão. Tente novamente.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2000,
    }}>
      <div style={{ background: "#fff", borderRadius: 12, padding: 24, width: "100%", maxWidth: 420 }}>
        <h3 style={{ marginTop: 0, marginBottom: 12, fontSize: 17, fontWeight: 700 }}>
          Importar lançamentos ({modulo})
        </h3>

        {!resultado ? (
          <>
            <input
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={e => setArquivo(e.target.files?.[0] || null)}
              style={{ marginBottom: 12, width: "100%" }}
            />
            {erro && (
              <div style={{ color: "#b91c1c", fontSize: 13, marginBottom: 12 }}>{erro}</div>
            )}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={onClose} disabled={enviando} style={{ padding: "8px 16px", borderRadius: 6, border: "1px solid #d1d5db", background: "#fff", cursor: "pointer" }}>
                Cancelar
              </button>
              <button onClick={handleImportar} disabled={enviando || !arquivo} style={{ padding: "8px 16px", borderRadius: 6, border: "none", background: "#16a34a", color: "#fff", fontWeight: 600, cursor: "pointer", opacity: enviando ? 0.6 : 1 }}>
                {enviando ? "Importando..." : "Importar"}
              </button>
            </div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 14, marginBottom: 16 }}>
              <strong>{resultado.criados}</strong> lançamento(s) criado(s) de {resultado.total}.
              {resultado.erros > 0 && <> {resultado.erros} linha(s) com erro.</>}
              {resultado.mensagem && <div style={{ marginTop: 8, color: "#6b7280" }}>{resultado.mensagem}</div>}
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button onClick={onClose} style={{ padding: "8px 16px", borderRadius: 6, border: "none", background: "#16a34a", color: "#fff", fontWeight: 600, cursor: "pointer" }}>
                Fechar
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
