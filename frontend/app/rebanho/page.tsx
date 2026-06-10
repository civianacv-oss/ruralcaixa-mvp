"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

const API = "https://ruralcaixa-mvp-production.up.railway.app";
const IMOVEL_ID = 1;

type EspecieCard = {
  label: string;
  icon: string;
  href: string;
  color: string;
  bgColor: string;
  fetchUrl: string;
  countLabel: string;
  subLabel: string;
  disponivel: boolean;
};

const ESPECIES: EspecieCard[] = [
  {
    label: "Bovinos",
    icon: "🐄",
    href: "/bovino",
    color: "#3d6b2e",
    bgColor: "#f0f7ed",
    fetchUrl: `/bovino/animais/${IMOVEL_ID}?status=ativo`,
    countLabel: "animais ativos",
    subLabel: "Leite e Corte",
    disponivel: true,
  },
  {
    label: "Ovinos",
    icon: "🐑",
    href: "/ovino",
    color: "#7a6030",
    bgColor: "#fdf6ed",
    fetchUrl: `/ovino/animais?imovel_id=${IMOVEL_ID}&status=ativo`,
    countLabel: "animais ativos",
    subLabel: "Corte e Lã",
    disponivel: true,
  },
  {
    label: "Piscicultura",
    icon: "🐟",
    href: "/piscicultura",
    color: "#1a5e8a",
    bgColor: "#edf4fb",
    fetchUrl: `/piscicultura/ciclos?imovel_id=${IMOVEL_ID}&status=ativo`,
    countLabel: "ciclos ativos",
    subLabel: "Gestão de Viveiros",
    disponivel: true,
  },
  {
    label: "Caprinos",
    icon: "🐐",
    href: "/caprino",
    color: "#7a5030",
    bgColor: "#fdf0ed",
    fetchUrl: "",
    countLabel: "animais ativos",
    subLabel: "Em breve",
    disponivel: false,
  },
  {
    label: "Suínos",
    icon: "🐖",
    href: "/suino",
    color: "#8a3a6a",
    bgColor: "#fdedf7",
    fetchUrl: "",
    countLabel: "animais ativos",
    subLabel: "Em breve",
    disponivel: false,
  },
  {
    label: "Aves",
    icon: "🐔",
    href: "/aves",
    color: "#8a6a1a",
    bgColor: "#fdf8ed",
    fetchUrl: "",
    countLabel: "aves ativas",
    subLabel: "Em breve",
    disponivel: false,
  },
];

export default function RebanhoPage() {
  const router = useRouter();
  const [counts, setCounts] = useState<Record<string, number | null>>({});

  useEffect(() => {
    ESPECIES.filter(e => e.disponivel && e.fetchUrl).forEach(async (e) => {
      try {
        const r = await fetch(`${API}${e.fetchUrl}`);
        const data = await r.json();
        setCounts(prev => ({
          ...prev,
          [e.label]: Array.isArray(data) ? data.length : 0,
        }));
      } catch {
        setCounts(prev => ({ ...prev, [e.label]: 0 }));
      }
    });
  }, []);

  return (
    <div style={{ minHeight: "100vh", background: "#f5f0e8", padding: "32px 24px", fontFamily: "'DM Sans',system-ui,sans-serif" }}>
      <div style={{marginBottom:16}}>
        <div style={{display:"flex",gap:8}}><a href="/" style={{display:"inline-flex",alignItems:"center",gap:6,fontSize:13,color:"#5a8a3a",fontWeight:600,padding:"6px 14px",background:"#fff",borderRadius:8,border:"1px solid #d0e8c0",boxShadow:"0 1px 3px rgba(0,0,0,0.06)",textDecoration:"none"}}>🏠 Painel Principal</a><button onClick={() => window.history.back()} style={{display:"inline-flex",alignItems:"center",gap:6,fontSize:13,color:"#5a8a3a",fontWeight:600,padding:"6px 14px",background:"#fff",borderRadius:8,border:"1px solid #d0e8c0",boxShadow:"0 1px 3px rgba(0,0,0,0.06)",cursor:"pointer"}}>← Voltar</button></div>
      </div>
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, color: "#1a2e1a", margin: 0 }}>Rebanhos</h1>
        <p style={{ color: "#6a7a6a", marginTop: 6, fontSize: 15 }}>
          Selecione a espécie para acessar o módulo de gestão
        </p>
      </div>

      {/* Grid de espécies */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
        gap: 20,
        maxWidth: 1000,
      }}>
        {ESPECIES.map((e) => {
          const count = counts[e.label];
          return (
            <div
              key={e.label}
              onClick={() => e.disponivel && router.push(e.href)}
              style={{
                background: e.disponivel ? e.bgColor : "#f5f5f5",
                border: `2px solid ${e.disponivel ? e.color + "33" : "#e0e0e0"}`,
                borderRadius: 16,
                padding: "24px 28px",
                cursor: e.disponivel ? "pointer" : "default",
                transition: "all 0.2s ease",
                opacity: e.disponivel ? 1 : 0.6,
                position: "relative",
                overflow: "hidden",
              }}
              onMouseEnter={e.disponivel ? (ev) => {
                (ev.currentTarget as HTMLDivElement).style.transform = "translateY(-3px)";
                (ev.currentTarget as HTMLDivElement).style.boxShadow = `0 8px 24px ${e.color}22`;
                (ev.currentTarget as HTMLDivElement).style.borderColor = e.color + "66";
              } : undefined}
              onMouseLeave={e.disponivel ? (ev) => {
                (ev.currentTarget as HTMLDivElement).style.transform = "translateY(0)";
                (ev.currentTarget as HTMLDivElement).style.boxShadow = "none";
                (ev.currentTarget as HTMLDivElement).style.borderColor = e.color + "33";
              } : undefined}
            >
              {/* Badge em breve */}
              {!e.disponivel && (
                <div style={{
                  position: "absolute", top: 14, right: 14,
                  background: "#e0e0e0", color: "#888", fontSize: 10,
                  fontWeight: 700, padding: "2px 8px", borderRadius: 20,
                  letterSpacing: "0.5px", textTransform: "uppercase",
                }}>
                  Em breve
                </div>
              )}

              <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                {/* Ícone */}
                <div style={{
                  width: 56, height: 56, borderRadius: 14,
                  background: e.disponivel ? e.color + "18" : "#e8e8e8",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 28, flexShrink: 0,
                }}>
                  {e.icon}
                </div>

                {/* Info */}
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 18, color: e.disponivel ? e.color : "#aaa" }}>
                    {e.label}
                  </div>
                  <div style={{ fontSize: 12, color: "#8a9a8a", marginTop: 2 }}>{e.subLabel}</div>
                </div>
              </div>

              {/* Contador */}
              {e.disponivel && (
                <div style={{ marginTop: 20, paddingTop: 16, borderTop: `1px solid ${e.color}18` }}>
                  {count == null ? (
                    <div style={{ height: 24, background: e.color + "15", borderRadius: 6, width: 80, animation: "pulse 1.5s infinite" }} />
                  ) : (
                    <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                      <span style={{ fontSize: 28, fontWeight: 800, color: e.color }}>{count}</span>
                      <span style={{ fontSize: 13, color: "#6a7a6a" }}>{e.countLabel}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Seta */}
              {e.disponivel && (
                <div style={{
                  position: "absolute", bottom: 20, right: 20,
                  color: e.color + "80", fontSize: 20, fontWeight: 700,
                }}>
                  →
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
