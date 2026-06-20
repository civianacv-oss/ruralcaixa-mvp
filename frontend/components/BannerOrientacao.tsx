"use client";
/**
 * BannerOrientacao — Banner informativo no topo de cada módulo
 * Explica o que o módulo faz e como usá-lo. Pode ser dispensado por módulo.
 */
import { useState, useEffect } from "react";

interface Passo {
  icone: string;
  texto: string;
}

interface Props {
  modulo: string;           // chave única para localStorage (ex: "rebanho", "lancamentos")
  titulo: string;
  descricao: string;
  passos?: Passo[];
  corFundo?: string;
  corBorda?: string;
  corTexto?: string;
  baseLegal?: string;
}

export default function BannerOrientacao({
  modulo,
  titulo,
  descricao,
  passos,
  corFundo = "#f0f8f0",
  corBorda = "#81c784",
  corTexto = "#1B5E20",
  baseLegal,
}: Props) {
  const STORAGE_KEY = `ruralcaixa_banner_${modulo}`;
  const [visivel, setVisivel] = useState(false);

  useEffect(() => {
    const dispensado = localStorage.getItem(STORAGE_KEY);
    if (!dispensado) setVisivel(true);
  }, [STORAGE_KEY]);

  function dispensar() {
    localStorage.setItem(STORAGE_KEY, "1");
    setVisivel(false);
  }

  if (!visivel) return null;

  return (
    <div
      style={{
        background: corFundo,
        border: `1.5px solid ${corBorda}`,
        borderRadius: 14,
        padding: "18px 22px",
        marginBottom: 20,
        position: "relative",
      }}
    >
      <button
        onClick={dispensar}
        title="Dispensar orientação"
        style={{
          position: "absolute",
          top: 12,
          right: 14,
          background: "none",
          border: "none",
          cursor: "pointer",
          fontSize: 16,
          color: "#8a9a8a",
          lineHeight: 1,
          padding: 4,
        }}
      >
        ✕
      </button>

      <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
        <div style={{ fontSize: 28, flexShrink: 0, marginTop: 2 }}>📋</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: corTexto, marginBottom: 4 }}>
            {titulo}
          </div>
          <div style={{ fontSize: 13.5, color: "#3a4a3a", lineHeight: 1.6, marginBottom: passos ? 12 : 0 }}>
            {descricao}
          </div>

          {passos && passos.length > 0 && (
            <div
              style={{
                display: "flex",
                gap: 10,
                flexWrap: "wrap",
              }}
            >
              {passos.map((p, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    background: "#fff",
                    border: `1px solid ${corBorda}`,
                    borderRadius: 8,
                    padding: "6px 12px",
                    fontSize: 12.5,
                    color: "#3a4a3a",
                  }}
                >
                  <span style={{ fontSize: 16 }}>{p.icone}</span>
                  <span>{p.texto}</span>
                </div>
              ))}
            </div>
          )}

          {baseLegal && (
            <div
              style={{
                marginTop: 10,
                fontSize: 11.5,
                color: "#6a7a6a",
                fontStyle: "italic",
              }}
            >
              📜 {baseLegal}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
