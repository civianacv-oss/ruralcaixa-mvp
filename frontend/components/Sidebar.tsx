"use client";
// frontend/components/Sidebar.tsx
// Menu lateral reorganizado em 5 grupos expansíveis

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";

interface MenuItem {
  label: string;
  href?: string;
  icon: string;
  children?: MenuItem[];
  badge?: string;
}

const MENU: { group: string; icon: string; items: MenuItem[] }[] = [
  {
    group: "OPERAÇÃO",
    icon: "🚜",
    items: [
      { label: "Lançamentos", href: "/lancamentos", icon: "💰" },
      {
        label: "Rebanhos", icon: "🐄",
        children: [
          { label: "Bovinos",      href: "/bovino",      icon: "🐄" },
          { label: "Suínos",       href: "/suino",       icon: "🐖" },
          { label: "Ovinos",       href: "/ovino",       icon: "🐑" },
          { label: "Caprinos",     href: "/caprino",     icon: "🐐" },
          { label: "Piscicultura", href: "/piscicultura",icon: "🐟" },
        ],
      },
      {
        label: "Agricultura", icon: "🌾",
        children: [
          { label: "Safras",        href: "/agricultura", icon: "🌾" },
          { label: "Cultivo de Açaí", href: "/acai",    icon: "🌴" },
        ],
      },
      { label: "Saúde Animal",  href: "/rebanho",     icon: "🩺" },
      { label: "Compra e Venda",href: "/compravenda",  icon: "🏠" },
    ],
  },
  {
    group: "INSUMOS",
    icon: "📦",
    items: [
      { label: "Estoque de Insumos",   href: "/insumos",          icon: "📦" },
      { label: "Fornecedores",          href: "/fornecedores",     icon: "🏭" },
      { label: "Pedidos de Compra",     href: "/pedidos-compra",   icon: "🛒" },
      { label: "Ordens de Produção",    href: "/ordens-producao",  icon: "🏭" },
    ],
  },
  {
    group: "GESTÃO",
    icon: "📋",
    items: [
      { label: "Propriedades",   href: "/terceiros",   icon: "🏡" },
      {
        label: "Contratos Rurais", icon: "📑",
        children: [
          { label: "Contratos",         href: "/contratos",         icon: "📑" },
          { label: "Acerto de Contrato",href: "/contratos/acerto",  icon: "✍️" },
          { label: "Acertos (Histórico)",href: "/contratos/acertos",icon: "📋" },
        ],
      },
      { label: "Importação",     href: "/importacao",  icon: "📂" },
      { label: "Como usar",      href: "/como-usar",   icon: "📖" },
    ],
  },
  {
    group: "FISCAL",
    icon: "🧾",
    items: [
      { label: "Livro Caixa Rural",      href: "/livro-caixa",       icon: "📒" },
      { label: "Simulador Tributário",   href: "/simulador-regime",  icon: "🧮" },
      { label: "NF-e Produtor",          href: "/nfe",               icon: "📄" },
      { label: "EFD-Reinf / DARF",       href: "/efdreinf",          icon: "📊" },
      { label: "DCTFWeb",                href: "/dctfweb",           icon: "🌐" },
      { label: "DIRPF Atividade Rural",  href: "/dirpf",             icon: "🏛️" },
      { label: "Apuração PJ",            href: "/apuracao-pj",       icon: "🏢" },
      { label: "eSocial Rural",          href: "/esocial",           icon: "👷" },
      { label: "Contador",               href: "/contador",          icon: "🤝" },
    ],
  },
  {
    group: "RELATÓRIOS",
    icon: "📈",
    items: [
      { label: "Relatórios",    href: "/relatorio", icon: "📈" },
      { label: "Analytics",     href: "/analytics", icon: "📊" },
      { label: "DIRPF Rural",   href: "/dirpf",     icon: "🏛️" },
    ],
  },
];

const green = "#1a3a1a";
const greenLight = "#2a5a2a";
const greenBg = "#f0f8ea";

