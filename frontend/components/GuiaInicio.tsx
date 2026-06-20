"use client";
/**
 * GuiaInicio — Componente de orientação para novos usuários do RuralCaixa
 * Exibe um banner de boas-vindas com os primeiros passos e pode ser
 * dispensado (salvo em localStorage).
 */
import { useState, useEffect } from "react";

const STORAGE_KEY = "ruralcaixa_guia_dispensado";

const PASSOS = [
  {
    icone: "🏡",
    titulo: "1. Cadastre sua propriedade",
    descricao:
      "Comece registrando os dados do seu imóvel rural: nome, município, área total e tipo de exploração. Acesse o menu Propriedades.",
    href: "/cadastro",
    cor: "#2E7D32",
  },
  {
    icone: "🐄",
    titulo: "2. Registre seus animais",
    descricao:
      "Cadastre os animais por espécie (bovinos, ovinos, suínos, caprinos). Cada espécie tem seu módulo próprio no menu lateral.",
    href: "/rebanho",
    cor: "#558B2F",
  },
  {
    icone: "💰",
    titulo: "3. Lance receitas e despesas",
    descricao:
      "Registre toda entrada e saída de dinheiro da propriedade. Isso forma a base do seu Livro Caixa Rural (LCDPR).",
    href: "/lancamentos",
    cor: "#1565C0",
  },
  {
    icone: "🌾",
    titulo: "4. Controle safras e cultivos",
    descricao:
      "Se planta lavoura ou cultiva açaí, use os módulos Agricultura e Cultivo de Açaí para registrar produção e custos.",
    href: "/agricultura",
    cor: "#E65100",
  },
  {
    icone: "📊",
    titulo: "5. Acompanhe os relatórios",
    descricao:
      "Com os dados lançados, o sistema gera automaticamente DRE, fluxo de caixa e relatórios para o contador.",
    href: "/relatorio",
    cor: "#6A1B9A",
  },
];

const DICAS = [
  "💡 Toda receita de venda de animais criados na propriedade é considerada Atividade Rural pela Receita Federal.",
  "💡 A compra e venda de animais para revenda rápida (sem criar) é Atividade Comercial — use o módulo Compra e Venda.",
  "💡 O FUNRURAL é descontado pelo comprador na nota fiscal. Registre o valor líquido recebido nos lançamentos.",
  "💡 Guarde todas as notas fiscais de compra de insumos — elas são dedutíveis no cálculo do imposto rural.",
  "💡 Produtor com receita bruta acima de R$ 142.798,50/ano deve manter o Livro Caixa Digital (LCDPR).",
];

