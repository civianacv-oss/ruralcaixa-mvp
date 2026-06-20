"use client";
/**
 * AjudaContextual — Ícone de interrogação com tooltip explicativo
 * Uso: <AjudaContextual texto="Explicação do campo ou módulo" />
 */
import { useState } from "react";

interface Props {
  texto: string;
  titulo?: string;
  posicao?: "topo" | "baixo" | "esquerda" | "direita";
}

export default function AjudaContextual({ texto, titulo, posicao = "topo" }: Props) {
  const [aberto, setAberto] = useState(false);

  const posStyles: Record<string, React.CSSProperties> = {
    topo:     { bottom: "calc(100% + 8px)", left: "50%", transform: "translateX(-50%)" },
    baixo:    { top: "calc(100% + 8px)",    left: "50%", transform: "translateX(-50%)" },
    esquerda: { right: "calc(100% + 8px)",  top: "50%",  transform: "translateY(-50%)" },
    direita:  { left:  "calc(100% + 8px)",  top: "50%",  transform: "translateY(-50%)" },
  };

  return (
    <span
      style={{ position: "relative", display: "inline-flex", alignItems: "center" }}
      onMouseEnter={() => setAberto(true)}
      onMouseLeave={() => setAberto(false)}
      onClick={() => setAberto((v) => !v)}
    >
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 18,
          height: 18,
          borderRadius: "50%",
          background: "#e8f5e9",
          border: "1.5px solid #81c784",
          color: "#2E7D32",
          fontSize: 11,
          fontWeight: 700,
          cursor: "help",
          userSelect: "none",
          flexShrink: 0,
        }}
      >
        ?
      </span>

      {aberto && (
        <div
          style={{
            position: "absolute",
            ...posStyles[posicao],
            zIndex: 9999,
            background: "#1a2e1a",
            color: "#e8f5e9",
            borderRadius: 10,
            padding: "10px 14px",
            fontSize: 12.5,
            lineHeight: 1.6,
            maxWidth: 280,
            minWidth: 180,
            boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
            pointerEvents: "none",
          }}
        >
          {titulo && (
            <div style={{ fontWeight: 700, marginBottom: 4, color: "#a5d6a7", fontSize: 13 }}>
              {titulo}
            </div>
          )}
          {texto}
        </div>
      )}
    </span>
  );
}