export default function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = usePathname();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    "OPERAÇÃO": true,
    "INSUMOS": false,
    "GESTÃO": false,
    "FISCAL": false,
    "RELATÓRIOS": false,
  });
  const [subExpanded, setSubExpanded] = useState<Record<string, boolean>>({});

  // Auto-expande o grupo do item ativo
  useEffect(() => {
    MENU.forEach(g => {
      g.items.forEach(item => {
        if (item.href === pathname) {
          setExpanded(prev => ({ ...prev, [g.group]: true }));
        }
        item.children?.forEach(child => {
          if (child.href === pathname) {
            setExpanded(prev => ({ ...prev, [g.group]: true }));
            setSubExpanded(prev => ({ ...prev, [item.label]: true }));
          }
        });
      });
    });
  }, [pathname]);

  function toggleGroup(group: string) {
    setExpanded(prev => ({ ...prev, [group]: !prev[group] }));
  }

  function toggleSub(label: string) {
    setSubExpanded(prev => ({ ...prev, [label]: !prev[label] }));
  }

  function isActive(href?: string) {
    if (!href) return false;
    return pathname === href || pathname.startsWith(href + "/");
  }

  const s = {
    sidebar: {
      position: "fixed" as const,
      top: 0, left: 0, bottom: 0,
      width: 260,
      background: green,
      color: "#e8f5e8",
      display: "flex",
      flexDirection: "column" as const,
      zIndex: 200,
      transform: open ? "translateX(0)" : "translateX(-260px)",
      transition: "transform 0.25s ease",
      overflowY: "auto" as const,
    },
    header: {
      padding: "20px 16px 16px",
      borderBottom: "1px solid rgba(255,255,255,0.1)",
    },
    logo: { fontSize: 18, fontWeight: 700, color: "#fff", marginBottom: 2 },
    sub: { fontSize: 11, color: "#a0d890", opacity: 0.8 },
    groupHeader: {
      display: "flex",
      alignItems: "center",
      gap: 8,
      padding: "10px 16px 4px",
      fontSize: 10,
      fontWeight: 700,
      color: "#7ab090",
      letterSpacing: "0.08em",
      cursor: "pointer",
      userSelect: "none" as const,
    },
    item: (active: boolean): React.CSSProperties => ({
      display: "flex",
      alignItems: "center",
      gap: 8,
      padding: "8px 16px 8px 20px",
      fontSize: 13,
      fontWeight: active ? 600 : 400,
      color: active ? "#fff" : "#c8e8c8",
      background: active ? "rgba(255,255,255,0.12)" : "transparent",
      borderLeft: active ? "3px solid #7ad870" : "3px solid transparent",
      cursor: "pointer",
      textDecoration: "none",
      transition: "all 0.15s",
    }),
    subItem: (active: boolean): React.CSSProperties => ({
      display: "flex",
      alignItems: "center",
      gap: 8,
      padding: "6px 16px 6px 36px",
      fontSize: 12,
      color: active ? "#fff" : "#a8d8a8",
      background: active ? "rgba(255,255,255,0.1)" : "transparent",
      borderLeft: active ? "3px solid #5ab85a" : "3px solid transparent",
      cursor: "pointer",
      textDecoration: "none",
      transition: "all 0.15s",
    }),
    divider: {
      margin: "4px 16px",
      borderTop: "1px solid rgba(255,255,255,0.08)",
    },
    painel: (active: boolean): React.CSSProperties => ({
      display: "flex",
      alignItems: "center",
      gap: 8,
      padding: "10px 16px",
      fontSize: 14,
      fontWeight: 600,
      color: active ? "#fff" : "#c8e8c8",
      background: active ? "rgba(255,255,255,0.15)" : "transparent",
      borderLeft: active ? "3px solid #7ad870" : "3px solid transparent",
      cursor: "pointer",
      textDecoration: "none",
      margin: "4px 0",
    }),
    footer: {
      padding: "12px 16px",
      borderTop: "1px solid rgba(255,255,255,0.1)",
      marginTop: "auto",
    },
    quickBtn: {
      display: "block",
      width: "100%",
      padding: "9px",
      borderRadius: 8,
      border: "none",
      background: "#3a7a3a",
      color: "#fff",
      fontSize: 13,
      fontWeight: 600,
      cursor: "pointer",
      textAlign: "center" as const,
    },
  };

  return (
    <>
      {/* Overlay mobile */}
      {open && (
        <div
          onClick={onClose}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 199 }}
        />
      )}

      <div style={s.sidebar}>
        {/* Header */}
        <div style={s.header}>
          <div style={s.logo}>🌾 RuralCaixa</div>
          <div style={s.sub}>Gestão Rural Inteligente</div>
        </div>

        {/* Painel Principal */}
        <a href="/" style={s.painel(pathname === "/")}>
          📊 Painel Principal
        </a>
        <div style={s.divider} />

        {/* Grupos */}
        {MENU.map(g => (
          <div key={g.group}>
            <div style={s.groupHeader} onClick={() => toggleGroup(g.group)}>
              <span>{g.icon}</span>
              <span style={{ flex: 1 }}>{g.group}</span>
              <span style={{ opacity: 0.6 }}>{expanded[g.group] ? "▾" : "▸"}</span>
            </div>

            {expanded[g.group] && g.items.map(item => (
              <div key={item.label}>
                {item.children ? (
                  <>
                    <div
                      style={s.item(item.children.some(c => isActive(c.href)))}
                      onClick={() => toggleSub(item.label)}
                    >
                      <span>{item.icon}</span>
                      <span style={{ flex: 1 }}>{item.label}</span>
                      <span style={{ opacity: 0.6, fontSize: 11 }}>
                        {subExpanded[item.label] ? "▾" : "▸"}
                      </span>
                    </div>
                    {subExpanded[item.label] && item.children.map(child => (
                      <a key={child.href} href={child.href} style={s.subItem(isActive(child.href))}>
                        <span>{child.icon}</span>
                        <span>{child.label}</span>
                      </a>
                    ))}
                  </>
                ) : (
                  <a href={item.href} style={s.item(isActive(item.href))}>
                    <span>{item.icon}</span>
                    <span>{item.label}</span>
                    {item.badge && (
                      <span style={{ background: "#e05a5a", color: "#fff", borderRadius: 20, fontSize: 10, padding: "1px 6px", fontWeight: 700 }}>
                        {item.badge}
                      </span>
                    )}
                  </a>
                )}
              </div>
            ))}

            <div style={s.divider} />
          </div>
        ))}

        {/* Footer */}
        <div style={s.footer}>
          <a href="/lancamentos" style={{ ...s.quickBtn, display: "block", textDecoration: "none", textAlign: "center" }}>
            + Novo Lançamento
          </a>
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <a href="/beta" style={{ flex: 1, padding: "6px", borderRadius: 6, background: "rgba(255,255,255,0.1)", color: "#a0d890", fontSize: 11, textAlign: "center", textDecoration: "none" }}>
              🌾 Beta
            </a>
            <a href="/como-usar" style={{ flex: 1, padding: "6px", borderRadius: 6, background: "rgba(255,255,255,0.1)", color: "#a0d890", fontSize: 11, textAlign: "center", textDecoration: "none" }}>
              📖 Ajuda
            </a>
          </div>
        </div>
      </div>
    </>
  );
}