export default function GuiaInicio() {
  const [visivel, setVisivel] = useState(false);
  const [passoAtivo, setPassoAtivo] = useState(0);
  const [dicaIndex, setDicaIndex] = useState(0);

  useEffect(() => {
    const dispensado = localStorage.getItem(STORAGE_KEY);
    if (!dispensado) setVisivel(true);
    // Rotacionar dicas a cada 8 segundos
    const interval = setInterval(() => {
      setDicaIndex((i) => (i + 1) % DICAS.length);
    }, 8000);
    return () => clearInterval(interval);
  }, []);

  function dispensar() {
    localStorage.setItem(STORAGE_KEY, "1");
    setVisivel(false);
  }

  function reabrir() {
    localStorage.removeItem(STORAGE_KEY);
    setVisivel(true);
  }

  if (!visivel) {
    return (
      <button
        onClick={reabrir}
        title="Abrir guia de orientação"
        style={{
          position: "fixed",
          bottom: 24,
          right: 24,
          zIndex: 1000,
          background: "#2E7D32",
          color: "#fff",
          border: "none",
          borderRadius: "50%",
          width: 52,
          height: 52,
          fontSize: 22,
          cursor: "pointer",
          boxShadow: "0 4px 16px rgba(46,125,50,0.4)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "transform 0.15s ease",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.transform = "scale(1.1)")}
        onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
      >
        ❓
      </button>
    );
  }

  const passo = PASSOS[passoAtivo];

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 2000,
        background: "rgba(0,0,0,0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 20,
          maxWidth: 680,
          width: "100%",
          boxShadow: "0 24px 64px rgba(0,0,0,0.25)",
          overflow: "hidden",
        }}
      >
        {/* Cabeçalho */}
        <div
          style={{
            background: "linear-gradient(135deg, #1B5E20 0%, #2E7D32 60%, #43A047 100%)",
            padding: "24px 28px 20px",
            color: "#fff",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ fontSize: 28, marginBottom: 4 }}>🌿 Bem-vindo ao RuralCaixa</div>
              <div style={{ fontSize: 14, opacity: 0.85, lineHeight: 1.5 }}>
                Este guia vai te ajudar a começar a usar o sistema passo a passo.
                <br />
                Você pode fechar e reabrir a qualquer momento pelo botão <strong>❓</strong> no canto da tela.
              </div>
            </div>
            <button
              onClick={dispensar}
              style={{
                background: "rgba(255,255,255,0.15)",
                border: "none",
                color: "#fff",
                borderRadius: 8,
                padding: "6px 12px",
                cursor: "pointer",
                fontSize: 13,
                whiteSpace: "nowrap",
              }}
            >
              ✕ Fechar
            </button>
          </div>

          {/* Barra de progresso dos passos */}
          <div style={{ display: "flex", gap: 6, marginTop: 20 }}>
            {PASSOS.map((_, i) => (
              <button
                key={i}
                onClick={() => setPassoAtivo(i)}
                style={{
                  flex: 1,
                  height: 4,
                  borderRadius: 2,
                  border: "none",
                  cursor: "pointer",
                  background: i <= passoAtivo ? "#A5D6A7" : "rgba(255,255,255,0.3)",
                  transition: "background 0.3s",
                  padding: 0,
                }}
              />
            ))}
          </div>
        </div>

        {/* Conteúdo do passo */}
        <div style={{ padding: "28px 28px 20px" }}>
          <div
            style={{
              display: "flex",
              gap: 20,
              alignItems: "flex-start",
              marginBottom: 24,
            }}
          >
            <div
              style={{
                fontSize: 48,
                lineHeight: 1,
                flexShrink: 0,
                background: "#f0f8f0",
                borderRadius: 16,
                width: 72,
                height: 72,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {passo.icone}
            </div>
            <div>
              <div
                style={{
                  fontSize: 18,
                  fontWeight: 700,
                  color: passo.cor,
                  marginBottom: 8,
                }}
              >
                {passo.titulo}
              </div>
              <div style={{ fontSize: 14.5, color: "#3a4a3a", lineHeight: 1.65 }}>
                {passo.descricao}
              </div>
              <a
                href={passo.href}
                onClick={dispensar}
                style={{
                  display: "inline-block",
                  marginTop: 12,
                  background: passo.cor,
                  color: "#fff",
                  borderRadius: 8,
                  padding: "8px 18px",
                  fontSize: 13,
                  fontWeight: 600,
                  textDecoration: "none",
                  transition: "opacity 0.15s",
                }}
              >
                Ir para este módulo →
              </a>
            </div>
          </div>

          {/* Lista de todos os passos */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(5, 1fr)",
              gap: 8,
              marginBottom: 20,
            }}
          >
            {PASSOS.map((p, i) => (
              <button
                key={i}
                onClick={() => setPassoAtivo(i)}
                style={{
                  border: `2px solid ${i === passoAtivo ? p.cor : "#e0e8e0"}`,
                  borderRadius: 10,
                  padding: "10px 6px",
                  cursor: "pointer",
                  background: i === passoAtivo ? "#f0f8f0" : "#fafafa",
                  textAlign: "center",
                  transition: "all 0.2s",
                }}
              >
                <div style={{ fontSize: 22, marginBottom: 4 }}>{p.icone}</div>
                <div
                  style={{
                    fontSize: 11,
                    color: i === passoAtivo ? p.cor : "#5a6a5a",
                    fontWeight: i === passoAtivo ? 700 : 400,
                    lineHeight: 1.3,
                  }}
                >
                  {p.titulo.replace(/^\d+\.\s/, "")}
                </div>
              </button>
            ))}
          </div>

          {/* Dica fiscal rotativa */}
          <div
            style={{
              background: "#FFF8E1",
              border: "1px solid #FFE082",
              borderRadius: 10,
              padding: "12px 16px",
              fontSize: 13,
              color: "#5a4a10",
              lineHeight: 1.55,
              transition: "opacity 0.5s",
            }}
          >
            {DICAS[dicaIndex]}
          </div>
        </div>

        {/* Rodapé */}
        <div
          style={{
            padding: "14px 28px",
            borderTop: "1px solid #e8e8e8",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <button
            onClick={() => setPassoAtivo((i) => Math.max(0, i - 1))}
            disabled={passoAtivo === 0}
            style={{
              border: "1px solid #c8d8c8",
              background: "#fff",
              borderRadius: 8,
              padding: "8px 18px",
              cursor: passoAtivo === 0 ? "not-allowed" : "pointer",
              opacity: passoAtivo === 0 ? 0.4 : 1,
              fontSize: 13,
              color: "#3a4a3a",
            }}
          >
            ← Anterior
          </button>

          <button
            onClick={dispensar}
            style={{
              border: "none",
              background: "none",
              fontSize: 13,
              color: "#8a9a8a",
              cursor: "pointer",
              textDecoration: "underline",
            }}
          >
            Não mostrar novamente
          </button>

          {passoAtivo < PASSOS.length - 1 ? (
            <button
              onClick={() => setPassoAtivo((i) => i + 1)}
              style={{
                border: "none",
                background: "#2E7D32",
                color: "#fff",
                borderRadius: 8,
                padding: "8px 18px",
                cursor: "pointer",
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              Próximo →
            </button>
          ) : (
            <button
              onClick={dispensar}
              style={{
                border: "none",
                background: "#1565C0",
                color: "#fff",
                borderRadius: 8,
                padding: "8px 18px",
                cursor: "pointer",
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              ✓ Começar a usar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
