"use client";
/**
 * EstadoVazio — Estado vazio com orientação para o usuário
 * Substitui mensagens genéricas como "Nenhum registro encontrado"
 * por orientações acionáveis.
 */

interface Props {
  icone?: string;
  titulo: string;
  descricao: string;
  acaoLabel?: string;
  acaoOnClick?: () => void;
  acaoHref?: string;
  dica?: string;
}

export default function EstadoVazio({
  icone = "📭",
  titulo,
  descricao,
  acaoLabel,
  acaoOnClick,
  acaoHref,
  dica,
}: Props) {
  return (
    <div
      style={{
        textAlign: "center",
        padding: "40px 24px",
        color: "#5a6a5a",
      }}
    >
      <div style={{ fontSize: 52, marginBottom: 12, lineHeight: 1 }}>{icone}</div>
      <div
        style={{
          fontSize: 16,
          fontWeight: 600,
          color: "#2a3a2a",
          marginBottom: 8,
        }}
      >
        {titulo}
      </div>
      <div
        style={{
          fontSize: 13.5,
          color: "#5a6a5a",
          lineHeight: 1.65,
          maxWidth: 400,
          margin: "0 auto",
          marginBottom: acaoLabel ? 20 : 0,
        }}
      >
        {descricao}
      </div>

      {acaoLabel && (acaoOnClick || acaoHref) && (
        acaoHref ? (
          <a
            href={acaoHref}
            style={{
              display: "inline-block",
              background: "#2E7D32",
              color: "#fff",
              borderRadius: 8,
              padding: "10px 22px",
              fontSize: 13.5,
              fontWeight: 600,
              textDecoration: "none",
              marginBottom: dica ? 16 : 0,
            }}
          >
            {acaoLabel}
          </a>
        ) : (
          <button
            onClick={acaoOnClick}
            style={{
              background: "#2E7D32",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              padding: "10px 22px",
              fontSize: 13.5,
              fontWeight: 600,
              cursor: "pointer",
              marginBottom: dica ? 16 : 0,
            }}
          >
            {acaoLabel}
          </button>
        )
      )}

      {dica && (
        <div
          style={{
            display: "inline-block",
            background: "#FFF8E1",
            border: "1px solid #FFE082",
            borderRadius: 8,
            padding: "8px 16px",
            fontSize: 12.5,
            color: "#5a4a10",
            marginTop: acaoLabel ? 0 : 16,
            maxWidth: 420,
          }}
        >
          💡 {dica}
        </div>
      )}
    </div>
  );
}
