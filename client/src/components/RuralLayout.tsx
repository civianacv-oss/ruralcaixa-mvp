import { useEffect } from "react";
import { useLocation } from "wouter";
import { useRuralAuth } from "@/hooks/useRuralAuth";
import {
  LayoutDashboard,
  PawPrint,
  HeartPulse,
  Baby,
  DollarSign,
  ArrowLeftRight,
  LogOut,
  Leaf,
  ChevronRight,
  Menu,
  Home,
} from "lucide-react";
import { getImovelId } from "@/lib/api";
import { useState } from "react";

const NAV_ITEMS = [
  { icon: LayoutDashboard, label: "Painel", path: "/dashboard" },
  { icon: PawPrint, label: "Animais", path: "/animais" },
  { icon: HeartPulse, label: "Saúde", path: "/saude" },
  { icon: Baby, label: "Reprodução", path: "/reproducao" },
  { icon: DollarSign, label: "Financeiro", path: "/financeiro" },
  { icon: ArrowLeftRight, label: "Movimentações", path: "/movimentacoes" },
];

export default function RuralLayout({ children }: { children: React.ReactNode }) {
  const { authenticated, produtorNome, imovelNome, logout } = useRuralAuth();
  const [location, navigate] = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (!authenticated) {
      navigate("/login");
    }
  }, [authenticated, navigate]);

  if (!authenticated) return null;

  const initials = produtorNome
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "oklch(0.97 0.005 130)" }}>
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-30 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed lg:relative inset-y-0 left-0 z-40 flex flex-col
          transition-all duration-300 ease-out
          ${mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
          ${sidebarOpen ? "w-[240px]" : "w-[64px]"}
        `}
        style={{
          background: "oklch(0.20 0.05 145)",
          boxShadow: "2px 0 20px oklch(0.10 0.04 145 / 0.30)",
        }}
      >
        {/* Logo */}
        <div
          className="flex items-center gap-3 px-4 h-16 shrink-0 border-b"
          style={{ borderColor: "oklch(0.28 0.04 145)" }}
        >
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
            style={{
              background: "linear-gradient(135deg, oklch(0.50 0.14 145), oklch(0.60 0.16 155))",
              boxShadow: "0 4px 12px oklch(0.38 0.12 145 / 0.40)",
            }}
          >
            <Leaf className="w-5 h-5 text-white" strokeWidth={1.5} />
          </div>
          {sidebarOpen && (
            <span
              className="text-[17px] font-bold tracking-tight text-white truncate"
              style={{ fontFamily: "'Playfair Display', serif" }}
            >
              RuralCaixa
            </span>
          )}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="ml-auto hidden lg:flex items-center justify-center w-7 h-7 rounded-lg transition-colors hover:bg-white/10"
          >
            <ChevronRight
              className={`w-4 h-4 text-white/60 transition-transform duration-300 ${sidebarOpen ? "rotate-180" : ""}`}
            />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2 py-4 space-y-0.5 overflow-y-auto">
          {NAV_ITEMS.map((item) => {
            const isActive = location.startsWith(item.path);
            return (
              <button
                key={item.path}
                onClick={() => {
                  navigate(item.path);
                  setMobileOpen(false);
                }}
                className={`
                  w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium
                  transition-all duration-150 group
                  ${isActive
                    ? "bg-white/15 text-white"
                    : "text-white/60 hover:bg-white/8 hover:text-white/90"
                  }
                `}
                title={!sidebarOpen ? item.label : undefined}
              >
                <item.icon
                  className={`w-5 h-5 shrink-0 transition-colors ${isActive ? "text-emerald-400" : "text-white/50 group-hover:text-white/80"}`}
                />
                {sidebarOpen && <span className="truncate">{item.label}</span>}
                {isActive && sidebarOpen && (
                  <div className="ml-auto w-1.5 h-1.5 rounded-full bg-emerald-400" />
                )}
              </button>
            );
          })}
        </nav>

        {/* Active property banner */}
        {imovelNome && (
          <div
            className="mx-2 mb-1 rounded-xl px-3 py-2.5 cursor-pointer transition-all duration-150 hover:brightness-110"
            style={{ background: "oklch(0.28 0.06 145)" }}
            onClick={() => { navigate("/selecionar-imovel"); setMobileOpen(false); }}
            title={!sidebarOpen ? imovelNome : undefined}
          >
            {sidebarOpen ? (
              <div className="flex items-start gap-2">
                <Home className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color: "oklch(0.65 0.12 145)" }} />
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-[0.5px] mb-0.5" style={{ color: "oklch(0.55 0.08 145)" }}>
                    Propriedade ativa
                  </p>
                  <p className="text-[12px] font-semibold text-white/90 truncate leading-tight">
                    {imovelNome}
                  </p>
                  <p className="text-[10px] mt-0.5" style={{ color: "oklch(0.55 0.08 145)" }}>
                    Toque para trocar
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex justify-center">
                <Home className="w-4 h-4" style={{ color: "oklch(0.65 0.12 145)" }} />
              </div>
            )}
          </div>
        )}

        {/* User footer */}
          <div
          className="px-3 py-3 border-t shrink-0"
          style={{ borderColor: "oklch(0.28 0.04 145)" }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold text-white shrink-0"
              style={{ background: "oklch(0.38 0.12 145)" }}
            >
              {initials || "?"}
            </div>
            {sidebarOpen && (
              <>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate leading-none">
                    {produtorNome || "Produtor"}
                  </p>
                  <p className="text-xs text-white/40 mt-0.5 truncate">
                    {imovelNome || "Produtor Rural"}
                  </p>
                </div>
                <button
                  onClick={logout}
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-colors"
                  title="Sair"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </>
            )}
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile topbar */}
        <div
          className="lg:hidden flex items-center gap-3 px-4 h-14 shrink-0 border-b"
          style={{ background: "oklch(1 0 0)", borderColor: "oklch(0.90 0.015 130)" }}
        >
          <button
            onClick={() => setMobileOpen(true)}
            className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-muted transition-colors"
          >
            <Menu className="w-5 h-5" />
          </button>
          <span
            className="text-[17px] font-bold"
            style={{ fontFamily: "'Playfair Display', serif", color: "oklch(0.22 0.06 145)" }}
          >
            RuralCaixa
          </span>
        </div>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
